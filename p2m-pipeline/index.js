const fs = require('fs');
const path = require('path');
const { getAccessToken, queryRecords, updateRecord } = require('./feishu');
const { generateModelImage } = require('./gemini');
const cloudinaryUtil = require('./cloudinary');

const CONFIG_PATH = path.join(__dirname, '../config.json');

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
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
    return field.map((item) => (typeof item === 'object' ? item.text || '' : item)).join('');
  }
  return String(field);
}

// Pull the first usable URL from a Feishu field. Handles three shapes:
//  1. Attachment array: [{ url, tmp_url, file_token, ... }, ...]
//  2. Text array: [{ text: 'https://...' }, ...]
//  3. Plain string with one or more URLs
function extractFirstImageUrl(field) {
  const urls = extractAllImageUrls(field);
  return urls[0] || null;
}

// Pull all usable URLs from a Feishu field, preserving order.
function extractAllImageUrls(field) {
  if (!field) return [];
  if (Array.isArray(field)) {
    const urls = [];
    for (const item of field) {
      if (!item) continue;
      if (typeof item === 'string' && item.startsWith('http')) {
        urls.push(item);
      } else if (typeof item === 'object') {
        const direct = item.url || item.tmp_url;
        if (direct) urls.push(direct);
        else if (item.text && typeof item.text === 'string') {
          urls.push(...parseImageUrls(item.text));
        }
      }
    }
    return urls;
  }
  return parseImageUrls(extractTextValue(field));
}

async function processRecord(config, token, record) {
  const fields = record.fields;
  const recordId = record.record_id;
  const handle = extractTextValue(fields.handle);
  console.log(`\n--- Processing record: ${handle} (${recordId}) ---`);

  const modelSceneUrl = extractFirstImageUrl(fields.video_cover);
  if (!modelSceneUrl) {
    console.log('[Skip] No video_cover');
    return;
  }

  const productImgUrl = extractFirstImageUrl(fields.product_source_imgs);
  if (!productImgUrl) {
    console.log('[Skip] No product_source_imgs');
    return;
  }
  console.log(`[Info] model image: ${modelSceneUrl}`);
  console.log(`[Info] product image: ${productImgUrl}`);

  // Single-step Gemini call: two reference images + the p2m Nano Banana prompt.
  const { base64, mimeType } = await generateModelImage(config.gemini.api_key, modelSceneUrl, productImgUrl);
  const url = await cloudinaryUtil.uploadBase64(base64, mimeType);
  console.log(`[Done] ${url}`);

  await updateRecord(token, config.bitable.app_token, config.bitable.table_id, recordId, {
    generated_img_url: url,
  });
  console.log(`[Done] Record ${recordId} updated`);
}

async function main() {
  const config = loadConfig();

  if (!config.gemini?.api_key) {
    throw new Error('Missing config: gemini.api_key');
  }

  cloudinaryUtil.init(config.cloudinary);

  const token = await getAccessToken(config.feishu.app_id, config.feishu.app_secret);
  console.log('[Feishu] Access token obtained');

  const records = await queryRecords(token, config.bitable.app_token, config.bitable.table_id);
  console.log(`[Feishu] Found ${records.length} records to process`);

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
