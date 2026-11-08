/* Generic additive site-local field profiles shared by finite-chain sandboxes. */
export const LOCAL_FIELD_SHAPES = ['gaussian', 'box', 'staggered'];

export function normalizeLocalFieldObjects(L, objects, options = {}){
  const maxObjects = options.maxObjects ?? 24;
  const maxAmplitude = options.maxAmplitude ?? Infinity;
  const minWidth = options.minWidth ?? 0.5;
  const maxWidth = options.maxWidth ?? 8;
  if (!Number.isInteger(L) || L < 1 || L > 22 || !Array.isArray(objects) || objects.length > maxObjects){
    throw new RangeError('normalizeLocalFieldObjects: invalid chain length or object count');
  }
  const ids = new Set();
  return objects.map((o, i) => {
    if (!o) throw new TypeError(`normalizeLocalFieldObjects: invalid field object ${i}`);
    const id = String(o.id ?? `field-${i + 1}`);
    if (!LOCAL_FIELD_SHAPES.includes(o.shape) || !Number.isFinite(o.center) || !Number.isFinite(o.width) ||
        o.width < minWidth || o.width > maxWidth || !Number.isFinite(o.amp) || Math.abs(o.amp) > maxAmplitude ||
        o.center < 0 || o.center > L - 1){
      throw new TypeError(`normalizeLocalFieldObjects: invalid field object ${i}`);
    }
    if (ids.has(id)) throw new TypeError(`normalizeLocalFieldObjects: duplicate id ${id}`);
    ids.add(id);
    return { id, shape: o.shape, center: +o.center, width: +o.width, amp: +o.amp };
  });
}

export function composeLocalField(L, base = null, objects = [], options = {}){
  if (!Number.isInteger(L) || L < 1 || L > 22) throw new RangeError('composeLocalField: invalid chain length');
  if (base && base.length !== L) throw new RangeError('composeLocalField: base field length must equal L');
  const list = normalizeLocalFieldObjects(L, objects, options);
  const field = Float64Array.from({ length: L }, (_, i) => base ? (Number(base[i]) || 0) : 0);
  for (const o of list){
    for (let i = 0; i < L; i++){
      const dx = i - o.center, ad = Math.abs(dx);
      let weight = 0;
      if (o.shape === 'gaussian') weight = Math.exp(-0.5 * (dx / o.width) ** 2);
      else if (ad <= o.width + 1e-12){
        weight = o.shape === 'box' ? 1 : (Math.round(dx) % 2 === 0 ? 1 : -1);
      }
      field[i] += o.amp * weight;
    }
  }
  return field;
}
