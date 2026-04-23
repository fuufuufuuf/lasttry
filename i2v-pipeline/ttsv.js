const fs = require('fs');
const path = require('path');
const { runClaudeCLI, getClaudeCliConfig } = require('./claude');

const SKILL_PATH = path.join(__dirname, '../skills/ttsv/SKILL.md');

async function generateVideoStoryboard(config, productDesc, modelKey) {
  // Load TTSV skill content
  const ttsvSkill = fs.readFileSync(SKILL_PATH, 'utf-8');

  // Extract the skill content after the frontmatter
  const skillContent = ttsvSkill.split('---').slice(2).join('---').trim();

  const systemPrompt = skillContent;

  // Get shot durations from model config
  const MODEL_CONFIGS = require('./model-configs.json');
  const shotDurations = (modelKey && MODEL_CONFIGS[modelKey]?.shot_durations) || [4, 4];
  const totalShotDuration = shotDurations.reduce((a, b) => a + b, 0);

  const shotList = shotDurations.map((d, i) => `Shot ${i + 1} = ${d}s`).join(', ');

  const userMessage = `Product description:
${productDesc}

Generate the storyboard per the skill. Per-shot durations: ${shotList}. Total: ${totalShotDuration}s.`;

  const cliConfig = getClaudeCliConfig();
  const maxRetries = cliConfig.max_retries || 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[TTSV] Generating storyboard via Claude CLI (attempt ${attempt}/${maxRetries})...`);
      const rawContent = await runClaudeCLI(systemPrompt, userMessage);

      // Defensive double-check: strip anything that isn't a [Shot N] + Prompt block.
      // Claude occasionally leaks analysis/headings/commentary despite the skill's output rules.
      const content = filterStoryboard(rawContent);
      const stripped = rawContent.trim().length - content.length;
      if (stripped > 0) {
        console.log(`[TTSV] Filtered ${stripped} chars of non-storyboard content`);
      }

      // Parse the storyboard shots
      const shots = parseStoryboard(content, shotDurations);

      if (shots.length === 0) {
        throw new Error('No shots parsed from storyboard');
      }

      // Safety net: align each shot header's duration with the config value in case the model drifted
      let updatedContent = content;
      shots.forEach(shot => {
        const regex = new RegExp(`(\\[Shot ${shot.shotNumber}\\][^\\n]*?)\\d+s`, 'g');
        updatedContent = updatedContent.replace(regex, `$1${shot.duration}s`);
      });

      return {
        fullStoryboard: updatedContent,
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

function filterStoryboard(content) {
  // Keep only `[Shot N ...] — Ns` headers paired with their `Prompt: ...` content.
  // Prompt content may span multiple lines (soft wraps) — absorb continuations until
  // a boundary: blank line, next shot header, code fence, horizontal rule, markdown
  // heading, bold heading, or list item. Everything outside these blocks is dropped.
  // `m` flag is required so `$` matches end-of-line, not just end-of-string.
  const shotBlockRegex = /\*?\*?\[Shot\s+\d+[^\]]*\]\*?\*?[^\n]*\n+Prompt:[^\n]*(?:\n(?![ \t]*$|[ \t]*(?:```|---|#|\*\*|[-*+][ \t])|\s*\*?\*?\[Shot\s+\d+)[^\n]*)*/gm;
  const blocks = content.match(shotBlockRegex) || [];
  return blocks.map(b => b.trimEnd()).join('\n\n');
}

function parseStoryboard(content, shotDurations) {
  const shots = [];

  // Match shot patterns like [Shot 1 — Detail Sweep Part 1] — 3s or **[Shot 2 — Detail Sweep Part 2]** 3s
  const shotRegex = /\*?\*?\[Shot\s+(\d+)[^\]]*\]\*?\*?[^\n]*?(\d+)s[^\n]*\n+Prompt:\s*(.+?)(?=\n\n\*?\*?\[Shot|\n\n```|\n\n---|\n\n##|$)/gs;

  let match;
  while ((match = shotRegex.exec(content)) !== null) {
    const shotIndex = shots.length;
    shots.push({
      shotNumber: parseInt(match[1]),
      duration: shotDurations[shotIndex] || parseInt(match[2]),
      prompt: match[3].trim()
    });
  }

  return shots;
}

module.exports = { generateVideoStoryboard };