struct Params {
  time: f32,
  count: u32,
  texel: vec2f,
}
@group(0) @binding(0) var<uniform> params: Params;

// Each point packs: x = normalized year, y = normalized efficiency,
// z = efficiency hue (0..1), w = weight (certified -> 1.0, else 0.4).
@group(0) @binding(1) var<uniform> points: array<vec4f, 512>;

const PAD: f32 = 0.08;

fn palette(t: f32) -> vec3f {
  let a = vec3f(0.5, 0.5, 0.5);
  let b = vec3f(0.5, 0.5, 0.5);
  let c = vec3f(1.0, 1.0, 1.0);
  let d = vec3f(0.0, 0.10, 0.20);
  return a + b * cos(6.28318 * (c * t + d));
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = params.texel.x / max(params.texel.y, 1.0);

  // Background + faint grid for axis readability.
  var col = vec3f(0.015, 0.02, 0.035);
  let span = 1.0 - 2.0 * PAD;
  let gx = abs(fract((uv.x - PAD) / span * 10.0) - 0.5);
  let gy = abs(fract((uv.y - PAD) / span * 10.0) - 0.5);
  let grid = smoothstep(0.46, 0.5, max(gx, gy)) * 0.05;
  col += vec3f(grid);

  // Accumulate gaussian glow per point -> density heatmap.
  var acc = vec3f(0.0);
  for (var i: u32 = 0u; i < params.count; i = i + 1u) {
    let p = points[i];
    let d = uv - p.xy;
    let dist = length(vec2f(d.x * aspect, d.y));
    let sigma = 0.016 + 0.012 * p.w;
    let glow = exp(-(dist * dist) / (2.0 * sigma * sigma));
    let base = palette(clamp(p.z, 0.0, 1.0));
    acc += base * glow * (0.45 + 0.9 * p.w);
    if (p.w > 0.5) {
      // Certified entries get a white-hot core.
      acc += vec3f(1.0) * glow * glow * 0.45;
    }
  }

  // Gentle field shimmer over time.
  acc *= 0.9 + 0.1 * sin(params.time * 0.6);
  col += acc;

  return vec4f(min(col, vec3f(1.0)), 1.0);
}
