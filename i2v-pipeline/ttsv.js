const fs = require('fs');
const path = require('path');
const { runClaudeCLI, getClaudeCliConfig } = require('./claude');

const SKILL_PATH = path.join(__dirname, '../skills/ttsv/SKILL.md');

async function generateVideoStoryboard(config, imageAnalysis, productDesc, modelKey) {
  // Load TTSV skill content
  const ttsvSkill = fs.readFileSync(SKILL_PATH, 'utf-8');

  // Extract the skill content after the frontmatter
  const skillContent = ttsvSkill.split('---').slice(2).join('---').trim();

  const systemPrompt = skillContent;

  // Get shot durations from model config
  const MODEL_CONFIGS = require('./model-configs.json');
  const shotDurations = (modelKey && MODEL_CONFIGS[modelKey]?.shot_durations) || [1, 5, 2];
  const totalShotDuration = shotDurations.reduce((a, b) => a + b, 0);

  const isMinimalDesc = !productDesc || productDesc.length < 30;
  const productSection = isMinimalDesc
    ? `Product info (title only, limited detail available):
${productDesc || 'N/A'}

NOTE: Product description is minimal. Rely heavily on the image analysis (especially "clothing" and "videoActions" fields) to determine product type, features, and appropriate showcase actions.`
    : `Product description:
${productDesc}`;

  const userMessage = `I need to create a video storyboard for a fashion product.

First-frame analysis:
${JSON.stringify(imageAnalysis, null, 2)}

${productSection}

IMPORTANT: The first-frame analysis contains "clothing.highlightAreas" with the key visual areas to showcase. Shot 1 should be a minimal flash establishing shot (${shotDurations[0]}s, no complex action). Shot 2 MUST use intense hand-guided actions (pulling, tugging, stretching fabric) to showcase every highlightArea — hands must be bold, fast, and exaggerated. Shot 3 uses "videoActions.shot3_action" for the closing pose.

Please generate a 3-shot video storyboard following the TTSV format. The video should be ${totalShotDuration} seconds total: Shot 1 (${shotDurations[0]}s), Shot 2 (${shotDurations[1]}s), Shot 3 (${shotDurations[2]}s).`;

  const cliConfig = getClaudeCliConfig();
  const maxRetries = cliConfig.max_retries || 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[TTSV] Generating storyboard via Claude CLI (attempt ${attempt}/${maxRetries})...`);
      const content = await runClaudeCLI(systemPrompt, userMessage);

      // Parse the storyboard shots
      const shots = parseStoryboard(content, shotDurations);

      if (shots.length === 0) {
        throw new Error('No shots parsed from storyboard');
      }

      // Update durations in fullStoryboard text
      let updatedContent = content;
      const totalDuration = shots.reduce((sum, shot) => sum + shot.duration, 0);
      shots.forEach(shot => {
        const regex = new RegExp(`(\\[Shot ${shot.shotNumber}\\][^\\n]*?)\\d+s`, 'g');
        updatedContent = updatedContent.replace(regex, `$1${shot.duration}s`);
      });
      updatedContent = updatedContent.replace(/Total:\s*\d+s/g, `Total: ${totalDuration}s`);
      updatedContent = updatedContent.replace(/\*\*Total Duration\*\*:\s*\d+\s*seconds?/g, `**Total Duration**: ${totalDuration}s`);

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

function parseStoryboard(content, shotDurations) {
  const shots = [];
  const fixedDurations = shotDurations || [1, 5, 2];

  // Match shot patterns like [Shot 1 — Hook] — 4s or **[Shot 1]** 3s
  const shotRegex = /\*?\*?\[Shot\s+(\d+)[^\]]*\]\*?\*?[^\n]*?(\d+)s[^\n]*\n+Prompt:\s*(.+?)(?=\n\n\*?\*?\[Shot|\n\n```|\n\n---|\n\n##|$)/gs;

  let match;
  while ((match = shotRegex.exec(content)) !== null) {
    const shotIndex = shots.length;
    shots.push({
      shotNumber: parseInt(match[1]),
      duration: fixedDurations[shotIndex] || parseInt(match[2]),
      prompt: match[3].trim()
    });
  }

  return shots;
}

module.exports = { generateVideoStoryboard };