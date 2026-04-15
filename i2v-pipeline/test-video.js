#!/usr/bin/env node

/**
 * I2V Pipeline Test Program
 *
 * Usage: node test-video.js <video_id> [--sample] [--skip-upload] [--skip-update] [--dry-run]
 *
 * Options:
 *   --sample        Skip Claude/storyboard, use fixed prompt "go around and show the outfit"
 *   --skip-upload   Skip Cloudinary upload
 *   --skip-update   Skip Feishu record update
 *   --dry-run       Only run image analysis + storyboard (no video generation)
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { getAccessToken, updateRecord } = require('./feishu');
const { understandModelImage } = require('./claude');
const { generateVideoStoryboard } = require('./ttsv');
const { generateApiVideo } = require('./api_video_generation');
const { generateVideoGrok } = require('./grok');
const cloudinaryUtil = require('./cloudinary');

const CONFIG_PATH = path.join(__dirname, '../config.json');
const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

// ── Helpers ──────────────────────────────────────────────

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function parseImageUrls(rawValue) {
  if (!rawValue) return [];
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

// ── Feishu: Query by video_id ────────────────────────────

async function queryByVideoId(token, appToken, tableId, videoId) {
  const body = {
    filter: {
      conditions: [
        { field_name: 'video_id', operator: 'is', value: [videoId] },
      ],
      conjunction: 'and',
    },
    page_size: 10,
  };

  const res = await fetch(
    `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Feishu query failed: ${data.msg}`);

  const items = data.data?.items || [];
  if (items.length === 0) {
    throw new Error(`No record found for video_id: ${videoId}`);
  }

  console.log(`[Feishu] Found ${items.length} record(s) for video_id: ${videoId}`);
  return items[0]; // Return first match
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  // Parse args
  const args = process.argv.slice(2);
  const flags = args.filter(a => a.startsWith('--'));
  const positional = args.filter(a => !a.startsWith('--'));

  const videoId = positional[0];
  if (!videoId) {
    console.error('Usage: node test-video.js <video_id> [--skip-upload] [--skip-update] [--dry-run]');
    process.exit(1);
  }

  const sample = flags.includes('--sample');
  const skipUpload = flags.includes('--skip-upload');
  const skipUpdate = flags.includes('--skip-update');
  const dryRun = flags.includes('--dry-run');

  console.log(`\n=== I2V Pipeline Test ===`);
  console.log(`Video ID: ${videoId}`);
  console.log(`Options: ${dryRun ? 'DRY RUN | ' : ''}${skipUpload ? 'skip-upload | ' : ''}${skipUpdate ? 'skip-update' : ''}\n`);

  // Load config
  const config = loadConfig();

  // Step 1: Get Feishu token & find record
  console.log('[Step 1] Querying Feishu for video_id...');
  const token = await getAccessToken(config.feishu.app_id, config.feishu.app_secret);
  const record = await queryByVideoId(token, config.bitable.app_token, config.bitable.table_id, videoId);

  const fields = record.fields;
  const recordId = record.record_id;
  const handle = extractTextValue(fields.handle);
  const productId = extractTextValue(fields.product_id);
  const productDesc = extractTextValue(fields.product_desc) || extractTextValue(fields.product_title);
  const generatedImgUrls = parseImageUrls(extractTextValue(fields.generated_img_url));

  console.log(`[Info] Record ID: ${recordId}`);
  console.log(`[Info] Handle: ${handle}`);
  console.log(`[Info] Product ID: ${productId}`);
  console.log(`[Info] Product Desc: ${productDesc.substring(0, 80)}${productDesc.length > 80 ? '...' : ''}`);
  console.log(`[Info] Image URLs: ${generatedImgUrls.length} found`);

  if (generatedImgUrls.length === 0) {
    console.error('[Error] No generated_img_url in this record');
    process.exit(1);
  }

  // Pick first image (deterministic for testing, unlike random in production)
  const selectedImageUrl = generatedImgUrls[0];
  console.log(`[Info] Selected image: ${selectedImageUrl}\n`);

  let storyboard;
  if (sample) {
    const samplePrompt = 'go around and show the outfit';
    storyboard = { shots: [{ shotNumber: 1, duration: 10, prompt: samplePrompt }], totalDuration: 10, fullStoryboard: samplePrompt };
    console.log(`[Step 2-3] Sample mode — using fixed prompt: "${samplePrompt}"\n`);
  } else {
    // Step 2: Claude image analysis
    console.log('[Step 2] Claude analyzing image...');
    const imageAnalysis = await understandModelImage(config.anthropic, selectedImageUrl, productDesc);
    console.log('[Step 2] Image analysis complete:');
    console.log(JSON.stringify(imageAnalysis, null, 2));
    console.log();

    // Step 3: Generate storyboard
    console.log('[Step 3] Generating video storyboard (TTSV)...');
    storyboard = await generateVideoStoryboard(config.anthropic, imageAnalysis, productDesc);
    console.log(`[Step 3] Storyboard generated: ${storyboard.shots.length} shots, ${storyboard.totalDuration}s total`);
    storyboard.shots.forEach(shot => {
      console.log(`  Shot ${shot.shotNumber} (${shot.duration}s): ${shot.prompt.substring(0, 100)}...`);
    });
    console.log(`\n--- Full Storyboard ---\n${storyboard.fullStoryboard}\n--- End Storyboard ---\n`);
  }

  if (dryRun) {
    console.log('[Done] Dry run complete. Skipping video generation.');
    return;
  }

  // Step 4: Generate video
  console.log(`[Step 4] Generating video (${config.alt_model})...`);

  const modelKey = config.alt_model;
  if (!config[modelKey]?.alt_api_url || !config[modelKey]?.alt_api_key) {
    console.error(`[Error] Missing ${modelKey}.alt_api_url or ${modelKey}.alt_api_key in config.json`);
    process.exit(1);
  }
  const videoConfig = { ...config[modelKey], alt_model: modelKey };
  const videoPath = modelKey === 'grok'
    ? await generateVideoGrok(storyboard, selectedImageUrl, videoConfig)
    : await generateApiVideo(storyboard, selectedImageUrl, videoConfig);
  console.log(`[Step 4] Video saved to: ${videoPath}\n`);

  // Step 5: Upload to Cloudinary
  let videoUrl = videoPath; // fallback: local path
  if (!skipUpload) {
    console.log('[Step 5] Uploading to Cloudinary...');
    cloudinaryUtil.init(config.cloudinary);
    videoUrl = await cloudinaryUtil.uploadVideo(videoPath, productId);
    console.log(`[Step 5] Video URL: ${videoUrl}\n`);
  } else {
    console.log('[Step 5] Skipped Cloudinary upload\n');
  }

  // Step 6: Update Feishu record
  if (!skipUpdate && !skipUpload) {
    console.log('[Step 6] Updating Feishu record...');
    await updateRecord(token, config.bitable.app_token, config.bitable.table_id, recordId, {
      ai_video_urls: videoUrl,
    });
    console.log('[Step 6] Feishu record updated\n');
  } else {
    console.log('[Step 6] Skipped Feishu update\n');
  }

  // Cleanup temp video
  if (fs.existsSync(videoPath)) {
    fs.unlinkSync(videoPath);
    console.log('[Cleanup] Temp video file removed');
  }

  console.log(`\n=== Test Complete ===`);
  console.log(`Video ID: ${videoId}`);
  console.log(`Video URL: ${videoUrl}`);
}

main().catch((err) => {
  console.error('\n[Fatal]', err.message);
  process.exit(1);
});
