# ✦ Luminary

**An AI learning companion that helps you understand anything deeply, then act on it, practise it and measure your progress.**

Luminary is built on the Claude API. It stores what you learn, explains any topic at five depths, answers any question you ask, turns what you learned into a concrete action plan, tracks your mastery and teaches you evidence-based learning techniques.

## Features

| Area | What it does |
| --- | --- |
| **Understand** (depth maps) | Enter any topic. You get a layered explanation that goes from *Intuition* → *Foundations* → *Working knowledge* → *Advanced* → *Expert frontier*. It also includes first principles, mental models, common misconceptions (click to reveal the truth), analogies, links to other fields and big questions to think about. |
| **Learn from your PDFs** | Start a topic from a PDF (lecture notes, a paper, a textbook chapter), or attach up to 5 PDFs to any topic. The depth map is built around the document. The tutor answers from it and cites page numbers. Quizzes test what's in it, and action plans and teach-back grading use it too. |
| **Ask** (tutor) | Ask any question, about a topic or about anything (`Ask anything`). **Guide** mode gives a clear answer, a check-your-understanding question and a **next step**. **Socratic** mode leads you to the answer with questions. Replies stream in live and adapt to your progress data. With **🌐 Web search** on, the tutor searches the web when a question needs current or checkable facts, shows what it searched and lists clickable sources. |
| **Act** (action plans) | Tell it your goal, level and daily time. You get a *north star*, tasks for today and this week that you can tick off, milestones with success criteria, techniques chosen for that topic, pitfalls to avoid and checkpoint questions. |
| **Practice** | **Quizzes** that test understanding. Short answers are graded by AI, and missed questions can be turned into flashcards. **Feynman teach-back**: you explain the concept in simple words and get scored on accuracy, clarity and completeness, with specific gaps pointed out. **Flashcards** scheduled with spaced repetition (SM-2). |
| **Progress** | A 0–100 mastery score per topic that combines recent quiz scores (45%), teach-back scores (30%) and long-term flashcard retention (25%). Also: levels from Novice to Expert, a daily streak, a 12-week activity heatmap and quiz history. |
| **Coach** | Looks at your data (low scores, due reviews, stalled plans) and recommends what to do next, with one-click links. |
| **Learning techniques** | A library of 12 research-backed methods (active recall, spaced repetition, Feynman, interleaving, elaboration, dual coding, first principles, deliberate practice, memory palace…). Each has a *Try it* button that opens the feature where you practise it. |

## Quick start

### Easiest: double-click (no terminal needed)

1. Install **Node.js** (the "LTS" version) from <https://nodejs.org>.
2. Download this project and unzip it.
3. Double-click the launcher for your computer:
   - **Windows:** `Start Luminary (Windows).bat`. If Windows shows "Windows protected your PC", click **More info → Run anyway**.
   - **Mac:** `Start Luminary (Mac).command`. The first time, **right-click it → Open → Open**, because macOS blocks downloaded scripts by default.
4. The first run installs everything (about a minute). Then either paste your Anthropic API key, or just press Enter to try the demo.
5. The app opens in your browser. Keep the black window open while you use it, and close it to stop.

Your key is saved in a `.env` file in the folder, so you're only asked once. Delete that file to change the key.

### From a terminal

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
- `LUMINARY_WEB_SEARCH=0`: turns web search off for everyone (it can also be turned off per chat in the UI). Web search must be enabled for your organization in the Anthropic Console, and searches are billed per use.
- `LUMINARY_MOCK=1`: demo mode.
- `PORT` / `HOST`: default `3000` / `127.0.0.1`.
- `LUMINARY_DATA`: where your data is saved (default `./data/db.json`).

## Put it online (use it from any device)

Luminary can run as a password-protected website, which is useful if your own computer can't run Node.js 20 (for example Windows 7). The included `render.yaml` sets it up on [Render](https://render.com):

1. Sign up at render.com using **Sign in with GitHub**.
2. Click **New + → Blueprint** and choose this repository.
3. Fill in the two secrets it asks for:
   - `ANTHROPIC_API_KEY`: your key from console.anthropic.com
   - `LUMINARY_PASSWORD`: a strong password you'll use to log in
4. Click **Apply** and wait a few minutes for the first build.
5. Open the `https://luminary-….onrender.com` address it shows, and log in.

The blueprint uses Render's paid **Starter** plan with a small disk, so the app stays awake and your topics and progress are kept. You can switch it to the **Free** plan in Render's settings, but a free app sleeps when idle and loses saved data whenever it restarts. Check Render's pricing page for current prices.

Security:
- The app refuses to accept outside connections unless `LUMINARY_PASSWORD` is set.
- Logins use a signed, HTTP-only cookie that lasts 30 days, and password guessing is rate-limited.

## How it works

```
public/            no-build single-page app (vanilla JS, marked + DOMPurify for Markdown)
server/index.js    Express API routes
server/claude.js   Anthropic SDK wrapper: structured outputs, streaming chat with web search,
                   Files API uploads, citation/source extraction, error mapping
server/prompts.js  system prompts and JSON schemas for every feature
server/progress.js mastery, streaks, heatmap, learner snapshot fed back to Claude
server/srs.js      SM-2 spaced repetition
server/store.js    local JSON-file persistence (atomic writes)
server/mock.js     canned responses for demo mode and tests
```

- Depth maps, plans, quizzes, grading, Feynman feedback and coaching use **structured outputs** (`output_config.format` with a JSON schema), so the replies always have a shape the app can read.
- The tutor streams its replies to the browser over Server-Sent Events. Web search uses Claude's server-side `web_search` tool. Long searches that return `pause_turn` are resumed automatically, and cited sources are pulled out of the reply's citations.
- PDFs are uploaded once through the **Files API** and referenced by `file_id`. They are sent as a fixed, cached prefix (`cache_control`), so follow-up questions about the same documents cost much less. Citations are enabled for chat only, because they can't be combined with structured outputs.
- Every AI call includes a short **learner snapshot**: mastery, weak concepts from the last quiz, gaps from the last teach-back and plan progress. This lets explanations, quizzes and plans adapt to you over time.
- Quiz answers stay on the server until you submit.

## Tests

```bash
npm test
```

Unit tests cover SM-2 scheduling and the progress maths. An end-to-end API test runs the whole learning loop in mock mode: explore → chat → plan → quiz → teach-back → review → progress → coach.

## Ideas for next steps

- Accounts and multi-user storage (e.g. SQLite/Postgres)
- Other file types (Word, slides, images of handwritten notes)
- Voice mode for teach-back
- Diagrams in depth maps (dual coding)
