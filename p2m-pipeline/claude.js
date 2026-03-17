const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.join(__dirname, '../skills/p2m/SKILL.md');

function loadSkill() {
  return fs.readFileSync(SKILL_PATH, 'utf-8');
}

async function urlToBase64(url) {
  const res = await fetch(url);
  const buffer = await res.buffer();
  const base64 = buffer.toString('base64');
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return { base64, contentType };
}

function extractAllScenes(p2mOutput) {
  const scenes = [];
  const sceneRegex = /##\s*Scene\s+\d+[^\n]*\n[\s\S]*?(?=##\s*Scene\s+\d+|$)/gi;
  let match;
  while ((match = sceneRegex.exec(p2mOutput)) !== null) {
    const trimmed = match[0].trim();
    if (trimmed) scenes.push(trimmed);
  }
  if (scenes.length === 0) {
    scenes.push(p2mOutput.trim());
  }
  return scenes;
}

async function analyzeAndGeneratePrompt(anthropicConfig, productDesc, imgUrls) {
  const skillContent = loadSkill();
  const baseUrl = (anthropicConfig.base_url || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
  const endpoint = `${baseUrl}/messages`;

  // Try URL format first
  let imageBlocks = imgUrls.slice(0, 2).map((url) => ({
    type: 'image',
    source: { type: 'url', url },
  }));

  let userContent = [
    ...imageBlocks,
    {
      type: 'text',
      text: `Product Description:\n${productDesc}\n\nPlease analyze the product images above and apply the P2M skill to generate three photoshoot scenarios with model profile. Focus on Scene 1 as the primary scenario that best showcases the product.`,
    },
  ];

  let res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${anthropicConfig.api_key}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'HTTP-Referer': 'https://github.com/p2m-pipeline',
      'X-Title': 'P2M Pipeline',
    },
    body: JSON.stringify({
      model: anthropicConfig.model || 'anthropic/claude-3.5-sonnet',
      max_tokens: 2048,
      system: skillContent,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  // If URL not supported, retry with base64
  if (!res.ok) {
    const errorText = await res.text();
    if (errorText.includes('不支持的图片类型: url') || errorText.includes('url')) {
      console.log('[Claude] URL format not supported, converting to base64...');
      const base64Images = await Promise.all(
        imgUrls.slice(0, 2).map(async (url) => {
          const { base64, contentType } = await urlToBase64(url);
          return {
            type: 'image',
            source: { type: 'base64', media_type: contentType, data: base64 },
          };
        })
      );

      userContent = [
        ...base64Images,
        {
          type: 'text',
          text: `Product Description:\n${productDesc}\n\nPlease analyze the product images above and apply the P2M skill to generate three photoshoot scenarios with model profile. Focus on Scene 1 as the primary scenario that best showcases the product.`,
        },
      ];

      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anthropicConfig.api_key}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'HTTP-Referer': 'https://github.com/p2m-pipeline',
          'X-Title': 'P2M Pipeline',
        },
        body: JSON.stringify({
          model: anthropicConfig.model || 'anthropic/claude-3.5-sonnet',
          max_tokens: 2048,
          system: skillContent,
          messages: [{ role: 'user', content: userContent }],
        }),
      });

      if (!res.ok) {
        const retryText = await res.text();
        throw new Error(`Claude API error ${res.status}: ${retryText.slice(0, 200)}`);
      }
    } else {
      throw new Error(`Claude API error ${res.status}: ${errorText.slice(0, 200)}`);
    }
  }

  const data = await res.json();
  const fullOutput = data.choices
    ? data.choices[0].message.content  // OpenRouter format
    : data.content[0].text;            // Anthropic native format

  console.log('[Claude] P2M analysis complete');

  const scenes = extractAllScenes(fullOutput);
  return { fullOutput, scenes };
}

module.exports = { analyzeAndGeneratePrompt };
