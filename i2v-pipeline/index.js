const fs = require('fs');
const path = require('path');
const { getAccessToken, queryVideoRecords, updateRecord } = require('./feishu');
const { generateVideoStoryboard } = require('./ttsv');
const { generateRefVideoStoryboard } = require('./ttsv-ref');
const { generateVideo } = require('./veo');
const { generateApiVideo } = require('./api_video_generation');
const { generateVideoGrok } = require('./grok');
const { generateVideoSeedance, generateVideoSeedanceV2V, probeVideoDurationSeconds } = require('./seedance');
const { muxAudio, hasAudioStream } = require('./audio');
const cloudinaryUtil = require('./cloudinary');

const CONFIG_PATH = path.join(__dirname, '../config.json');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function parseImageUrls(rawValue) {
  if (!rawValue) return [];
  // rawValue may be a JSON array string or newline/comma separated URLs
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch (_) {}
  return rawValue
    .split(/[\n,]+/)
    .map((u) => u.trim())
    .filter((u) => u.startsWith('http'));
}

function extractTextValue(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) {
    return field.map((item) => (typeof item === 'object' ? item.text || '' : item)).join('\n');
  }
  return String(field);
}

// Extract the audio URL from a Feishu `music info` field. The field stores a
// JSON blob (typically `{ url, title, audio }`); we only need `audio`.
// Feishu may serialize this as a rich-text array (text + url segments) — we
// concatenate without newlines so the JSON survives.
function extractAudioUrlFromMusicInfo(field) {
  if (!field) return null;
  let raw;
  if (typeof field === 'string') {
    raw = field;
  } else if (Array.isArray(field)) {
    raw = field.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.text || item.link || '';
      return '';
    }).join('');
  } else {
    raw = String(field);
  }
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && typeof obj.audio === 'string' && obj.audio.startsWith('http')) {
      return obj.audio;
    }
  } catch (_) {
    if (raw.startsWith('http')) return raw;
  }
  return null;
}

async function processRecord(config, token, record) {
  const fields = record.fields;
  const recordId = record.record_id;
  const handle = extractTextValue(fields.handle);
  const productId = extractTextValue(fields.product_id);

  console.log(`\n--- Processing record: ${handle} (Record ID: ${recordId}) ---`);

  // Extract required fields
  const productDesc = extractTextValue(fields.product_desc) || extractTextValue(fields.product_title);
  const generatedImgUrls = parseImageUrls(extractTextValue(fields.generated_img_url));

  if (!productDesc) {
    console.log('[Skip] No product_desc or product_title');
    return;
  }

  if (generatedImgUrls.length === 0) {
    console.log('[Skip] No generated_img_url');
    return;
  }

  // Randomly pick one image for analysis and first frame
  const selectedIndex = Math.floor(Math.random() * generatedImgUrls.length);
  const selectedImageUrl = generatedImgUrls[selectedIndex];
  console.log(`[Info] Using image [${selectedIndex + 1}/${generatedImgUrls.length}]: ${selectedImageUrl}`);

  try {
    const modelKey = config.alt_model;
    const credsKey = modelKey === 'seedance_v2v' ? 'seedance' : modelKey;
    const videoConfig = { ...config[credsKey], ...config[modelKey], alt_model: modelKey };
    console.log(`[ApiVideo] Using model: ${modelKey}`);

    let videoPath;
    if (modelKey === 'seedance_v2v') {
      // Step 1: read reference video from 视频文件 field
      const refVideoUrl = parseImageUrls(extractTextValue(fields['视频文件']))[0];
      if (!refVideoUrl) throw new Error('seedance_v2v requires 视频文件 field, but it is empty');
      console.log(`[Info] Reference video: ${refVideoUrl}`);

      // Step 2: probe reference video duration (fallback to config default)
      const MODEL_CONFIGS = require('./model-configs.json');
      const defaultDuration = MODEL_CONFIGS.seedance_v2v.duration;
      const probed = await probeVideoDurationSeconds(refVideoUrl);
      const duration = probed || defaultDuration;
      console.log(`[Info] Duration: ${duration}s (probed=${probed}, default=${defaultDuration})`);

      // Step 3: generate single-shot prompt via ttsv-ref skill
      console.log('[TTSV-Ref] Generating single-shot prompt...');
      const storyboard = await generateRefVideoStoryboard(config.anthropic, productDesc, duration);

      // Step 4: call Seedance multimodal
      videoPath = await generateVideoSeedanceV2V(storyboard, selectedImageUrl, refVideoUrl, videoConfig);
    } else {
      // Existing i2v flow
      console.log('[TTSV] Generating video storyboard...');
      const storyboard = await generateVideoStoryboard(config.anthropic, productDesc, modelKey);
      console.log(`[TTSV] Generated ${storyboard.shots.length} shot(s)`);

      videoPath = modelKey === 'grok'
        ? await generateVideoGrok(storyboard, selectedImageUrl, videoConfig)
        : modelKey === 'seedance'
        ? await generateVideoSeedance(storyboard, selectedImageUrl, videoConfig)
        : await generateApiVideo(storyboard, selectedImageUrl, videoConfig);
    }
    console.log('[Video] Video generated successfully');

    // Seedance generates silent videos (generate_audio: false). If the record has
    // music metadata in the `music_info` field (JSON blob with an `audio` URL),
    // mux that mp3 onto the video before uploading. First verify the generated
    // video really is silent — never overwrite an audio stream the model gave us.
    if (modelKey === 'seedance' || modelKey === 'seedance_v2v') {
      const audioUrl = extractAudioUrlFromMusicInfo(fields['music info']);
      if (audioUrl) {
        const alreadyHasAudio = await hasAudioStream(videoPath);
        if (alreadyHasAudio) {
          console.log('[Audio] Generated video already has an audio stream; skipping mux');
        } else {
          videoPath = await muxAudio(videoPath, audioUrl);
        }
      } else {
        console.log('[Audio] No music_info.audio on record; uploading video as-is');
      }
    }

    // Step 3: Upload video to Cloudinary
    console.log('[Cloudinary] Uploading video...');
    const videoUrl = await cloudinaryUtil.uploadVideo(videoPath, productId);
    console.log(`[Cloudinary] Video uploaded: ${videoUrl}`);

    // Step 4: Update Feishu record
    await updateRecord(token, config.bitable.app_token, config.bitable.table_id, recordId, {
      ai_video_urls: videoUrl,
    });
    console.log('[Done] Feishu record updated with video URL');

    // Cleanup temp video file
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }

    console.log(`[Done] Record ${recordId} complete with video`);

  } catch (err) {
    console.error(`[Error] Failed to process record: ${err.message}`);
    // Update Feishu record with N/A on failure
    try {
      await updateRecord(token, config.bitable.app_token, config.bitable.table_id, recordId, {
        ai_video_urls: 'N/A',
      });
      console.log('[Feishu] Record updated with N/A due to failure');
    } catch (updateErr) {
      console.error(`[Error] Failed to update record as N/A: ${updateErr.message}`);
    }
    throw err;
  }
}

async function main() {
  const config = loadConfig();

  // Validate required config keys
  const required = [
    'anthropic.api_key',
    'feishu.app_id',
    'feishu.app_secret',
    'cloudinary.cloud_name',
    'cloudinary.api_key',
    'cloudinary.api_secret'
  ];

  for (const key of required) {
    const [section, field] = key.split('.');
    if (!config[section] || !config[section][field]) {
      throw new Error(`Missing config: ${key} — please add it to config.json`);
    }
  }

  // Init Cloudinary
  cloudinaryUtil.init(config.cloudinary);

  // Get Feishu token
  const token = await getAccessToken(config.feishu.app_id, config.feishu.app_secret);
  console.log('[Feishu] Access token obtained');

  // Query records where 是否生成视频 = 是 and generated_img_url is not empty
  const records = await queryVideoRecords(token, config.bitable.app_token, config.bitable.table_id);
  console.log(`[Feishu] Found ${records.length} records for video generation`);

  if (records.length === 0) {
    console.log('[Done] No records to process');
    return;
  }

  let success = 0;
  let failed = 0;

  for (const record of records) {
    try {
      await processRecord(config, token, record);
      success++;
    } catch (err) {
      console.error(`[Error] Record ${record.record_id}: ${err?.message || err}`);
      failed++;
    }
  }

  console.log(`\n=== Summary: ${success} succeeded, ${failed} failed ===`);
}

main().catch((err) => {
  console.error('[Fatal]', err.message);
  process.exit(1);
});