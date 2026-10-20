import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  Points,
  ShaderMaterial,
} from 'three';
import type { Texture } from 'three';

export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  sizeEnd?: number;
  /** Colour 0..1 and alpha. */
  r: number;
  g: number;
  b: number;
  a?: number;
  gravity?: number;
  drag?: number;
}

const VERT = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
}`;

/** Fixed-capacity GPU point-sprite particle system with CPU-side simulation. */
export class ParticleSystem {
  readonly points: Points;
  private readonly cap: number;
  private head = 0;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly material: ShaderMaterial;
  private live = 0;

  constructor(capacity: number, texture: Texture, additive: boolean) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(1e9);
    this.life = new Float32Array(capacity).fill(1);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(35048));
    geo.setAttribute('aColor', new BufferAttribute(this.col, 4).setUsage(35048));
    geo.setAttribute('aSize', new BufferAttribute(this.size, 1).setUsage(35048));
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { map: { value: texture }, uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 15;
  }

  setPixelScale(scale: number): void {
    this.material.uniforms.uScale!.value = scale;
  }

  get active(): number {
    return this.live;
  }

  emit(s: ParticleSpec): void {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    this.pos[i * 3] = s.x;
    this.pos[i * 3 + 1] = s.y;
    this.pos[i * 3 + 2] = s.z;
    this.vel[i * 3] = s.vx ?? 0;
    this.vel[i * 3 + 1] = s.vy ?? 0;
    this.vel[i * 3 + 2] = s.vz ?? 0;
    this.col[i * 4] = s.r;
    this.col[i * 4 + 1] = s.g;
    this.col[i * 4 + 2] = s.b;
    this.col[i * 4 + 3] = s.a ?? 1;
    this.alpha0[i] = s.a ?? 1;
    this.size0[i] = s.size;
    this.size1[i] = s.sizeEnd ?? s.size;
    this.size[i] = s.size;
    this.life[i] = s.life;
    this.age[i] = 0;
    this.grav[i] = s.gravity ?? 0;
    this.drag[i] = s.drag ?? 0;
  }

  update(dt: number): void {
    let live = 0;
    for (let i = 0; i < this.cap; i++) {
      const age = this.age[i]! + dt;
      if (age >= this.life[i]!) {
        if (this.size[i]! !== 0) this.size[i] = 0;
        this.age[i] = 1e9;
        continue;
      }
      live++;
      this.age[i] = age;
      const k = age / this.life[i]!;
      const drag = Math.max(0, 1 - this.drag[i]! * dt);
      this.vel[i * 3] = this.vel[i * 3]! * drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! * drag - this.grav[i]! * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2]! * drag;
      this.pos[i * 3] = this.pos[i * 3]! + this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1] = Math.max(0.02, this.pos[i * 3 + 1]! + this.vel[i * 3 + 1]! * dt);
      this.pos[i * 3 + 2] = this.pos[i * 3 + 2]! + this.vel[i * 3 + 2]! * dt;
      this.size[i] = this.size0[i]! + (this.size1[i]! - this.size0[i]!) * k;
      this.col[i * 4 + 3] = this.alpha0[i]! * (1 - k) * Math.min(1, k * 12);
    }
    this.live = live;
    const g = this.points.geometry;
    g.attributes.position!.needsUpdate = true;
    g.attributes.aColor!.needsUpdate = true;
    g.attributes.aSize!.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
