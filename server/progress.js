// Turns raw learning records into measurable progress: mastery per topic,
// streaks, activity heatmap and what to do next.
import { isDue, isMature } from "./srs.js";

const WEIGHTS = { quiz: 0.45, feynman: 0.3, retention: 0.25 };

export const LEVELS = [
  { min: 0, name: "Novice" },
  { min: 20, name: "Apprentice" },
  { min: 40, name: "Practitioner" },
  { min: 60, name: "Proficient" },
  { min: 80, name: "Expert" },
];

export function levelFor(score) {
  return [...LEVELS].reverse().find((l) => score >= l.min).name;
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const recent = (xs, n = 3) =>
  [...xs].sort((a, b) => a.at.localeCompare(b.at)).slice(-n);

export function topicMastery(data, topicId, now = Date.now()) {
  const quizzes = data.quizzes.filter((q) => q.topicId === topicId);
  const feynman = data.feynman.filter((f) => f.topicId === topicId);
  const cards = data.cards.filter((c) => c.topicId === topicId);

  const components = {
    quiz: avg(recent(quizzes).map((q) => q.percent)),
    feynman: avg(recent(feynman).map((f) => f.score)),
    retention: cards.length
      ? (cards.filter(isMature).length / cards.length) * 100
      : null,
  };

  let total = 0;
  let weight = 0;
  for (const [key, value] of Object.entries(components)) {
    if (value == null) continue;
    total += value * WEIGHTS[key];
    weight += WEIGHTS[key];
  }
  const score = weight ? Math.round(total / weight) : 0;

  return {
    score,
    level: levelFor(score),
    components: Object.fromEntries(
      Object.entries(components).map(([k, v]) => [k, v == null ? null : Math.round(v)]),
    ),
    counts: {
      quizzes: quizzes.length,
      feynman: feynman.length,
      cards: cards.length,
      dueCards: cards.filter((c) => isDue(c, now)).length,
    },
  };
}

export function dayKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Consecutive days with at least one learning activity, ending today
// (or yesterday, so the streak isn't "lost" before you've studied today).
export function streak(activity, now = Date.now()) {
  const days = new Set(activity.map((a) => dayKey(a.at)));
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function heatmap(activity, days = 84, now = Date.now()) {
  const counts = {};
  for (const a of activity) {
    const k = dayKey(a.at);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const out = [];
  const cursor = new Date(now);
  cursor.setDate(cursor.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const k = dayKey(cursor);
    out.push({ day: k, count: counts[k] ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function overview(data, now = Date.now()) {
  const topics = data.topics.map((t) => ({
    id: t.id,
    name: t.name,
    mastery: topicMastery(data, t.id, now),
    planProgress: planProgress(t.plan),
  }));
  const scores = topics.map((t) => t.mastery.score);
  return {
    streak: streak(data.activity, now),
    totalActivities: data.activity.length,
    averageMastery: scores.length ? Math.round(avg(scores)) : 0,
    dueCards: data.cards.filter((c) => isDue(c, now)).length,
    topics,
    heatmap: heatmap(data.activity, 84, now),
    quizHistory: recent(data.quizzes, 20).map((q) => ({
      topicId: q.topicId,
      percent: q.percent,
      at: q.at,
    })),
  };
}

export function planProgress(plan) {
  if (!plan) return null;
  const tasks = [...(plan.today ?? []), ...(plan.this_week ?? [])];
  if (!tasks.length) return null;
  const done = tasks.filter((t) => t.done).length;
  return { done, total: tasks.length, percent: Math.round((done / tasks.length) * 100) };
}

// Compact text snapshot fed to Claude so its guidance adapts to the learner.
export function learnerSnapshot(data, topicId, now = Date.now()) {
  const topic = data.topics.find((t) => t.id === topicId);
  if (!topic) return "";
  const m = topicMastery(data, topicId, now);
  const lastQuiz = recent(data.quizzes.filter((q) => q.topicId === topicId), 1)[0];
  const lastFeynman = recent(data.feynman.filter((f) => f.topicId === topicId), 1)[0];
  const lines = [
    `Topic: ${topic.name}`,
    `Mastery: ${m.score}/100 (${m.level})`,
    `Quiz avg (recent): ${m.components.quiz ?? "none yet"}`,
    `Feynman avg (recent): ${m.components.feynman ?? "none yet"}`,
    `Flashcard retention: ${m.components.retention ?? "no cards"}%, ${m.counts.dueCards} due`,
  ];
  if (lastQuiz?.weakConcepts?.length) lines.push(`Weak concepts from last quiz: ${lastQuiz.weakConcepts.join(", ")}`);
  if (lastFeynman?.gaps?.length) lines.push(`Gaps from last Feynman attempt: ${lastFeynman.gaps.join("; ")}`);
  const pp = planProgress(topic.plan);
  if (pp) lines.push(`Action plan: ${pp.done}/${pp.total} tasks done. Goal: ${topic.plan.goal_restated}`);
  lines.push(`Current streak: ${streak(data.activity, now)} days`);
  return lines.join("\n");
}
