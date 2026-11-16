# DS Chat 整体方案

> 版本 v1 · 2026-11-16 · 状态：本地改造已完成，待推送上线

## 一、定位

一个**自带 API Key 的 DeepSeek 对话客户端**，纯静态、无后端、可安装为 PWA。
用户被官方限额逼出来时，给他一个"零学习成本 + 自己付费 + 数据在本地"的出口。

一句话：**官方 App 的付费逃生舱。**

## 二、目标与非目标

**目标**

- 1:1 还原官方网页端的对话体验（外观、交互、能力）
- 一键导入官方导出的历史对话
- 用户填自己的 Key，数据只存在浏览器本地
- 可安装到桌面/手机主屏，装完后离线可用
- 零服务器成本、零运维

**非目标**

- 不做后端、不做账号体系、不做云同步
- 不做代充、不做共享 Key、不做反代（违规且必挂）
- 不做内容审核（BYOK 模式，服务由 DeepSeek 提供）
- 不做国内备案、不上应用商店

## 三、架构

```
浏览器（PWA）
├── 静态资源 ← GitHub Pages（HTTPS）
│   ├── index.html / static/js / static/css
│   ├── manifest.json
│   └── sw.js（service worker）
├── localStorage ← API Key、设置
├── IndexedDB ← 会话、消息分支、附件原件
└── 直连 https://api.deepseek.com/anthropic/v1/messages
        （实测：`127.0.0.1:5750`、`localhost:8090`、`192.168.3.57:8090`、`https://hongshuxifan321.github.io/ds-chat/` 均被回显允许）
```

**Service Worker 策略**

| 请求类型 | 策略 |
|---|---|
| 页面导航 | network-first，失败回退缓存的 index.html |
| 同源静态资源 | cache-first，命中即用 |
| 跨域 API 请求 | **完全不拦截**，绝不写进缓存 |

## 四、仓库与分支

| 项 | 方案 |
|---|---|
| 仓库名 | `ds-chat` |
| 可见性 | 公开（免费 Pages 必须公开；MIT 项目也无隐藏必要） |
| 主分支 | `main` |
| 开发分支 | `pwa`（当前改动所在，推送时合并进 main） |
| 上游 | 保留 `origin` → `deepseek-ai/chat-demo`，用于同步官方更新 |
| 许可证 | MIT，保留上游版权声明 |

## 五、部署流程

1. 在 GitHub 创建公开仓库 `ds-chat`（不初始化 README）
2. **先启用 Pages**：仓库 → Settings → Pages → Source 选 **GitHub Actions**
   顺序不能颠倒：工作流里的 `actions/configure-pages` 默认不代为启用站点（`enablement` 默认 `false`），
   仓库尚未启用 Pages 时该步骤会失败，首次 Actions 白跑一轮。
3. 关联远端并推送
   ```sh
   git remote add mine https://github.com/hongshuxifan321/ds-chat.git
   git push -u mine pwa:main
   ```
4. 等 Actions 跑完（约 2–3 分钟）
5. 访问 `https://hongshuxifan321.github.io/ds-chat/`
6. 设置里填自己的 Key，跑一轮对话验证

CI 会依次执行：`pnpm install --frozen-lockfile` → `pnpm type` → `pnpm lint` → `pnpm build` → 上传 `dist` → 部署。
本地已预跑通过：tsc 0 error、oxlint 0 warning、构建成功；lockfile 的 28 条依赖声明与 `package.json` 静态比对一致。`pnpm install --frozen-lockfile` 未能在本机复现（pnpm store 锁被拒），CI 首跑结果以 Actions 日志为准。

## 六、上线验证清单

| # | 检查项 | 通过标准 |
|---|---|---|
| 1 | 首页 | 200，控制台无报错 |
| 2 | manifest | DevTools → Application → Manifest 能读出名称与图标 |
| 3 | service worker | 状态 activated，scope 为 `/ds-chat/` |
| 4 | 离线 | 断网后刷新，页面仍能打开 |
| 5 | 安装 | 桌面 Chrome/Edge 出现"安装"按钮 |
| 6 | 对话 | 填入 Key 后能正常流式回答 |
| 7 | 能力 | 深度思考、智能搜索、文件上传可用 |
| 8 | 移动端 | iOS Safari / Android Chrome 可"添加到主屏幕" |

## 七、上游同步策略

官方 demo 会持续更新（新工具、协议变更、提示词调整），**不能脱离上游**。

```sh
git fetch origin main          # origin = deepseek-ai/chat-demo
git switch main
git merge origin/main          # 冲突只可能出现在 4 个文件
git push mine main
```

自研改动只有四处：`src/index.html`、`src/main.tsx`、`rspack.config.ts`、`public/`。
冲突范围极小，合并成本可控。**协议层（system/reminder/tools）永不自己改**——那是"API 难吃"的唯一来源。

触发器：上游发版、功能失效、DeepSeek 改接口时各同步一次。

## 八、风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 国内访问不稳定 | 目标用户打不开 | 接受；客户端有缓存，短期无感。离线包需先验证 `file://` 下 API 跨域是否可用，未验证前不承诺 |
| 商标侵权 | 被下架、被投诉 | 中性名 DS Chat、中性图标、README 声明非官方 |
| Key 被盗 / 钓鱼站 | 用户损失 | README 警告；建议用限额 Key；声明唯一官方地址 |
| 上游改协议 | 功能失效 | 跟随上游合并，不自行修改协议层 |
| GitHub Pages 无 SLA | 短时不可用 | 客户端有缓存，短期无感；离线包兜底（尚未验证） |
| 官方出 C 端付费 | 需求消失 | 项目定位为工具，不押注商业价值 |

## 九、迭代路线

| 阶段 | 内容 | 工作量 |
|---|---|---|
| P0 | 上线可用的 PWA（本次） | 30 分钟 |
| P1 | 成本估算器 + 品牌文案（三步开 Key 的引导已完成） | 半天 |
| P2 | Release 附离线包 + 安装引导（iOS/Android 分别写） | 半天 |
| P3 | 自定义域名 / 双入口（可选） | 视情况 |

P1 的成本估算器是转化关键：用户不知道 token 怎么算，填"每天几轮、是否搜索"直接给出月费区间。

## 十、成本与时间

- 服务器：0 元
- 域名：0 元（用 github.io 默认域名）
- CI：公开仓库 Actions 免费
- 上线时间：约 30 分钟（含 Actions 排队）
- 维护：跟随上游同步，每次 10 分钟

## 十一、推送前审计（2026-11-16）

已核：密钥与个人信息的全历史扫描（无）、跟踪文件 179 个（无构建产物与依赖）、import 大小写 380 条全部解析、lockfile 声明 28/28 一致、CI action pin 6/6 校验、子路径资源路径、service worker 语法、客户端无路由（Pages 无需 404 重写）、`tsconfig` 已设 `noEmit`（`pnpm type` 不会往 `src/` 吐 js）。

未能在本机验证：`pnpm install --frozen-lockfile`（pnpm store 锁被拒）、移动端渲染、`file://` 双击可用性。

已单独实测：以 `https://hongshuxifan321.github.io/ds-chat/` 为 origin 向 `api.deepseek.com` 发 CORS 预检，返回 200 且回显该 origin，允许 `authorization, content-type, x-api-key, anthropic-version, anthropic-beta`。上线后 API 请求不会被跨域拦下。
