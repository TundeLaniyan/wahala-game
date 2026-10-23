import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { Generator } from '../../sim';
import { createGeneratorModel } from '../assets/generator';
import type { GeneratorModel } from '../assets/generator';
import { labelTexture, glowTexture } from '../textures';
import { playerGridPos, stepProgress, toWorld } from './motion';
import type { FrameContext, View } from './types';

interface Visual {
  model: GeneratorModel;
  label: Sprite;
  shadow: Mesh;
  pad: Mesh;
  pedestal: Mesh;
  shown: string;
}

const shadowGeo = new PlaneGeometry(1.06, 1.06);
const padGeo = new PlaneGeometry(1.08, 1.08);
const pedestalGeo = new CylinderGeometry(0.45, 0.5, 0.055, 24);

let cachedPadTex: CanvasTexture | null = null;
function generatorPadTexture(): CanvasTexture {
  if (cachedPadTex) return cachedPadTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const cx = 64;
  const cy = 64;
  // Soft outer glow
  const grad = g.createRadialGradient(cx, cy, 24, cx, cy, 62);
  grad.addColorStop(0, 'rgba(255, 160, 20, 0.45)');
  grad.addColorStop(0.68, 'rgba(255, 110, 10, 0.75)');
  grad.addColorStop(0.86, 'rgba(255, 210, 60, 0.95)');
  grad.addColorStop(1, 'rgba(255, 90, 0, 0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, 62, 0, Math.PI * 2);
  g.fill();
  // Crisp glowing ring + hazard ticks (matches reference floor pad under ticking bombs)
  g.strokeStyle = '#ffdf48';
  g.lineWidth = 4.5;
  g.beginPath();
  g.arc(cx, cy, 48, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = '#ff5a14';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(cx, cy, 38, 0, Math.PI * 2);
  g.stroke();
  cachedPadTex = new CanvasTexture(c);
  cachedPadTex.colorSpace = SRGBColorSpace;
  return cachedPadTex;
}

export class GeneratorViews implements View {
  readonly group = new Group();
  private readonly visuals = new Map<number, Visual>();

  update(ctx: FrameContext): void {
    const { state } = ctx;
    const live = new Set<number>();
    for (const g of state.generators) {
      live.add(g.id);
      let v = this.visuals.get(g.id);
      if (!v) {
        v = this.create(g);
        this.visuals.set(g.id, v);
      }
      this.pose(ctx, g, v);
    }
    for (const [id, v] of this.visuals) {
      if (!live.has(id)) {
        this.group.remove(v.model.root, v.label, v.shadow, v.pad, v.pedestal);
        v.model.casingMaterial.dispose();
        v.model.lampMaterial.dispose();
        v.label.material.dispose();
        (v.shadow.material as MeshBasicMaterial).dispose();
        (v.pad.material as MeshBasicMaterial).dispose();
        (v.pedestal.material as MeshStandardMaterial).dispose();
        this.visuals.delete(id);
      }
    }
  }

  private create(_g: Generator): Visual {
    const model = createGeneratorModel();
    const label = new Sprite(
      new SpriteMaterial({ map: labelTexture('3'), transparent: true, depthTest: false }),
    );
    label.scale.set(1.05, 0.42, 1);
    label.renderOrder = 30;
    const shadow = new Mesh(
      shadowGeo,
      new MeshBasicMaterial({
        map: glowTexture(),
        color: 0x000000,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 3;
    const pad = new Mesh(
      padGeo,
      new MeshBasicMaterial({
        map: generatorPadTexture(),
        color: 0xffb824,
        transparent: true,
        opacity: 0.92,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.renderOrder = 4;
    const pedestal = new Mesh(
      pedestalGeo,
      new MeshStandardMaterial({
        color: 0x242830,
        emissive: 0xff8a14,
        emissiveIntensity: 0.45,
        roughness: 0.35,
        metalness: 0.75,
      }),
    );
    pedestal.receiveShadow = true;
    this.group.add(model.root, label, shadow, pad, pedestal);
    return { model, label, shadow, pad, pedestal, shown: '' };
  }

  private pose(ctx: FrameContext, g: Generator, v: Visual): void {
    const { state, time, alpha, layout } = ctx;
    const cfg = state.config.generator;
    let gx = g.x;
    let gy = g.y;
    let lift = 0;

    if (g.carriedBy !== null) {
      const carrier = state.players[g.carriedBy]!;
      const pos = playerGridPos(carrier, alpha);
      gx = pos.x;
      gy = pos.y;
      lift = 1.12;
    } else if (g.flight) {
      const k = stepProgress(g.flight.remaining, g.flight.total, alpha);
      gx = g.flight.fromX + (g.x - g.flight.fromX) * k;
      gy = g.flight.fromY + (g.y - g.flight.fromY) * k;
      lift = 4 * 1.5 * k * (1 - k) + (1 - k) * 0.4;
      v.model.root.rotation.z = k * Math.PI * 2;
    } else if (g.slide) {
      const k = stepProgress(g.slide.stepRemaining, cfg.kickStepTicks, alpha);
      gx = g.stepFromX + (g.x - g.stepFromX) * k;
      gy = g.stepFromY + (g.y - g.stepFromY) * k;
      v.model.root.rotation.z = 0;
    } else {
      v.model.root.rotation.z = 0;
    }

    const w = toWorld(layout, gx, gy);
    v.model.root.position.set(w.x, lift + 0.04, w.z);
    v.model.root.scale.setScalar(1.36);
    v.shadow.position.set(w.x, 0.02, w.z);
    v.shadow.scale.setScalar(lift > 0.2 ? Math.max(0.5, 1 - lift * 0.2) : 1.05);
    v.pad.position.set(w.x, 0.026, w.z);
    v.pad.rotation.z = time * 1.2;
    v.pad.visible = lift < 0.25 && (g.mode === 'timed' || g.mode === 'remote');
    v.pedestal.position.set(w.x, 0.028, w.z);
    v.pedestal.visible = lift < 0.25;

    // Mode-specific look: bright yellow generator casing (timed) with red pulsing siren beacon & floor ring
    const timed = g.mode === 'timed';
    const frac = timed ? Math.max(0, g.timer / cfg.fuseTicks) : 1;
    const urgent = timed ? 1 - Math.min(1, frac) : 0;
    v.model.antenna.visible = g.mode === 'remote';
    const padMat = v.pad.material as MeshBasicMaterial;
    let label: string;
    let labelColor: string;
    if (timed) {
      label = String(Math.max(1, Math.ceil((g.timer - alpha) / 60)));
      labelColor = g.timer < 70 ? '#ff4a36' : '#ffe24a';
      const rate = 5 + urgent * 22;
      const wave = 0.5 + 0.5 * Math.sin(time * rate);
      const on = wave > 0.5;
      // Vibrant yellow portable generator casing that flashes warm orange-red on final ticks
      v.model.casingMaterial.color.setHex(urgent > 0.72 && on ? 0xff5a1f : 0xffc61a);
      v.model.lampMaterial.emissiveIntensity = on ? 2.8 : 0.45;
      v.model.lampMaterial.color.setHex(0xff2200);
      v.model.lampMaterial.emissive.setHex(0xff2200);
      const shake = 0.005 + urgent * urgent * 0.032;
      v.model.body.position.set(Math.sin(time * 70) * shake, 0, Math.cos(time * 63) * shake);
      const pulse = 1 + Math.max(0, urgent - 0.55) * 0.24 * Math.sin(time * 38);
      v.model.body.scale.setScalar(pulse);
      v.model.glow.material.opacity = (0.22 + urgent * 0.78) * (on ? 1.15 : 0.55);
      v.model.glow.material.color.setHex(urgent > 0.6 ? 0xff3814 : 0xffa818);
      padMat.color.setHex(urgent > 0.65 ? 0xff3b18 : 0xffb824);
      padMat.opacity = 0.65 + 0.32 * wave;
      v.pad.scale.setScalar(0.94 + 0.1 * wave);
    } else if (g.mode === 'remote') {
      label = g.timer < 180 ? String(Math.max(1, Math.ceil(g.timer / 60))) : 'R';
      labelColor = '#60f0ff';
      v.model.casingMaterial.color.setHex(0x18a8c4);
      const on = Math.sin(time * 5) > 0;
      v.model.lampMaterial.color.setHex(0x40d0ff);
      v.model.lampMaterial.emissive.setHex(0x2098ff);
      v.model.lampMaterial.emissiveIntensity = on ? 2.4 : 0.5;
      v.model.body.position.set(0, 0, 0);
      v.model.body.scale.setScalar(1);
      v.model.glow.material.opacity = g.timer < 180 ? 0.5 + 0.4 * Math.sin(time * 18) : 0.25;
      v.model.glow.material.color.setHex(0x28c8ff);
      padMat.color.setHex(0x28c8ff);
      padMat.opacity = 0.65;
      v.pad.scale.setScalar(0.95);
    } else {
      label = 'X';
      labelColor = '#9aa3ad';
      v.model.casingMaterial.color.setHex(0x6b6f76);
      v.model.lampMaterial.emissiveIntensity = 0;
      v.model.lampMaterial.color.setHex(0x333333);
      v.model.body.position.set(0, 0, 0);
      v.model.body.scale.setScalar(1);
      v.model.glow.material.opacity = 0;
    }
    const key = label + labelColor;
    if (key !== v.shown) {
      v.shown = key;
      v.label.material.map = labelTexture(label, labelColor, 'bold 64px system-ui, sans-serif');
      v.label.material.needsUpdate = true;
    }
    v.label.position.set(w.x, lift + 1.14, w.z - 0.1);
    v.label.material.opacity = g.carriedBy !== null ? 0.9 : 1;
  }

  dispose(): void {
    for (const v of this.visuals.values()) {
      v.model.casingMaterial.dispose();
      v.model.lampMaterial.dispose();
      v.label.material.dispose();
      (v.shadow.material as MeshBasicMaterial).dispose();
      (v.pad.material as MeshBasicMaterial).dispose();
      (v.pedestal.material as MeshStandardMaterial).dispose();
    }
    this.visuals.clear();
  }
}
