const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const axios = require('axios');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);

/**
 * Detect whether a local video file already has any audio stream.
 * Uses ffprobe; fails open (returns false) if ffprobe is unavailable, so the
 * caller still attempts a mux when the assumption is the video is silent.
 */
async function hasAudioStream(videoPath) {
  try {
    const { stdout } = await execFile(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=codec_type',
        '-of', 'csv=p=0',
        videoPath,
      ],
      { timeout: 15000 }
    );
    return String(stdout).trim().length > 0;
  } catch (err) {
    console.warn(`[Audio] hasAudioStream probe failed (${err.message}); assuming silent`);
    return false;
  }
}

async function downloadFile(url, filepath) {
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
 * Mux a remote audio file onto a silent local video.
 * Returns the path of the new muxed video. Deletes the original silent video
 * and the downloaded audio temp file on success. Throws on any failure
 * (ffmpeg missing, network failure, mux error) so the record fails visibly.
 */
async function muxAudio(videoPath, audioUrl) {
  const dir = path.dirname(videoPath);
  const stamp = Date.now();
  const audioPath = path.join(dir, `audio_${stamp}.mp3`);
  const outPath = path.join(dir, `video_with_audio_${stamp}.mp4`);

  console.log(`[Audio] Downloading: ${audioUrl}`);
  await downloadFile(audioUrl, audioPath);

  console.log('[Audio] Muxing audio onto video with ffmpeg...');
  try {
    await execFile(
      'ffmpeg',
      [
        '-y',
        '-i', videoPath,
        '-i', audioPath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-shortest',
        outPath,
      ],
      { timeout: 60000 }
    );
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).slice(-500) : '';
    throw new Error(`ffmpeg mux failed: ${err.message}. stderr tail: ${stderr}`);
  } finally {
    try { await fsp.unlink(audioPath); } catch (_) {}
  }

  try { await fsp.unlink(videoPath); } catch (_) {}
  console.log(`[Audio] Muxed video at: ${outPath}`);
  return outPath;
}

module.exports = { muxAudio, hasAudioStream };
