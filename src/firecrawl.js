/**
 * Firecrawl tools for Made in Heaven
 * Self-host or cloud API compatible wrappers
 */

const FIRECRAWL_API_URL = (process.env.FIRECRAWL_API_URL || "http://127.0.0.1:3002").replace(/\/$/, "");
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || "";

async function fc(path, body = {}) {
  const headers = { "Content-Type": "application/json" };
  if (FIRECRAWL_API_KEY) headers["Authorization"] = `Bearer ${FIRECRAWL_API_KEY}`;

  const res = await fetch(`${FIRECRAWL_API_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    throw new Error(`Firecrawl ${path} failed (${res.status}): ${text.slice(0, 400)}`);
  }

  return json;
}

export const FIRECRAWL_TOOLS = [
  {
    name: "firecrawl_scrape",
    description: "Scrape a single URL and return clean content (markdown/html/raw).",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target URL" },
        formats: {
          type: "array",
          items: { type: "string", enum: ["markdown", "html", "rawHtml", "links", "screenshot"] },
          description: "Output formats",
          default: ["markdown"],
        },
      },
      required: ["url"],
    },
  },
  {
    name: "firecrawl_crawl",
    description: "Crawl a site and return job info/results for multi-page extraction.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Base URL to crawl" },
        limit: { type: "number", description: "Max pages", default: 20 },
        scrapeOptions: {
          type: "object",
          properties: {
            formats: {
              type: "array",
              items: { type: "string", enum: ["markdown", "html", "rawHtml", "links"] },
              default: ["markdown"],
            },
          },
        },
      },
      required: ["url"],
    },
  },
  {
    name: "firecrawl_search",
    description: "Web search via Firecrawl and return extraction-ready results.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "firecrawl_extract",
    description: "Run Firecrawl extract against URLs with a prompt/schema objective.",
    input_schema: {
      type: "object",
      properties: {
        urls: { type: "array", items: { type: "string" }, description: "Target URLs" },
        prompt: { type: "string", description: "Extraction objective" },
      },
      required: ["urls", "prompt"],
    },
  },
];

export async function handleFirecrawlTool(name, args = {}) {
  switch (name) {
    case "firecrawl_scrape":
      return fc("/v1/scrape", {
        url: args.url,
        formats: args.formats || ["markdown"],
      });

    case "firecrawl_crawl":
      return fc("/v1/crawl", {
        url: args.url,
        limit: args.limit ?? 20,
        scrapeOptions: args.scrapeOptions || { formats: ["markdown"] },
      });

    case "firecrawl_search":
      return fc("/v1/search", {
        query: args.query,
        limit: args.limit ?? 5,
      });

    case "firecrawl_extract":
      return fc("/v1/extract", {
        urls: args.urls,
        prompt: args.prompt,
      });

    default:
      throw new Error(`Unknown Firecrawl tool: ${name}`);
  }
}
