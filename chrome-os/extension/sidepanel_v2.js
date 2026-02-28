// sidepanel_v2.js — Made in Heaven Super Agent Edition
// Multi-model · Voice I/O · Persona switcher · Task queue · $STONEFREE ticker

import { PERSONAS, DEFAULT_PERSONA } from './personas.js';
import { PROVIDERS } from './models.js';

// ── State ────────────────────────────────────────────────────────────────────
let currentPersona = PERSONAS[DEFAULT_PERSONA];
let currentProvider = "claude";
let voiceEnabled = true;
let isRecording = false;
let speechRecognition = null;
let currentSpeech = null;
let taskQueue = [];

// ── DOM refs ─────────────────────────────────────────────────────────────────
const msgInput     = document.getElementById("msgInput");
const btnSend      = document.getElementById("btnSend");
const btnMic       = document.getElementById("btnMic");
const btnClear     = document.getElementById("btnClear");
const btnAttach    = document.getElementById("btnAttach");
const btnVoice     = document.getElementById("btnVoice");
const btnSettings  = document.getElementById("btnSettings");
const btnCloseSet  = document.getElementById("btnCloseSettings");
const btnSaveSet   = document.getElementById("btnSaveSettings");
const btnQueue     = document.getElementById("btnQueue");
const messages     = document.getElementById("messages");
const personaSel   = document.getElementById("personaSelect");
const providerSel  = document.getElementById("providerSelect");
const modelSel     = document.getElementById("modelSelect");
const settingsPane = document.getElementById("settingsDrawer");
const taskPanel    = document.getElementById("taskQueue");
const taskList     = document.getElementById("taskList");
const avatarCanvas = document.getElementById("avatarCanvas");
const avatarEmoji  = document.getElementById("avatarEmoji");
const avatarName   = document.getElementById("avatarName");
const avatarTitle  = document.getElementById("avatarTitle");
const statusText   = document.getElementById("statusText");
const voiceSelect  = document.getElementById("voiceSelect");

// ── Persona setup ─────────────────────────────────────────────────────────────
function applyPersona(id) {
  currentPersona = PERSONAS[id] || PERSONAS[DEFAULT_PERSONA];
  avatarEmoji.textContent = currentPersona.emoji;
  avatarName.textContent = currentPersona.name;
  avatarTitle.textContent = currentPersona.title;
  document.querySelector(".avatar-zone").style.borderBottomColor = currentPersona.color;
  document.documentElement.style.setProperty("--persona-color", currentPersona.color);
  avatarCanvas.style.borderColor = currentPersona.color;
  chrome.runtime.sendMessage({ type: "SET_PERSONA", personaId: id });
}

personaSel.addEventListener("change", () => applyPersona(personaSel.value));

// ── Model setup ───────────────────────────────────────────────────────────────
function updateModelOptions(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) return;
  modelSel.innerHTML = provider.models.map(m =>
    `<option value="${m}">${m}</option>`
  ).join("");
}

providerSel.addEventListener("change", () => {
  currentProvider = providerSel.value;
  updateModelOptions(currentProvider);
  chrome.runtime.sendMessage({ type: "SET_PROVIDER", provider: currentProvider, model: modelSel.value });
});

modelSel.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "SET_PROVIDER", provider: currentProvider, model: modelSel.value });
});

updateModelOptions("claude");

// ── Voice setup ───────────────────────────────────────────────────────────────
function loadVoices() {
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return;
  voiceSelect.innerHTML = voices.map((v, i) =>
    `<option value="${i}" ${v.name.includes("Google") && v.lang.startsWith("en") ? "selected" : ""}>${v.name} (${v.lang})</option>`
  ).join("");
}
speechSynthesis.addEventListener("voiceschanged", loadVoices);
loadVoices();

function speak(text) {
  if (!voiceEnabled || !text.trim()) return;
  if (currentSpeech) speechSynthesis.cancel();
  const voices = speechSynthesis.getVoices();
  const selectedIdx = parseInt(voiceSelect.value) || 0;
  const utt = new SpeechSynthesisUtterance(text.replace(/[🖤🦂👑⚡🔧✨]/g, ""));
  utt.voice = voices[selectedIdx] || null;
  utt.rate = parseFloat(document.getElementById("voiceRate")?.value || "0.95");
  utt.pitch = parseFloat(document.getElementById("voicePitch")?.value || "1.1");
  utt.onstart = () => {
    avatarCanvas.classList.add("speaking");
    setStatus("speaking...");
  };
  utt.onend = () => {
    avatarCanvas.classList.remove("speaking");
    setStatus("ready");
  };
  currentSpeech = utt;
  speechSynthesis.speak(utt);
}

btnVoice.addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  btnVoice.classList.toggle("active", voiceEnabled);
  btnVoice.textContent = voiceEnabled ? "🔊" : "🔇";
  if (!voiceEnabled) speechSynthesis.cancel();
});

// ── Voice input (STT) ─────────────────────────────────────────────────────────
function setupSTT() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btnMic.title = "STT not supported";
    btnMic.style.opacity = "0.3";
    return;
  }
  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = false;
  speechRecognition.interimResults = true;
  speechRecognition.lang = "en-US";

  speechRecognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
    msgInput.value = transcript;
    if (e.results[e.results.length - 1].isFinal) {
      btnMic.classList.remove("recording");
      isRecording = false;
      setStatus("ready");
    }
  };
  speechRecognition.onerror = () => {
    btnMic.classList.remove("recording");
    isRecording = false;
    setStatus("ready");
  };
  speechRecognition.onend = () => {
    if (isRecording) {
      btnMic.classList.remove("recording");
      isRecording = false;
    }
  };
}
setupSTT();

btnMic.addEventListener("click", () => {
  if (!speechRecognition) return;
  if (isRecording) {
    speechRecognition.stop();
    isRecording = false;
    btnMic.classList.remove("recording");
  } else {
    if (voiceEnabled) speechSynthesis.cancel();
    speechRecognition.start();
    isRecording = true;
    btnMic.classList.add("recording");
    setStatus("listening...");
  }
});

// ── Messages ──────────────────────────────────────────────────────────────────
function setStatus(text) {
  statusText.textContent = text;
}

function addMessage(role, content, label, speakIt = false) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  if (label) {
    const lbl = document.createElement("div");
    lbl.className = "msg-label";
    lbl.textContent = label;
    div.appendChild(lbl);
  }
  const pre = document.createElement("pre");
  const text = typeof content === "object" ? JSON.stringify(content, null, 2) : content;
  pre.textContent = text;
  div.appendChild(pre);

  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "msg-actions";
    const btnSpeak = document.createElement("button");
    btnSpeak.className = "msg-action";
    btnSpeak.textContent = "🔊 speak";
    btnSpeak.onclick = () => speak(text);
    const btnCopyMsg = document.createElement("button");
    btnCopyMsg.className = "msg-action";
    btnCopyMsg.textContent = "copy";
    btnCopyMsg.onclick = () => navigator.clipboard.writeText(text);
    actions.appendChild(btnSpeak);
    actions.appendChild(btnCopyMsg);
    div.appendChild(actions);
  }

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  if (speakIt && role === "assistant") speak(text);
  return { div, pre };
}

function setBusy(on) {
  btnSend.disabled = on;
  msgInput.disabled = on;
  avatarCanvas.classList.toggle("thinking", on);
  setStatus(on ? "thinking..." : "ready");
}

// ── Task Queue ────────────────────────────────────────────────────────────────
function renderTaskQueue() {
  taskList.innerHTML = "";
  for (const task of taskQueue) {
    const item = document.createElement("div");
    item.className = "task-item";
    const dot = document.createElement("div");
    dot.className = `task-status ${task.status}`;
    const txt = document.createElement("div");
    txt.className = "task-text";
    txt.textContent = task.text;
    item.appendChild(dot);
    item.appendChild(txt);
    taskList.appendChild(item);
  }
}

document.getElementById("qaAddTask").addEventListener("click", () => {
  const text = prompt("Add task to queue:");
  if (text) {
    taskQueue.push({ id: Date.now(), text, status: "pending" });
    renderTaskQueue();
    taskPanel.classList.add("open");
  }
});

btnQueue.addEventListener("click", () => {
  taskPanel.classList.toggle("open");
});

async function runTaskQueue() {
  for (const task of taskQueue.filter(t => t.status === "pending")) {
    task.status = "running";
    renderTaskQueue();
    try {
      await sendToAgent(task.text);
      task.status = "done";
    } catch {
      task.status = "error";
    }
    renderTaskQueue();
  }
}

// ── Send message ──────────────────────────────────────────────────────────────
function sendToAgent(text) {
  return new Promise((resolve) => {
    addMessage("user", text, "You");
    chrome.runtime.sendMessage({ type: "RUN_AGENT", message: text });
    setBusy(true);
    const handler = (msg) => {
      if (msg.type === "AGENT_CHUNK" && msg.chunk.type === "done") {
        chrome.runtime.onMessage.removeListener(handler);
        resolve();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
  });
}

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || btnSend.disabled) return;
  msgInput.value = "";

  if (taskQueue.length > 0 && text.toLowerCase() === "run queue") {
    runTaskQueue();
    return;
  }

  addMessage("user", text, "You");
  chrome.runtime.sendMessage({ type: "RUN_AGENT", message: text });
  setBusy(true);
}

btnSend.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ── Receive agent chunks ──────────────────────────────────────────────────────
let currentAssistant = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "AGENT_CHUNK") return;
  const { chunk } = msg;

  if (chunk.type === "text") {
    if (!currentAssistant) {
      currentAssistant = addMessage("assistant", "", currentPersona.name);
    }
    currentAssistant.pre.textContent += chunk.text;
    messages.scrollTop = messages.scrollHeight;
  }
  else if (chunk.type === "tool_start") {
    addMessage("tool-call", `⚡ ${chunk.name}(${JSON.stringify(chunk.input).substring(0, 60)})`, "Tool");
  }
  else if (chunk.type === "tool_result") {
    addMessage("tool-result", JSON.stringify(chunk.result).substring(0, 300), `↩ ${chunk.name}`);
  }
  else if (chunk.type === "error") {
    addMessage("error", chunk.text, "Error");
    setBusy(false);
    currentAssistant = null;
  }
  else if (chunk.type === "done") {
    // Speak the last assistant response
    if (currentAssistant) {
      const fullText = currentAssistant.pre.textContent;
      // Add speak/copy buttons
      const actions = currentAssistant.div.querySelector(".msg-actions");
      if (!actions) {
        const actDiv = document.createElement("div");
        actDiv.className = "msg-actions";
        const btnSp = document.createElement("button");
        btnSp.className = "msg-action";
        btnSp.textContent = "🔊 speak";
        btnSp.onclick = () => speak(fullText);
        actDiv.appendChild(btnSp);
        currentAssistant.div.appendChild(actDiv);
      }
      // Auto-speak first 500 chars
      speak(fullText.substring(0, 500));
    }
    setBusy(false);
    currentAssistant = null;
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────
btnSettings.addEventListener("click", () => settingsPane.classList.add("open"));
btnCloseSet.addEventListener("click", () => settingsPane.classList.remove("open"));

btnSaveSet.addEventListener("click", () => {
  const keys = {
    anthropic_api_key: document.getElementById("keyAnthropic").value.trim(),
    xai_api_key: document.getElementById("keyXai").value.trim(),
    google_api_key: document.getElementById("keyGoogle").value.trim(),
    ollama_url: document.getElementById("ollamaUrl").value.trim(),
    master_wallet: document.getElementById("masterWallet").value.trim(),
  };
  chrome.storage.local.set(keys, () => {
    // Also send to background for immediate use
    chrome.runtime.sendMessage({ type: "SAVE_ALL_KEYS", keys });
    settingsPane.classList.remove("open");
    addMessage("system-msg", "✅ Settings saved.", "");
  });
});

// Load saved settings
chrome.storage.local.get(["anthropic_api_key","xai_api_key","google_api_key","ollama_url","master_wallet"], (data) => {
  if (data.anthropic_api_key) document.getElementById("keyAnthropic").value = data.anthropic_api_key;
  if (data.xai_api_key) document.getElementById("keyXai").value = data.xai_api_key;
  if (data.google_api_key) document.getElementById("keyGoogle").value = data.google_api_key;
  if (data.ollama_url) document.getElementById("ollamaUrl").value = data.ollama_url;
  if (data.master_wallet) document.getElementById("masterWallet").value = data.master_wallet;
});

// ── Controls ──────────────────────────────────────────────────────────────────
btnAttach.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "RUN_AGENT", message: "Attach to current tab and take a snapshot" });
  setBusy(true);
});

btnClear.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" });
  messages.innerHTML = "";
  taskQueue = [];
  renderTaskQueue();
  addMessage("system-msg", `🖤 History cleared. ${currentPersona.name} ready.`, "");
});

// Quick actions
document.querySelectorAll(".qa[data-msg]").forEach(btn => {
  btn.addEventListener("click", () => {
    msgInput.value = btn.dataset.msg;
    sendMessage();
  });
});

// ── Live ticker ───────────────────────────────────────────────────────────────
async function refreshTicker() {
  try {
    const CURVE  = "8n44wMUvYjMN9voayvAVpj6SMyPE8HtkULNT22Xi3vnr";
    const MASTER = "FS9nRSztc9eqiCUEJ1ESyGo9UXSh11Dm2PkEMSFS2Eft";
    const RPC    = "https://api.mainnet-beta.solana.com";
    const post   = (addr) => fetch(RPC, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getBalance",params:[addr]})
    }).then(r => r.json()).then(d => d.result.value / 1e9);

    const [curve, master] = await Promise.all([post(CURVE), post(MASTER)]);
    document.getElementById("curveVal").textContent = curve.toFixed(3) + " SOL";
    document.getElementById("curveProgress").textContent = ((curve/85)*100).toFixed(1)+"%";
    document.getElementById("masterBal").textContent = master.toFixed(4)+" SOL";
  } catch {}
}
refreshTicker();
setInterval(refreshTicker, 30000);

// ── Init ──────────────────────────────────────────────────────────────────────
applyPersona(DEFAULT_PERSONA);
