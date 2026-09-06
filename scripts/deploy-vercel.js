const { spawn } = require('child_process');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const lines = envContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

const envArgs = [];
for (const line of lines) {
  const idx = line.indexOf('=');
  if (idx !== -1) {
    const key = line.substring(0, idx).trim();
    const val = line.substring(idx + 1).trim();
    if (key && val) {
      envArgs.push('-e', `${key}=${val}`);
      envArgs.push('-b', `${key}=${val}`);
    }
  }
}

if (!lines.some(l => l.startsWith('DEFAULT_TIMEZONE'))) {
  envArgs.push('-e', 'DEFAULT_TIMEZONE=Asia/Kolkata');
  envArgs.push('-b', 'DEFAULT_TIMEZONE=Asia/Kolkata');
}

const args = ['deploy', '--temporary', '--yes', ...envArgs];
console.log('Spawning vercel with arguments count:', args.length);

const proc = spawn('vercel.cmd', args, { stdio: 'inherit', shell: true });
proc.on('close', (code) => {
  console.log('Vercel process exited with code:', code);
  process.exit(code || 0);
});
