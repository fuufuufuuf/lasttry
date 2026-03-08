const cloudinary = require('cloudinary').v2;

function init(config) {
  cloudinary.config({
    cloud_name: config.cloud_name,
    api_key: config.api_key,
    api_secret: config.api_secret,
  });
}

async function uploadGrid12(base64Str, mimeType = 'image/png', timestamp, productId) {
  const dataUri = `data:${mimeType};base64,${base64Str}`;
  const folder = `tiktok/pics/grid12/${timestamp}_${productId}`;

  // Explicitly create the folder via Admin API before uploading
  await cloudinary.api.create_folder(folder);
  console.log(`[Cloudinary] Folder created: ${folder}`);

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: 'image',
  });
  console.log(`[Cloudinary] Uploaded: ${result.secure_url}`);

  const { cloud_name } = cloudinary.config();
  const folderUrl = `https://res.cloudinary.com/${cloud_name}/image/upload/${folder}`;
  return { secureUrl: result.secure_url, folder, folderUrl };
}

async function uploadVideo(videoFilePath, timestamp, productId) {
  const folder = `tiktok/videos/slideshow12/${timestamp}_${productId}`;

  await cloudinary.api.create_folder(folder);
  console.log(`[Cloudinary] Video folder created: ${folder}`);

  const result = await cloudinary.uploader.upload(videoFilePath, {
    folder,
    resource_type: 'video',
  });
  console.log(`[Cloudinary] Video uploaded: ${result.secure_url}`);

  return { secureUrl: result.secure_url, folder };
}

module.exports = { init, uploadGrid12, uploadVideo };
