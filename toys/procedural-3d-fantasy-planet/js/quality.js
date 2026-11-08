import { basePixelRatio } from './core.js';

// Watches smoothed frame time and steps through render tiers:
// pixel ratio, instanced prop counts (InstancedMesh.count is a cheap draw-range
// change — no re-upload) and the second cloud layer.
const tiers = [
  { name: 'HIGH', pixel: 1, flora: 1 },
  { name: 'BALANCED', pixel: 0.82, flora: 0.78 },
  { name: 'SMOOTH', pixel: 0.64, flora: 0.55 }
];

export function createAdaptiveQuality({ renderer, glowUniforms, instanced, cloudHigh, onTier }) {
  let tier = 0, warmup = 0, evalTimer = 0, ema = 1 / 60;
  let viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;

  function apply() {
    const current = tiers[tier];
    for (const entry of instanced) entry.mesh.count = Math.max(8, Math.round(entry.base * current.flora));
    if (cloudHigh) cloudHigh.visible = tier < 2;
    if (onTier) onTier(current.name);
  }
  function onResize(width, height) {
    viewportWidth = width;
    viewportHeight = height;
    renderer.setPixelRatio(basePixelRatio(width, height) * tiers[tier].pixel);
    if (glowUniforms) glowUniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  onResize(viewportWidth, viewportHeight);
  apply();

  function update(dt) {
    if (dt <= 0) return;
    warmup += dt;
    if (warmup < 3.5) return; // Ignore startup jank (shader compile, texture generation).
    ema += (dt - ema) * 0.05;
    evalTimer += dt;
    if (evalTimer < 2.25) return;
    evalTimer = 0;
    const next = ema > 0.021 ? Math.min(tiers.length - 1, tier + 1) : ema < 0.0138 ? Math.max(0, tier - 1) : tier;
    if (next !== tier) {
      tier = next;
      apply();
      onResize(viewportWidth, viewportHeight);
    }
  }

  return { update, onResize };
}
