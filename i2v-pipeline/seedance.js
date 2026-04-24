const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const axios = require('axios');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const MODEL_CONFIGS = require('./model-configs.json');

/**
 * Probe a video URL's duration with ffprobe. Returns rounded integer seconds,
 * or null if ffprobe is unavailable / the URL is unreadable.
 */
async function probeVideoDurationSeconds(url) {
  try {
    const { stdout } = await execFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', url],
      { timeout: 30000 }
    );
    const secs = parseFloat(String(stdout).trim());
    if (!Number.isFinite(secs) || secs <= 0) return null;
    return Math.round(secs);
  } catch (err) {
    console.warn(`[Seedance] ffprobe failed for ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Seedance 2.0 image-to-video via BytePlus ModelArk.
 * Endpoints:
 *   POST {alt_api_url}/contents/generations/tasks
 *   GET  {alt_api_url}/contents/generations/tasks/{id}
 * Uses Ark's new parameter method: resolution / ratio / duration are top-level
 * body fields (not --tags in the prompt). camera_fixed is not supported by
 * Seedance 2.0 and is intentionally omitted.
 */
async function generateVideoSeedance(storyboard, firstImageUrl, config) {
  const tempDir = path.join(__dirname, 'temp', Date.now().toString());
  await fsp.mkdir(tempDir, { recursive: true });

  try {
    const modelConfig = MODEL_CONFIGS['seedance'];
    if (!modelConfig) throw new Error('Missing "seedance" entry in model-configs.json');

    const fullPrompt = storyboard.fullStoryboard;

    console.log(`[Seedance] Generating video with model: ${modelConfig.model}`);
    console.log(`[Seedance] Params: resolution=${modelConfig.resolution} ratio=${modelConfig.ratio} duration=${modelConfig.duration}`);
    console.log(`[Seedance] Prompt: ${fullPrompt}`);

    const requestPayload = {
      model: modelConfig.model,
      content: [
        { type: 'text', text: fullPrompt },
        { type: 'image_url', image_url: { url: firstImageUrl }, role: 'reference_image' },
      ],
      resolution: modelConfig.resolution,
      ratio: modelConfig.ratio,
      duration: Number(modelConfig.duration),
      generate_audio: false,
    };

    console.log('[Seedance] Submitting video generation request...');

    const maxRetries = 3;
    let lastError;
    let taskId;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${config.alt_api_url}/contents/generations/tasks`,
          requestPayload,
          {
            headers: {
              'Authorization': `Bearer ${config.alt_api_key}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }
        );

        taskId = response.data.id;
        if (!taskId) throw new Error(`No task id in response: ${JSON.stringify(response.data)}`);
        console.log(`[Seedance] Task created: ${taskId} (status: ${response.data.status || 'queued'})`);
        break;

      } catch (err) {
        lastError = err;
        const detail = err.response?.data ? ` — ${JSON.stringify(err.response.data)}` : '';
        console.error(`[Seedance] Attempt ${attempt}/${maxRetries} failed: ${err.message}${detail}`);

        if (attempt < maxRetries) {
          const waitTime = attempt * 15000;
          console.log(`[Seedance] Waiting ${waitTime / 1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    if (!taskId) {
      throw new Error(`Failed to submit Seedance video task after ${maxRetries} attempts: ${lastError.message}`);
    }

    const videoUrl = await pollSeedance(config, taskId);
    if (!videoUrl) throw new Error('Video generation completed but no URL returned');

    console.log(`[Seedance] Video generated successfully`);
    console.log(`[Seedance] Download URL: ${videoUrl}`);

    const finalVideoPath = path.join(tempDir, 'output.mp4');
    await downloadVideo(videoUrl, finalVideoPath);

    return finalVideoPath;

  } catch (err) {
    try {
      await fsp.rmdir(tempDir, { recursive: true });
    } catch (cleanupErr) {
      console.error('[Seedance] Cleanup error:', cleanupErr.message);
    }
    throw err;
  }
}

/**
 * Poll GET /contents/generations/tasks/{id} until succeeded/failed.
 */
async function pollSeedance(config, taskId) {
  const pollInterval = 5000;
  const maxPolls = 120; // 10 minutes

  for (let i = 0; i < maxPolls; i++) {
    try {
      const statusResponse = await axios.get(
        `${config.alt_api_url}/contents/generations/tasks/${taskId}`,
        { headers: { 'Authorization': `Bearer ${config.alt_api_key}` }, timeout: 30000 }
      );

      const taskData = statusResponse.data;
      const status = String(taskData.status || '').toLowerCase();
      console.log(`[Seedance] Task ${taskId} - Status: ${status}`);

      if (status === 'succeeded') {
        return taskData.content?.video_url;
      }

      if (['failed', 'cancelled', 'canceled'].includes(status)) {
        const rawError = taskData.error || taskData.message || 'Unknown error';
        const errorMsg = typeof rawError === 'object' ? JSON.stringify(rawError) : rawError;
        throw new Error(`Video generation failed: ${errorMsg}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (err) {
      if (err.response?.status === 404) throw new Error(`Task ${taskId} not found`);
      if (err.message && err.message.startsWith('Video generation failed:')) throw err;
      console.error(`[Seedance] Polling error: ${err.message}`);
      if (i > maxPolls - 5) throw err;
    }
  }

  throw new Error('Seedance video generation timed out after 10 minutes');
}

async function downloadVideo(url, filepath) {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    timeout: 600000,
  });

  const writeStream = fs.createWriteStream(filepath);
  response.data.pipe(writeStream);

  return new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

/**
 * Seedance 2.0 multimodal image+video → video. Motion inherited from refVideoUrl ([Video 1]),
 * outfit locked to firstImageUrl ([Image 1]).
 */
async function generateVideoSeedanceV2V(storyboard, firstImageUrl, refVideoUrl, config) {
  const tempDir = path.join(__dirname, 'temp', Date.now().toString());
  await fsp.mkdir(tempDir, { recursive: true });

  try {
    const modelConfig = MODEL_CONFIGS['seedance_v2v'];
    if (!modelConfig) throw new Error('Missing "seedance_v2v" entry in model-configs.json');

    // Prefer the storyboard's probed duration; fall back to the config default.
    // Seedance 2.0 duration valid range is [4, 15]; clamp to satisfy strict validation.
    const rawDuration = Number(storyboard?.totalDuration || modelConfig.duration);
    const duration = Math.min(15, Math.max(4, Math.round(rawDuration)));

    const fullPrompt = storyboard.fullStoryboard;

    console.log(`[Seedance-V2V] Generating video with model: ${modelConfig.model}`);
    console.log(`[Seedance-V2V] Params: resolution=${modelConfig.resolution} ratio=${modelConfig.ratio} duration=${duration}`);
    console.log(`[Seedance-V2V] Prompt: ${fullPrompt}`);

    const requestPayload = {
      model: modelConfig.model,
      content: [
        { type: 'text', text: fullPrompt },
        { type: 'image_url', image_url: { url: firstImageUrl }, role: 'reference_image' },
        { type: 'video_url', video_url: { url: refVideoUrl }, role: 'reference_video' },
      ],
      resolution: modelConfig.resolution,
      ratio: modelConfig.ratio,
      duration,
      generate_audio: false,
    };

    console.log('[Seedance-V2V] Submitting video generation request...');

    const maxRetries = 3;
    let lastError;
    let taskId;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${config.alt_api_url}/contents/generations/tasks`,
          requestPayload,
          {
            headers: {
              'Authorization': `Bearer ${config.alt_api_key}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }
        );

        taskId = response.data.id;
        if (!taskId) throw new Error(`No task id in response: ${JSON.stringify(response.data)}`);
        console.log(`[Seedance-V2V] Task created: ${taskId} (status: ${response.data.status || 'queued'})`);
        break;

      } catch (err) {
        lastError = err;
        const detail = err.response?.data ? ` — ${JSON.stringify(err.response.data)}` : '';
        console.error(`[Seedance-V2V] Attempt ${attempt}/${maxRetries} failed: ${err.message}${detail}`);

        if (attempt < maxRetries) {
          const waitTime = attempt * 15000;
          console.log(`[Seedance-V2V] Waiting ${waitTime / 1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    if (!taskId) {
      throw new Error(`Failed to submit Seedance v2v task after ${maxRetries} attempts: ${lastError.message}`);
    }

    const videoUrl = await pollSeedance(config, taskId);
    if (!videoUrl) throw new Error('Video generation completed but no URL returned');

    console.log(`[Seedance-V2V] Video generated successfully`);
    console.log(`[Seedance-V2V] Download URL: ${videoUrl}`);

    const finalVideoPath = path.join(tempDir, 'output.mp4');
    await downloadVideo(videoUrl, finalVideoPath);

    return finalVideoPath;

  } catch (err) {
    try {
      await fsp.rmdir(tempDir, { recursive: true });
    } catch (cleanupErr) {
      console.error('[Seedance-V2V] Cleanup error:', cleanupErr.message);
    }
    throw err;
  }
}

module.exports = { generateVideoSeedance, generateVideoSeedanceV2V, probeVideoDurationSeconds };
