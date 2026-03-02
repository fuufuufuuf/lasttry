const fs = require('fs');
const path = require('path');
const { getAccessToken, queryRecords, updateRecord } = require('./feishu');
const { analyzeAndGeneratePrompt } = require('./claude');
const { generateModelImage } = require('./gemini');
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
    return field.map((item) => (typeof item === 'object' ? item.text || '' : item)).join('');
  }
  return String(field);
}

async function processRecord(config, token, record) {
  const fields = record.fields;
  const recordId = record.record_id;
  const handle = extractTextValue(fields.handle);

  console.log(`\n--- Processing record: ${handle} (${recordId}) ---`);

  const productDesc = extractTextValue(fields.product_desc);
  const sourceImgsRaw = extractTextValue(fields.product_source_imgs);
  const imgUrls = parseImageUrls(sourceImgsRaw);

  if (!productDesc) {
    console.log('[Skip] No product_desc');
    return;
  }
  if (imgUrls.length === 0) {
    console.log('[Skip] No product_source_imgs');
    return;
  }

  console.log(`[Info] product_desc length: ${productDesc.length}`);

  // Step 1: Claude analyzes images and generates p2m prompts (3 scenes)
  const { scenes } = await analyzeAndGeneratePrompt(
    config.anthropic,
    productDesc,
    imgUrls
  );
  console.log(`[Claude] ${scenes.length} scene prompt(s) ready`);

  // Step 2-4: Gemini generates all scenes in parallel; update Feishu as each one finishes
  const collectedUrls = [];

  await Promise.all(
    scenes.map((scene, i) => {
      console.log(`[Gemini] Generating image for Scene ${i + 1}...`);
      return generateModelImage(config.gemini.api_key, scene, imgUrls)
        .then(({ base64, mimeType }) => cloudinaryUtil.uploadBase64(base64, mimeType))
        .then(async (url) => {
          collectedUrls.push(url);
          console.log(`[Scene ${i + 1}] URL: ${url}`);
          await updateRecord(token, config.bitable.app_token, config.bitable.table_id, recordId, {
            generated_img_url: collectedUrls.join('\n'),
          });
          console.log(`[Scene ${i + 1}] Feishu updated (${collectedUrls.length} image(s) so far)`);
        });
    })
  );

  console.log(`[Done] Record ${recordId} complete with ${collectedUrls.length} image(s)`);
}

async function main() {
  const config = loadConfig();

  // Validate required config keys
  const required = ['anthropic.api_key', 'gemini.api_key'];
  for (const key of required) {
    const [section, field] = key.split('.');
    if (!config[section] || !config[section][field]) {
      throw new Error(`Missing config: ${key} — please add it to feishu_config.json`);
    }
  }

  // Init Cloudinary
  cloudinaryUtil.init(config.cloudinary);

  // Get Feishu token
  const token = await getAccessToken(config.feishu.app_id, config.feishu.app_secret);
  console.log('[Feishu] Access token obtained');

  // Query records where 是否生成视频 = 是
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
