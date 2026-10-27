// Shared cute toon materials and outlines. Materials are cached by colour so
// the whole island reuses a small set of them.

import * as THREE from 'three';

let gradient = null;
function gradientMap() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 170, 255]);
  gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map();

// toon(0xff0000) or toon(0xff0000, { emissive: 0x331100, emissiveIntensity: 1 })
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.unique && cache.has(key)) return cache.get(key);
  const { unique, ...rest } = opts;
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...rest });
  if (!unique) cache.set(key, mat);
  return mat;
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x2a1b3d, side: THREE.BackSide });

// Inverted-hull outline: adds a slightly larger back-face copy as a child.
// Use on hero objects only (Pip, collectables, companions) to keep draw calls low.
export function addOutline(mesh, thickness = 0.05) {
  const hull = new THREE.Mesh(mesh.geometry, outlineMat);
  hull.scale.setScalar(1 + thickness);
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.userData.isOutline = true;
  mesh.add(hull);
  return hull;
}

export const PALETTE = {
  snow: 0xf4f8ff,
  snowShade: 0xd6e4f5,
  ice: 0xa8dcf0,
  pine: 0x2f8f5b,
  pineDark: 0x1f6e47,
  trunk: 0x7a4a2b,
  red: 0xe63946,
  green: 0x2a9d6f,
  gold: 0xffc94a,
  cream: 0xfff3dc,
  ginger: 0xc8803e,
  icing: 0xffffff,
  candyPink: 0xff8fc7,
  night: 0x1b2450,
  outline: 0x2a1b3d,
};
