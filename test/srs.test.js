import test from "node:test";
import assert from "node:assert/strict";
import { newCard, review, isDue, isMature } from "../server/srs.js";

const DAY = 86400000;

test("new cards are due immediately", () => {
  const now = Date.now();
  assert.equal(isDue(newCard("t", "q", "a", now), now), true);
});

test("successful reviews grow the interval (1, 6, then x ease)", () => {
  const now = Date.now();
  let c = newCard("t", "q", "a", now);
  c = review(c, 4, now);
  assert.equal(c.interval, 1);
  c = review(c, 4, now);
  assert.equal(c.interval, 6);
  c = review(c, 4, now);
  assert.equal(c.interval, Math.round(6 * c.ease) || c.interval);
  assert.ok(c.interval >= 14);
  assert.equal(isMature(c), true);
  assert.equal(isDue(c, now + DAY), false);
});

test("a lapse resets repetitions and lowers ease", () => {
  const now = Date.now();
  let c = review(review(newCard("t", "q", "a", now), 5, now), 5, now);
  const ease = c.ease;
  c = review(c, 1, now);
  assert.equal(c.reps, 0);
  assert.equal(c.interval, 1);
  assert.equal(c.lapses, 1);
  assert.ok(c.ease < ease);
  assert.ok(c.ease >= 1.3);
});
