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

  console.log(`[Gemini] Generating image with model: ${MODEL_ID}`);
  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  // Extract image from response parts
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      console.log('[Gemini] Image generated successfully');
      return {
        base64: part.inlineData.data,
        mimeType: part.inlineData.mimeType || 'image/png',
      };
    }
  }

  throw new Error('Gemini did not return an image in the response');
}

module.exports = { generateModelImage };
