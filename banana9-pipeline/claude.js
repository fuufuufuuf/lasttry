const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.join(__dirname, '../skills/banana9/SKILL.md');

function loadSkill() {
  return fs.readFileSync(SKILL_PATH, 'utf-8');
}

async function generateBanana9Prompt(anthropicConfig, productDesc, productImgUrl, modelImgUrl) {
  const skillContent = loadSkill();

  const userContent = [
    {
      type: 'image',
      source: { type: 'url', url: productImgUrl },
    },
    {
      type: 'image',
      source: { type: 'url', url: modelImgUrl },
    },
    {
      type: 'text',
      text: `Product Description:\n${productDesc}\n\nImage 1 (above, first image) is the product photo — use it as the garment color and construction ground truth.\nImage 2 (above, second image) is the completed model photo — use it as the character and scene ground truth.\n\nApply the Banana9 skill to analyze both images and generate a complete, production-ready Nano Banana prompt for a 3×3 grid of 9 frames. Follow the full output format specified in the skill.`,
    },
  ];

  const baseUrl = (anthropicConfig.base_url || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
  const endpoint = `${baseUrl}/messages`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anthropicConfig.api_key}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'HTTP-Referer': 'https://github.com/banana9-pipeline',
      'X-Title': 'Banana9 Pipeline',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      max_tokens: 4096,
      system: skillContent,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const fullOutput = data.choices
    ? data.choices[0].message.content
    : data.content[0].text;

  console.log('[Claude] Banana9 prompt generated');

  // Extract the NANO BANANA PROMPT section (the actual prompt to send to Gemini)
  const promptMatch = fullOutput.match(/###\s*NANO BANANA PROMPT\s*\n+```[\s\S]*?\n([\s\S]*?)```/i);
  const nanoBananaPrompt = promptMatch ? promptMatch[1].trim() : fullOutput.trim();

  return { fullOutput, nanoBananaPrompt };
}

module.exports = { generateBanana9Prompt };
