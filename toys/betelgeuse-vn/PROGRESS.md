# PROGRESS — 参宿四还亮着（自主推进轮状态账本）

> 每轮开始先读本文件；结束前更新本文件并随代码一并提交。
> 目标：向 Fate 等顶级 galgame 靠近。路线图优先级：A 语音 → B CG → C 文本 → D 演出 → E 音效。

## 当前基线（2026-11-16）

- 场景 44 个（9 结局：3 真 + 5 假 + 守灯人），分支树已上剧情树页签
- 对话/叙述 477 行（234 句有语音）；立绘 168 renders（4 角色 × 5 姿势 × 8 表情 × gaze），全部干净抠像
- 音频：BGM 29（每场景/分支/CG 专属）+ bgm2 系列 22 曲 + SFX 7 + 环境音 5
- CG 20：原 5 张 + B1 新 15 张（6 结局：cg_good/bad/turnback/silence/clearance/unplug；9 转折点：cg_email/rain_climb/tea/log/server/truth/choice/wake/offer）
- 语音 234/234 行全量覆盖（**edge-tts 情感化渲染**：feel→韵律映射，单渠道音色统一）
- 构建：betelgeuse-vn.html 95.5MB + lite 壳 9.5MB + 三分包（bgm 41.5 / voice 15.3 / bgm2 24.4MB）；分支 feat/c1-interlude-scenes 已推送 origin

## 已完成里程碑

- [x] 引擎全功能（键盘/快存快读/剧情树/色调/特效/语音层）
- [x] 剧情 v2（5 假结局真待遇 + ending_qi 守灯人）
- [x] 全量 AI 美术管线（立绘/背景/CG/标题）
- [x] BGM 全落位（含分支与 CG 专属）
- [x] 语音试点（管线：props/ai-voice/gen-voices.js + make-voice-data.py）

## 进行中

- [x] **标题日志提醒 + 双 CSS 真修复**（2026-11-16，644aee6 + 文档轮）：
  - 新功能：ending_good 已收 / ending_true 未收 / log_last 未访问 / obsv_daily 已解锁四条件下，标题屏出现「值班日志还没翻到最后 · 回看线索」低提醒；点击打开剧情树、高亮并滚动到 obsv_daily 选择点；不进场景、不写 flags、不动存档。node:test + Playwright 回归 7 用例（tests/ending-log-reminder.test.js，含存档快照不变断言）
  - 审查修复两个真 bug：① `.vn-tree-img` 6 条规则被 prettier 嵌套进 `.vn-tree-seen`，编译成永不可命中的后代选择器（图片节点卡标签承托/未访问压暗整体失效，CSSOM 实证）→ 移回顶层；② 左槽立绘 `scaleX(-1)` 被无限呼吸动画覆盖永不生效 → 翻转改走 `--vn-sprite-sx` 进 keyframes（vn-swap 复述路径同样覆盖），静态回退兜底减动效；顺带 reduced-motion 列表补 `> img`
  - 加固：提醒谓词补 obsv_daily 解锁校验（防状态异常高亮 disabled 死节点）、节点 aria-label 去内部 id、谓词提升出树构建循环；index.html 缓存戳 1794749934；.gitignore 排除 `_probe/` `graphify-out/`
  - 分支 feat/c1-interlude-scenes 已推送 origin（644aee6）
- [x] A1 全量语音（2026-11-11 三轮完成）：129/129 行，freetts.org 神经音色
- [x] C1 第一轮（2026-11-12）：+91 行 / 9 个幕间场景（共通线 night_thoughts + climb_rain + obsv_daily + hall_quiet；分支线 qi_converse + gate_approach + clearance_before + unplug_before + keeper_before），改 next/choices 接线 14 处，未动已有场景 lines（语音键不错位）。双子智能体并发产出
- [x] 替身路线救活 + C1 第二轮 + C2（2026-11-13，+89 行 / 4 新场景 / 5 coda）：
  - diverge 新增第三选项「扫描环里换成我」→ substitute_before（14 行）→ ending_substitute，孤儿结局已可达（引擎 ENDING_IDS 注册表自动计入结局收集）
  - 真结局铺垫：wake_talk（唤醒四分钟只聊小事，为 ending_good 埋线）、lin_grief（林晚消化「守的是碑」，接 converge_talk）、qi_dawn（守灯人第一个六点写日志「今天」，引出 ending_qi 时间跳跃）
  - C2 完成：五个假结局 coda 追加至末尾（turnback 16 / silence 13 / clearance 14 / unplug 15 / substitute 15，全部进 12-18 区间）；视角跟随各场景（turnback/silence 第三人称、substitute 后段眠视角镜像倒转）
  - 约束验证：append-only + 新场景 + next/choices 接线，逐场景 diff 确认语音键零错位

## 路线图待办

- [x] **美术与引擎终修**（2026-11-15，a0eac7f）：① yu-b-surprised 立绘水平挤压修复（544→686 宽，组内极差 25.7%→7.4%）；② **背景零复用完全达成** —— 8 个旗舰场景保留基础图 + 36 场景专属变体（gen-bg-scenes.sh 按剧情时刻定制）+ 13 张光影备选，44 场景 45 张图无一重复；③ 引擎 baseBgId 变体解析（图全 id、fx/props/canvas/amb/画廊回退地点）+ 场景级 grade 覆盖。 sprites-data 168 renders / bg-data 53 images 重打包
- [x] 引擎体验四补丁（9b6f70d）：标题音乐 autoplay 拒绝后首次手势重试、立绘点击 lightbox 全屏、游戏内顶栏剧情树入口、closeGallery 模式感知（游戏内关闭恢复剧情 BGM）
- [x] 引擎修复（a319522）：restoreFrom 绕过入口门控（严重，玩家自动存档继续游戏会落错结局）
- [x] mian 语音验证：17/17 键齐全（"沈眠没声音"= 前期她的台词为叙述引语 by design，语音从中后期开始）
- [x] **背景零复用落地**（2026-11-15）：44 场景 45 张各不相同背景图（8 基础图留旗舰场景 + 36 张场景专属变体）—— 13 张光影变体（gen-bg-variants.sh，同机位不同时段）+ 36 张场景专属图（gen-bg-scenes.sh，按剧情时刻定制：night_thoughts 台灯熄灭、liar_reveal 蓝光全亮、qi_dawn 清晨余温、ending_clearance 封条 daylight…）。引擎 baseBgId 变体解析（图按全 id、fx/props/canvas/amb/画廊按地点回退）+ 场景级 grade 覆盖。13 张光影变体为未引用备选图留存
- [x] bg-data 重打包 1637KB（暗色场景压缩率极高）；remap-bg.py 断点优先 + 白名单重命名（双 bg- 前缀清理）
- [x] **语音终版完成**（2026-11-15，f43e1f2 + 71c9033）：234 句全部重渲染 —— ① 零水印（freetts 3.22s 尾部校准裁剪，逐段应用）；② 四角色最终音色 Yunhao/Xiaoxuan/Xiaoyi/Xiaohan（试听选定，沈眠/林晚区分修复）；③ voice 包 24→15MB。水印校准方法：同文本 edge-vs-freetts 时长对比（edge 渲染无水印作基准）。最终听感验收 = 用户刷新页面
- [x] bgm2 22 曲全部进包（0867bca + d02482d + 补充）：轻松闲聊归入 extras_1、OGG→MP3 转换（iOS 兼容）、VN_BGM2_ASSETS 独立全局 + sampledAssets 合并视图、loader 三分包 + 进度 UI
- [x] 引擎修复（本轮）：restoreFrom 绕过入口门控（严重）、鉴赏树跳转被标题屏覆盖、OP 空格跳过、树节点计数、restoreBg 缺 bg 回退、index.html 缓存戳
- [x] **鉴赏树修复**（2026-11-15）：实测确诊两个真 bug —— ① 树节点点击跳转被 closeGallery 重现的标题屏（z-7）覆盖，跳转读作无效；② 空格/回车无法跳过图片 OP（overlaysOpen() 在非 line 模式恒 true，键盘永远到不了 skipOp）。三补丁：跳转时重隐标题 + 清 flags/rollback、onKeyDown 增加 op 模式分支、树页签显示"共 44 幕 · 已点亮 M 幕"计数（陈旧缓存一眼可辨）。index.html 的 2026-11-06 缓存戳同步更新（散装开发页曾命中旧 scenario 缓存）。playwright 沙盒全流程验证通过
- [ ] 内测观察项：真实存档（bg 字段缺失场景）restoreBg 已回退到场景自身 bg —— 若旧存档出现黑背景，确认此修复生效
- [x] **九结局自动化内测 9/9 全过**（2026-11-14，a319522）：playwright 自动走完全部九条路线（决策点注入 + Space 推进 + 选项点击），收集/检查点全验证。**内测抓到并修复严重引擎 bug**：restoreFrom 绕过场景入口 `branch` 门控 —— 玩家在 finale_gate 的自动存档继续游戏会无视 chose_wake 直接落坏结局；修复为 restore 时循环重应用匹配门控（链式覆盖）。qa-checklist.md 已附执行记录
- [x] 探索轮 8 B 线（2026-11-14，中文发布渠道；A 线 AI 音乐提示词探索被用户中止，不重启）：
      46. **中文发布组合**：主平台双轨 = itch.io（全球可达 + 官方 AI 标签 6 选，中文 tag 流量有限）+ **TapTap 试玩/测试形态**（国内唯一个人友好商店，官方欢迎 AI 游戏、支持 H5 部署；无版号不能正式上线但可测试形态合规上架，需实名组件）→ 来源 https://developer.taptap.cn/agents https://www.taptap.cn/moment/764175580655520801 47. **词条矩阵**：上架当天 CnGal 免费专区 + 鲲Galgame + 2DFan 国产 tag 建词条外链回 itch（半小时换长尾搜索流量）→ https://www.cngal.org/free https://www.kungal.com/ 48. **引流矩阵**：B站专栏/动态（宣传图勾 AI 声明）→ indienova 开发复盘长文（设计向内容）→ 知乎宣发问题经验帖；biligame/微信小游戏需版号或企业资质不碰
      49. **国内 AI 标识法规**：《人工智能生成合成内容标识办法》2025-09-01 已施行 —— 内容平台发布 AI 宣传物料必须主动声明 + 用平台标识功能；本作无面向玩家的 AI 生成功能，第七条核验不直接适用；游戏内"关于"页写 AI 辅助披露同时满足国内外预期 → https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm 50. **渠道排除清单**：biligame（厂商联运制）/ Steam（$100 费，后续可选）/ UniGalgame、叭啦叭啦（检索无有效信息）不投入
- [x] 道具融合改造（2026-11-14，用户反馈"道具图片太突兀"）：引擎 prop 条目新增 filter/transform 支持（与 flip 组合）；逐场景调校 —— apartment：日历压暗蓝移挂墙面、钥匙缩小沉到桌沿（杯删除——背景画已有杯子）、server_room：工牌压暗挂机柜暗影、便利贴压暗贴柜面；playwright 截图前后对比验收。残留观察：钥匙只露出对话框上沿一点金环（自然）
- [x] #42 rollback 回滚落地（2026-11-14，861adad）：每行显示压入全量快照环（60 条封顶：scene/line/flags/poses/cg/bg），滚轮上 / PageUp 逐步回退、滚轮下 / PageDown 前进，restoreFrom 全量恢复（flags 随快照回卷 → 回退到抉择点前可重选）；回退行静音不重播语音；缓冲在标题/新游戏/读档三路清空；rollback 冒烟验证：滚轮上回退到上一行 ✓、滚轮下恢复 ✓。引擎功能审计的**核心体验缺口全部清零**（#39/40/41/42 全落地）
- [ ] bgm2 21 条待用户按提示词生成后进包
- [ ] 68 句旧音色待 freetts 刷新补齐（gen-voices-final.py 幂等）
- [ ] 九结局人工内测（qa-checklist.md）+ itch 上传
- [x] 音色重分配落地（2026-11-14，用户试听选择）：yu=Yunhao / mian=Xiaoxuan / qi=Xiaohan（freetts Azure 渠道）+ lin=Xiaoyi 保持（edge）——107/234 已换新音色；**全目录试听页**（8c99ae4，46 样音/26 音色）+ gen-voices-final.py（双通道路由 + feel 韵律 + 切分拼接 + 新鲜度守卫）
- [ ] ⏸ 断点：freetts 免费池 402 耗尽（402 = 池子空，≠429 限速），68 句旧音色待刷新后续跑 —— 断点清单在 props/ai-voice/remaining-retimbre.json，恢复命令 `python props/ai-voice/gen-voices-final.py`（新鲜度守卫只挑旧音色句，幂等）
- [x] BGM 一轨一用（217ff00 + 本轮）：44 场景 44 条各不相同 —— 23 条旧曲单场景占用 + 21 条 bgm2_* 待生成（提示词 docs/bgm-prompts.md，文件放 props/ai-audio-new/ 后 `python props/ai-audio-new/make-bgm2-data.py && python build.py`）
- [ ] bgm2 21 条待用户按提示词生成后进包（未生成场景暂为合成回退音）
- [ ] 音色/BGM 试听页：docs/audition/voice.html + bgm.html（路径已修复可播放）
- [x] 语音升级轮（2026-11-14，用户要求"升级"）：**长句切分拼接** —— ≥34 字/多句台词按标点切段（20 句）、每段独立神经韵律、段间 0.3s 停顿 ffmpeg 拼接（keeper_before.6 从一口气平读变为 11.9s 带换气的分段朗读）；修复重试循环 seg_paths 残留 bug（1 次 WinError 2）；**分包缓存版本化** —— build 戳 = 双包内容 sha1 嵌入 lite，IndexedDB 缓存内容变才失效（用户刷新即得新语音，不再需要手动清库）；fetch 改 no-cache 防 HTTP 陈旧
- [ ] 用户听感验收（刷新 lite，分包会自动重新拉取一次——缓存失效机制正常工作）
- [x] 语音情感化重生成（2026-11-14，响应用户反馈"语音像 AI 没有感情"）：换 edge-tts（Azure 同款神经音色直连，无配额），按剧本自带 feel 标注映射韵律 —— sad -12%rate/-6Hz、cry -14%/-10Hz、happy +6%/+10Hz、angry +12%/+8Hz 等 8 档（gen-voices-emote.py，映射表在脚本头注释可调）；单渠道顺带消灭 26 句混音色问题；体积 17.3→10.4MB。待用户听感验收，不满意可调映射表重跑（--force 幂等）
- [x] 引擎核心三缺落地（2026-11-14 第四轮，cf7c8be，对标 #39/#40/#41）：
  - **#39 只跳已读**：seen-set（场景:行号 键，FIFO 4000 封顶，25 标记一刷 + skip 关/选项/结局/标题/页面隐藏 flush）；skipTick 遇未读即停；设置面板"快进范围"开关（已读/全部，持久化）；skip 期间语音静音
  - **#40 自动存档**：quickSave 同构 payload（无缩略图），每 8 行 + pagehide/visibilitychange 写 vn-autosave；标题"继续游戏"按钮按时间戳择新（菜单槽 vs autosave）；syncContinueButton 计入 autosave
  - **#41 隐藏界面**：H 键 / 右键（line 模式）toggle 对话框+顶栏，点击/换行恢复；选项/菜单不受影响
  - 验证：**浏览器冒烟 11/11 全过**（playwright headless，lite 构建 @http）：分包加载 ready、语音 234 键、OP 播放+跳过、**语音真实出声**（引号 bug 修复实测确认）、快进停在已读行、全部模式穿越未读、H 隐藏/恢复、刷新后继续游戏恢复剧情。冒烟抓到并修复 OP 冒泡 bug：#vn-start 点击冒泡进 onAppClick 的 op 分支会把刚启动的 OP 当场跳过（beginGame 改 setTimeout 延后 startOp）
  - **#30+#31 标题天色三档**（866a480）：星空亮度随结局收集度分档（0 收集暗红遮蔽 → 有收集常态 → 真结局后燃亮）+ 真结局专属副标题「这次是我自己记住的」（100% 副标题优先级更高）
  - **#33 图片 OP**（3f757d3）：新游戏开始时播 5 张主题级 CG（email/rain_climb/server/wake/dawn）+ kenburns + 邮件主题 BGM 前奏，点击/空格整段跳过；零视频资产
  - **#24 拆分构建**（b0e7afe）：新增 lite 壳 7.5MB（零内联音频，保留图像资产）+ betelgeuse-bgm-pack.js 41.5MB + betelgeuse-voice-pack.js 17.7MB（均 <50MB 缓存线）；props/pack-loader.js fetch + IndexedDB 缓存（二次进入秒开、断网可玩、失败静默降级合成床）；引擎零改动（采样层动态读 window）；完整单文件保留为 file:// 默认
  - **重大潜伏 bug 修复**：voice-data.js 键 `call_lin.0` 未加引号 → 整个 script 块语法报错 → `window.VN_VOICE` 从未定义 → **打包的全部语音在成品里一直是静默的**（被"缺键静默"语义掩盖，node --check 分包时暴露）。已修 make-voice-data.py 键加引号，178 键解析验证通过
- [x] 配音补充第二轮（2026-11-14）：56 句全量补齐，语音 234/234 覆盖。新增 gen-voices-multi.py 多渠道链（freetts→百度回落，DashScope 探针确认账号欠费排除）；修复 dump-remaining.js 两处：键引号正则 + **循环内 readFileSync 重复读 23MB 文件导致 OOM**（234 次迭代≈5.2GB 垃圾，178 键时代 3.1GB 勉强存活故未暴露）。百度渠道音色与 freetts 不同（28 句混渠道音色，可选后续：配额刷新后删对应 mp3 重跑统一音色）
- [x] lite 加载进度 UI（d02482d，2026-11-14）：pack-loader 升级字节级流式进度（ReadableStream + TextDecoder stream 模式保多字节字符）+ "vn-pack" 事件广播；标题屏新增 .vn-pack-status 行（"资源加载中 — 音乐 62% · 语音 100%"），仅 lite 构建可见（完整单文件无 loader，状态对象不出现则永久隐藏）；aria-live polite
- [x] 开放线回收（2026-11-14，本轮）：登记表 7 条开放线全部回收 —— 4 处末尾追加（ending_qi 南风 / qi_watch 热茶 / ending_true 不许哭 / extras_1 销账+回头，语音键零错位）+ 2 个新场景（old_fight 吵架闪回，bgm_call 主题回环，server_hall 选择改道进入；morning_table 真结局早餐，引擎 100% 奖励入口 bonusId 改指它 → extras_1）。22 条伏笔现全部"已回收"。子代理 B 因配额超限失败，新场景按升级机制由主会话直写
- [x] B1 CG 扩容（2026-11-13，本轮）：5 → 20 张。新管线 props/ai-sprites/gen-cg.sh（agnes-image-2.5-flash，16:9 1K，以 cg_memory.webp 作风格参考，幂等可重跑）+ convert-cg.py。每结局一张 + 9 个分支转折点，scenario.js 属性级加 cg: 引用（行文本逐字 diff 验证，语音键零错位），引用/定义 20/20 闭合
- [x] D1 语音同步打字机减速（2026-11-13，本轮）：engine.js 新增 syncTypingToVoice —— 有语音的行，打字节拍 = 音频时长 × 85% / 字数（钳制 8-140ms/char），文本在语音结束前刚好收完；无语音/音效关闭/元数据缺失时保持原三档手速不变；skip 点击后元数据迟到不会误生效。无语音行零影响
- [x] D2 CG kenburns 缓推（2026-11-13，本轮）：.vn-cg-img 叠加 vn-cg-kenburns 28s ease-out forwards（scale 1→1.07 + 0.8%/0.6% 平移，object-fit cover 吃掉超采样边）；syncCg 在可见状态下 CG→CG 换图时用 reflow 强制重启动画（vn-hidden 切换路径本来就重启）；prefers-reduced-motion 下保持静态图
- [x] E1 mixkit 环境音层（2026-11-13，本轮）：新 ambience 层（audio.js apiAmb，独立 HTMLAudio loop，vol×0.35，~1s 交叉淡化，音效开关联动恢复，CG/标题/读档全路径接线 engine.js×6）。素材 Mixkit License 免费商用，64k mono 重编码（13MB→3.6MB），打包 props/amb-data.js（make-amb-data.py）。映射：streets_rain=雨声(sfx/1249) server_room=机械嗡鸣(sfx/2504) observatory_night=山风(sfx/1267) dawn_ending=晨鸟(sfx/2472) apartment_night=room tone(sfx/3080)。来源调研含直接 URL 交叉验证
- [x] sfx_telescope 缺口（本轮）：mixkit 无望远镜素材（Observatory Telescope Motor 仅付费库）；用近似替代 Antique movie projector spinning（sfx/1444，金属机械转动，64k mono 174KB）已下载入库。但引擎无单发采样 SFX 触发机制（sfx_* 键在 audio.js 零消费方），接线留待后续轮 —— 按约定"留空记录"，不算失败
- [ ] ~~新发现：ending_substitute 孤儿结局~~（已救活，见 983bcb6）
- [ ] 提醒：每轮结束 build.py + README/文档数字对齐

## 外部对标（探索轮 2026-11-13，只搜集未落地；落地轮同日完成，见各条标注）

来源一：机核《冬至圣夜话白学》——丸户史明剧作法分析 https://www.gcores.com/articles/22105
来源二：GameLook 电Fami对谈译文——奈须蘑菇×崩铁编剧烧鸡谈团队剧本创作 http://www.gamelook.com.cn/2025/07/574293/ （日文原文 https://news.denfaminicogamer.jp/interview/250708s_）

提炼 5 个可落地提升点（落地轮按序实现，每条完成后标注 commit）：

1. ✅ 已落地 **伏笔登记表** → docs/foreshadowing-ledger.md：22 条伏笔（14 已回收 / 2 部分 / 6 开放线）+ 开放线回收位建议 + 两条结构性发现（ending_true 的 noticed_star 双门控；23:47→07:00 时间戳闭环）
2. ✅ 已落地 **对白潜台词层** → 三个日常场景改写 10 处 narr（night_thoughts 3 / obsv_daily 4 / wake_talk 3），who 行零改动（语音键控安全），例：「她没问我要不要——像这三年，这个动作从来没有停下来过」「笑声落地之前，我先尝到一点咸的」
3. ✅ 已落地 **角色矛盾轴** → docs/character-axes.md：四角色各一条"知道 X 却不知 Y"轴 + 轴间镜像关系（记得小事↔别记大事、无参数却有为↔明知是碑当人守、说谎传染链）
4. ✅ 已落地 **音乐动机回环** → ending_true 加 bgm: "bgm_email"（故事由定时邮件开场，真结局以邮件主题作答；cg_dawn 专属 BGM 在关键一幕接管）
5. ✅ 已落地 **结局末行体检** → 9 结局逐一核对"余韵+向前性"：6 达标；bad / silence / unplug 三个纯痛结局各补 2 行毫米级迈步（如「欠她的那顿早饭，从明天起，一顿一顿，替她吃下去」「总有一年，它会先替我把头抬起来」）

补充探索（同日第二轮，2026-11-13）：
来源三：知乎《Muv-Luv Alternative——关于爱与成长的悲壮史诗》 https://zhuanlan.zhihu.com/p/38536710
来源四：机核《催泪魔王养成计划，Key社发展史（中）》 https://www.gcores.com/articles/16526

6. ✅ 已采纳为扩写标准 **日常篇 = 情感抵押物** — 每场日常戏必须存放可在高潮回收的抵押物（馄饨账、甜豆浆、南风均为合格抵押），无抵押物的日常戏砍掉；开放线清单（登记表）即抵押物赎回日程
7. ✅ 已落地 **信息量操作** → 登记表新增"信息链完整性审计"节：ending_true 骤暗复明与备份真相两条链核对完整；两条开放线（热茶/吵架）标注了回收前需先补的铺垫
8. ✅ 已审计 **关键冲击的延迟释放** — "第一次"清单核对：沈眠真声只在结局出场 ✅、扫描环白光首现于 memory_dive（第二章，前置但不可逆剧情节点，可接受）、真结局 CG 在通关路径末 ✅；无过早消耗项

探索轮 5（2026-11-14，演出方向，两线并行；B 线产出如下，yt-dlp 线后续追加）：
9. ✅ 已落地（2026-11-14 轮）**全屏文字"大字时刻"** — 新 fx: bigtext（.vn-bigtext z7 黑底层 + 单行居中大字 + 消息窗遮盖，随行清除），4 处选点：extras_1「一年后」/ ending_bad 05:59 / old_fight「丢了三年」/ log_last「日志停在 23:52」
10. ✅ 已落地（同轮）**黑屏闪切** — 新 fx: blackout（380ms 黑帧，flash 的镜像），2 处：liar_reveal 沉默行、old_fight 忙音行
11. ✅ 已落地（2026-11-14 第二轮补完）**立绘演出三铁律 + 视线差分** — bounce fx（上轮）；新视线体系：line.gaze "l"/"r"（非黏滞逐行瞥见，缺素材回退正视图并 warn-once）、charArtFor 键位扩展 `<pose>_<feel>_gl/_gr`、renderSprites diff 键纳入 gaze、build-sprites-data.py 变体打包（可选文件静默跳过）；gen-gaze.sh 生成 8 张（4 角色 × gl/gr，PIL 转 png 喂 agnes + make-sprite 抠像）；6 处选点（陈屿望终端/转头看林晚、林晚回避视线→唯一直视的对照、cut_path 对视被打断）。坑复现并规避：qi-gr 首次抠像 0% 透明（已知坑"必须复检透明占比"），删除重跑后 31% 健康
12. ✅ 已落地（2026-11-14 第二轮）**演出减法 + SE 时机** — 引擎新增 apiSfx 单发采样触发（audio.js，vol×0.8，200ms 同键去重，音效开关门控）+ line.se 属性，8 处选点接线（email/door/keyboard/telescope/hum/rain/night/whoosh）；打字机 POSE_LEAD_MS 前置（上轮）；SE/BGM 审查采纳为内容轮标准
13. ✅ 已落地（2026-11-14 第二轮）**音乐/节拍序列** — line.beats = [{at, fx}] 行内节拍调度（applySingleFx 抽取复用、timers.beats 数组、advance/选项/结局/读档/回标题 5 路清理、flash↔blackout 计时器槽位互斥加固）；2+1 处选点（扫描环"白闪→黑帧"、old_fight 白光涨起、diverge 倒计时屏震）；skip 模式下长节拍天然不触发（快进语义自洽）

A 线（yt-dlp 字幕挖掘，同轮）——立绘演出 5 条（源：HbR 立绘演出考察 https://www.youtube.com/watch?v=WOMzF7RTSzs 日文字幕全文）：
14. **表情锚定语音转折词**（低）— 表情切换锚定台词内的转折词瞬间而非点击时机（原证：「って」说出口的瞬间切差分）→ 落地：演出表加"锚点"列，无全语音时锚定该句 SE 15. **单文本框内多段演出**（低）— 一个文本框内完成注视 A→闭眼说核心句→转向 B（打破一框一差分惯例）→ 落地：决定性表态台词用"框内三段式"（pose/fx 序列）
16. **听者立绘反应演出**（低）— 非说话角色实时同步惊讶/无语 → 落地：双人/三人同框场景演出表给听者也排表情列（与 #11 三铁律互补）
17. **多人转头=情绪高点配方**（低）— 话题指向某人时全员转头看她 + 镜头推进 + 定格 → 落地：托付/交接场景（diverge、substitute_before）用此固定配方
18. **闭眼差分 + 演出检查表全场景化**（中）— 最重要一句闭眼说；这些细节日常场景也全做，不只高潮 → 落地：新增"闭眼"差分专用于决定性台词；立绘检查表作为所有场景模板步骤

A 线 ——作者工作流 4 条（源：奈须×武内核心访谈 https://www.youtube.com/watch?v=HFN2Y0LfjE0 ja transcript）：
19. **食材料理法**（低）— 新角色/新资产是"新食材"，设计太强可升格戏份（LB7 カマソッソ原为中 Boss 因设计太强升为人类恶）→ 落地：CG/立绘成品气场超预期时允许升级该角色戏份，不硬塞回原规划
20. **高成本资产复用前置规划**（低）— 奈须坚持先做 Olga Marie 模型因已规划多作复用 → 落地：每张 CG/差分立项写明至少两个用途（主场景+标题画面/回想）
21. **高潮密度门槛**（低）— 「随便把 ORT 拿出来不满足，不能做那么便宜的事」→ 落地：大底牌（核心 CG/黑屏高潮）设检查点：前方铺垫密度不够不许提前打（与 #8 延迟释放审计衔接）
22. **喜剧梗长线登记 + 章节基调反差**（低）— 「搞笑瞬间之后会变得非常重要」；LB6 民话悲剧 vs LB7 热闹冒险谭的基调对比 → 落地：日常喜剧梗登记进伏笔表标潜在回收位；路线间显式设计基调对比

A 线 ——低可靠 1 条（源：粉丝解说 ASR https://www.youtube.com/watch?v=Ht_oNi9qomY ，转写噪音大仅备查）：
23. **虚构里藏真实细节**（低）— 麻枝作品刺中现实辛苦者靠的是虚构中藏真实细节而非直球感动 → 落地：主题台词写作时藏具体真实细节，不做说教

未完成项（诚实标注）：标题画面/OP/ED 演出分析视频无字幕轨，两候选备查（-1aIPDDEYD0 / kDo1S_eAA5o），本轮未补上。yt-dlp 对 YouTube 连续下载触发 429 限流，后续轮注意节流或直接走 transcript provider。

探索轮 6（2026-11-14，网页 VN 特殊约束；A 线产出，B 线标题/第一印象另见后）：
24. **语音拆分包、按需加载**（难度高）— Ren'Py web 导出默认把 voice/music 排除在首屏包外按需拉取（https://www.renpy.org/doc/html/web.html ），大体量另有 Downloader 壳方案（https://www.renpy.org/doc/html/downloader.html ）→ 落地：拆"游戏壳 <30MB（文本/立绘/CG/BGM 内联）+ 语音分包（fetch→Blob→IndexedDB）"，语音是 72MB 的主要构成，是同时解决缓存/进度/移动内存三风险的唯一路径
25. **>50MB 文件浏览器不缓存**（难度中，依赖 24）— Ren'Py 文档原话：>50MB 文件不被缓存、每次全量重下（同上来源）→ 落地：分包各 <50MB 进 HTTP 缓存 + IndexedDB 持久化 = 二次进入秒开、断网可玩
26. **加载进度反馈**（文案版难度低/真进度条中）— itch.io HTML5 默认 Click to Play 可自定义前屏（https://itch.io/docs/creators/html5 ）；Ren'Py #7049 记录大文件下载超时归零先例（https://github.com/renpy/renpy/issues/7049 ）→ 落地：最低成本在发布页明标体积+页内"点击开始"兼做音频解锁门；真进度条以拆包为前提（fetch + ReadableStream）
27. **iOS 移动端内存崩溃红线**（难度中）— 实测 iPhone SE ~100MB/iPad ~200MB 页面内存即崩且不可捕获，50MB 单 data URL 足以崩掉 iPhone（https://lapcatsoftware.com/articles/2026/1/7.html ）→ 落地：72MB 单文件（≈96MB base64 文本，JS 字符串 UTF-16 或占 ~190MB）大概率撞线；至少 UA 检测+移动端警告，理想出"去语音轻量移动版"；触控本身无坑，坑在内存与音频点击解锁
28. **资产压缩审计**（难度低）— OGG 在 iOS Safari 不支持、base64 有 +33% 开销（Ren'Py 文档 + jam 复盘）→ ✅ 本作已自查通过（2026-11-14）：全部音频 audio/mpeg、全部图像 webp/svg、最大单资产 2.3MB（远低于 Firefox 32MB 旧限制）——资产级风险仅剩体积本身，第 24 条是正解

探索轮 6 B 线（2026-11-14，标题演出 + 玩家第一印象；上轮"无字幕轨"误判已修正——视频轨存在但为纯音乐标注/ASR）：
29. **开场第一分钟声音设计核验**（难度低）— 玩家弃坑窗口锚定第一小时量级（Steam Muv-Luv 差评主源是慢热开场 https://store.steampowered.com/app/802880/ ；Ever17 "dropping in the first hour" https://www.tfgames.site/ever17-why-it-is-overrated ）→ 核验结果：opening 有 apartment_night 环境音床从第 1 行即播（子代理声称"零声音"系未查 audio-data，已修正），第 3 行 sfx_email 是首个事件音；可做的小改进：悬念句考虑 bigtext 化，防弃坑窗口最前端漏风
30. **标题星空 = 进度可视化**（难度低）— 标题画面是"到达者专属风景"的系统承认可视化（京都造形艺术大学毕业论文 https://www.kyoto-art.ac.jp/t/graduationworks/detail/20898/ + ゲームニクス #66 https://igcc.jp/game-nics-66/ ）→ 落地：星空按结局收集度分档变亮（0 结局参宿四暗红隐没→真结局后变亮红，直扣标题"还亮着"）；showTitle()/vn-endings 挂点现成
31. **真结局标题新副标题**（难度低）— 通关 ending_true 后 titleSub 追加一行新文案（与 #30 同一实现面双收益）→ 落地：showTitle 按收集状态切换副标题
32. **标题闲置 attract 环**（难度中低）— 闲置 25-30s 自动播 15-20s 循环：星空推镜 + 主题句轮播 + 收集度微闪；demo 要短、可跳过（IGCC 信长野望/水户黄门 idle demo 惯例）→ 落地：复用 fx/beats 系统，零视频资产
33. **30-40s 图片 OP + credits 复用**（难度中）— "新游戏"后播一次可跳过的图片 OP：20 张 CG + kenburns + 主题段 BGM，只放主题级意象不碰剧情画面（Hello,good-bye OP 歌词同层"伏笔不剧透" https://www.youtube.com/watch?v=kDo1S_eAA5o ASR 轨）；OP 本体时长惯例 ≈110-120s，本作可压缩至 30-40s → credits 18s 文字滚动可复用同一序列升级为图片 ED

探索轮 7（2026-11-14，发布/传播维度 —— 本作处于"资产齐备、未发布"的最佳干预窗口）：
34. **AI 素材披露做明牌 + 受众选位**（难度低）— VN 核心玩家圈默认 AI 作品为 shovelware（r/visualnovels "No, I Will Not Read Your AI Visual Novel"），但日本 freem 平台是申告制非禁制（"明記の上、堂々と挑戦して" https://www.freem.ne.jp/special/project/158 ）→ 落地：发布页 credits 逐项标注 AI 范围（立绘/CG/BGM/TTS）；宣传主攻 AI 宽容场域（r/vndevs、VN 开发者 Discord、itch 标签受众），避开纯粹主义社区
35. **itch.io 页面工程**（难度低）— 多数访客只看缩略图；截图要差异化（忌同场景连拍和菜单图）；tag 用满 10 个避开 >50k 大 tag（Arimia VN 营销指南 https://arimiadev.com/how-to-market-visual-novels/ ）→ 落地：缩略图放最强 CG + 5 张差异化截图 + features 写明 "56 scenes / 9 endings / fully voiced / plays in browser"（浏览器即玩是稀缺形态卖点）
36. **发布前 9 结局覆盖内测**（难度低）— 商业复盘经典："总有一条冷门路线没人通关，那个不起眼的变量毁掉一个结局"（Cinders postmortem http://moacube.com/blog/cinders-postmortem-2-production-and-business/ ）→ 落地：小群 checklist 通关 9 结局（存档截图+卡点记录）；专项测浏览器存档持久化（刷新/关标签）与手机 Safari；内测记录写成发布预热 devlog 37. **AI 配音长句专项返工**（难度中）— AI 配音是唯一"会被截图抓包"的资产，长句不自然需按停顿切分拼接（AI VN 管线实践 https://medium.com/@Ewnid/on-applications-of-generative-ai-in-visual-novel-development-ceed7db20aa7 ）；真人配音的《Luminary》都被误指 AI 机械 —— 玩家对语音 AI 感极敏感 → 落地：抽听全量 234 句筛长句重做；credits 写明 TTS 工具与处理流程；预写一页"为什么选 AI 配音"FAQ 38. **内容冻结先发完结版，增补留作更新**（难度中）— jam 复盘统一公式："先发完结，砍掉的内容作后续更新"（还能当二次宣传节点）；传播押社区长尾而非大媒体（Cinders 真实流量数据：Kotaku 特稿仅 #21 转化差，垂直测评反而卖更多）→ 落地：56 场景/9 结局即冻结；规划 4-6 篇发布期 devlog（AI 配音工序/结局攻略/幕后）节奏化发布；垂直博主逐个私信外联，忌通用新闻稿

探索轮 7 B 线（2026-11-14，引擎功能对标审计 vs Ren'Py/TyranoScript/Naninovel/WebGAL；反向确认：CG 画廊/音乐盒/立绘查看/剧情树/结局收集这些 note.com 必须项本引擎不仅齐全且超出三家默认水平）：
39. **已读文本跟踪 + 只跳已读**（难度中｜最介意的一项）— Ren'Py/Naninovel/TyranoScript 三家标配且默认只跳已读；玩家实锤抱怨缺它被拒（https://www.reddit.com/r/visualnovels/comments/5ace4w/ https://www.reddit.com/r/visualnovels/comments/b2yzzd/ ）；本作 9 结局强周回设计最需要 → 落地：以 场景:行号 为稳定键（append-only 约定保证索引永不位移）写封顶 localStorage Set；skip 步进遇未读即停；设置面板加"跳过未读"开关；engine.js:813 "unconditional skip" 注释是落点，recordSeen/SEEN_KEY（~2952 行）已有场景级 seen 存储可参考（粒度需细化到行）
40. **自动存档 + 标题"继续游戏" + 结局检查点**（难度低｜网页平台尤其介意）— Ren'Py 每 200 交互 autosave；浏览器是最易误关的平台，关标签丢全部进度比 Steam 桌面版更致命 → 落地：复用 3 槽序列化器，advance + visibilitychange/pagehide 节流写 vn-autosave；标题检测显示"继续游戏"；结局达成自动存检查点（顺带解决 #44）
41. **文字窗临时隐藏（H 键/右键 toggle）**（难度低｜放大既有投资的最便宜一项）— Ren'Py 键位标配；20 张 CG + kenburns 是重投入资产，玩家却始终隔着文字窗看（https://www.renpy.org/doc/html/keymap.html ）→ 落地：右键 preventDefault 或 H 键 toggle 对话框类名，点击恢复
42. **Rollback 回滚**（难度中｜Ren'Py 独有文化预期，半介意）— 环形缓冲最近 50 行快照（flags/立绘/cg/bgm），选项行为回滚屏障；回滚行瞬显文本不重播语音 → 详谈悬疑文本"手滑跳过想倒回看一眼"是真实场景，backlog 能读不能回，可排后
43. **无障碍：字号/行距/高对比**（难度低｜小众但加分）— Ren'Py 内置无障碍菜单；OpenDyslexic 无 CJK 字形，中文对应做法是字号/行距/字重（https://ladyicepaw.itch.io/invisible-seams/devlog/415360/tips-on-making-your-vn-more-accessible ）→ 落地：设置面板加三项，进现有持久化偏好；语音 234/234 已等效 self-voicing；顺带改善移动端小屏
44. **章节选择/通关后快速再开始**（难度中｜不太介意，已有剧情树+画廊覆盖大半）→ 落地收敛为 #40 的结局检查点形式，不做完整 flags 反推（成本/风险比高）
45. **UI/文本多语言**（全文难度高｜不建议做）— 234 行译文 + 语音绑定是全语音架构下最贵的坑；仅 UI chrome i18n 价值低 → 除非明确出海，不投入

## 已知坑（不要重蹈）

- gen-voices-freetts.py 的 jobs 曾读过期 remaining-voices.json 快照 → 整轮"71 ok"实为全 no-op 零新增；已修复为脚本启动自动 node dump-remaining.js（2026-11-14）
- heredoc 内嵌 python 容易被 shell 包装破坏 → 复杂脚本用 Write 落盘再执行
- make-sprite.py 抠像后必须复检透明占比（曾漏 11 张）
- grep 管道行号前缀会污染输出文件名（NTFS ADS 事故）
- 测试断言硬编码结局数量（3→9 已改），扩容相关功能时先 grep 测试
- free.ai 音频模型全部 paid-only；TTS 与 music 队列独立，TTS 可用
- .secrets/audio.env 有 freeai_key；workspace/default/.env 有 GITHUB_TOKEN；都绝不回显
