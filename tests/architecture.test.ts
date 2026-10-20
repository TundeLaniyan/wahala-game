import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
  });
}

function imports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

const FRAMEWORKS = /^(three|react|react-dom|zustand)(\/|$)/;

describe('layering rules', () => {
  it('src/sim is pure: no frameworks, no outer layers, no browser globals or Math.random', () => {
    for (const f of files('src/sim')) {
      for (const i of imports(f)) {
        expect(FRAMEWORKS.test(i), `${f} imports ${i}`).toBe(false);
        expect(/\.\.\/(render|ui|audio|input|app|ai)(\/|$)/.test(i), `${f} imports ${i}`).toBe(false);
      }
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/Math\.random|Date\.now|\bdocument\.|\bwindow\./);
    }
  });

  it('src/ai only depends on the simulation', () => {
    for (const f of files('src/ai')) {
      for (const i of imports(f)) {
        expect(FRAMEWORKS.test(i), `${f} imports ${i}`).toBe(false);
        if (i.startsWith('..')) expect(/^\.\.\/sim(\/|$)/.test(i), `${f} imports ${i}`).toBe(true);
      }
    }
  });

  it('render, ui, audio and input never import each other except through shared assets and the sim', () => {
    const allowed: Record<string, RegExp> = {
      render: /^\.\.\/(\.\.\/)?(sim|assets)(\/|$)/,
      audio: /^\.\.\/(sim)(\/|$)/,
      input: /^\.\.\/sim(\/|$)/,
    };
    for (const [layer, rule] of Object.entries(allowed)) {
      for (const f of files(`src/${layer}`)) {
        for (const i of imports(f)) {
          if (!i.startsWith('../')) continue;
          const toOuter = /^(\.\.\/)+(render|ui|audio|input|app|ai)(\/|$)/.test(i);
          if (toOuter) expect(rule.test(i), `${f} imports ${i}`).toBe(true);
        }
      }
    }
  });

  it('game balance numbers live in config: systems do not hardcode fuse or range constants', () => {
    for (const f of files('src/sim/systems')) {
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toMatch(/\b(180|7200)\b/);
    }
  });
});
