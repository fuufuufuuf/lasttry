const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MODEL_CONFIGS_PATH = path.join(__dirname, 'model-configs.json');

function getClaudeCliConfig() {
  const raw = fs.readFileSync(MODEL_CONFIGS_PATH, 'utf-8');
  const configs = JSON.parse(raw);
  return configs.claude_cli || { model: 'sonnet', timeout: 120000, max_retries: 3 };
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

module.exports = { runClaudeCLI, getClaudeCliConfig };