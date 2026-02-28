/**
 * background.js — Made in Heaven Chrome OS v2
 * Multi-model (Claude/Grok/Gemini/Ollama) · Persona system · Debugger bridge · Solana
 */

import { PERSONAS, DEFAULT_PERSONA } from './personas.js';
import { callModel }                  from './models.js';

// ── Config ────────────────────────────────────────────────────────────────────
const SOL_RPC      = "https://api.mainnet-beta.solana.com";
const JUPITER_API  = "https://lite-api.jup.ag/swap/v1";
const STONEFREE_CA = "3G36hCsP5DgDT2hGxACivRvzWeuX56mU9DrFibbKpump";

// ── State ────────────────────────────────────────────────────────────────────
let attachedTabId       = null;
let agentRunning        = false;
let conversationHistory = [];
let activePersonaId     = DEFAULT_PERSONA;
let activeProvider      = "claude";
let activeModel         = "claude-sonnet-4-6";
let apiKeys             = {};

// Load saved keys on boot
chrome.storage.local.get(
  ["anthropic_api_key","xai_api_key","google_api_key","ollama_url"],
  (data) => { apiKeys = data; }
);

// ── Debugger bridge ───────────────────────────────────────────────────────────
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

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  { name:"attach_tab", description:"Attach debugger to current active tab.", input_schema:{type:"object",properties:{},required:[]} },
  { name:"navigate", description:"Navigate to a URL.", input_schema:{type:"object",properties:{url:{type:"string"}},required:["url"]} },
  { name:"snapshot", description:"Get accessibility tree of current page.", input_schema:{type:"object",properties:{},required:[]} },
  { name:"screenshot", description:"Take screenshot of current tab.", input_schema:{type:"object",properties:{},required:[]} },
  { name:"click", description:"Click element by CSS selector or text.", input_schema:{type:"object",properties:{selector:{type:"string"},text:{type:"string"}}} },
  { name:"fill", description:"Fill input field.", input_schema:{type:"object",properties:{selector:{type:"string"},value:{type:"string"}},required:["selector","value"]} },
  { name:"evaluate", description:"Execute JavaScript in page.", input_schema:{type:"object",properties:{code:{type:"string"}},required:["code"]} },
  { name:"get_text", description:"Get text content of page or element.", input_schema:{type:"object",properties:{selector:{type:"string"}}} },
  { name:"open_tab", description:"Open new tab.", input_schema:{type:"object",properties:{url:{type:"string"}},required:["url"]} },
  { name:"list_tabs", description:"List all open tabs.", input_schema:{type:"object",properties:{},required:[]} },
  { name:"close_tab", description:"Close a tab by ID.", input_schema:{type:"object",properties:{tabId:{type:"number"}},required:["tabId"]} },
  { name:"scroll", description:"Scroll page up or down.", input_schema:{type:"object",properties:{direction:{type:"string",enum:["up","down"]},amount:{type:"number"}}} },
  { name:"wait", description:"Wait N seconds.", input_schema:{type:"object",properties:{seconds:{type:"number"}},required:["seconds"]} },
  { name:"solana_balance", description:"Get SOL balance of a wallet.", input_schema:{type:"object",properties:{address:{type:"string"}},required:["address"]} },
  { name:"solana_rpc", description:"Call Solana RPC method.", input_schema:{type:"object",properties:{method:{type:"string"},params:{type:"array"}},required:["method","params"]} },
  { name:"solana_token_balance", description:"Get token balance for a wallet+mint.", input_schema:{type:"object",properties:{wallet:{type:"string"},mint:{type:"string"}},required:["wallet","mint"]} },
  { name:"jupiter_quote", description:"Get Jupiter swap quote.", input_schema:{type:"object",properties:{input_mint:{type:"string"},output_mint:{type:"string"},amount:{type:"number"},slippage_bps:{type:"number"}},required:["input_mint","output_mint","amount"]} },
  { name:"stonefree_status", description:"Check $STONEFREE bonding curve progress.", input_schema:{type:"object",properties:{},required:[]} },
  { name:"web_fetch", description:"Fetch URL and return text.", input_schema:{type:"object",properties:{url:{type:"string"}},required:["url"]} },
  { name:"storage_get", description:"Get value from extension storage.", input_schema:{type:"object",properties:{key:{type:"string"}},required:["key"]} },
  { name:"storage_set", description:"Save value to extension storage.", input_schema:{type:"object",properties:{key:{type:"string"},value:{type:"string"}},required:["key","value"]} },
  { name:"speak", description:"Speak text aloud using TTS.", input_schema:{type:"object",properties:{text:{type:"string"}},required:["text"]} },
  { name:"notify", description:"Show Chrome notification.", input_schema:{type:"object",properties:{title:{type:"string"},message:{type:"string"}},required:["title","message"]} }
];

// ── Tool execution ────────────────────────────────────────────────────────────
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
      const nodes = (result.nodes || [])
        .filter(n => n.role?.value && n.name?.value && n.role.value !== "none")
        .slice(0, 150)
        .map(n => ({ role: n.role?.value, name: n.name?.value?.substring(0, 80), nodeId: n.nodeId }));
      return { nodes, count: nodes.length };
    }

    case "screenshot": {
      const { data } = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 55 });
      return { note: "Screenshot captured", size_b64: data.length };
    }

    case "click": {
      if (input.text) {
        const r = await cdp("Runtime.evaluate", {
          expression: `Array.from(document.querySelectorAll('button,a,[role="button"]')).find(el=>el.textContent.trim().includes(${JSON.stringify(input.text)}))?.click()`,
          returnByValue: true
        });
        return { success: true, method: "text_click", text: input.text };
      }
      await cdp("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(input.selector)})?.click()`, returnByValue: true });
      return { success: true, selector: input.selector };
    }

    case "fill": {
      await cdp("Runtime.evaluate", {
        expression: `(function(){const el=document.querySelector(${JSON.stringify(input.selector)});if(!el)return'not_found';el.focus();const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set||Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')?.set;if(s)s.call(el,${JSON.stringify(input.value)});else el.value=${JSON.stringify(input.value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return'ok'})()`,
        returnByValue: true
      });
      return { success: true };
    }

    case "evaluate": {
      const r = await cdp("Runtime.evaluate", { expression: input.code, returnByValue: true, awaitPromise: true });
      return { result: r.result?.value, type: r.result?.type };
    }

    case "get_text": {
      const sel = input.selector || "body";
      const r = await cdp("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(sel)})?.innerText?.substring(0,6000)`, returnByValue: true });
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

    case "close_tab": {
      await chrome.tabs.remove(input.tabId);
      return { success: true, closedTabId: input.tabId };
    }

    case "scroll": {
      const dir = input.direction === "up" ? -1 : 1;
      const amt = (input.amount || 300) * dir;
      await cdp("Runtime.evaluate", { expression: `window.scrollBy(0, ${amt})`, returnByValue: true });
      return { success: true, direction: input.direction, amount: Math.abs(amt) };
    }

    case "wait": {
      await new Promise(r => setTimeout(r, (input.seconds || 1) * 1000));
      return { success: true, waited: input.seconds };
    }

    case "solana_balance": {
      const r = await fetch(SOL_RPC, { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getBalance",params:[input.address]}) });
      const d = await r.json();
      return { address: input.address, sol: d.result.value/1e9, lamports: d.result.value };
    }

    case "solana_rpc": {
      const r = await fetch(SOL_RPC, { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({jsonrpc:"2.0",id:1,method:input.method,params:input.params}) });
      return (await r.json()).result;
    }

    case "solana_token_balance": {
      const r = await fetch(SOL_RPC, { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getTokenAccountsByOwner",
          params:[input.wallet,{mint:input.mint},{encoding:"jsonParsed"}]}) });
      const d = await r.json();
      const accounts = d.result?.value || [];
      const total = accounts.reduce((s, a) => s + parseInt(a.account.data.parsed.info.tokenAmount.amount), 0);
      return { wallet: input.wallet, mint: input.mint, raw_amount: total, accounts: accounts.length };
    }

    case "jupiter_quote": {
      const slippage = input.slippage_bps || 300;
      const url = `${JUPITER_API}/quote?inputMint=${input.input_mint}&outputMint=${input.output_mint}&amount=${input.amount}&slippageBps=${slippage}`;
      const r = await fetch(url);
      const d = await r.json();
      return { inAmount: d.inAmount, outAmount: d.outAmount, priceImpact: d.priceImpactPct };
    }

    case "stonefree_status": {
      const CURVE = "8n44wMUvYjMN9voayvAVpj6SMyPE8HtkULNT22Xi3vnr";
      const r = await fetch(SOL_RPC, { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getBalance",params:[CURVE]}) });
      const d = await r.json();
      const sol = d.result.value / 1e9;
      return { curve_sol: sol, target: 85, progress_pct: ((sol/85)*100).toFixed(2), remaining: (85-sol).toFixed(4), ca: STONEFREE_CA };
    }

    case "web_fetch": {
      const r = await fetch(input.url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const text = await r.text();
      return { url: input.url, content: text.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().substring(0,8000), status: r.status };
    }

    case "storage_get": {
      const d = await chrome.storage.local.get(input.key);
      return { key: input.key, value: d[input.key] };
    }

    case "storage_set": {
      await chrome.storage.local.set({ [input.key]: input.value });
      return { success: true };
    }

    case "speak": {
      chrome.runtime.sendMessage({ type: "AGENT_CHUNK", chunk: { type: "speak", text: input.text } });
      return { success: true };
    }

    case "notify": {
      chrome.notifications.create({ type:"basic", iconUrl:"icons/icon48.png", title: input.title, message: input.message });
      return { success: true };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Agent loop ────────────────────────────────────────────────────────────────
async function runAgent(userMessage, onChunk) {
  if (agentRunning) return;
  agentRunning = true;
  conversationHistory.push({ role: "user", content: userMessage });

  const persona = PERSONAS[activePersonaId] || PERSONAS[DEFAULT_PERSONA];
  const system = persona.systemPrompt;

  try {
    let loop = true;
    while (loop) {
      const response = await callModel({
        provider: activeProvider,
        model:    activeModel,
        messages: conversationHistory,
        system,
        tools: TOOLS,
        apiKeys,
        ollamaUrl: apiKeys.ollama_url
      });

      conversationHistory.push({ role: "assistant", content: response.content });

      let hasTools = false;
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === "text") {
          onChunk({ type: "text", text: block.text });
        } else if (block.type === "tool_use") {
          hasTools = true;
          onChunk({ type: "tool_start", name: block.name, input: block.input });
          try {
            const result = await executeTool(block.name, block.input);
            onChunk({ type: "tool_result", name: block.name, result });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
          } catch (err) {
            onChunk({ type: "tool_error", name: block.name, error: err.message });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ error: err.message }), is_error: true });
          }
        }
      }

      if (hasTools && toolResults.length > 0) {
        conversationHistory.push({ role: "user", content: toolResults });
      } else {
        loop = false;
      }

      if (response.stopReason === "end_turn" && !hasTools) loop = false;
    }
  } catch (err) {
    onChunk({ type: "error", text: err.message });
  } finally {
    agentRunning = false;
    onChunk({ type: "done" });
  }
}

// ── Message router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "RUN_AGENT") {
    chrome.storage.local.get(["anthropic_api_key","xai_api_key","google_api_key","ollama_url"], (data) => {
      apiKeys = data;
      // Validate we have a key for active provider
      const keyMap = { claude: "anthropic_api_key", grok: "xai_api_key", gemini: "google_api_key", ollama: null };
      const needed = keyMap[activeProvider];
      if (needed && !data[needed]) {
        chrome.runtime.sendMessage({ type: "AGENT_CHUNK", chunk: { type: "error", text: `No ${activeProvider} API key. Open ⚙ Settings.` } });
        return;
      }
      runAgent(msg.message, (chunk) => chrome.runtime.sendMessage({ type: "AGENT_CHUNK", chunk }));
    });
    return true;
  }

  if (msg.type === "SET_PERSONA") {
    activePersonaId = msg.personaId;
    conversationHistory = []; // fresh context per persona switch
    sendResponse({ ok: true });
  }

  if (msg.type === "SET_PROVIDER") {
    activeProvider = msg.provider;
    activeModel    = msg.model;
    sendResponse({ ok: true });
  }

  if (msg.type === "SAVE_ALL_KEYS") {
    apiKeys = { ...apiKeys, ...msg.keys };
    sendResponse({ ok: true });
  }

  if (msg.type === "CLEAR_HISTORY") {
    conversationHistory = [];
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_STATUS") {
    sendResponse({ agentRunning, attachedTabId, historyLength: conversationHistory.length, persona: activePersonaId, provider: activeProvider, model: activeModel });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => { if (tabId === attachedTabId) attachedTabId = null; });
chrome.action.onClicked.addListener(async (tab) => { await chrome.sidePanel.open({ tabId: tab.id }); });
