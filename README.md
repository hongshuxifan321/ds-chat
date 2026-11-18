# DS Chat

English | [简体中文](README.zh-CN.md)

> **A fork of [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo) turned into an installable PWA. This is not an official DeepSeek product and is not affiliated with DeepSeek.** The original project is MIT licensed, copyright DeepSeek; see [LICENSE](LICENSE).
>
> - Usage: open the page → Settings → enter your own DeepSeek API Key. Settings walks you through creating a key, topping up, and pasting it back.
> - Note: the key is stored in the browser's `localStorage` and the page is hosted from a public repository. Do not use a key for your main account, and judge tampering and phishing risk yourself.
> - Limitation: GitHub Pages is unreliable from mainland China; mirror it on Cloudflare Pages if needed.

A DeepSeek chat client that runs on your own API key. No application backend: the browser calls the DeepSeek API directly, and your key, conversations, and attachments stay in the local browser.

Live: <https://hongshuxifan321.github.io/ds-chat/>

HTTPS is required to install it to the home screen and open it offline; over HTTP it behaves as an ordinary web page. You can also run `pnpm build` and deploy `dist/` to any static host, or open `dist/index.html` directly (the browser must allow storage on `file://` pages and the API service must permit those cross-origin requests).

## Differences from upstream

- Adds `manifest.json`, a service worker, and icons: installable to the desktop or home screen, with an offline shell; chat requests always go straight to the API and are never cached.
- Settings gains a create-key → top-up → paste-back walkthrough, a guide for exporting history from the official app, and a more forgiving history import: a broken conversation is skipped instead of failing the whole archive, a folder left behind by automatic extraction can be imported too, and progress is reported by sessions, attachments, and commit.
- Pinned chats get their own group at the top of the sidebar; the menu on each chat pins or unpins it. Pinning is kept on export and restored on import.
- A balance card at the bottom of the sidebar shows the account balance and bonus credit with a top-up link. It stays hidden until a key is set, keeps the amount in memory only, and refreshes after each reply.
- Above the balance card, a notice card opens a panel covering how the site is built, where conversations and the key live, how billing works, what the app can do, known problems, features deliberately left out, and how to reach the author; an unread dot clears when the panel is opened, and the bottom of the panel downloads a tutorial PDF (replace `public/notice/tutorial.pdf` to update it — a same-named file is served fresh).
- An outline pill above the composer opens a list of every question in the chat — five rows at a time, the rest scrolls — and the question you are reading is highlighted in blue; tap any row to jump to it. Next to it, a round jump-to-bottom button appears once you scroll up and returns you to the latest reply. Desktop and touch devices share the same click interaction.
- The chat menu gains **Export as web page**: one conversation becomes a self-contained `.html` that looks like the app itself — it captures the conversation as actually rendered and inlines the stylesheet the page is using, so bubbles, type, code blocks, math and diagrams match, minus the buttons. Only questions and answers are written, and it opens without a network or this app.
- On touch devices Enter inserts a newline instead of sending.
- Branding, title, theme colour, and icons are DS Chat; the chat protocol is left as upstream.

## Getting started

Install Node.js 22.12+ and pnpm, then run:

```sh
git clone https://github.com/hongshuxifan321/ds-chat.git
cd ds-chat
pnpm install
pnpm dev
```

Open http://localhost:8090.

To build the static site:

```sh
pnpm build
```

The output is written to `dist/`. Deploy it to a static web server or open `dist/index.html` directly. Opening the file directly requires browser support for storage on `file://` pages and an API service that permits their cross-origin requests.

## Features

- Multiple conversations with automatic titles, renaming, and deletion; edit prompts, regenerate replies, and switch between message branches.
- Streaming replies, deep thinking, smart search, link reading, and source citations; stop generation or continue eligible replies.
- Upload, paste, or drag and drop attachments; use voice input and read replies aloud. A live audio spectrum appears in the first row of the input area while recording on mobile.
- Markdown, syntax highlighting, KaTeX math, and Mermaid diagrams.
- Question outline: an outline pill above the composer jumps to any question in the chat, and a round button jumps back to the latest reply.
- Export as web page: a single conversation becomes a self-contained HTML file that keeps the app's own look and reads offline; print to PDF through the browser if you need one.
- Simplified Chinese and English, light and dark themes, mobile layouts, location settings, and chat history import and export.

## Data and storage

Your API key and settings are stored in the browser's localStorage. Conversations and original attachments are stored in IndexedDB. Local data is isolated by browser profile and site origin. Sending messages, uploading attachments, and using speech features sends the relevant content to the configured API service.

The API decodes images only as JPEG, PNG, GIF, and WebP. Other formats such as svg, tiff, and avif are sent as ordinary files; an image the service explicitly rejects is skipped with a notice instead of breaking every later turn in that conversation.

History import and export in Settings use ZIP archives. Importing replaces all local conversations and attachments after confirmation and successful validation. An archive with partly malformed conversations still imports: the unreadable ones are skipped and reported while the rest replace local data; only archive-level problems (format version, missing index, corrupt ZIP) abort the whole import. On phones and macOS the download is often extracted automatically, so picking the extracted folder works as well. Exports include conversations and locally available original images, but exclude API keys, settings, and original non-image attachments. See the [history import/export documentation (Chinese)](src/services/chat/history/README.md) for the archive format and preservation details.

Settings → Data → Delete all chats clears all local conversations, original attachments, and unsent drafts after confirmation. It stops ongoing replies and returns to a new chat. Your API key and settings are preserved; files already uploaded to the API service are not deleted.

## Known issues

- iOS Safari can show a blank first screen.

## Development

| Command       | Description                  |
| ------------- | ---------------------------- |
| `pnpm dev`    | Start the development server |
| `pnpm build`  | Build into `dist/`           |
| `pnpm type`   | Run TypeScript type checks   |
| `pnpm lint`   | Lint with oxlint             |
| `pnpm format` | Format with oxfmt            |

[rspack.config.ts](rspack.config.ts) uses `https://api.deepseek.com` by default. Use `createConfig({ apiOrigin, devServer })` to customize the API origin and development server proxy.

Chat uses `deepseek-flash` by default through Anthropic-compatible Messages / Files APIs. Speech features use ASR / TTS endpoints. Requests include extensions for search, link reading, titles, and `latest_reminder`, so the configured service must support the corresponding capabilities. Supported attachment formats are determined by server-side validation.

```text
src/
  app/                 Application layout, themes, and global styles
  components/          Chat, settings, Markdown, and other UI components
  i18n/                English and Chinese translations
  services/
    api/               API requests, SSE, and protocol types
    chat/              Conversations, message branches, storage, and history import/export
    markdown/          Markdown parsing, syntax highlighting, and diagrams
    speech/            Audio recording and read-aloud playback
  utils/               Shared utilities
```

## License

[MIT](LICENSE). The build copies the license to `dist/LICENSE`; include it when distributing the app. Third-party dependencies are subject to their own licenses.
