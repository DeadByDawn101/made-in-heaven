# Made in Heaven 🖤

> *Pucci's final Stand in JoJo's Stone Ocean. Accelerates time to reset the universe.*
> *We accelerate autonomous agents to reset the market.*

**Autonomous web agent** — Chrome DevTools MCP + Grok/Claude + native X integration.

Built by [@DeadByDawn101](https://github.com/DeadByDawn101) × [RavenX AI](https://github.com/DeadByDawn101) | Part of the [$STONEFREE](https://jolynetheshiba.com) / Jolyne × Iris ecosystem.

---

## What It Does

Made in Heaven controls a **real Chrome browser** via Chrome DevTools MCP — full access to navigate, click, fill forms, execute JavaScript, inspect network traffic, read the console, and extract live data from any authenticated page.

Unlike headless Playwright:
- **Zero bot detection** — it IS Chrome, launched normally
- **Persistent auth** — log in once, stay logged in forever
- **Grok-native X integration** — real-time X data without scraping
- **28 DevTools tools** — console, network, DOM, performance, memory heap
- **Any LLM** — Claude for deep reasoning, Grok for X-native tasks

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│            Task Input (CLI / API / agent)                 │
└───────────────────┬──────────────────────────────────────┘
                    │
          ┌─────────▼──────────┐
          │  LLM Router        │
          │  claude → deep     │
          │  grok   → X-native │
          └─────────┬──────────┘
                    │ tool calls
┌───────────────────▼──────────────────────────────────────┐
│          Chrome DevTools MCP (28 tools)                   │
│  navigate · snapshot · click · fill · eval_js · network  │
└───────────────────┬──────────────────────────────────────┘
                    │ CDP (port 9222)
┌───────────────────▼──────────────────────────────────────┐
│           Chrome Canary — headed, persistent auth         │
│           Google · X · DeFi portals · enterprise apps    │
└──────────────────────────────────────────────────────────┘

        ┌────────────────────────────────────┐
        │  Grok X-Native Mode (--x-search)   │
        │  Real-time X firehose, no scraping │
        └────────────────────────────────────┘
```

---

## Quick Start

### 1. Start Chrome (once — auth persists)

```bash
npm run chrome
# Log into Google, X, DeFi portals — saved permanently
```

### 2. Install

```bash
npm install
npm install -g chrome-devtools-mcp
```

### 3. Configure

```bash
cp .env.example .env
# Add ANTHROPIC_API_KEY and XAI_API_KEY
```

### 4. Run

```bash
# Claude (deep reasoning, web tasks)
node --env-file=.env src/made-in-heaven.js \
  --task "Go to dexscreener.com/solana and find the top momentum plays under 6h old"

# Grok (X-native, real-time social data)
node --env-file=.env src/made-in-heaven.js --llm grok \
  --task "Check X for $STONEFREE mentions and sentiment right now"

# X search only (no browser)
node --env-file=.env src/made-in-heaven.js \
  --x-search "Solana memecoin trending today"
```

---

## Available Tools (28)

| Category | Tools |
|----------|-------|
| **Navigation** | navigate_page, new_page, select_page, close_page, list_pages |
| **Inspection** | take_snapshot, evaluate_script |
| **Interaction** | click, fill, fill_form, type_text, press_key, hover, drag, upload_file |
| **Waiting** | wait_for, handle_dialog |
| **Network** | list_network_requests, get_network_request |
| **Console** | list_console_messages, get_console_message |
| **Performance** | performance_start_trace, performance_stop_trace, performance_analyze_insight |
| **Memory** | take_memory_snapshot |
| **Emulation** | emulate, resize_page |
| **Screenshots** | take_screenshot *(note: can timeout — prefer take_snapshot)* |

---

## X-Native Integration (Grok)

When using `--llm grok`, Grok's native X access is the intelligence layer:

```bash
# Real-time X sentiment on a token
node --env-file=.env src/made-in-heaven.js --llm grok \
  --task "Search X for $STONEFREE. What's the current sentiment and any notable posts?"

# Find trending narratives
node --env-file=.env src/made-in-heaven.js \
  --x-search "AI agent crypto token launch 2025"

# Combine: browser data + X alpha
node --env-file=.env src/made-in-heaven.js --llm grok \
  --task "Go to dexscreener.com/solana, find the top 5 new tokens, then check X sentiment for each"
```

Grok sees both the live browser data AND the X firehose simultaneously. No scraping, no rate limits, no auth needed for X data.

---

## Proven Results

First live run (2026-02-26):

```
Task: "Find top 3 hottest Solana tokens right now"

Steps: navigate → snapshot → analyze (3 steps total)

Results:
  #1 Bill Clinton (BILL)  $0.0001808  +401% 24h  $2.4M vol  16h old
  #2 Autism Coin (AUTISM) $0.001163   +17%  24h  $1.5M vol  3d old
  #3 パンチ (PUNCH)        $0.01907   -11%  24h  $6.4M vol  $19M mcap
```

Real-time. Authenticated. Zero bot detection.

---

## Enterprise: Project Sentinel

Made in Heaven is the browser control layer for **Project Sentinel** — the first engineer-free healthcare AI agent, submitted to the [Google GEAR (Gemini Enterprise Agent Ready) cohort](https://cloud.google.com/gemini).

Stack: Made in Heaven + Vertex AI + ADK + Gemini + BigQuery + HIPAA BAA

---

## JoJo Naming Canon

This project is part of the RavenX AI × Jolyne × $STONEFREE ecosystem:

| Project | JoJo Reference |
|---------|----------------|
| **$STONEFREE** | Stone Free — Jolyne Cujoh's Stand (Part 6) |
| **Iris** | Iris — AI agent living inside Jolyne (SOUL.md bound) |
| **Made in Heaven** | Pucci's final Stand — accelerates time, resets the universe |

---

## License

MIT — build on it, ship it, go faster.

---

*Built with Latina hustle and gothic intelligence. Part of the RavenX AI empire.* 🖤
