# BGM2 — 新增曲目生成提示词（一轨一用，与旧曲分家）

> 母页面: [[betelgeuse-visual-novel]]
> 依据: 外部对标 #39-41 审计 + 用户裁定「所有 BGM 只能使用一次」
> 格式: 对齐旧管线（AudioLDM 2 via free.ai）——英文提示词 = 情绪 + 乐器 + 氛围 + no drums
> 使用: 用你的音乐生成工具按 prompt 生成，文件名必须是下面的 target name，
> 放入 `props/ai-audio-new/` 目录（mp3, 44.1k 单声道 80-128k），
> 然后 `python props/ai-audio-new/make-bgm2-data.py && python build.py` 自动进包。

## 场景映射总表（44 场景 → 44 条各不相同的音乐）

| 场景 | 曲目 | 来源 |
|---|---|---|
| opening | apartment_night | 旧·位置床 |
| night_thoughts | **bgm2_night_thoughts** | 新 #1 |
| email_first | bgm_email | 旧 |
| went_solo | streets_rain | 旧·位置床 |
| call_lin | bgm_call | 旧 |
| reply_email | bgm_epiphany | 旧 |
| climb_rain | bgm_tension | 旧 |
| obsv_night | bgm_discovery | 旧 |
| obsv_daily | observatory_night | 旧·位置床 |
| log_last | bgm_conspiracy | 旧 |
| descend | server_room | 旧·位置床 |
| hall_quiet | **bgm2_hall_quiet** | 新 #2 |
| server_hall | **bgm2_server_hall** | 新 #3 |
| memory_dive | memory_white | 旧·位置床 |
| liar_reveal | bgm_reveal | 旧 |
| lin_grief | **bgm2_lin_grief** | 新 #4 |
| converge_talk | bgm_choice | 旧 |
| qi_converse | **bgm2_qi_converse** | 新 #5 |
| diverge | **bgm2_diverge** | 新 #6 |
| wake_path | bgm_wake | 旧 |
| wake_talk | **bgm2_wake_talk** | 新 #7 |
| cut_path | **bgm2_cut_path** | 新 #8 |
| keeper_before | **bgm2_keeper_before** | 新 #9 |
| substitute_before | **bgm2_substitute_before** | 新 #10 |
| gate_approach | bgm_gate | 旧 |
| clearance_before | **bgm2_clearance_before** | 新 #11 |
| unplug_before | **bgm2_unplug_before** | 新 #12 |
| finale_gate | **bgm2_finale_gate** | 新 #13 |
| wake_check | **bgm2_wake_check** | 新 #14 |
| ending_true | **bgm2_ending_true** | 新 #15 |
| ending_good | dawn_ending | 旧·位置床 |
| ending_bad | bgm_ash | 旧 |
| qi_watch | bgm_keeper | 旧 |
| qi_dawn | **bgm2_qi_dawn** | 新 #16 |
| ending_qi | **bgm2_ending_qi** | 新 #17 |
| ending_turnback | bgm_fake_turnback | 旧 |
| ending_silence | bgm_fake_silence | 旧 |
| ending_clearance | bgm_fake_clearance | 旧 |
| ending_unplug | bgm_fake_unplug | 旧 |
| ending_substitute | bgm_fake_substitute | 旧 |
| extras_1 | bgm_afterglow | 旧 |
| extras_2 | **bgm2_extras** | 新 #18 |
| morning_table | **bgm2_morning_table** | 新 #19 |
| old_fight | **bgm2_old_fight** | 新 #20 |
| （图片 OP） | **bgm2_op** | 新 #21 |

刻意贯穿的主题系列（wake/keeper/choice/email/call）改为"每场景一条变奏曲"——
同一母题的不同变奏，满足一轨一用的同时保留主题感。

## 21 条生成提示词

### 1. bgm2_night_thoughts — 深夜公寓·指尖悬在半空（opening 之后）
目标场景: night_thoughts（11 行 ≈ 70s）
```
melancholic solo piano over a distant low synth drone, 3am insomnia introspection, a man staring at an unread email, sparse notes with long silences between phrases, cold and heavy, no drums
```
### 2. bgm2_hall_quiet — 机房门前·一线绿的黑暗
目标场景: hall_quiet（10 行 ≈ 60s）
```
dark ambient tension, faint emergency light hum, low cello drone with sparse metallic pings, a sealed underground door, slow uneasy breathing rhythm, no drums
```
### 3. bgm2_server_hall — 唯一活着的机柜
目标场景: server_hall（16 行 ≈ 100s）
```
minimal electronic ambient, one slowly breathing server rack among dead ones, soft teal pad, sparse digital heartbeat pulse, cold reverent stillness, no drums
```
### 4. bgm2_lin_grief — 不老的碑·哀悼
目标场景: lin_grief（12 行 ≈ 80s）
```
restrained mournful strings, a single violin holding one long note, quiet grief that refuses to cry, cold server room air, delicate and heartbreaking, no drums
```
### 5. bgm2_qi_converse — 与栖深谈·一千零九十六个夜晚
目标场景: qi_converse（12 行 ≈ 80s）
```
intimate ambient dialogue theme, soft glass-like synth tones answering each other, gentle AI warmth emerging from cold circuitry, curious and tender, no drums
```
### 6. bgm2_diverge — 六十秒倒计时·抉择
目标场景: diverge（8 行 ≈ 55s）
```
tense decision countdown, pulsing synth bass under suspended strings, sixty seconds on a clock, rain stopped outside, weight of an irreversible choice, no drums
```
### 7. bgm2_wake_talk — 四分钟·只聊小事
目标场景: wake_talk（14 行 ≈ 95s）
```
tender fragile music-box melody over soft white pad, four minutes of small talk between reunited friends, sweet soy milk and candy, gentle time pressure hidden beneath warmth, no drums
```
### 8. bgm2_cut_path — 切断确认·最后的晚安
目标场景: cut_path（9 行 ≈ 60s）
```
somber farewell ambient, muted piano and low strings, a hand resting on a cold switch, letting go with love, quiet acceptance, no drums
```
### 9. bgm2_keeper_before — 留下来的代价
目标场景: keeper_before（10 行 ≈ 70s）
```
solemn guardian theme, warm synth pad with a lone flute, an AI choosing to stay behind, quiet devotion with a hint of loneliness, no drums
```
### 10. bgm2_substitute_before — 白光将落·牺牲的决心
目标场景: substitute_before（14 行 ≈ 95s）
```
tragic heroic ambient, swelling strings over a fragile piano motif, a man walking toward glowing light, snow-like particles falling, bittersweet resolve, no drums
```
### 11. bgm2_clearance_before — 待移交数据·三十秒反悔
目标场景: clearance_before（9 行 ≈ 60s）
```
cold procedural tension, ticking clock texture, bureaucratic dread with a human plea underneath, faint phone static, last chance to turn back, no drums
```
### 12. bgm2_unplug_before — 手比脑子快
目标场景: unplug_before（8 行 ≈ 55s）
```
impulsive dark ambient, rising distorted drone toward a snapping point, trembling hands near a power cable, grief turning into action, no drums
```
### 13. bgm2_finale_gate — 落闸·整座山一层层熄灯
目标场景: finale_gate（3 行 ≈ 25s）
```
descending ambient swells, lights going out layer by layer across a mountainside, deep finality, one distant red star still shining, elegiac and vast, no drums
```
### 14. bgm2_wake_check — 天光斜落·迟到的黎明
目标场景: wake_check（2 行 ≈ 20s）
```
gentle dawn ambience, first pale light through a dome slit, quiet relief after a long night, soft piano arpeggio barely waking up, no drums
```
### 15. bgm2_ending_true — 邮件主题·解答变奏
目标场景: ending_true（19 行 ≈ 130s）
```
the email theme answered at last, warm piano carrying the original motif to resolution, sunrise strings joining gently, memory moving forward, hopeful and cathartic, no drums
```
### 16. bgm2_qi_dawn — 守灯人·第一个六点
目标场景: qi_dawn（12 行 ≈ 80s）
```
quiet morning routine ambient, a soft alarm chime, typing on an old terminal, learning to keep a weather log, gentle loneliness turning into purpose, no drums
```
### 17. bgm2_ending_qi — 守灯人·十年后的灯
目标场景: ending_qi（8 行 ≈ 55s）
```
timeless guardian epilogue, soft pad holding one steady warm tone like an eternal lamp, years passing in gentle layers, devotion grown into identity, no drums
```
### 18. bgm2_extras — 尾声·望远镜与星图
目标场景: extras_2（3 行 ≈ 20s）
```
serene afterglow variation, telescope turning toward a steady red star, soft chimes and warm pad, peaceful closure, everything in its place, no drums
```
### 19. bgm2_morning_table — 甜豆浆的早晨
目标场景: morning_table（12 行 ≈ 80s）
```
light warm breakfast theme, gentle ukulele and soft piano, steam rising from sweet soy milk, reunion over an ordinary morning table, shy happiness, no drums
```
### 20. bgm2_old_fight — 三年前的电话·忙音
目标场景: old_fight（11 行 ≈ 75s）
```
memory of an unfinished phone call, warm nostalgic guitar fading into a busy tone, words that were never said, regret wrapped in static, no drums
```
### 21. bgm2_op — 片头主题·邮件的前奏
目标场景: 图片 OP（5 张 CG ≈ 18s）
```
opening titles prelude, the email motif hesitating before it begins, starlit night over a mountain road, anticipation and longing, cinematic ambient build, no drums
```
