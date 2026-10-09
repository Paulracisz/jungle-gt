import * as THREE from 'three';

export type V3 = [number, number, number];

export const rgb = (hex: number): V3 => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
export const mul = (c: V3, k: number): V3 => [c[0] * k, c[1] * k, c[2] * k];
export const mix = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const LIGHT = norm([0.35, 0.85, -0.3]);

/** Collects flat, vertex-coloured triangles (PS1-style baked lighting). */
export class Builder {
  pos: number[] = [];
  col: number[] = [];

  tri(a: V3, b: V3, c: V3, ca: V3, cb: V3 = ca, cc: V3 = ca): void {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.col.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
  }

  quad(a: V3, b: V3, c: V3, d: V3, ca: V3, cb: V3 = ca, cc: V3 = ca, cd: V3 = ca): void {
    this.tri(a, b, c, ca, cb, cc);
    this.tri(a, c, d, ca, cc, cd);
  }

  /** Quad shaded by its own normal, oriented away from `centre`. */
  flat(a: V3, b: V3, c: V3, d: V3, color: V3, centre: V3): void {
    let n = norm(cross(sub(b, a), sub(d, a)));
    const mid: V3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    if (dot(n, sub(mid, centre)) < 0) n = [-n[0], -n[1], -n[2]];
    const k = n[1] < -0.5 ? 0.3 : 0.5 + 0.5 * Math.max(0, dot(n, LIGHT));
    this.quad(a, b, c, d, mul(color, k));
  }

  /** Axis box, optionally rotated about Y, with fixed per-face brightness. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: V3, ry = 0, lit = true): void {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const P = (x: number, y: number, z: number): V3 => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const A = P(-hx, -hy, -hz), B = P(hx, -hy, -hz), C = P(hx, hy, -hz), D = P(-hx, hy, -hz);
    const E = P(-hx, -hy, hz), F = P(hx, -hy, hz), G = P(hx, hy, hz), H = P(-hx, hy, hz);
    const k = (v: number): V3 => (lit ? mul(color, v) : color);
    this.quad(D, C, G, H, k(1));
    this.quad(A, E, F, B, k(0.35));
    this.quad(B, F, G, C, k(0.72));
    this.quad(A, D, H, E, k(0.62));
    this.quad(E, H, G, F, k(0.82));
    this.quad(A, B, C, D, k(0.58));
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** Small deterministic PRNG so the world looks identical every load. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
