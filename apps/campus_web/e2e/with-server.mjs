// Starts `next start` (the emulator build), waits until it answers, runs the
// smoke test, then stops the server it started - and only that process.
import { spawn } from 'node:child_process';

const PORT = 3000;
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { stdio: ['ignore', 'ignore', 'inherit'], detached: true });
const stop = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stop);

for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 1000));
}
// SMOKE picks another test file (the Flutter app's tool/web_smoke.cjs uses this server too).
const test = spawn('node', [process.env.SMOKE ?? 'e2e/smoke.mjs'], { stdio: 'inherit' });
test.on('exit', (code) => { stop(); process.exit(code ?? 1); });
