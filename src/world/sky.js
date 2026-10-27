// Storybook night sky: gradient dome with a sleepy smiling moon, twinkling
// stars, shooting stars, waving aurora ribbons (disco rainbow in party mode),
// soft blue fog and bright moonlight with shadows that follow the player.
//
// createSky(scene) -> { update(dt, time, focus), setParty(bool), setTheme(name), dispose() }
// Sky pieces are drawn "at infinity" (clip z = w), so they never clip against
// the camera's far plane and are always behind the island.

import * as THREE from 'three';
import { createRng } from '../core/rng.js';

const TAU = Math.PI * 2;
const DOME_R = 150;
const STAR_R = 140;
const AURORA_R = 125;
const SHADOW_HALF = 40;
const SHADOW_MAP = 2048;

// Light levels tuned for three's physically based (non-legacy) lighting so the
// night reads clearly. setBrightness(mult) scales them all.
const BASE_INTENSITY = { hemi: 1.2, ambient: 0.8, moon: 1.95, fill: 0.5 };

const PALETTES = {
  classic: {
    top: 0x121a52,
    mid: 0x2f3f94,
    horizon: 0x7686d2, // == fog colour, so distant hills melt into the sky
    glow: 0xd9a6e8,
    moonGlow: 0xc9d4ff,
    hemiSky: 0xa9b9ff,
    hemiGround: 0x6656a6,
    ambient: 0x7480c8,
    moon: 0xe8eeff,
    fill: 0x9fb0ff,
    auroraA: 0x5dffb0,
    auroraB: 0x3fd0ff,
    auroraC: 0xb48cff,
    star: 0xfff8e8,
  },
  candy: {
    top: 0x2f1a63,
    mid: 0x6d45b0,
    horizon: 0xd696d4,
    glow: 0xffc9e6,
    moonGlow: 0xffd6f0,
    hemiSky: 0xffd0ec,
    hemiGround: 0x9a6ab8,
    ambient: 0xb48ad2,
    moon: 0xfff0fa,
    fill: 0xffb8e6,
    auroraA: 0xff8fd8,
    auroraB: 0x8ff7e0,
    auroraC: 0xfff38f,
    star: 0xfff0fb,
  },
};
const PALETTE_KEYS = Object.keys(PALETTES.classic);

// ---------------------------------------------------------------------------
// shaders
// ---------------------------------------------------------------------------

const DOME_VS = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 clip = projectionMatrix * viewMatrix * wp;
  clip.z = clip.w * 0.99999;
  gl_Position = clip;
}`;

const DOME_FS = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uMoonGlow;
uniform vec3 uMoonDir;
uniform vec3 uMoonRight;
uniform vec3 uMoonUp;
uniform float uMoonR;
uniform sampler2D uMoonTex;
uniform float uParty;
uniform float uTime;
varying vec3 vWorld;
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float h = dir.y;
  vec3 col = uHorizon;
  if (h > 0.0) {
    col = mix(uHorizon, uMid, smoothstep(0.0, 0.34, h));
    col = mix(col, uTop, smoothstep(0.28, 0.95, h));
    // soft rosy band just above the horizon (zero at the horizon so fog matches)
    col += uGlow * smoothstep(0.0, 0.05, h) * exp(-h * 9.0) * 0.32;
  }
  // party: gentle colour wash across the upper sky
  vec3 wash = vec3(0.5 + 0.5 * sin(uTime * 1.3), 0.5 + 0.5 * sin(uTime * 1.7 + 2.0), 0.5 + 0.5 * sin(uTime * 1.1 + 4.0));
  col += uParty * 0.07 * wash * smoothstep(0.05, 0.7, h);
  // moon halo and disc
  float md = clamp(dot(dir, uMoonDir), -1.0, 1.0);
  float ang = acos(md);
  float above = smoothstep(0.0, 0.08, h);
  col += uMoonGlow * (0.30 * exp(-ang * 6.0) + 0.45 * exp(-ang * 24.0)) * above;
  if (ang < uMoonR * 1.05) {
    vec2 uv = vec2(dot(dir, uMoonRight), dot(dir, uMoonUp)) / sin(uMoonR) * 0.5 + 0.5;
    vec4 m = texture2D(uMoonTex, uv);
    col = mix(col, m.rgb * 1.08, m.a);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  // a whisper of dither to stop gradient banding
  gl_FragColor.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}`;

const STAR_VS = /* glsl */ `
uniform float uTime;
uniform float uDpr;
uniform float uTwinkle;
attribute float aSize;
attribute float aPhase;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
varying float vFlare;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  clip.z = clip.w * 0.99998;
  gl_Position = clip;
  float tw = 0.65 + 0.35 * sin(uTime * (1.3 + aPhase * 1.7) * uTwinkle + aPhase * 40.0);
  vAlpha = aAlpha * tw;
  vColor = aColor;
  vFlare = smoothstep(3.5, 7.0, aSize);
  gl_PointSize = aSize * uDpr * (0.85 + 0.3 * tw);
}`;

const STAR_FS = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vFlare;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float core = pow(max(0.0, 1.0 - d * 2.0), 2.5);
  float flare = (exp(-abs(c.x) * 26.0) * exp(-abs(c.y) * 4.5) + exp(-abs(c.y) * 26.0) * exp(-abs(c.x) * 4.5)) * vFlare;
  float a = (core + flare) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, min(1.0, a));
  #include <colorspace_fragment>
}`;

const AURORA_VS = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uSeed;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  float t = uTime * uSpeed;
  float w = sin(uv.x * 7.0 + t * 0.35 + uSeed) * 0.6 + sin(uv.x * 17.0 - t * 0.6 + uSeed * 2.0) * 0.3;
  vec2 radial = normalize(p.xz);
  p.xz += radial * w * 8.0 * (0.35 + uv.y);
  p.y += sin(uv.x * 4.0 + t * 0.25 + uSeed) * 5.0 * uv.y;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  clip.z = clip.w * 0.99997;
  gl_Position = clip;
}`;

const AURORA_FS = /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uParty;
uniform float uTime;
uniform float uOpacity;
uniform float uSeed;
varying vec2 vUv;
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
void main() {
  float u = vUv.x;
  float v = vUv.y;
  float bottom = smoothstep(0.0, 0.14, v);
  float top = 1.0 - smoothstep(0.28, 1.0, v);
  float speed = 1.0 + uParty * 3.0;
  float rays = 0.55 + 0.45 * sin(u * 140.0 + sin(u * 23.0 + uTime * 0.5) * 3.0 + uTime * 0.5 * speed + uSeed);
  rays *= 0.75 + 0.25 * sin(u * 61.0 - uTime * 0.7 * speed);
  float ends = smoothstep(0.0, 0.14, u) * smoothstep(1.0, 0.86, u);
  float k = bottom * top * mix(0.55, 1.0, rays) * ends;
  vec3 base = mix(uColA, uColB, smoothstep(0.05, 0.6, v));
  base = mix(base, uColC, smoothstep(0.55, 1.0, v) * 0.75);
  vec3 rainbow = hsv2rgb(vec3(fract(u * 1.4 - uTime * 0.22 + v * 0.3 + uSeed * 0.1), 0.85, 1.0));
  vec3 col = mix(base, rainbow, uParty);
  float pulse = 1.0 + uParty * 0.4 * sin(uTime * 9.0 + u * 14.0);
  float a = clamp(k * uOpacity * pulse, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------------------
// procedural textures
// ---------------------------------------------------------------------------

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// A cream moon with craters and a sleepy happy face, drawn pixel by pixel.
function makeMoonTexture() {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const px = 2 / S;
  const craters = [
    [-0.55, 0.45, 0.13],
    [0.5, 0.52, 0.09],
    [0.64, -0.42, 0.1],
    [-0.18, 0.66, 0.07],
    [-0.66, -0.36, 0.08],
    [0.2, 0.36, 0.05],
  ];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = ((x + 0.5) / S) * 2 - 1;
      const v = ((y + 0.5) / S) * 2 - 1;
      const d = Math.hypot(u, v);
      const alpha = smooth(0.985, 0.94, d);
      let r = 255;
      let g = 246;
      let b = 214;
      let k = 1 - 0.16 * d * d * d - 0.06 * (u - v);
      for (const [cx, cy, cr] of craters) {
        const cd = Math.hypot(u - cx, v - cy);
        if (cd < cr + px) {
          const inside = smooth(cr + px, cr - px, cd);
          k *= 1 - 0.1 * inside;
          // lit rim on the upper-left of each crater
          const rim = smooth(cr * 0.55, cr, cd) * inside * Math.max(0, (cx - u) + (v - cy)) * 1.5;
          k += 0.05 * rim;
        }
      }
      r *= k;
      g *= k;
      b *= k;
      // rosy cheeks
      for (const sx of [-1, 1]) {
        const cd = Math.hypot(u - sx * 0.48, v + 0.14);
        const c = 0.6 * smooth(0.17, 0.0, cd);
        r = r + (255 - r) * c * 0.6;
        g = g + (160 - g) * c;
        b = b + (185 - b) * c;
      }
      // sleepy closed eyes: little downward arcs, and a smile
      let ink = 0;
      for (const sx of [-1, 1]) {
        const ex = u - sx * 0.3;
        const ey = v - 0.14;
        const ed = Math.hypot(ex, ey);
        if (ey < 0.02) ink = Math.max(ink, smooth(0.035 + px, 0.035 - px, Math.abs(ed - 0.14)));
      }
      {
        const sy = v + 0.12;
        const sd = Math.hypot(u, sy);
        if (sy < -0.02 && Math.abs(u) < 0.2) ink = Math.max(ink, smooth(0.03 + px, 0.03 - px, Math.abs(sd - 0.2)));
      }
      r = r + (125 - r) * ink;
      g = g + (92 - g) * ink;
      b = b + (110 - b) * ink;
      const kk = (y * S + x) * 4;
      data[kk] = Math.max(0, Math.min(255, Math.round(r)));
      data[kk + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[kk + 2] = Math.max(0, Math.min(255, Math.round(b)));
      data[kk + 3] = Math.round(alpha * 255);
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// createSky
// ---------------------------------------------------------------------------

export function createSky(scene) {
  if (!scene || typeof scene.add !== 'function') scene = new THREE.Scene();
  const prevBackground = scene.background;
  const prevFog = scene.fog;
  const disposables = [];
  const own = (x) => {
    disposables.push(x);
    return x;
  };

  // live palette (lerped toward `target` on theme change)
  const cur = {};
  for (const k of PALETTE_KEYS) cur[k] = new THREE.Color(PALETTES.classic[k]);
  const target = {};
  for (const k of PALETTE_KEYS) target[k] = new THREE.Color(PALETTES.classic[k]);
  let themeName = 'classic';
  let themeBlend = 1; // 1 = arrived

  const background = new THREE.Color().copy(cur.horizon);
  scene.background = background;
  const fog = new THREE.Fog(cur.horizon.getHex(), 28, 140);
  scene.fog = fog;

  const root = new THREE.Group();
  root.name = 'sky';
  scene.add(root);

  // moon direction (in the sky) and the light direction (a bit to the side so
  // that when you look at the moon the world is side-lit, not a silhouette)
  const moonAz = 0.35;
  const moonEl = 0.25;
  const moonDir = new THREE.Vector3(Math.sin(moonAz) * Math.cos(moonEl), Math.sin(moonEl), Math.cos(moonAz) * Math.cos(moonEl)).normalize();
  const lightAz = moonAz + 0.95;
  const lightEl = 0.88;
  const lightDir = new THREE.Vector3(Math.sin(lightAz) * Math.cos(lightEl), Math.sin(lightEl), Math.cos(lightAz) * Math.cos(lightEl)).normalize();
  const moonRight = new THREE.Vector3().crossVectors(moonDir, new THREE.Vector3(0, 1, 0)).normalize();
  const moonUp = new THREE.Vector3().crossVectors(moonRight, moonDir).normalize();

  // ---- dome ----
  const moonTex = own(makeMoonTexture());
  const domeMat = own(
    new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: cur.top },
        uMid: { value: cur.mid },
        uHorizon: { value: cur.horizon },
        uGlow: { value: cur.glow },
        uMoonGlow: { value: cur.moonGlow },
        uMoonDir: { value: moonDir },
        uMoonRight: { value: moonRight },
        uMoonUp: { value: moonUp },
        uMoonR: { value: 0.075 },
        uMoonTex: { value: moonTex },
        uParty: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: DOME_VS,
      fragmentShader: DOME_FS,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
  const dome = new THREE.Mesh(own(new THREE.SphereGeometry(DOME_R, 48, 24)), domeMat);
  dome.name = 'skyDome';
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  root.add(dome);

  // ---- stars ----
  const srng = createRng(20241224);
  const starCount = 1500;
  const shootN = 16;
  const starMat = own(
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDpr: { value: 1 }, uTwinkle: { value: 1 } },
      vertexShader: STAR_VS,
      fragmentShader: STAR_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
    })
  );
  const starColours = [0xfff8e8, 0xfff1c4, 0xd8e6ff, 0xffe0f0, 0xffffff].map((c) => new THREE.Color(c));
  {
    const pos = new Float32Array(starCount * 3);
    const size = new Float32Array(starCount);
    const phase = new Float32Array(starCount);
    const alpha = new Float32Array(starCount);
    const colour = new Float32Array(starCount * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < starCount; i++) {
      // uniform over the upper hemisphere, skipping the band right at the horizon
      const y = srng.range(0.04, 1);
      const a = srng.range(0, TAU);
      const r = Math.sqrt(1 - y * y);
      v.set(Math.sin(a) * r, y, Math.cos(a) * r);
      if (v.dot(moonDir) > 0.985) v.y = Math.min(1, v.y + 0.25); // keep the moon's face clear
      v.normalize().multiplyScalar(STAR_R);
      pos.set([v.x, v.y, v.z], i * 3);
      const big = srng.chance(0.04);
      size[i] = big ? srng.range(6, 10) : srng.range(1.4, 3.6);
      phase[i] = srng.range(0, 1);
      alpha[i] = big ? 1 : srng.range(0.45, 1);
      const c = starColours[srng.int(0, starColours.length - 1)];
      colour.set([c.r, c.g, c.b], i * 3);
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(colour, 3));
    const stars = new THREE.Points(g, starMat);
    stars.name = 'stars';
    stars.frustumCulled = false;
    stars.renderOrder = -99;
    root.add(stars);
  }

  // ---- shooting star (a short trail of points, updated in place) ----
  const shootPos = new Float32Array(shootN * 3);
  const shootAlpha = new Float32Array(shootN);
  const shootGeo = own(new THREE.BufferGeometry());
  {
    const size = new Float32Array(shootN);
    const phase = new Float32Array(shootN);
    const colour = new Float32Array(shootN * 3);
    for (let i = 0; i < shootN; i++) {
      size[i] = 7 * (1 - i / shootN) + 1.5;
      phase[i] = 0;
      colour.set([1, 0.97, 0.88], i * 3);
    }
    shootGeo.setAttribute('position', new THREE.BufferAttribute(shootPos, 3));
    shootGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    shootGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    shootGeo.setAttribute('aAlpha', new THREE.BufferAttribute(shootAlpha, 1));
    shootGeo.setAttribute('aColor', new THREE.BufferAttribute(colour, 3));
  }
  const shooting = new THREE.Points(shootGeo, starMat);
  shooting.name = 'shootingStar';
  shooting.frustumCulled = false;
  shooting.renderOrder = -98;
  root.add(shooting);
  const shoot = {
    active: false,
    t: 0,
    dur: 0.9,
    next: 4 + Math.random() * 6,
    start: new THREE.Vector3(),
    axis: new THREE.Vector3(),
    angle: 0.5,
  };
  const _sv = new THREE.Vector3();

  // ---- aurora ribbons ----
  const auroraMats = [];
  const auroraDefs = [
    { centre: moonAz + Math.PI * 0.85, span: 2.1, bottom: 9, top: 62, seed: 0.3, opacity: 0.62 },
    { centre: moonAz + Math.PI * 1.45, span: 1.7, bottom: 13, top: 58, seed: 2.1, opacity: 0.5 },
    { centre: moonAz - 0.75, span: 1.25, bottom: 16, top: 50, seed: 4.4, opacity: 0.42 },
  ];
  for (const def of auroraDefs) {
    const segX = 110;
    const segY = 10;
    const g = own(new THREE.PlaneGeometry(1, 1, segX, segY));
    const P = g.attributes.position;
    const UV = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const u = UV.getX(i);
      const v = UV.getY(i);
      const az = def.centre + (u - 0.5) * def.span;
      const r = AURORA_R + Math.sin(u * 9.0 + def.seed) * 6;
      const y = def.bottom + v * (def.top - def.bottom) + Math.sin(u * 3.0 + def.seed) * 6;
      P.setXYZ(i, Math.sin(az) * r, y, Math.cos(az) * r);
    }
    g.computeBoundingSphere();
    const mat = own(
      new THREE.ShaderMaterial({
        uniforms: {
          uColA: { value: cur.auroraA },
          uColB: { value: cur.auroraB },
          uColC: { value: cur.auroraC },
          uParty: { value: 0 },
          uTime: { value: 0 },
          uSpeed: { value: 1 },
          uSeed: { value: def.seed },
          uOpacity: { value: def.opacity },
        },
        vertexShader: AURORA_VS,
        fragmentShader: AURORA_FS,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      })
    );
    mat.userData.baseOpacity = def.opacity;
    auroraMats.push(mat);
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'aurora';
    mesh.frustumCulled = false;
    mesh.renderOrder = -97;
    root.add(mesh);
  }

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(cur.hemiSky.getHex(), cur.hemiGround.getHex(), BASE_INTENSITY.hemi);
  hemi.name = 'skyHemi';
  const ambient = new THREE.AmbientLight(cur.ambient.getHex(), BASE_INTENSITY.ambient);
  ambient.name = 'skyAmbient';
  const moon = new THREE.DirectionalLight(cur.moon.getHex(), BASE_INTENSITY.moon);
  moon.name = 'moonLight';
  moon.castShadow = true;
  moon.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const sc = moon.shadow.camera;
  sc.left = -SHADOW_HALF;
  sc.right = SHADOW_HALF;
  sc.top = SHADOW_HALF;
  sc.bottom = -SHADOW_HALF;
  sc.near = 1;
  sc.far = 260;
  sc.updateProjectionMatrix();
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.035;
  moon.shadow.radius = 2;
  moon.position.copy(lightDir).multiplyScalar(120);
  moon.target.position.set(0, 0, 0);
  // soft lavender fill from the opposite side so shadowed faces stay readable
  const fill = new THREE.DirectionalLight(cur.fill.getHex(), BASE_INTENSITY.fill);
  fill.name = 'skyFill';
  fill.castShadow = false;
  fill.position.set(-lightDir.x * 50, 30, -lightDir.z * 50);
  scene.add(hemi, ambient, moon, moon.target, fill);
  let brightness = 1;
  const applyIntensity = () => {
    hemi.intensity = BASE_INTENSITY.hemi * brightness;
    ambient.intensity = BASE_INTENSITY.ambient * brightness;
    moon.intensity = BASE_INTENSITY.moon * brightness;
    fill.intensity = BASE_INTENSITY.fill * brightness;
  };

  // shadow-camera texel snapping basis (stops shadow edges shimmering as Pip moves)
  const lf = lightDir.clone().negate();
  const lr = new THREE.Vector3().crossVectors(lf, new THREE.Vector3(0, 1, 0)).normalize();
  const lu = new THREE.Vector3().crossVectors(lr, lf).normalize();
  const texel = (2 * SHADOW_HALF) / SHADOW_MAP;
  const _centre = new THREE.Vector3();

  const applyPalette = () => {
    background.copy(cur.horizon);
    fog.color.copy(cur.horizon);
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    ambient.color.copy(cur.ambient);
    moon.color.copy(cur.moon);
    fill.color.copy(cur.fill);
  };

  let party = 0;
  let partyTarget = 0;
  let frames = 0;
  let clock = 0;
  let disposed = false;

  const update = (dt, time, focus) => {
    if (disposed) return;
    dt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.25) : 0;
    clock += dt;
    const t = Number.isFinite(time) ? time : clock;
    frames++;

    // follow the player so the sky is always "infinitely" far away
    if (focus && Number.isFinite(focus.x) && Number.isFinite(focus.z)) {
      root.position.set(focus.x, Number.isFinite(focus.y) ? focus.y : 0, focus.z);
      const fy = Number.isFinite(focus.y) ? focus.y : 0;
      const a = Math.round((focus.x * lr.x + fy * lr.y + focus.z * lr.z) / texel) * texel;
      const b = Math.round((focus.x * lu.x + fy * lu.y + focus.z * lu.z) / texel) * texel;
      const c = focus.x * lf.x + fy * lf.y + focus.z * lf.z;
      _centre.set(0, 0, 0).addScaledVector(lr, a).addScaledVector(lu, b).addScaledVector(lf, c);
      moon.position.copy(_centre).addScaledVector(lightDir, 120);
      moon.target.position.copy(_centre);
      moon.target.updateMatrixWorld();
    }

    // theme cross-fade
    if (themeBlend < 1) {
      themeBlend = Math.min(1, themeBlend + dt / 1.2);
      const k = Math.min(1, dt * 4 + (themeBlend >= 1 ? 1 : 0));
      for (const key of PALETTE_KEYS) cur[key].lerp(target[key], k);
      applyPalette();
    }

    // party mode eases in and out
    party += (partyTarget - party) * Math.min(1, dt * 2.5);
    if (Math.abs(partyTarget - party) < 0.001) party = partyTarget;
    domeMat.uniforms.uParty.value = party;
    domeMat.uniforms.uTime.value = t;
    for (const m of auroraMats) {
      m.uniforms.uTime.value = t;
      m.uniforms.uParty.value = party;
      m.uniforms.uSpeed.value = 1 + party * 2.5;
      m.uniforms.uOpacity.value = m.userData.baseOpacity * (1 + party * 0.45);
    }
    starMat.uniforms.uTime.value = t;
    starMat.uniforms.uTwinkle.value = 1 + party * 2;
    if (typeof window !== 'undefined' && window.devicePixelRatio) starMat.uniforms.uDpr.value = Math.min(2, window.devicePixelRatio);

    // shooting stars every few seconds (more often at a party)
    if (!shoot.active) {
      shoot.next -= dt * (1 + party * 2);
      if (shoot.next <= 0) {
        shoot.active = true;
        shoot.t = 0;
        shoot.dur = 0.7 + Math.random() * 0.5;
        const az = Math.random() * TAU;
        const el = 0.35 + Math.random() * 0.45;
        shoot.start.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
        // travel sideways and a little downward along a great circle
        _sv.set(Math.cos(az), -0.55 - Math.random() * 0.4, -Math.sin(az)).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
        _sv.y = -Math.abs(_sv.y);
        shoot.axis.crossVectors(shoot.start, _sv).normalize();
        shoot.angle = 0.35 + Math.random() * 0.25;
      }
    }
    if (shoot.active) {
      shoot.t += dt;
      const p = shoot.t / shoot.dur;
      for (let i = 0; i < shootN; i++) {
        const ti = Math.max(0, p - i * 0.018);
        _sv.copy(shoot.start).applyAxisAngle(shoot.axis, shoot.angle * ti).multiplyScalar(STAR_R);
        shootPos[i * 3] = _sv.x;
        shootPos[i * 3 + 1] = _sv.y;
        shootPos[i * 3 + 2] = _sv.z;
        const fade = Math.sin(Math.min(1, p) * Math.PI);
        shootAlpha[i] = p - i * 0.018 > 0 ? fade * (1 - i / shootN) : 0;
      }
      shootGeo.attributes.position.needsUpdate = true;
      shootGeo.attributes.aAlpha.needsUpdate = true;
      if (p >= 1) {
        shoot.active = false;
        shoot.next = 6 + Math.random() * 9;
        shootAlpha.fill(0);
        shootGeo.attributes.aAlpha.needsUpdate = true;
      }
    }
  };

  const setParty = (on) => {
    partyTarget = on ? 1 : 0;
  };

  const setTheme = (name) => {
    const n = name === 'candy' ? 'candy' : 'classic';
    themeName = n;
    for (const k of PALETTE_KEYS) target[k].setHex(PALETTES[n][k]);
    if (frames === 0) {
      for (const k of PALETTE_KEYS) cur[k].copy(target[k]);
      applyPalette();
      themeBlend = 1;
    } else {
      themeBlend = 0;
    }
  };

  const setBrightness = (mult) => {
    brightness = Number.isFinite(mult) ? Math.max(0, mult) : 1;
    applyIntensity();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.remove(root, hemi, ambient, moon, moon.target, fill);
    if (moon.shadow && moon.shadow.map) moon.shadow.map.dispose();
    if (typeof moon.dispose === 'function') moon.dispose();
    for (const d of disposables) if (d && typeof d.dispose === 'function') d.dispose();
    if (scene.background === background) scene.background = prevBackground ?? null;
    if (scene.fog === fog) scene.fog = prevFog ?? null;
  };

  applyPalette();
  applyIntensity();

  return {
    update,
    setParty,
    setTheme,
    dispose,
    // extras
    setBrightness,
    get theme() {
      return themeName;
    },
    get party() {
      return partyTarget === 1;
    },
    moonDir,
    lightDir,
    fog,
    lights: { hemi, ambient, moon, fill },
    group: root,
  };
}
