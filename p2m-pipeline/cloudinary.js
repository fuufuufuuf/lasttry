const cloudinary = require('cloudinary').v2;

function init(config) {
  cloudinary.config({
    cloud_name: config.cloud_name,
    api_key: config.api_key,
    api_secret: config.api_secret,
  });
}

async function uploadBase64(base64Str, mimeType = 'image/png') {
  const dataUri = `data:${mimeType};base64,${base64Str}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'tiktok/pics',
    resource_type: 'image',
  });
  console.log(`[Cloudinary] Uploaded: ${result.secure_url}`);
  return result.secure_url;
}

module.exports = { init, uploadBase64 };
