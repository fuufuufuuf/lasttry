# i2v-pipeline

Generates fashion-marketing short videos from product records in a Feishu/Lark bitable. Supports both **image-to-video** (a single product image becomes a short clip) and **video-to-video reference mode** (motion transferred from an existing reference clip onto a product image).

## Pipeline

```
Feishu bitable
  └─ for each unprocessed record
       ├─ generate prompt (Claude via skills/ttsv or skills/ttsv-ref)
       ├─ generate video (one of: seedance / seedance_v2v / grok / *_ai666)
       ├─ upload to Cloudinary
       └─ write video URL back to the record
```

Records are filtered server-side by [feishu.js](feishu.js):
- `是否生成视频 == 是`
- `generated_img_url` is not empty
- `ai_video_urls` is empty

So a record is "ready to process" only when it's been flagged for generation, has source images, and has not yet been processed. On success the pipeline writes the Cloudinary URL into `ai_video_urls`; on failure it writes `N/A`, so the same record won't be retried automatically.

## Providers

The active provider is chosen by `config.alt_model` (a single string). Each provider has its own credential block in `config.json` and its own per-model defaults in [model-configs.json](model-configs.json).

| `alt_model` value | Mode | Module | Notes |
|---|---|---|---|
| `seedance` | i2v | [seedance.js](seedance.js) | BytePlus Ark — Dreamina Seedance 2.0 fast, image-to-video |
| `seedance_v2v` | v2v | [seedance.js](seedance.js) | Seedance 2.0 multimodal: image + reference video → video |
| `grok` | i2v | [grok.js](grok.js) | xAI Grok video |
| `grok_ai666` | i2v | [api_video_generation.js](api_video_generation.js) | Grok via the ai666 aggregator |
| `veo_ai666` | i2v | [api_video_generation.js](api_video_generation.js) | Veo 3.1 via the ai666 aggregator |
| `jimeng_ai666` | i2v | [api_video_generation.js](api_video_generation.js) | Jimeng 3.0 via the ai666 aggregator |

Switch providers by editing `config.alt_model` in `config.json` — there is no other mode flag.

### `seedance_v2v` specifics

- Reads a reference video URL from the **`视频文件`** field on the record. Empty field → record fails.
- Probes the reference's duration via `ffprobe`. Falls back to `model-configs.json` `seedance_v2v.duration` if probe fails.
- Output duration is clamped to Seedance 2.0's valid range `[4, 15]` seconds.
- Uses the [`ttsv-ref`](../skills/ttsv-ref/SKILL.md) skill to write a single-shot motion-transfer prompt that locks outfit to the image and motion to the reference video.
- Audio is **disabled** (`generate_audio: false`) — Seedance's auto-generated audio routinely triggers `OutputAudioSensitiveContentDetected` on this content.
- For `seedance_v2v`, credentials are reused from the `seedance` block in `config.json` (no separate `seedance_v2v` block needed).

### Audio mux (Seedance modes)

Both `seedance` and `seedance_v2v` produce silent videos. After generation the pipeline reads the **`music info`** field on the record (note: the field name contains a space) — a JSON blob with shape like `{"audio": "https://.../song.mp3", "title": "...", "author": "..."}` — and if the JSON's `audio` key is present, downloads the mp3 and muxes it onto the video using `ffmpeg` (re-encoded to AAC, length matched to the shorter of the two streams). If the field is empty or invalid, the video is uploaded silent.

Before muxing, the pipeline verifies the generated video is actually silent (`ffprobe -select_streams a`) — if Seedance returned a video with audio (e.g. config drift, model behavior change), the mux is skipped to avoid overwriting the model's output.

### Other (non-v2v) providers

- Use the [`ttsv`](../skills/ttsv/SKILL.md) skill to generate a multi-shot storyboard from `product_desc` / `product_title`.
- Pick a random image from `generated_img_url` as the first-frame reference.
- All providers in this branch use `generateApiVideo` except `grok` (which has its own client) and `seedance` (which uses BytePlus Ark directly).

## Required Feishu fields

| Field | Used for | Notes |
|---|---|---|
| `是否生成视频` | filter | must be `是` |
| `generated_img_url` | filter + first-frame source | non-empty; can be one URL or many (newline / comma separated) |
| `ai_video_urls` | filter + write-back | must be empty to be picked up |
| `product_desc` *or* `product_title` | prompt input | one of these is required |
| `handle` | logging | TikTok handle, used in console output |
| `product_id` | Cloudinary folder | each record's videos go under `Home/tiktok/videos/{product_id}/` |
| `视频文件` | v2v only | reference video URL for `seedance_v2v` |
| `music info` | optional, Seedance modes | JSON blob with `audio` mp3 URL — muxed into the silent Seedance output if present (note: field name has a space, not underscore) |

## Configuration

### [config.json](../config.json) (project root)

```jsonc
{
  "feishu":   { "app_id": "...", "app_secret": "..." },
  "bitable":  { "app_token": "...", "table_id": "..." },
  "anthropic": {
    "base_url": "...",
    "api_key": "...",
    "model": "claude-sonnet-4-6",
    "model_storyboard": "claude-sonnet-4-6"
  },
  "cloudinary": { "cloud_name": "...", "api_key": "...", "api_secret": "..." },

  "alt_model": "seedance_v2v",   // or seedance / grok / *_ai666

  "seedance":     { "alt_api_url": "https://ark.ap-southeast.bytepluses.com/api/v3", "alt_api_key": "..." },
  "veo_ai666":    { "alt_api_url": "https://ai.ai666.net/v1", "alt_api_key": "..." },
  "jimeng_ai666": { "alt_api_url": "https://ai.ai666.net/v1", "alt_api_key": "..." },
  "grok_ai666":   { "alt_api_url": "https://ai.ai666.net/v1", "alt_api_key": "..." }
}
```

`seedance_v2v` reuses the `seedance` block — no dedicated entry needed.

### [model-configs.json](model-configs.json)

Per-model defaults (resolution, ratio, duration, etc.) that get merged into the request payload. Keep in sync with the `alt_model` keys you actually use. For `seedance` and `seedance_v2v`, parameters now go into the request body directly using BytePlus's "new method" (top-level `resolution` / `ratio` / `duration`), not as `--tag` strings in the prompt.

## External dependencies

- **Node 18+** (uses `fetch`, `axios`, `node-fetch`)
- **`ffmpeg` / `ffprobe`** on `PATH` — `ffprobe` is used by `seedance_v2v` to read reference-video duration (falls back to config default if missing); `ffmpeg` is used to mux `music_info.audio` onto Seedance outputs (record fails if missing when `music_info.audio` is present).

## Running

```bash
cd i2v-pipeline
npm install
node index.js
```

Records are processed **serially** (one at a time). Each record is independent — a failure on one doesn't stop the run.

### Single-record testing

Use [test-video.js](test-video.js) to process exactly one record by `video_id`:

```bash
node test-video.js <video_id>
node test-video.js <video_id> --skip-upload --skip-update    # dry run
```

`--skip-upload` skips Cloudinary; `--skip-update` skips writing back to Feishu. Useful for iterating on prompt changes without polluting the bitable.

## Behavior notes

- **Sensitive-content gates (Seedance 2.0)**: real human faces in input image OR input reference video can trip `InputImageSensitiveContentDetected.PrivacyInformation` / `InputVideoSensitiveContentDetected`. Workaround: upstream the input through the [p2m-pipeline](../p2m-pipeline/) (Nano Banana) which generates a face-cropped model image — Seedance accepts that as a synthetic asset.
- **Failure handling**: any exception during a record write `ai_video_urls = "N/A"` so the record is no longer matched by the queue filter. Reset the field to empty to retry.
- **Cleanup**: temp video files are deleted after successful Cloudinary upload. On failure they may be left in `temp/` — clean up manually if disk pressure is an issue.
