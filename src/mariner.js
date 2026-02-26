/**
 * Project Mariner — Autonomous Web Agent
 * Chrome DevTools MCP + Claude/Grok reasoning engine
 *
 * Usage:
 *   node src/mariner.js --task "Go to gmail.com and summarize my last 5 emails"
 *   node src/mariner.js --task "Research the top 5 Solana meme coins right now"
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Config ───────────────────────────────────────────────────────────────────

const CHROME_URL = process.env.CHROME_URL || "http://127.0.0.1:9222";
const MCP_BIN =
  process.env.MCP_BIN ||
  (process.env.HOME + "/.local/bin/chrome-devtools-mcp");
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_STEPS = parseInt(process.env.MAX_STEPS || "30");

// Parse --task from CLI args
const taskArg = process.argv.indexOf("--task");
const TASK =
  taskArg !== -1
    ? process.argv.slice(taskArg + 1).join(" ")
    : process.env.MARINER_TASK || "Take a screenshot of the current page";

// ── MCP Client ───────────────────────────────────────────────────────────────

async function createMCPClient() {
  const transport = new StdioClientTransport({
    command: MCP_BIN,
    args: ["--browserUrl", CHROME_URL, "--no-usage-statistics"],
  });

  const client = new Client(
    { name: "project-mariner", version: "0.1.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  return client;
}

async function listTools(client) {
  const { tools } = await client.listTools();
  return tools;
}

async function callTool(client, toolName, args) {
  const result = await client.callTool({ name: toolName, arguments: args });
  return result;
}

// ── Agent Loop ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Mariner, an autonomous web agent with full control of a real Chrome browser.

You have access to 28 Chrome DevTools MCP tools. The browser is already running and authenticated.

WORKFLOW:
1. Always start by calling take_snapshot() to see the current page state
2. Use UIDs from the snapshot to interact with elements (click, fill, etc.)
3. After any navigation or interaction, call take_snapshot() again to verify
4. Use evaluate_script() for complex data extraction
5. Use list_console_messages() to debug JavaScript errors
6. Use list_network_requests() to inspect API calls

RULES:
- Complete the task fully before stopping
- If something fails, try an alternative approach
- Use take_snapshot to confirm page state (avoid take_screenshot — it times out)
- Use evaluate_script to extract data that isn't in the a11y snapshot
- Be explicit about what you did and what you found
- Never ask for clarification — make your best judgment and execute

You are running with persistent auth — the user is already logged into Google, X, and other services.`;

async function runAgent(task) {
  console.log(`\n🖤 Project Mariner — Starting task:`);
  console.log(`   "${task}"\n`);

  // Connect to MCP
  console.log(`⚡ Connecting to Chrome DevTools MCP at ${CHROME_URL}...`);
  const client = await createMCPClient();
  const tools = await listTools(client);
  console.log(`✓ Connected — ${tools.length} tools available\n`);

  // Build Anthropic tools list from MCP tools
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));

  // Init Claude
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

  // Agent loop
  const messages = [{ role: "user", content: task }];
  let steps = 0;

  while (steps < MAX_STEPS) {
    steps++;
    console.log(`\n── Step ${steps}/${MAX_STEPS} ──────────────────────────────`);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: anthropicTools,
      messages,
    });

    // Add assistant response to history
    messages.push({ role: "assistant", content: response.content });

    // Check stop reason
    if (response.stop_reason === "end_turn") {
      const finalText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      console.log(`\n✓ Task complete:\n${finalText}`);
      break;
    }

    if (response.stop_reason !== "tool_use") {
      console.log(`\n⚠ Unexpected stop reason: ${response.stop_reason}`);
      break;
    }

    // Execute all tool calls
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      console.log(`  → ${block.name}(${JSON.stringify(block.input).slice(0, 120)})`);

      try {
        const result = await callTool(client, block.name, block.input);
        const resultText =
          result.content?.map((c) => c.text || JSON.stringify(c)).join("\n") ||
          JSON.stringify(result);

        const preview = resultText.slice(0, 200).replace(/\n/g, " ");
        console.log(`     ✓ ${preview}${resultText.length > 200 ? "..." : ""}`);

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultText,
        });
      } catch (err) {
        console.log(`     ✗ Error: ${err.message}`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: ${err.message}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  if (steps >= MAX_STEPS) {
    console.log(`\n⚠ Reached max steps (${MAX_STEPS}) — stopping`);
  }

  await client.close();
  console.log(`\n🖤 Mariner session complete\n`);
}

// ── Entry ────────────────────────────────────────────────────────────────────

runAgent(TASK).catch((err) => {
  console.error(`\n✗ Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
