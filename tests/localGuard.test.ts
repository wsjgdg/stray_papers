import { describe, expect, it, beforeEach } from 'vitest';
import { isAllowedOrigin } from '../server/localGuard.js';
import { loginThrottle, recordLoginFailure, clearLoginFailures } from '../server/auth.js';

describe('A1 isAllowedOrigin', () => {
  const prev = process.env.ALLOWED_ORIGINS;
  beforeEach(() => {
    process.env.ALLOWED_ORIGINS = '';
  });

  it('放行回环地址（含开发态其它端口）', () => {
    expect(isAllowedOrigin('http://127.0.0.1:8787')).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://[::1]:8787')).toBe(true);
  });

  it('放行空 Origin（curl / SDK / Prometheus）与 file:// 的 opaque origin', () => {
    expect(isAllowedOrigin('')).toBe(true);
    expect(isAllowedOrigin('null')).toBe(true);
  });

  it('拒绝外部站点', () => {
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false);
    expect(isAllowedOrigin('http://192.168.1.9:8787')).toBe(false);
    expect(isAllowedOrigin('not a url')).toBe(false);
  });

  it('ALLOWED_ORIGINS 可追加白名单', () => {
    process.env.ALLOWED_ORIGINS = 'https://intranet.example.com, https://ops.example.com';
    expect(isAllowedOrigin('https://intranet.example.com')).toBe(true);
    expect(isAllowedOrigin('https://ops.example.com')).toBe(true);
    expect(isAllowedOrigin('https://other.example.com')).toBe(false);
    process.env.ALLOWED_ORIGINS = prev ?? '';
  });
});

describe('A2 login throttle', () => {
  beforeEach(() => clearLoginFailures('t'));

  it('无失败记录时不拦截', () => {
    expect(loginThrottle('t').blocked).toBe(false);
  });

  it('失败退避按 1s/2s/4s 递增', () => {
    expect(recordLoginFailure('t')).toBe(1_000);
    expect(recordLoginFailure('t')).toBe(2_000);
    expect(recordLoginFailure('t')).toBe(4_000);
  });

  it('退避期内被拦截，且报告剩余等待', () => {
    recordLoginFailure('t');
    const g = loginThrottle('t');
    expect(g.blocked).toBe(true);
    expect(g.retryAfterMs).toBeGreaterThan(0);
    expect(g.retryAfterMs).toBeLessThanOrEqual(1_000);
  });

  it('连续失败达阈值进入 5 分钟锁定', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure('t');
    const g = loginThrottle('t');
    expect(g.locked).toBe(true);
    expect(g.retryAfterMs).toBeGreaterThan(4 * 60_000);
  });

  it('成功后清零', () => {
    recordLoginFailure('t');
    clearLoginFailures('t');
    expect(loginThrottle('t').blocked).toBe(false);
  });

  it('不同 key 互不影响', () => {
    recordLoginFailure('a');
    expect(loginThrottle('b').blocked).toBe(false);
    clearLoginFailures('a');
  });
});
