import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeAll, afterAll } from 'vitest';

// 隔离 HOME，避免污染真实 ~/.llm-workbench（与 quota/replay 测试同法）
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-evals-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(path.join(HOME, '.llm-workbench'), { recursive: true });
process.env.USERPROFILE = HOME;
process.env.HOME = HOME;

const ev = await import('../server/evals.js');
const cfg = await import('../server/config.js');

const SET = {
  name: '单元测试集',
  models: ['m-a', 'm-b'],
  cases: [
    { input: 'q1', expect: 'yes' },
    { input: 'q2', expect: '42', judge: 'exact' as const },
    { input: 'q3', expect: '主观题参考答案', judge: 'llm' as const },
  ],
};

describe('Phase C: 评测集校验（C1）', () => {
  it('接受合法集合，judge 缺省不填（由判分逻辑推导）', () => {
    const s = ev.parseEvalSet(SET);
    assert.ok(s);
    assert.equal(s!.models.length, 2);
    assert.equal(s!.cases.length, 3);
    assert.equal(s!.cases[0].judge, undefined);
    assert.equal(s!.cases[1].judge, 'exact');
  });

  it('拒绝非法结构：缺 name / 空 models / 空 cases / 非法 judge / 空 input', () => {
    assert.equal(ev.parseEvalSet(null), null);
    assert.equal(ev.parseEvalSet({ models: ['a'], cases: [{ input: 'x' }] }), null); // 缺 name
    assert.equal(ev.parseEvalSet({ name: 'n', models: [], cases: [{ input: 'x' }] }), null);
    assert.equal(ev.parseEvalSet({ name: 'n', models: ['a'], cases: [] }), null);
    assert.equal(
      ev.parseEvalSet({ name: 'n', models: ['a'], cases: [{ input: 'x', judge: 'guess' }] }),
      null,
    );
    assert.equal(ev.parseEvalSet({ name: 'n', models: ['a'], cases: [{ input: '  ' }] }), null);
    assert.equal(ev.parseEvalSet({ name: 'n', models: [''], cases: [{ input: 'x' }] }), null);
  });

  it('确定性判分：contains 忽略大小写、exact 需全等、无 expect 不计分', () => {
    const c = { input: 'q', expect: 'Hello' };
    assert.equal(ev.gradeDeterministic(c, 'say hello world').pass, true);
    assert.equal(ev.gradeDeterministic(c, 'nope').pass, false);
    assert.equal(
      ev.gradeDeterministic({ input: 'q', expect: '42', judge: 'exact' }, ' 42 ').pass,
      true,
    );
    assert.equal(
      ev.gradeDeterministic({ input: 'q', expect: '42', judge: 'exact' }, '42x').pass,
      false,
    );
    const none = ev.gradeDeterministic({ input: 'q' }, 'anything');
    assert.equal(none.pass, null);
    assert.equal(none.kind, 'none');
  });
});

describe('Phase C: 集合存取（C1）', () => {
  it('用户目录覆盖仓库同名集合、可保存/读取/删除', () => {
    cfg.initConfigStore();
    const s = ev.parseEvalSet(SET)!;
    ev.saveEvalSet('unit-demo', s);
    assert.ok(fs.existsSync(path.join(ev.userEvalDir(), 'unit-demo.json')));

    const got = ev.getEvalSet('unit-demo');
    assert.equal(got?.name, '单元测试集');

    const listed = ev.listEvalSets().find((x) => x.id === 'unit-demo');
    assert.equal(listed?.source, 'user');
    assert.equal(listed?.caseCount, 3);

    assert.equal(ev.deleteEvalSet('unit-demo'), true);
    assert.equal(ev.getEvalSet('unit-demo'), null);
    assert.equal(ev.deleteEvalSet('unit-demo'), false);
  });

  it('仓库示例集合可读且不可删（source=repo）', () => {
    const repos = ev.listEvalSets().filter((x) => x.source === 'repo');
    assert.ok(repos.length > 0, '仓库 evals/ 下应有示例集合');
    assert.equal(ev.deleteEvalSet(repos[0].id), false, '仓库示例不可删');
    assert.ok(ev.getEvalSet(repos[0].id));
  });

  it('拒绝路径穿越的 id', () => {
    assert.equal(ev.getEvalSet('../config'), null);
    assert.equal(ev.deleteEvalSet('..\\config'), false);
    assert.throws(() => ev.saveEvalSet('../evil', ev.parseEvalSet(SET)!));
  });
});

describe('Phase C: 跑批与判分（C1 + C3）', () => {
  it('串行跑 models × cases，确定性判分 + LLM 判官 + 成本回填', async () => {
    const set = ev.parseEvalSet(SET)!;
    const calls: string[] = [];
    const run = await ev.runEvalSet(
      'unit-demo',
      set,
      {
        callModel: async (model, c) => {
          calls.push(`${model}:${c.input}`);
          if (c.input === 'q1')
            return { status: 200, text: 'YES indeed', requestId: 'r1', cache: 'MISS' };
          if (c.input === 'q2') return { status: 200, text: '42', requestId: 'r2' };
          return { status: 200, text: '主观回答', requestId: 'r3', cache: 'HIT' };
        },
        judge: async () => 4, // 判官给 4/5 → 通过
        costOf: (id) => (id === 'r1' ? 0.01 : 0.02),
        now: (() => {
          let t = 0;
          return () => (t += 5);
        })(),
      },
      'run-unit',
    );

    assert.equal(run.status, 'done');
    assert.equal(run.total, 6);
    assert.equal(run.rows.length, 6);
    // 串行顺序：先全部 case 跑完 m-a，再 m-b
    assert.deepEqual(calls.slice(0, 3), ['m-a:q1', 'm-a:q2', 'm-a:q3']);
    // 判分
    const q1 = run.rows.find((r) => r.model === 'm-a' && r.caseIndex === 0)!;
    assert.equal(q1.pass, true, 'contains 命中');
    const q2 = run.rows.find((r) => r.model === 'm-a' && r.caseIndex === 1)!;
    assert.equal(q2.pass, true, 'exact 全等');
    const q3 = run.rows.find((r) => r.model === 'm-a' && r.caseIndex === 2)!;
    assert.equal(q3.score, 4);
    assert.equal(q3.pass, true, 'judge 4/5 ≥ 3');
    assert.equal(q3.fromCache, true);
    assert.equal(q3.costUsd, 0.02);
    assert.ok(run.rows.every((r) => r.latencyMs === 5));
  });

  it('无 expect 且无 judge 时 pass=null（不计分，不误判）', async () => {
    const set = ev.parseEvalSet({ name: 'n', models: ['m'], cases: [{ input: 'q' }] })!;
    const run = await ev.runEvalSet('n', set, {
      callModel: async () => ({ status: 200, text: 'whatever' }),
    });
    assert.equal(run.rows[0].pass, null);
  });

  it('上游报错的行不判分且记 error', async () => {
    const set = ev.parseEvalSet({
      name: 'n',
      models: ['m'],
      cases: [{ input: 'q', expect: 'x' }],
    })!;
    const run = await ev.runEvalSet('n', set, {
      callModel: async () => ({ status: 500, text: '{"error":"boom"}', error: 'HTTP 500' }),
    });
    assert.equal(run.rows[0].pass, null);
    assert.equal(run.rows[0].error, 'HTTP 500');
  });

  it('callModel 抛错被捕获为 error 行（不中断整批）', async () => {
    const set = ev.parseEvalSet({
      name: 'n',
      models: ['m'],
      cases: [{ input: 'a' }, { input: 'b' }],
    })!;
    let n = 0;
    const run = await ev.runEvalSet('n', set, {
      callModel: async () => {
        n += 1;
        if (n === 1) throw new Error('network down');
        return { status: 200, text: 'ok' };
      },
    });
    assert.equal(run.rows.length, 2);
    assert.equal(run.rows[0].error, 'network down');
    assert.equal(run.rows[0].status, 0);
    assert.equal(run.rows[1].status, 200);
  });

  it('shouldStop 在两行之间生效，状态为 stopped', async () => {
    const set = ev.parseEvalSet({
      name: 'n',
      models: ['m'],
      cases: [{ input: 'a' }, { input: 'b' }, { input: 'c' }],
    })!;
    let done = 0;
    const run = await ev.runEvalSet('n', set, {
      callModel: async () => {
        done += 1;
        return { status: 200, text: 'ok' };
      },
      shouldStop: () => done >= 2,
    });
    assert.equal(run.status, 'stopped');
    assert.equal(run.rows.length, 2);
    assert.ok(run.finishedAt);
  });
});

describe('Phase C: 汇总与导出（C2）', () => {
  it('summarizeRun 按模型聚合通过率/延迟/成本，坏模型排在后面', async () => {
    const set = ev.parseEvalSet(SET)!;
    const run = await ev.runEvalSet('s', set, {
      callModel: async (model, c) => {
        if (model === 'm-b') return { status: 500, text: '', error: 'HTTP 500' };
        return { status: 200, text: c.expect ?? '', requestId: 'r' };
      },
      costOf: () => 0.03,
      now: (() => {
        let t = 0;
        return () => (t += 10);
      })(),
    });
    const sum = ev.summarizeRun(run);
    assert.equal(sum.graded, 2); // 只有 m-a 的 q1/q2 参与判分（q3 无判官、m-b 全错）
    assert.equal(sum.models[0].model, 'm-a');
    assert.equal(sum.models[0].passRate, 1);
    assert.equal(sum.models[1].model, 'm-b');
    assert.equal(sum.models[1].errorCount, 3);
    assert.equal(sum.models[1].passRate, null);
    assert.equal(sum.costUsd, 0.09);
    assert.equal(sum.avgLatencyMs, 10);
  });

  it('runToCsv 表头 + 公式注入防护 + 换行折叠', async () => {
    const set = ev.parseEvalSet({
      name: 'n',
      models: ['m'],
      cases: [{ input: 'q', expect: 'x' }],
    })!;
    const run = await ev.runEvalSet('n', set, {
      callModel: async () => ({ status: 200, text: '=SUM(A1)\nsecond', requestId: 'r' }),
    });
    const csv = ev.runToCsv(run);
    const lines = csv.trimEnd().split('\n');
    assert.ok(lines[0].startsWith('model,caseIndex,pass,score,status'));
    assert.equal(lines.length, 2);
    assert.ok(csv.includes('⏎'), '换行折叠为 ⏎');
    assert.ok(csv.includes("'=SUM(A1)"), '以 = 开头的文本前置单引号');
    assert.ok(csv.endsWith('\n'));
  });

  it('parseScore 只取首个 1-5 数字', () => {
    assert.equal(ev.parseScore('4'), 4);
    assert.equal(ev.parseScore('评分：5 分'), 5);
    assert.equal(ev.parseScore('0 或 9'), null);
    assert.equal(ev.parseScore('不知道'), null);
  });

  it('buildJudgePrompt 含题目/参考答案/候选回答', () => {
    const p = ev.buildJudgePrompt({ input: '题目X', expect: '答案Y' }, '输出Z');
    assert.ok(p.includes('题目X') && p.includes('答案Y') && p.includes('输出Z'));
  });
});

describe('Phase C: 运行态与回环', () => {
  it('未注入回环地址时启动跑批立刻报错（不是异步静默失败）', () => {
    delete process.env.EVAL_BASE_URL;
    ev.setEvalLoopback('');
    // 用仓库示例集合（存在）
    const repo = ev.listEvalSets().find((x) => x.source === 'repo');
    assert.ok(repo);
    const set = ev.getEvalSet(repo!.id);
    assert.ok(set);
    assert.throws(() => ev.startEvalRun(repo!.id, set!));
  });
});

describe('Phase C: 端到端（真实回环 HTTP）', () => {
  let upstream: any;
  let server: any;
  let base = '';

  beforeAll(async () => {
    const express = (await import('express')).default as any;
    // 假「上游厂商」
    const up = express();
    up.use(express.json({ limit: '1mb' }));
    up.all('*', (req: any, res: any) => {
      const prompt = String(req.body?.messages?.at(-1)?.content ?? '');
      const content = prompt.includes('参考答案')
        ? '4'
        : prompt.includes('q2')
          ? '42'
          : prompt.includes('q1')
            ? 'yes!'
            : 'other';
      res.status(200).json({
        id: 'x',
        choices: [{ message: { role: 'assistant', content } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    });
    upstream = up.listen(0);
    const upBase = `http://127.0.0.1:${(upstream.address() as any).port}`;

    // 本地代理（统一端点 + 单厂商路由）
    const proxy = await import('../server/proxy.js');
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/proxy', proxy.proxyRouter);
    app.use('/api/v1', proxy.unifiedRouter);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as any).port}`;

    cfg.initConfigStore();
    cfg.upsertProvider('evp', { apiKey: 'k-evp', enabled: true, baseUrl: upBase });
    // 模型名带 vendor 前缀 → 统一端点据此解析厂商
    process.env.EVAL_BASE_URL = base;
    ev.setEvalLoopback(base);
    ev.resetEvalRuns();
  });

  afterAll(() => {
    delete process.env.EVAL_BASE_URL;
    upstream?.close();
    server?.close();
  });

  it('跑批经真实代理：结果落到内存运行态并可汇总', async () => {
    const set = ev.parseEvalSet({
      name: 'e2e',
      models: ['evp/mock'],
      cases: [
        { input: 'q1', expect: 'yes' },
        { input: 'q2', expect: '42', judge: 'exact' },
      ],
    })!;
    const started = ev.startEvalRun('e2e', set);
    assert.equal(started.status, 'running');

    // 等跑完（串行 2 条，很快）
    const deadline = Date.now() + 15_000;
    let run = ev.getEvalRun(started.id)!;
    while (run.status === 'running' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      run = ev.getEvalRun(started.id)!;
    }
    assert.equal(run.status, 'done', `跑批应完成，实际 ${run.status}（${run.error ?? ''}）`);
    assert.equal(run.rows.length, 2);
    assert.ok(
      run.rows.every((r) => r.status === 200),
      JSON.stringify(run.rows),
    );
    assert.equal(run.rows[0].pass, true, 'q1 contains 命中 yes!');
    assert.equal(run.rows[1].pass, true, 'q2 exact 命中 42');
    assert.ok(
      run.rows.every((r) => r.requestId),
      '应回传 x-request-id 便于对账',
    );

    const sum = ev.summarizeRun(run);
    assert.equal(sum.passed, 2);
    assert.equal(sum.passRate, 1);
    // 结果已落盘
    const f = path.join(ev.evalResultsDir(), `${run.id}.json`);
    assert.ok(fs.existsSync(f), '结果应落盘');
    assert.ok(ev.listEvalRuns().some((r) => r.id === run.id));
  });

  it('LLM 判官经回环打分并折算通过（C3）', async () => {
    const set = ev.parseEvalSet({
      name: 'judge-e2e',
      models: ['evp/mock'],
      judgeModel: 'evp/mock',
      cases: [{ input: '主观题', expect: '参考答案', judge: 'llm' }],
    })!;
    const started = ev.startEvalRun('judge-e2e', set);
    const deadline = Date.now() + 15_000;
    let run = ev.getEvalRun(started.id)!;
    while (run.status === 'running' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      run = ev.getEvalRun(started.id)!;
    }
    assert.equal(run.status, 'done');
    assert.equal(run.rows[0].score, 4, '判官返回 4');
    assert.equal(run.rows[0].pass, true);
  });
});
