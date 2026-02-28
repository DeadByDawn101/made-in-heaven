// models.js — Multi-model API routing
// Supports: Claude, Grok (xAI), Gemini, local Ollama
// All normalized to a single interface

export const PROVIDERS = {
  claude: {
    id: "claude",
    name: "Claude",
    label: "Anthropic",
    models: ["claude-sonnet-4-6", "claude-opus-4-5", "claude-haiku-4-5"],
    defaultModel: "claude-sonnet-4-6",
    apiKeyName: "anthropic_api_key",
    color: "#CC7A00"
  },
  grok: {
    id: "grok",
    name: "Grok",
    label: "xAI",
    models: ["grok-4", "grok-3", "grok-3-mini"],
    defaultModel: "grok-3",
    apiKeyName: "xai_api_key",
    color: "#000000"
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    label: "Google",
    models: ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.0-flash-thinking"],
    defaultModel: "gemini-2.0-flash",
    apiKeyName: "google_api_key",
    color: "#4285F4"
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    label: "Local",
    models: ["llama3.3:70b", "llama3.2:11b", "mistral:7b", "deepseek-r1:70b", "qwen2.5-coder:72b"],
    defaultModel: "llama3.2:11b",
    apiKeyName: null,  // no API key needed
    color: "#00AA44",
    baseUrl: "http://localhost:11434"
  }
};

/**
 * Normalize a request to Claude format (tools, messages, system)
 * then route to the correct provider API
 */
export async function callModel({ provider, model, messages, system, tools, apiKeys, ollamaUrl }) {
  switch (provider) {
    case "claude":
      return callClaude({ model, messages, system, tools, apiKey: apiKeys.anthropic_api_key });
    case "grok":
      return callOpenAICompat({
        model, messages, system, tools,
        apiKey: apiKeys.xai_api_key,
        baseUrl: "https://api.x.ai/v1"
      });
    case "gemini":
      return callGemini({ model, messages, system, tools, apiKey: apiKeys.google_api_key });
    case "ollama":
      return callOpenAICompat({
        model, messages, system, tools,
        apiKey: "ollama",
        baseUrl: (ollamaUrl || "http://localhost:11434") + "/v1"
      });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Claude (native) ───────────────────────────────────────────────────────────
async function callClaude({ model, messages, system, tools, apiKey }) {
  const body = { model, max_tokens: 8192, messages };
  if (system) body.system = system;
  if (tools && tools.length > 0) body.tools = tools;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return normalizeClaude(data);
}

// ── OpenAI-compatible (Grok, Ollama) ─────────────────────────────────────────
async function callOpenAICompat({ model, messages, system, tools, apiKey, baseUrl }) {
  const oaiMessages = [];
  if (system) oaiMessages.push({ role: "system", content: system });
  // Convert Claude-format messages to OpenAI format
  for (const m of messages) {
    if (m.role === "user" && typeof m.content === "string") {
      oaiMessages.push({ role: "user", content: m.content });
    } else if (m.role === "assistant" && Array.isArray(m.content)) {
      // Extract text from Claude content blocks
      const text = m.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      if (text) oaiMessages.push({ role: "assistant", content: text });
    } else if (m.role === "user" && Array.isArray(m.content)) {
      // Tool results — convert to text for non-Claude providers
      const text = m.content
        .filter(b => b.type === "tool_result")
        .map(b => `Tool result: ${b.content}`)
        .join("\n");
      if (text) oaiMessages.push({ role: "user", content: text });
    } else if (m.role === "user") {
      oaiMessages.push({ role: "user", content: String(m.content) });
    }
  }

  const body = { model, messages: oaiMessages, max_tokens: 4096 };
  // Tools support for Grok (OpenAI-compatible format)
  if (tools && tools.length > 0 && baseUrl.includes("x.ai")) {
    body.tools = tools.map(t => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema }
    }));
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return normalizeOpenAI(data);
}

// ── Gemini ────────────────────────────────────────────────────────────────────
async function callGemini({ model, messages, system, apiKey }) {
  // Convert to Gemini format
  const contents = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const text = typeof m.content === "string"
      ? m.content
      : (Array.isArray(m.content) ? m.content.filter(b => b.type === "text").map(b => b.text).join("\n") : "");
    if (text) contents.push({ role, parts: [{ text }] });
  }

  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return normalizeGemini(data);
}

// ── Normalize responses to unified format ────────────────────────────────────
function normalizeClaude(data) {
  return {
    content: data.content || [],
    stopReason: data.stop_reason,
    usage: data.usage
  };
}

function normalizeOpenAI(data) {
  const choice = data.choices?.[0];
  const msg = choice?.message || {};
  const content = [];

  if (msg.content) content.push({ type: "text", text: msg.content });

  // Handle tool calls
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || "{}")
      });
    }
  }

  return {
    content,
    stopReason: choice?.finish_reason === "stop" ? "end_turn" : choice?.finish_reason,
    usage: data.usage
  };
}

function normalizeGemini(data) {
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts.map(p => p.text || "").join("");
  return {
    content: text ? [{ type: "text", text }] : [],
    stopReason: "end_turn",
    usage: {}
  };
}
