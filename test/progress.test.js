import test from "node:test";
import assert from "node:assert/strict";
import { topicMastery, streak, heatmap, levelFor, planProgress } from "../server/progress.js";

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

test("mastery is 0 with no evidence", () => {
  const m = topicMastery({ quizzes: [], feynman: [], cards: [] }, "t");
  assert.equal(m.score, 0);
  assert.equal(m.level, "Novice");
});

test("mastery weights only the components that exist", () => {
  const data = {
    quizzes: [{ topicId: "t", percent: 80, at: iso(1) }],
    feynman: [{ topicId: "t", score: 60, at: iso(1) }],
    cards: [],
  };
  // (80*0.45 + 60*0.3) / 0.75 = 72
  assert.equal(topicMastery(data, "t").score, 72);
});

test("mastery uses the 3 most recent quizzes", () => {
  const data = {
    quizzes: [0, 100, 100, 100].map((percent, i) => ({ topicId: "t", percent, at: iso(10 - i) })),
    feynman: [],
    cards: [],
  };
  assert.equal(topicMastery(data, "t").score, 100);
});

test("streak counts consecutive days and tolerates not-yet-today", () => {
  assert.equal(streak([{ at: iso(0) }, { at: iso(1) }, { at: iso(2) }, { at: iso(4) }]), 3);
  assert.equal(streak([{ at: iso(1) }, { at: iso(2) }]), 2);
  assert.equal(streak([{ at: iso(3) }]), 0);
});

test("heatmap covers the requested window", () => {
  const h = heatmap([{ at: iso(0) }, { at: iso(0) }], 84);
  assert.equal(h.length, 84);
  assert.equal(h.at(-1).count, 2);
});

test("levels and plan progress", () => {
  assert.equal(levelFor(85), "Expert");
  assert.equal(levelFor(45), "Practitioner");
  assert.deepEqual(planProgress({ today: [{ done: true }], this_week: [{}, {}, { done: true }] }), { done: 2, total: 4, percent: 50 });
  assert.equal(planProgress(null), null);
});
