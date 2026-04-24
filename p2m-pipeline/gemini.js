const { GoogleGenAI } = require('@google/genai');
const fetch = require('node-fetch');
const { P2M_GEMINI_PROMPT } = require('./p2m-prompt');

const MODEL_ID = 'gemini-3.1-flash-image-preview';
const OUTPUT_ASPECT_RATIO = '9:16';

async function urlToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} (${res.status})`);
  const buffer = await res.buffer();
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return { base64: buffer.toString('base64'), mimeType: contentType.split(';')[0] };
}

function getImageDimensions(base64Data) {
  const buf = Buffer.from(base64Data, 'base64');
  // PNG: width at offset 16 (4 bytes BE), height at offset 20 (4 bytes BE)
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: scan for SOF0/SOF2 markers
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] === 0xFF && (buf[i + 1] === 0xC0 || buf[i + 1] === 0xC2)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function isPortrait916(width, height) {
  if (!width || !height || height <= width) return false;
  const ratio = width / height;
  // 9:16 = 0.5625, allow 10% tolerance
  return Math.abs(ratio - 0.5625) < 0.06;
}

// Generate a new p2m image from a model scene reference + a product reference.
// Image 1 = model scene photo (body + lower-crop + scene-category authority)
// Image 2 = product photo (garment color + construction authority)
// Output is always 9:16.
async function generateModelImage(apiKey, modelImgUrl, productImgUrl) {
  if (!modelImgUrl) throw new Error('generateModelImage: modelImgUrl is required');
  if (!productImgUrl) throw new Error('generateModelImage: productImgUrl is required');

  const ai = new GoogleGenAI({ apiKey });

  const [model, product] = await Promise.all([
    urlToBase64(modelImgUrl),
    urlToBase64(productImgUrl),
  ]);

  const contents = [
    { inlineData: { data: model.base64,   mimeType: model.mimeType } },
    { inlineData: { data: product.base64, mimeType: product.mimeType } },
    { text: P2M_GEMINI_PROMPT },
  ];

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Gemini] ${MODEL_ID} attempt ${attempt}/${maxRetries}`);
    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: OUTPUT_ASPECT_RATIO,
          imageSize: '1K',
        },
      },
    });

    const parts = response?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (!part.inlineData) continue;
      const dims = getImageDimensions(part.inlineData.data);
      if (dims) {
        console.log(`[Gemini] Output ${dims.width}x${dims.height}`);
        if (!isPortrait916(dims.width, dims.height)) {
          console.log(`[Gemini] Not 9:16, ${attempt < maxRetries ? 'retrying...' : 'giving up'}`);
          if (attempt < maxRetries) break;
        }
      }
      console.log('[Gemini] Image generated');
      return {
        base64: part.inlineData.data,
        mimeType: part.inlineData.mimeType || 'image/png',
      };
    }
  }

  throw new Error('Gemini did not return a 9:16 image after 3 attempts');
}

module.exports = { generateModelImage };
