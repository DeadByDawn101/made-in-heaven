/**
 * Spark Intelligence Integration for Made in Heaven
 * ===================================================
 * Connects MIH to the Spark self-evolving intelligence runtime.
 * Spark watches every tool call, learns from outcomes, and surfaces
 * advisory context before the next trade decision.
 *
 * Setup: https://github.com/DeadByDawn101/vibeship-spark-intelligence
 * Chip:  chips/ravenx-degen/chip.yaml
 *
 * Author: Camila Prime — RavenX AI CFO/CTO
 */

import fetch from "node-fetch";

const SPARKD_URL = process.env.SPARKD_URL || "http://127.0.0.1:8787";
const SPARK_TOKEN = process.env.SPARK_TOKEN || "";

// ─── helpers ────────────────────────────────────────────────────────────────

async function sparkRequest(path, body) {
  const headers = { "Content-Type": "application/json" };
  if (SPARK_TOKEN) headers["Authorization"] = `Bearer ${SPARK_TOKEN}`;
  try {
    const res = await fetch(`${SPARKD_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      timeout: 5000,
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message, offline: true };
  }
}

async function sparkGet(path) {
  const headers = {};
  if (SPARK_TOKEN) headers["Authorization"] = `Bearer ${SPARK_TOKEN}`;
  try {
    const res = await fetch(`${SPARKD_URL}${path}`, { headers, timeout: 5000 });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message, offline: true };
  }
}

// ─── tool definitions ────────────────────────────────────────────────────────

export const sparkTools = [
  {
    name: "spark_ingest_event",
    description:
      "Send a tool call event to Spark Intelligence for learning. Call after any significant MIH operation (trade, DD, wallet scan) to feed Spark's learning pipeline. Spark is offline-safe — fails silently if not running.",
    input_schema: {
      type: "object",
      properties: {
        event_type: {
          type: "string",
          description:
            "Type of event: trade_executed | dd_completed | wallet_scanned | launch_fired | curve_checked | rug_detected",
          enum: [
            "trade_executed",
            "dd_completed",
            "wallet_scanned",
            "launch_fired",
            "curve_checked",
            "rug_detected",
            "graduation_achieved",
            "error_occurred",
          ],
        },
        context: {
          type: "object",
          description:
            "Event context. For trades: {token_ca, sol_in, outcome, price_impact}. For DD: {token_ca, degen_score, verdict, red_flags}. For curves: {token_ca, sol_amount, percentage}.",
        },
        outcome: {
          type: "string",
          description: "Outcome so far: success | failure | unknown | pending",
          enum: ["success", "failure", "unknown", "pending"],
        },
        notes: {
          type: "string",
          description: "Optional human-readable notes about what happened",
        },
      },
      required: ["event_type", "context"],
    },
  },
  {
    name: "spark_get_advisory",
    description:
      "Get Spark's learned advisory context before a trade or analysis. Returns distilled insights from past sessions relevant to current action. Use before executing swaps, launching tokens, or making DD decisions.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "What you're about to do: buy_token | launch_token | wallet_check | dd_token | bundle_launch",
        },
        context: {
          type: "object",
          description:
            "Context about the action: {token_ca, sol_amount, market_cap, curve_pct} etc.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "spark_get_learnings",
    description:
      "Query what Spark has learned from past degen sessions. Returns top insights, promoted patterns, and EIDOS distillations from the ravenx-degen chip. Use to understand what patterns have emerged.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description:
            "Filter by category: reasoning | wisdom | context | self_awareness | all",
          enum: ["reasoning", "wisdom", "context", "self_awareness", "all"],
          default: "all",
        },
        limit: {
          type: "number",
          description: "Max learnings to return (default 10)",
          default: 10,
        },
      },
      required: [],
    },
  },
  {
    name: "spark_health",
    description:
      "Check if the Spark Intelligence runtime is running and healthy. Returns pipeline status, queue depth, and insight counts. Use to verify Spark is active before a session.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ─── handlers ────────────────────────────────────────────────────────────────

export async function handleSparkTool(toolName, toolInput) {
  switch (toolName) {
    case "spark_ingest_event": {
      const { event_type, context, outcome = "unknown", notes } = toolInput;

      const event = {
        schema: "SparkEventV1",
        source: "made-in-heaven",
        chip: "ravenx-degen",
        event_type,
        context,
        outcome,
        notes,
        timestamp: new Date().toISOString(),
      };

      const result = await sparkRequest("/ingest", { events: [event] });

      if (result.offline) {
        return {
          status: "offline",
          message:
            "Spark not running — event not captured. Start with: python -m spark.cli up",
          event_type,
        };
      }

      return {
        status: "ingested",
        event_type,
        spark_response: result,
        message: `Event sent to Spark pipeline — ${event_type} captured for learning`,
      };
    }

    case "spark_get_advisory": {
      const { action, context = {} } = toolInput;

      const result = await sparkRequest("/advisory", {
        action,
        context,
        chip: "ravenx-degen",
        source: "made-in-heaven",
      });

      if (result.offline) {
        return {
          status: "offline",
          advisory: null,
          message: "Spark offline — no advisory available. Proceeding without learned context.",
        };
      }

      return {
        status: "ok",
        action,
        advisory: result.advisory || result,
        message: result.advisory
          ? `Spark advisory loaded for: ${action}`
          : "No advisory available yet — Spark is still learning from sessions",
      };
    }

    case "spark_get_learnings": {
      const { category = "all", limit = 10 } = toolInput;

      const result = await sparkGet(
        `/learnings?chip=ravenx-degen&category=${category}&limit=${limit}`
      );

      if (result.offline) {
        return {
          status: "offline",
          learnings: [],
          message: "Spark offline — no learnings available.",
        };
      }

      const learnings = result.learnings || result.insights || result;
      return {
        status: "ok",
        category,
        count: Array.isArray(learnings) ? learnings.length : 0,
        learnings,
        message: `Spark learnings loaded — ${Array.isArray(learnings) ? learnings.length : 0} insights from ravenx-degen chip`,
      };
    }

    case "spark_health": {
      const result = await sparkGet("/health");

      if (result.offline) {
        return {
          status: "offline",
          healthy: false,
          message:
            "Spark not running. Start with: python -m spark.cli up\nDocs: github.com/DeadByDawn101/vibeship-spark-intelligence",
        };
      }

      return {
        status: "ok",
        healthy: true,
        pipeline: result,
        message: "Spark Intelligence runtime is healthy",
      };
    }

    default:
      return { error: `Unknown Spark tool: ${toolName}` };
  }
}
