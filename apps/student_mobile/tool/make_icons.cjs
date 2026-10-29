// Renders the Mithra mark (apps/campus_web/src/components/Logo.tsx) into the
// Android launcher icons. Run after changing the logo:
//   node tool/make_icons.cjs
// Uses sharp from the website's node_modules (npm install in apps/campus_web).
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(path.resolve(__dirname, '../../campus_web/node_modules/sharp'));

const RES = path.resolve(__dirname, '../android/app/src/main/res');
const INK = '#1d1a16';

// The mark on its 40x40 grid, as in Logo.tsx: roof (saffron) over a doorway (mint).
const mark = `
  <circle cx="20" cy="20" r="16.2" fill="none" stroke="#f3eada" stroke-width="1.4"/>
  <path d="M10.5 26.5V16.2L20 11l9.5 5.2v10.3" fill="none" stroke="#f1bd3b" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M15.5 26.5v-6h9v6" fill="none" stroke="#56b49c" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="20" cy="16" r="1.9" fill="#ee7a22"/>`;

// Legacy icon (Android 7 and older launchers): the full round badge.
const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="19" fill="${INK}"/>${mark}</svg>`;

// Adaptive icon foreground: a 108dp layer of which only the middle 66dp is
// always visible, so the ring (radius ~17 on the 40 grid) is scaled to 33dp.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <g transform="translate(54 54) scale(1.94) translate(-20 -20)">${mark}</g></svg>`;

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

(async () => {
  for (const [d, k] of Object.entries(densities)) {
    const dir = path.join(RES, `mipmap-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    await sharp(Buffer.from(round), { density: 72 * 48 * k / 40 * 4 }).resize(48 * k, 48 * k).png().toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(Buffer.from(foreground), { density: 72 * 108 * k / 108 * 4 }).resize(108 * k, 108 * k).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }
  // 512 px badge for the website's download page.
  const web = path.resolve(__dirname, '../../campus_web/public/downloads');
  fs.mkdirSync(web, { recursive: true });
  await sharp(Buffer.from(round), { density: 72 * 512 / 40 * 2 }).resize(512, 512).png().toFile(path.join(web, 'campus-mithra-icon.png'));
  console.log('icons written to', RES);
})();
