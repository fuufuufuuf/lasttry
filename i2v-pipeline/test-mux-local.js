// Mux backfill / preview tool.
//
// Two modes:
//
//   node test-mux-local.js <video_id>
//       PREVIEW one record locally — downloads the video, muxes music_info.audio
//       onto it, saves the result under temp/. No Cloudinary upload, no Feishu
//       update. Aborts if the video already has audio.
//
//   node test-mux-local.js -all
//       BACKFILL every record where ai_video_urls is populated AND `music info`
//       is populated. For each:
//         · if the video is silent → mux mp3 → upload to Cloudinary → replace
//                                    ai_video_urls in Feishu
//         · if the video already has audio → skip (Seedance audio is preserved)
//       Records without `music info.audio` are not touched (they stay as-is).

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const axios = require('axios');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const { getAccessToken, updateRecord } = require('./feishu');
const { muxAudio } = require('./audio');
const cloudinaryUtil = require('./cloudinary');

const CONFIG_PATH = path.join(__dirname, '../config.json');
const BASE_URL = 'https://open.feishu.cn/open-apis';

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function extractTextValue(f) {
  if (!f) return '';
  if (typeof f === 'string') return f;
  if (Array.isArray(f)) return f.map((i) => (typeof i === 'object' ? i.text || '' : i)).join('\n');
  return String(f);
}

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

function extractFirstUrl(f) {
  const text = extractTextValue(f);
  if (!text) return null;
  const m = text.match(/https?:\/\/\S+/);
  return m ? m[0].replace(/[,\s]+$/, '') : null;
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

async function queryRecordsForBackfill(token, appToken, tableId) {
  const records = [];
  let pageToken = '';
  do {
    const body = {
      filter: {
        conditions: [
          { field_name: 'ai_video_urls', operator: 'isNotEmpty', value: [] },
          { field_name: 'music info', operator: 'isNotEmpty', value: [] },
        ],
        conjunction: 'and',
      },
      page_size: 100,
    };
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

async function isSilentUrl(url) {
  try {
    const { stdout } = await execFile(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', url],
      { timeout: 30000 }
    );
    return String(stdout).trim().length === 0;
  } catch (err) {
    console.warn(`  ffprobe url-probe failed: ${err.message}`);
    return false;
  }
}

async function downloadFile(url, filepath) {
  const r = await axios({ method: 'GET', url, responseType: 'stream', timeout: 600000 });
  const ws = fs.createWriteStream(filepath);
  r.data.pipe(ws);
  return new Promise((resolve, reject) => {
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
}

// ── Preview mode (single record, local only) ────────────────────────────
async function previewSingle(config, token, videoId) {
  const record = await queryByVideoId(token, config.bitable.app_token, config.bitable.table_id, videoId);
  console.log(`[Feishu] record: ${record.record_id}`);

  const fields = record.fields;
  const handle = extractTextValue(fields.handle);
  const videoUrl = extractFirstUrl(fields.ai_video_urls);
  const audioUrl = extractAudioUrlFromMusicInfo(fields['music info']);

  console.log(`  handle:  ${handle}`);
  console.log(`  video:   ${videoUrl}`);
  console.log(`  music:   ${audioUrl}`);

  if (!videoUrl) throw new Error('ai_video_urls is empty on this record');
  if (!audioUrl) throw new Error('music info audio not found on this record');

  console.log('\n[Probe] checking video for existing audio...');
  const silent = await isSilentUrl(videoUrl);
  console.log(`  → ${silent ? 'silent' : 'already has audio'}`);
  if (!silent) {
    console.log('  Aborting: video is not silent. Mux would overwrite the existing audio.');
    return;
  }

  const outDir = path.join(__dirname, 'temp', `mux_test_${Date.now()}`);
  await fs.promises.mkdir(outDir, { recursive: true });
  const videoLocal = path.join(outDir, 'video.mp4');
  console.log('\n[Download] silent video...');
  await downloadFile(videoUrl, videoLocal);

  const muxed = await muxAudio(videoLocal, audioUrl);
  console.log(`\n[Done] muxed video saved at:\n  ${muxed}`);
}

// ── Backfill mode (all records, with Cloudinary upload + Feishu update) ─
async function backfillAll(config, token) {
  cloudinaryUtil.init(config.cloudinary);

  const records = await queryRecordsForBackfill(
    token,
    config.bitable.app_token,
    config.bitable.table_id
  );
  console.log(`[Feishu] ${records.length} candidate records (ai_video_urls + music info both present)`);
  if (records.length === 0) return;

  let muxed = 0;
  let skipHasAudio = 0;
  let skipNoAudioKey = 0;
  let failed = 0;

  for (const record of records) {
    const fields = record.fields;
    const handle = extractTextValue(fields.handle);
    const productId = extractTextValue(fields.product_id);
    const tag = `${handle} (${record.record_id})`;
    let tmpDir;

    try {
      const audioUrl = extractAudioUrlFromMusicInfo(fields['music info']);
      if (!audioUrl) {
        console.log(`[Skip] ${tag} — music info has no audio key`);
        skipNoAudioKey++;
        continue;
      }

      const videoUrl = extractFirstUrl(fields.ai_video_urls);
      if (!videoUrl) {
        console.log(`[Skip] ${tag} — ai_video_urls empty after extraction`);
        continue;
      }

      const silent = await isSilentUrl(videoUrl);
      if (!silent) {
        console.log(`[Skip] ${tag} — already has audio`);
        skipHasAudio++;
        continue;
      }

      console.log(`\n[Mux] ${tag}`);
      console.log(`  video:  ${videoUrl}`);
      console.log(`  music:  ${audioUrl}`);

      tmpDir = path.join(__dirname, 'temp', `backfill_${record.record_id}_${Date.now()}`);
      await fs.promises.mkdir(tmpDir, { recursive: true });
      const localVideo = path.join(tmpDir, 'video.mp4');
      await downloadFile(videoUrl, localVideo);
      const muxedPath = await muxAudio(localVideo, audioUrl);

      console.log('  uploading muxed video to Cloudinary...');
      const newUrl = await cloudinaryUtil.uploadVideo(muxedPath, productId);

      console.log('  updating Feishu ai_video_urls...');
      await updateRecord(
        token,
        config.bitable.app_token,
        config.bitable.table_id,
        record.record_id,
        { ai_video_urls: newUrl }
      );

      console.log(`  [Done] ${newUrl}`);
      muxed++;
    } catch (err) {
      console.error(`[Error] ${tag}: ${err.message}`);
      failed++;
    } finally {
      if (tmpDir) {
        try {
          await fs.promises.rm(tmpDir, { recursive: true, force: true });
        } catch (_) {}
      }
    }
  }

  console.log(
    `\n=== Summary: ${muxed} muxed, ${skipHasAudio} already had audio, ${skipNoAudioKey} no audio key, ${failed} failed ===`
  );
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage:');
    console.error('  node test-mux-local.js <video_id>   preview a single record locally (no upload)');
    console.error('  node test-mux-local.js -all         backfill all records (mux silent + has music)');
    process.exit(1);
  }

  const config = loadConfig();
  const token = await getAccessToken(config.feishu.app_id, config.feishu.app_secret);
  console.log('[Feishu] token ok');

  if (arg === '-all') {
    await backfillAll(config, token);
  } else {
    await previewSingle(config, token, arg);
  }
}

main().catch((err) => {
  console.error('[Fatal]', err.message);
  process.exit(1);
});
