# 项目规则 - DS Chat

## 定位

自带 API Key 的 DeepSeek 对话客户端，纯静态 PWA，托管在 GitHub Pages。
非官方项目，与深度求索无关；不提供任何后端服务，不收任何用户数据。

## 目录结构

```
DS-Chat/
├── AGENTS.md        本文件
├── README.md        对外说明（英文）
├── README.zh-CN.md  对外说明（中文）
├── src/             应用源码（React + rspack）
├── public/          PWA 资源：manifest、sw.js、图标
├── scripts/         图标生成、本地预览服务器
├── docs/            方案与文档索引
├── preview/         构建产物 + 启动预览.cmd（不纳入 git）
├── .github/         Pages 部署工作流（沿用上游）
├── dist/            构建输出（不纳入 git）
└── LICENSE          上游 MIT 许可，必须保留
```

## 常用命令

- 装依赖：`npm install`（CI 走 `pnpm install --frozen-lockfile`，两者都跑得通）
- 构建：`npx rspack build -c rspack.config.ts`（Windows 下用 `node_modules\.bin\rspack.cmd`）
  （`npm run build` 里的 `rm -rf` 在 Windows cmd 不可用，别用）
- 类型检查：`npx tsc -p tsconfig.json`
- Lint：`npx oxlint src rspack.config.ts`
- 重出图标：`python scripts/make_icons.py`
- 本地预览：`python scripts/serve_static.py`（先绑端口再开浏览器）
- 更新预览版：构建后把 dist 内容拷进 preview/

改完必须跑通 type + lint + build 三项再提交。

## 上游关系

- 派生自 deepseek-ai/chat-demo（MIT），保留 LICENSE 与版权声明
- `origin` 指向上游，`mine` 指向自己的仓库
- **协议层一个字不改**：`system`、`latest_reminder`、`tools`、历史消息构造是「API 不难吃」的前提，动了就退化
- 解析层（`src/services/api/`）只做健壮性修复，例如拿不到流式响应体时整段解析、响应头只当提示不当错误；不改任何请求字段与协议语义
- 自研改动落在：UI（含侧边栏余额卡）、PWA、品牌、设置页文案与引导、历史导入、i18n

## 上游同步

上游 2026-11-19 发布 v0.1.2（`429af5a`；实际两条提交：`4ee2972` 收紧附件预览与回复里的链接、`429af5a` 版本号）。
2026-11-20 已整支 merge 进 `pwa`（`65f9b7a`），全部冲突只有 3 个文件：`package.json`、`DraftAttachments.tsx`、`drafts.ts`。

- 查更新：`git -c http.proxy=http://127.0.0.1:7897 fetch origin`
  再看 `git log --oneline $(git merge-base pwa origin/main)..origin/main`
- **整支 merge 是可行的**：绝大多数改动 git 能自动合上，真实冲突只在附件预览链路（上游删 `previewUrl`、加 `useFileView`）与 `package.json`
- 合并取舍（2026-11-20 定的规矩，下次照此处理）：
  - 一律收：上游的安全收紧（附件按后缀定类型、链接只认 http(s)）、`useFileView`、`FileCard` 的 `link`
  - `package.json`：留我们的 `name`/`description`，`version` 跟上游
  - 草稿缩略图：仍是我们自己的裁剪入口，不接上游的预览链接（64px 的缩略图塞两个热区必然误触）
  - 我们加的 `unsupported`（服务端拒绝过的附件）状态要嫁接回 `MessageFile`
- 上游不收 PR，自研改进不回馈上游

## 品牌边界

- 名称 DS Chat，仓库 ds-chat
- 不使用 DeepSeek 的名称、logo、官方图标
- README 与设置页保留「非官方」声明

## Git 纪律

- 一次改动一次提交，message 说明改了什么
- 不提交 node_modules、dist、preview、package-lock.json
- 推送前必须确认；推送用 `git push mine pwa:main`（Pages 从 main 构建，pwa 是开发分支）
- 线上验证以部署后的站点为准，不看 bundle hash（CI 的 pnpm 依赖解析与本地 npm 安装不同，产物 hash 必然不同）

## 当前状态（2026-11-20）

- 已上线：<https://hongshuxifan321.github.io/ds-chat/>（Pages，GitHub Actions 构建，2026-11-16 首次部署）
- 线上对应当前代码：`46e6e89`（上游 v0.1.2 合并 `65f9b7a` + 首帧缩略图修复 `e0e8390` + 设置页「选文件夹」居中），Actions run `44660076922` 成功（2026-11-20 推送）；其后只有文档提交，不单独记 run
- 已完成：PWA（manifest / service worker / 图标 / 离线壳）；设置页三步引导（创建 Key → 充值 → 回填）、充值教程与官方历史导出教程；历史导入（坏会话跳过、支持解压后的文件夹、三段式进度）；侧边栏余额卡（余额 + 赠金 + 去充值）；手机回车换行；API 响应解析健壮性；会话置顶；菜单定位修复；思考结束自动收起；图片格式（按服务端能解码的格式决定 image/document 块与上传 purpose，被拒绝的附件排除后自动重发）；发送前补传历史图片改为一轮一次写入（原为每张图重写整份会话）；导入拒绝「无可读会话」的归档，避免清空历史；发送前裁剪图片（点缩略图框选，统一重编码为 JPEG、长边 2048）；合入上游 v0.1.2（附件预览按后缀定类型：栅格图/PDF 新标签、SVG 走 `data:`、其它按文件名下载；引用 / 搜索结果 / fetch 链接只认 http(s)；草稿缩略图仍保留我们的裁剪入口）；刚发送的附件当轮就显示缩略图（`useFileView` 读不到原件时 60/160/400 ms 重试三次，仍读不到才退回文件卡片）
- 已知未修：
  - **导入历史后发送「闪退」回初始页**（有真实用户反馈）：写放大已修（`d6ffe2b`，一轮一次写入），但发送前仍要逐张补传，150 轮 / 30 张图实测 34～44 秒、每张约 1.1～1.3 秒，瓶颈未定位；`activeId` 不持久化、也没有 error boundary，标签页被回收后重载就落回欢迎页。详见 `docs/已知问题.md`
  - iOS Safari 首屏白屏
- 待办：UI 对齐官方网页端（上一轮已尝试并撤回，需重新设计）；真机安装 / 离线 / 移动端渲染人工复核
