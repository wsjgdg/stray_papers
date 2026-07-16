# 景点览胜 - 旅游景点可视化平台

基于 **Next.js 16 + TypeScript + Tailwind CSS + Zustand** 构建的景点数据可视化单页应用。

## 功能

- **景点览胜** — 网格/列表双视图，支持搜索和分类筛选
- **景点网络** — SVG 经纬度投影网络图，支持拖动/缩放/点击居中
- **收藏景点** — 收藏功能，数据持久化到 localStorage
- **JSON 导入** — 支持自定义 JSON 数据追加导入（不覆盖已有数据）
- **智能配图** — 导入时自动通过 Unsplash/Pexels API 按分类关键词拉取真实照片，API 失败降级到本地图片池，图片池耗尽则显示分类渐变色占位

## 快速开始

```bash
# 安装依赖
npm install

# 编辑 .env 填入密钥
cp .env.example .env

# 开发模式
npm run dev

# 构建生产版本
npm run build
npm start
```

访问 http://localhost:3000

## 项目结构

```
src/
├── app/
│   ├── api/search-photo/route.ts  # 图片搜索 API（Unsplash + Pexels 双源）
│   ├── layout.tsx                  # 根布局
│   ├── page.tsx                    # 主页面（所有视图）
│   └── globals.css                 # 全局样式
├── components/
│   ├── network-view.tsx            # 景点网络 SVG 视图
│   └── ui/                         # shadcn/ui 组件库
├── lib/
│   ├── spot-data.ts                # 景点数据类型、解析、本地图片池
│   ├── store.ts                    # Zustand 状态管理（localStorage 持久化）
│   └── utils.ts                    # 工具函数
└── hooks/                          # 自定义 hooks
public/                             # 静态资源
next.config.ts                      # Next.js 构建配置（等效于 vite.config.js）
package.json                        # 依赖和脚本
tailwind.config.ts                  # Tailwind CSS 配置
tsconfig.json                       # TypeScript 配置
```

## 图片源说明

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | Unsplash API | 按分类关键词搜索，每分类可获取数百张不重复照片 |
| 2 | Pexels API | Unsplash 失败时自动降级 |
| 3 | 本地图片池 | 每分类 25-30 张预置照片（无需网络） |
| 4 | 渐变占位 | 以上全部耗尽时显示分类主题色 + emoji |

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

也支持嵌套格式：`{ "data": [...] }`、`{ "spots": [...] }` 等。
