/**
 * Made in Heaven — Model-Agnostic Memory System 🖤
 *
 * Inspired by Claude Code's memory architecture:
 * - MEMORY.md     → curated long-term (what the agent learned permanently)
 * - YYYY-MM-DD.md → daily operational log (session-by-session)
 * - task-index.json → searchable index of past tasks + outcomes
 *
 * This is model-agnostic: works with Claude, Grok, GPT, or any LLM.
 * The agent reads memory on startup, writes learnings after each task.
 *
 * Memory hierarchy (loaded in order, most specific wins):
 *   1. memory/MEMORY.md         — curated permanent knowledge
 *   2. memory/YYYY-MM-DD.md     — today's session log
 *   3. memory/sites/<host>.md   — site-specific knowledge (auth flows, selectors)
 *   4. memory/task-index.json   — index of past tasks for deduplication
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const MEM_DIR = join(__dir, "../memory");
const MAX_MEMORY_LINES = 200; // match Claude Code's 200-line limit

// ── Init ──────────────────────────────────────────────────────────────────────

export function initMemory() {
  mkdirSync(MEM_DIR, { recursive: true });
  mkdirSync(join(MEM_DIR, "sites"), { recursive: true });
  if (!existsSync(join(MEM_DIR, "MEMORY.md"))) {
    writeFileSync(join(MEM_DIR, "MEMORY.md"), `# Made in Heaven — Long-Term Memory 🖤\n\n*Curated learnings. Max ${MAX_MEMORY_LINES} lines. Model-agnostic.*\n\n## Authenticated Sites\n_(populated automatically after first login)_\n\n## Learned Patterns\n_(populated automatically as agent discovers them)_\n`);
  }
  if (!existsSync(join(MEM_DIR, "task-index.json"))) {
    writeFileSync(join(MEM_DIR, "task-index.json"), JSON.stringify({ tasks: [] }, null, 2));
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function loadMemory(url = null) {
  initMemory();
  const sections = [];

  // 1. Long-term curated memory (first 200 lines)
  const memPath = join(MEM_DIR, "MEMORY.md");
  if (existsSync(memPath)) {
    const lines = readFileSync(memPath, "utf8").split("\n");
    const truncated = lines.slice(0, MAX_MEMORY_LINES).join("\n");
    if (truncated.trim().length > 100) {
      sections.push(`## Long-Term Memory\n${truncated}`);
    }
  }

  // 2. Today's session log (last 50 lines)
  const today = new Date().toISOString().split("T")[0];
  const dailyPath = join(MEM_DIR, `${today}.md`);
  if (existsSync(dailyPath)) {
    const lines = readFileSync(dailyPath, "utf8").split("\n");
    const recent = lines.slice(-50).join("\n");
    if (recent.trim()) {
      sections.push(`## Today's Session (${today})\n${recent}`);
    }
  }

  // 3. Site-specific memory (if URL provided)
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      const sitePath = join(MEM_DIR, "sites", `${host}.md`);
      if (existsSync(sitePath)) {
        sections.push(`## Site Knowledge: ${host}\n${readFileSync(sitePath, "utf8")}`);
      }
    } catch {}
  }

  if (sections.length === 0) return null;

  return `# Agent Memory\n\n${sections.join("\n\n---\n\n")}`;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export function logTask({ task, url, llm, steps, result, learned = [] }) {
  const today = new Date().toISOString().split("T")[0];
  const time  = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
  const dailyPath = join(MEM_DIR, `${today}.md`);

  const entry = [
    `\n## [${time}] ${task.slice(0, 80)}${task.length > 80 ? "…" : ""}`,
    `- **URL:** ${url || "n/a"}`,
    `- **LLM:** ${llm}  **Steps:** ${steps}`,
    result ? `- **Result:** ${result.slice(0, 300).replace(/\n/g, " ")}` : "",
    learned.length > 0 ? `- **Learned:**\n${learned.map(l => `  - ${l}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  appendFileSync(dailyPath, entry + "\n");
}

export function learnSite(url, knowledge) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const sitePath = join(MEM_DIR, "sites", `${host}.md`);
    const header = existsSync(sitePath) ? "" : `# ${host} — Agent Knowledge\n\n`;
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    appendFileSync(sitePath, `${header}\n## [${time}] ${new Date().toLocaleDateString()}\n${knowledge}\n`);
    console.log(`  🧠 Learned → memory/sites/${host}.md`);
  } catch {}
}

export function memorize(fact) {
  const memPath = join(MEM_DIR, "MEMORY.md");
  const time = new Date().toISOString().split("T")[0];
  appendFileSync(memPath, `\n- [${time}] ${fact}`);
  console.log(`  🧠 Memorized: ${fact.slice(0, 80)}`);
}

// ── Index ─────────────────────────────────────────────────────────────────────

export function indexTask({ task, url, success, summary }) {
  const indexPath = join(MEM_DIR, "task-index.json");
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  index.tasks.unshift({
    task: task.slice(0, 100),
    url,
    success,
    summary: summary?.slice(0, 200),
    at: new Date().toISOString(),
  });
  // Keep last 500 tasks
  index.tasks = index.tasks.slice(0, 500);
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

// ── System Prompt Injection ───────────────────────────────────────────────────
// Call this before constructing your LLM messages.
// Returns a memory block to prepend to the system prompt.

export function getMemoryBlock(taskUrl = null) {
  const mem = loadMemory(taskUrl);
  if (!mem) return "";
  return `\n\n<memory>\n${mem}\n</memory>\n\nUse the above memory to:
- Skip re-discovering things already learned
- Use known selectors/patterns for sites you've visited
- Build on past session context
- Auto-fill known credentials via Google Password Manager (check autofill first)`;
}
