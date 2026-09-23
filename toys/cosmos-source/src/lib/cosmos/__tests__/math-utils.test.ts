import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  unitDir, dirToRADec, dirToAltAz, rotMatrix, posAU,
  scalePos, K, POW, fmtRA, fmtDec, fmtP, fmtLy, fmtMpc, galacticDir,
} from '../math-utils';

const len = (v: THREE.Vector3) => v.length();

describe('unitDir / dirToRADec', () => {
  it('produces a unit vector', () => {
    for (const [ra, dec] of [[0, 0], [6, 45], [18, -30], [23.5, 89]] as const) {
      expect(len(unitDir(ra, dec))).toBeCloseTo(1, 6);
    }
  });

  it('round-trips through dirToRADec', () => {
    const [ra, dec] = [5.5, -22.3];
    const [ra2, dec2] = dirToRADec(unitDir(ra, dec));
    expect(ra2).toBeCloseTo(ra, 5);
    expect(dec2).toBeCloseTo(dec, 5);
  });
});

describe('dirToAltAz', () => {
  it('returns alt in [-90,90] and az in [0,360)', () => {
    const [alt, az] = dirToAltAz(unitDir(3, 10));
    expect(alt).toBeGreaterThanOrEqual(-90);
    expect(alt).toBeLessThanOrEqual(90);
    expect(az).toBeGreaterThanOrEqual(0);
    expect(az).toBeLessThan(360);
  });
});

describe('rotMatrix', () => {
  it('is a proper rotation (det ≈ 1, orthonormal)', () => {
    const m = rotMatrix({ Om: 30, i: 7, w: 120 });
    expect(m.determinant()).toBeCloseTo(1, 6);
    const I = m.clone().transpose().multiply(m);
    for (let i = 0; i < 16; i++) {
      const expected = i % 5 === 0 ? 1 : 0;
      expect(Math.abs(I.elements[i] - expected)).toBeLessThan(1e-6);
    }
  });
});

describe('scalePos', () => {
  it('monotonically increases with distance', () => {
    const near = scalePos(new THREE.Vector3(10, 0, 0)).length();
    const far = scalePos(new THREE.Vector3(100, 0, 0)).length();
    expect(far).toBeGreaterThan(near);
  });

  it('compresses by the documented K / POW law', () => {
    const p = new THREE.Vector3(1000, 0, 0);
    expect(scalePos(p).length()).toBeCloseTo(K * Math.pow(1000, POW - 1) * 1000, 6);
  });
});

describe('posAU', () => {
  const body = { M0: 0, P: 365.25, e: 0.1, a: 1, Om: 0, i: 0, w: 0 };
  it('returns a finite, deterministic position', () => {
    const p1 = posAU({ ...body } as any, 0);
    const p2 = posAU({ ...body } as any, 0);
    expect(Number.isFinite(p1.x)).toBe(true);
    expect(p1.x).toBeCloseTo(0.9, 6);
    expect(p1.length()).toBeCloseTo(0.9, 6);
    expect(p2.x).toBeCloseTo(p1.x, 9);
  });
});

describe('formatters', () => {
  it('fmtRA', () => {
    expect(fmtRA(1.5)).toBe('1h 30m');
    expect(fmtRA(0)).toBe('0h 00m');
  });
  it('fmtDec', () => {
    expect(fmtDec(23.5)).toBe('+23° 30′');
    expect(fmtDec(-10.25)).toBe('−10° 15′');
  });
  it('fmtP', () => {
    expect(fmtP(400)).toBe('400.0 天');
    expect(fmtP(730)).toBe('2.0 年');
  });
  it('fmtLy / fmtMpc', () => {
    expect(fmtLy(500)).toBe('500 ly');
    expect(fmtLy(1e9)).toBe('1.00 Gly');
    expect(fmtMpc(2.5)).toBe('2.5 Mpc');
    expect(fmtMpc(0.5)).toBe('500 kpc');
  });
});

describe('galacticDir', () => {
  it('produces a unit vector', () => {
    expect(len(galacticDir(120, -30))).toBeCloseTo(1, 6);
  });
});
