const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

async function generateVideo(storyboard, firstImageUrl, config) {
  // Create temp directory for this video generation
  const tempDir = path.join(__dirname, 'temp', Date.now().toString());
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // For now, we'll generate just the first shot
    // In a production system, you might generate all shots and concatenate them
    const firstShot = storyboard.shots[0];

    console.log(`[Veo] Generating ${firstShot.duration}s video...`);
    console.log(`[Veo] Prompt: ${firstShot.prompt.substring(0, 100)}...`);

    // Prepare the request payload for Veo3.1 API
    const veoPayload = {
      prompt: firstShot.prompt,
      first_frame_url: firstImageUrl,  // Use URL directly instead of downloading
      duration: firstShot.duration || config?.duration || 10,
      output_format: config?.output_format || 'mp4',
      resolution: config?.resolution || '1080x1920',  // TikTok vertical format
      model: config?.model || 'google/veo-3-1-fast'
    };

    // Make HTTP API request to Veo3.1
    console.log('[Veo] Calling video generation API...');

    const maxRetries = 2;
    let lastError;
    let videoUrl;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Submit video generation request
        const submitResponse = await axios.post(config.api_url || 'https://api.veo3.ai/v1/generate', veoPayload, {
          headers: {
            'Authorization': `Bearer ${config.api_key}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout for initial request
        });

        const taskId = submitResponse.data.task_id || submitResponse.data.id;
        console.log(`[Veo] Task submitted: ${taskId}`);

        // Poll for completion
        videoUrl = await pollForCompletion(config, taskId);

        if (!videoUrl) {
          throw new Error('Video generation completed but no URL returned');
        }

        console.log(`[Veo] Video generated successfully`);
        break;

      } catch (err) {
        lastError = err;
        console.error(`[Veo] Attempt ${attempt}/${maxRetries} failed:`, err.message);

        if (attempt < maxRetries) {
          const waitTime = 30000; // 30 seconds between retries
          console.log(`[Veo] Waiting ${waitTime/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    if (!videoUrl) {
      throw new Error(`Veo video generation failed after ${maxRetries} attempts: ${lastError.message}`);
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
      console.error('[Veo] Cleanup error:', cleanupErr.message);
    }
    throw err;
  }
}

async function pollForCompletion(config, taskId) {
  const pollInterval = 10000; // 10 seconds
  const maxPolls = 30; // 5 minutes max (30 * 10s)

  for (let i = 0; i < maxPolls; i++) {
    try {
      const statusResponse = await axios.get(
        `${config.api_url || 'https://api.veo3.ai/v1'}/status/${taskId}`,
        {
          headers: {
            'Authorization': `Bearer ${config.api_key}`
          }
        }
      );

      const status = statusResponse.data.status;
      console.log(`[Veo] Status: ${status}`);

      if (status === 'completed') {
        return statusResponse.data.video_url || statusResponse.data.output_url;
      } else if (status === 'failed' || status === 'error') {
        throw new Error(`Video generation failed: ${statusResponse.data.error || 'Unknown error'}`);
      }

      // Still processing, wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (err) {
      console.error(`[Veo] Polling error: ${err.message}`);
      // Continue polling on non-fatal errors
    }
  }

  throw new Error('Video generation timed out after 5 minutes');
}

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

module.exports = { generateVideo };