import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";
import { newCard, review, isDue } from "./srs.js";
import { overview, topicMastery, learnerSnapshot, planProgress } from "./progress.js";
import { generateJSON, streamChat, uploadPdf, deleteFile, toAppError, AppError, MODEL, MOCK, WEB_SEARCH } from "./claude.js";
import * as P from "./prompts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

export function createApp(store) {
  const app = express();
  app.use(express.json({ limit: "256kb" }));
  app.use(express.static(path.join(root, "public")));
  app.get("/vendor/marked.js", (req, res) => res.sendFile(path.join(root, "node_modules/marked/lib/marked.umd.js")));
  app.get("/vendor/purify.js", (req, res) => res.sendFile(path.join(root, "node_modules/dompurify/dist/purify.js")));

  const pendingQuizzes = new Map();
  const MAX_PDF_BYTES = 32 * 1024 * 1024;
  const MAX_DOCS_PER_TOPIC = 5;
  const pdfBody = express.raw({ type: "application/pdf", limit: MAX_PDF_BYTES });

  // ---------- helpers ----------
  const text = (value, field, max = 4000, { required = true } = {}) => {
    if (value == null || value === "") {
      if (required) throw new AppError(400, `"${field}" is required`);
      return "";
    }
    if (typeof value !== "string") throw new AppError(400, `"${field}" must be a string`);
    const v = value.trim();
    if (required && !v) throw new AppError(400, `"${field}" is required`);
    if (v.length > max) throw new AppError(400, `"${field}" is too long (max ${max} characters)`);
    return v;
  };

  const topicOr404 = (id) => {
    const topic = store.getTopic(id);
    if (!topic) throw new AppError(404, "Topic not found");
    return topic;
  };

  // "general" is a topic-less conversation for questions about anything.
  const chatOwner = (id) => {
    if (id === "general") {
      store.data.general ??= { chat: [] };
      return { owner: store.data.general, topic: null };
    }
    const topic = topicOr404(id);
    return { owner: topic, topic };
  };

  // Validates an uploaded PDF body and pushes it to the Files API.
  const receivePdf = async (req) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) throw new AppError(400, "Upload a PDF file (Content-Type: application/pdf)");
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new AppError(400, "That file doesn't look like a PDF");
    const name = text(req.query.filename, "filename", 200, { required: false }).replace(/[\r\n]/g, " ") || "document.pdf";
    const file = await uploadPdf(buf, name);
    return { id: Store.id(), name, size: buf.length, fileId: file.id, at: new Date().toISOString() };
  };

  const buildDepthMap = (name, background, documents) =>
    generateJSON({
      kind: "depthMap",
      system: P.DEPTH_MAP_SYSTEM,
      prompt: P.depthMapPrompt(name, background, documents.map((d) => d.name)),
      schema: P.DEPTH_MAP_SCHEMA,
      documents,
      effort: "high",
    });

  const addFlashcards = (topicId, depthMap) => {
    const existing = new Set(store.data.cards.filter((c) => c.topicId === topicId).map((c) => c.front));
    for (const card of depthMap.flashcards ?? []) {
      if (existing.has(card.front)) continue;
      store.data.cards.push({ id: Store.id(), ...newCard(topicId, card.front, card.back) });
    }
  };

  const createTopicWithMap = async (name, background, documents = []) => {
    let depthMap;
    try {
      depthMap = await buildDepthMap(name, background, documents);
    } catch (err) {
      await Promise.all(documents.map((d) => deleteFile(d.fileId)));
      throw err;
    }
    const topic = store.createTopic(name);
    Object.assign(topic, { background, depthMap, documents });
    addFlashcards(topic.id, depthMap);
    store.log("explore", topic.id);
    return topic;
  };

  const topicSummary = (t) => ({
    id: t.id,
    name: t.name,
    title: t.depthMap?.title ?? t.name,
    oneLiner: t.depthMap?.one_liner ?? "",
    createdAt: t.createdAt,
    mastery: topicMastery(store.data, t.id),
    planProgress: planProgress(t.plan),
  });

  // ---------- status ----------
  app.get("/api/status", (req, res) => {
    res.json({ model: MODEL, mock: MOCK, webSearch: WEB_SEARCH, maxPdfBytes: MAX_PDF_BYTES });
  });

  // ---------- topics / explore ----------
  app.get("/api/topics", (req, res) => {
    res.json(store.listTopics().map(topicSummary));
  });

  app.post("/api/topics", async (req, res) => {
    const name = text(req.body.name, "name", 200);
    const background = text(req.body.background, "background", 1000, { required: false });
    const topic = await createTopicWithMap(name, background);
    res.status(201).json({ ...topic, mastery: topicMastery(store.data, topic.id) });
  });

  // Start a topic from a PDF: the depth map is built from the document.
  app.post("/api/topics/from-pdf", pdfBody, async (req, res) => {
    const doc = await receivePdf(req);
    const name = text(req.query.name, "name", 200, { required: false }) || doc.name.replace(/\.pdf$/i, "");
    const background = text(req.query.background, "background", 1000, { required: false });
    const topic = await createTopicWithMap(name, background, [doc]);
    res.status(201).json({ ...topic, mastery: topicMastery(store.data, topic.id) });
  });

  // ---------- documents attached to a topic ----------
  app.post("/api/topics/:id/documents", pdfBody, async (req, res) => {
    const topic = topicOr404(req.params.id);
    topic.documents ??= [];
    if (topic.documents.length >= MAX_DOCS_PER_TOPIC) throw new AppError(400, `A topic can have at most ${MAX_DOCS_PER_TOPIC} documents`);
    const doc = await receivePdf(req);
    topic.documents.push(doc);
    store.log("upload", topic.id, { name: doc.name });
    res.status(201).json(doc);
  });

  app.delete("/api/topics/:id/documents/:docId", async (req, res) => {
    const topic = topicOr404(req.params.id);
    const doc = (topic.documents ?? []).find((d) => d.id === req.params.docId);
    if (!doc) throw new AppError(404, "Document not found");
    topic.documents = topic.documents.filter((d) => d.id !== doc.id);
    store.save();
    await deleteFile(doc.fileId);
    res.status(204).end();
  });

  // Rebuild the depth map, e.g. after adding documents.
  app.post("/api/topics/:id/regenerate", async (req, res) => {
    const topic = topicOr404(req.params.id);
    const depthMap = await buildDepthMap(topic.name, topic.background, topic.documents ?? []);
    topic.depthMap = depthMap;
    addFlashcards(topic.id, depthMap);
    store.log("explore", topic.id);
    res.json({ ...topic, mastery: topicMastery(store.data, topic.id) });
  });

  app.get("/api/topics/:id", (req, res) => {
    const topic = topicOr404(req.params.id);
    res.json({ ...topic, mastery: topicMastery(store.data, topic.id) });
  });

  app.delete("/api/topics/:id", async (req, res) => {
    const topic = topicOr404(req.params.id);
    store.deleteTopic(req.params.id);
    await Promise.all((topic.documents ?? []).map((d) => deleteFile(d.fileId)));
    res.status(204).end();
  });

  // ---------- ask (streaming chat over SSE) ----------
  app.post("/api/chat/:id", async (req, res) => {
    const { owner, topic } = chatOwner(req.params.id);
    const message = text(req.body.message, "message", 8000);
    const mode = req.body.mode === "socratic" ? "socratic" : "guide";
    const webSearch = WEB_SEARCH && req.body.webSearch !== false;
    const documents = topic?.documents ?? [];

    const history = owner.chat.slice(-40).map(({ role, content }) => ({ role, content }));
    const messages = [...history, { role: "user", content: message }];
    const snapshot = topic ? learnerSnapshot(store.data, topic.id) : "";
    const system = P.chatSystem(mode, snapshot, { webSearch, hasDocuments: documents.length > 0 });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    const abort = new AbortController();
    res.on("close", () => abort.abort());

    try {
      const { text: reply, sources } = await streamChat({
        system,
        messages,
        documents,
        webSearch,
        signal: abort.signal,
        onText: (t) => send({ type: "text", text: t }),
        onSearch: (query) => send({ type: "search", query }),
      });
      if (sources.length) send({ type: "sources", sources });
      const at = new Date().toISOString();
      owner.chat.push({ role: "user", content: message, at }, { role: "assistant", content: reply, at, mode, sources });
      store.log("ask", topic?.id ?? null);
      send({ type: "done" });
    } catch (err) {
      if (!abort.signal.aborted) send({ type: "error", error: toAppError(err).message });
    }
    res.end();
  });

  app.get("/api/chat/:id", (req, res) => {
    res.json(chatOwner(req.params.id).owner.chat);
  });

  app.delete("/api/chat/:id", (req, res) => {
    chatOwner(req.params.id).owner.chat = [];
    store.save();
    res.status(204).end();
  });

  // ---------- act (action plan) ----------
  app.post("/api/topics/:id/plan", async (req, res) => {
    const topic = topicOr404(req.params.id);
    const goal = text(req.body.goal, "goal", 1000, { required: false });
    const level = text(req.body.level, "level", 100, { required: false });
    const minutesPerDay = Math.max(5, Math.min(480, Number(req.body.minutesPerDay) || 30));
    const recentChat = topic.chat
      .slice(-6)
      .map((m) => `${m.role}: ${m.content.slice(0, 600)}`)
      .join("\n");
    const plan = await generateJSON({
      kind: "plan",
      system: P.PLAN_SYSTEM,
      prompt: P.planPrompt({
        topic: topic.name,
        goal,
        level,
        minutesPerDay,
        snapshot: learnerSnapshot(store.data, topic.id),
        recentChat,
      }),
      schema: P.PLAN_SCHEMA,
      documents: topic.documents ?? [],
      effort: "high",
    });
    plan.createdAt = new Date().toISOString();
    plan.inputs = { goal, level, minutesPerDay };
    store.updateTopic(topic.id, { plan });
    store.log("plan", topic.id);
    res.json(plan);
  });

  app.patch("/api/topics/:id/plan/task", (req, res) => {
    const topic = topicOr404(req.params.id);
    const { list, index, done } = req.body;
    const tasks = topic.plan?.[list];
    if (!["today", "this_week"].includes(list) || !Array.isArray(tasks) || !tasks[index]) {
      throw new AppError(400, "Unknown task");
    }
    const wasDone = Boolean(tasks[index].done);
    tasks[index].done = Boolean(done);
    if (!wasDone && tasks[index].done) store.log("task", topic.id, { task: tasks[index].action });
    store.save();
    res.json({ plan: topic.plan, progress: planProgress(topic.plan) });
  });

  // ---------- practice: quiz ----------
  app.post("/api/topics/:id/quiz", async (req, res) => {
    const topic = topicOr404(req.params.id);
    const difficulty = ["easy", "medium", "hard"].includes(req.body.difficulty) ? req.body.difficulty : "medium";
    const count = Math.max(3, Math.min(10, Number(req.body.count) || 5));
    const quiz = await generateJSON({
      kind: "quiz",
      system: P.QUIZ_SYSTEM,
      prompt: P.quizPrompt({
        topic: topic.name,
        difficulty,
        count,
        snapshot: learnerSnapshot(store.data, topic.id),
      }),
      schema: P.QUIZ_SCHEMA,
      documents: topic.documents ?? [],
      effort: "medium",
    });
    const quizId = Store.id();
    pendingQuizzes.set(quizId, { topicId: topic.id, difficulty, questions: quiz.questions });
    res.json({
      quizId,
      difficulty,
      questions: quiz.questions.map(({ type, question, options, concept }) => ({ type, question, options, concept })),
    });
  });

  app.post("/api/quiz/:quizId/submit", async (req, res) => {
    const quiz = pendingQuizzes.get(req.params.quizId);
    if (!quiz) throw new AppError(404, "Quiz not found or already submitted");
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const topic = topicOr404(quiz.topicId);

    const results = quiz.questions.map((q, i) => {
      const answer = answers[i];
      if (q.type === "mcq") {
        const correct = Number(answer) === q.answer_index;
        return { ...q, answer, score: correct ? 1 : 0, feedback: correct ? "Correct!" : "Not quite." };
      }
      return { ...q, answer: typeof answer === "string" ? answer.slice(0, 4000) : "", score: 0, feedback: "" };
    });

    const shortOnes = results
      .map((r, i) => ({ ...r, i }))
      .filter((r) => r.type === "short");
    if (shortOnes.length) {
      const graded = await generateJSON({
        kind: "grade",
        system: P.QUIZ_SYSTEM,
        prompt: P.gradePrompt(topic.name, shortOnes),
        schema: P.GRADE_SCHEMA,
        effort: "medium",
        maxTokens: 16000,
      });
      for (const g of graded.results) {
        const target = shortOnes[g.index];
        if (!target) continue;
        results[target.i].score = Math.max(0, Math.min(1, g.score));
        results[target.i].feedback = g.feedback;
      }
    }

    const total = results.reduce((sum, r) => sum + r.score, 0);
    const percent = Math.round((total / results.length) * 100);
    const weakConcepts = [...new Set(results.filter((r) => r.score < 0.6).map((r) => r.concept))];
    pendingQuizzes.delete(req.params.quizId);
    store.add("quizzes", {
      topicId: topic.id,
      difficulty: quiz.difficulty,
      percent,
      questions: results.length,
      weakConcepts,
    });
    store.log("quiz", topic.id, { percent });
    res.json({ percent, weakConcepts, results, mastery: topicMastery(store.data, topic.id) });
  });

  // ---------- practice: Feynman technique ----------
  app.post("/api/topics/:id/feynman", async (req, res) => {
    const topic = topicOr404(req.params.id);
    const concept = text(req.body.concept, "concept", 300, { required: false });
    const explanation = text(req.body.explanation, "explanation", 8000);
    if (explanation.split(/\s+/).length < 15) {
      throw new AppError(400, "Write at least a few sentences - teaching it is the point!");
    }
    const feedback = await generateJSON({
      kind: "feynman",
      system: P.FEYNMAN_SYSTEM,
      prompt: P.feynmanPrompt(topic.name, concept, explanation),
      schema: P.FEYNMAN_SCHEMA,
      documents: topic.documents ?? [],
      effort: "high",
      maxTokens: 16000,
    });
    const score = Math.round((feedback.accuracy + feedback.clarity + feedback.completeness) / 3);
    store.add("feynman", { topicId: topic.id, concept, score, gaps: feedback.gaps });
    store.log("feynman", topic.id, { score });
    res.json({ ...feedback, score, mastery: topicMastery(store.data, topic.id) });
  });

  // ---------- practice: spaced repetition ----------
  app.get("/api/review", (req, res) => {
    const { topicId } = req.query;
    const now = Date.now();
    const due = store.data.cards
      .filter((c) => (!topicId || c.topicId === topicId) && isDue(c, now))
      .sort((a, b) => a.due.localeCompare(b.due));
    const names = Object.fromEntries(store.listTopics().map((t) => [t.id, t.name]));
    res.json(due.map((c) => ({ ...c, topicName: names[c.topicId] })));
  });

  app.post("/api/topics/:id/cards", (req, res) => {
    const topic = topicOr404(req.params.id);
    const card = { id: Store.id(), ...newCard(topic.id, text(req.body.front, "front", 1000), text(req.body.back, "back", 2000)) };
    store.data.cards.push(card);
    store.save();
    res.status(201).json(card);
  });

  app.post("/api/cards/:id/review", (req, res) => {
    const idx = store.data.cards.findIndex((c) => c.id === req.params.id);
    if (idx < 0) throw new AppError(404, "Card not found");
    const grade = Number(req.body.grade);
    if (!Number.isFinite(grade) || grade < 0 || grade > 5) throw new AppError(400, "grade must be 0-5");
    const card = review(store.data.cards[idx], grade);
    store.data.cards[idx] = card;
    store.log("review", card.topicId, { grade });
    res.json(card);
  });

  // ---------- progress & coaching ----------
  app.get("/api/progress", (req, res) => {
    res.json(overview(store.data));
  });

  app.post("/api/coach", async (req, res) => {
    const o = overview(store.data);
    if (!o.topics.length) {
      return res.json({
        headline: "Pick something you're curious about and explore it",
        insight: "You haven't started a topic yet. Every expert started with one question.",
        next_actions: [{ action: "Explore your first topic", why: "Everything starts here", topic: "", app_action: "explore", minutes: 10 }],
        technique: { name: "Curiosity-first learning", how_to_apply: "Write down 3 questions you genuinely want answered before you start reading." },
        encouragement: "The best time to start is now.",
      });
    }
    const summary = [
      `Streak: ${o.streak} days. Total activities: ${o.totalActivities}. Flashcards due: ${o.dueCards}.`,
      ...o.topics.map((t) => learnerSnapshot(store.data, t.id)),
      `Recent activity log: ${store.data.activity.slice(-15).map((a) => `${a.at.slice(0, 10)} ${a.type}`).join(", ")}`,
    ].join("\n\n");
    const advice = await generateJSON({
      kind: "coach",
      system: P.COACH_SYSTEM,
      prompt: P.coachPrompt(summary),
      schema: P.COACH_SCHEMA,
      effort: "medium",
      maxTokens: 16000,
    });
    res.json(advice);
  });

  // ---------- errors ----------
  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));
  app.use((err, req, res, next) => {
    // body-parser errors (too large, malformed JSON) carry a safe 4xx status.
    const e =
      err.type === "entity.too.large"
        ? new AppError(413, "That file is too large (max 32 MB)")
        : err.expose && err.status < 500
          ? new AppError(err.status, err.message)
          : toAppError(err);
    if (e.status >= 500) console.error(err);
    if (res.headersSent) return res.end();
    res.status(e.status).json({ error: e.message });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dataFile = process.env.LUMINARY_DATA || path.join(root, "data", "db.json");
  const store = new Store(dataFile);
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "127.0.0.1";
  createApp(store).listen(port, host, () => {
    console.log(`Luminary running at http://${host}:${port}  (model: ${MODEL}${MOCK ? ", DEMO MODE" : ""})`);
  });
}
