const fs = require('fs');
const path = require('path');
const { getAccessToken, queryVideoRecords, updateRecord } = require('./feishu');
const { understandModelImage } = require('./claude');
const { generateVideoStoryboard } = require('./ttsv');
const { generateVideo } = require('./veo');
const { generateVideoAlternative } = require('./veo-alternative');
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
  console.log(`[Info] Product description length: ${productDesc.length}`);

  try {
    // Step 1: Claude analyzes the model image
    console.log('[Claude] Analyzing model image...');
    const imageAnalysis = await understandModelImage(config.anthropic, selectedImageUrl, productDesc);
    console.log('[Claude] Image analysis complete');

    // Step 2: Generate video storyboard using TTSV skill
    console.log('[TTSV] Generating video storyboard...');
    const storyboard = await generateVideoStoryboard(config.anthropic, imageAnalysis, productDesc);
    console.log(`[TTSV] Generated ${storyboard.shots.length} shot(s)`);

    // Step 3: Generate video using selected provider
    let videoPath;
    if (config.video_provider === 'alternative' || config.veo?.use_alternative) {
      console.log('[VeoAlt] Using alternative video generation service...');
      videoPath = await generateVideoAlternative(storyboard, selectedImageUrl, config.veo);
    } else {
      console.log('[Veo] Using default Veo3.1 service...');
      videoPath = await generateVideo(storyboard, selectedImageUrl, config.veo);
    }
    console.log('[Video] Video generated successfully');

    // Step 4: Upload video to Cloudinary
    console.log('[Cloudinary] Uploading video...');
    const videoUrl = await cloudinaryUtil.uploadVideo(videoPath, productId);
    console.log(`[Cloudinary] Video uploaded: ${videoUrl}`);

    // Step 5: Update Feishu record
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