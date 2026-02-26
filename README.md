# Project Mariner 🖤

> **Autonomous web agent powered by Chrome DevTools MCP — full browser control, zero automation fingerprint, persistent Google auth.**

Built by [@DeadByDawn101](https://github.com/DeadByDawn101) + [RavenX AI](https://github.com/DeadByDawn101)

---

## What Is This

Project Mariner is an open autonomous web agent that controls a **real Chrome browser** via the [Chrome DevTools MCP server](https://github.com/ChromeDevTools/chrome-devtools-mcp), giving any LLM complete browser control — navigation, clicks, form fills, JavaScript eval, network inspection, console monitoring, screenshots, performance traces — through a clean MCP interface.

Unlike headless Playwright/Puppeteer approaches:
- **Zero bot detection** — it IS Chrome, running normally
- **Persistent auth** — log in once via `--remote-debugging-port`, stay logged in forever
- **Full DevTools access** — console, network, DOM, memory heap, performance — everything DevTools exposes
- **Any LLM** — Claude, Grok, GPT, Gemini — any MCP-compatible reasoning engine
- **Multi-agent ready** — designed for swarm architectures where multiple agents share browser context

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     LLM Agent Layer                      │
│          (Claude / Grok / GPT / any MCP client)          │
└────────────────────┬────────────────────────────────────┘
                     │ MCP Protocol
┌────────────────────▼────────────────────────────────────┐
│           chrome-devtools-mcp server                     │
│     (28 tools: navigate, click, fill, eval, snap...)     │
└────────────────────┬────────────────────────────────────┘
                     │ Chrome DevTools Protocol (CDP)
┌────────────────────▼────────────────────────────────────┐
│              Chrome Canary (headed/headless)             │
│     --remote-debugging-port=9222 --no-first-run          │
│     Profile: persistent auth (Google, X, etc.)           │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Start Chrome with remote debugging

```bash
open -a "Google Chrome Canary" --args \
  --remote-debugging-port=9222 \
  --no-first-run \
  --no-default-browser-check
```

Log in to any accounts (Google, X, etc.) once — they persist.

### 2. Install

```bash
npm install -g chrome-devtools-mcp
npm install
```

### 3. Configure your MCP client

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "chrome-devtools-mcp",
      "args": [
        "--browserUrl", "http://127.0.0.1:9222",
        "--no-usage-statistics"
      ]
    }
  }
}
```

### 4. Run the agent

```bash
node src/mariner.js --task "Go to gmail.com and summarize my last 5 emails"
```

---

## Available MCP Tools (28)

| Tool | Description |
|------|-------------|
| `navigate_page` | Navigate to URL, back, forward, reload |
| `take_snapshot` | A11y tree snapshot with UIDs for element targeting |
| `take_screenshot` | Full page or element screenshot |
| `click` | Click element by UID from snapshot |
| `fill` | Fill input/textarea by UID |
| `fill_form` | Fill multiple form fields at once |
| `type_text` | Type into focused element |
| `press_key` | Keyboard shortcuts (Enter, Control+A, etc.) |
| `hover` | Hover over element |
| `drag` | Drag element to target |
| `evaluate_script` | Execute arbitrary JavaScript |
| `list_pages` | List open tabs |
| `new_page` | Open new tab (optionally isolated) |
| `select_page` | Switch active tab |
| `close_page` | Close tab |
| `list_console_messages` | Read browser console |
| `get_console_message` | Get specific console message |
| `list_network_requests` | Inspect all network traffic |
| `get_network_request` | Inspect specific request/response |
| `handle_dialog` | Accept/dismiss browser dialogs |
| `upload_file` | Upload file via file input |
| `wait_for` | Wait for text to appear on page |
| `emulate` | Emulate network conditions, geolocation, viewport |
| `resize_page` | Resize browser window |
| `performance_start_trace` | Start Chrome DevTools performance trace |
| `performance_stop_trace` | Stop and save trace |
| `performance_analyze_insight` | Analyze performance insights |
| `take_memory_snapshot` | Capture memory heap for leak debugging |

---

## Vision: Autonomous Web Agent

Mariner is designed to be the open-source answer to proprietary web agents. The roadmap:

### Phase 1 — Foundation (Now)
- [x] Chrome DevTools MCP integration
- [x] Persistent auth via CDP remote debugging
- [x] Full DevTools tool suite (28 tools)
- [ ] Agent loop: task → plan → execute → verify
- [ ] Session memory: remember what was done across tasks

### Phase 2 — Autonomy
- [ ] Multi-step task planner (LLM-driven)
- [ ] Error recovery (retry logic, alternate paths)
- [ ] Form-filling intelligence (map field labels → values)
- [ ] Content extraction pipeline (text, tables, structured data)
- [ ] Task queue with priority scheduling

### Phase 3 — Swarm
- [ ] Multi-agent browser sharing (multiple LLMs, one browser)
- [ ] Specialized sub-agents (scraper agent, form agent, research agent)
- [ ] Persistent knowledge base (what was learned from past sessions)
- [ ] Webhook triggers (external events trigger web tasks)
- [ ] API layer (REST endpoints to queue tasks from anywhere)

---

## Use Cases

- **Research automation** — autonomous deep-dive research, multi-tab synthesis
- **Form automation** — healthcare intake, applications, government portals
- **Data extraction** — scrape authenticated portals (your own data)
- **QA automation** — run through user flows, catch regressions
- **Enterprise workflows** — automate repetitive web tasks in internal tools
- **AI development** — live browser feedback loop for coding agents building web apps

---

## Enterprise Origin

This project is the browser control layer for **Project Sentinel** — the first engineer-free healthcare AI agent, built for the [Google GEAR (Gemini Enterprise Agent Ready) cohort](https://cloud.google.com/gemini) by [@DeadByDawn101](https://github.com/DeadByDawn101).

Stack: Chrome DevTools MCP + Vertex AI + ADK + Gemini + BigQuery + HIPAA BAA

---

## Contributing

PRs welcome. The goal is to build the most capable open-source web agent available.

1. Fork this repo
2. Create a feature branch (`git checkout -b feat/task-planner`)
3. Commit your changes
4. Open a PR

---

## License

MIT — use it, build on it, ship it.

---

*Built with Latina hustle and gothic intelligence.* 🖤
