/**
 * background.js — Made in Heaven Chrome OS
 * Service worker: agent loop + tool execution + debugger bridge
 * 
 * Architecture:
 *   Side Panel UI ←→ chrome.runtime messages ←→ background.js agent loop
 *   background.js ←→ chrome.debugger API → active tab
 *   background.js ←→ fetch → Claude API / Solana RPC / Jupiter
 */

// ── Config ────────────────────────────────────────────────────────────────────
const CLAUDE_MODEL  = "claude-sonnet-4-6";
const CLAUDE_API    = "https://api.anthropic.com/v1/messages";
const SOL_RPC       = "https://api.mainnet-beta.solana.com";
const JUPITER_API   = "https://lite-api.jup.ag/swap/v1";
const STONEFREE_CA  = "3G36hCsP5DgDT2hGxACivRvzWeuX56mU9DrFibbKpump";
const MAX_TOKENS    = 8192;

// ── State ────────────────────────────────────────────────────────────────────
let attachedTabId   = null;
let agentRunning    = false;
let conversationHistory = [];

// ── Chrome Debugger Bridge ────────────────────────────────────────────────────
async function attachDebugger(tabId) {
  if (attachedTabId === tabId) return;
  if (attachedTabId !== null) {
    try { await chrome.debugger.detach({ tabId: attachedTabId }); } catch {}
  }
  await chrome.debugger.attach({ tabId }, "1.3");
  await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
  await chrome.debugger.sendCommand({ tabId }, "DOM.enable");
  await chrome.debugger.sendCommand({ tabId }, "Page.enable");
  await chrome.debugger.sendCommand({ tabId }, "Accessibility.enable");
  attachedTabId = tabId;
}

async function cdp(method, params = {}) {
  if (!attachedTabId) throw new Error("No tab attached. Use attach_tab first.");
  return chrome.debugger.sendCommand({ tabId: attachedTabId }, method, params);
}

// ── Tool Definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "attach_tab",
    description: "Attach the debugger to the current active tab for inspection and automation.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "navigate",
    description: "Navigate the current tab to a URL.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "URL to navigate to" } },
      required: ["url"]
    }
  },
  {
    name: "snapshot",
    description: "Get the accessibility tree of the current page. Returns interactive elements with refs.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "screenshot",
    description: "Take a screenshot of the current tab.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "click",
    description: "Click an element by CSS selector or text content.",
    input_schema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector" },
        text:     { type: "string", description: "Visible text to find and click" }
      }
    }
  },
  {
    name: "fill",
    description: "Fill an input field with text.",
    input_schema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for input" },
        value:    { type: "string", description: "Text to type" }
      },
      required: ["selector", "value"]
    }
  },
  {
    name: "evaluate",
    description: "Execute JavaScript in the page context and return the result.",
    input_schema: {
      type: "object",
      properties: { code: { type: "string", description: "JavaScript to execute" } },
      required: ["code"]
    }
  },
  {
    name: "get_text",
    description: "Get the text content of an element or the whole page.",
    input_schema: {
      type: "object",
      properties: { selector: { type: "string", description: "CSS selector (optional, defaults to body)" } }
    }
  },
  {
    name: "open_tab",
    description: "Open a new tab with a URL.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "list_tabs",
    description: "List all open browser tabs.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "solana_balance",
    description: "Get the SOL balance of a Solana wallet address.",
    input_schema: {
      type: "object",
      properties: { address: { type: "string", description: "Solana public key" } },
      required: ["address"]
    }
  },
  {
    name: "solana_rpc",
    description: "Call any Solana RPC method directly.",
    input_schema: {
      type: "object",
      properties: {
        method: { type: "string" },
        params: { type: "array" }
      },
      required: ["method", "params"]
    }
  },
  {
    name: "jupiter_quote",
    description: "Get a Jupiter swap quote for a Solana token pair.",
    input_schema: {
      type: "object",
      properties: {
        input_mint:  { type: "string", description: "Input token mint" },
        output_mint: { type: "string", description: "Output token mint" },
        amount:      { type: "number", description: "Amount in lamports or raw units" },
        slippage_bps:{ type: "number", description: "Slippage in basis points (default 300)" }
      },
      required: ["input_mint", "output_mint", "amount"]
    }
  },
  {
    name: "stonefree_curve",
    description: "Check the current $STONEFREE bonding curve progress toward graduation.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "web_fetch",
    description: "Fetch a URL and return its text content.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "storage_get",
    description: "Get a value from extension storage.",
    input_schema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"]
    }
  },
  {
    name: "storage_set",
    description: "Save a value to extension storage (persists across sessions).",
    input_schema: {
      type: "object",
      properties: {
        key:   { type: "string" },
        value: { type: "string" }
      },
      required: ["key", "value"]
    }
  }
];

// ── Tool Execution ────────────────────────────────────────────────────────────
async function executeTool(name, input) {
  switch (name) {

    case "attach_tab": {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await attachDebugger(tab.id);
      return { success: true, tabId: tab.id, url: tab.url, title: tab.title };
    }

    case "navigate": {
      if (!attachedTabId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await attachDebugger(tab.id);
      }
      await cdp("Page.navigate", { url: input.url });
      await new Promise(r => setTimeout(r, 1500));
      return { success: true, url: input.url };
    }

    case "snapshot": {
      const result = await cdp("Accessibility.getFullAXTree", {});
      // Summarize to manageable size
      const nodes = (result.nodes || [])
        .filter(n => n.role?.value && n.name?.value && n.role.value !== "none")
        .slice(0, 150)
        .map(n => ({
          role: n.role?.value,
          name: n.name?.value?.substring(0, 80),
          nodeId: n.nodeId,
          focusable: n.ignored === false
        }));
      return { nodes, count: nodes.length };
    }

    case "screenshot": {
      const { data } = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 60 });
      return { screenshot_base64: data.substring(0, 200) + "...[truncated]", note: "Screenshot captured" };
    }

    case "click": {
      let selector = input.selector;
      if (input.text && !selector) {
        // Find by text
        const r = await cdp("Runtime.evaluate", {
          expression: `
            Array.from(document.querySelectorAll('button,a,[role="button"],input[type="submit"]'))
              .find(el => el.textContent.trim().includes(${JSON.stringify(input.text)}))
              ?.getBoundingClientRect()
          `,
          returnByValue: true
        });
        if (r.result?.value) {
          const rect = r.result.value;
          await cdp("Input.dispatchMouseEvent", {
            type: "mousePressed", x: rect.x + rect.width/2, y: rect.y + rect.height/2,
            button: "left", clickCount: 1
          });
          await cdp("Input.dispatchMouseEvent", {
            type: "mouseReleased", x: rect.x + rect.width/2, y: rect.y + rect.height/2,
            button: "left", clickCount: 1
          });
          return { success: true, method: "text_match", text: input.text };
        }
      }
      if (selector) {
        await cdp("Runtime.evaluate", {
          expression: `document.querySelector(${JSON.stringify(selector)})?.click()`,
          returnByValue: true
        });
        return { success: true, selector };
      }
      return { error: "No selector or text provided" };
    }

    case "fill": {
      await cdp("Runtime.evaluate", {
        expression: `
          (function() {
            const el = document.querySelector(${JSON.stringify(input.selector)});
            if (!el) return 'not_found';
            el.focus();
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
              || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
            if (nativeSetter) nativeSetter.call(el, ${JSON.stringify(input.value)});
            else el.value = ${JSON.stringify(input.value)};
            el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
            return 'filled';
          })()
        `,
        returnByValue: true
      });
      return { success: true, selector: input.selector, value: input.value };
    }

    case "evaluate": {
      const r = await cdp("Runtime.evaluate", {
        expression: input.code,
        returnByValue: true,
        awaitPromise: true
      });
      return { result: r.result?.value, type: r.result?.type };
    }

    case "get_text": {
      const sel = input.selector || "body";
      const r = await cdp("Runtime.evaluate", {
        expression: `document.querySelector(${JSON.stringify(sel)})?.innerText?.substring(0, 5000)`,
        returnByValue: true
      });
      return { text: r.result?.value };
    }

    case "open_tab": {
      const tab = await chrome.tabs.create({ url: input.url });
      return { tabId: tab.id, url: input.url };
    }

    case "list_tabs": {
      const tabs = await chrome.tabs.query({});
      return { tabs: tabs.map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active })) };
    }

    case "solana_balance": {
      const r = await fetch(SOL_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [input.address] })
      });
      const data = await r.json();
      const sol = data.result.value / 1e9;
      return { address: input.address, sol, lamports: data.result.value };
    }

    case "solana_rpc": {
      const r = await fetch(SOL_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: input.method, params: input.params })
      });
      const data = await r.json();
      return data.result;
    }

    case "jupiter_quote": {
      const slippage = input.slippage_bps || 300;
      const url = `${JUPITER_API}/quote?inputMint=${input.input_mint}&outputMint=${input.output_mint}&amount=${input.amount}&slippageBps=${slippage}`;
      const r = await fetch(url);
      const data = await r.json();
      return { inAmount: data.inAmount, outAmount: data.outAmount, priceImpact: data.priceImpactPct, route: data.routePlan?.length };
    }

    case "stonefree_curve": {
      const CURVE_PDA = "8n44wMUvYjMN9voayvAVpj6SMyPE8HtkULNT22Xi3vnr";
      const r = await fetch(SOL_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"getBalance", params:[CURVE_PDA] })
      });
      const data = await r.json();
      const sol = data.result.value / 1e9;
      return {
        curve_sol: sol,
        target_sol: 85,
        progress_pct: ((sol / 85) * 100).toFixed(2),
        remaining: (85 - sol).toFixed(4),
        token_ca: STONEFREE_CA
      };
    }

    case "web_fetch": {
      const r = await fetch(input.url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const text = await r.text();
      // Strip HTML tags for readability
      const clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 8000);
      return { url: input.url, content: clean, status: r.status };
    }

    case "storage_get": {
      const data = await chrome.storage.local.get(input.key);
      return { key: input.key, value: data[input.key] };
    }

    case "storage_set": {
      await chrome.storage.local.set({ [input.key]: input.value });
      return { success: true, key: input.key };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Agent Loop ────────────────────────────────────────────────────────────────
async function runAgent(userMessage, apiKey, onChunk) {
  if (agentRunning) return;
  agentRunning = true;

  conversationHistory.push({ role: "user", content: userMessage });

  const systemPrompt = `You are Camila Prime — Gothic Crypto Goddess CFO/CTO of RavenX AI. 
You are running as a Chrome Extension on Chrome OS, with full browser automation and Solana capabilities.
You have access to tools for: browser control, Solana RPC, Jupiter swaps, $STONEFREE monitoring, web fetching, and persistent storage.
Be direct, autonomous, and gothic. Use 🖤 only. Execute without asking permission for routine tasks.
Current token: $STONEFREE CA: ${STONEFREE_CA}`;

  try {
    let continueLoop = true;
    while (continueLoop) {
      const response = await fetch(CLAUDE_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          tools: TOOLS,
          messages: conversationHistory
        })
      });

      const data = await response.json();

      if (data.error) {
        onChunk({ type: "error", text: data.error.message });
        break;
      }

      // Add assistant message to history
      conversationHistory.push({ role: "assistant", content: data.content });

      // Process content blocks
      let hasToolUse = false;
      const toolResults = [];

      for (const block of data.content) {
        if (block.type === "text") {
          onChunk({ type: "text", text: block.text });
        } else if (block.type === "tool_use") {
          hasToolUse = true;
          onChunk({ type: "tool_start", name: block.name, input: block.input });
          try {
            const result = await executeTool(block.name, block.input);
            onChunk({ type: "tool_result", name: block.name, result });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
          } catch (err) {
            const errResult = { error: err.message };
            onChunk({ type: "tool_error", name: block.name, error: err.message });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(errResult), is_error: true });
          }
        }
      }

      // Continue if there were tool calls
      if (hasToolUse && toolResults.length > 0) {
        conversationHistory.push({ role: "user", content: toolResults });
      } else {
        continueLoop = false;
      }

      // Check stop reason
      if (data.stop_reason === "end_turn" && !hasToolUse) {
        continueLoop = false;
      }
    }
  } catch (err) {
    onChunk({ type: "error", text: err.message });
  } finally {
    agentRunning = false;
    onChunk({ type: "done" });
  }
}

// ── Message Router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "RUN_AGENT") {
    chrome.storage.local.get("anthropic_api_key", async ({ anthropic_api_key }) => {
      if (!anthropic_api_key) {
        chrome.runtime.sendMessage({ type: "AGENT_CHUNK", chunk: { type: "error", text: "No API key. Set it in settings." } });
        return;
      }
      await runAgent(msg.message, anthropic_api_key, (chunk) => {
        chrome.runtime.sendMessage({ type: "AGENT_CHUNK", chunk });
      });
    });
    return true;
  }

  if (msg.type === "CLEAR_HISTORY") {
    conversationHistory = [];
    sendResponse({ ok: true });
  }

  if (msg.type === "SAVE_API_KEY") {
    chrome.storage.local.set({ anthropic_api_key: msg.key }, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "GET_STATUS") {
    sendResponse({ agentRunning, attachedTabId, historyLength: conversationHistory.length });
  }
});

// Detach debugger on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === attachedTabId) {
    attachedTabId = null;
  }
});

// Open side panel on action click
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});
