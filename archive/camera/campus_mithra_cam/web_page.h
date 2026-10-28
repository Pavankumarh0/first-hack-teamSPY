#pragma once
#include <Arduino.h>

// The live-view page served at "/". The OV7670 has no JPEG encoder, so the
// page fetches raw frames from /frame (the bytes exactly as they came off the
// camera bus, size and format in X-Width / X-Height / X-Format headers) and
// draws them on a canvas itself. That keeps the ESP32 free of an encoder and
// its memory, which a board without PSRAM cannot spare.

static const char WEB_PAGE[] PROGMEM = R"rawliteral(<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mithra Camera</title>
<style>
:root{--bg:#0b1020;--card:#151c33;--line:#26304f;--text:#eef1f8;--dim:#93a0bd;--saff:#f08a24;--teal:#0f9b8e;--bad:#e5484d}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:4px 0 12px;display:flex;align-items:center;gap:10px}
h1 i{width:10px;height:10px;border-radius:50%;background:var(--dim);display:inline-block}
h1 i.live{background:var(--teal);box-shadow:0 0 8px var(--teal)}
h1 i.err{background:var(--bad)}
.view{background:#000;border:1px solid var(--line);border-radius:12px;overflow:hidden;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center}
canvas{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
#stats{color:var(--dim);font-variant-numeric:tabular-nums;margin:8px 2px;min-height:21px}
#msg{color:var(--bad);margin:4px 2px;min-height:21px}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}
button,select{font:inherit;color:var(--text);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 12px;cursor:pointer}
button.on{background:var(--saff);border-color:var(--saff);color:#1a1000}
button:disabled,select:disabled{opacity:.5;cursor:default}
label{display:flex;gap:6px;align-items:center;color:var(--dim)}
</style></head><body><main>
<h1><i id="dot"></i>Campus Mithra camera</h1>
<div class="view"><canvas id="c" width="160" height="120"></canvas></div>
<div id="stats">connecting...</div>
<div id="msg"></div>
<div class="row">
  <button id="play" class="on">Pause</button>
  <button id="snap">Save picture</button>
  <button id="bars">Colour bars</button>
</div>
<div class="row">
  <select id="res" title="Frame size"><option>QQVGA</option><option>QCIF</option><option>QVGA</option></select>
  <select id="fmt" title="Pixel format"><option>RGB565</option><option>YUV422</option><option>GRAY</option></select>
  <label><input type="checkbox" id="swap"> swap bytes (if colours look wrong)</label>
</div>
</main>
<script>
const $ = id => document.getElementById(id);
const cv = $('c'), cx = cv.getContext('2d');
let playing = true, busy = false, img = null, times = [], bytes = 0;

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function draw(buf, w, h, fmt, swap) {
  const b = new Uint8Array(buf);
  if (cv.width !== w || cv.height !== h || !img) { cv.width = w; cv.height = h; img = cx.createImageData(w, h); }
  const d = img.data, n = w * h;
  if (fmt === 'GRAY') {
    for (let i = 0; i < n; i++) { const y = b[i]; d[4*i] = d[4*i+1] = d[4*i+2] = y; d[4*i+3] = 255; }
  } else if (fmt === 'RGB565') {
    for (let i = 0; i < n; i++) {
      const v = swap ? (b[2*i+1] << 8 | b[2*i]) : (b[2*i] << 8 | b[2*i+1]);
      const r = v >> 11 & 31, g = v >> 5 & 63, bl = v & 31;
      d[4*i] = r << 3 | r >> 2; d[4*i+1] = g << 2 | g >> 4; d[4*i+2] = bl << 3 | bl >> 2; d[4*i+3] = 255;
    }
  } else if (fmt === 'YUV422') {
    // Y U Y V per two pixels; swapping each byte pair gives U Y V Y.
    for (let p = 0; p < n; p += 2) {
      const o = 2 * p;
      let y0 = b[o], u = b[o+1], y1 = b[o+2], v = b[o+3];
      if (swap) { u = b[o]; y0 = b[o+1]; v = b[o+2]; y1 = b[o+3]; }
      u -= 128; v -= 128;
      const dr = 1.402 * v, dg = -0.344 * u - 0.714 * v, db = 1.772 * u;
      for (const [k, y] of [[p, y0], [p + 1, y1]]) {
        d[4*k] = clamp(y + dr); d[4*k+1] = clamp(y + dg); d[4*k+2] = clamp(y + db); d[4*k+3] = 255;
      }
    }
  } else { throw new Error('unknown format ' + fmt); }
  cx.putImageData(img, 0, 0);
}

// A request the camera never answers (it is busy restarting, or the phone sent
// it over mobile data because the camera's hotspot has no internet) would
// otherwise leave the page on "connecting..." forever.
async function fetchT(url, opts = {}, ms = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, cache: 'no-store', signal: ctl.signal }); }
  catch (e) {
    if (e.name === 'AbortError')
      throw new Error(`the camera did not answer for ${ms / 1000} s - it may be busy restarting; ` +
                      'on a phone, turn mobile data off');
    throw e;
  } finally { clearTimeout(t); }
}

function setState(cls, text) { $('dot').className = cls; $('msg').textContent = text || ''; }

async function tick() {
  if (!playing || busy) return;
  busy = true;
  const t0 = performance.now();
  try {
    const r = await fetchT('/frame');
    if (!r.ok) throw new Error((await r.text()) || ('HTTP ' + r.status));
    const w = +r.headers.get('X-Width'), h = +r.headers.get('X-Height'), fmt = r.headers.get('X-Format');
    const buf = await r.arrayBuffer();
    draw(buf, w, h, fmt, $('swap').checked);
    const now = performance.now();
    times.push(now); bytes += buf.byteLength;
    while (times.length && now - times[0] > 3000) times.shift();
    const fps = times.length > 1 ? (times.length - 1) * 1000 / (now - times[0]) : 0;
    $('stats').textContent = `${w}x${h} ${fmt} | ${fps.toFixed(1)} fps | ${Math.round(now - t0)} ms per frame`;
    setState(playing ? 'live' : '');
  } catch (e) {
    setState('err', 'No picture: ' + e.message + ' - retrying');
    await new Promise(r => setTimeout(r, 1000));
  }
  busy = false;
  if (playing) requestAnimationFrame(tick);
}

async function status() {
  try {
    const s = await (await fetchT('/status', {}, 5000)).json();
    $('res').value = s.res; $('fmt').value = s.fmt;
    $('bars').classList.toggle('on', s.bars);
    if (!s.running) setState('err', 'Camera stopped: ' + (s.error || 'see the serial log'));
    return s;
  } catch (e) { setState('err', 'No answer from the camera: ' + e.message); return null; }
}

async function cmd(c) {
  for (const el of ['res', 'fmt', 'bars']) $(el).disabled = true;
  const wasPlaying = playing; playing = false;
  while (busy) await new Promise(r => setTimeout(r, 20));
  $('msg').textContent = 'Restarting the camera... (can take up to 30 s)';
  try { await fetchT('/cmd?c=' + encodeURIComponent(c), { method: 'POST' }, 45000); }
  catch (e) { setState('err', 'No answer from the camera: ' + e.message); }
  await status();
  for (const el of ['res', 'fmt', 'bars']) $(el).disabled = false;
  playing = wasPlaying; times = [];
  if (playing) tick();
}

$('play').onclick = () => {
  playing = !playing;
  $('play').textContent = playing ? 'Pause' : 'Play';
  $('play').classList.toggle('on', playing);
  if (playing) tick(); else $('dot').className = '';
};
$('snap').onclick = () => cv.toBlob(b => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'mithra-cam-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
  a.click();
});
$('bars').onclick = () => cmd('BARS ' + ($('bars').classList.contains('on') ? '0' : '1'));
$('res').onchange = () => cmd('RES ' + $('res').value);
$('fmt').onchange = () => cmd('FMT ' + $('fmt').value);

status().then(tick);
</script></body></html>
)rawliteral";
