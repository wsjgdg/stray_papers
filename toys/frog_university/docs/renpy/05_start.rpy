## 奶蛙大学 · 运行入口与持久化变量（由导出数据生成，改剧本请改源再重新生成）

## 学期全局沉默值（跨线累计；结局判定用，引擎口径：clamp 到 0 后按区间判定）
default silence = 0

## 学期数：二周目回响 / 档案补记（>= 2）、三周目免检批注（>= 3）
default playthrough = 1

## 好感表：角色 id → 分值（选项带 affinityDelta 时累计）
default affinity = {}

## 已读行集合（跳过已读用；行 id 全局唯一，可直接当键）
default seen_lines = set()

label start:
    # 标题画面 / 主题选择 / 校园地图自由选线在 Web 版另有完整实现；本工程以固定顺序演示剧情流：
    # 共通日程（day1 开学第一天）→ 教学线（引导线，恒解锁）→ 期末认定 → 宿舍线（样板线《熄灯之后》）
    call common_day_1
    call story_teaching
    $ playthrough += 1  # 演示二周目：回响节点（echo）与档案补记（plus）由此开始播
    call story_dorm
    return

