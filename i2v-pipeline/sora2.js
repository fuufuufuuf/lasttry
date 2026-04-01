const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

/**
 * Build optimized prompt for Sora2 15s video
 * Remaps storyboard shots to sora2 durations: 3s + 7s + 5s = 15s
 */
function buildSora2Prompt(storyboard, durations) {
  const shots = storyboard.shots || [];
  if (shots.length === 0) return storyboard.fullStoryboard;

  const labels = ['Hook / Establishing', 'Detail Showcase', 'Closing Pose'];
  const lines = [];

  lines.push('15-second fashion product video. 3 continuous shots, single take feel.\n');

  shots.forEach((shot, i) => {
    const dur = durations[i] || shot.duration;
    const label = labels[i] || `Shot ${i + 1}`;
    lines.push(`[Shot ${shot.shotNumber} — ${label}] ${dur}s`);
    lines.push(`Prompt: ${shot.prompt}`);
    lines.push('');
  });

  lines.push(`Total: ${durations.reduce((a, b) => a + b, 0)}s`);

  return lines.join('\n');
}

/**
 * Sora2 video generation
 * API: POST /v1/video/create, GET /v1/video/query?id=xxx
 *
 * @param {object} storyboard - Storyboard object with shots and fullStoryboard
 * @param {string} firstImageUrl - First frame image URL
 * @param {object} config - config.sora2 section from config.json
 * @returns {string} Local path to downloaded video
 */
async function generateVideoSora2(storyboard, firstImageUrl, config) {
  const tempDir = path.join(__dirname, 'temp', `sora2_${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Rebuild prompt with sora2 durations: 3s + 7s + 5s = 15s
    const sora2Durations = [3, 7, 5];
    const prompt = buildSora2Prompt(storyboard, sora2Durations);

    console.log(`[Sora2] Prompt (15s = 3s+7s+5s):\n${prompt}\n`);

    const requestPayload = {
      images: [firstImageUrl],
      model: config.alt_model || 'sora2-portrait-15s',
      orientation: 'portrait',
      prompt,
      size: 'large',
      duration: 15,
      watermark: false,
    };

    console.log('[Sora2] Submitting video generation request...');

    const maxRetries = 3;
    let lastError;
    let videoUrl;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${config.alt_api_url}/video/create`,
          requestPayload,
          {
            headers: {
              'Authorization': `Bearer ${config.alt_api_key}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }
        );

        const taskData = response.data;
        console.log(`[Sora2] Task created: ${taskData.id} (Status: ${taskData.status})`);

        videoUrl = await pollSora2(config, taskData.id);

        if (!videoUrl) {
          throw new Error('Video generation completed but no URL returned');
        }

        console.log('[Sora2] Video generated successfully');
        break;

      } catch (err) {
        lastError = err;
        console.error(`[Sora2] Attempt ${attempt}/${maxRetries} failed:`, err.message);

        if (err.message?.startsWith('Video generation failed:')) {
          console.log('[Sora2] Task failed, skipping retries.');
          break;
        }

        if (attempt < maxRetries) {
          const waitTime = attempt * 15000;
          console.log(`[Sora2] Waiting ${waitTime / 1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    if (!videoUrl) {
      throw new Error(`Sora2 video generation failed after ${maxRetries} attempts: ${lastError.message}`);
    }

    const finalVideoPath = path.join(tempDir, 'output.mp4');
    await downloadVideo(videoUrl, finalVideoPath);
    return finalVideoPath;

  } catch (err) {
    try { await fs.rmdir(tempDir, { recursive: true }); } catch (_) {}
    throw err;
  }
}

async function pollSora2(config, taskId) {
  const pollInterval = 5000;
  const maxPolls = 200; // 15s video needs more time, ~16 min max

  for (let i = 0; i < maxPolls; i++) {
    try {
      const res = await axios.get(
        `${config.alt_api_url}/video/query`,
        {
          params: { id: taskId },
          headers: { 'Authorization': `Bearer ${config.alt_api_key}` },
        }
      );

      const task = res.data;
      console.log(`[Sora2] Task ${taskId} - Status: ${task.status}, Progress: ${task.progress || 0}%`);

      if (task.status === 'completed') {
        return task.video_url || task.output_url || task.result?.url;
      }
      if (task.status === 'failed' || task.status === 'cancelled') {
        throw new Error(`Video generation failed: ${task.error || task.message || 'Unknown error'}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (err) {
      if (err.response?.status === 404) {
        throw new Error(`Task ${taskId} not found`);
      }
      if (err.message?.startsWith('Video generation failed:')) throw err;

      console.error(`[Sora2] Polling error: ${err.message}`);
      if (i > maxPolls - 5) throw err;
    }
  }

  throw new Error('Sora2 video generation timed out');
}

async function downloadVideo(url, filepath) {
  const response = await axios({ method: 'GET', url, responseType: 'stream' });
  const writeStream = require('fs').createWriteStream(filepath);
  response.data.pipe(writeStream);
  return new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

module.exports = { generateVideoSora2 };
