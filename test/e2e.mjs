// Live end-to-end check against the real gateway (uses a little traffic).
// Usage: ROAM_API_TOKEN=... node test/e2e.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "e2e", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["src/index.js"], env: { ...process.env } }));

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

const show = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  let text = r.content[0].text.replace(/("password": ")[^"]+/g, "$1***").replace(/:\/\/([^:]+):[^@]+@/g, "://$1:***@");
  console.log(`\n== ${name} ${JSON.stringify(args)}${r.isError ? " [ERROR]" : ""}\n${text.slice(0, 700)}`);
};

await show("account_status", {});
await show("get_proxy", { country: "us", state: "ca", session: "e2e1" });
await show("check_ip", { country: "us", state: "California", city: "Los Angeles", session: "e2e2" });
await show("check_ip", { country: "de" });
await show("check_ip", { product: "datacenter", country: "us" });
await show("fetch_url", { url: "https://httpbin.org/headers", country: "gb", format: "text" });
await show("fetch_url", { url: "https://example.com/", country: "jp" });
await show("fetch_url", { url: "ftp://x", country: "jp" });
await client.close();
