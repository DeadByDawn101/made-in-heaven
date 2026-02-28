// sidepanel.js — Made in Heaven Chrome OS UI

const messages   = document.getElementById("messages");
const msgInput   = document.getElementById("msgInput");
const btnSend    = document.getElementById("btnSend");
const btnClear   = document.getElementById("btnClear");
const btnAttach  = document.getElementById("btnAttach");
const btnSettings= document.getElementById("btnSettings");
const btnSave    = document.getElementById("btnSaveSettings");
const settings   = document.getElementById("settings");
const thinking   = document.getElementById("thinking");
const statusDot  = document.getElementById("statusDot");
const apiKeyInput= document.getElementById("apiKeyInput");
const curveVal   = document.getElementById("curveVal");
const curveProgress = document.getElementById("curveProgress");
const masterBal  = document.getElementById("masterBal");

// ── Helpers ───────────────────────────────────────────────────────────────────
function addMessage(role, content, label) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  if (label) {
    const lbl = document.createElement("div");
    lbl.className = "message-label";
    lbl.textContent = label;
    div.appendChild(lbl);
  }
  const pre = document.createElement("pre");
  pre.textContent = typeof content === "object" ? JSON.stringify(content, null, 2) : content;
  div.appendChild(pre);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function setThinking(on) {
  thinking.style.display = on ? "block" : "none";
  btnSend.disabled = on;
  msgInput.disabled = on;
  statusDot.className = "status-dot" + (on ? " active" : "");
}

// ── Settings ──────────────────────────────────────────────────────────────────
btnSettings.addEventListener("click", () => {
  settings.classList.toggle("open");
});

btnSave.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    chrome.runtime.sendMessage({ type: "SAVE_API_KEY", key }, () => {
      addMessage("assistant", "✅ API key saved.", "System");
      settings.classList.remove("open");
    });
  }
});

// Load saved settings
chrome.storage.local.get(["anthropic_api_key"], (data) => {
  if (data.anthropic_api_key) {
    apiKeyInput.value = data.anthropic_api_key;
  }
});

// ── Attach Tab ────────────────────────────────────────────────────────────────
btnAttach.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "RUN_AGENT", message: "Attach to current tab and take a snapshot" });
  setThinking(true);
});

// ── Clear ─────────────────────────────────────────────────────────────────────
btnClear.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" });
  messages.innerHTML = "";
  addMessage("assistant", "🖤 History cleared. Fresh session.", "Camila Prime");
});

// ── Quick Actions ─────────────────────────────────────────────────────────────
document.querySelectorAll(".qa").forEach(btn => {
  btn.addEventListener("click", () => {
    const msg = btn.dataset.msg;
    sendMessage(msg);
  });
});

// ── Send Message ─────────────────────────────────────────────────────────────
function sendMessage(text) {
  if (!text.trim() || btnSend.disabled) return;
  addMessage("user", text, "You");
  chrome.runtime.sendMessage({ type: "RUN_AGENT", message: text });
  setThinking(true);
  msgInput.value = "";
}

btnSend.addEventListener("click", () => sendMessage(msgInput.value));

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(msgInput.value);
  }
});

// ── Receive Agent Chunks ──────────────────────────────────────────────────────
let currentAssistantDiv = null;
let currentAssistantPre = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "AGENT_CHUNK") return;
  const chunk = msg.chunk;

  if (chunk.type === "text") {
    if (!currentAssistantDiv) {
      currentAssistantDiv = addMessage("assistant", "", "Camila Prime");
      currentAssistantPre = currentAssistantDiv.querySelector("pre");
    }
    currentAssistantPre.textContent += chunk.text;
    messages.scrollTop = messages.scrollHeight;
  }

  else if (chunk.type === "tool_start") {
    const content = `⚡ ${chunk.name}(${JSON.stringify(chunk.input).substring(0, 80)})`;
    addMessage("tool-use", content, "Tool Call");
  }

  else if (chunk.type === "tool_result") {
    const content = JSON.stringify(chunk.result, null, 2).substring(0, 500);
    addMessage("tool-result", content, `↩ ${chunk.name}`);
  }

  else if (chunk.type === "tool_error") {
    addMessage("error", `Tool error [${chunk.name}]: ${chunk.error}`, "Error");
  }

  else if (chunk.type === "error") {
    addMessage("error", chunk.text, "Error");
    setThinking(false);
    currentAssistantDiv = null;
    currentAssistantPre = null;
  }

  else if (chunk.type === "done") {
    setThinking(false);
    currentAssistantDiv = null;
    currentAssistantPre = null;
  }
});

// ── Ticker — $STONEFREE Live ──────────────────────────────────────────────────
async function refreshTicker() {
  try {
    const CURVE_PDA = "8n44wMUvYjMN9voayvAVpj6SMyPE8HtkULNT22Xi3vnr";
    const MASTER    = "FS9nRSztc9eqiCUEJ1ESyGo9UXSh11Dm2PkEMSFS2Eft";
    const RPC       = "https://api.mainnet-beta.solana.com";

    const [curveResp, masterResp] = await Promise.all([
      fetch(RPC, { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getBalance",params:[CURVE_PDA]}) }),
      fetch(RPC, { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getBalance",params:[MASTER]}) })
    ]);
    const curveData  = await curveResp.json();
    const masterData = await masterResp.json();
    const curveSol   = curveData.result.value / 1e9;
    const masterSol  = masterData.result.value / 1e9;

    curveVal.textContent = curveSol.toFixed(3) + " SOL";
    curveProgress.textContent = ((curveSol / 85) * 100).toFixed(1) + "%";
    masterBal.textContent = masterSol.toFixed(4) + " SOL";
  } catch {}
}

refreshTicker();
setInterval(refreshTicker, 30000); // refresh every 30s
