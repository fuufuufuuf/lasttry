const fs = require('fs');
const path = require('path');
const { getAccessToken, queryRecords, updateRecord } = require('./feishu');
const { generateBanana9Prompt } = require('./claude');
const { generateGrid9Image } = require('./gemini');
const cloudinaryUtil = require('./cloudinary');

const CONFIG_PATH = path.join(__dirname, '../config.json');

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
    return field.map((item) => (typeof item === 'object' ? item.text || '' : item)).join('');
  }
  return String(field);
}

async function processRecord(config, token, record) {
  const fields = record.fields;
  const recordId = record.record_id;
  const handle = extractTextValue(fields.handle);

  console.log(`\n--- Processing record: ${handle} (${recordId}) ---`);

  const productId = extractTextValue(fields.product_id) || recordId;
  const productDesc = extractTextValue(fields.product_desc) || extractTextValue(fields.product_title);
  const sourceImgsRaw = extractTextValue(fields.product_source_imgs);
  const generatedImgRaw = extractTextValue(fields.generated_img_url);

  const productImgUrls = parseImageUrls(sourceImgsRaw);
  const modelImgUrls = parseImageUrls(generatedImgRaw);

  if (!productDesc) {
    console.log('[Skip] No product_desc');
    return;
  }
  if (productImgUrls.length === 0) {
    console.log('[Skip] No product_source_imgs');
    return;
  }
  if (modelImgUrls.length === 0) {
    console.log('[Skip] No generated_img_url');
    return;
  }

  const productImgUrl = productImgUrls[0];
  const modelImgUrl = modelImgUrls[0];

  console.log(`[Info] Product img: ${productImgUrl}`);
  console.log(`[Info] Model img:   ${modelImgUrl}`);

  // Step 1: Claude generates the Nano Banana 9-grid prompt
  const { nanoBananaPrompt } = await generateBanana9Prompt(
    config.anthropic,
    productDesc,
    productImgUrl,
    modelImgUrl
  );

  // Step 2: Gemini generates the 9-grid image
  const { base64, mimeType } = await generateGrid9Image(
    config.gemini.api_key,
    nanoBananaPrompt,
    productImgUrl,
    modelImgUrl
  );

  // Step 3: Upload to Cloudinary under tiktok/pics/grid9/{timestamp}_{product_id}/
  const timestamp = Date.now();
  const { secureUrl } = await cloudinaryUtil.uploadGrid9(base64, mimeType, timestamp, productId);

  // Step 4: Update Feishu record grid9 field with the Cloudinary image URL
  await updateRecord(token, config.bitable.app_token, config.bitable.table_id, recordId, {
    grid9: secureUrl,
  });
  console.log(`[Done] Updated record ${recordId} grid9: ${secureUrl}`);
}

async function main() {
  const config = loadConfig();

  cloudinaryUtil.init(config.cloudinary);

  const token = await getAccessToken(config.feishu.app_id, config.feishu.app_secret);
  console.log('[Feishu] Access token obtained');

  const records = await queryRecords(token, config.bitable.app_token, config.bitable.table_id);
  console.log(`[Feishu] Found ${records.length} record(s) to process`);

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
      console.error(`[Error] Record ${record.record_id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n=== Summary: ${success} succeeded, ${failed} failed ===`);
}

main().catch((err) => {
  console.error('[Fatal]', err.message);
  process.exit(1);
});
