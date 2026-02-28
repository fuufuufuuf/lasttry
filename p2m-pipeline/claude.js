const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.join(__dirname, '../skills/p2m/SKILL.md');

function loadSkill() {
  return fs.readFileSync(SKILL_PATH, 'utf-8');
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

  // Build image content blocks (max 2 images)
  const imageBlocks = imgUrls.slice(0, 2).map((url) => ({
    type: 'image',
    source: { type: 'url', url },
  }));

  const userContent = [
    ...imageBlocks,
    {
      type: 'text',
      text: `Product Description:\n${productDesc}\n\nPlease analyze the product images above and apply the P2M skill to generate three photoshoot scenarios with model profile. Focus on Scene 1 as the primary scenario that best showcases the product.`,
    },
  ];

  const baseUrl = (anthropicConfig.base_url || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
  const endpoint = `${baseUrl}/messages`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${anthropicConfig.api_key}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'HTTP-Referer': 'https://github.com/p2m-pipeline',
      'X-Title': 'P2M Pipeline',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      max_tokens: 2048,
      system: skillContent,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text.slice(0, 200)}`);
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
