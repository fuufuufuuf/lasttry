const { GoogleGenAI } = require('@google/genai');
const fetch = require('node-fetch');

const MODEL_ID = 'gemini-3.1-flash-image-preview';

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

async function generateModelImage(apiKey, prompt, refImageUrls) {
  const ai = new GoogleGenAI({ apiKey });

  // Download reference images
  const imageParts = [];
  for (const url of refImageUrls.slice(0, 2)) {
    const { base64, mimeType } = await urlToBase64(url);
    imageParts.push({ inlineData: { data: base64, mimeType } });
  }

  const contents = [
    ...imageParts,
    {
      text: `You are a professional fashion e-commerce photographer. Based on these product reference images and the following photoshoot scenario, generate a high-quality lifestyle fashion photo with a Western model standing and wearing this product.\n\n${prompt}\n\nIMPORTANT: The model MUST be standing. Western/European appearance. Natural lifestyle setting as described. Product must be clearly visible and remain the focal point.`,
    },
  ];

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Gemini] Generating image with model: ${MODEL_ID} (attempt ${attempt}/${maxRetries})`);
    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: '9:16',
          imageSize: '1K',
        },
      },
    });

    // Extract image from response parts
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const dims = getImageDimensions(part.inlineData.data);
        if (dims) {
          console.log(`[Gemini] Image dimensions: ${dims.width}x${dims.height}`);
          if (!isPortrait916(dims.width, dims.height)) {
            console.log(`[Gemini] Aspect ratio is not 9:16, ${attempt < maxRetries ? 'retrying...' : 'giving up'}`);
            if (attempt < maxRetries) break;
          }
        }
        console.log('[Gemini] Image generated successfully');
        return {
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        };
      }
    }
  }

  throw new Error('Gemini did not return a 9:16 image after 3 attempts');
}

module.exports = { generateModelImage };
