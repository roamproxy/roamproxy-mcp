# RoamProxy MCP Server

[![npm](https://img.shields.io/npm/v/roamproxy-mcp)](https://www.npmjs.com/package/roamproxy-mcp) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

An [MCP](https://modelcontextprotocol.io) server that lets AI agents (Claude, Cursor, VS Code, Windsurf, …) browse the web through [RoamProxy](https://roamproxy.com/?utm_source=github&utm_medium=mcp) residential, datacenter and mobile IPs in 190+ countries.

Ask your agent things like:

- *"Open this product page from a US residential IP in Los Angeles and summarise the price."*
- *"Compare what google.de and google.fr show for 'running shoes'."*
- *"Give me a sticky UK proxy for Playwright."*
- *"How much balance is left on my RoamProxy account?"*

## Tools

| Tool | What it does |
|---|---|
| `fetch_url` | Fetch a URL through a proxy IP in the chosen country / state / city. Returns status + body as markdown, text or HTML. |
| `get_proxy` | Build a ready-to-use `http://` or `socks5://` proxy URL (plus Playwright config) for any geo, rotating or sticky. |
| `check_ip` | Show the exit IP, city, region and ISP for a geo/session, to verify targeting. |
| `account_status` | Wallet balance, per-GB prices, last 7 days of usage, rented static IPs. |

Geo options on every tool: `country` (`us`, `de`, `jp`…), `state` (`ca`, `ny`… or full US state names), `city` (`Los Angeles`), `session` (same id = same IP; omit to rotate), `product` (`residential` default, `datacenter`, `mobile`).

## Setup

1. Create an account at [roamproxy.com](https://roamproxy.com/?utm_source=github&utm_medium=mcp) and copy your **API token** from the member dashboard (**Rotating residential** page, API section).
2. Add the server to your client. Requires Node.js 20+.

**Claude Code**

```bash
claude mcp add roamproxy -e ROAM_API_TOKEN=your_token -- npx -y roamproxy-mcp
```

**Claude Desktop / Cursor / Windsurf** (`claude_desktop_config.json`, `~/.cursor/mcp.json`, …)

```json
{
  "mcpServers": {
    "roamproxy": {
      "command": "npx",
      "args": ["-y", "roamproxy-mcp"],
      "env": { "ROAM_API_TOKEN": "your_token" }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`)

```json
{
  "servers": {
    "roamproxy": {
      "command": "npx",
      "args": ["-y", "roamproxy-mcp"],
      "env": { "ROAM_API_TOKEN": "your_token" }
    }
  }
}
```

## Pricing

Traffic is billed to your RoamProxy wallet exactly as if you used the proxy directly — the MCP server itself is free and open source. Residential $2/GB (down to $1.20/GB with volume top-ups), datacenter $0.80/GB, balance never expires. See [pricing](https://roamproxy.com/?utm_source=github&utm_medium=mcp#pricing).

## How it works

`fetch_url` runs on your machine: the request goes to the RoamProxy gateway (`gw.roamproxy.com:41080`) and leaves from a residential IP in the location you asked for. Your token only unlocks your own proxy credentials and account info — it cannot top up, buy or change anything.

If a city has no stock the gateway falls back to the state, then the country, instead of failing; `check_ip` shows where you actually landed.

## Development

```bash
npm install
npm test                                  # offline unit tests
ROAM_API_TOKEN=... node test/e2e.mjs      # live check, uses a little traffic
```

## Related

- [proxy-examples](https://github.com/roamproxy/proxy-examples) — code samples for Python, Node, Go, curl
- [roamproxy-python](https://github.com/roamproxy/roamproxy-python) — Python SDK
- [proxyprobe](https://github.com/roamproxy/proxyprobe) — proxy checker CLI

MIT © Goldkeep Digital LLC
