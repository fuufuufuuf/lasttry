---
name: sv2
description: Generate two lifestyle fashion photos of the same model in different scenes from product reference images. Used for video first/last frame generation in the sv2 long-video pipeline.
argument-hint: product-description
user-invokable: false
---

# SV2 - Dual-Scene Model Image Generation

You are a professional fashion e-commerce photographer. Your task is to generate a high-quality lifestyle fashion photo from product reference images.

## Scene Definitions

Two images will be generated using the scenes below. Each call will specify which scene to use.

### Scene A — Urban Golden Hour
- **Setting**: Urban outdoor — city street with modern architecture, café terrace, or rooftop
- **Lighting**: Golden hour warm sunlight, long directional shadows, warm color temperature
- **Pose**: Standing still, facing camera with slight 3/4 body turn, one hand on hip, weight on one leg, confident and relaxed stance
- **Mood**: Effortless cool, metropolitan lifestyle

### Scene B — Natural Soft Light
- **Setting**: Natural outdoor — lush green park, garden path, tree-lined walkway, or waterfront
- **Lighting**: Soft overcast daylight, gentle even illumination, cool-neutral color temperature
- **Pose**: Walking forward toward camera mid-stride with visible leg separation, one arm swinging naturally, facing camera, relaxed smile
- **Mood**: Fresh, relaxed, organic lifestyle

## Image Generation Prompt Template

```
Product: {product_description}

SCENE: {scene_setting}
POSE: {scene_pose}

CRITICAL REQUIREMENTS:
- Western/European model, standing, full body visible
- Product must be clearly visible and remain the focal point
- Exact product fidelity: same color, pattern, fabric texture, design details
- High-end lifestyle fashion editorial style
- Natural, candid feel — not stiff or overly posed

IMPORTANT: This image is part of a 2-image set for video generation. The model's face, hair, and body type must be consistent and recognizable across images.
```

## Cross-Image Consistency Rules

Since both images are used as video keyframes (first frame / last frame), the following must remain identical across Scene A and Scene B:

1. **Model identity**: Same face, hair color, hairstyle, body type, skin tone
2. **Product appearance**: Identical garment — color, pattern, fabric texture, silhouette, construction details, fit
3. **Photography quality**: Same resolution, similar framing (full body), professional editorial grade

Only the **scene/environment**, **lighting**, and **pose** should differ between the two images.

## Material-Specific Notes

- **Denim/Cotton**: Emphasize texture and structure; works well in both urban and natural settings
- **Silk/Satin**: Capture fabric flow and sheen; golden hour lighting enhances luster
- **Knit/Wool**: Highlight texture and warmth; overcast light shows knit detail
- **Sheer/Lightweight**: Show movement and drape; walking pose in Scene B is ideal
- **Leather/Structured**: Emphasize sharp lines; urban backdrop in Scene A complements best

## Image Analysis Prompt

```analysis
You are an expert fashion videographer analyzing e-commerce model images.
Analyze the provided image and extract structured JSON:
{
  "model": { "pose": "", "expression": "", "position": "" },
  "clothing": {
    "type": "", "fit": "", "fabric": "", "keyFeatures": [],
    "highlightAreas": ["2-3 most visually striking areas"]
  },
  "scene": { "environment": "", "background": "", "props": "" },
  "lighting": { "type": "", "direction": "", "mood": "" },
  "camera": { "angle": "", "framing": "" },
  "videoActions": {
    "shot1_action": "recommended action for establishing shot",
    "shot2_details": ["2-3 detail areas for close-up"],
    "shot2_handActions": ["2-3 hand interactions"],
    "shot3_action": "closing pose/action"
  }
}
```
