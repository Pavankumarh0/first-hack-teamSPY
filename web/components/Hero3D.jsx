'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * The walk through the gate, told on white.
 *
 * The page theme is paper white, so the scene opens in dense white morning mist
 * rather than in the dark: you can just make out a student and a gate. As she
 * walks through, the mist thins and the campus arrives in colour. The background
 * never goes dark, so the canvas sits inside a white page without a seam.
 */

const CAPTIONS = [
  [0.0, 'A new chapter is about to begin.'],
  [2.4, 'Every great journey starts with one step.'],
  [5.2, 'Beyond this gate, your campus is waiting.'],
  [8.2, 'Welcome to campus life.'],
  [11.4, 'Meet Mithra. Ask it anything.'],
];

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

export default function Hero3D({ onReady }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const flashRef = useRef(null);
  const restartRef = useRef(null);
  const [caption, setCaptionText] = useState(CAPTIONS[0][1]);
  const [fading, setFading] = useState(false);
  const [showCta, setShowCta] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const MIST = new THREE.Color('#ffffff');
    const DAY = new THREE.Color('#fdf5e8');
    scene.background = MIST.clone();
    scene.fog = new THREE.FogExp2(MIST.clone(), 0.085);

    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 260);

    const hemi = new THREE.HemisphereLight('#ffffff', '#d8d2c4', 1.5);
    const sun = new THREE.DirectionalLight('#ffe6bd', 0.25);
    sun.position.set(-14, 20, -18);
    scene.add(hemi, sun);

    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.88, ...o });
    const add = (g, m, x, y, z, parent = scene) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };

    // ---- ground and path ----------------------------------------------------
    const groundM = M('#ece7dc');
    const ground = add(new THREE.CircleGeometry(160, 48), groundM, 0, 0, -20);
    ground.rotation.x = -Math.PI / 2;

    const pathM = M('#ddd4c2');
    const path = add(new THREE.PlaneGeometry(3, 130), pathM, 0, 0.02, -30);
    path.rotation.x = -Math.PI / 2;
    for (let z = 14; z > -52; z -= 3) {
      const slab = add(new THREE.BoxGeometry(0.9, 0.04, 0.9), pathM, 0, 0.04, z);
      slab.position.x = ((z * 7) % 5) / 10 - 0.2;
    }

    // ---- gate ---------------------------------------------------------------
    const portal = new THREE.Group();
    scene.add(portal);
    const ringM = new THREE.MeshStandardMaterial({
      color: '#f08a24', emissive: '#f08a24', emissiveIntensity: 0.35,
      metalness: 0.35, roughness: 0.35,
    });
    add(new THREE.TorusGeometry(2.4, 0.16, 24, 96), ringM, 0, 2.6, 0, portal);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.7, 2.6, 0.7), M('#efe6d2'), s * 2.4, 1.3, 0, portal);
      add(new THREE.BoxGeometry(0.9, 0.25, 0.9), M('#d9ccb0'), s * 2.4, 0.12, 0, portal);
    }

    // The doorway itself: a slow teal/saffron swirl. On white it has to be drawn
    // with normal blending, additive would simply disappear into the page.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.3, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uFade: { value: 1 } },
        vertexShader: `varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uTime, uPower, uFade;
          void main(){
            vec2 p = vUv * 2.0 - 1.0;
            float r = length(p), a = atan(p.y, p.x);
            float s = sin(a * 5.0 + r * 9.0 - uTime * (1.2 + uPower * 2.6)) * 0.5 + 0.5;
            vec3 teal = vec3(0.059, 0.608, 0.557);
            vec3 saff = vec3(0.941, 0.541, 0.141);
            vec3 c = mix(teal, saff, s * (0.35 + 0.65 * r));
            c = mix(vec3(1.0), c, 0.35 + 0.65 * uPower);   // pale while still misty
            float alpha = smoothstep(1.0, 0.82, r) * uFade * (0.30 + 0.60 * uPower);
            gl_FragColor = vec4(c, alpha);
          }`,
      })
    );
    disc.position.y = 2.6;
    portal.add(disc);

    const gateLight = new THREE.PointLight('#f0a24a', 0, 16);
    gateLight.position.set(0, 2.6, 1.5);
    scene.add(gateLight);

    // ---- the campus, waiting in the mist ------------------------------------
    const world = new THREE.Group();
    world.position.z = -26;
    scene.add(world);

    const cream = M('#fffaf0');
    const brick = M('#e0855f');
    const sky = M('#9cc4e4');
    const win = new THREE.MeshStandardMaterial({
      color: '#ffe9a8', emissive: '#f3c969', emissiveIntensity: 0.35,
    });

    add(new THREE.BoxGeometry(16, 5, 6), cream, 0, 2.5, 0, world);
    for (let i = -3; i <= 3; i++) {
      add(new THREE.CylinderGeometry(0.25, 0.25, 5), M('#ffffff'), i * 2.1, 2.5, 3.3, world);
    }
    add(new THREE.BoxGeometry(4, 11, 4), cream, 0, 5.5, 0, world);
    add(
      new THREE.SphereGeometry(2.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      M('#c75b3e'), 0, 11, 0, world
    );
    add(new THREE.CylinderGeometry(0.04, 0.04, 2.4), M('#b9b2a2'), 0, 14, 0, world);
    add(new THREE.BoxGeometry(1.2, 0.7, 0.05), M('#f08a24'), 0.6, 14.9, 0, world);
    add(new THREE.CircleGeometry(1, 32), win, 0, 9, 2.02, world);
    for (let r = 0; r < 2; r++) {
      for (let c = -6; c <= 6; c++) {
        if (Math.abs(c) > 1) {
          add(new THREE.PlaneGeometry(0.8, 1.1), win, c * 1.15, 1.8 + r * 1.8, 3.02, world);
        }
      }
    }
    add(new THREE.BoxGeometry(12, 6, 6), brick, -20, 3, 6, world);
    add(new THREE.BoxGeometry(12, 7, 6), sky, 20, 3.5, 6, world);

    add(new THREE.CylinderGeometry(2.2, 2.4, 0.7, 32), M('#e3e7ee'), 0, 0.35, 14, world);
    add(new THREE.CylinderGeometry(0.2, 0.3, 2.6), M('#e3e7ee'), 0, 1.6, 14, world);

    const tree = (x, z, h = 1) => {
      add(new THREE.CylinderGeometry(0.15, 0.2, 1.2 * h), M('#8a6a4a'), x, 0.6 * h, z, world);
      add(new THREE.ConeGeometry(1.1 * h, 2.6 * h, 8), M('#4e9a57'), x, 2.4 * h, z, world);
      add(new THREE.ConeGeometry(0.85 * h, 2 * h, 8), M('#5fae65'), x, 3.5 * h, z, world);
    };
    for (let i = 0; i < 34; i++) {
      const s = i % 2 ? 1 : -1;
      tree(s * (5 + Math.random() * 26), 8 + Math.random() * 34, 0.8 + Math.random() * 0.7);
    }
    for (const x of [-60, -25, 30, 70]) {
      add(new THREE.SphereGeometry(30, 24, 12), M('#9fc08c'), x, -14, -70, world);
    }

    const clouds = [];
    for (let i = 0; i < 7; i++) {
      const c = add(
        new THREE.SphereGeometry(4, 16, 8),
        new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, transparent: true, opacity: 0 }),
        -80 + i * 28, 34 + Math.random() * 10, -110
      );
      c.scale.set(2.6, 0.7, 1);
      clouds.push(c);
    }

    // ---- motes: warm dust in the light, kept dark enough to read on white ----
    const N = 360;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos.set([(Math.random() - 0.5) * 40, Math.random() * 9, 14 - Math.random() * 70], i * 3);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({
      color: '#c8a16a', size: 0.11, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const dust = new THREE.Points(pg, pm);
    scene.add(dust);

    // ---- the student, and Mithra the companion orb --------------------------
    const stu = new THREE.Group();
    scene.add(stu);
    const body = new THREE.Group();
    stu.add(body);
    add(new THREE.CapsuleGeometry(0.3, 0.55, 6, 16), M('#f08a24'), 0, 1.35, 0, body);
    add(new THREE.SphereGeometry(0.26, 24, 16), M('#dba883'), 0, 2.1, 0, body);
    add(
      new THREE.SphereGeometry(0.28, 24, 12, 0, Math.PI * 2, 0, Math.PI / 1.9),
      M('#2a1f1b'), 0, 2.14, -0.02, body
    );
    add(new THREE.BoxGeometry(0.5, 0.62, 0.24), M('#0f9b8e'), 0, 1.4, -0.32, body);

    const limb = (x, y, len, col, r) => {
      const g = new THREE.Group();
      g.position.set(x, y, 0);
      add(new THREE.CylinderGeometry(r, r * 0.9, len), M(col), 0, -len / 2, 0, g);
      body.add(g);
      return g;
    };
    const legL = limb(-0.14, 0.95, 0.9, '#2b3166', 0.1);
    const legR = limb(0.14, 0.95, 0.9, '#2b3166', 0.1);
    const armL = limb(-0.42, 1.7, 0.7, '#f08a24', 0.08);
    const armR = limb(0.42, 1.7, 0.7, '#f08a24', 0.08);
    stu.rotation.y = Math.PI;

    const orb = new THREE.Group();
    scene.add(orb);
    add(
      new THREE.SphereGeometry(0.2, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#0f9b8e', emissive: '#0f9b8e', emissiveIntensity: 0.55 }),
      0, 0, 0, orb
    );
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.035), new THREE.MeshBasicMaterial({ color: '#ffffff' }), s * 0.07, 0.03, 0.18, orb);
    }
    orb.add(new THREE.PointLight('#0f9b8e', 0.8, 6));

    // ---- timeline -----------------------------------------------------------
    let t = 0;
    let T = 0;
    let capIndex = -1;
    let phase = 0;
    let flashed = false;

    const COLD_GROUND = new THREE.Color('#ece7dc');
    const WARM_GROUND = new THREE.Color('#bfd9a4');
    const COLD_PATH = new THREE.Color('#ddd4c2');
    const WARM_PATH = new THREE.Color('#ecd9b2');

    // Cross-fades the caption: fade the old line out, swap the text, fade in.
    function applyCaption(i) {
      if (i === capIndex) return;
      const first = capIndex === -1;
      capIndex = i;
      if (first) {
        setCaptionText(CAPTIONS[i][1]);
        return;
      }
      setFading(true);
      window.setTimeout(() => {
        setCaptionText(CAPTIONS[i][1]);
        setFading(false);
      }, 420);
    }

    function frame(dt) {
      T += dt;
      t += dt;

      const zs = Math.max(-16, 11 - 2.15 * Math.max(0, t - 1.5));
      const walking = t > 1.5 && zs > -16;
      const power = ease(clamp((t - 1.5) / 4.9));
      const cross = 1.5 + 11 / 2.15;
      const w = ease(clamp((t - cross) / 3));            // 0 = mist, 1 = full day

      stu.position.z = zs;
      if (walking) phase += dt * 7.5;
      const sw = walking ? Math.sin(phase) * 0.65 : 0;
      legL.rotation.x = sw;
      legR.rotation.x = -sw;
      armL.rotation.x = -sw * 0.8;
      armR.rotation.x = sw * 0.8;
      body.position.y = walking ? Math.abs(Math.sin(phase)) * 0.06 : 0;
      if (!walking && t > cross) armR.rotation.z = -2.5 + Math.sin(T * 6) * 0.3;

      orb.position.set(0.75, 2.5 + Math.sin(T * 2.2) * 0.1, zs + 0.2 + Math.sin(T * 1.3) * 0.1);

      disc.material.uniforms.uTime.value = T;
      disc.material.uniforms.uPower.value = power;
      disc.material.uniforms.uFade.value = 1 - ease(clamp((t - cross - 0.35) / 0.9));
      ringM.emissiveIntensity = 0.35 + power * 0.55 + Math.sin(T * 5) * 0.08 * power;
      gateLight.intensity = power * 1.6;

      if (!flashed && t > cross - 0.15) {
        flashed = true;
        flashRef.current?.animate(
          [{ opacity: 0 }, { opacity: 0.9 }, { opacity: 0 }],
          { duration: 1100, easing: 'ease-out' }
        );
      }

      // the mist burns off
      scene.background.lerpColors(MIST, DAY, w);
      scene.fog.color.copy(scene.background);
      scene.fog.density = lerp(0.085, 0.0115, w);
      // keep a generous fill at full day, otherwise the cream facades that face
      // away from the sun render grey against a white page
      hemi.intensity = lerp(1.5, 1.45, w);
      sun.intensity = lerp(0.25, 1.8, w);
      groundM.color.lerpColors(COLD_GROUND, WARM_GROUND, w);
      pathM.color.lerpColors(COLD_PATH, WARM_PATH, w);
      clouds.forEach((c, i) => {
        c.material.opacity = w * 0.9;
        c.position.x += dt * (1.2 + i * 0.1);
        if (c.position.x > 90) c.position.x = -90;
      });
      pm.opacity = lerp(0.25, 0.6, w);
      dust.position.y = Math.sin(T * 0.5) * 0.25;
      dust.rotation.y = T * 0.02;

      // camera: follow her, then lift and swing round the campus
      const a = ease(clamp((t - 5) / 2));
      const b = ease(clamp((t - 9) / 4.5));
      cam.position.set(
        lerp(3.4, 0, a) + b * 7.5,
        lerp(2.3, 2.9, a) + b * 3.6,
        zs + lerp(6.2, 6.8, a) + b * 4
      );
      cam.lookAt(0, 1.7 + b * 1.2, zs - 3 - b * 3);

      let k = 0;
      CAPTIONS.forEach((c, i) => { if (t >= c[0]) k = i; });
      applyCaption(k);
      setShowCta(t > 10.4);
    }

    function size() {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.fov = w < h ? 72 : 50;
      cam.updateProjectionMatrix();
    }
    size();
    window.addEventListener('resize', size, { passive: true });

    restartRef.current = () => {
      t = 0; capIndex = -1; flashed = false; phase = 0; armR.rotation.z = 0;
    };

    if (reduce) {
      t = 15;
      capIndex = -1;
    }

    let visible = true;
    const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; });
    io.observe(host);

    let last = performance.now();
    renderer.setAnimationLoop((now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      frame(dt);
      renderer.render(scene, cam);
    });

    onReady?.();

    return () => {
      renderer.setAnimationLoop(null);
      io.disconnect();
      window.removeEventListener('resize', size);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
    };
    // onReady is only ever a stable callback from the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={hostRef} className="hero">
      <canvas ref={canvasRef} className="hero-canvas" />
      <div ref={flashRef} className="hero-flash" aria-hidden="true" />
      <div className="hero-stage">
        <h1 className={`hero-cap${fading ? ' out' : ''}`} aria-live="polite">
          {caption}
        </h1>
        <div className={`hero-cta${showCta ? ' on' : ''}`}>
          <a className="btn btn-primary" href="/kiosk/">
            <span aria-hidden="true">&#127908;</span> Talk to Mithra
          </a>
          <a className="btn btn-ghost" href="#answers">
            See what it answers
          </a>
        </div>
      </div>
      <button
        type="button"
        className="hero-replay"
        onClick={() => restartRef.current?.()}
      >
        Replay the walk
      </button>
    </div>
  );
}
