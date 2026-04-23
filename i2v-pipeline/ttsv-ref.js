const fs = require('fs');
const path = require('path');
const { runClaudeCLI, getClaudeCliConfig } = require('./claude');

const SKILL_PATH = path.join(__dirname, '../skills/ttsv-ref/SKILL.md');

/**
 * Generate a single-shot video prompt for Seedance 2.0 multimodal (image + video → video).
 * Returns an object in the same shape as ttsv.js so downstream providers can treat it uniformly.
 */
async function generateRefVideoStoryboard(config, productDesc, duration) {
  const skillRaw = fs.readFileSync(SKILL_PATH, 'utf-8');
  const systemPrompt = skillRaw.split('---').slice(2).join('---').trim();

  const userMessage = `Product description:
${productDesc}

Generate the single-shot reference-video prompt per the skill. Duration: ${duration}s.`;

  const cliConfig = getClaudeCliConfig();
  const maxRetries = cliConfig.max_retries || 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[TTSV-Ref] Generating prompt via Claude CLI (attempt ${attempt}/${maxRetries})...`);
      const rawContent = await runClaudeCLI(systemPrompt, userMessage);

      const prompt = parseRefPrompt(rawContent);
      if (!prompt) throw new Error('No [Video Prompt] block parsed from output');

      return {
        fullStoryboard: `[Video Prompt] — ${duration}s\nPrompt: ${prompt}`,
        shots: [{ shotNumber: 1, duration, prompt }],
        totalDuration: duration,
      };
    } catch (err) {
      lastError = err;
      console.error(`[TTSV-Ref] Attempt ${attempt}/${maxRetries} failed:`, err.message);
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw new Error(`TTSV-Ref prompt generation failed after ${maxRetries} attempts: ${lastError.message}`);
}

function parseRefPrompt(content) {
  // Match the [Video Prompt] block. Be lenient about markdown bolding and code fences.
  const regex = /\*?\*?\[Video Prompt\]\*?\*?[^\n]*\n+Prompt:\s*(.+?)(?=\n\n|```|$)/s;
  const m = content.match(regex);
  return m ? m[1].trim() : null;
}

module.exports = { generateRefVideoStoryboard };
