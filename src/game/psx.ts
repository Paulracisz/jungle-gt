import * as THREE from 'three';
import { Builder } from './geo';

// Raw colour pipeline: hex values and vertex colours reach the screen unchanged.
THREE.ColorManagement.enabled = false;

const INTERNAL_HEIGHT = 240;

/** Shared with every patched material so one resize updates all of them. */
export const psxRes = { value: new THREE.Vector2(427, INTERNAL_HEIGHT) };

/** Snap projected vertices to the pixel grid, like the PS1's integer GTE output. */
export function patchPSX<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRes = psxRes;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uRes;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         // Only snap vertices in the near/mid field. Far away, half a pixel is
         // metres of world space, which tilts huge triangles (e.g. the ground).
         if (gl_Position.w > 0.0 && gl_Position.w < 300.0) {
           vec2 g = uRes * 0.5;
           gl_Position.xy = floor(gl_Position.xy / gl_Position.w * g + 0.5) / g * gl_Position.w;
         }`,
      );
  };
  mat.customProgramCacheKey = () => 'psx-snap';
  return mat;
}

export function vertexColorMaterial(): THREE.MeshBasicMaterial {
  return patchPSX(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// 15-bit colour (5 bits per channel) with a 4x4 ordered dither, plus a light vignette.
const POST_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uRes;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec2 p = floor(vUv * uRes);
  mat4 bayer = mat4(0., 8., 2., 10.,  12., 4., 14., 6.,  3., 11., 1., 9.,  15., 7., 13., 5.);
  float t = bayer[int(mod(p.x, 4.0))][int(mod(p.y, 4.0))] / 16.0;
  c = floor(c * 31.0 + t) / 31.0;
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.85;
  gl_FragColor = vec4(c, 1.0);
}`;

/** Renders the scene at ~240p into a target, then dithers it onto a pixelated canvas. */
export class PsxRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quadMat: THREE.ShaderMaterial;

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const el = this.renderer.domElement;
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated;';
    host.appendChild(el);

    this.target = new THREE.WebGLRenderTarget(427, INTERNAL_HEIGHT, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.quadMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.target.texture }, uRes: psxRes },
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat));
  }

  /** Internal height is fixed (240p); width follows the window aspect ratio. */
  resize(cssW: number, cssH: number): number {
    const aspect = cssW / Math.max(1, cssH);
    let w = Math.round(INTERNAL_HEIGHT * aspect);
    w = Math.min(560, Math.max(280, w)) & ~1;
    this.renderer.setSize(w, INTERNAL_HEIGHT, false);
    this.target.setSize(w, INTERNAL_HEIGHT);
    psxRes.value.set(w, INTERNAL_HEIGHT);
    return w / INTERNAL_HEIGHT;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  dispose(): void {
    this.target.dispose();
    this.quadMat.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

