import * as THREE from 'three';
import { Builder, V3, mix, mul, rgb, rng } from './geo';
import { patchPSX, vertexColorMaterial } from './psx';
import { FINISH_S, RADIUS, ROAD_HALF, TRACK_LENGTH, WALL_D, centerAt } from './track';

export const FOG_COLOR = 0x080a1c;
const POLE_GAP = 50;

function at(s: number, d: number, y: number): V3 {
  const p = centerAt(s);
  return [p.x + Math.cos(p.h) * d, y, p.z - Math.sin(p.h) * d];
}

/** Baked lamp pools: bright under each pole, brighter toward the edges. */
function lightAmt(s: number, d: number): number {
  const ph = (((s % POLE_GAP) + POLE_GAP) % POLE_GAP) / POLE_GAP;
  const along = Math.pow(0.5 + 0.5 * Math.cos(ph * Math.PI * 2), 1.5);
  const across = 0.35 + 0.65 * Math.min(1, Math.abs(d) / ROAD_HALF);
  return 0.42 + 0.58 * along * across;
}

function stripQuad(b: Builder, s0: number, s1: number, d0: number, d1: number, y: number, col: V3): void {
  const c = (s: number, d: number): V3 => mul(col, lightAmt(s, d));
  b.quad(at(s0, d0, y), at(s1, d0, y), at(s1, d1, y), at(s0, d1, y), c(s0, d0), c(s1, d0), c(s1, d1), c(s0, d1));
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  return t;
}

function glowTexture(): THREE.CanvasTexture {
  return canvasTexture(32, 32, (g) => {
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
  });
}

function signTexture(text: string, color: string): THREE.CanvasTexture {
  return canvasTexture(256, 64, (g) => {
    g.fillStyle = '#080b20';
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.strokeRect(3, 3, 250, 58);
    g.fillStyle = color;
    g.font = 'italic 900 34px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
  });
}

function glowPoints(positions: number[], size: number, color: number, tex: THREE.Texture): THREE.Points {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(
    g,
    new THREE.PointsMaterial({
      map: tex,
      color,
      size,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
}

export function buildWorld(): { scene: THREE.Scene; sky: THREE.Group } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 90, 800);
  const mat = vertexColorMaterial();
  const rand = rng(7);
  const glow = glowTexture();
  const add = (b: Builder): void => {
    scene.add(new THREE.Mesh(b.build(), mat));
  };

  // --- ground ---------------------------------------------------------------
  const ground = new Builder();
  const G = 3200;
  const gc = rgb(0x0a1411);
  ground.quad([-G, -0.08, -G], [G, -0.08, -G], [G, -0.08, G], [-G, -0.08, G], gc);
  // Plain material on purpose: a 6 km quad must never go through vertex snapping.
  scene.add(new THREE.Mesh(ground.build(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  // --- asphalt, markings, kerbs ---------------------------------------------
  const road = new Builder();
  const asphalt = rgb(0x3b4157);
  const NS = 380;
  const NA = 8;
  for (let i = 0; i < NS; i++) {
    const s0 = (i * TRACK_LENGTH) / NS;
    const s1 = ((i + 1) * TRACK_LENGTH) / NS;
    for (let j = 0; j < NA; j++) {
      const d0 = -ROAD_HALF + (2 * ROAD_HALF * j) / NA;
      const d1 = -ROAD_HALF + (2 * ROAD_HALF * (j + 1)) / NA;
      const c = (s: number, d: number): V3 => mul(asphalt, lightAmt(s, d) * (0.95 + rand() * 0.1));
      road.quad(at(s0, d0, 0), at(s1, d0, 0), at(s1, d1, 0), at(s0, d1, 0), c(s0, d0), c(s1, d0), c(s1, d1), c(s0, d1));
    }
  }
  const white = rgb(0xdfe6f5);
  const kerbRed = rgb(0xd8282f);
  for (let i = 0; i < NS; i++) {
    const s0 = (i * TRACK_LENGTH) / NS;
    const s1 = ((i + 1) * TRACK_LENGTH) / NS;
    for (const sg of [-1, 1]) {
      stripQuad(road, s0, s1, sg * (ROAD_HALF - 1.5), sg * (ROAD_HALF - 0.9), 0.1, white);
    }
  }
  for (const d of [-15.3, -7.65, 0, 7.65, 15.3]) {
    for (let s = 0; s < TRACK_LENGTH; s += 14) {
      if (Math.abs(s + 2.5 - FINISH_S) < 6) continue;
      stripQuad(road, s, s + 5, d - 0.2, d + 0.2, 0.1, white);
    }
  }
  const KS = 4;
  for (let s = 0; s < TRACK_LENGTH; s += KS) {
    const col = Math.floor(s / KS) % 2 ? white : kerbRed;
    for (const sg of [-1, 1]) {
      stripQuad(road, s, s + KS, sg > 0 ? ROAD_HALF : -WALL_D, sg > 0 ? WALL_D : -ROAD_HALF, 0.08, col);
    }
  }
  const NC = 24;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < NC; c++) {
      const col = (r + c) % 2 ? rgb(0x0c0d14) : white;
      const d0 = -ROAD_HALF + (2 * ROAD_HALF * c) / NC;
      const d1 = -ROAD_HALF + (2 * ROAD_HALF * (c + 1)) / NC;
      stripQuad(road, FINISH_S - 1.6 + r * 1.6, FINISH_S + r * 1.6, d0, d1, 0.12, col);
    }
  }
  add(road);

  // --- walls ----------------------------------------------------------------
  const walls = new Builder();
  const ads = [0xff3da5, 0x19e0ff, 0xffe14d, 0x7dff6b, 0xff8a1f, 0xb06bff].map(rgb);
  const concrete = rgb(0x70778c);
  const WS = 4;
  for (let s = 0; s < TRACK_LENGTH; s += WS) {
    const s1 = s + WS;
    const lit = (ss: number): number => 0.72 + 0.28 * lightAmt(ss, ROAD_HALF);
    // outside wall: neon ad panels
    const panel = Math.floor(s / 12);
    const inPanel = s % 12 < 10;
    const oc = inPanel ? ads[panel % ads.length] : concrete;
    walls.quad(at(s, WALL_D, 0), at(s1, WALL_D, 0), at(s1, WALL_D, 1.4), at(s, WALL_D, 1.4), mul(oc, lit(s)), mul(oc, lit(s1)), mul(oc, lit(s1)), mul(oc, lit(s)));
    walls.quad(at(s, WALL_D, 1.4), at(s1, WALL_D, 1.4), at(s1, WALL_D + 0.8, 1.4), at(s, WALL_D + 0.8, 1.4), mul(concrete, 1.15));
    // infield barrier: red / white blocks
    const ic = Math.floor(s / 6) % 2 ? white : kerbRed;
    walls.quad(at(s, -WALL_D, 0), at(s1, -WALL_D, 0), at(s1, -WALL_D, 1.1), at(s, -WALL_D, 1.1), mul(ic, lit(s)), mul(ic, lit(s1)), mul(ic, lit(s1)), mul(ic, lit(s)));
    walls.quad(at(s, -WALL_D, 1.1), at(s1, -WALL_D, 1.1), at(s1, -WALL_D - 0.7, 1.1), at(s, -WALL_D - 0.7, 1.1), mul(concrete, 1.1));
  }
  add(walls);

  // --- light poles + glow ---------------------------------------------------
  const poles = new Builder();
  const steel = rgb(0x232838);
  const lampCol = rgb(0xfff3c4);
  const heads: number[] = [];
  for (let s = 0; s < TRACK_LENGTH; s += POLE_GAP) {
    for (const sg of [-1, 1]) {
      const base = at(s, sg * 31, 0);
      poles.box(base[0], 7.5, base[2], 0.5, 15, 0.5, steel);
      const head = at(s, sg * 28.5, 15.2);
      poles.box(head[0], head[1], head[2], 3.4, 0.4, 1.4, lampCol, 0, false);
      heads.push(head[0], head[1] - 0.4, head[2]);
    }
  }
  add(poles);
  scene.add(glowPoints(heads, 16, 0xffe9a8, glow));

  // --- grandstand (outside of the start straight) ---------------------------
  const stands = new Builder();
  const X0 = RADIUS + WALL_D + 9;
  const palette = [0xff4d6d, 0x4dd2ff, 0xffe14d, 0xf0f0f0].map(rgb);
  for (let i = 0; i < 6; i++) {
    const hgt = 2.4 + i * 2.3;
    const x0 = X0 + i * 4.2;
    stands.box(x0 + 2.1, hgt / 2, 0, 4.2, hgt, 170, rgb(0x1b2033));
    for (let z = -84; z < 84; z += 2) {
      for (let k = 0; k < 2; k++) {
        const r = rand();
        const col = r < 0.5 ? mix(rgb(0x20263f), rgb(0x2f3658), rand()) : mul(palette[Math.floor(rand() * palette.length)], 0.55 + rand() * 0.4);
        const xa = x0 + k * 2.1;
        stands.quad([xa, hgt + 0.03, z], [xa + 2.1, hgt + 0.03, z], [xa + 2.1, hgt + 0.03, z + 2], [xa, hgt + 0.03, z + 2], col);
      }
    }
  }
  stands.box(X0 + 13, 20, 0, 30, 0.8, 172, rgb(0x141a30));
  for (let z = -80; z <= 80; z += 32) stands.box(X0 + 27, 10, z, 0.9, 20, 0.9, steel);
  stands.box(X0 - 1.6, 19.3, 0, 0.6, 0.3, 170, lampCol, 0, false);
  add(stands);
  const flood: number[] = [];
  for (let z = -80; z <= 80; z += 10) flood.push(X0 - 1.6, 19.0, z);
  scene.add(glowPoints(flood, 12, 0xfff2c0, glow));

  // --- start / finish gantry ------------------------------------------------
  const gp = centerAt(FINISH_S);
  const gantry = new Builder();
  for (const sg of [-1, 1]) gantry.box(gp.x + sg * 27.5, 6, gp.z, 1.2, 12, 1.2, steel);
  gantry.box(gp.x, 12, gp.z, 56, 1.4, 1.6, steel);
  add(gantry);
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 5).rotateY(Math.PI),
    patchPSX(new THREE.MeshBasicMaterial({ map: signTexture('START / FINISH', '#ffffff'), side: THREE.DoubleSide })),
  );
  banner.position.set(gp.x, 9.2, gp.z - 0.9);
  scene.add(banner);

  // --- neon billboards behind the outside wall ------------------------------
  const boards: [string, string][] = [
    ['JUNGLE DNB', '#b6ff3b'], ['JUICY AURA', '#ff8a1f'], ['BASS DROP', '#19e0ff'],
    ['170 BPM', '#ff3da5'], ['NIGHT RUN', '#ffe14d'], ['SUB FREQ', '#b06bff'],
    ['RIDDIM', '#7dff6b'], ['GT-R', '#57b8ff'], ['AMEN BREAK', '#ff5a5a'],
  ];
  const sList = [60, 440, 720, 940, 1180, 1420, 1700, 1930, 2170];
  boards.forEach(([text, color], i) => {
    const s = sList[i];
    const p = centerAt(s);
    const pos = at(s, 36, 5.5);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 6.5),
      patchPSX(new THREE.MeshBasicMaterial({ map: signTexture(text, color), side: THREE.DoubleSide })),
    );
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.y = Math.atan2(-Math.cos(p.h), Math.sin(p.h));
    scene.add(m);
  });

  // --- skyline + sky --------------------------------------------------------
  const city = new Builder();
  const winPos: number[] = [];
  const winCol: number[] = [];
  const winPalette = [rgb(0xffd27a), rgb(0x6fe8ff), rgb(0xff6fb5), rgb(0xdfe8ff)];
  for (let i = 0; i < 72; i++) {
    const th = (i / 72) * Math.PI * 2 + rand() * 0.06;
    const r = 950 + rand() * 350;
    const w = 30 + rand() * 50;
    const dep = 30 + rand() * 40;
    const h = 40 + Math.pow(rand(), 2) * 190;
    const cx = Math.sin(th) * r;
    const cz = Math.cos(th) * r;
    city.box(cx, h / 2, cz, w, h, dep, mix(rgb(0x0e1226), rgb(0x1c2244), rand()), th);
    const fx = cx - Math.sin(th) * (dep / 2 + 0.4);
    const fz = cz - Math.cos(th) * (dep / 2 + 0.4);
    const tx = Math.cos(th);
    const tz = -Math.sin(th);
    for (let k = 0; k < 40; k++) {
      const u = (rand() - 0.5) * (w - 4);
      const v = 6 + rand() * (h - 10);
      const c = mul(winPalette[Math.floor(rand() * winPalette.length)], 0.5 + rand() * 0.5);
      winPos.push(fx + tx * u, v, fz + tz * u);
      winCol.push(c[0], c[1], c[2]);
    }
  }
  const cityMesh = new THREE.Mesh(city.build(), patchPSX(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  scene.add(cityMesh);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(winPos, 3));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(winCol, 3));
  scene.add(new THREE.Points(wg, new THREE.PointsMaterial({ vertexColors: true, size: 7, sizeAttenuation: true, fog: false })));

  const sky = new THREE.Group();
  const starPos: number[] = [];
  for (let i = 0; i < 520; i++) {
    const a = rand() * Math.PI * 2;
    const e = 0.08 + rand() * 1.4;
    starPos.push(Math.cos(a) * Math.cos(e) * 1600, Math.sin(e) * 1600, Math.sin(a) * Math.cos(e) * 1600);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  sky.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false })));
  const moon = new THREE.Mesh(new THREE.CircleGeometry(55, 14), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }));
  moon.position.set(-700, 520, -1100);
  moon.lookAt(0, 0, 0);
  sky.add(moon);
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 340),
    new THREE.MeshBasicMaterial({ map: glow, color: 0x7e9bff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  halo.position.copy(moon.position).multiplyScalar(0.995);
  halo.lookAt(0, 0, 0);
  sky.add(halo);
  scene.add(sky);

  return { scene, sky };
}
