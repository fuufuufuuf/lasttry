const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const MODEL_CONFIGS = require('./model-configs.json');

/**
 * Grok video generation via NewAPI-compatible endpoint.
 * Endpoints: POST /v1/videos  |  GET /v1/videos/{id}  |  GET /v1/videos/{id}/content
 * Model parameters (model, size, duration, quality) are read from model-configs.json.
 */
async function generateVideoGrok(storyboard, firstImageUrl, config) {
  const tempDir = path.join(__dirname, 'temp', Date.now().toString());
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const modelConfig = MODEL_CONFIGS['grok'];
    if (!modelConfig) throw new Error('Missing "grok" entry in model-configs.json');

    const fullPrompt = storyboard.fullStoryboard;
    console.log(`[Grok] Generating video with model: ${modelConfig.model}`);
    console.log(`[Grok] Prompt: ${fullPrompt}`);

    // Download image and convert to base64 data URI
    console.log(`[Grok] Downloading reference image...`);
    const imgResponse = await axios.get(firstImageUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const mimeType = imgResponse.headers['content-type'] || 'image/jpeg';
    const b64 = Buffer.from(imgResponse.data).toString('base64');

    const requestPayload = {
      model: modelConfig.model,
      prompt: fullPrompt,
      image_reference: `data:${mimeType};base64,${b64}`,
      size: modelConfig.size,
      seconds: String(modelConfig.duration),
      quality: modelConfig.quality || 'standard',
    };

    console.log('[Grok] Submitting video generation request...');

    const maxRetries = 3;
    let lastError;
    let taskId;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${config.alt_api_url}/v1/videos`,
          requestPayload,
          {
            headers: {
              'Authorization': `Bearer ${config.alt_api_key}`,
              'Content-Type': 'application/json'
            },
            timeout: 120000
          }
        );

        const taskData = response.data;
        console.log(`[Grok] /v1/videos response:`, JSON.stringify(taskData, null, 2));
        taskId = taskData.id || taskData.task_id;
        if (!taskId) throw new Error(`No task id in response: ${JSON.stringify(taskData)}`);
        console.log(`[Grok] Task created: ${taskId}`);
        break;

      } catch (err) {
        lastError = err;
        console.error(`[Grok] Attempt ${attempt}/${maxRetries} failed:`, err.message);
        if (attempt < maxRetries) {
          const waitTime = attempt * 15000;
          console.log(`[Grok] Waiting ${waitTime / 1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    if (!taskId) {
      throw new Error(`Failed to submit Grok video task after ${maxRetries} attempts: ${lastError.message}`);
    }

    // Poll for completion
    const videoUrl = await pollGrokAPI(config, taskId);
    if (!videoUrl) throw new Error('Video generation completed but no URL returned');
    console.log(`[Grok] Video generated successfully`);
    console.log(`[Grok] Download URL: ${videoUrl}`);

    // Download the generated video
    const finalVideoPath = path.join(tempDir, 'output.mp4');
    await downloadVideo(videoUrl, finalVideoPath, config.alt_api_key);

    return finalVideoPath;

  } catch (err) {
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (cleanupErr) {
      console.error('[Grok] Cleanup error:', cleanupErr.message);
    }
    throw err;
  }
}

/**
 * Poll GET /v1/videos/{taskId} until completion
 */
async function pollGrokAPI(config, taskId) {
  const pollInterval = 15000; // 15 seconds
  const maxPolls = 40;        // 10 minutes max

  for (let i = 0; i < maxPolls; i++) {
    try {
      const statusResponse = await axios.get(
        `${config.alt_api_url}/v1/videos/${taskId}`,
        {
          headers: { 'Authorization': `Bearer ${config.alt_api_key}` },
          timeout: 30000
        }
      );

      const taskData = statusResponse.data;
      const status = String(taskData.status || taskData?.data?.status || '').toLowerCase();
      console.log(`[Grok] Task ${taskId} - Status: ${status}`);

      if (['completed', 'succeeded', 'success'].includes(status)) {
        // Always use /content endpoint — video_url in response is internal Docker IP
        // Strip port from base URL for download (content served on port 80)
        const downloadBase = config.alt_api_url.replace(/:\d+$/, '');
        return `${downloadBase}/v1/videos/${taskId}/content`;
      }

      if (['failed', 'cancelled', 'canceled', 'error'].includes(status)) {
        const errorMsg = taskData.error || taskData.message || 'Unknown error';
        throw new Error(`Video generation failed: ${errorMsg}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (err) {
      if (err.response?.status === 404) throw new Error(`Task ${taskId} not found`);
      if (err.message && err.message.startsWith('Video generation failed:')) throw err;
      console.error(`[Grok] Polling error: ${err.message}`);
      if (i > maxPolls - 5) throw err;
    }
  }

  throw new Error('Grok video generation timed out after 10 minutes');
}

/**
 * Download video from URL to local file
 */
async function downloadVideo(url, filepath, apiKey) {
  const headers = {};
  if (apiKey && url.includes('/v1/videos/')) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    headers,
    timeout: 600000
  });

  const writeStream = require('fs').createWriteStream(filepath);
  response.data.pipe(writeStream);

  return new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

module.exports = { generateVideoGrok };
