const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const MODEL_CONFIGS = require('./model-configs.json');

/**
 * Alternative video API implementation supporting multiple models.
 * Model-specific parameters (size, duration, etc.) are read from model-configs.json.
 */
async function generateVideoAlternative(storyboard, firstImageUrl, config) {
  // Create temp directory for this video generation
  const tempDir = path.join(__dirname, 'temp', Date.now().toString());
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const modelKey = config?.alt_model || 'veo';
    const modelConfig = MODEL_CONFIGS[modelKey];
    if (!modelConfig) {
      throw new Error(`Unknown model "${modelKey}". Available models: ${Object.keys(MODEL_CONFIGS).join(', ')}`);
    }

    const fullPrompt = storyboard.fullStoryboard;
    const isLandscape = config?.orientation === 'landscape';

    console.log(`[VideoAlt] Generating video with model: ${modelConfig.model}`);
    console.log(`[VideoAlt] Prompt: ${fullPrompt}`);

    // Build request payload from model config
    const requestPayload = {
      images: [firstImageUrl],
      model: modelConfig.model,
      prompt: fullPrompt,
      size: modelConfig.size,
      aspect_ratio: modelConfig.aspect_ratio,
      duration: modelConfig.duration,
    };

    // Add orientation field only if the model supports it
    if (modelConfig.orientation_field) {
      requestPayload.orientation = isLandscape ? 'landscape' : 'portrait';
    }

    // Add enable_upsample only if model supports it and orientation is landscape
    if (modelConfig.enable_upsample && isLandscape) {
      requestPayload.enable_upsample = true;
    }

    console.log('[VideoAlt] Submitting video generation request...');

    const maxRetries = 3;
    let lastError;
    let videoUrl;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Submit video generation request
        const response = await axios.post(
          `${config.alt_api_url}/video/create`,
          requestPayload,
          {
            headers: {
              'Authorization': `Bearer ${config.alt_api_key}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
          }
        );

        const taskData = response.data;
        console.log(`[VideoAlt] Task created: ${taskData.id} (Status: ${taskData.status})`);

        // Poll for completion
        videoUrl = await pollAlternativeAPI(config, taskData.id);

        if (!videoUrl) {
          throw new Error('Video generation completed but no URL returned');
        }

        console.log(`[VideoAlt] Video generated successfully`);
        break;

      } catch (err) {
        lastError = err;
        console.error(`[VideoAlt] Attempt ${attempt}/${maxRetries} failed:`, err.message);

        // If the task explicitly failed, don't retry — bail out immediately
        if (err.message && err.message.startsWith('Video generation failed:')) {
          console.log(`[VideoAlt] Task failed, skipping retries.`);
          break;
        }

        if (attempt < maxRetries) {
          const waitTime = attempt * 15000; // Progressive backoff: 15s, 30s, 45s
          console.log(`[VideoAlt] Waiting ${waitTime/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    if (!videoUrl) {
      throw new Error(`Alternative video generation failed after ${maxRetries} attempts: ${lastError.message}`);
    }

    // Download the generated video
    const finalVideoPath = path.join(tempDir, 'output.mp4');
    await downloadVideo(videoUrl, finalVideoPath);

    return finalVideoPath;

  } catch (err) {
    // Cleanup on error
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (cleanupErr) {
      console.error('[VideoAlt] Cleanup error:', cleanupErr.message);
    }
    throw err;
  }
}

/**
 * Poll the alternative API for task completion
 */
async function pollAlternativeAPI(config, taskId) {
  const pollInterval = 5000; // 5 seconds
  const maxPolls = 120; // 5 minutes max

  for (let i = 0; i < maxPolls; i++) {
    try {
      const statusResponse = await axios.get(
        `${config.alt_api_url}/video/query`,
        {
          params: { id: taskId },
          headers: { 'Authorization': `Bearer ${config.alt_api_key}` }
        }
      );

      const taskData = statusResponse.data;
      console.log(`[VideoAlt] Task ${taskId} - Status: ${taskData.status}, Progress: ${taskData.progress}%`);

      if (taskData.status === 'completed') {
        return taskData.video_url || taskData.output_url || taskData.result?.url;
      } else if (taskData.status === 'failed' || taskData.status === 'cancelled') {
        const errorMsg = taskData.error || taskData.message || 'Unknown error';
        throw new Error(`Video generation failed: ${errorMsg}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (err) {
      if (err.response?.status === 404) {
        throw new Error(`Task ${taskId} not found`);
      }

      console.error(`[VideoAlt] Polling error: ${err.message}`);

      if (i > maxPolls - 5) {
        throw err;
      }
    }
  }

  throw new Error('Video generation timed out after 5 minutes');
}

/**
 * Download video from URL to local file
 */
async function downloadVideo(url, filepath) {
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream'
  });

  const writeStream = require('fs').createWriteStream(filepath);
  response.data.pipe(writeStream);

  return new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

module.exports = { generateVideoAlternative };
