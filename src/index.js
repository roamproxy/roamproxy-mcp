#!/usr/bin/env node
// RoamProxy MCP server: lets an AI agent use your RoamProxy residential /
// datacenter / mobile proxies. Traffic is billed to your own wallet as usual.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Roam, RoamError, renderBody } from "./roam.js";

const VERSION = "0.1.0";
const roam = new Roam(process.env.ROAM_API_TOKEN);

const geo = {
  country: z.string().optional().describe("ISO 3166-1 alpha-2 country code, e.g. 'us', 'de', 'jp'. Omit for any country."),
  state: z.string().optional().describe("State/region code, e.g. 'ca', 'ny', 'tx' (US full names like 'California' are also accepted). Requires country."),
  city: z.string().optional().describe("City name, e.g. 'Los Angeles'. Requires country and state. If the city has no stock the gateway falls back to the state, then the country; check_ip shows where you landed."),
  session: z.string().optional().describe("Sticky session id (letters/digits). Same id = same exit IP for a while. Omit to rotate the IP on every request."),
  product: z.enum(["residential", "datacenter", "mobile"]).optional().describe("Proxy pool. Default residential."),
};

function ok(obj) {
  return { content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] };
}

function guard(fn) {
  return async (args) => {
    try {
      return await fn(args);
    } catch (e) {
      const msg = e instanceof RoamError ? e.message : `Request failed: ${e.cause?.message || e.message}`;
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  };
}

const server = new McpServer({ name: "roamproxy", version: VERSION });

server.registerTool(
  "fetch_url",
  {
    title: "Fetch a URL through a RoamProxy IP",
    description:
      "Fetch a web page or API through a RoamProxy residential (or datacenter/mobile) IP in the chosen country/city. " +
      "Returns HTTP status and the body as markdown (default), plain text or raw HTML. Traffic is billed to the user's RoamProxy wallet.",
    inputSchema: {
      url: z.string().url().describe("http(s) URL to fetch"),
      ...geo,
      method: z.enum(["GET", "POST", "HEAD"]).optional().describe("Default GET"),
      headers: z.record(z.string(), z.string()).optional().describe("Extra request headers"),
      body: z.string().optional().describe("Request body for POST"),
      format: z.enum(["markdown", "text", "html"]).optional().describe("How to return HTML pages. Default markdown."),
      max_chars: z.number().int().min(500).max(200000).optional().describe("Truncate the body to this many characters. Default 20000."),
    },
  },
  guard(async (a) => {
    if (!/^https?:\/\//i.test(a.url)) throw new RoamError("Only http(s) URLs are supported.");
    const r = await roam.fetchVia(a.url, a);
    const max = a.max_chars || 20000;
    let body = a.method === "HEAD" ? "" : renderBody(r, a.format);
    const truncated = body.length > max;
    if (truncated) body = body.slice(0, max);
    const head = `HTTP ${r.status} · ${r.url} · ${r.contentType || "unknown type"} · ${r.buf.length} bytes${truncated ? ` · truncated to ${max} chars` : ""}`;
    return ok(head + "\n\n" + body);
  }),
);

server.registerTool(
  "get_proxy",
  {
    title: "Get a RoamProxy connection string",
    description:
      "Build a ready-to-use proxy URL (http:// or socks5://user:pass@host:port) for the chosen country/city/session, " +
      "to plug into Playwright, Puppeteer, curl, requests, Scrapy, an antidetect browser, etc.",
    inputSchema: {
      ...geo,
      protocol: z.enum(["http", "socks5"]).optional().describe("Default http. Both use the same gateway port."),
    },
  },
  guard(async (a) => {
    const p = await roam.proxyUrl(a);
    return ok({
      proxy_url: p.url,
      host: p.host,
      port: p.port,
      username: p.username,
      password: p.password,
      mode: a.session ? "sticky" : "rotating (new IP per connection)",
      playwright: { server: `${a.protocol === "socks5" ? "socks5" : "http"}://${p.host}:${p.port}`, username: p.username, password: p.password },
    });
  }),
);

server.registerTool(
  "check_ip",
  {
    title: "Check the exit IP",
    description: "Make one small request through the proxy and report the exit IP, city, country and ISP/ASN. Useful to verify geo-targeting before a job.",
    inputSchema: geo,
  },
  guard(async (a) => ok(await roam.exitIp(a))),
);

server.registerTool(
  "account_status",
  {
    title: "RoamProxy account status",
    description: "Show wallet balance (USD), per-GB prices, traffic used in the last 7 days (UTC days), and rented static IPs with their proxy URLs and expiry.",
    inputSchema: {},
  },
  guard(async () => {
    const d = await roam.account();
    delete d.code;
    delete d.msg;
    return ok(d);
  }),
);

await server.connect(new StdioServerTransport());
