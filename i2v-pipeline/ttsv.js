const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const SKILL_PATH = path.join(__dirname, '../skills/ttsv/SKILL.md');

async function generateVideoStoryboard(config, imageAnalysis, productDesc) {
  // Load TTSV skill content
  const ttsvSkill = fs.readFileSync(SKILL_PATH, 'utf-8');

  // Extract the skill content after the frontmatter
  const skillContent = ttsvSkill.split('---').slice(2).join('---').trim();

  const systemPrompt = skillContent;

  const userMessage = `I need to create a video storyboard for a fashion product.

First-frame analysis:
${JSON.stringify(imageAnalysis, null, 2)}

Product description:
${productDesc}

Please generate a 2-3 shot video storyboard following the TTSV format. The video should be 8-10 seconds total.`;

  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(config.base_url + '/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.api_key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/yourusername/i2v-pipeline',
          'X-Title': 'I2V Pipeline TTSV'
        },
        body: JSON.stringify({
          model: config.model_storyboard || 'anthropic/claude-3.5-sonnet',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Parse the storyboard shots
      const shots = parseStoryboard(content);

      if (shots.length === 0) {
        throw new Error('No shots parsed from storyboard');
      }

      return {
        fullStoryboard: content,
        shots: shots,
        totalDuration: shots.reduce((sum, shot) => sum + shot.duration, 0)
      };

    } catch (err) {
      lastError = err;
      console.error(`[TTSV] Attempt ${attempt}/${maxRetries} failed:`, err.message);

      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.log(`[TTSV] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw new Error(`TTSV storyboard generation failed after ${maxRetries} attempts: ${lastError.message}`);
}

function parseStoryboard(content) {
  const shots = [];

  // Match shot patterns, handling code blocks and markdown sections
  const shotRegex = /\[Shot (\d+)\][^\n]*?(\d+)s[^\n]*\n+Prompt:\s*(.+?)(?=\n\n\[Shot|\n\n```|\n\n---|\n\n##|$)/gs;

  let match;
  while ((match = shotRegex.exec(content)) !== null) {
    shots.push({
      shotNumber: parseInt(match[1]),
      duration: parseInt(match[2]),
      prompt: match[3].trim()
    });
  }

  return shots;
}

module.exports = { generateVideoStoryboard };