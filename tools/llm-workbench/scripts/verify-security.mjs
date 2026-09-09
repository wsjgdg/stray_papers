// Phase 2 安全加固回归：
//  1) KDF 参数版本化：旧档案（无 kdfParams）仍可登录，新档案用更强的默认参数；
//  2) 档案 id 使用 UUID，密码校验走恒定时间比较且不因参数升级而失效；
//  3) PROXY_TOKEN 开启时 /api/proxy 与 /api/v1 拒绝无令牌请求。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// ── 隔离 HOME：auth.ts 在模块加载时就根据 home 计算 auth.json 路径，必须先设置再导入 ──
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-sec-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(path.join(HOME, '.llm-workbench'), { recursive: true });
process.env.USERPROFILE = HOME;
process.env.HOME = HOME;

const {
  deriveKey,
  encryptWithKey,
  decryptWithKey,
  resolveScryptParams,
  DEFAULT_SCRYPT,
  LEGACY_SCRYPT,
} = await import('../server/crypto.ts');
const auth = await import('../server/auth.ts');
const cfgmod = await import('../server/config.ts');

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1) 旧档案（无 kdfParams）仍可登录 ──
{
  const salt = Buffer.from('legacy-salt-0123456');
  const verifier = deriveKey('legacy-pw', salt, LEGACY_SCRYPT).toString('base64');
  fs.writeFileSync(
    path.join(HOME, '.llm-workbench', 'auth.json'),
    JSON.stringify(
      [{ id: 'admin', name: '管理员', role: 'admin', salt: salt.toString('base64'), verifier }],
      null,
      2,
    ),
  );
  auth.loadProfiles();
  check('旧档案（无 kdfParams）可登录', auth.authenticate('admin', 'legacy-pw') === 'admin');
  check('旧档案错误密码被拒', auth.authenticate('admin', 'wrong') === null);
}

// ── 2) 新档案使用更强的默认 KDF 参数 + UUID id ──
{
  const r = auth.createProfile('bob', 'viewer', 'bob-pw');
  assert.ok('id' in r, `createProfile 失败: ${JSON.stringify(r)}`);
  const p = auth.listProfiles().find((x) => x.name === 'bob');
  check(
    '新建档案 id 为 UUID',
    /^p_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.id),
    p.id,
  );

  const raw = JSON.parse(fs.readFileSync(path.join(HOME, '.llm-workbench', 'auth.json'), 'utf8'));
  const bob = raw.find((x) => x.name === 'bob');
  check('新档案记录 kdfParams', bob.kdfParams?.N === DEFAULT_SCRYPT.N, `N=${bob.kdfParams?.N}`);
  check(
    '默认 N 已提升',
    DEFAULT_SCRYPT.N > LEGACY_SCRYPT.N,
    `${LEGACY_SCRYPT.N} → ${DEFAULT_SCRYPT.N}`,
  );

  auth.loadProfiles();
  check('新档案可登录', auth.authenticate(p.id, 'bob-pw') === 'viewer');
  check('新档案错误密码被拒', auth.authenticate(p.id, 'nope') === null);
}

// ── 3) 加密 blob 的 KDF 参数版本化 ──
{
  const key = deriveKey('pw', Buffer.from('some-salt-0123456'), DEFAULT_SCRYPT);
  const blob = encryptWithKey({ providers: {} }, key);
  check('新 blob 记录 kdfParams', blob.kdfParams?.N === DEFAULT_SCRYPT.N, `N=${blob.kdfParams?.N}`);

  // 历史 blob：用 LEGACY 参数派生，且未记录 kdfParams
  const salt = Buffer.from('legacy-blob-salt-0123');
  const legacyKey = deriveKey('pw', salt, LEGACY_SCRYPT);
  const legacy = encryptWithKey(
    { providers: { a: { apiKey: 'k', enabled: true } } },
    legacyKey,
    salt,
  );
  delete legacy.kdfParams;
  const restored = decryptWithKey(
    legacy,
    deriveKey('pw', Buffer.from(legacy.salt, 'base64'), resolveScryptParams(legacy.kdfParams)),
  );
  check('历史 blob（无 kdfParams）可解密', restored.providers?.a?.apiKey === 'k');
  check('resolveScryptParams 回退到旧参数', resolveScryptParams(undefined).N === LEGACY_SCRYPT.N);
  check('resolveScryptParams 保留记录值', resolveScryptParams({ N: 999, r: 8, p: 1 }).N === 999);
}

// ── 4) 配置加密闭环：启用 → 重启载入 → 解锁（历史 bug：salt 不一致导致解锁必失败） ──
{
  const CFG = path.join(HOME, '.llm-workbench', 'config.json');
  fs.rmSync(CFG, { force: true });
  cfgmod.initConfigStore();
  cfgmod.upsertProvider('openai', { apiKey: 'sk-round-trip', enabled: true });

  check('启用加密成功', cfgmod.enableEncryption('master-pw') === true);
  const raw = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  check('落盘为加密 blob', raw.enc === 'aes-256-gcm');

  // 模拟进程重启
  cfgmod.initConfigStore();
  check('重启后处于锁定态', cfgmod.isLocked() === true && cfgmod.isEncrypted() === true);
  check('错误密码解锁失败', cfgmod.unlock('wrong-pw') === false);
  check('正确密码解锁成功', cfgmod.unlock('master-pw') === true);
  check('解锁后配置可读', cfgmod.loadConfig().providers?.openai?.apiKey === 'sk-round-trip');

  // 解锁后继续保存不应破坏 salt
  cfgmod.upsertProvider('openai', { apiKey: 'sk-updated', enabled: true });
  cfgmod.initConfigStore();
  check('解锁后再次保存仍可解锁', cfgmod.unlock('master-pw') === true);
  check('保存内容正确', cfgmod.loadConfig().providers?.openai?.apiKey === 'sk-updated');

  check('关闭加密成功', cfgmod.disableEncryption() === true);
  const plain = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  check('关闭后为明文落盘', plain.providers?.openai?.apiKey === 'sk-updated');
}

// ── 4) PROXY_TOKEN 端到端 ──
const NODE = 'C:/Users/sibop/.workbuddy/binaries/node/versions/22.22.2-2/node.exe';
const TSX = path.resolve('node_modules/tsx/dist/cli.mjs');
const ROOT = process.cwd();
const API = 8991 + Math.floor(Math.random() * 8);
const TOKEN = 'tok-abc-123';

const srv = spawn(NODE, [TSX, 'server/index.ts'], {
  cwd: ROOT,
  env: {
    ...process.env,
    API_PORT: String(API),
    USERPROFILE: HOME,
    HOME,
    NO_OPEN: '1',
    NO_REUSE: '1',
    PROXY_TOKEN: TOKEN,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stdout.on('data', () => {});
srv.stderr.on('data', (d) => process.stderr.write(`[srv] ${d}`));

let healthy = false;
for (let i = 0; i < 60 && !healthy; i++) {
  try {
    healthy = (await fetch(`http://127.0.0.1:${API}/api/health`)).ok;
  } catch {}
  if (!healthy) await sleep(300);
}
check('server healthy (PROXY_TOKEN 已启用)', healthy);

{
  const base = `http://127.0.0.1:${API}`;
  const noTok = await fetch(`${base}/api/proxy/config`);
  check('无令牌访问 /api/proxy 被拒', noTok.status === 401, `status=${noTok.status}`);

  const badTok = await fetch(`${base}/api/proxy/config`, { headers: { 'x-proxy-token': 'wrong' } });
  check('错误令牌被拒', badTok.status === 401, `status=${badTok.status}`);

  const viaHeader = await fetch(`${base}/api/proxy/config`, {
    headers: { 'x-proxy-token': TOKEN },
  });
  check('x-proxy-token 放行', viaHeader.ok, `status=${viaHeader.status}`);

  const viaBearer = await fetch(`${base}/api/proxy/metrics`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  check('Authorization: Bearer 放行', viaBearer.ok, `status=${viaBearer.status}`);

  const v1 = await fetch(`${base}/api/v1/chat/completions`, { method: 'POST' });
  check('无令牌访问 /api/v1 被拒', v1.status === 401, `status=${v1.status}`);

  const health = await fetch(`${base}/api/health`);
  check('/api/health 不受令牌影响', health.ok, `status=${health.status}`);
}

srv.kill();
fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
