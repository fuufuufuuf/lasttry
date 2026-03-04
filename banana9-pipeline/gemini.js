const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODEL_ID = 'gemini-3-pro-image-preview';

async function downloadToLocal(url, label) {
  console.log(`[Gemini] Downloading ${label}: ${url.slice(0, 80)}...`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'image/*,*/*',
    },
  });
  if (!res.ok) throw new Error(`Failed to download ${label}: HTTP ${res.status}`);
  const buffer = await res.buffer();
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const mimeType = contentType.split(';')[0].trim();
  const ext = mimeType.split('/')[1] || 'jpg';
  const tmpFile = path.join(os.tmpdir(), `banana9_${label}_${Date.now()}.${ext}`);
  fs.writeFileSync(tmpFile, buffer);
  console.log(`[Gemini] Saved ${label} to ${tmpFile} (${buffer.length} bytes, ${mimeType})`);
  return { tmpFile, mimeType };
}

async function generateGrid9Image(apiKey, nanoBananaPrompt, productImgUrl, modelImgUrl) {
  const tempFiles = [];
  try {
    const productImg = await downloadToLocal(productImgUrl, 'product-img');
    tempFiles.push(productImg.tmpFile);

    const modelImg = await downloadToLocal(modelImgUrl, 'model-img');
    tempFiles.push(modelImg.tmpFile);

    const productBase64 = fs.readFileSync(productImg.tmpFile).toString('base64');
    const modelBase64 = fs.readFileSync(modelImg.tmpFile).toString('base64');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig: { responseModalities: ['Text', 'Image'] },
    });

    // Image 1 = product photo (garment ground truth)
    // Image 2 = model photo (character + scene ground truth)
    const contents = [
      { inlineData: { data: productBase64, mimeType: productImg.mimeType } },
      { inlineData: { data: modelBase64, mimeType: modelImg.mimeType } },
      { text: nanoBananaPrompt },
    ];

    console.log(`[Gemini] Generating 9-grid image with model: ${MODEL_ID}`);
    const result = await model.generateContent(contents);
    const response = result.response;

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        console.log('[Gemini] 9-grid image generated successfully');
        return {
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        };
      }
    }

    // Log text response if no image returned (helps diagnose refusals)
    const textParts = response.candidates[0].content.parts.filter(p => p.text);
    if (textParts.length > 0) {
      console.log('[Gemini] Model response (no image):', textParts.map(p => p.text).join(''));
    }
    throw new Error('Gemini did not return an image in the response');

  } finally {
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch (_) {}
    }
  }
}

module.exports = { generateGrid9Image };
