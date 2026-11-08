// 示例会议：空档案时一键载入，让新用户 10 秒内看到完整产品形态
// （转写稿 + 摘要 + 议题 + 行动项 + 决议，含一条低置信度条目演示「待核对」标记）。
// 内容为虚构的产品周会，数据全部写入本地档案，可像普通会议一样编辑 / 删除。

import { newId, todayStr, type Meeting } from "@/lib/store"

const TRANSCRIPT = `小林：开始吧，今天主要对齐 2.1 版本的进度和灰度发布计划。先请阿哲过一下开发侧的情况。
阿哲：支付模块重构已经完成，单元测试全部通过。但回调延迟在高并发下还是偶发 8 秒，超出 PRD 承诺的 5 秒。
小林：延迟的原因是什么？
阿哲：主要是队列积压，增加两个消费节点应该能压到 3 秒以内，资源申请需要周三前提交。
王倩：设计侧新版设置页的视觉稿上周四已经评审过了，只剩空状态插图风格没有定。
小林：那就今天定下来，统一用线性插画风格，不再用 3D 的了。
王倩：好，那我周五前把整套空状态插图交付，一共 6 张。
陈默：测试侧回归用例写了 80%，支付回调那部分被环境卡住了，staging 的 mock 服务昨天又挂了。
阿哲：我今天修一下。这个问题之前会上也提过，mock 服务每次灰度前都会挂一次。
小林：那就立个行动项，阿哲本周四之前给 mock 服务加上自动重启和告警，别每次靠人肉救。
阿哲：收到。
陈默：另外灰度发布方案需要定一下，我建议按 5% 流量起步，观察一周没问题再放到 20%。
小林：同意，但加一个指标：支付成功率如果跌破 99.5% 就自动回滚。
陈默：我写进监控规则里，上线前配置好。
小林：还有个事，客户成功反馈新用户找不到导出功能，入口太深了。
王倩：可以在列表页加一个快捷入口，改动不大，两天能做完。
小林：那就做，放进 2.1，别推到下个版本了。
阿哲：对了，支付用的三方计费 SDK 月底停止维护，必须在正式发布前完成升级。
小林：升级的工作量有多大？
阿哲：接口变化不小，预计 3 到 5 天，我 28 号前能做完，但需要重新回归一遍回调部分。
小林：那就这么定，这个版本把 SDK 升级做掉，陈默那边安排支付链路的专项回归。
陈默：明白，我把回归排期留出两天。
小林：好，今天就到这里，下周三同一时间过灰度数据。`

// 从今天算 n 天后的 yyyy-mm-dd
function dayOffset(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const pad = (x: number) => String(x).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 在转写稿里定位引用原文：返回行号（1-based）与字符偏移，行动项点击可精确跳回原文
function anchorOf(quote: string): { sourceLine: number; sourceStart: number; sourceEnd: number } {
  const idx = TRANSCRIPT.indexOf(quote)
  if (idx < 0) return { sourceLine: 1, sourceStart: 0, sourceEnd: 0 }
  const line = TRANSCRIPT.slice(0, idx).split("\n").length
  return { sourceLine: line, sourceStart: idx, sourceEnd: idx + quote.length }
}

export function buildSampleMeeting(): Meeting {
  const now = Date.now()
  const aid = (n: number) => `sample-a${n}`
  const did = (n: number) => `sample-d${n}`
  const mkAction = (
    n: number,
    content: string,
    assignee: string,
    dueDate: string,
    quote: string,
    confidence: number,
  ) => ({
    id: aid(n),
    content,
    assignee,
    dueDate,
    status: "open" as const,
    sourceQuote: quote,
    editedByUser: false,
    createdAt: now,
    confidence,
    ...anchorOf(quote),
  })

  return {
    id: newId(),
    title: "示例 · 产品周会（2.1 版本对齐）",
    date: todayStr(),
    tags: ["产品周会", "示例"],
    transcript: TRANSCRIPT,
    createdAt: now,
    updatedAt: now,
    brief: {
      content:
        "本次周会对齐 2.1 版本进度：支付模块重构完成但回调延迟超标，需增补消费节点；确定空状态插图统一走线性风格、周五交付；灰度方案定为 5% 流量起步、支付成功率跌破 99.5% 自动回滚；列表页新增导出快捷入口纳入本版本；月底停维护的三方计费 SDK 须在正式发布前完成升级并专项回归。",
      model: "内置示例",
      editedByUser: false,
      generatedAt: now,
    },
    outline: {
      topics: [
        {
          topic: "2.1 版本开发进度",
          points: [
            "支付模块重构完成，单元测试全部通过",
            "回调延迟高并发下偶发 8 秒，超出 PRD 承诺的 5 秒，需增加两个消费节点（周三前提交资源申请）",
            "staging 环境 mock 服务再次宕机，阻塞支付回调回归，本周四前加自动重启与告警",
          ],
        },
        {
          topic: "设计与体验",
          points: [
            "空状态插图风格确定为线性插画，放弃 3D 方案，周五前交付全套 6 张",
            "新用户找不到导出功能，列表页新增快捷入口，两天工作量，纳入 2.1",
          ],
        },
        {
          topic: "灰度发布计划",
          points: [
            "按 5% 流量起步，观察一周无异常再放大到 20%",
            "增加自动回滚指标：支付成功率跌破 99.5% 即回滚，上线前写入监控规则",
          ],
        },
        {
          topic: "三方计费 SDK 升级",
          points: [
            "SDK 月底停止维护，须在正式发布前完成升级，预计 3-5 天、28 号前完成",
            "接口变化较大，升级后对支付链路做专项回归，排期预留两天",
          ],
        },
      ],
      model: "内置示例",
      editedByUser: false,
      generatedAt: now,
    },
    actions: [
      mkAction(1, "周三前提交消费节点资源申请，把支付回调延迟压到 3 秒以内", "阿哲", dayOffset(2), "资源申请需要周三前提交", 0.93),
      mkAction(2, "周五前交付整套空状态插图（线性风格，共 6 张）", "王倩", dayOffset(4), "那我周五前把整套空状态插图交付，一共 6 张", 0.95),
      mkAction(3, "本周四前给 staging mock 服务加自动重启与告警", "阿哲", dayOffset(3), "阿哲本周四之前给 mock 服务加上自动重启和告警", 0.9),
      mkAction(4, "上线前把支付成功率 99.5% 自动回滚写入监控规则", "陈默", dayOffset(6), "我写进监控规则里，上线前配置好", 0.62),
      mkAction(5, "列表页新增导出功能快捷入口（纳入 2.1 版本）", "王倩", dayOffset(5), "可以在列表页加一个快捷入口，改动不大，两天能做完", 0.88),
      mkAction(6, "28 号前完成三方计费 SDK 升级", "阿哲", dayOffset(9), "预计 3 到 5 天，我 28 号前能做完", 0.71),
      mkAction(7, "支付链路专项回归，排期预留两天", "陈默", dayOffset(10), "我把回归排期留出两天", 0.85),
    ],
    decisions: [
      {
        id: did(1),
        content: "空状态插图统一采用线性插画风格，不再使用 3D 风格",
        sourceQuote: "统一用线性插画风格，不再用 3D 的了",
        editedByUser: false,
        ...anchorOf("统一用线性插画风格，不再用 3D 的了"),
      },
      {
        id: did(2),
        content: "灰度方案：5% 流量起步观察一周，无异常放大到 20%；支付成功率跌破 99.5% 自动回滚",
        sourceQuote: "支付成功率如果跌破 99.5% 就自动回滚",
        editedByUser: false,
        ...anchorOf("支付成功率如果跌破 99.5% 就自动回滚"),
      },
      {
        id: did(3),
        content: "三方计费 SDK 升级纳入 2.1 版本，升级后对支付链路做专项回归",
        sourceQuote: "这个版本把 SDK 升级做掉，陈默那边安排支付链路的专项回归",
        editedByUser: false,
        ...anchorOf("这个版本把 SDK 升级做掉，陈默那边安排支付链路的专项回归"),
      },
    ],
  }
}
