const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const MODEL_CONFIGS_PATH = path.join(__dirname, 'model-configs.json');

function getClaudeCliConfig() {
  const raw = fs.readFileSync(MODEL_CONFIGS_PATH, 'utf-8');
  const configs = JSON.parse(raw);
  return configs.claude_cli || { model: 'sonnet', timeout: 120000, max_retries: 3 };
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const buffer = await res.buffer();
  fs.writeFileSync(destPath, buffer);
}

function runClaudeCLI(systemPrompt, userPrompt) {
  const cliConfig = getClaudeCliConfig();
  
  // Write system prompt to temp file to avoid arg length issues
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const sysPromptFile = path.join(tempDir, `sys-prompt-${Date.now()}.txt`);
  fs.writeFileSync(sysPromptFile, systemPrompt, 'utf-8');

  const args = [
    '-p',
    '--output-format', 'text',
    '--append-system-prompt-file', sysPromptFile,
    '--model', cliConfig.model
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    // Write prompt to stdin then close it
    child.stdin.write(userPrompt);
    child.stdin.end();

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude CLI timed out after ${cliConfig.timeout || 120000}ms`));
    }, cliConfig.timeout || 120000);

    child.on('close', (code) => {
      clearTimeout(timer);
      try { fs.unlinkSync(sysPromptFile); } catch (_) {}
      
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}\nstderr: ${stderr}`));
        return;
      }
      resolve(stdout);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      try { fs.unlinkSync(sysPromptFile); } catch (_) {}
      reject(new Error(`Claude CLI spawn error: ${err.message}`));
    });
  });
}

async function understandModelImage(config, imageUrl, productDesc) {
  const systemPrompt = `You are an expert fashion videographer analyzing e-commerce model images.
Analyze the provided image and extract:
1. Model appearance (pose, expression, body position)
2. Clothing details (fit, fabric, key features visible)
3. Scene/background (environment, props, setting)
4. Lighting conditions (type, direction, mood)
5. Camera angle and framing
6. Product category and recommended showcase actions for video

Format your response as structured JSON with these exact keys:
{
  "model": {
    "pose": "description of pose",
    "expression": "facial expression",
    "position": "body position in frame"
  },
  "clothing": {
    "type": "specific garment type (e.g. maxi dress, cargo pants, bomber jacket, knit sweater, pleated skirt)",
    "fit": "how the clothing fits",
    "fabric": "visible fabric characteristics",
    "keyFeatures": ["feature1", "feature2", ...],
    "highlightAreas": ["the 2-3 most visually striking areas to showcase, e.g. neckline, waist belt, pocket detail, embroidery, zipper"]
  },
  "scene": {
    "environment": "location/setting description",
    "background": "background details",
    "props": "any props or elements"
  },
  "lighting": {
    "type": "lighting type (natural, studio, etc)",
    "direction": "light direction",
    "mood": "lighting mood/atmosphere"
  },
  "camera": {
    "angle": "camera angle",
    "framing": "shot framing (wide, medium, close)"
  },
  "videoActions": {
    "shot1_action": "recommended model action for establishing shot based on this specific product (e.g. spinning to show dress flow, walking to show pants drape, unzipping jacket)",
    "shot2_details": ["2-3 specific detail areas to focus on with close-up, based on visible product features"],
    "shot2_handActions": ["2-3 specific hand interactions suited to this product (e.g. running fingers along embroidery, pulling stretchy waistband, flipping collar, sliding zipper)"],
    "shot3_action": "recommended closing pose/action that best shows the complete look of this specific product"
  }
}

IMPORTANT: Return ONLY the JSON object, no markdown fencing, no extra text.`;

  const userMessage = `Product Description: ${productDesc}

Please analyze this model image and provide the structured analysis.`;

  // Download image to temp file
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const tempImage = path.join(tempDir, `claude-img-${Date.now()}.jpg`);

  const cliConfig = getClaudeCliConfig();
  const maxRetries = cliConfig.max_retries || 3;
  let lastError;

  try {
    console.log('[Claude CLI] Downloading image...');
    await downloadImage(imageUrl, tempImage);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Claude CLI] Analyzing image (attempt ${attempt}/${maxRetries})...`);
        const fullPrompt = `Analyze the image file at ${tempImage}\n\n${userMessage}`;
        const content = await runClaudeCLI(systemPrompt, fullPrompt);

        // Parse JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);
          return analysis;
        } else {
          throw new Error('Claude CLI did not return valid JSON');
        }

      } catch (err) {
        lastError = err;
        console.error(`[Claude CLI] Attempt ${attempt}/${maxRetries} failed:`, err.message);

        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt - 1) * 1000;
          console.log(`[Claude CLI] Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw new Error(`Claude CLI image analysis failed after ${maxRetries} attempts: ${lastError.message}`);
  } finally {
    // Clean up temp image
    try { fs.unlinkSync(tempImage); } catch (_) {}
  }
}

module.exports = { understandModelImage, runClaudeCLI, getClaudeCliConfig };