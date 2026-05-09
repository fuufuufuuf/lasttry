// Regenerate the `video_title` field on Feishu records:
//   1. Read product info (product_desc / product_title) → selling points
//   2. Extract original hashtags from the current video_title
//   3. Ask Claude (skills/title-regen) for a fresh one-line description + 5–8
//      currently-trending hashtags for the product category
//   4. Write back: <new description> <original hashtags> <new hashtags>
//
// Two modes (matches test-mux-local.js style):
//   node regen-title.js <video_id>
//   node regen-title.js -all
//
// Always overwrites video_title.

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { getAccessToken, updateRecord } = require('./feishu');
const { runClaudeCLI } = require('./claude');

const CONFIG_PATH = path.join(__dirname, '../config.json');
const SKILL_PATH = path.join(__dirname, '../skills/title-regen/SKILL.md');
const BASE_URL = 'https://open.feishu.cn/open-apis';

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function extractTextValue(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) {
    return field.map((i) => (typeof i === 'object' ? i.text || '' : i)).join('');
  }
  return String(field);
}

function extractHashtags(text) {
  if (!text) return [];
  // Hashtag = #-prefixed run of letters/digits/underscore. Allow simple unicode letters too.
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) || [];
  // dedupe (preserve order)
  const seen = new Set();
  const out = [];
  for (const t of matches) {
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

async function queryByVideoId(token, appToken, tableId, videoId) {
  const res = await fetch(
    `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          conditions: [{ field_name: 'video_id', operator: 'is', value: [videoId] }],
          conjunction: 'and',
        },
        page_size: 1,
      }),
    }
  );
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Feishu query failed: ${data.msg}`);
  const items = data.data.items || [];
  if (items.length === 0) throw new Error(`No record found for video_id: ${videoId}`);
  return items[0];
}

async function queryAllRecords(token, appToken, tableId) {
  const records = [];
  let pageToken = '';
  do {
    const body = { page_size: 100 };
    if (pageToken) body.page_token = pageToken;
    const res = await fetch(
      `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    if (data.code !== 0) throw new Error(`Feishu query failed: ${data.msg}`);
    records.push(...(data.data.items || []));
    pageToken = data.data.has_more ? data.data.page_token : '';
  } while (pageToken);
  return records;
}

function loadSystemPrompt() {
  const skill = fs.readFileSync(SKILL_PATH, 'utf-8');
  return skill.split('---').slice(2).join('---').trim();
}

async function regenerateOnce(productDesc, originalHashtags) {
  const systemPrompt = loadSystemPrompt();
  const userMessage = `Product description:
${productDesc}

Original hashtags already on post (preserved separately by the pipeline — DO NOT include them in your hashtag line): ${originalHashtags.length ? originalHashtags.join(' ') : '(none)'}

Output the two-line response per the skill: line 1 = the description, line 2 = the hashtags. No labels.`;

  const raw = await runClaudeCLI(systemPrompt, userMessage);
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    // strip stray markdown fences if Claude wraps the answer
    .filter((l) => l.length > 0 && !/^```/.test(l));

  // Find the hashtag line (a line whose tokens are mostly #-prefixed)
  const hashtagIdx = lines.findIndex((l) => /^#[\p{L}\p{N}_]+(\s+#[\p{L}\p{N}_]+)*\s*$/u.test(l));
  let description;
  let newHashtagsLine;
  if (hashtagIdx > 0) {
    description = lines[hashtagIdx - 1];
    newHashtagsLine = lines[hashtagIdx];
  } else if (lines.length >= 2) {
    // Fall back to first two non-empty lines
    description = lines[0];
    newHashtagsLine = lines[1];
  } else {
    throw new Error(`Claude output did not contain two parseable lines. Raw:\n${raw.slice(0, 400)}`);
  }

  // Strip any accidental "DESCRIPTION:" / "HASHTAGS:" / "Title:" prefix the model might emit.
  description = description.replace(/^\s*(?:description|title|caption|hashtags?)\s*[:：]\s*/i, '').trim();
  newHashtagsLine = newHashtagsLine.replace(/^\s*(?:hashtags?|tags?)\s*[:：]\s*/i, '').trim();

  if (!description) throw new Error(`Empty description after parsing. Raw:\n${raw.slice(0, 400)}`);
  const newHashtags = extractHashtags(newHashtagsLine);
  if (newHashtags.length === 0) throw new Error(`No hashtags parsed. Raw:\n${raw.slice(0, 400)}`);

  return { description, newHashtags };
}

/**
 * Build the final video_title string for a Feishu record's fields without writing
 * back. Returns null if the record has no product info to generate from.
 * Used both by the standalone -all batch and by i2v-pipeline/index.js.
 */
async function buildNewTitleForFields(fields) {
  const productDesc = extractTextValue(fields.product_desc) || extractTextValue(fields.product_title);
  if (!productDesc) return null;

  const currentTitle = extractTextValue(fields.video_title) || '';
  const originalHashtags = extractHashtags(currentTitle);

  const { description, newHashtags } = await regenerateOnce(productDesc, originalHashtags);

  const origLower = new Set(originalHashtags.map((t) => t.toLowerCase()));
  const dedupedNew = newHashtags.filter((t) => !origLower.has(t.toLowerCase()));

  return [description, ...originalHashtags, ...dedupedNew].join(' ').trim();
}

async function processRecord(config, token, record) {
  const fields = record.fields;
  const handle = extractTextValue(fields.handle);
  const tag = `${handle} (${record.record_id})`;

  const productDesc = extractTextValue(fields.product_desc) || extractTextValue(fields.product_title);
  if (!productDesc) {
    console.log(`[Skip] ${tag} — no product_desc / product_title`);
    return false;
  }

  const currentTitle = extractTextValue(fields.video_title) || '';
  const originalHashtags = extractHashtags(currentTitle);

  console.log(`\n[Regen] ${tag}`);
  console.log(`  product:  ${productDesc.slice(0, 100)}${productDesc.length > 100 ? '…' : ''}`);
  console.log(`  original tags: ${originalHashtags.length ? originalHashtags.join(' ') : '(none)'}`);

  const final = await buildNewTitleForFields(fields);
  if (!final) {
    console.log(`[Skip] ${tag} — no product info`);
    return false;
  }
  console.log(`  → ${final}`);

  await updateRecord(token, config.bitable.app_token, config.bitable.table_id, record.record_id, {
    video_title: final,
  });
  console.log(`  [Done] video_title updated`);
  return true;
}

module.exports = { buildNewTitleForFields };

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage:');
    console.error('  node regen-title.js <video_id>   regenerate one record by video_id');
    console.error('  node regen-title.js -all          regenerate every record with product info');
    process.exit(1);
  }

  const config = loadConfig();
  const token = await getAccessToken(config.feishu.app_id, config.feishu.app_secret);
  console.log('[Feishu] token ok');

  if (arg === '-all') {
    const records = await queryAllRecords(token, config.bitable.app_token, config.bitable.table_id);
    console.log(`[Feishu] ${records.length} records pulled`);

    let done = 0;
    let skipped = 0;
    let failed = 0;
    for (const record of records) {
      const handle = extractTextValue(record.fields.handle);
      const tag = `${handle} (${record.record_id})`;
      try {
        const wrote = await processRecord(config, token, record);
        if (wrote) done++;
        else skipped++;
      } catch (err) {
        console.error(`[Error] ${tag}: ${err.message}`);
        failed++;
      }
    }
    console.log(`\n=== Summary: ${done} regenerated, ${skipped} skipped (no product info), ${failed} failed ===`);
  } else {
    const record = await queryByVideoId(token, config.bitable.app_token, config.bitable.table_id, arg);
    await processRecord(config, token, record);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[Fatal]', err.message);
    process.exit(1);
  });
}
