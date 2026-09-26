# ✦ Luminary

**An AI learning companion that helps you understand anything deeply, then act on it, practise it and measure your progress.**

Luminary is built on the Claude API. It stores what you learn, explains any topic at five depths, answers any question you ask, turns what you learned into a concrete action plan, tracks your mastery and teaches you evidence-based learning techniques.

## Features

| Area | What it does |
| --- | --- |
| **Understand** (depth maps) | Enter any topic. You get a layered explanation that goes from *Intuition* → *Foundations* → *Working knowledge* → *Advanced* → *Expert frontier*. It also includes first principles, mental models, common misconceptions (click to reveal the truth), analogies, links to other fields and big questions to think about. |
| **Ask** (tutor) | Ask any question, about a topic or about anything (`Ask anything`). **Guide** mode gives a clear answer, a check-your-understanding question and a **next step**. **Socratic** mode leads you to the answer with questions. Replies stream in live and adapt to your progress data. |
| **Act** (action plans) | Tell it your goal, level and daily time. You get a *north star*, tasks for today and this week that you can tick off, milestones with success criteria, techniques chosen for that topic, pitfalls to avoid and checkpoint questions. |
| **Practice** | **Quizzes** that test understanding. Short answers are graded by AI, and missed questions can be turned into flashcards. **Feynman teach-back**: you explain the concept in simple words and get scored on accuracy, clarity and completeness, with specific gaps pointed out. **Flashcards** scheduled with spaced repetition (SM-2). |
| **Progress** | A 0–100 mastery score per topic that combines recent quiz scores (45%), teach-back scores (30%) and long-term flashcard retention (25%). Also: levels from Novice to Expert, a daily streak, a 12-week activity heatmap and quiz history. |
| **Coach** | Looks at your data (low scores, due reviews, stalled plans) and recommends what to do next, with one-click links. |
| **Learning techniques** | A library of 12 research-backed methods (active recall, spaced repetition, Feynman, interleaving, elaboration, dual coding, first principles, deliberate practice, memory palace…). Each has a *Try it* button that opens the feature where you practise it. |

## Quick start

Requires **Node.js 20+**.

```bash
npm install

# Try the full UI offline with canned responses (no API key needed)
npm run demo

# Real mode
export ANTHROPIC_API_KEY=sk-ant-...     # or: ant auth login
npm start
```

Open <http://127.0.0.1:3000>.

### Configuration

See `.env.example`. All settings are optional:

- `LUMINARY_MODEL`: defaults to `claude-opus-5`.
- `LUMINARY_FALLBACKS=0`: turns off server-side refusal fallbacks. They are on by default for Opus 5, so a request that a safety classifier declines is retried on a fallback model instead of failing.
- `LUMINARY_MOCK=1`: demo mode.
- `PORT` / `HOST`: default `3000` / `127.0.0.1`.
- `LUMINARY_DATA`: where your data is saved (default `./data/db.json`).

## How it works

```
public/            no-build single-page app (vanilla JS, marked + DOMPurify for Markdown)
server/index.js    Express API routes
server/claude.js   Anthropic SDK wrapper: structured JSON outputs + streaming chat, error mapping
server/prompts.js  system prompts and JSON schemas for every feature
server/progress.js mastery, streaks, heatmap, learner snapshot fed back to Claude
server/srs.js      SM-2 spaced repetition
server/store.js    local JSON-file persistence (atomic writes)
server/mock.js     canned responses for demo mode and tests
```

- Depth maps, plans, quizzes, grading, Feynman feedback and coaching use **structured outputs** (`output_config.format` with a JSON schema), so the replies always have a shape the app can read.
- The tutor streams its replies to the browser over Server-Sent Events.
- Every AI call includes a short **learner snapshot**: mastery, weak concepts from the last quiz, gaps from the last teach-back and plan progress. This lets explanations, quizzes and plans adapt to you over time.
- Quiz answers stay on the server until you submit.

## Tests

```bash
npm test
```

Unit tests cover SM-2 scheduling and the progress maths. An end-to-end API test runs the whole learning loop in mock mode: explore → chat → plan → quiz → teach-back → review → progress → coach.

## Ideas for next steps

- Web search for current events and citations (`web_search` server tool)
- Accounts and multi-user storage (e.g. SQLite/Postgres)
- Uploading your own notes and PDFs to learn from
- Voice mode for teach-back
- Diagrams in depth maps (dual coding)
