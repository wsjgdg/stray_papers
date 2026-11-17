# QA Checklist — 发布前九结局覆盖内测

> 母页面: [[betelgeuse-visual-novel]]
> 依据: 外部对标 #36（Cinders postmortem："总有一条冷门路线没人通关，那个不起眼的变量毁掉一个结局"）
> 用法: 每条路线由一名内测者独立通关，勾选后附存档截图；任何卡点记录到本文件末尾"问题登记"。
> 分支结构核对于 docs/foreshadowing-ledger.md 的结构说明节。

## 一、九结局路线表（含关键 flag）

| #   | 结局           | 标签              | 路线要点                                                                                                                                                                                                                                       | 关键 flag                                         |
| --- | -------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | 还亮着（真）   | ending_true       | 任意开场 → obsv_daily **选「调出值班日志」** → hall_quiet → server_hall → memory_dive → 「继续看完」 → liar_reveal → lin_grief → converge_talk → qi_converse → diverge **选「醒过来」** → wake_talk → gate_approach → finale_gate → wake_check | `noticed_star`（读日志置位）+ `chose_wake` 双门控 |
| 2   | 迟到三年的早安 | ending_good       | 同上，但 obsv_daily **选「直接下机房」**（不读日志）→ … → diverge 选「醒过来」 → wake_check                                                                                                                                                    | 只有 `chose_wake`                                 |
| 3   | 折返           | ending_turnback   | email_first **选「现在就上山」** → went_solo **选「雨太大。回去吧」**                                                                                                                                                                          | —                                                 |
| 4   | 已读不回       | ending_silence    | email_first **选「先回一封邮件」** → reply_email **选「删掉这封邮件」**                                                                                                                                                                        | —                                                 |
| 5   | 清场           | ending_clearance  | 任意路径至 server_hall **选「先报警」** → clearance_before                                                                                                                                                                                     | —                                                 |
| 6   | 断线           | ending_unplug     | server_hall → memory_dive **选「拔掉电源」** → unplug_before                                                                                                                                                                                   | —                                                 |
| 7   | 替身           | ending_substitute | diverge **选第三项「扫描环里换成我」** → substitute_before                                                                                                                                                                                     | 隐藏选项，确认它真的出现在 UI 里                  |
| 8   | 守灯人         | ending_qi         | diverge 选「拉下总闸」（chose_cut）→ cut_path **选「栖，你留下」** → keeper_before → qi_dawn                                                                                                                                                   | `chose_cut`                                       |
| 9   | （坏）终局     | ending_bad        | diverge 选「拉下总闸」 → cut_path → **选「确认切断」** → gate_approach → finale_gate                                                                                                                                                           | `chose_cut`（finale_gate 无 chose_wake 时直落）   |

每结局通关后核验：

- [ ] 结局收集页新标签亮起（结局回收 N/9）
- [ ] credits 完整滚动并回到标题
- [ ] 该结局专属 CG（如有）已入画廊
- [ ] 返回标题后：星空亮度档位、副标题、继续游戏按钮指向正确

## 二、浏览器持久化（网页版专属风险项）

- [ ] 行进中刷新页面 → 标题出现「继续游戏」，点击回到刷新前 8 行内的位置（autosave）
- [ ] 关闭标签页重开 → 同上
- [ ] 自动存档不会覆盖玩家手动 3 槽的任何一个
- [ ] 手动存档 3 槽 + Ctrl+S 快存 + Ctrl+L 快读全链路
- [ ] 无痕窗口：进度不保留但游戏可玩（降级静默，无报错）
- [ ] **lite 构建**（betelgeuse-vn-lite.html，需经 http 服务）：标题显示"资源加载中"进度行 → 完成后消失；二次进入秒开（IndexedDB）；断网可玩
- [ ] **lite 与 full 存档互通**（同 host 同 localStorage，自动成立）

## 三、音频与演出

- [ ] 音效开关开/关全流程（环境音、语音、SFX 全部静默；再开后恢复）
- [ ] 语音抽查：每个章节抽 3 行（开场/中段/结局），确认有声且与文本一致
- [ ] 环境音层随场景切换（雨/机房嗡鸣/山风/晨鸟/room tone）；CG 显示时环境音退场、CG 专属 BGM 接管
- [ ] 快进：默认停在未读行；设置改"全部"后一路到底；快进中语音静音
- [ ] fx 抽查：bigtext（日志 23:52）、blackout（忙音）、bounce、flash→blackout 节拍（扫描环行）、shake（倒计时）
- [ ] H 键 / 右键隐藏界面 → 点击恢复；选项/菜单期间右键菜单正常
- [ ] 自动推进 + 手速三档 + 设置持久化（刷新后保留）

## 四、移动端 Safari（发布前至少一轮真机）

- [ ] lite 版加载与游玩（语音包 23MB 后内存应远低于 ~100MB 崩溃线）
- [ ] 音频点击解锁（首次交互后有声）
- [ ] 触屏推进/右键替代（长按）是否可用；不可用则确认 H 键替代说明可见
- [ ] 视口与文字折行（3.6vw 大字、12px 状态行）

## 五、收集与奖励

- [ ] 9/9 后标题：星空 tier-2 亮红 + 副标题「这次是我自己记住的」→ 100% 触发"无论走到哪条时间线，它都亮着" + keyArt 点亮 + 星语（extras → morning_table）入口出现
- [ ] 图片 OP：新游戏播放、点击整段跳过、继续游戏不播

## 问题登记

（内测者填写：日期 / 构建版本 / 路线 / 现象 / 复现步骤）

## 自动化内测执行记录（2026-11-14，playwright headless）

**九结局路线全部可达且收集成功（9/9 PASS）**。路线：autosave 注入直达决策点 →
Space 推进 / 按文案点击选项 → 校验 `vn-endings` 收集 + 结局检查点落位。

| 结局                                           | 起点                                 | 结果 | 备注                                   |
| ---------------------------------------------- | ------------------------------------ | ---- | -------------------------------------- |
| ending_true                                    | converge_talk（双 flag 预置）        | PASS | 经 finale_gate→wake_check 双重入口门控 |
| ending_good                                    | converge_talk（仅 chose_wake）       | PASS | 无 noticed_star 落 good ✓              |
| ending_bad                                     | converge_talk（chose_cut，两段选项） | PASS | 总闸→确认切断                          |
| ending_qi                                      | converge_talk（chose_cut，两段选项） | PASS | 总闸→栖留下→守灯人线                   |
| ending_substitute                              | diverge（隐藏第三选项）              | PASS |                                        |
| ending_unplug / clearance / turnback / silence | 各自决策点                           | PASS |                                        |

**内测发现并修复的引擎 bug**：

1. **恢复存档绕过入口门控**（严重）：restoreFrom 不重跑场景入口的 `branch` 门控 ——
   玩家在 finale_gate 处的自动存档，继续游戏会无视 chose_wake 旗标直接落入坏结局。
   修复：restoreFrom 内循环重应用匹配的入口门控（链式门控 wake_check→ending_true 亦覆盖）。
2. **测试脚本注入键名错误**（两次）：vn-autosave ≠ 实际键 vn-save-autosave；修复后
   截图与 QA 均正常。

**遗留观察**：结局收集计数在跨测试时被各次运行重置（测试注入 removeItem 所致），
真实玩家连续游玩时收集累计不受影响。

## 标题日志提醒回归（2026-11-16，node:test + Playwright，7/7 PASS）

`tests/ending-log-reminder.test.js`：提醒仅在 ending_good 已收 / ending_true 未收 /
log_last 未访问 / obsv_daily 已解锁时出现（5 组门控矩阵）；点击打开剧情树、
obsv_daily 高亮可点且滚入视口；点击前后 `vn-save-*` 全键值快照不变。
运行：`node --test tests/ending-log-reminder.test.js`。
