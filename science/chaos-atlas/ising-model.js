/* A three-dimensional, nearest-neighbour, ferromagnetic Ising model.
 * J = k_B = 1; periodic boundary conditions; random-site Metropolis updates.
 * The dynamics are Markov-chain sampling steps, not physical time. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IsingLattice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const WINDOW = 256, CRITICAL_T = 4.5115;
  const finite = Number.isFinite;
  function validateSize(size) {
    if (!Number.isInteger(size) || size < 2 || size > 32) throw new Error('晶格边长必须是 2–32 的整数。');
  }
  function validateTemperature(temperature) {
    if (!finite(temperature) || temperature < .25 || temperature > 20) throw new Error('温度必须在 0.25–20 之间。');
  }
  function validateField(field) {
    if (!finite(field) || field < -5 || field > 5) throw new Error('外场必须在 −5–5 之间。');
  }
  function validateSeed(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('随机种子必须是 0–4294967295 的整数。');
  }

  class Ising3D {
    constructor(options = {}) {
      const size = options.size == null ? 20 : options.size;
      const temperature = options.temperature == null ? CRITICAL_T : options.temperature;
      const field = options.field == null ? 0 : options.field;
      const seed = options.seed == null ? 20261031 : options.seed;
      const initial = options.initial == null ? 'random' : options.initial;
      validateSize(size); validateTemperature(temperature); validateField(field); validateSeed(seed);
      if (!['random', 'up', 'down', 'domains'].includes(initial)) throw new Error('未知初始排列。');
      this.size = size; this.count = size * size * size;
      this.temperature = temperature; this.field = field; this.seed = seed;
      this.rngState = seed >>> 0; this.initial = initial;
      this.neighbors = new Uint32Array(this.count * 6);
      this.spins = new Int8Array(this.count);
      const n = size, plane = n * n;
      for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = x + n * y + plane * z, p = 6 * i;
        this.neighbors[p] = (x + 1) % n + n * y + plane * z;
        this.neighbors[p + 1] = (x + n - 1) % n + n * y + plane * z;
        this.neighbors[p + 2] = x + n * ((y + 1) % n) + plane * z;
        this.neighbors[p + 3] = x + n * ((y + n - 1) % n) + plane * z;
        this.neighbors[p + 4] = x + n * y + plane * ((z + 1) % n);
        this.neighbors[p + 5] = x + n * y + plane * ((z + n - 1) % n);
      }
      if (options.spins != null) {
        if (options.spins.length !== this.count) throw new Error('初始自旋数量不匹配。');
        for (let i = 0; i < this.count; i++) {
          const s = options.spins[i]; if (s !== 1 && s !== -1) throw new Error('自旋必须为 +1 或 −1。');
          this.spins[i] = s;
        }
      } else for (let i = 0; i < this.count; i++) {
        this.spins[i] = initial === 'up' ? 1 : initial === 'down' ? -1 : initial === 'domains' ? (i % n < n / 2 ? 1 : -1) : this.random() < .5 ? -1 : 1;
      }
      this.spinSum = 0; for (const spin of this.spins) this.spinSum += spin;
      this.energy = this.recomputeEnergy();
      this.sweeps = 0; this.lastAttempts = 0; this.lastAccepted = 0; this.manualFlips = 0;
      this.sampleM = new Float64Array(WINDOW); this.sampleE = new Float64Array(WINDOW);
      this.sampleCount = 0; this.sampleCursor = 0;
      this.updateProbabilities();
    }
    random() {
      // Mulberry32: a reproducible 32-bit pseudo-random stream, in [0,1).
      this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
      let t = this.rngState;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    updateProbabilities() {
      this.probabilities = new Float64Array(14);
      for (let sign = -1; sign <= 1; sign += 2) for (let sum = -6; sum <= 6; sum += 2) {
        const dE = 2 * sign * (sum + this.field);
        this.probabilities[(sign > 0 ? 7 : 0) + (sum + 6) / 2] = dE <= 0 ? 1 : Math.exp(-dE / this.temperature);
      }
    }
    configure(options = {}) {
      const temperature = options.temperature == null ? this.temperature : options.temperature;
      const field = options.field == null ? this.field : options.field;
      // Validate the entire requested update before changing anything.
      validateTemperature(temperature); validateField(field);
      if (temperature === this.temperature && field === this.field) return false;
      this.energy -= (field - this.field) * this.spinSum;
      this.temperature = temperature; this.field = field; this.updateProbabilities();
      this.clearSamples(); this.lastAttempts = 0; this.lastAccepted = 0;
      return true;
    }
    clearSamples() { this.sampleCount = 0; this.sampleCursor = 0; }
    recordSample() {
      this.sampleM[this.sampleCursor] = this.spinSum / this.count;
      this.sampleE[this.sampleCursor] = this.energy / this.count;
      this.sampleCursor = (this.sampleCursor + 1) % WINDOW;
      this.sampleCount = Math.min(WINDOW, this.sampleCount + 1);
    }
    checkIndex(i) {
      if (!Number.isInteger(i) || i < 0 || i >= this.count) throw new Error('自旋位置不在晶格内。');
    }
    neighborSum(i) {
      const p = i * 6, n = this.neighbors, s = this.spins;
      return s[n[p]] + s[n[p + 1]] + s[n[p + 2]] + s[n[p + 3]] + s[n[p + 4]] + s[n[p + 5]];
    }
    local(i) {
      this.checkIndex(i);
      const spin = this.spins[i], sum = this.neighborSum(i), deltaEnergy = 2 * spin * (sum + this.field);
      const probability = this.probabilities[(spin > 0 ? 7 : 0) + (sum + 6) / 2];
      const x = i % this.size, y = Math.floor(i / this.size) % this.size, z = Math.floor(i / (this.size * this.size));
      return { index:i, x, y, z, spin, neighborSum:sum, deltaEnergy, probability };
    }
    flip(i) {
      // A user intervention is not a Metropolis proposal; it resets the
      // measurement window and leaves the MC clock and RNG unchanged.
      const local = this.local(i);
      this.spins[i] = -local.spin; this.spinSum -= 2 * local.spin; this.energy += local.deltaEnergy;
      this.manualFlips++; this.clearSamples(); this.lastAttempts = 0; this.lastAccepted = 0;
      return this.local(i);
    }
    sweep(count = 1, record = true) {
      if (!Number.isInteger(count) || count < 1 || count > 2000) throw new Error('扫描次数必须是 1–2000 的整数。');
      let accepted = 0;
      const n = this.neighbors, s = this.spins, probabilities = this.probabilities, total = this.count;
      for (let sweep = 0; sweep < count; sweep++) {
        for (let trial = 0; trial < total; trial++) {
          const i = Math.floor(this.random() * total), p = i * 6, spin = s[i];
          const sum = s[n[p]] + s[n[p + 1]] + s[n[p + 2]] + s[n[p + 3]] + s[n[p + 4]] + s[n[p + 5]];
          const probability = probabilities[(spin > 0 ? 7 : 0) + (sum + 6) / 2];
          if (probability >= 1 || this.random() < probability) {
            s[i] = -spin; this.spinSum -= 2 * spin; this.energy += 2 * spin * (sum + this.field); accepted++;
          }
        }
        this.sweeps++;
        if (record) this.recordSample();
      }
      this.lastAttempts = total * count; this.lastAccepted = accepted;
      return this.stats();
    }
    recomputeEnergy() {
      // Count the +x, +y and +z bond once per site. For a size-2 periodic
      // lattice these are distinct wraparound bonds, as on the periodic graph.
      let bonds = 0, magnetization = 0;
      for (let i = 0; i < this.count; i++) {
        const p = 6 * i, spin = this.spins[i]; magnetization += spin;
        bonds += spin * (this.spins[this.neighbors[p]] + this.spins[this.neighbors[p + 2]] + this.spins[this.neighbors[p + 4]]);
      }
      return -bonds - this.field * magnetization;
    }
    stats() {
      const count = this.sampleCount, m = this.spinSum / this.count, e = this.energy / this.count;
      let meanM = 0, meanAbsM = 0, meanE = 0, varianceM = 0, varianceE = 0;
      for (let i = 0; i < count; i++) {meanM += this.sampleM[i]; meanAbsM += Math.abs(this.sampleM[i]); meanE += this.sampleE[i];}
      if (count) {
        meanM /= count; meanAbsM /= count; meanE /= count;
        for (let i = 0; i < count; i++) {
          varianceM += (this.sampleM[i] - meanM) ** 2;
          varianceE += (this.sampleE[i] - meanE) ** 2;
        }
        varianceM /= count; varianceE /= count;
      }
      return {
        size:this.size, count:this.count, temperature:this.temperature, field:this.field, seed:this.seed,
        initial:this.initial, sweeps:this.sweeps, magnetization:m, energyPerSpin:e, energy:this.energy,
        upFraction:(1 + m) / 2, neighborCorrelation:-(this.energy + this.field * this.spinSum) / (3 * this.count),
        acceptance:this.lastAttempts ? this.lastAccepted / this.lastAttempts : null,
        attempts:this.lastAttempts, accepted:this.lastAccepted, manualFlips:this.manualFlips,
        sampleCount:count, meanMagnetization:count ? meanM : null, meanAbsMagnetization:count ? meanAbsM : null,
        meanEnergyPerSpin:count ? meanE : null,
        susceptibility:count >= 16 ? this.count * varianceM / this.temperature : null,
        heatCapacity:count >= 16 ? this.count * varianceE / (this.temperature * this.temperature) : null
      };
    }
  }
  return { Ising3D, WINDOW, CRITICAL_T };
});
