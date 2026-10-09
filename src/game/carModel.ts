import * as THREE from 'three';
import { Builder, V3, mul, rgb } from './geo';
import { patchPSX, vertexColorMaterial } from './psx';

/**
 * Low-poly GT-R: the body is lofted from nine cross-sections (about 130
 * triangles), roughly what a late-90s racing game spent on a hero car.
 */
interface Station {
  z: number; // length position (+z = nose)
  wb: number; // half-width at the floor
  w: number; // half-width at the shoulder
  yb: number; // floor height
  ys: number; // sill height
  yw: number; // beltline height
  r: number; // half-width of the roof / hood panel
  yr: number; // roof / hood height
}

const ST: Station[] = [
  { z: 2.35, wb: 0.7, w: 0.72, yb: 0.38, ys: 0.45, yw: 0.62, r: 0.55, yr: 0.63 },
  { z: 2.1, wb: 0.85, w: 0.93, yb: 0.28, ys: 0.4, yw: 0.72, r: 0.8, yr: 0.76 },
  { z: 1.3, wb: 0.9, w: 0.95, yb: 0.26, ys: 0.4, yw: 0.88, r: 0.82, yr: 0.92 },
  { z: 0.55, wb: 0.9, w: 0.95, yb: 0.26, ys: 0.4, yw: 0.92, r: 0.8, yr: 0.98 },
  { z: -0.15, wb: 0.9, w: 0.96, yb: 0.26, ys: 0.4, yw: 0.94, r: 0.68, yr: 1.36 },
  { z: -1.0, wb: 0.9, w: 0.96, yb: 0.26, ys: 0.4, yw: 0.96, r: 0.68, yr: 1.36 },
  { z: -1.65, wb: 0.9, w: 0.97, yb: 0.28, ys: 0.42, yw: 0.98, r: 0.78, yr: 1.08 },
  { z: -2.25, wb: 0.85, w: 0.95, yb: 0.3, ys: 0.45, yw: 0.96, r: 0.82, yr: 0.98 },
  { z: -2.38, wb: 0.75, w: 0.88, yb: 0.34, ys: 0.5, yw: 0.88, r: 0.72, yr: 0.88 },
];

function ringOf(st: Station): V3[] {
  return [
    [-st.wb, st.yb, st.z], [-st.w, st.ys, st.z], [-st.w, st.yw, st.z], [-st.r, st.yr, st.z],
    [st.r, st.yr, st.z], [st.w, st.yw, st.z], [st.w, st.ys, st.z], [st.wb, st.yb, st.z],
  ];
}

function bodyGeometry(hex: number): THREE.BufferGeometry {
  const b = new Builder();
  const body = rgb(hex);
  const glass = rgb(0x0f1a3a);
  const dark = rgb(0x0b0d14);
  const carbon = rgb(0x1a1c26);
  const centre: V3 = [0, 0.7, 0];
  const rings = ST.map(ringOf);

  for (let k = 0; k < ST.length - 1; k++) {
    for (let e = 0; e < 8; e++) {
      const a = rings[k][e];
      const bb = rings[k][(e + 1) % 8];
      const c = rings[k + 1][(e + 1) % 8];
      const d = rings[k + 1][e];
      let col = body;
      const cabin = k >= 3 && k <= 5;
      if (e === 7) col = dark;
      else if (cabin && (e === 2 || e === 4)) col = glass;
      else if (e === 3 && (k === 3 || k === 5)) col = glass; // windscreen, rear glass
      b.flat(a, bb, c, d, col, centre);
    }
  }
  // End caps: dark grille at the nose, body-coloured tail panel.
  const cap = (ring: V3[], z: number, col: V3): void => {
    const mid: V3 = [0, ring.reduce((s, p) => s + p[1], 0) / ring.length, z];
    for (let i = 0; i < ring.length; i++) b.tri(mid, ring[i], ring[(i + 1) % ring.length], col);
  };
  cap(rings[0], ST[0].z, mul(dark, 1.2));
  cap(rings[ST.length - 1], ST[ST.length - 1].z, mul(body, 0.55));

  // Details baked into the same mesh.
  b.box(0, 1.14, -2.1, 1.7, 0.06, 0.34, carbon); // rear wing
  b.box(0.55, 1.03, -2.1, 0.06, 0.2, 0.2, carbon);
  b.box(-0.55, 1.03, -2.1, 0.06, 0.2, 0.2, carbon);
  b.box(1.02, 1.0, 0.3, 0.14, 0.1, 0.22, body); // mirrors
  b.box(-1.02, 1.0, 0.3, 0.14, 0.1, 0.22, body);
  b.box(0, 0.27, 2.2, 1.7, 0.05, 0.4, dark); // front splitter
  const lamp = rgb(0xfff6d8);
  b.box(0.62, 0.72, 2.12, 0.34, 0.1, 0.12, lamp, 0, false); // headlights
  b.box(-0.62, 0.72, 2.12, 0.34, 0.1, 0.12, lamp, 0, false);
  const pipe = rgb(0xb9c0cf);
  for (const x of [0.3, 0.5, -0.3, -0.5]) b.box(x, 0.4, -2.41, 0.12, 0.12, 0.08, pipe, 0, false);
  return b.build();
}

function tailGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  const white: V3 = [1, 1, 1];
  for (const x of [0.62, 0.3, -0.3, -0.62]) b.box(x, 0.82, -2.4, 0.26, 0.12, 0.06, white, 0, false);
  return b.build();
}

function wheelGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  const N = 10;
  const R = 0.37;
  const hw = 0.15;
  const tyreA = rgb(0x15161c);
  const tyreB = rgb(0x22232c);
  const rimA = rgb(0xc2cbdc);
  const rimB = rgb(0x6d768a);
  const pt = (i: number, rad: number, x: number): V3 => {
    const a = (i / N) * Math.PI * 2;
    return [x, Math.cos(a) * rad, Math.sin(a) * rad];
  };
  for (let i = 0; i < N; i++) {
    b.quad(pt(i, R, -hw), pt(i + 1, R, -hw), pt(i + 1, R, hw), pt(i, R, hw), i % 2 ? tyreA : tyreB);
    for (const x of [-hw, hw]) {
      b.quad(pt(i, R, x), pt(i + 1, R, x), pt(i + 1, 0.24, x), pt(i, 0.24, x), tyreA);
      b.tri([x, 0, 0], pt(i, 0.24, x), pt(i + 1, 0.24, x), i % 2 ? rimA : rimB);
    }
  }
  return b.build();
}

export interface CarView {
  root: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Mesh[];
  frontPivots: THREE.Group[];
  tail: THREE.MeshBasicMaterial;
  spin: number;
}

let sharedWheel: THREE.BufferGeometry | null = null;
let sharedTail: THREE.BufferGeometry | null = null;
let sharedMat: THREE.MeshBasicMaterial | null = null;
let poolTex: THREE.CanvasTexture | null = null;

function headlightTexture(): THREE.CanvasTexture {
  if (poolTex) return poolTex;
  const W = 32;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1); // 0 = next to the car, 1 = far ahead
    const spread = 0.28 + 0.72 * t;
    for (let x = 0; x < W; x++) {
      const u = (x / (W - 1) - 0.5) * 2 / spread;
      const a = Math.max(0, 1 - t) ** 1.4 * Math.exp(-u * u * 2.2);
      const i = (y * W + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 240;
      img.data[i + 2] = 200;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  poolTex = new THREE.CanvasTexture(c);
  poolTex.magFilter = poolTex.minFilter = THREE.NearestFilter;
  poolTex.generateMipmaps = false;
  return poolTex;
}

export function buildCar(colorHex: number): CarView {
  sharedWheel ??= wheelGeometry();
  sharedTail ??= tailGeometry();
  sharedMat ??= vertexColorMaterial();

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(new THREE.Mesh(bodyGeometry(colorHex), sharedMat));

  const tail = patchPSX(new THREE.MeshBasicMaterial({ color: 0x701010, side: THREE.DoubleSide }));
  body.add(new THREE.Mesh(sharedTail, tail));

  const wheels: THREE.Mesh[] = [];
  const frontPivots: THREE.Group[] = [];
  for (const [x, z, front] of [
    [0.9, 1.45, true],
    [-0.9, 1.45, true],
    [0.9, -1.4, false],
    [-0.9, -1.4, false],
  ] as [number, number, boolean][]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.37, z);
    const wheel = new THREE.Mesh(sharedWheel, sharedMat);
    pivot.add(wheel);
    root.add(pivot);
    wheels.push(wheel);
    if (front) frontPivots.push(pivot);
  }

  // Blob shadow and headlight pool, both flat on the road.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 5.4).rotateX(-Math.PI / 2),
    patchPSX(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false })),
  );
  shadow.position.y = 0.12;
  root.add(shadow);

  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 30).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: headlightTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pool.position.set(0, 0.14, 17);
  root.add(pool);

  return { root, body, wheels, frontPivots, tail, spin: 0 };
}
