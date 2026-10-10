// Thin client for the RoamProxy member API + gateway.
// Everything billable goes through the user's own account: the token only
// unlocks their own proxy credentials and balance, nothing else.
import { fetch, ProxyAgent } from "undici";
import TurndownService from "turndown";

export const API_BASE = (process.env.ROAM_API_BASE || "https://member.roamproxy.com").replace(/\/+$/, "");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const PRODUCT_MARK = { residential: "", datacenter: "-dc", mobile: "-5g" };

export class RoamError extends Error {}

function clean(s, re, max) {
  return String(s || "").toLowerCase().replace(re, "").slice(0, max);
}

// The gateway wants state codes ("ca"); agents often say "California".
const US_STATES = Object.fromEntries(
  ("al alabama,ak alaska,az arizona,ar arkansas,ca california,co colorado,ct connecticut,de delaware," +
    "dc districtofcolumbia,fl florida,ga georgia,hi hawaii,id idaho,il illinois,in indiana,ia iowa,ks kansas," +
    "ky kentucky,la louisiana,me maine,md maryland,ma massachusetts,mi michigan,mn minnesota,ms mississippi," +
    "mo missouri,mt montana,ne nebraska,nv nevada,nh newhampshire,nj newjersey,nm newmexico,ny newyork," +
    "nc northcarolina,nd northdakota,oh ohio,ok oklahoma,or oregon,pa pennsylvania,ri rhodeisland," +
    "sc southcarolina,sd southdakota,tn tennessee,tx texas,ut utah,vt vermont,va virginia,wa washington," +
    "wv westvirginia,wi wisconsin,wy wyoming")
    .split(",")
    .map((p) => p.split(" ").reverse()),
);

// Gateway username modifiers, same grammar as the member dashboard:
//   <user>[-dc|-5g][-country-xx[-state-yy[-city-zz]]][-session-id]
export function buildUsername(base, { product = "residential", country, state, city, session } = {}) {
  let u = base + (PRODUCT_MARK[product] ?? "");
  const cc = clean(country, /[^a-z]/g, 4);
  let st = clean(state, /[^a-z0-9]/g, 30);
  if (cc === "us") st = US_STATES[st] || st;
  st = st.slice(0, 12);
  const ci = clean(city, /[^a-z0-9]/g, 40);
  if (cc) {
    u += "-country-" + cc;
    if (st) {
      u += "-state-" + st;
      if (ci) u += "-city-" + ci;
    }
  }
  const sid = String(session || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
  if (sid) u += "-session-" + sid;
  return u;
}

// "user-session-ab12:pass@host:port" -> { user, pass, host, port }
export function parseProxyLine(line) {
  const at = line.lastIndexOf("@");
  const cred = line.slice(0, at);
  const colon = cred.indexOf(":");
  const [host, port] = line.slice(at + 1).split(":");
  return {
    user: cred.slice(0, colon).replace(/-session-[A-Za-z0-9]+$/, ""),
    pass: cred.slice(colon + 1),
    host,
    port: Number(port),
  };
}

export class Roam {
  // No token is not fatal at startup, so clients and directories can still
  // list the tools; each call then explains how to get one.
  constructor(token) {
    this.token = token;
    this.creds = null;
  }

  async _api(path, params = {}) {
    if (!this.token) throw new RoamError("ROAM_API_TOKEN is not set. Sign up at https://roamproxy.com, copy your API token from the member dashboard (API section), and set it in this MCP server's env.");
    const url = new URL(API_BASE + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
    const r = await fetch(url, { headers: { Authorization: "Bearer " + this.token } });
    let d;
    try {
      d = await r.json();
    } catch {
      throw new RoamError(`RoamProxy API returned HTTP ${r.status}`);
    }
    if (d.code !== 0) {
      const hint = d.code === 402 ? " Top up at https://member.roamproxy.com/wallet" : "";
      throw new RoamError(`RoamProxy API: ${d.msg}${hint}`);
    }
    return d;
  }

  async credentials() {
    if (!this.creds) {
      const d = await this._api("/api/get_ip_list", { token: this.token, qty: 1, format: "json" });
      this.creds = parseProxyLine(d.data[0]);
    }
    return this.creds;
  }

  account() {
    return this._api("/api/account");
  }

  async proxyUrl(opts = {}) {
    const c = await this.credentials();
    const scheme = opts.protocol === "socks5" ? "socks5" : "http";
    const user = buildUsername(c.user, opts);
    return {
      url: `${scheme}://${encodeURIComponent(user)}:${encodeURIComponent(c.pass)}@${c.host}:${c.port}`,
      host: c.host,
      port: c.port,
      username: user,
      password: c.pass,
    };
  }

  // Fetch a URL through the user's proxy. Runs locally: the request leaves
  // from this machine to the RoamProxy gateway, then out of a residential IP.
  async fetchVia(target, opts = {}) {
    const p = await this.proxyUrl({ ...opts, protocol: "http" });
    const agent = new ProxyAgent({
      uri: `http://${p.host}:${p.port}`,
      token: "Basic " + Buffer.from(`${p.username}:${p.password}`).toString("base64"),
    });
    const headers = { "user-agent": UA, "accept-language": "en-US,en;q=0.9", ...(opts.headers || {}) };
    try {
      const r = await fetch(target, {
        method: opts.method || "GET",
        headers,
        body: opts.body,
        dispatcher: agent,
        redirect: "follow",
        signal: AbortSignal.timeout(opts.timeoutMs || 30000),
      });
      return { status: r.status, url: r.url, contentType: r.headers.get("content-type") || "", buf: Buffer.from(await r.arrayBuffer()) };
    } finally {
      agent.close().catch(() => {});
    }
  }

  async exitIp(opts = {}) {
    try {
      const r = await this.fetchVia("https://ipinfo.io/json", { ...opts, timeoutMs: 20000 });
      const d = JSON.parse(r.buf.toString("utf8"));
      if (d.ip) return { ip: d.ip, city: d.city, region: d.region, country: d.country, org: d.org };
    } catch {}
    // Some upstream routes block ipinfo.io; fall back to IP only.
    const r = await this.fetchVia("https://api.ipify.org?format=json", { ...opts, timeoutMs: 20000 });
    return { ip: JSON.parse(r.buf.toString("utf8")).ip };
  }
}

const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
td.remove(["head", "script", "style", "noscript", "iframe", "svg"]);

export function renderBody({ buf, contentType }, format = "markdown") {
  const isText = /^text\/|json|xml|javascript/i.test(contentType) || contentType === "";
  if (!isText) return `[binary content: ${contentType}, ${buf.length} bytes]`;
  const s = buf.toString("utf8");
  if (format === "html" || !/html/i.test(contentType)) return s;
  if (format === "text") {
    return s
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n\n")
      .trim();
  }
  const title = (s.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim();
  return (title ? `Title: ${title}\n\n` : "") + td.turndown(s);
}
