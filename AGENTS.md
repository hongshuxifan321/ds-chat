# 项目规则 - DS Chat

## 定位

自带 API Key 的 DeepSeek 对话客户端，纯静态 PWA，计划挂 GitHub Pages。
非官方项目，与深度求索无关；不提供任何后端服务，不收任何用户数据。

## 目录结构

```
DS-Chat/
├── AGENTS.md        本文件
├── src/             应用源码（React + rspack）
├── public/          PWA 资源：manifest、sw.js、图标
├── scripts/         图标生成、本地预览服务器
├── docs/            方案、实验记录、图标预览
├── preview/         构建产物 + 启动预览.cmd（不纳入 git）
├── .github/         Pages 部署工作流（沿用上游）
├── dist/            构建输出（不纳入 git）
└── LICENSE          上游 MIT 许可，必须保留
```

## 常用命令

- 装依赖：`npm install`
- 构建：`npx rspack build -c rspack.config.ts`
  （`npm run build` 里的 `rm -rf` 在 Windows 不可用，别用）
- 类型检查：`npx tsc -p tsconfig.json`
- Lint：`npx oxlint src rspack.config.ts`
- 重出图标：`python scripts/make_icons.py`
- 本地预览：`python scripts/serve_static.py`（先绑端口再开浏览器）
- 更新预览版：构建后把 dist 内容拷进 preview/

## 上游关系

- 派生自 deepseek-ai/chat-demo（MIT），保留 LICENSE 与版权声明
- `origin` 指向上游，用于同步官方更新
- **协议层一个字不改**：system、latest_reminder、tools 是"API 不难吃"的前提，动了就退化
- 自研改动只允许落在 UI、PWA、品牌三处

## 品牌边界

- 名称 DS Chat，仓库 ds-chat
- 不使用 DeepSeek 的名称、logo、官方图标
- README 与设置页保留"非官方"声明

## Git 纪律

- 一次改动一次提交，message 说明改了什么
- 不提交 node_modules、dist、preview、package-lock.json
- 推送 GitHub 前必须先确认

## 当前状态

- PWA 已完成：manifest、service worker、图标、离线壳、子路径部署验证
- 待办：UI 对齐官方网页端；GitHub Pages 尚未发布