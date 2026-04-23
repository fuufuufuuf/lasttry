const fs = require('fs');
const path = require('path');
const { getAccessToken } = require('./feishu');
const { generateVideoStoryboard } = require('./ttsv');
const fetch = require('node-fetch');

const CONFIG_PATH = path.join(__dirname, '../config.json');
const BASE_URL = 'https://open.feishu.cn/open-apis';

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { vid: null, index: 0 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-vid' && args[i + 1]) {
      parsed.vid = args[++i];
    } else if (args[i] === '-index' && args[i + 1]) {
      parsed.index = parseInt(args[++i]) || 0;
    }
  }
  return parsed;
}

async function queryAllRecords(token, appToken, tableId) {
  const body = {
    filter: {
      conditions: [
        { field_name: '是否生成视频', operator: 'is', value: ['是'] },
        { field_name: 'generated_img_url', operator: 'isNotEmpty', value: [] },
        {field_name: 'ai_video_urls', operator: 'isEmpty', value: [] }
      ],
      conjunction: 'and',
    },
    page_size: 10,
  };

  const res = await fetch(
    `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`,
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
  return data.data.items || [];
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

async function reviewRecord(config, token, record, imageIndex = 0) {
  const fields = record.fields;
  const recordId = record.record_id;
  const handle = extractTextValue(fields.handle);
  const videoId = extractTextValue(fields.video_id);
  const productId = extractTextValue(fields.product_id) || videoId || recordId;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Record: ${handle} (Product ID: ${productId})`);
  console.log(`${'='.repeat(80)}`);

  const productDesc = extractTextValue(fields.product_desc) || extractTextValue(fields.product_title);
  const generatedImgUrls = parseImageUrls(extractTextValue(fields.generated_img_url));

  if (!productDesc || generatedImgUrls.length === 0) {
    console.log('[Skip] Missing product_desc or generated_img_url\n');
    return;
  }

  const firstImageUrl = generatedImgUrls[imageIndex] || generatedImgUrls[0];
  console.log(`\nImage [${imageIndex}]: ${firstImageUrl}`);
  console.log(`\nProduct Description:\n${productDesc}\n`);

  try {
    console.log('[1/1] Generating storyboard...');
    const storyboard = await generateVideoStoryboard(config.anthropic, productDesc);

    console.log('\n--- Storyboard ---');
    console.log(storyboard.fullStoryboard);
    console.log(`\nTotal Duration: ${storyboard.totalDuration}s`);
    console.log(`Total Shots: ${storyboard.shots.length}`);
    console.log('\n--- Parsed Shots ---');
    storyboard.shots.forEach(shot => {
      console.log(`Shot ${shot.shotNumber}: ${shot.duration}s`);
    });

  } catch (err) {
    console.error(`\n[Error] ${err.message}`);
  }
}

async function main() {
  const config = loadConfig();
  const token = await getAccessToken(config.feishu.app_id, config.feishu.app_secret);

  const { vid: videoId, index: imageIndex } = parseArgs();

  const records = await queryAllRecords(token, config.bitable.app_token, config.bitable.table_id);
  console.log(`Found ${records.length} records\n`);

  let targetRecord = records[0];
  if (videoId) {
    targetRecord = records.find(r => extractTextValue(r.fields.video_id) === videoId);
    if (!targetRecord) {
      console.log(`[Error] No record found with video_id: ${videoId}`);
      return;
    }
  }

  if (targetRecord) {
    await reviewRecord(config, token, targetRecord, imageIndex);
  }
}

main().catch(console.error);
