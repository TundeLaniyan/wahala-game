import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial } from 'three';
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
  shown: string;
}

const shadowGeo = new PlaneGeometry(0.8, 0.8);

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
        this.group.remove(v.model.root, v.label, v.shadow);
        v.model.casingMaterial.dispose();
        v.model.lampMaterial.dispose();
        v.label.material.dispose();
        (v.shadow.material as MeshBasicMaterial).dispose();
        this.visuals.delete(id);
      }
    }
  }

  private create(_g: Generator): Visual {
    const model = createGeneratorModel();
    const label = new Sprite(
      new SpriteMaterial({ map: labelTexture('3'), transparent: true, depthTest: false }),
    );
    label.scale.set(0.8, 0.3, 1);
    label.renderOrder = 30;
    const shadow = new Mesh(
      shadowGeo,
      new MeshBasicMaterial({
        map: glowTexture(),
        color: 0x000000,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 3;
    this.group.add(model.root, label, shadow);
    return { model, label, shadow, shown: '' };
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
    v.model.root.position.set(w.x, lift, w.z);
    v.model.root.scale.setScalar(1.25);
    v.shadow.position.set(w.x, 0.02, w.z);
    v.shadow.scale.setScalar(lift > 0.2 ? Math.max(0.5, 1 - lift * 0.2) : 1);

    // Mode-specific look.
    const timed = g.mode === 'timed';
    const frac = timed ? Math.max(0, g.timer / cfg.fuseTicks) : 1;
    const urgent = timed ? 1 - Math.min(1, frac) : 0;
    v.model.antenna.visible = g.mode === 'remote';
    let label: string;
    let labelColor: string;
    if (timed) {
      label = String(Math.max(1, Math.ceil((g.timer - alpha) / 60)));
      labelColor = g.timer < 70 ? '#ff5a4a' : '#ffffff';
      v.model.casingMaterial.color.setHex(0xd8301f);
      const rate = 5 + urgent * 22;
      const on = Math.sin(time * rate) > 0;
      v.model.lampMaterial.emissiveIntensity = on ? 2 : 0.25;
      v.model.lampMaterial.color.setHex(0xff2200);
      v.model.lampMaterial.emissive.setHex(0xff2200);
      const shake = 0.004 + urgent * urgent * 0.03;
      v.model.body.position.set(Math.sin(time * 70) * shake, 0, Math.cos(time * 63) * shake);
      const pulse = 1 + Math.max(0, urgent - 0.7) * 0.25 * Math.sin(time * 40);
      v.model.body.scale.setScalar(pulse);
      v.model.glow.material.opacity = Math.max(0, urgent - 0.55) * (on ? 1.2 : 0.5);
      v.model.glow.material.color.setHex(0xff4020);
    } else if (g.mode === 'remote') {
      label = g.timer < 180 ? String(Math.max(1, Math.ceil(g.timer / 60))) : 'R';
      labelColor = '#ff7ac0';
      v.model.casingMaterial.color.setHex(0xc4286e);
      const on = Math.sin(time * 4) > 0;
      v.model.lampMaterial.color.setHex(0x40a0ff);
      v.model.lampMaterial.emissive.setHex(0x2080ff);
      v.model.lampMaterial.emissiveIntensity = on ? 2 : 0.4;
      v.model.body.position.set(0, 0, 0);
      v.model.body.scale.setScalar(1);
      v.model.glow.material.opacity = g.timer < 180 ? 0.5 + 0.4 * Math.sin(time * 18) : 0;
      v.model.glow.material.color.setHex(0xff3c8c);
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
    v.label.position.set(w.x, lift + 1.0, w.z - 0.1);
    v.label.material.opacity = g.carriedBy !== null ? 0.9 : 1;
  }

  dispose(): void {
    for (const v of this.visuals.values()) {
      v.model.casingMaterial.dispose();
      v.model.lampMaterial.dispose();
      v.label.material.dispose();
    }
    this.visuals.clear();
  }
}
