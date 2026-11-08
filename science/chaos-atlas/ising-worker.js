'use strict';
importScripts('ising-model.js?v=20261031-3','crystal-model.js?v=20261101-5','ising-crystal-model.js?v=20261101-5');
let model = null, generation = -1, token = 0, probeIndex = null, ready = false;

function send(kind, requestId) {
  const spins = model.spins.slice();
  const packet = { kind, generation, requestId, spins:spins.buffer, stats:model.stats(),
    probe:probeIndex == null ? null : model.local(probeIndex) };
  self.postMessage(packet, [spins.buffer]);
}
function begin(m) {
  const myToken = ++token;
  generation = m.generation; ready = false; model = null; probeIndex = null;
  const warm = m.warm == null ? 0 : m.warm;
  if (!Number.isInteger(warm) || warm < 0 || warm > 2000) throw new Error('预演扫描数必须在 0–2000 之间。');
  model = m.options && m.options.structure
    ? new self.CrystalIsing.IsingCrystal(m.options)
    : new self.IsingLattice.Ising3D(m.options);
  if (m.probeIndex != null) { model.checkIndex(m.probeIndex); probeIndex = m.probeIndex; }
  let completed = 0;
  function chunk() {
    if (myToken !== token) return;
    try {
      const start = performance.now();
      while (completed < warm && performance.now() - start < 14) { model.sweep(1, false); completed++; }
      if (completed < warm) {
        self.postMessage({ kind:'progress', generation, completed, warm });
        setTimeout(chunk, 0);
      } else {
        // Prewarming is not included in the window used for response estimates.
        model.clearSamples(); ready = true; send('ready', m.requestId);
      }
    } catch (error) {
      if (myToken === token) self.postMessage({ kind:'error', generation, requestId:m.requestId, message:String(error && error.message || error) });
    }
  }
  chunk();
}
self.onmessage = event => {
  const m = event.data || {};
  try {
    if (m.type === 'reset') { begin(m); return; }
    if (!ready || !model || m.generation !== generation) return;
    if (m.type === 'advance') {
      if (!Number.isInteger(m.sweeps) || m.sweeps < 1 || m.sweeps > 16) throw new Error('单次后台扫描数必须在 1–16 之间。');
      model.sweep(m.sweeps); send('frame', m.requestId);
    } else if (m.type === 'configure') {
      model.configure({ temperature:m.temperature, field:m.field }); send('configured', m.requestId);
    } else if (m.type === 'probe') {
      if (m.index != null) model.checkIndex(m.index);
      probeIndex = m.index == null ? null : m.index; send('probed', m.requestId);
    } else if (m.type === 'flip') {
      model.flip(m.index); probeIndex = m.index; send('flipped', m.requestId);
    } else if (m.type === 'inspect') send('inspected', m.requestId);
    else throw new Error('未知后台指令。');
  } catch (error) {
    self.postMessage({ kind:'error', generation:m.generation, requestId:m.requestId, message:String(error && error.message || error) });
  }
};
