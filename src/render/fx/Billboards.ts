import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import type { BufferGeometry, Material, Texture } from 'three';

const VERT = /* glsl */ `
attribute vec4 aTint;
varying vec4 vTint;
varying vec2 vUv;
void main() {
  vTint = aTint;
  vUv = uv;
  // camera-facing quad: centre from the instance matrix, size from its x/y scale
  vec4 centre = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  vec2 size = vec2( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ) );
  centre.xy += position.xy * size;
  gl_Position = projectionMatrix * centre;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec4 vTint;
varying vec2 vUv;
void main() {
  vec4 t = texture2D( map, vUv );
  gl_FragColor = vec4( vTint.rgb * t.rgb, vTint.a * t.a );
  if ( gl_FragColor.a < 0.004 ) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Many camera-facing sprites in ONE draw call (an InstancedMesh of quads billboarded in the vertex
 * shader, colour + alpha per instance). Refilled every frame with `begin` / `push` / `end`; the
 * capacity doubles on demand, so a 15-tile flame line or a whole board on fire costs the same
 * single call. Presentation only.
 */
export class BillboardSet {
  mesh: InstancedMesh;
  private readonly material: ShaderMaterial;
  private readonly geometry = new PlaneGeometry(1, 1);
  private tint: InstancedBufferAttribute;
  private n = 0;
  private readonly m = new Matrix4();

  constructor(
    map: Texture,
    opts: { additive: boolean; renderOrder: number; capacity?: number },
    private readonly onRebuild?: (mesh: InstancedMesh, old: InstancedMesh) => void,
  ) {
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { map: { value: map } },
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? AdditiveBlending : NormalBlending,
    });
    const cap = opts.capacity ?? 128;
    this.tint = new InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(DynamicDrawUsage);
    this.mesh = this.build(cap);
    this.mesh.renderOrder = opts.renderOrder;
  }

  private build(cap: number): InstancedMesh {
    const geo = this.geometry.clone();
    geo.setAttribute('aTint', this.tint);
    const mesh = new InstancedMesh(geo, this.material, cap);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.count = 0;
    return mesh;
  }

  get capacity(): number {
    return this.tint.count;
  }

  begin(): void {
    this.n = 0;
  }

  push(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): void {
    if (a <= 0.002) return;
    if (this.n >= this.capacity) this.grow();
    const i = this.n++;
    this.m.makeScale(sx, sy, 1).setPosition(x, y, z);
    this.mesh.setMatrixAt(i, this.m);
    this.tint.setXYZW(i, r, g, b, a);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tint.needsUpdate = true;
  }

  private grow(): void {
    const old = this.mesh;
    const cap = this.capacity * 2;
    const tint = new InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(DynamicDrawUsage);
    (tint.array as Float32Array).set(this.tint.array as Float32Array);
    this.tint = tint;
    const mesh = this.build(cap);
    (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    mesh.renderOrder = old.renderOrder;
    this.mesh = mesh;
    this.onRebuild?.(mesh, old);
    old.geometry.dispose();
    old.dispose();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Many copies of one mesh (any geometry / material) in one draw call, with a colour per instance
 * (for additive materials the colour doubles as the fade). Refilled every frame; grows on demand.
 */
export class ColorInstances {
  mesh: InstancedMesh;
  private n = 0;
  private readonly c = new Color();

  constructor(
    private readonly geometry: BufferGeometry,
    private readonly material: Material,
    private readonly renderOrder: number,
    private readonly onRebuild?: (mesh: InstancedMesh, old: InstancedMesh) => void,
    capacity = 128,
  ) {
    this.mesh = this.build(capacity);
  }

  private build(cap: number): InstancedMesh {
    const mesh = new InstancedMesh(this.geometry, this.material, cap);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.setColorAt(0, this.c.setRGB(1, 1, 1));
    mesh.instanceColor!.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = this.renderOrder;
    mesh.count = 0;
    return mesh;
  }

  begin(): void {
    this.n = 0;
  }

  push(matrix: Matrix4, r: number, g: number, b: number): void {
    if (r + g + b <= 0.003) return;
    if (this.n >= this.mesh.instanceMatrix.count) this.grow();
    const i = this.n++;
    this.mesh.setMatrixAt(i, matrix);
    this.mesh.setColorAt(i, this.c.setRGB(r, g, b));
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private grow(): void {
    const old = this.mesh;
    const mesh = this.build(old.instanceMatrix.count * 2);
    (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    (mesh.instanceColor!.array as Float32Array).set(old.instanceColor!.array as Float32Array);
    this.mesh = mesh;
    this.onRebuild?.(mesh, old);
    old.dispose();
  }

  dispose(): void {
    this.mesh.dispose();
  }
}
