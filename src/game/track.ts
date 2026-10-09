/**
 * Stadium-shaped night speedway. All units are metres.
 *
 * Centreline: straight A (x = +R, heading +z) -> right-hand turn 1 ->
 * straight B (x = -R, heading -z) -> right-hand turn 2 -> back to A.
 * Lateral offset `d` is measured to the LEFT of travel, so d > 0 is the
 * outside of every turn and d < 0 is the infield.
 */
export const STRAIGHT = 560;
export const RADIUS = 180;
export const ROAD_HALF = 23;
export const WALL_D = 24.5;
export const CAR_LIMIT = 23.2;

const HALF = STRAIGHT / 2;
const ARC = Math.PI * RADIUS;
const TAU = Math.PI * 2;

export const TRACK_LENGTH = 2 * STRAIGHT + 2 * ARC;
/** Arc-length of the start/finish line (middle of straight A, z = 0). */
export const FINISH_S = HALF;

export interface TrackPoint {
  x: number;
  z: number;
  h: number;
}

export function wrapS(s: number): number {
  const m = s % TRACK_LENGTH;
  return m < 0 ? m + TRACK_LENGTH : m;
}

/** Map any arc-length difference into (-T/2, T/2]. */
export function wrapDelta(ds: number): number {
  let d = wrapS(ds);
  if (d > TRACK_LENGTH / 2) d -= TRACK_LENGTH;
  return d;
}

export function wrapAngle(a: number): number {
  let r = (a + Math.PI) % TAU;
  if (r < 0) r += TAU;
  return r - Math.PI;
}

/** Centreline position and heading. Forward vector is (sin h, cos h). */
export function centerAt(sIn: number): TrackPoint {
  const s = wrapS(sIn);
  if (s < STRAIGHT) return { x: RADIUS, z: -HALF + s, h: 0 };
  if (s < STRAIGHT + ARC) {
    const th = (s - STRAIGHT) / RADIUS;
    return { x: RADIUS * Math.cos(th), z: HALF + RADIUS * Math.sin(th), h: -th };
  }
  if (s < 2 * STRAIGHT + ARC) {
    return { x: -RADIUS, z: HALF - (s - STRAIGHT - ARC), h: -Math.PI };
  }
  const th = Math.PI + (s - 2 * STRAIGHT - ARC) / RADIUS;
  return { x: RADIUS * Math.cos(th), z: -HALF + RADIUS * Math.sin(th), h: -th };
}

/** Point at arc-length s and lateral offset d (left of travel is +). */
export function offsetPoint(s: number, d: number): TrackPoint {
  const p = centerAt(s);
  return { x: p.x + Math.cos(p.h) * d, z: p.z - Math.sin(p.h) * d, h: p.h };
}

/** Nearest centreline arc-length and signed lateral offset for a world point. */
export function project(x: number, z: number): { s: number; d: number } {
  if (z > HALF) {
    const dx = x;
    const dz = z - HALF;
    const th = Math.atan2(dz, dx);
    return { s: STRAIGHT + RADIUS * th, d: Math.hypot(dx, dz) - RADIUS };
  }
  if (z < -HALF) {
    const dx = x;
    const dz = z + HALF;
    let th = Math.atan2(dz, dx);
    if (th < 0) th += TAU;
    return { s: 2 * STRAIGHT + ARC + RADIUS * (th - Math.PI), d: Math.hypot(dx, dz) - RADIUS };
  }
  if (x >= 0) return { s: z + HALF, d: x - RADIUS };
  return { s: STRAIGHT + ARC + (HALF - z), d: -x - RADIUS };
}

export function isTurn(s: number): boolean {
  const w = wrapS(s);
  return (w >= STRAIGHT && w < STRAIGHT + ARC) || w >= 2 * STRAIGHT + ARC;
}
