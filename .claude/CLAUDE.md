# Made in Heaven — Agent Project Memory 🖤

> Import global identity: @~/.claude/CLAUDE.md
> Import empire rules: @~/.claude/rules/empire-protocols.md
> Import solana rules: @~/.claude/rules/solana.md

## PROJECT: MADE IN HEAVEN
**What it is:** The RavenX browser + Solana AI agent. Chrome DevTools MCP + Solana RPC tools wired into a single agent loop.

**Tool count:** 40 total
- 28 Chrome DevTools tools (via chrome-devtools-mcp)
- 7 Solana RPC tools (`src/solana.js`)
- 1 Swarm attack tool (`src/swarm.js` — `swarm_attack`)
- 4 Spark Intelligence tools (`src/spark.js`)

**GitHub:** `github.com/DeadByDawn101/made-in-heaven`
**Latest commit:** `69ad180` — 40 tools, Spark wired

## KEY FILES
- `src/solana.js` — 7 Solana tools (health, balance, tokens, transactions, account info)
- `src/swarm.js` — swarm_attack tool (Node.js Jupiter swarm engine)
- `src/spark.js` — Spark advisory tools (ingest, advisory, learnings, health)
- `src/pentest.js` — security audit runner (AGENT_03_PENTEST_AUDITOR)
- `SECURITY-REPORT.md` — pentest results (22 PASS / 1 FAIL / 6 WARN)
- `scripts/gcp_swarm.py` — Python swarm for GCP (deployed to `/opt/ravenx/swarm/`)

## PENTEST STATUS
- Before: 6 FAIL / 11 WARN
- After: 1 FAIL / 6 WARN (5 false positives fixed)
- Fixed: nginx security headers, server_tokens off, .env blocked
- Remaining: No TLS (resolves with Vercel/Cloudflare deploy)
- Run: `npm run pentest`

## CHROME DEVTOOLS MCP
- Binary: `/Users/ravenx/.local/bin/chrome-devtools-mcp` (v0.18.1)
- Config: `~/.mcporter/mcporter.json`
- Chrome Canary must be running: `open -a "Google Chrome Canary" --args --remote-debugging-port=9222`
- 28 tools including: navigate_page, take_snapshot, take_screenshot, click, fill, evaluate_script

## SPARK INTEGRATION
- Spark watches every tool call, learns patterns, surfaces advisory
- `sparkd` runs at `http://127.0.0.1:8787` (start before using spark tools)
- OpenClaw tailer: `adapters/openclaw_tailer.py` (in vibeship-spark-intelligence fork)
- Offline-safe: silent fail if sparkd not running
- Domain chip: `~/Projects/vibeship-spark-intelligence/chips/ravenx-degen/chip.yaml`

## SWARM ENGINE
- Fire from GCP: `bash /opt/ravenx/swarm/FIRE.sh <BS58_KEY>`
- Local fire: `node -e "require('./src/swarm.js').swarm_attack({...})"`
- Capital state: GCP master 0.277 SOL | `5qmt` 1.645 SOL (Gabriel Phantom key needed)
- Known bug: ephemeral wallets need ≥0.021 SOL each (rent-exempt)
