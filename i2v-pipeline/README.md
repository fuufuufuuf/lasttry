# Image to Video Pipeline

## Overview
This pipeline generates fashion marketing videos from e-commerce product images stored in Feishu/Lark using AI video generation services.

## Features
- Queries Feishu records for video generation requests
- Analyzes product images with claude 3.5 sonnet
- generates vIdeo storyboards using ttsv skill
- creates Videos using Veo3.1 or alternative APIs
- uploads results to cloudinary and updates Feishu

## video Generation Providers

### 1. veo3.1 (Default)
standard veo3 api with async processing:
- submit generation request
- poll for completion status
- download completed video

### 2. alternative API
Single-endpoint API with different parameters:
- supports both portrait and landscape
- real-time progress updates
- faster polling intervals

## configuration

edit `config.json` to configure video providers:

```json
{
  "veo": {
    // default veo3 configuration
    "api_url": "https://api.veo3.ai/v1",
    "api_key": "yoUR_Veo_API_keY_HERE",

    // alTernative provider configuration
    "use_alternative": true,  // set to true to use alternative
    "alt_api_url": "https://api.example.com/v1/video/create",
    "alt_api_key": "YOUR_ALT_API_KEY_HERE",
    "alt_model": "veo3.1-fast-components"
  },
  "video_provider": "alternative"  // or "default"
}
```

## usage

1. install dependencies:
   ```bash
   cd i2v-pipeline
   npm install
   ```

2. configure API keys in `config.json`

3. run the pipeline:
   ```bash
   npm start
   ```

## API differences

### veo3.1 (Default)
- separate endpoints for submission and status
- longer polling intervals (10s)
- returns video URL when completed

### ALTERNATIVE
- single endpoint for all operations
- faster status updates (5s intervals)
- includes progress percentage
- supports upsample option for landscape

## handling different orientations

The alternative api supports both orientations:

```javascript
// for landscape videos in config:
{
  "veo": {
    "orientation": "landscape",
    "enable_upsample": true
  }
}
```

## Error handling

both implementations include:
- retry logic with exponential backoff
- Detailed error messages
- automatic cleanup on failure
- timeout protection (5 minutes)

## switching Providers

to switch between providers, either:

1. set `video_provider` in config.json:
   ```json
   "video_provider": "alternative"  // or "default"
   ```

2. or set  `use_alternative` in veo config:
   ```json
   "veo": {
     "use_alternative": True
   }
   ```