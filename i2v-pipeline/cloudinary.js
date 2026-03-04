const cloudinary = require('cloudinary').v2;

function init(config) {
  cloudinary.config({
    cloud_name: config.cloud_name,
    api_key: config.api_key,
    api_secret: config.api_secret,
  });
}

async function uploadVideo(videoPath, productId) {
  // Create folder path: /Home/tiktok/videos/{product_id}/
  const folder = `Home/tiktok/videos/${productId}`;

  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const filename = `video_${timestamp}`;

  try {
    console.log(`[Cloudinary] Starting video upload to: ${folder}/`);

    const result = await cloudinary.uploader.upload(videoPath, {
      folder: folder,
      public_id: filename,  // Set specific filename
      resource_type: 'video',
      eager_async: true,
      eager: [
        { width: 1080, height: 1920, crop: 'fit', format: 'mp4' }, // TikTok vertical
        { width: 1080, height: 1080, crop: 'fit', format: 'mp4' }  // Instagram square
      ],
      notification_url: null,  // Don't wait for transformations
    });

    console.log(`[Cloudinary] Video uploaded successfully to: ${folder}/${filename}`);
    return result.secure_url;

  } catch (err) {
    console.error('[Cloudinary] Upload error:', err.message);
    throw new Error(`Cloudinary video upload failed: ${err.message}`);
  }
}

// Re-export the same uploadBase64 for compatibility if needed
async function uploadBase64(base64Data, mimeType) {
  const base64String = base64Data.includes('base64,')
    ? base64Data
    : `data:${mimeType};base64,${base64Data}`;

  const timestamp = Date.now();
  const folder = `tiktok/videos/${timestamp}`;

  const result = await cloudinary.uploader.upload(base64String, {
    folder: folder,
    resource_type: 'auto',
  });

  return result.secure_url;
}

module.exports = { init, uploadVideo, uploadBase64 };