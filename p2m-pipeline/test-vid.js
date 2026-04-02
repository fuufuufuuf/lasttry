const fs = require('fs');
const path = require('path');
const { getAccessToken } = require('./feishu');
const { analyzeAndGeneratePrompt } = require('./claude');
const { generateModelImage } = require('./gemini');
const cloudinaryUtil = require('./cloudinary');
const fetch = require('node-fetch');

const CONFIG_PATH = path.join(__dirname, '../config.json');
const BASE_URL = 'https://open.feishu.cn/open-apis';

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function parseImageUrls(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch (_) {}
  return rawValue.split(/[\n,]+/).map(u => u.trim()).filter(u => u.startsWith('http'));
}

function extractTextValue(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) {
    return field.map(item => (typeof item === 'object' ? item.text || '' : item)).join('');
  }
  return String(field);
}

async function queryByVid(token, appToken, tableId, vid) {
  const res = await fetch(
    `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          conditions: [
            { field_name: 'video_id', operator: 'is', value: [vid] },
          ],
          conjunction: 'and',
        },
        page_size: 1,
      }),
    }
  );
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Feishu query failed: ${data.msg}`);
  const items = data.data.items || [];
  if (items.length === 0) throw new Error(`No record found for video_id: ${vid}`);
  return items[0];
}

async function main() {
  const vid = process.argv[2];
  if (!vid) {
    console.error('Usage: node test-vid.js <video_id>');
    process.exit(1);
  }

  const config = loadConfig();
  cloudinaryUtil.init(config.cloudinary);

  const token = await getAccessToken(config.feishu.app_id, config.feishu.app_secret);
  console.log('[Feishu] Access token obtained');

  const record = await queryByVid(token, config.bitable.app_token, config.bitable.table_id, vid);
  const fields = record.fields;
  console.log(`[Feishu] Found record: ${record.record_id}`);

  const productDesc = extractTextValue(fields.product_desc) || extractTextValue(fields.product_title);
  const imgUrls = parseImageUrls(extractTextValue(fields.product_source_imgs));

  if (!productDesc) { console.error('[Error] No product_desc'); process.exit(1); }
  if (imgUrls.length === 0) { console.error('[Error] No product_source_imgs'); process.exit(1); }

  console.log(`[Info] product_desc length: ${productDesc.length}, images: ${imgUrls.length}`);

  // Step 1: Claude generates scene prompts
  const { scenes } = await analyzeAndGeneratePrompt(config.anthropic, productDesc, imgUrls);
  console.log(`[Claude] ${scenes.length} scene(s) ready`);

  // Step 2: Gemini generates images + upload to Cloudinary
  const results = await Promise.allSettled(
    scenes.map(async (scene, i) => {
      console.log(`[Gemini] Generating Scene ${i + 1}...`);
      const { base64, mimeType } = await generateModelImage(config.gemini.api_key, scene, imgUrls);
      const url = await cloudinaryUtil.uploadBase64(base64, mimeType);
      console.log(`[Scene ${i + 1}] ${url}`);
      return url;
    })
  );

  console.log('\n=== Results ===');
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`Scene ${i + 1}: ${r.value}`);
    } else {
      console.error(`Scene ${i + 1}: FAILED - ${r.reason?.message || r.reason}`);
    }
  });
}

main().catch(err => {
  console.error('[Fatal]', err.message);
  process.exit(1);
});
