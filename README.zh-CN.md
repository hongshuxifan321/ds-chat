# DS Chat

[English](README.md) | 简体中文

> **这是 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo) 的派生分支，改成了可安装的 PWA，非 DeepSeek 官方产品，与深度求索无关。** 原项目 MIT 许可，版权归 DeepSeek，许可证原文见 [LICENSE](LICENSE)。
>
> - 使用：打开页面 → 设置 → 填自己的 DeepSeek API Key。设置页里有「创建 Key → 充值 → 回填」三步引导。
> - 注意：Key 存在浏览器 `localStorage`，页面由公共仓库托管，请勿使用主账号的 Key，请自行评估篡改与钓鱼风险。
> - 限制：GitHub Pages 在中国大陆访问不稳定，必要时用 Cloudflare Pages 再挂一份。

自带 API Key 的 DeepSeek 对话客户端。无需应用后端，浏览器直接请求 DeepSeek API；Key、会话和附件都留在本机浏览器，不经过任何第三方服务器。

在线地址：<https://hongshuxifan321.github.io/ds-chat/>

需要 HTTPS 才能“添加到主屏幕”并离线打开，用 HTTP 打开时只能当普通网页使用。也可以 `pnpm build` 后把 `dist/` 部署到任意静态服务器，或直接打开 `dist/index.html`（需浏览器允许 `file://` 页面使用存储，且 API 服务允许其跨域请求）。

## 与上游的差别

- 加了 `manifest.json`、service worker 和图标：可安装到桌面/主屏，离线时能打开界面外壳；对话请求一律直连 API，不写入缓存。
- 设置页加了「创建 API Key → 充值 → 回填」三步引导、从官方 App 导出历史对话的教程，以及更宽容的历史导入：单个会话结构损坏只跳过它、不拖垮整次导入；系统自动解压留下的文件夹也能直接选；进度按「会话 → 附件 → 提交」三段显示。
- 侧边栏底部加了余额卡：显示账户余额与赠金，旁边可去充值。未填 Key 时不显示，金额只存内存，每轮回答结束后自动补刷。
- 触屏设备上回车改为换行，不再直接发送。
- 品牌、标题、主题色和图标换成 DS Chat；对话协议保持上游原样。

## 运行

准备 Node.js 22.12+ 和 pnpm：

```sh
git clone https://github.com/hongshuxifan321/ds-chat.git
cd ds-chat
pnpm install
pnpm dev
```

打开 http://localhost:8090 。

生成静态产物：

```sh
pnpm build
```

产物位于 `dist/`，可部署到静态服务器，也可直接打开 `dist/index.html`。直接打开时，浏览器和 API 服务需允许 `file://` 页面的存储与跨域请求。

## 功能

- 多会话、自动标题、重命名与删除；编辑提问、重新生成和切换消息分支。
- 流式回答、深度思考、智能搜索、链接阅读与来源引用；支持停止和符合条件的继续生成。
- 附件上传、粘贴与拖拽，语音输入和回复朗读；移动端录音时输入框首行显示实时频谱。
- Markdown、代码高亮、KaTeX 公式和 Mermaid 图表。
- 简体中文与英文、浅色与深色主题、移动端布局、位置设置、历史导入导出。

## 数据

API Key 和设置保存在浏览器 localStorage，会话及附件原件保存在 IndexedDB，本地数据按浏览器用户配置和站点源（origin）隔离。发送对话、上传附件和使用语音功能时，相应内容会提交给配置的 API 服务。

设置中的历史导入导出使用 ZIP 格式。导入会在确认并校验成功后替换全部本地会话和附件；归档里部分会话结构损坏时仍然导入——坏会话被跳过并计入提示，其余照常替换本地数据，只有归档级问题（格式版本、索引缺失、ZIP 损坏）才让整次导入失败。手机和 macOS 常在下载时自动解开压缩包，直接选解压出来的文件夹也可以。导出包含会话与本地可用的图片原件，不包含 API Key、设置或非图片附件原件。格式与保留范围见[历史导入导出](src/services/chat/history/README.md)。

设置 → 数据管理 → 删除所有对话，会在确认后清空全部本地会话、附件原件和未发送的草稿，停止正在生成的回复并回到新对话。API Key 和其他设置保留，已上传到 API 服务的文件不受影响。

## 已知问题

- iOS Safari 首屏可能白屏。
- 会话里留有 API 不接受的图片格式时，该会话之后每轮提问都会失败。新建会话、重新上传支持的格式（JPEG、PNG、GIF、WebP）即可。

## 开发

| 命令          | 用途                |
| ------------- | ------------------- |
| `pnpm dev`    | 启动开发服务器      |
| `pnpm build`  | 构建到 `dist/`      |
| `pnpm type`   | TypeScript 类型检查 |
| `pnpm lint`   | oxlint 检查         |
| `pnpm format` | oxfmt 格式化        |

[rspack.config.ts](rspack.config.ts) 默认连接 `https://api.deepseek.com`。`createConfig({ apiOrigin, devServer })` 支持自定义 API 地址和开发服务器代理。

聊天默认使用 `deepseek-flash`，通过 Anthropic 兼容的 Messages / Files API 通信；语音使用 ASR / TTS 接口。请求使用搜索、链接阅读、标题和 `latest_reminder` 等扩展，接入服务需支持相应能力。附件实际支持的格式以服务端校验为准。

```text
src/
  app/                 应用布局、主题与全局样式
  components/          聊天、设置、Markdown 等界面组件
  i18n/                中英文文案
  services/
    api/               API 请求、SSE 与协议类型
    chat/              会话、消息分支、本地存储与历史导入导出
    markdown/          Markdown 解析、代码高亮与图表
    speech/            录音与朗读
  utils/               通用工具
```

## 许可证

[MIT](LICENSE)。构建会将许可证复制到 `dist/LICENSE`，分发时请一并保留；第三方依赖遵循各自的许可证。
