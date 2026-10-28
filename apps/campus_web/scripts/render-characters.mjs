// Renders the animated characters (src/characters, Remotion) into the student
// app's assets: a looping animated WebP per character plus a still PNG for
// reduced motion.
//
//   cd apps/campus_web && npm run characters:render
//
// Needs Python 3 with Pillow (WebP support) for the last step. Remotion
// downloads its own headless Chrome unless REMOTION_BROWSER_EXECUTABLE points
// at one.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..');
const out = path.resolve(web, '../student_mobile/assets/characters');
const FPS = 30;
// id in remotion/Root.tsx, file name in the app, still frame (src/characters/index.ts)
const CHARACTERS = [
  ['Mithra', 'mithra', 0],
  ['PhoneQr', 'phone', 58],
  ['MapWalk', 'map', 96],
];

mkdirSync(out, { recursive: true });
const browser = process.env.REMOTION_BROWSER_EXECUTABLE ? ['--browser-executable', process.env.REMOTION_BROWSER_EXECUTABLE] : [];
const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');

for (const [id, file, still] of CHARACTERS) {
  const frames = mkdtempSync(path.join(tmpdir(), `character-${file}-`));
  try {
    console.log(`Rendering ${id} ...`);
    execFileSync('npx', ['remotion', 'render', 'remotion/index.ts', id, frames, '--sequence', '--image-format=png', '--log=error', ...browser],
      { cwd: web, stdio: 'inherit', shell: process.platform === 'win32' });
    execFileSync(python, [path.join(here, 'frames_to_webp.py'), frames, path.join(out, `${file}.webp`), String(FPS), String(still), path.join(out, `${file}.png`)],
      { stdio: 'inherit' });
  } finally {
    rmSync(frames, { recursive: true, force: true });
  }
}
console.log(`Done: ${out}`);
