// End-to-end API test in mock mode (no network, no API key).
import test from "node:test";
import assert from "node:assert/strict";

process.env.LUMINARY_MOCK = "1";
const { createApp } = await import("../server/index.js");
const { Store } = await import("../server/store.js");

const app = createApp(new Store(null));
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;
test.after(() => server.close());

async function call(path, method = "GET", body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text && res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text };
}

test("full learning loop", async () => {
  const created = await call("/topics", "POST", { name: "Photosynthesis" });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.depthMap.layers.length, 5);

  const topics = await call("/topics");
  assert.equal(topics.body.length, 1);

  // flashcards were generated from the depth map and are due
  const due = await call(`/review?topicId=${id}`);
  assert.ok(due.body.length >= 3);
  const reviewed = await call(`/cards/${due.body[0].id}/review`, "POST", { grade: 5 });
  assert.equal(reviewed.body.reps, 1);

  // streaming chat
  const chat = await call(`/chat/${id}`, "POST", { message: "Why is it green?", mode: "socratic" });
  assert.match(chat.body, /data: \{"type":"text"/);
  assert.match(chat.body, /"type":"done"/);
  const history = await call(`/chat/${id}`);
  assert.equal(history.body.length, 2);

  // action plan + task tracking
  const plan = await call(`/topics/${id}/plan`, "POST", { goal: "Ace biology", minutesPerDay: 20 });
  assert.ok(plan.body.today.length > 0);
  const toggled = await call(`/topics/${id}/plan/task`, "PATCH", { list: "today", index: 0, done: true });
  assert.equal(toggled.body.progress.done, 1);

  // quiz: answers are withheld until submission
  const quiz = await call(`/topics/${id}/quiz`, "POST", { difficulty: "easy", count: 3 });
  assert.equal(quiz.body.questions[0].answer_index, undefined);
  const graded = await call(`/quiz/${quiz.body.quizId}/submit`, "POST", { answers: [0, 1, "Because plants make food"] });
  assert.equal(graded.status, 200);
  assert.equal(graded.body.percent, Math.round(((1 + 0 + 0.7) / 3) * 100));
  assert.ok(graded.body.weakConcepts.includes("Learning strategy"));
  const again = await call(`/quiz/${quiz.body.quizId}/submit`, "POST", { answers: [] });
  assert.equal(again.status, 404);

  // Feynman teach-back
  const tooShort = await call(`/topics/${id}/feynman`, "POST", { explanation: "Plants eat light." });
  assert.equal(tooShort.status, 400);
  const fey = await call(`/topics/${id}/feynman`, "POST", {
    explanation: "Plants take sunlight, water and carbon dioxide and turn them into sugar they can use as food, releasing oxygen as a leftover. The green stuff, chlorophyll, catches the light.",
  });
  assert.equal(fey.body.score, Math.round((72 + 80 + 60) / 3));
  assert.ok(fey.body.mastery.score > 0);

  // progress + coach
  const progress = await call("/progress");
  assert.equal(progress.body.streak, 1);
  assert.ok(progress.body.totalActivities >= 6);
  assert.equal(progress.body.topics[0].mastery.counts.quizzes, 1);
  const coach = await call("/coach", "POST");
  assert.ok(coach.body.headline);

  // general (topic-less) chat
  const general = await call("/chat/general", "POST", { message: "How do magnets work?" });
  assert.match(general.body, /"type":"done"/);

  // delete cascades
  assert.equal((await call(`/topics/${id}`, "DELETE")).status, 204);
  assert.equal((await call("/review")).body.length, 0);
});

test("validation errors are reported as JSON", async () => {
  assert.equal((await call("/topics", "POST", {})).status, 400);
  assert.equal((await call("/topics", "POST", { name: "x".repeat(500) })).status, 400);
  assert.equal((await call("/topics/nope")).status, 404);
  assert.equal((await call("/cards/nope/review", "POST", { grade: 3 })).status, 404);
  assert.equal((await call("/nope")).status, 404);
});
