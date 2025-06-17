const { spawn } = require('child_process');
const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Write-Output "Hello from PowerShell"']);

ps.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

ps.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

ps.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
});

const psVersion = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion']);
psVersion.stdout.on('data', (data) => {
  console.log('Backend PowerShell version:', data.toString());
});

const versionResult = await this.executeCommand('$PSVersionTable.PSVersion | ConvertTo-Json');
console.log('PowerShell version for', moduleName, ':', versionResult.output);

const pathResult = await this.executeCommand('$env:PSModulePath');
console.log('PowerShell module path for', moduleName, ':', pathResult.output);