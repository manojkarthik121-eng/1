import test from "node:test";
import assert from "node:assert/strict";

process.env.LUMINARY_MOCK = "1";
const { createApp } = await import("../server/index.js");
const { Store } = await import("../server/store.js");
const { createAuth } = await import("../server/auth.js");

const app = createApp(new Store(null), { password: "correct horse" });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const post = (path, body, cookie) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie && { cookie }) }, body: JSON.stringify(body) });

test("API is locked until you log in", async () => {
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.deepEqual(status, { authRequired: true, authenticated: false });
  const topics = await fetch(`${base}/api/topics`);
  assert.equal(topics.status, 401);
  assert.equal((await topics.json()).login, true);
  // pages and health checks stay public
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test("wrong password is rejected, right one grants a session cookie", async () => {
  assert.equal((await post("/api/login", { password: "nope" })).status, 401);
  const ok = await post("/api/login", { password: "correct horse" });
  assert.equal(ok.status, 200);
  const setCookie = ok.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  const cookie = setCookie.split(";")[0];

  const topics = await fetch(`${base}/api/topics`, { headers: { cookie } });
  assert.equal(topics.status, 200);
  const status = await (await fetch(`${base}/api/status`, { headers: { cookie } })).json();
  assert.equal(status.authenticated, true);
  assert.equal(status.mock, true);

  // a tampered cookie doesn't work
  const bad = await fetch(`${base}/api/topics`, { headers: { cookie: cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A")) } });
  assert.equal(bad.status, 401);
});

test("sessions expire and depend on the password", () => {
  const a = createAuth("pw1");
  const token = a.issue(0);
  assert.equal(a.valid(token, 1000), true);
  assert.equal(a.valid(token, 31 * 24 * 3600 * 1000), false);
  assert.equal(createAuth("pw2").valid(a.issue()), false);
  assert.equal(a.valid("garbage"), false);
  assert.equal(a.valid(undefined), false);
});

test("password guessing is rate limited", async () => {
  let last;
  for (let i = 0; i < 12; i++) last = await post("/api/login", { password: `guess${i}` });
  assert.equal(last.status, 429);
});
