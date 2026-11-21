# DS Chat 整体方案

> 版本 v1.1 · 2026-11-17 · 状态：已上线并多轮修复，线上与 `pwa` 分支头部 `734d404` 一致

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
| 公告与教程（`/notice/`） | network-first，请求带 `cache: no-cache` 绕过 HTTP 缓存，失败回退上次缓存；排在导航分支之前，避免下载的 PDF 被当成 index.html 存进缓存 |

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

已完成的项在「状态」列标注；HTTP 层项已实测，浏览器行为项需人工用真机点一遍。

| # | 检查项 | 通过标准 | 状态 |
|---|---|---|---|
| 1 | 首页 | 200，控制台无报错 | 已核：200，标题 DS Chat，入口 JS/CSS 均 200 |
| 2 | manifest | DevTools → Application → Manifest 能读出名称与图标 | 已核：`name=DS Chat`、`start_url=./`、3 个图标均 200 |
| 3 | service worker | 状态 activated，scope 为 `/ds-chat/` | 待人工（`sw.js` 已 200，注册逻辑在页面加载后） |
| 4 | 离线 | 断网后刷新，页面仍能打开 | 待人工 |
| 5 | 安装 | 桌面 Chrome/Edge 出现"安装"按钮 | 待人工 |
| 6 | 对话 | 填入 Key 后能正常流式回答 | 已核：线上实际使用正常（流式、思考、停止、续写） |
| 7 | 能力 | 深度思考、智能搜索、文件上传可用 | 已核：搜索、链接阅读、图片上传可用 |
| 8 | 移动端 | iOS Safari / Android Chrome 可"添加到主屏幕" | 待人工 |
| 9 | 历史导入 | 官方导出包、解压后的文件夹都能导入 | 已核：正常包、坏会话、结构异常、损坏文件、选到包内文件、文件夹、400 会话 240MB 大包均本地实测 |
| 10 | 余额卡 | 显示余额与赠金，去充值可跳转 | 已核：线上取值与布局实测 |
| 11 | 公告栏 | 卡片在余额卡上方且框线一致，未读红点点开即消失；面板内容完整；教程 PDF 能下载且是新的 | 已核：本地桌面/手机、明暗主题、下载字节与文件名、换同名 PDF 立即可取、离线回落均实测 |
| 12 | 提问目录 | 输入框上方「目录」胶囊，点开露出 5 条、其余可滚动；当前条标蓝并自动滚进视野；点条目跳到对应提问且不被流式拉回底部；两条提问以下不显示 | 已核：本地桌面 1440×900 / 手机 390×844、明暗主题、流式期间跳转、单条提问不显示均实测 |
| 13 | 回到底部 | 往上翻后输入框上方右侧出现向下箭头，点一下平滑回到最底部并恢复跟随；贴底时不显示 | 已核：本地桌面与手机实测（含手机上轻点） |
| 14 | 导出为网页 | 会话菜单「⋯ → 导出为网页」下载单文件 HTML；**打开后与界面观感一致**（抓真实渲染的 DOM + 内联整份真实样式表）：气泡、正文、代码块的计算样式与界面逐项相同；公式、Mermaid、引用角标、附件图照常显示；不含按钮、思考过程与脚本；深色主题下导出即深色；离线打开零网络请求，手机宽度不溢出 | 已核：`swtest/export_html_test.py` 全项通过（含与界面 `getComputedStyle` 逐项比对） |
| 15 | 字号三档 | 设置「通用」页语言下方的调节条切换默认 / 加大 1 / 加大 2（正文 16/18/20px、行高 28/31/35）：只影响消息正文、标题阶梯、表格、代码、用户气泡与侧栏对话标题（手机抽屉内标题 16/18/20），按钮、输入框等骨架不变；调整后刷新仍保持 | 已核：`swtest/probe_font_scale.py` 线上三档全 PASS（含手机抽屉、侧栏 40px 行高不裁切、无整页横滚） |

## 七、上游同步策略

2026-11-17 核查：上游 `deepseek-ai/chat-demo` 至今只有 2 个提交（`783829d` 初始提交、`5d5dd75` v0.1.1 修历史导入报错文案），最后一次推送 11-13；只有 `main` 一个分支，最新 tag `v0.1.1`，PR 通道关闭（`/pulls` 返回 404）。本仓库的 merge-base 就是上游 HEAD，**当前没有待同步内容**。

原先「自研改动只有四处、冲突范围极小」的假设已经不成立：自研改动现在铺到了历史导入、设置页、i18n、余额卡，整支 `git merge origin/main` 会大面积冲突。同步方式改为：

```sh
git fetch origin                                  # 先看有没有新提交
git log --oneline $(git merge-base pwa origin/main)..origin/main
```

- 上游有新提交时**只 cherry-pick 相关改动**，不做整支合并
- 上游若改协议字段（`system` / `tools` / `latest_reminder` / 历史构造），以它为准确认我们的调用要不要跟，但仍不在本仓库自创协议
- 上游不收 PR，自研改进不回馈上游

**协议层（system/reminder/tools）永不自己改**——那是「API 难吃」的唯一来源。

## 八、风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 国内访问不稳定 | 目标用户打不开 | 接受；客户端有缓存，短期无感。离线包需先验证 `file://` 下 API 跨域是否可用，未验证前不承诺 |
| 商标侵权 | 被下架、被投诉 | 中性名 DS Chat、中性图标、README 声明非官方 |
| Key 被盗 / 钓鱼站 | 用户损失 | README 警告；建议用限额 Key；声明唯一官方地址 |
| 上游改协议 | 功能失效 | 按上游提交 cherry-pick 相关改动，不自行修改协议层 |
| 上游停更 | 协议被官方悄悄改时没有参照 | 用线上实际报错反推，仍不自创协议 |
| 历史里留有服务端不支持的图片格式 | 该会话之后每轮提问都失败 | 已修（2026-11-17）：按服务端能解码的格式决定 image/document 块与上传 purpose；被拒绝的附件标记为不再发送并自动重试一次 |
| 浏览器回收站点本地存储（手机空间紧张、系统清理、清站点数据） | 连接被强制关闭，之后的对话一次都存不下来，「重试」和「导出」都报 `database connection is closing`；关掉页面就真丢 | 已修（2026-11-17）：连接被关后自动重开并立刻补存一次；导出跳过读不到的会话并说明跳过条数，内存里那份仍能导出；启动时申请持久化存储；保存失败提示条带「先导出备份」；记录已消失时提示「本机已经找不到」 |
| 手机浏览器拒绝把 Blob 写进 IndexedDB（WebKit 内核实测连 1KB 都写不进） | 导入历史时卡在写图片，报 `Error preparing Blob/File data to be stored in object store`，界面误说「文件可能已损坏」，整份归档白导 | 已修（2026-11-17）：探测到写不进 Blob 就把图片改存 base64（读取时透明还原）；单张失败只跳过该图并报张数，其余照常导入；导入前按 `estimate()` 预检空间；这条错不再套「文件损坏」文案 |
| GitHub Pages 无 SLA | 短时不可用 | 客户端有缓存，短期无感；离线包兜底（尚未验证） |
| 官方出 C 端付费 | 需求消失 | 项目定位为工具，不押注商业价值 |

## 九、迭代路线

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 上线可用的 PWA | 完成（2026-11-16 首次部署） |
| P0.5 | 现场需求：历史导入容错 + 文件夹导入 + 三段式进度、侧边栏余额卡、手机回车换行 | 完成（2026-11-17） |
| P1 | 成本估算器（三步开 Key 的引导已完成） | 未做 |
| P2 | Release 附离线包 + 安装引导（iOS/Android 分别写） | 未做 |
| P3 | 自定义域名 / 双入口（可选） | 未做 |

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

## 十二、部署记录

| 项 | 值 |
|---|---|
| 仓库 | <https://github.com/hongshuxifan321/ds-chat>（公开，MIT） |
| 线上地址 | <https://hongshuxifan321.github.io/ds-chat/> |
| 首次部署 | 2026-11-16，commit `b2bcc0a`，Actions run `43826195482`，build + deploy 全绿 |
| 最近部署 | 2026-11-17，commit `734d404`，Actions run #14，build + deploy 全绿 |
| 提交数 | 33（含上游 chat-demo 的 2 个提交） |

**部署过程中确认的两件事**

1. **仓库必须是完整历史。** 本地这份是浅克隆（`.git/shallow` 钉在上游 `5d5dd75`），直接推空仓库会报
   `did not receive expected object …` ——`git fsck` 与 `git bundle verify` 在浅边界内都显示"完整"，查不出来。
   解法：`git fetch --unshallow origin` 补全上游历史后再推。
2. **构建会压缩 `public/sw.js`。** 源文件 1690 字节，产物 887 字节。逐条比对确认语义等价：
   跨域请求仍完全不拦截、导航仍 network-first、静态资源仍 cache-first。
3. **CI 产物与本地构建的 hash 不同**（线上 `main.3898630a.js`，本地 `main.35a5cf12.js`），
   因为 CI 按 `pnpm-lock.yaml` 解析依赖、本地用的是 npm 安装的版本。CI 的 `pnpm type` / `pnpm lint` / `pnpm build` 全部通过。
