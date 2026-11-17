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

上游 2026-11-13 发布 v0.1.1（`5d5dd75`）后停更：仓库只有 2 个提交，PR 通道关闭（`/pulls` 返回 404）。
本仓库已与该版本同步，并在历史导入等模块超出上游，没有待合并的上游提交。

- 查更新：`git -c http.proxy=http://127.0.0.1:7897 fetch origin`
  再看 `git log --oneline $(git merge-base pwa origin/main)..origin/main`
- **不要整支 merge**：历史导入、设置页、i18n、余额卡都已大改，merge 会大面积冲突；上游将来真有提交时，只 cherry-pick 相关改动
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

## 当前状态（2026-11-17）

- 已上线：<https://hongshuxifan321.github.io/ds-chat/>（Pages，GitHub Actions 构建，2026-11-16 首次部署）
- 线上对应当前 `pwa` 分支头部：`734d404`，Actions run #14 成功
- 已完成：PWA（manifest / service worker / 图标 / 离线壳）；设置页三步引导（创建 Key → 充值 → 回填）、充值教程与官方历史导出教程；历史导入（坏会话跳过、支持解压后的文件夹、三段式进度）；侧边栏余额卡（余额 + 赠金 + 去充值）；手机回车换行；API 响应解析健壮性
- 已知未修：iOS Safari 首屏白屏；历史里留有服务端不支持的图片格式时，后续每轮提问都会失败
- 待办：UI 对齐官方网页端（上一轮已尝试并撤回，需重新设计）；真机安装 / 离线 / 移动端渲染人工复核
