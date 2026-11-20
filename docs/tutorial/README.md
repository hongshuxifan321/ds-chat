# 教程 PDF 的源文件

| 文件 | 作用 |
|---|---|
| `DS-Chat使用教程.docx` | 教程正文与 9 张手机截图，以后只改这一份 |
| `../../public/notice/tutorial.pdf` | 线上那份，公告栏底部「下载教程 PDF」指向它 |

PDF 只存一份（在 `public/notice/`），不在本目录再放一份，免得两份二进制对不上。

## 更新流程

1. 改 `DS-Chat使用教程.docx`，在 Word 里「另存为 → PDF」
2. **清掉作者字段**：Word 会把当前 Office 用户名写进 PDF 的「作者」和 docx 的 `dc:creator`，这份文件是公开的。导出后确认 PDF 属性里不是真名；本机脚本 `~/.dsh/workspaces/clean_tutorial_meta.py` 可等长替换（字节数不变，版面不动）
3. 用新 PDF 覆盖 `public/notice/tutorial.pdf`
4. 顺手把 `src/content/notice.ts` 的 `NOTICE_UPDATED` 改成当天日期（只影响面板底部显示；未读小红点由正文指纹 `NOTICE_VERSION` 自动重新出现，改文案就会亮）
5. 构建、本地验证、推送

`public/sw.js` 给 `/notice/` 设了 network-first（请求带 `cache: 'no-cache'`），同名 PDF 换掉后用户刷新即拿到新的，断网时回落到上一次缓存的版本。

## 注意

- 这份 PDF 会公开可下载（GitHub 公开仓库 + Pages），别往里放没打码的 Key、手机号、身份信息
- **作者字段是真实泄露源**：2026-11-20 才发现 2026-11-18 那份 PDF 的作者是 `yuegui MEN`（docx 的 `dc:creator` 同样）。已按等长替换清成 `DS Chat`，以后再导出必须复查：`python -c "from pypdf import PdfReader; print(PdfReader('public/notice/tutorial.pdf').metadata)"`
- 教程只有中文；公告面板里的 UI 标签是中英两份
