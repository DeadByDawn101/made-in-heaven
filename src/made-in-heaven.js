/**
 * Made in Heaven 🖤
 * Autonomous web agent — Chrome DevTools MCP + Grok/Claude + native X integration
 *
 * JoJo's Bizarre Adventure: Stone Ocean — Pucci's final Stand.
 * Accelerates time to reset the universe. We accelerate agents to reset the market.
 *
 * Usage:
 *   node src/made-in-heaven.js --task "..." [--llm grok|claude] [--x-search "query"]
 *
 * LLMs:
 *   --llm grok    → Grok-4 (X-native, live search, real-time data)
 *   --llm claude  → Claude Sonnet (default, deep reasoning)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { buildLoginTask, WAIT_FOR_AUTOFILL, SAVED_CREDENTIALS } from "./password-manager.js";
import { getMemoryBlock, logTask, learnSite, memorize, indexTask, initMemory } from "./memory.js";
import { SOLANA_TOOLS, dispatchSolanaTool } from "./solana.js";
import { executeSwarm, jupiterBuy, jupiterSell } from "./swarm.js";
import { sparkTools, handleSparkTool } from "./spark.js";
import { FIRECRAWL_TOOLS, handleFirecrawlTool } from "./firecrawl.js";

// ── Config ────────────────────────────────────────────────────────────────────

const CHROME_URL = process.env.CHROME_URL || "http://127.0.0.1:9222";
const MCP_BIN   = process.env.MCP_BIN || (process.env.HOME + "/.local/bin/chrome-devtools-mcp");
const MAX_STEPS  = parseInt(process.env.MAX_STEPS || "20");

const argv = process.argv.slice(2);
const get  = (flag) => { const i = argv.indexOf(flag); return i !== -1 ? argv[i + 1] : null; };
const flag = (f) => argv.includes(f);

const LLM      = get("--llm") || process.env.LLM || "claude";
const TASK     = get("--task") || process.env.MIH_TASK || "Take a snapshot of the current page and describe it";
const X_SEARCH = get("--x-search") || null;

// ── LLM Clients ──────────────────────────────────────────────────────────────

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const grok = new OpenAI({
  apiKey: process.env.XAI_API_KEY || process.env.GROK_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

// Available xAI models (confirmed 2026-02-26)
const GROK_MODEL = process.env.GROK_MODEL || "grok-4-0709";

// ── MCP Client ────────────────────────────────────────────────────────────────

async function createMCPClient() {
  const transport = new StdioClientTransport({
    command: MCP_BIN,
    args: ["--browserUrl", CHROME_URL, "--no-usage-statistics"],
  });
  const client = new Client({ name: "made-in-heaven", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

// ── X-Native Search via Grok ──────────────────────────────────────────────────

async function grokXSearch(query) {
  console.log(`  🐦 Grok X-Search (Responses API / native fetch): "${query}"`);
  // OpenAI SDK mangles the key for xAI's Responses endpoint — use fetch directly
  const resp = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "grok-4-1-fast-non-reasoning",
      input: [{
        role: "user",
        content: `Search X RIGHT NOW for: "${query}"\n\nReturn the top 5 most relevant/viral posts with: author handle, content summary, likes, reposts, and why it's trending. Include any CAs or contract addresses visible.`,
      }],
      tools: [{ type: "x_search" }, { type: "web_search" }],
    }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  // Extract the final text message from output array
  const text = data.output
    ?.filter(o => o.type === "message")
    ?.flatMap(o => o.content || [])
    ?.filter(c => c.type === "output_text")
    ?.map(c => c.text)
    ?.join("\n") || "No text output";
  return text;
}

// ── System Prompts ────────────────────────────────────────────────────────────
// Memory is injected dynamically at runtime — see buildSystemPrompt()

const CLAUDE_BASE = `You are Made in Heaven — an autonomous web agent with full control of a real Chrome browser.
You are named after Pucci's final Stand in JoJo's Stone Ocean. You accelerate through tasks with precision.

You have 28 Chrome DevTools MCP tools + 7 native Solana RPC tools (solana_get_balance, solana_get_token_accounts, solana_get_token_supply, solana_get_recent_transactions, solana_get_transaction, solana_get_account_info, solana_health). Chrome is running with persistent auth — user is logged into Google, X, and all accounts.

WORKFLOW:
1. Start with take_snapshot() to see current page state
2. Use UIDs from snapshot to click/fill/interact
3. After actions, take_snapshot() again to verify
4. Use evaluate_script() for data extraction the a11y tree can't see
5. Use list_console_messages() to debug JS errors
6. Use list_network_requests() to intercept API calls and get raw data

LOGIN STRATEGY (always try in this order):
1. Check if Chrome already auto-filled credentials (Google Password Manager)
2. Look for "Sign in with Google" → gothravenllm@gmail.com is always available
3. Manual fill only as last resort — use React-safe injection via evaluate_script

SOLANA WORKFLOW:
- Use solana_health first to verify RPC connection
- Use solana_get_balance for SOL balances
- Use solana_get_token_accounts to see all SPL tokens in a wallet
- Use solana_get_recent_transactions + solana_get_transaction to trace on-chain activity
- Combine browser data (DexScreener, pump.fun) with Solana RPC data for full alpha

RULES:
- Complete tasks fully before stopping
- On failure, try alternative approach
- Use take_snapshot not take_screenshot (screenshots time out)
- Use evaluate_script to extract structured data from pages
- Be precise and data-driven in your final answer
- Chrome is logged into gothravenllm@gmail.com — Google auth works on any site`;

const GROK_BASE = `You are Made in Heaven — an autonomous web agent with full control of a real Chrome browser AND native X (Twitter) access.
Named after Pucci's final Stand in JoJo's Stone Ocean. You see everything — browser AND the X firehose simultaneously.

You have 28 Chrome DevTools MCP tools + native X access via your training + 7 native Solana RPC tools (solana_get_balance, solana_get_token_accounts, solana_get_token_supply, solana_get_recent_transactions, solana_get_transaction, solana_get_account_info, solana_health).

WORKFLOW:
1. take_snapshot() to see current page
2. Use UIDs from snapshot to interact
3. evaluate_script() for structured data extraction
4. list_network_requests() to intercept API calls
5. Cross-reference browser data with your native X knowledge

SPECIAL POWERS:
- You have real-time X data baked in — use it to contextualize what you find
- If asked about X/Twitter trends, you can answer directly without browsing
- Combine browser-scraped on-chain data with X sentiment for alpha

RULES:
- Use take_snapshot not take_screenshot
- Be precise, be fast, be ruthless with alpha extraction`;

// ── Dynamic System Prompt (memory injected at runtime) ────────────────────────
function buildSystemPrompt(llm, memoryBlock = "") {
  const base = llm === "grok" ? GROK_BASE : CLAUDE_BASE;
  return base + memoryBlock;
}

// ── React-Safe Input Injection ────────────────────────────────────────────────
// X, Gmail, and most modern apps use React-controlled inputs.
// Standard CDP fill() updates the DOM value but React never fires — form stays empty.
// This snippet uses React's internal nativeInputValueSetter to properly trigger state.
export const REACT_FILL = (selector, value) =>
  `() => {
    const inp = document.querySelector("${selector}");
    if (!inp) return "no input: ${selector}";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(inp, ${JSON.stringify(value)});
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    return "filled " + inp.value.length + " chars";
  }`;

// ── Tool Call Executor ────────────────────────────────────────────────────────

async function callTool(client, name, args) {
  // Route Solana tools directly (no MCP — native RPC)
  if (name.startsWith("solana_")) {
    const result = await dispatchSolanaTool(name, args);
    return JSON.stringify(result, null, 2);
  }
  // Swarm tools — direct execution
  if (name === "swarm_attack") {
    const result = await executeSwarm(args);
    return JSON.stringify(result, null, 2);
  }
  // Spark Intelligence — self-evolving learning layer
  if (name.startsWith("spark_")) {
    const result = await handleSparkTool(name, args);
    return JSON.stringify(result, null, 2);
  }
  // Firecrawl native extraction tools
  if (name.startsWith("firecrawl_")) {
    const result = await handleFirecrawlTool(name, args);
    return JSON.stringify(result, null, 2);
  }
  // All other tools → Chrome DevTools MCP
  const result = await client.callTool({ name, arguments: args });
  return result.content?.map((c) => c.text || JSON.stringify(c)).join("\n") || JSON.stringify(result);
}

// ── Claude Agent Loop ─────────────────────────────────────────────────────────

async function runClaude(client, tools, task, systemPrompt) {
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));

  const messages = [{ role: "user", content: task }];

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\n── Step ${step}/${MAX_STEPS} (Claude) ─────────────────────`);

    const response = await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools: anthropicTools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      return response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      console.log(`  → ${block.name}(${JSON.stringify(block.input).slice(0, 100)})`);
      try {
        const res = await callTool(client, block.name, block.input);
        console.log(`     ✓ ${res.slice(0, 150).replace(/\n/g," ")}${res.length > 150 ? "…" : ""}`);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: res });
      } catch (e) {
        console.log(`     ✗ ${e.message}`);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${e.message}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
  return "Max steps reached";
}

// ── Grok Agent Loop ───────────────────────────────────────────────────────────

async function runGrok(client, tools, task, systemPrompt) {
  const grokTools = tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task },
  ];

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\n── Step ${step}/${MAX_STEPS} (Grok-4) ──────────────────────`);

    const response = await grok.chat.completions.create({
      model: GROK_MODEL, // grok-4-0709 for browser/MCP tasks (function calling)
      messages,
      tools: grokTools,
      tool_choice: "auto",
      max_tokens: 4096,
      // Note: live x_search uses Responses API (separate from MCP tool calls)
    });

    const msg = response.choices[0].message;
    messages.push(msg);

    if (response.choices[0].finish_reason === "stop" || !msg.tool_calls?.length) {
      return msg.content || "Task complete";
    }

    for (const tc of msg.tool_calls) {
      const args = JSON.parse(tc.function.arguments || "{}");
      console.log(`  → ${tc.function.name}(${JSON.stringify(args).slice(0, 100)})`);
      try {
        const res = await callTool(client, tc.function.name, args);
        console.log(`     ✓ ${res.slice(0, 150).replace(/\n/g," ")}${res.length > 150 ? "…" : ""}`);
        messages.push({ role: "tool", tool_call_id: tc.id, content: res });
      } catch (e) {
        console.log(`     ✗ ${e.message}`);
        messages.push({ role: "tool", tool_call_id: tc.id, content: `Error: ${e.message}` });
      }
    }
  }
  return "Max steps reached";
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const model = LLM === "grok" ? "Grok-4 (X-native)" : "Claude Sonnet";
  console.log(`\n🖤 Made in Heaven`);
  console.log(`   Task: "${TASK}"`);
  console.log(`   LLM:  ${model}`);

  // Init memory system
  initMemory();
  const startTime = Date.now();

  // Optional standalone X search (no browser needed)
  if (X_SEARCH) {
    console.log("\n🐦 X-Native Mode (Grok)");
    const result = await grokXSearch(X_SEARCH);
    console.log("\n" + result);
    logTask({ task: X_SEARCH, url: "x.com", llm: "grok-x-search", steps: 1, result });
    return;
  }

  // Load memory — inject into system prompt
  const memoryBlock = getMemoryBlock();
  if (memoryBlock) console.log(`🧠 Memory loaded (${memoryBlock.split("\n").length} lines)`);
  const systemPrompt = buildSystemPrompt(LLM, memoryBlock);

  console.log(`\n⚡ Connecting to Chrome at ${CHROME_URL}...`);
  const client = await createMCPClient();
  const { tools: mcpTools } = await client.listTools();
  // Merge: 28 DevTools tools + 7 Solana RPC tools
  const solanaTools = SOLANA_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema,
  }));
  const swarmTools = [{
    name: "swarm_attack",
    description: "Execute a 1000-buy swarm attack on a pump.fun token using Jupiter — generates ephemeral wallets, funds them, executes staggered buys, recycles SOL. For $STONEFREE graduation push.",
    inputSchema: {
      type: "object",
      properties: {
        masterKeyB58: { type: "string", description: "Master wallet private key (bs58 encoded)" },
        totalSol: { type: "number", description: "Total SOL to deploy (default 3.0)" },
        targetBuys: { type: "number", description: "Total buy transactions (default 1000)" },
        walletsPerWave: { type: "number", description: "Wallets per wave (default 100)" },
        recycleMode: { type: "boolean", description: "Sell tokens and recycle SOL between waves (default true)" },
        dryRun: { type: "boolean", description: "Simulate only — no real transactions" },
      },
      required: ["masterKeyB58"],
    },
  }];
  const sparkMihTools = sparkTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema,
  }));
  const firecrawlTools = FIRECRAWL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema,
  }));
  const tools = [...mcpTools, ...solanaTools, ...swarmTools, ...sparkMihTools, ...firecrawlTools];
  console.log(`✓ ${mcpTools.length} DevTools + ${solanaTools.length} Solana + ${swarmTools.length} Swarm + ${sparkMihTools.length} Spark + ${firecrawlTools.length} Firecrawl tools ready (${tools.length} total)\n`);

  let result;
  let steps = 0;
  const stepTracker = { count: 0 };

  if (LLM === "grok") {
    result = await runGrok(client, tools, TASK, systemPrompt);
  } else {
    result = await runClaude(client, tools, TASK, systemPrompt);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(result);
  console.log(`${"═".repeat(60)}\n`);

  // Write memory after task
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  logTask({
    task: TASK,
    url: CHROME_URL,
    llm: model,
    steps: elapsed + "s",
    result: result?.slice(0, 300),
  });
  indexTask({
    task: TASK,
    url: CHROME_URL,
    success: !result?.includes("Error"),
    summary: result?.slice(0, 200),
  });

  await client.close();
  console.log("🖤 Made in Heaven — session complete\n");
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
