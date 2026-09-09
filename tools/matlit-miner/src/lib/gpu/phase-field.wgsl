struct Params { time: f32, texel: vec2f }
@group(0) @binding(0) var<uniform> params: Params;

fn palette(t: f32) -> vec3f {
  let a = vec3f(0.5, 0.5, 0.5);
  let b = vec3f(0.5, 0.5, 0.5);
  let c = vec3f(1.0, 1.0, 1.0);
  let d = vec3f(0.0, 0.10, 0.20);
  return a + b * cos(6.28318 * (c * t + d));
}

// Phase-diagram field: x = composition axis, y = temperature (normalized).
// A curved liquidus/solidus boundary separates solid-rich (bottom) from
// liquid-rich (top) phases; a GPU-driven ripple modulates the colour ramp.
@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let x = uv.x;
  let y = uv.y;
  let boundary = 0.5 + 0.25 * sin(x * 6.28318);
  let phase = smoothstep(boundary - 0.02, boundary + 0.02, y);
  let ripple = 0.5 + 0.5 * sin((x + y) * 20.0 + params.time * 1.5);
  let t = mix(phase * 0.35, phase * 0.35 + 0.4, ripple);
  let col = palette(t + params.time * 0.05);
  return vec4f(col, 1.0);
}
