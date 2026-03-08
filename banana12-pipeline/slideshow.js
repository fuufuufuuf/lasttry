const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fetch = require('node-fetch');

const FFMPEG_PATH = path.join(
  os.homedir(),
  'AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.0.1-full_build/bin/ffmpeg.exe'
);
ffmpeg.setFfmpegPath(FFMPEG_PATH);

const ROWS = 4;
const COLS = 3;
const FRAME_DURATION = 1.5; // seconds per frame
const CROSSFADE = 0.5; // seconds of crossfade between frames

/**
 * Download an image from URL to a local temp file.
 */
async function downloadImage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Accept: 'image/*,*/*',
    },
  });
  if (!res.ok) throw new Error(`Failed to download image: HTTP ${res.status}`);
  const buffer = await res.buffer();
  const tmpFile = path.join(os.tmpdir(), `slideshow_src_${Date.now()}.jpg`);
  fs.writeFileSync(tmpFile, buffer);
  return tmpFile;
}

/**
 * Split a grid image (4 rows x 3 cols) into 12 individual frame images.
 * Returns the temp directory containing frame_01.jpg ... frame_12.jpg
 */
async function splitGrid(imagePath) {
  const metadata = await sharp(imagePath).metadata();
  const { width, height } = metadata;

  const cellW = Math.floor(width / COLS);
  const cellH = Math.floor(height / ROWS);

  const tmpDir = path.join(os.tmpdir(), `slideshow_frames_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const framePaths = [];
  let frameIndex = 1;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const framePath = path.join(tmpDir, `frame_${String(frameIndex).padStart(2, '0')}.jpg`);
      await sharp(imagePath)
        .extract({ left: col * cellW, top: row * cellH, width: cellW, height: cellH })
        .resize(1080, 1920, { fit: 'contain', background: { r: 0, g: 0, b: 0 } })
        .jpeg({ quality: 95 })
        .toFile(framePath);
      framePaths.push(framePath);
      frameIndex++;
    }
  }

  console.log(`[Slideshow] Split grid into ${framePaths.length} frames in ${tmpDir}`);
  return { tmpDir, framePaths };
}

/**
 * Create a slideshow video from frame images using ffmpeg with crossfade transitions.
 * Returns the path to the output mp4 file.
 */
function createSlideshow(framePaths, outputPath) {
  return new Promise((resolve, reject) => {
    // Build a complex ffmpeg filter for crossfade transitions between all 12 frames
    const n = framePaths.length;
    const inputs = [];
    const filterParts = [];

    // Each frame is looped for FRAME_DURATION + CROSSFADE seconds (except last)
    for (let i = 0; i < n; i++) {
      inputs.push({
        file: framePaths[i],
        duration: i < n - 1 ? FRAME_DURATION + CROSSFADE : FRAME_DURATION,
      });
    }

    // Build the ffmpeg command manually with complex filter
    let cmd = ffmpeg();

    for (const input of inputs) {
      cmd = cmd.input(input.file).inputOptions(['-loop', '1', '-t', String(input.duration)]);
    }

    // Build xfade filter chain
    // [0][1]xfade=transition=fade:duration=0.5:offset=1.5[v01]
    // [v01][2]xfade=transition=fade:duration=0.5:offset=2.5[v02]
    // ...
    let prevLabel = '0:v';
    let currentOffset = FRAME_DURATION;

    for (let i = 1; i < n; i++) {
      const outLabel = i < n - 1 ? `v${String(i).padStart(2, '0')}` : 'vout';
      filterParts.push(
        `[${prevLabel}][${i}:v]xfade=transition=fade:duration=${CROSSFADE}:offset=${currentOffset}[${outLabel}]`
      );
      prevLabel = outLabel;
      currentOffset += FRAME_DURATION;
    }

    const filterComplex = filterParts.join(';');

    cmd
      .complexFilter(filterComplex, 'vout')
      .outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30'])
      .output(outputPath)
      .on('start', (cmdline) => {
        console.log(`[Slideshow] ffmpeg started`);
      })
      .on('end', () => {
        console.log(`[Slideshow] Video created: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(new Error(`ffmpeg error: ${err.message}`));
      })
      .run();
  });
}

/**
 * Full pipeline: download grid image -> split -> create slideshow video.
 * Returns { videoPath, tmpDir } for cleanup.
 */
async function generateSlideshow(gridImageUrl) {
  // Download the grid image
  console.log(`[Slideshow] Downloading grid image...`);
  const gridImagePath = await downloadImage(gridImageUrl);

  // Split into 12 frames
  const { tmpDir, framePaths } = await splitGrid(gridImagePath);

  // Create slideshow video
  const videoPath = path.join(os.tmpdir(), `slideshow_${Date.now()}.mp4`);
  await createSlideshow(framePaths, videoPath);

  // Clean up source image
  try { fs.unlinkSync(gridImagePath); } catch (_) {}

  return { videoPath, tmpDir };
}

/**
 * Clean up temp files after upload.
 */
function cleanup(videoPath, tmpDir) {
  try { fs.unlinkSync(videoPath); } catch (_) {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
}

module.exports = { generateSlideshow, cleanup };
