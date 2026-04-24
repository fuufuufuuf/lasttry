const fs = require('fs');
const path = require('path');
const { getAccessToken } = require('./feishu');
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
  console.log(`[Feishu] Found record: ${record.record_id}`);
  const fields = record.fields;

  const modelImgUrl = extractFirstImageUrl(fields.video_cover);
  if (!modelImgUrl) {
    console.error('[Error] No video_cover on this record');
    process.exit(1);
  }

  const productImgUrl = extractFirstImageUrl(fields.product_source_imgs);
  if (!productImgUrl) {
    console.error('[Error] No product_source_imgs on this record');
    process.exit(1);
  }

  console.log(`[Info] model image (video_cover): ${modelImgUrl}`);
  console.log(`[Info] product image: ${productImgUrl}`);

  // Single-step: Gemini takes the two reference images directly and applies the p2m prompt.
  const { base64, mimeType } = await generateModelImage(config.gemini.api_key, modelImgUrl, productImgUrl);
  const url = await cloudinaryUtil.uploadBase64(base64, mimeType);

  console.log('\n=== Result ===');
  console.log(url);
}

main().catch(err => {
  console.error('[Fatal]', err.message);
  process.exit(1);
});
