# 景点览胜 - 旅游景点可视化平台

基于 **Next.js 16 + TypeScript + Tailwind CSS v4 + Zustand + Framer Motion** 构建的景点数据可视化单页应用。

## 功能

### 核心景点功能
- **景点览胜** — 网格/列表双视图，支持搜索（名称/地址/设施/项目）和分类筛选；景点卡片展示图片、分类标签、地址、推荐项目；点击进入详情弹窗，支持多图浏览和收藏
- **景点网络** — SVG 经纬度投影网络图，按区域分组连色线，支持拖动/缩放/点击居中（二次点击进详情），拖尾连线展示地理位置关系
- **收藏景点** — 收藏功能，数据持久化到 localStorage；收藏数量角标实时更新
- **我的信息** — 景点/收藏/分类数统计
- **旅人测试** — 基于收藏景点的分类分布计算旅人人格;塔罗牌式 3D 翻牌动画逐张揭示维度;生成个性化人格卡（称号 + 描述 + 推荐），支持分享/复制
- **预算沙盘** — 按景点展开推荐项目，逐项勾选计费;实时汇总当前预算，对比满选总价;穷游/舒适/土豪三档预算条对比;价格分层统计（免费/平价/中档/高端）;支持全选付费和全部取消快捷操作

### 数据导入
- **JSON 导入** — 支持自定义 JSON 数据追加导入（按名称去重，不覆盖已有数据）
- **智能配图** — 导入时自动通过 Unsplash/Pexels API 按分类关键词拉取真实照片，API 失败降级到本地图片池，图片池耗尽则显示分类渐变色占位

### 沉浸式辅助视图
- **劝退指南** — 根据时段和身体条件评估是否适合出行
  - 健康预警拨盘（清晨/正午/黄昏的紫外线强度与阴影占比）
  - 身体红灯筛选（膝盖不适/心脏负担/怕热中暑，单击切换、双击看差评原文）
  - 翻车时间轴（snap 滚动浏览各时段排队与避峰建议）
  - 长按 3 秒结论球：基于当前 UV + 激活的身体红灯综合评分给出"建议改日再来 / 今天可以冲"
  - TTS 语音播报劝退原因、震动反馈
- **体力账本** — 智能评估行程体力消耗
  - 同行人录入（腿脚灵便/需要搀扶/轮椅出行），按最受限者决定路线样式
  - 海拔折线图带可拖动红色游标，实时计算已爬楼层/剩余体力/下个补给点距离
  - 3D 翻转切换"全程路线/分段休息"视图，轻松模式隐藏上坡数据
  - SOS 紧急按钮（长按 1.5 秒触发最短脱困路径 + 一键拨打 120）

## 快速开始

```bash
# 安装依赖
npm install

# 复制并填写环境变量
cp .env.example .env

# 开发模式
npm run dev

# 构建生产版本
npm run build
npm start
```

访问 http://localhost:3000

## 环境变量

在 `.env`（或部署平台的 Environment Variables）中配置以下密钥，用于景点导入时的智能配图：
```env
NEXT_PUBLIC_UNSPLASH_ACCESS_KEY=your_key #Unsplash API 密钥（图片搜索首选源） 
NEXT_PUBLIC_PEXELS_API_KEY=your_key #Pexels API 密钥（Unsplash 失败时降级）
```
> 两个密钥都未配置时，导入功能仍可用，图片将自动降级到本地图片池或渐变占位，控制台会输出 `NO_API_KEYS` 警告。

## 项目结构

```
src/
├── app/
│   ├── api/search-photo/route.ts  # 图片搜索 API（Unsplash + Pexels 双源 + 服务端缓存）
│   ├── layout.tsx                  # 根布局
│   ├── page.tsx                    # 主页面（侧边栏/移动端顶栏/景点视图/详情弹窗/导入逻辑）
│   └── globals.css                 # 全局样式 + Tailwind 主题
├── components/
│   ├── network-view.tsx            # 景点网络 SVG 视图（经纬度投影 + 拖动缩放）
│   ├── personality-view.tsx        # 旅人测试（塔罗牌 + 人格卡）
│   ├── budget-view.tsx             # 预算沙盘（项目勾选 + 三档对比）
│   ├── deterrent-view.tsx          # 劝退指南视图（时段拨盘 + 身体红灯 + 时间轴）
│   ├── fitness-view.tsx            # 体力账本视图（海拔图 + 同行人 + SOS）
│   └── ui/                         # shadcn/ui 组件（badge/button/dialog/input/scroll-area/separator）
└── lib/
    ├── spot-data.ts                # 景点数据类型、JSON 解析、分类映射、本地图片池、示例数据
    ├── store.ts                    # Zustand 状态管理（localStorage 持久化 spots + favorites）
    └── utils.ts                    # cn() 工具函数
public/                             # logo.svg、robots.txt
next.config.ts                      # Next.js 构建配置
tailwind.config.ts / postcss.config.mjs   # Tailwind CSS v4 配置
tsconfig.json                       # TypeScript 配置（@/* → src/*）
```

## 图片源说明

景点导入时的图片获取遵循四级降级策略：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | Unsplash API | 按分类英文关键词搜索，每分类可获取数百张不重复照片 |
| 2 | Pexels API | Unsplash 失败时自动降级 |
| 3 | 本地图片池 | 每分类 8 张预置 Unsplash URL（`spot-data.ts` 中的 `CATEGORY_PHOTOS`） |
| 4 | 渐变占位 | 以上全部耗尽时显示分类主题色 + emoji |

> **关于本地图片池（第 3 级）的更新机制**：它是编译期写死的常量数组，与第 1/2 级 API 运行时拉取的结果**相互独立**，API 拉到的新 URL 不会自动回写到本地图片池。如需扩展本地池，需手动编辑 `src/lib/spot-data.ts` 中的 `CATEGORY_PHOTOS`。

## JSON 导入格式

支持多种字段名，自动识别：

```json
[
  {
    "name": "景点名称",
    "image": "https://... (可选)",
    "address": "广东省广州市海珠区",
    "category": "自然风光",
    "description": "景点介绍",
    "facilities": ["设施1", "设施2"],
    "projects": ["项目1", "项目2"],
    "location": { "lat": 23.1, "lng": 113.3 }
  }
]
```

也支持嵌套格式与别名：
- 嵌套：`{ "data": [...] }`、`{ "spots": [...] }`、`{ "list": [...] }`、`{ "items": [...] }`
- 字段别名：`image/cover/pic/imageUrl/thumb`、`address/addr`、`facilities/facility`、`projects/project/activities`、`category/type/classify/tag`、`location/coord/coordinates/lat_lng`
- 坐标支持对象 `{lat,lng}`、数组 `[lat,lng]`、字符串 `"lat,lng"` 三种格式

## 技术栈

- **框架**：Next.js 16（App Router）+ React 19
- **语言**：TypeScript 5
- **样式**：Tailwind CSS v4
- **状态管理**：Zustand 5（persist 中间件持久化到 localStorage）
- **动画**：Framer Motion 12
- **UI 组件**：shadcn/ui + Radix UI
- **图标**：lucide-react
