# Made in Heaven — Long-Term Memory 🖤

*Curated learnings. Max 200 lines. Model-agnostic.*

## Authenticated Sites (Google Password Manager)

- **x.com** — logged in as `gothravenllm@gmail.com` ✅ (confirmed 2026-02-26)
- **Google** — logged in as `gothravenllm@gmail.com` via Chrome Canary profile ✅
- **dexscreener.com** — no auth required, data extractable via evaluate_script ✅

## Learned Patterns

### X.com Login (React-controlled forms)
Standard CDP fill() FAILS silently on X. Must use React-safe injection:
```js
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
setter.call(inputEl, value);
inputEl.dispatchEvent(new Event("input", { bubbles: true }));
```
Flow: fill email → Next → fill username (confirmation step) → Next → fill password → Enter

### DexScreener Data Extraction
Best approach: navigate to `/solana` then evaluate_script to scrape token rows.
```js
document.querySelectorAll("a[href*='/solana/']")
```
Returns token name, price, 24h change, volume, liquidity, age.

### X Trending Data
Navigate to `x.com/explore/tabs/trending` then:
```js
document.querySelectorAll("[data-testid=trend]")
```
Returns trending topics with post counts.

### take_screenshot times out
Use `take_snapshot` instead — returns full a11y tree with UIDs for interaction.
`take_screenshot` via MCP has a 30s timeout that consistently fails.

### Chrome Auto-Fill
Chrome Canary is logged into `gothravenllm@gmail.com`.
Always check for autofill FIRST before manual credential entry.
Google OAuth ("Sign in with Google") button visible on most sites — try this second.

## Key Intelligence

### $STONEFREE
- CA: `3G36hCsP5DgDT2hGxACivRvzWeuX56mU9DrFibbKpump`
- Site: jolynetheshiba.com
- X: @jolyneshibasol
- AI agent: Iris (runs on Pippin, posts autonomously)

### Alpha Signals Seen
- $AGENC: `5yC9BM8KUsJTPbWPLfA2N8qH1s9V8DQ3Vcw1G6Jdpump` — AI agent + ZK + hardware, 7x+ (2026-02-26)
- $LOBSTAR: AI agent sent $250K accidentally to random user — viral (2026-02-26)

## Infrastructure

- Chrome Canary: `http://127.0.0.1:9222` (remote debugging)
- Auth state: `~/.agent-browser/sessions/x-gothravenllm.json`
- LLMs: Claude Sonnet (default) | Grok-4-0709 (browser tasks) | Grok-4-1-fast (X search)
