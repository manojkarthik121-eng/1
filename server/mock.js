// Canned responses for offline demo mode (LUMINARY_MOCK=1) and tests.
// They follow the same schemas as the real Claude outputs.

const topicFrom = (prompt) => prompt.match(/"([^"]+)"/)?.[1] ?? "this topic";

const LAYERS = [
  "Intuition (explain like I'm 12)",
  "Foundations",
  "Working knowledge",
  "Advanced",
  "Expert frontier",
];

export function json(kind, prompt) {
  const topic = topicFrom(prompt);
  switch (kind) {
    case "depthMap":
      return {
        title: topic,
        one_liner: `${topic} explained in one line (demo mode).`,
        why_it_matters: "This is demo content. Add an ANTHROPIC_API_KEY to get real, in-depth explanations.",
        layers: LAYERS.map((level, i) => ({
          level,
          explanation: `**${level}.** Demo explanation of *${topic}* at depth ${i + 1}. Each layer builds on the previous one.`,
          key_points: [`Key idea ${i + 1}a`, `Key idea ${i + 1}b`],
        })),
        first_principles: ["Principle one", "Principle two", "Principle three"],
        mental_models: [{ name: "Systems thinking", description: "See the parts and their interactions." }],
        misconceptions: [{ myth: "It's just memorisation.", reality: "It's about understanding mechanisms." }],
        analogies: ["It's like a map for a city you haven't visited yet."],
        connections: [{ field: "Mathematics", link: "Shares the idea of abstraction." }],
        prerequisites: [],
        big_questions: ["What would change if the core assumption were false?"],
        flashcards: [
          { front: `What is ${topic}?`, back: "A demo answer." },
          { front: "Name a first principle.", back: "Principle one." },
          { front: "What's a common myth?", back: "That it's just memorisation." },
        ],
      };
    case "plan":
      return {
        goal_restated: `Explain and apply ${topic} confidently within 4 weeks.`,
        current_level_assessment: "Beginner with curiosity - a great place to start.",
        north_star: "You can teach this to a friend and solve real problems with it.",
        today: [
          { action: "Read the Intuition and Foundations layers", why: "Build the mental scaffold first", minutes: 15 },
          { action: "Do a Feynman teach-back on the core idea", why: "Exposes gaps immediately", minutes: 10 },
        ],
        this_week: [
          { action: "Take a medium quiz", why: "Retrieval practice cements memory", minutes: 10 },
          { action: "Review flashcards daily", why: "Spaced repetition beats cramming", minutes: 5 },
          { action: "Apply the idea to one real problem", why: "Transfer is the real test", minutes: 30 },
          { action: "Ask the tutor 3 'why' questions", why: "Elaboration deepens understanding", minutes: 15 },
        ],
        milestones: [
          { title: "Core intuition", success_criteria: "Feynman score >= 70", week: 1 },
          { title: "Working knowledge", success_criteria: "Quiz score >= 80%", week: 2 },
          { title: "Application", success_criteria: "Solve a novel problem unaided", week: 4 },
        ],
        techniques: [
          { name: "Active recall", how_to_apply: "Close the notes and write everything you remember." },
          { name: "Spaced repetition", how_to_apply: "Review due flashcards every day." },
        ],
        pitfalls: ["Re-reading instead of testing yourself", "Skipping the fundamentals"],
        checkpoint_questions: [`Why does ${topic} work the way it does?`],
      };
    case "quiz":
      return {
        questions: [
          {
            type: "mcq",
            question: `Which statement best describes ${topic}?`,
            options: ["A correct description", "A common myth", "An unrelated idea", "A half-truth"],
            answer_index: 0,
            model_answer: "A correct description",
            explanation: "The first option captures the mechanism; the others are misconceptions.",
            concept: "Core definition",
            bloom_level: "understand",
          },
          {
            type: "mcq",
            question: "What is the best way to retain this long term?",
            options: ["Re-reading", "Highlighting", "Spaced retrieval practice", "Cramming"],
            answer_index: 2,
            model_answer: "Spaced retrieval practice",
            explanation: "Testing yourself at increasing intervals is the most robust technique.",
            concept: "Learning strategy",
            bloom_level: "apply",
          },
          {
            type: "short",
            question: `In your own words, why does ${topic} matter?`,
            options: [],
            answer_index: -1,
            model_answer: "Because it explains a mechanism that shows up in many real situations.",
            explanation: "Look for a mechanism and a real-world consequence.",
            concept: "Significance",
            bloom_level: "evaluate",
          },
        ],
      };
    case "grade": {
      const count = (prompt.match(/### Answer/g) || []).length;
      return {
        results: Array.from({ length: count }, (_, index) => ({
          index,
          score: 0.7,
          feedback: "Good start (demo grading). Add the underlying mechanism for full marks.",
        })),
      };
    }
    case "feynman":
      return {
        accuracy: 72,
        clarity: 80,
        completeness: 60,
        strengths: ["Clear everyday language", "Good use of an example"],
        gaps: ["Doesn't explain *why* the mechanism works"],
        jargon: [],
        misconceptions: [],
        follow_up_questions: ["But what happens if you change the starting conditions?"],
        improved_explanation: "Demo model explanation: imagine... (add an API key for real feedback).",
      };
    case "coach":
      return {
        headline: "Take a quick quiz on your newest topic",
        insight: "You explore a lot but test yourself rarely - retrieval is where memory is built.",
        next_actions: [
          { action: "Take a 5-question quiz", why: "No quiz results yet", topic: "", app_action: "quiz", minutes: 8 },
          { action: "Review due flashcards", why: "Keeps your streak alive", topic: "", app_action: "review", minutes: 5 },
        ],
        technique: { name: "Active recall", how_to_apply: "Before each session, write down what you remember from the last one." },
        encouragement: "Small, consistent sessions beat marathon cramming - you're on the right track.",
      };
    default:
      throw new Error(`No mock for kind "${kind}"`);
  }
}

export async function chat(messages, onText) {
  const last = messages.at(-1)?.content ?? "";
  const reply = `**Demo mode** - you asked: "${String(last).slice(0, 200)}"

Here is where Luminary would give a deep, tailored explanation.

**Next step:** add your \`ANTHROPIC_API_KEY\` and restart with \`npm start\`.`;
  for (const chunk of reply.match(/.{1,24}/gs)) {
    onText(chunk);
    await new Promise((r) => setTimeout(r, 5));
  }
  return reply;
}
