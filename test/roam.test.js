import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUsername, parseProxyLine, renderBody, Roam } from "../src/roam.js";

test("buildUsername: geo chain and products", () => {
  assert.equal(buildUsername("roamabc"), "roamabc");
  assert.equal(buildUsername("roamabc", { country: "US" }), "roamabc-country-us");
  assert.equal(
    buildUsername("roamabc", { country: "us", state: "California", city: "Los Angeles", session: "job-1" }),
    "roamabc-country-us-state-ca-city-losangeles-session-job1",
  );
  assert.equal(buildUsername("u", { country: "us", state: "New York" }), "u-country-us-state-ny");
  assert.equal(buildUsername("u", { country: "gb", state: "england" }), "u-country-gb-state-england");
  assert.equal(buildUsername("roamabc", { product: "datacenter", country: "de" }), "roamabc-dc-country-de");
  assert.equal(buildUsername("roamabc", { product: "mobile" }), "roamabc-5g");
});

test("buildUsername: state/city ignored without parent level", () => {
  assert.equal(buildUsername("u", { state: "ca", city: "la" }), "u");
  assert.equal(buildUsername("u", { country: "us", city: "la" }), "u-country-us");
});

test("parseProxyLine strips session and keeps tricky passwords", () => {
  assert.deepEqual(parseProxyLine("roamabc-session-1a2b3c4d:p:a@ss@gw.roamproxy.com:41080"), {
    user: "roamabc",
    pass: "p:a@ss",
    host: "gw.roamproxy.com",
    port: 41080,
  });
});

test("renderBody formats", () => {
  const html = { buf: Buffer.from("<html><script>x()</script><h1>Hi</h1><p>a <b>b</b></p></html>"), contentType: "text/html" };
  assert.match(renderBody(html), /^# Hi/);
  assert.doesNotMatch(renderBody(html), /x\(\)/);
  assert.equal(renderBody(html, "text"), "Hi a b");
  assert.equal(renderBody({ buf: Buffer.from('{"a":1}'), contentType: "application/json" }), '{"a":1}');
  assert.match(renderBody({ buf: Buffer.alloc(10), contentType: "image/png" }), /binary content/);
});

test("missing token gives a helpful error, not a crash", async () => {
  await assert.rejects(new Roam("").account(), /ROAM_API_TOKEN is not set/);
});
