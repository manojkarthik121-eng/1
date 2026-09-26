// System prompts and JSON schemas for every learning feature.
// Schemas are used with structured outputs, so Claude's reply is guaranteed
// to match them.

const str = (description) => ({ type: "string", description });
const int = (description) => ({ type: "integer", description });
const num = (description) => ({ type: "number", description });
const arr = (items, description) => ({ type: "array", items, description });
const obj = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const TUTOR_PERSONA = `You are Luminary, a world-class tutor and learning coach.
Your job is to build genuine, durable understanding - not just hand over facts.
Principles:
- Start from what the learner already knows; connect new ideas to familiar ones.
- Explain the "why" and the underlying mechanism, not only the "what".
- Use concrete examples, vivid analogies and, where useful, small worked problems.
- Name common misconceptions explicitly and correct them.
- Be accurate. When something is uncertain, contested or beyond your knowledge, say so plainly.
- Be warm, direct and encouraging, never condescending.
- Format with Markdown: short paragraphs, headings and lists where they help. Use LaTeX-free plain notation for math.`;

// ---------- Explore: layered depth map ----------

export const DEPTH_MAP_SYSTEM = `${TUTOR_PERSONA}

You produce a "depth map": a layered explanation of a topic that takes a learner
from zero to expert-level intuition. Each layer must build on the previous one and
go genuinely deeper - not just longer. Explanations are Markdown.`;

export const depthMapPrompt = (topic, background) => `Build a depth map for: "${topic}"
${background ? `\nLearner background / goal: ${background}\n` : ""}
Requirements:
- layers: exactly 5, in order: "Intuition (explain like I'm 12)", "Foundations", "Working knowledge", "Advanced", "Expert frontier". Each explanation 120-250 words.
- first_principles: the 3-6 irreducible ideas everything else rests on.
- mental_models: 3-5 reusable ways of thinking about the topic.
- misconceptions: 3-5 common myths with the reality.
- analogies: 2-4 memorable analogies.
- connections: 3-5 links to other fields or topics and why they connect.
- prerequisites: what to know first (empty if none).
- big_questions: 3-5 deep questions worth pondering.
- flashcards: 8-12 atomic question/answer cards for spaced repetition (one fact or idea each).`;

export const DEPTH_MAP_SCHEMA = obj({
  title: str("Clean title for the topic"),
  one_liner: str("The whole topic in one memorable sentence"),
  why_it_matters: str("Why this is worth understanding, 2-3 sentences"),
  layers: arr(
    obj({
      level: str("Layer name"),
      explanation: str("Markdown explanation for this layer"),
      key_points: arr(str("Key takeaway")),
    }),
  ),
  first_principles: arr(str("A first principle")),
  mental_models: arr(obj({ name: str("Model name"), description: str("How to use it") })),
  misconceptions: arr(obj({ myth: str("The misconception"), reality: str("What is actually true") })),
  analogies: arr(str("An analogy")),
  connections: arr(obj({ field: str("Related field/topic"), link: str("How it connects") })),
  prerequisites: arr(str("Prerequisite")),
  big_questions: arr(str("A deep question")),
  flashcards: arr(obj({ front: str("Question"), back: str("Answer") })),
});

// ---------- Ask: open-ended tutoring chat ----------

export const chatSystem = (mode, snapshot) => {
  const modeText =
    mode === "socratic"
      ? `MODE: Socratic. Do not give the full answer immediately. Ask one or two guiding
questions at a time, give hints, and let the learner reason their way to the insight.
Confirm and celebrate correct reasoning; gently correct errors. If the learner is clearly
stuck after a few exchanges or explicitly asks for the answer, explain it fully.`
      : `MODE: Guide. Answer the question thoroughly and clearly. Then:
1. Offer a quick check-for-understanding question.
2. End with a short "**Next step:**" line suggesting one concrete action the learner can take now.`;
  return `${TUTOR_PERSONA}

The learner may ask anything at all - any subject, practical or theoretical.
${modeText}
${snapshot ? `\nWhat you know about this learner (use it to tailor depth and examples; don't recite it):\n${snapshot}` : ""}`;
};

// ---------- Act: personalised action plan ----------

export const PLAN_SYSTEM = `${TUTOR_PERSONA}

You are now acting as a learning strategist. You turn understanding into action:
concrete, specific, doable steps with clear success criteria. Prefer active practice
(building, solving, teaching, applying) over passive consumption. Every action must be
something the learner could start today without further clarification.`;

export const planPrompt = ({ topic, goal, level, minutesPerDay, snapshot, recentChat }) => `Create an action plan.
Topic: ${topic}
Learner's goal: ${goal || "Understand this topic deeply and be able to apply it"}
Self-reported level: ${level || "unknown"}
Time available: ${minutesPerDay || 30} minutes per day
${snapshot ? `\nProgress data:\n${snapshot}\n` : ""}${recentChat ? `\nRecent conversation with the learner (for context):\n${recentChat}\n` : ""}
Requirements:
- today: 2-4 actions that fit within today's time budget.
- this_week: 4-7 actions for the rest of the week.
- milestones: 3-5 milestones spread across weeks, each with observable success criteria.
- techniques: 2-4 evidence-based learning techniques chosen for THIS topic and goal, with exact instructions.
- pitfalls: 3-5 traps learners of this topic commonly fall into.
- checkpoint_questions: 3-5 questions the learner should be able to answer when done.`;

const actionItem = obj({
  action: str("Specific, concrete action starting with a verb"),
  why: str("Why this action moves the learner forward"),
  minutes: int("Estimated minutes"),
});

export const PLAN_SCHEMA = obj({
  goal_restated: str("The goal, sharpened into something measurable"),
  current_level_assessment: str("Honest assessment of where the learner is"),
  north_star: str("What success looks like, vividly"),
  today: arr(actionItem),
  this_week: arr(actionItem),
  milestones: arr(obj({ title: str("Milestone"), success_criteria: str("How you'll know"), week: int("Target week number") })),
  techniques: arr(obj({ name: str("Technique"), how_to_apply: str("Exact instructions for this topic") })),
  pitfalls: arr(str("Pitfall")),
  checkpoint_questions: arr(str("Question")),
});

// ---------- Practice: quiz generation and grading ----------

export const QUIZ_SYSTEM = `${TUTOR_PERSONA}

You write assessment questions that test understanding, not memorisation. Mix
Bloom's levels (remember, understand, apply, analyze, evaluate). Distractors in
multiple-choice questions must be plausible and based on real misconceptions.`;

export const quizPrompt = ({ topic, difficulty, count, snapshot }) => `Write a ${count}-question quiz on "${topic}".
Difficulty: ${difficulty}.
${snapshot ? `Learner data (target weak spots):\n${snapshot}\n` : ""}
- About 60% "mcq" (exactly 4 options, answer_index 0-3) and 40% "short" (options empty, answer_index -1).
- model_answer: the ideal answer (for mcq, restate the correct option).
- explanation: why the answer is right and why tempting wrong answers are wrong.
- concept: the concept being tested in 2-5 words.`;

export const QUIZ_SCHEMA = obj({
  questions: arr(
    obj({
      type: { type: "string", enum: ["mcq", "short"] },
      question: str("The question"),
      options: arr(str("Option")),
      answer_index: int("Correct option index for mcq, -1 for short"),
      model_answer: str("Ideal answer"),
      explanation: str("Explanation"),
      concept: str("Concept tested"),
      bloom_level: str("Bloom's taxonomy level"),
    }),
  ),
});

export const gradePrompt = (topic, items) => `Grade these short answers on "${topic}".
Be fair: reward correct understanding even if worded differently; partial credit is allowed.
${items
  .map(
    (it, i) => `### Answer ${i}
Question: ${it.question}
Model answer: ${it.model_answer}
Learner answer: ${it.answer || "(blank)"}`,
  )
  .join("\n\n")}`;

export const GRADE_SCHEMA = obj({
  results: arr(
    obj({
      index: int("Answer index as given"),
      score: num("0.0 to 1.0"),
      feedback: str("Specific, encouraging feedback: what was right, what was missing"),
    }),
  ),
});

// ---------- Practice: Feynman technique ----------

export const FEYNMAN_SYSTEM = `${TUTOR_PERSONA}

You are evaluating a learner's attempt at the Feynman Technique: explaining a concept
in plain language as if teaching a curious 12-year-old. Judge accuracy, clarity and
completeness. Be specific about gaps - vague feedback is useless. Scores are integers 0-100.`;

export const feynmanPrompt = (topic, concept, explanation) => `Topic: ${topic}
Concept the learner is explaining: ${concept || topic}

Learner's explanation:
"""
${explanation}
"""`;

export const FEYNMAN_SCHEMA = obj({
  accuracy: int("0-100: is it correct?"),
  clarity: int("0-100: could a 12-year-old follow it?"),
  completeness: int("0-100: are the essential ideas present?"),
  strengths: arr(str("What they did well")),
  gaps: arr(str("A specific missing or shaky piece")),
  jargon: arr(str("Jargon used without explanation")),
  misconceptions: arr(str("Anything stated that is wrong")),
  follow_up_questions: arr(str("A probing question a curious child would ask next")),
  improved_explanation: str("A model plain-language explanation in Markdown, 100-200 words"),
});

// ---------- Coach: what to do next ----------

export const COACH_SYSTEM = `${TUTOR_PERSONA}

You are the learner's coach. Look at their progress data and decide the single most
valuable thing to do next, plus a few follow-ups. Base every recommendation on the data
(low scores, due reviews, stalled plans, broken streaks). Available app actions:
"explore" (read the depth map), "ask" (chat with tutor), "plan" (action plan),
"quiz", "feynman" (teach-back), "review" (flashcards).`;

export const coachPrompt = (overviewText) => `Learner progress data:
${overviewText}

Give a headline recommendation, a short insight about their learning pattern,
2-4 next actions (each tied to a topic name and an app action), one learning
technique to try this week, and one sentence of genuine encouragement.`;

export const COACH_SCHEMA = obj({
  headline: str("The single most valuable next move"),
  insight: str("An observation about their learning pattern, 1-3 sentences"),
  next_actions: arr(
    obj({
      action: str("What to do"),
      why: str("Why, grounded in the data"),
      topic: str("Topic name, or empty string if general"),
      app_action: { type: "string", enum: ["explore", "ask", "plan", "quiz", "feynman", "review"] },
      minutes: int("Estimated minutes"),
    }),
  ),
  technique: obj({ name: str("Technique"), how_to_apply: str("How to apply it this week") }),
  encouragement: str("One sentence"),
});
