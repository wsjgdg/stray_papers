// Prometheus 指标导出（/metrics）。文本 exposition 格式，text/plain。
// 数据来自内存指标聚合（getMetrics）与响应缓存统计，重启清零，不落盘。

import { getMetrics, getSummary } from './metrics.js';
import { getCacheStats } from './responseCache.js';

/** 清洗 label 值中的非法字符（Prometheus label 仅允许 [a-zA-Z0-9_:].） */
function sanitizeLabel(s: string): string {
  return s.replace(/[^a-zA-Z0-9_:]/g, '_');
}

function line(name: string, value: number, labels?: Record<string, string>): string {
  const lbl =
    labels && Object.keys(labels).length > 0
      ? `{${Object.entries(labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',')}}`
      : '';
  return `${name}${lbl} ${value}`;
}

export function renderMetrics(): string {
  const metrics = getMetrics();
  const cache = getCacheStats();
  const blocks: string[] = [];

  // 存活
  blocks.push(
    [
      '# HELP llmworkbench_up 服务存活状态',
      '# TYPE llmworkbench_up gauge',
      'llmworkbench_up 1',
    ].join('\n'),
  );

  const reqLines: string[] = [
    '# HELP llmworkbench_requests_total 累计请求数',
    '# TYPE llmworkbench_requests_total counter',
  ];
  const succLines: string[] = [
    '# HELP llmworkbench_requests_success_total 成功请求数',
    '# TYPE llmworkbench_requests_success_total counter',
  ];
  const errLines: string[] = [
    '# HELP llmworkbench_requests_error_total 失败请求数',
    '# TYPE llmworkbench_requests_error_total counter',
  ];
  const inLines: string[] = [
    '# HELP llmworkbench_input_tokens_total 累计输入 tokens',
    '# TYPE llmworkbench_input_tokens_total counter',
  ];
  const outLines: string[] = [
    '# HELP llmworkbench_output_tokens_total 累计输出 tokens',
    '# TYPE llmworkbench_output_tokens_total counter',
  ];
  const cacheReadLines: string[] = [
    '# HELP llmworkbench_cache_read_tokens_total 累计缓存命中 tokens',
    '# TYPE llmworkbench_cache_read_tokens_total counter',
  ];
  const costLines: string[] = [
    '# HELP llmworkbench_cost_usd_total 累计估算成本（USD）',
    '# TYPE llmworkbench_cost_usd_total counter',
  ];
  const keySwitchLines: string[] = [
    '# HELP llmworkbench_key_switches_total 累计 key 切换次数（多 key 轮询/失败切换）',
    '# TYPE llmworkbench_key_switches_total counter',
  ];
  const latLines: string[] = [
    '# HELP llmworkbench_avg_latency_ms 近 50 次平均延迟',
    '# TYPE llmworkbench_avg_latency_ms gauge',
  ];
  const rateLines: string[] = [
    '# HELP llmworkbench_req_rate 近 10s 请求速率（req/s）',
    '# TYPE llmworkbench_req_rate gauge',
  ];

  for (const m of metrics) {
    reqLines.push(
      line('llmworkbench_requests_total', m.totalRequests, { provider: sanitizeLabel(m.provider) }),
    );
    succLines.push(
      line('llmworkbench_requests_success_total', m.successRequests, {
        provider: sanitizeLabel(m.provider),
      }),
    );
    errLines.push(
      line('llmworkbench_requests_error_total', m.errorRequests, {
        provider: sanitizeLabel(m.provider),
      }),
    );
    inLines.push(
      line('llmworkbench_input_tokens_total', m.totalInputTokens, {
        provider: sanitizeLabel(m.provider),
      }),
    );
    outLines.push(
      line('llmworkbench_output_tokens_total', m.totalOutputTokens, {
        provider: sanitizeLabel(m.provider),
      }),
    );
    cacheReadLines.push(
      line('llmworkbench_cache_read_tokens_total', m.totalCacheReadTokens, {
        provider: sanitizeLabel(m.provider),
      }),
    );
    costLines.push(
      line('llmworkbench_cost_usd_total', m.totalCostUsd, { provider: sanitizeLabel(m.provider) }),
    );
    keySwitchLines.push(
      line('llmworkbench_key_switches_total', m.totalKeySwitches, {
        provider: sanitizeLabel(m.provider),
      }),
    );
    latLines.push(
      line('llmworkbench_avg_latency_ms', m.avgLatencyMs, { provider: sanitizeLabel(m.provider) }),
    );
    rateLines.push(
      line('llmworkbench_req_rate', m.reqRate, { provider: sanitizeLabel(m.provider) }),
    );
  }

  blocks.push(reqLines.join('\n'));
  blocks.push(succLines.join('\n'));
  blocks.push(errLines.join('\n'));
  blocks.push(inLines.join('\n'));
  blocks.push(outLines.join('\n'));
  blocks.push(cacheReadLines.join('\n'));
  blocks.push(costLines.join('\n'));
  blocks.push(keySwitchLines.join('\n'));
  blocks.push(latLines.join('\n'));
  blocks.push(rateLines.join('\n'));

  // 全局瞬时 token 速率（gauge）：供 Prometheus/Grafana 绘制长期吞吐曲线
  const summary = getSummary();
  blocks.push(
    [
      '# HELP llmworkbench_input_rate_tok_s 全局输入速率（tok/s）',
      '# TYPE llmworkbench_input_rate_tok_s gauge',
      line('llmworkbench_input_rate_tok_s', summary.inputRateTokS),
      '# HELP llmworkbench_output_rate_tok_s 全局输出速率（tok/s）',
      '# TYPE llmworkbench_output_rate_tok_s gauge',
      line('llmworkbench_output_rate_tok_s', summary.outputRateTokS),
    ].join('\n'),
  );

  // 缓存（全局，无 provider label）
  blocks.push(
    [
      '# HELP llmworkbench_cache_hits_total 响应缓存命中数',
      '# TYPE llmworkbench_cache_hits_total counter',
      line('llmworkbench_cache_hits_total', cache.hits),
      '# HELP llmworkbench_cache_misses_total 响应缓存未命中数',
      '# TYPE llmworkbench_cache_misses_total counter',
      line('llmworkbench_cache_misses_total', cache.misses),
      '# HELP llmworkbench_cache_size 当前缓存条目数',
      '# TYPE llmworkbench_cache_size gauge',
      line('llmworkbench_cache_size', cache.size),
    ].join('\n'),
  );

  return blocks.join('\n\n') + '\n';
}
