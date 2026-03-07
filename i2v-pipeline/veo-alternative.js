const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

/**
 * Alternative Veo API implementation using a different third-party service
 * This service uses a single endpoint for task creation and polling
 */
async function generateVideoAlternative(storyboard, firstImageUrl, config) {
  // Create temp directory for this video generation
  const tempDir = path.join(__dirname, 'temp', Date.now().toString());
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Build full prompt from entire storyboard
    // const fullPrompt = storyboard.shots.map(shot => shot.prompt).join('\n');
    const fullPrompt = storyboard.fullStoryboard;


    console.log(`[VeoAlt] Generating video with full storyboard prompt...`);
    console.log(`[VeoAlt] Prompt: ${fullPrompt}`);

    // Prepare the request payload for alternative API
    const requestPayload = {
      images: [firstImageUrl],  // Array of image URLs
      model: config?.alt_model || 'veo3.1-fast-components',
      orientation: 'portrait',  // For TikTok/Douyin vertical format
      prompt: fullPrompt,
      size: '720x1280',  // Standard vertical video size
      duration: 8,  // Default 8s
      aspect_ratio: '9:16'  // Vertical aspect ratio
    };

    // Optional: enable upsampling for landscape videos
    if (config?.orientation === 'landscape') {
      requestPayload.orientation = 'landscape';
      requestPayload.size = '1280x720';
      requestPayload.aspect_ratio = '16:9';
      requestPayload.enable_upsample = true;
    }

    console.log('[VeoAlt] Submitting video generation request...');

    const maxRetries = 3;
    let lastError;
    let videoUrl;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Submit video generation request
        const response = await axios.post(
          `${config.alt_api_url}/v1/video/create`,
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
        console.log(`[VeoAlt] Task created: ${taskData.id} (Status: ${taskData.status})`);

        // Poll for completion using the same endpoint
        videoUrl = await pollAlternativeAPI(config, taskData.id);

        if (!videoUrl) {
          throw new Error('Video generation completed but no URL returned');
        }

        console.log(`[VeoAlt] Video generated successfully`);
        break;

      } catch (err) {
        lastError = err;
        console.error(`[VeoAlt] Attempt ${attempt}/${maxRetries} failed:`, err.message);

        if (attempt < maxRetries) {
          const waitTime = attempt * 15000; // Progressive backoff: 15s, 30s, 45s
          console.log(`[VeoAlt] Waiting ${waitTime/1000}s before retry...`);
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
      console.error('[VeoAlt] Cleanup error:', cleanupErr.message);
    }
    throw err;
  }
}

/**
 * Poll the alternative API for task completion
 * This API returns the full task info including video URL when completed
 */
async function pollAlternativeAPI(config, taskId) {
  const pollInterval = 5000; // 5 seconds (more frequent as this API updates quickly)
  const maxPolls = 120; // 5 minutes max (60 * 5s)

  for (let i = 0; i < maxPolls; i++) {
    try {
      // Query task status
      const statusResponse = await axios.get(
        `${config.alt_api_url}/v1/video/query`,
        {
          params: { id: taskId },
          headers: { 'Authorization': `Bearer ${config.alt_api_key}` }
        }
      );

      const taskData = statusResponse.data;
      console.log(`[VeoAlt] Task ${taskId} - Status: ${taskData.status}, Progress: ${taskData.progress}%`);

      // Check status
      if (taskData.status === 'completed') {
        // Extract video URL from response
        // The exact field may vary based on actual API response
        return taskData.video_url || taskData.output_url || taskData.result?.url;
      } else if (taskData.status === 'failed' || taskData.status === 'cancelled') {
        const errorMsg = taskData.error || taskData.message || 'Unknown error';
        throw new Error(`Video generation failed: ${errorMsg}`);
      }

      // Still processing (queued or processing), wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (err) {
      // Check if it's a 404 (task not found) or other critical error
      if (err.response?.status === 404) {
        throw new Error(`Task ${taskId} not found`);
      }

      console.error(`[VeoAlt] Polling error: ${err.message}`);

      // For other errors, continue polling unless we're near the timeout
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