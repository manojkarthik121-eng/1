/* Luminary front-end: a small hash-routed single-page app, no build step. */

// ---------------- utilities ----------------
const $ = (sel, el = document) => el.querySelector(sel);

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

// Like el.replaceChildren(), but skips null/false (native would render "null").
function set(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
}

function md(text, cls = "") {
  const html = window.marked ? marked.parse(text || "") : text;
  return h("div", { class: `md ${cls}`, html: window.DOMPurify ? DOMPurify.sanitize(html) : "" });
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast${isError ? " error" : ""}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), isError ? 7000 : 3000);
}

const LOADING_LINES = {
  explore: ["Mapping the territory…", "Finding the first principles…", "Building layers from intuition to expert…", "Collecting misconceptions and analogies…", "Writing flashcards…"],
  plan: ["Assessing where you are…", "Designing concrete next steps…", "Picking the right techniques…"],
  quiz: ["Writing questions that test understanding…", "Crafting plausible distractors…"],
  grade: ["Reading your answers…", "Grading fairly…"],
  feynman: ["Reading your explanation…", "Looking for gaps…", "Writing a model explanation…"],
  coach: ["Reviewing your progress…", "Deciding what matters most…"],
};

function loading(kind) {
  const lines = LOADING_LINES[kind] || ["Thinking…"];
  const label = h("span", {}, lines[0]);
  const el = h("div", { class: "loading" }, h("span", { class: "spinner" }), label);
  let i = 0;
  const timer = setInterval(() => {
    if (!el.isConnected) return clearInterval(timer);
    i = (i + 1) % lines.length;
    label.textContent = lines[i];
  }, 3500);
  return el;
}

// Runs an async action while showing a loading indicator in `container`.
async function withLoading(container, kind, fn) {
  const node = loading(kind);
  set(container, node);
  try {
    return await fn();
  } catch (err) {
    set(container);
    toast(err.message, true);
    throw err;
  }
}

const masteryClass = (score) => (score >= 60 ? "good" : score >= 30 ? "warn" : "bad");
const bar = (percent) => h("div", { class: "bar" }, h("span", { style: `width:${Math.max(0, Math.min(100, percent))}%` }));

// ---------------- state ----------------
const state = {
  topics: [],
  status: null,
  pendingQuestion: null,
  lastTopicId: null,
};

async function refreshSidebar() {
  try {
    const [topics, due] = await Promise.all([api("/topics"), api("/review")]);
    state.topics = topics;
    const list = $("#topic-list");
    set(list, 
      ...(topics.length
        ? topics.map((t) =>
            h("li", {}, h("a", { href: `#/topic/${t.id}`, "data-topic": t.id },
              h("span", {}, t.title),
              h("span", { class: "mini" }, `${t.mastery.score}%`))),
          )
        : [h("li", { class: "muted small", style: "padding:0 10px" }, "No topics yet")]),
    );
    const pill = $("#due-pill");
    pill.hidden = !due.length;
    pill.textContent = due.length;
    highlightNav();
  } catch (err) {
    toast(err.message, true);
  }
}

function highlightNav() {
  const hash = location.hash || "#/";
  document.querySelectorAll(".nav a").forEach((a) => {
    const target = a.getAttribute("href");
    a.classList.toggle("active", target === "#/" ? hash === "#/" || hash === "#" : hash.startsWith(target));
  });
  document.querySelectorAll(".topic-list a").forEach((a) => {
    a.classList.toggle("active", hash.startsWith(`#/topic/${a.dataset.topic}`));
  });
}

// ---------------- router ----------------
const view = () => $("#view");

async function route() {
  $("#sidebar").classList.remove("open");
  highlightNav();
  const parts = (location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean);
  window.scrollTo(0, 0);
  try {
    if (!parts.length) return renderHome();
    if (parts[0] === "topic") return await renderTopic(parts[1], parts[2] || "understand", parts[3]);
    if (parts[0] === "ask") return renderGeneralAsk();
    if (parts[0] === "progress") return await renderProgress();
    if (parts[0] === "review") return await renderReview();
    if (parts[0] === "techniques") return renderTechniques();
    renderHome();
  } catch (err) {
    set(view(), h("div", { class: "empty" }, err.message));
  }
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

// Map a coach/technique "app action" onto a route for a topic.
function actionRoute(appAction, topicId) {
  if (appAction === "review") return "#/review";
  if (appAction === "progress") return "#/progress";
  if (!topicId) return null;
  const map = {
    explore: "understand",
    ask: "ask",
    plan: "act",
    quiz: "practice/quiz",
    feynman: "practice/feynman",
  };
  return `#/topic/${topicId}/${map[appAction] || "understand"}`;
}

// ---------------- home ----------------
const SUGGESTIONS = [
  "How the immune system works",
  "Compound interest and investing",
  "Machine learning",
  "Stoic philosophy",
  "Negotiation",
  "Quantum computing",
  "The French Revolution",
  "Public speaking",
];

function renderHome() {
  const input = h("input", { type: "text", placeholder: "e.g. How black holes form, Negotiation, Calculus…", "aria-label": "Topic", maxlength: 200 });
  const background = h("textarea", { placeholder: "Optional: your background and why you want to learn this (e.g. \"software engineer, want to understand ML papers\")", maxlength: 1000, rows: 2 });
  const status = h("div");

  const explore = async (name) => {
    name = (name ?? input.value).trim();
    if (!name) return input.focus();
    const topic = await withLoading(status, "explore", () =>
      api("/topics", { method: "POST", body: { name, background: background.value } }),
    );
    await refreshSidebar();
    go(`#/topic/${topic.id}`);
  };

  const form = h("form", { class: "hero-form", onsubmit: (e) => { e.preventDefault(); explore().catch(() => {}); } },
    input, h("button", { class: "primary", type: "submit" }, "Explore →"));

  const coachBox = h("div");
  const coach = h("div", { class: "card accent" },
    h("h2", {}, "What should I do next?"),
    h("p", { class: "muted" }, "Your coach looks at your progress and recommends the highest-value next step."),
    coachBox,
    h("button", { class: "primary", onclick: (e) => runCoach(coachBox, e.currentTarget) }, "Ask my coach"));

  const recent = state.topics.slice(0, 6);

  set(view(), 
    h("section", { class: "hero" },
      h("h1", {}, "What do you want to understand?"),
      h("p", { class: "muted" }, "Go from zero to deep understanding of anything - then act on it, practise it and watch your mastery grow."),
      form,
      h("details", { style: "margin-top:10px" }, h("summary", { class: "small muted" }, "Tell me about yourself (tailors the explanation)"), background),
      h("div", { class: "suggestions" }, SUGGESTIONS.map((s) => h("button", { type: "button", onclick: () => { input.value = s; explore(s).catch(() => {}); } }, s))),
      status),
    h("div", { class: "grid two", style: "margin-top:24px" },
      coach,
      h("div", { class: "card" },
        h("h2", {}, "Ask anything"),
        h("p", { class: "muted" }, "Any question at all - practical, technical, philosophical. Get a clear answer and a concrete next step."),
        h("a", { class: "btn", href: "#/ask" }, "Open the tutor →"))),
    recent.length
      ? h("section", {},
          h("h2", { style: "margin-top:12px" }, "Continue learning"),
          h("div", { class: "grid three" }, recent.map(topicCard)))
      : null,
  );
  input.focus();
}

function topicCard(t) {
  return h("a", { class: "card", href: `#/topic/${t.id}`, style: "display:block;color:inherit;text-decoration:none" },
    h("div", { class: "row" }, h("strong", {}, t.title), h("span", { class: "spacer" }), h("span", { class: `pill ${masteryClass(t.mastery.score)}` }, t.mastery.level)),
    h("p", { class: "muted small", style: "margin:6px 0 10px" }, t.oneLiner),
    bar(t.mastery.score),
    h("div", { class: "small muted", style: "margin-top:6px" }, `Mastery ${t.mastery.score}%${t.mastery.counts.dueCards ? ` · ${t.mastery.counts.dueCards} cards due` : ""}`));
}

async function runCoach(box, button) {
  button.disabled = true;
  try {
    const advice = await withLoading(box, "coach", () => api("/coach", { method: "POST" }));
    const findTopic = (name) => state.topics.find((t) => name && (t.name.toLowerCase() === name.toLowerCase() || t.title.toLowerCase() === name.toLowerCase()));
    set(box, 
      h("h3", { style: "margin-top:8px" }, advice.headline),
      h("p", {}, advice.insight),
      h("div", {}, advice.next_actions.map((a) => {
        const topic = findTopic(a.topic) || (state.topics.length === 1 ? state.topics[0] : null);
        const target = actionRoute(a.app_action, topic?.id);
        return h("div", { class: "task" },
          h("div", { style: "flex:1" },
            h("div", {}, h("strong", {}, a.action), a.topic ? h("span", { class: "pill", style: "margin-left:6px" }, a.topic) : null),
            h("div", { class: "task-why" }, `${a.why} · ~${a.minutes} min`)),
          target ? h("button", { onclick: () => go(target) }, "Go") : null);
      })),
      h("div", { class: "keypoints" }, h("strong", {}, `Technique to try: ${advice.technique.name}. `), advice.technique.how_to_apply),
      h("p", { class: "muted", style: "margin-top:10px" }, advice.encouragement),
    );
  } catch {}
  button.disabled = false;
}

// ---------------- topic ----------------
const masteryBadge = (m) => [
  h("span", { class: `pill ${masteryClass(m.score)}` }, `${m.level} · ${m.score}%`),
  h("div", { style: "flex:1" }, bar(m.score)),
];

function updateMastery(m) {
  const el = $("#topic-mastery");
  if (el) set(el, masteryBadge(m));
  refreshSidebar();
}
const TABS = [
  ["understand", "Understand"],
  ["ask", "Ask"],
  ["act", "Act"],
  ["practice", "Practice"],
];

async function renderTopic(id, tab, sub) {
  const topic = await api(`/topics/${id}`);
  state.lastTopicId = id;
  const map = topic.depthMap;
  const m = topic.mastery;

  const body = h("div");
  const header = h("header", {},
    h("div", { class: "row" },
      h("h1", { style: "margin:0" }, map?.title || topic.name),
      h("span", { class: "spacer" }),
      h("button", { class: "ghost danger small", onclick: async () => {
        if (!confirm(`Delete "${topic.name}" and all its progress?`)) return;
        await api(`/topics/${id}`, { method: "DELETE" });
        await refreshSidebar();
        go("#/");
      } }, "Delete")),
    map?.one_liner ? h("p", { class: "muted", style: "font-size:1.05rem;margin-top:6px" }, map.one_liner) : null,
    h("div", { class: "row", style: "max-width:520px", id: "topic-mastery" }, masteryBadge(m)),
  );

  const tabs = h("div", { class: "tabs", role: "tablist" },
    TABS.map(([key, label]) => h("button", { class: key === tab ? "active" : "", role: "tab", onclick: () => go(`#/topic/${id}/${key}`) }, label)));

  set(view(), header, tabs, body);

  if (tab === "ask") return renderChat(body, id, topic.chat, map?.title || topic.name);
  if (tab === "act") return renderPlan(body, topic);
  if (tab === "practice") return renderPractice(body, topic, sub || "quiz");
  return renderUnderstand(body, topic);
}

function askAbout(topicId, question) {
  state.pendingQuestion = question;
  go(topicId ? `#/topic/${topicId}/ask` : "#/ask");
}

function renderUnderstand(body, topic) {
  const map = topic.depthMap;
  if (!map) return set(body, h("div", { class: "empty" }, "No depth map for this topic."));

  let current = 0;
  const seen = new Set([0]);
  const layerBox = h("div");
  const steps = h("div", { class: "depth-steps" });

  const showLayer = (i) => {
    current = i;
    seen.add(i);
    const layer = map.layers[i];
    set(steps, ...map.layers.map((l, j) =>
      h("button", { class: `${j === i ? "active" : ""} ${seen.has(j) ? "seen" : ""}`, onclick: () => showLayer(j), title: l.level }, `${j + 1}. ${l.level.replace(/\s*\(.*\)/, "")}`)));
    set(layerBox, 
      h("div", { class: "layer-level" }, `Depth ${i + 1} of ${map.layers.length} · ${layer.level}`),
      md(layer.explanation),
      layer.key_points?.length ? h("div", { class: "keypoints" }, h("strong", {}, "Key points"), h("ul", {}, layer.key_points.map((k) => h("li", {}, k)))) : null,
      h("div", { class: "row", style: "margin-top:14px" },
        i > 0 ? h("button", { onclick: () => showLayer(i - 1) }, "← Simpler") : null,
        h("button", { class: "ghost", onclick: () => askAbout(topic.id, `I'm reading the "${layer.level}" layer. Can you explain it in a different way, with a new example?`) }, "Explain differently"),
        h("span", { class: "spacer" }),
        i < map.layers.length - 1 ? h("button", { class: "primary", onclick: () => showLayer(i + 1) }, "Go deeper →") : h("span", { class: "pill good" }, "You've reached the frontier ✦")),
    );
  };

  const section = (title, ...content) => h("div", { class: "card" }, h("h2", {}, title), ...content);

  set(body, 
    map.why_it_matters ? h("div", { class: "card accent" }, h("h3", {}, "Why it matters"), h("p", { style: "margin:0" }, map.why_it_matters)) : null,
    map.prerequisites?.length ? h("p", { class: "small muted" }, h("strong", {}, "Helpful to know first: "), map.prerequisites.join(" · ")) : null,
    h("div", { class: "card" }, steps, layerBox),
    h("div", { class: "grid two" },
      section("First principles",
        h("p", { class: "muted small" }, "The irreducible ideas everything else rests on."),
        h("ol", {}, map.first_principles.map((p) => h("li", {}, p)))),
      section("Mental models",
        map.mental_models.map((mm) => h("div", { style: "margin-bottom:10px" }, h("strong", {}, mm.name), h("div", { class: "small" }, mm.description))))),
    section("Common misconceptions",
      h("p", { class: "muted small" }, "Click a myth to reveal the reality. Try to predict it first!"),
      h("div", { class: "grid two" }, map.misconceptions.map((mc) =>
        h("div", { class: "card flip", style: "margin:0", onclick: (e) => e.currentTarget.classList.toggle("open") },
          h("div", { class: "myth" }, "✗ ", mc.myth),
          h("div", { class: "reality" }, "✓ ", mc.reality))))),
    h("div", { class: "grid two" },
      section("Analogies", h("ul", {}, map.analogies.map((a) => h("li", {}, a)))),
      section("Connections", map.connections.map((c) => h("div", { style: "margin-bottom:8px" }, h("strong", {}, c.field), h("div", { class: "small" }, c.link))))),
    section("Big questions to ponder",
      h("p", { class: "muted small" }, "Click one to explore it with your tutor."),
      h("div", { class: "chips" }, map.big_questions.map((q) => h("button", { onclick: () => askAbout(topic.id, q) }, q)))),
    h("div", { class: "card" },
      h("h2", {}, "Now make it stick"),
      h("div", { class: "row" },
        h("button", { class: "primary", onclick: () => go(`#/topic/${topic.id}/practice/feynman`) }, "Teach it back (Feynman)"),
        h("button", { onclick: () => go(`#/topic/${topic.id}/practice/quiz`) }, "Take a quiz"),
        h("button", { onclick: () => go(`#/topic/${topic.id}/act`) }, "Get an action plan"))),
  );
  showLayer(0);
}

// ---------------- chat ----------------
function renderGeneralAsk() {
  const body = h("div");
  set(view(), 
    h("h1", {}, "Ask anything"),
    h("p", { class: "muted" }, "Any subject, any level. Switch to Socratic mode if you'd rather be guided to the answer than told."),
    body);
  api("/chat/general").then((chat) => renderChat(body, "general", chat, null)).catch((e) => toast(e.message, true));
}

function renderChat(body, ownerId, history, topicTitle) {
  let mode = localStorage.getItem("luminary.mode") || "guide";
  const log = h("div", { class: "chat" });
  const textarea = h("textarea", { placeholder: topicTitle ? `Ask anything about ${topicTitle}…` : "Ask any question…", rows: 2, maxlength: 8000 });
  const send = h("button", { class: "primary", type: "submit" }, "Send");

  const modeBtns = ["guide", "socratic"].map((m) =>
    h("button", { type: "button", class: m === mode ? "active" : "", onclick: () => {
      mode = m;
      try { localStorage.setItem("luminary.mode", m); } catch {}
      modeBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    }, "data-mode": m }, m === "guide" ? "Guide me" : "Socratic"));

  const addMsg = (role, content) => {
    const el = role === "user" ? h("div", { class: "msg user" }, content) : h("div", { class: "msg assistant" }, md(content));
    log.append(el);
    return el;
  };

  history.forEach((m) => addMsg(m.role, m.content));
  if (!history.length) {
    log.append(h("div", { class: "empty" },
      h("p", {}, topicTitle ? `Ask your tutor anything about ${topicTitle}.` : "What are you curious about?"),
      h("div", { class: "chips", style: "justify-content:center" },
        (topicTitle
          ? [`What's the single most important idea in ${topicTitle}?`, `Give me a real-world example of ${topicTitle}`, `What do experts disagree about?`]
          : ["How do I get better at learning?", "Why is the sky blue?", "How should I start investing?"]
        ).map((q) => h("button", { onclick: () => { textarea.value = q; submit(); } }, q)))));
  }

  const submit = async () => {
    const message = textarea.value.trim();
    if (!message) return;
    log.querySelector(".empty")?.remove();
    textarea.value = "";
    send.disabled = true;
    addMsg("user", message);
    const reply = addMsg("assistant", "");
    set(reply, h("span", { class: "spinner" }));
    reply.scrollIntoView({ behavior: "smooth", block: "end" });
    let text = "";
    try {
      const res = await fetch(`/api/chat/${ownerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, mode }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let pending = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop();
        for (const raw of events) {
          if (!raw.startsWith("data: ")) continue;
          const evt = JSON.parse(raw.slice(6));
          if (evt.type === "text") text += evt.text;
          if (evt.type === "error") throw new Error(evt.error);
        }
        if (!pending) {
          pending = true;
          requestAnimationFrame(() => {
            pending = false;
            set(reply, md(text));
          });
        }
      }
      set(reply, md(text));
      if (ownerId !== "general") {
        reply.append(h("div", { class: "row", style: "margin-top:10px" },
          h("button", { class: "ghost small", onclick: () => go(`#/topic/${ownerId}/act`) }, "Turn this into an action plan →"),
          h("button", { class: "ghost small", onclick: () => go(`#/topic/${ownerId}/practice/feynman`) }, "Teach it back")));
      }
    } catch (err) {
      set(reply, h("span", { class: "muted" }, text ? "" : "No answer."));
      if (text) set(reply, md(text));
      toast(err.message, true);
    }
    send.disabled = false;
    textarea.focus();
    refreshSidebar();
  };

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });

  set(body, 
    h("div", { class: "row", style: "margin-bottom:12px" },
      h("div", { class: "mode-toggle" }, modeBtns),
      h("span", { class: "small muted" }, "Guide: clear answers + next step. Socratic: guided questions."),
      h("span", { class: "spacer" }),
      history.length ? h("button", { class: "ghost small", onclick: async () => {
        if (!confirm("Clear this conversation?")) return;
        await api(`/chat/${ownerId}`, { method: "DELETE" });
        route();
      } }, "Clear") : null),
    log,
    h("form", { class: "chat-input", onsubmit: (e) => { e.preventDefault(); submit(); } }, textarea, send),
  );

  if (state.pendingQuestion) {
    textarea.value = state.pendingQuestion;
    state.pendingQuestion = null;
    submit();
  } else {
    textarea.focus();
  }
}

// ---------------- plan ----------------
function renderPlan(body, topic) {
  const planBox = h("div");
  const showForm = (existing) => {
    const goal = h("textarea", { rows: 2, placeholder: "e.g. Pass my exam in 6 weeks · Build my own small project · Explain it confidently at work", maxlength: 1000 }, existing?.inputs?.goal || "");
    const level = h("select", {}, ["Complete beginner", "Know the basics", "Intermediate", "Advanced"].map((l) => h("option", { selected: existing?.inputs?.level === l }, l)));
    const minutes = h("input", { type: "number", min: 5, max: 480, value: existing?.inputs?.minutesPerDay || 30 });
    const status = h("div");
    return h("form", { class: "card", onsubmit: async (e) => {
        e.preventDefault();
        const plan = await withLoading(status, "plan", () =>
          api(`/topics/${topic.id}/plan`, { method: "POST", body: { goal: goal.value, level: level.value, minutesPerDay: minutes.value } }),
        ).catch(() => null);
        if (plan) { topic.plan = plan; draw(); refreshSidebar(); }
      } },
      h("h2", {}, existing ? "Rebuild your plan" : "Turn understanding into action"),
      h("p", { class: "muted" }, "Tell me your goal and I'll design concrete steps, milestones and the learning techniques that fit this topic. Your quiz and teach-back results are taken into account."),
      h("label", {}, "What's your goal?"), goal,
      h("div", { class: "grid two" },
        h("div", {}, h("label", {}, "Your level"), level),
        h("div", {}, h("label", {}, "Minutes per day"), minutes)),
      h("div", { class: "row", style: "margin-top:14px" }, h("button", { class: "primary", type: "submit" }, "Create my plan"),
        existing ? h("button", { type: "button", class: "ghost", onclick: draw }, "Cancel") : null),
      status);
  };

  const taskList = (list) => (topic.plan[list] || []).map((t, index) =>
    h("label", { class: `task ${t.done ? "done" : ""}`, style: "font-weight:400;margin:0" },
      h("input", { type: "checkbox", checked: t.done, onchange: async (e) => {
        try {
          const res = await api(`/topics/${topic.id}/plan/task`, { method: "PATCH", body: { list, index, done: e.target.checked } });
          topic.plan = res.plan;
          draw();
          if (e.target.checked) toast("Nice work - progress logged ✦");
        } catch (err) { toast(err.message, true); }
      } }),
      h("div", {}, h("div", { class: "task-action" }, t.action), h("div", { class: "task-why" }, `${t.why} · ~${t.minutes} min`))));

  const draw = () => {
    const p = topic.plan;
    if (!p) return set(planBox, showForm(null));
    const all = [...(p.today || []), ...(p.this_week || [])];
    const done = all.filter((t) => t.done).length;
    set(planBox, 
      h("div", { class: "card accent" },
        h("div", { class: "layer-level" }, "North star"),
        h("h2", { style: "margin-top:4px" }, p.north_star),
        h("p", {}, h("strong", {}, "Goal: "), p.goal_restated),
        h("p", { class: "muted" }, p.current_level_assessment),
        h("div", { class: "row" }, h("div", { style: "flex:1" }, bar(all.length ? (done / all.length) * 100 : 0)), h("span", { class: "small muted" }, `${done}/${all.length} done`))),
      h("div", { class: "grid two" },
        h("div", { class: "card" }, h("h2", {}, "Today"), taskList("today")),
        h("div", { class: "card" }, h("h2", {}, "This week"), taskList("this_week"))),
      h("div", { class: "grid two" },
        h("div", { class: "card" }, h("h2", {}, "Milestones"), p.milestones.map((ms) =>
          h("div", { class: "milestone" }, h("strong", {}, `Week ${ms.week}: ${ms.title}`), h("div", { class: "small muted" }, ms.success_criteria)))),
        h("div", { class: "card" }, h("h2", {}, "Techniques for this topic"), p.techniques.map((t) =>
          h("div", { style: "margin-bottom:10px" }, h("strong", {}, t.name), h("div", { class: "small" }, t.how_to_apply))))),
      h("div", { class: "grid two" },
        h("div", { class: "card" }, h("h2", {}, "Pitfalls to avoid"), h("ul", {}, p.pitfalls.map((x) => h("li", {}, x)))),
        h("div", { class: "card" }, h("h2", {}, "You're done when you can answer…"),
          h("div", { class: "chips" }, p.checkpoint_questions.map((q) => h("button", { onclick: () => askAbout(topic.id, `Check my understanding: ${q}`) }, q))))),
      h("button", { onclick: () => set(planBox, showForm(p)) }, "Rebuild plan"),
    );
  };
  set(body, planBox);
  draw();
}

// ---------------- practice ----------------
const PRACTICE = [
  ["quiz", "Quiz"],
  ["feynman", "Teach it back"],
  ["cards", "Flashcards"],
];

function renderPractice(body, topic, sub) {
  const inner = h("div");
  set(body, 
    h("div", { class: "subtabs" }, PRACTICE.map(([key, label]) =>
      h("button", { class: key === sub ? "active" : "", onclick: () => go(`#/topic/${topic.id}/practice/${key}`) }, label))),
    inner);
  if (sub === "feynman") return renderFeynman(inner, topic);
  if (sub === "cards") return renderTopicCards(inner, topic);
  return renderQuiz(inner, topic);
}

function renderQuiz(box, topic) {
  const difficulty = h("select", {}, ["easy", "medium", "hard"].map((d) => h("option", { selected: d === "medium" }, d)));
  const count = h("select", {}, [3, 5, 8, 10].map((n) => h("option", { selected: n === 5 }, n)));
  const area = h("div");

  const start = async () => {
    const quiz = await withLoading(area, "quiz", () =>
      api(`/topics/${topic.id}/quiz`, { method: "POST", body: { difficulty: difficulty.value, count: Number(count.value) } }),
    ).catch(() => null);
    if (quiz) drawQuiz(quiz);
  };

  const drawQuiz = (quiz) => {
    const inputs = quiz.questions.map((q, i) =>
      q.type === "mcq"
        ? q.options.map((opt, j) => h("label", { class: "option" }, h("input", { type: "radio", name: `q${i}`, value: j }), h("span", {}, opt)))
        : h("textarea", { rows: 3, placeholder: "Answer in your own words…", "data-q": i }));
    const qNodes = quiz.questions.map((q, i) =>
      h("div", { class: "question card" },
        h("div", { class: "small muted" }, `Question ${i + 1} · ${q.concept}`),
        h("p", { style: "font-weight:600" }, q.question),
        inputs[i]));
    const submitBtn = h("button", { class: "primary" }, "Submit answers");
    const resultArea = h("div");
    submitBtn.onclick = async () => {
      const answers = quiz.questions.map((q, i) =>
        q.type === "mcq"
          ? Number(qNodes[i].querySelector("input:checked")?.value ?? -1)
          : qNodes[i].querySelector("textarea").value);
      submitBtn.disabled = true;
      const res = await withLoading(resultArea, "grade", () => api(`/quiz/${quiz.quizId}/submit`, { method: "POST", body: { answers } })).catch(() => null);
      if (!res) { submitBtn.disabled = false; return; }
      submitBtn.remove();
      res.results.forEach((r, i) => {
        const node = qNodes[i];
        node.querySelectorAll("input, textarea").forEach((el) => (el.disabled = true));
        if (r.type === "mcq") {
          node.querySelectorAll(".option").forEach((opt, j) => {
            if (j === r.answer_index) opt.classList.add("correct");
            else if (j === Number(r.answer)) opt.classList.add("wrong");
          });
        }
        node.append(h("div", { class: "result-box" },
          h("div", {}, h("span", { class: `pill ${r.score >= 0.8 ? "good" : r.score >= 0.4 ? "warn" : "bad"}` }, `${Math.round(r.score * 100)}%`), " ", r.feedback),
          r.type === "short" ? h("p", { style: "margin:8px 0 0" }, h("strong", {}, "Model answer: "), r.model_answer) : null,
          md(r.explanation, "small")));
      });
      const missed = res.results.filter((r) => r.score < 0.6);
      set(resultArea, h("div", { class: "card accent" },
        h("div", { class: "stat" }, `${res.percent}%`),
        h("div", { class: "stat-label" }, `Mastery is now ${res.mastery.score}% (${res.mastery.level})`),
        res.weakConcepts.length ? h("p", { style: "margin-top:10px" }, h("strong", {}, "Focus next on: "), res.weakConcepts.join(", ")) : h("p", { style: "margin-top:10px" }, "Excellent - no weak spots this round."),
        h("div", { class: "row" },
          missed.length ? h("button", { onclick: async (e) => {
            e.currentTarget.disabled = true;
            for (const r of missed) {
              await api(`/topics/${topic.id}/cards`, { method: "POST", body: { front: r.question, back: r.model_answer } });
            }
            toast(`${missed.length} card(s) added to your review deck`);
            refreshSidebar();
          } }, `Add ${missed.length} missed to flashcards`) : null,
          res.weakConcepts.length ? h("button", { onclick: () => askAbout(topic.id, `I struggled with: ${res.weakConcepts.join(", ")}. Help me understand these properly.`) }, "Work on weak spots with tutor") : null,
          h("button", { class: "primary", onclick: () => renderQuiz(box, topic) }, "New quiz"))));
      updateMastery(res.mastery);
      resultArea.scrollIntoView({ behavior: "smooth" });
    };
    set(area, ...qNodes, submitBtn, resultArea);
  };

  set(box, 
    h("div", { class: "card" },
      h("h2", {}, "Test yourself"),
      h("p", { class: "muted" }, "Retrieval practice is the most reliable way to build lasting memory. Questions target your weak spots and test understanding, not trivia."),
      h("div", { class: "row" },
        h("label", { style: "margin:0" }, "Difficulty"), difficulty,
        h("label", { style: "margin:0" }, "Questions"), count,
        h("button", { class: "primary", onclick: start }, "Start quiz"))),
    area);
}

function renderFeynman(box, topic) {
  const concepts = topic.depthMap?.first_principles || [];
  const concept = h("input", { type: "text", placeholder: `Which concept? (default: ${topic.name})`, maxlength: 300 });
  const explanation = h("textarea", { rows: 9, placeholder: "Explain it as if you're teaching a curious 12-year-old. Use simple words, an example and an analogy. No notes!", maxlength: 8000 });
  const words = h("span", { class: "small muted" }, "0 words");
  explanation.addEventListener("input", () => (words.textContent = `${explanation.value.trim().split(/\s+/).filter(Boolean).length} words`));
  const result = h("div");

  const scoreRow = (label, value) => h("div", { style: "margin-bottom:8px" },
    h("div", { class: "row small" }, h("span", {}, label), h("span", { class: "spacer" }), h("strong", {}, value)), bar(value));

  const list = (title, items, cls = "") => items?.length ? h("div", { class: "card" }, h("h3", { class: cls }, title), h("ul", {}, items.map((x) => h("li", {}, x)))) : null;

  const submit = async (e) => {
    e.preventDefault();
    const fb = await withLoading(result, "feynman", () =>
      api(`/topics/${topic.id}/feynman`, { method: "POST", body: { concept: concept.value, explanation: explanation.value } }),
    ).catch(() => null);
    if (!fb) return;
    set(result, 
      h("div", { class: "card accent" },
        h("div", { class: "row" },
          h("div", {}, h("div", { class: "stat" }, fb.score), h("div", { class: "stat-label" }, "Teach-back score")),
          h("span", { class: "spacer" }),
          h("div", { class: "small muted" }, `Topic mastery: ${fb.mastery.score}%`)),
        h("div", { style: "margin-top:12px" }, scoreRow("Accuracy", fb.accuracy), scoreRow("Clarity", fb.clarity), scoreRow("Completeness", fb.completeness))),
      h("div", { class: "grid two" },
        list("✓ Strengths", fb.strengths),
        list("Gaps to fill", fb.gaps),
        list("Jargon to simplify", fb.jargon),
        list("Misconceptions", fb.misconceptions)),
      fb.follow_up_questions?.length ? h("div", { class: "card" }, h("h3", {}, "A curious student would ask next…"),
        h("div", { class: "chips" }, fb.follow_up_questions.map((q) => h("button", { onclick: () => askAbout(topic.id, q) }, q)))) : null,
      h("div", { class: "card" }, h("h3", {}, "A model explanation"), md(fb.improved_explanation),
        h("p", { class: "small muted", style: "margin-top:10px" }, "Now close this, wait a few minutes, and try explaining it again in your own words.")),
    );
    updateMastery(fb.mastery);
    result.scrollIntoView({ behavior: "smooth" });
  };

  set(box, 
    h("form", { class: "card", onsubmit: submit },
      h("h2", {}, "The Feynman technique"),
      h("p", { class: "muted" }, "If you can't explain it simply, you don't understand it yet. Write an explanation from memory - you'll get scored on accuracy, clarity and completeness, and shown exactly where the gaps are."),
      h("label", {}, "Concept"), concept,
      concepts.length ? h("div", { class: "suggestions" }, concepts.slice(0, 5).map((c) => h("button", { type: "button", onclick: () => (concept.value = c) }, c.length > 60 ? `${c.slice(0, 57)}…` : c))) : null,
      h("label", {}, "Your explanation"), explanation,
      h("div", { class: "row", style: "margin-top:10px" }, words, h("span", { class: "spacer" }), h("button", { class: "primary", type: "submit" }, "Get feedback"))),
    result);
}

async function renderTopicCards(box, topic) {
  const due = await api(`/review?topicId=${topic.id}`);
  const front = h("input", { type: "text", placeholder: "Question", maxlength: 1000 });
  const back = h("input", { type: "text", placeholder: "Answer", maxlength: 2000 });
  const session = h("div");
  set(box, 
    h("div", { class: "card" },
      h("h2", {}, "Spaced repetition"),
      h("p", { class: "muted" }, `Cards come back just before you'd forget them. ${topic.mastery.counts.cards} cards in this topic, ${due.length} due now.`)),
    session,
    h("form", { class: "card", onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api(`/topics/${topic.id}/cards`, { method: "POST", body: { front: front.value, back: back.value } });
          toast("Card added");
          renderTopicCards(box, { ...topic, mastery: { ...topic.mastery, counts: { ...topic.mastery.counts, cards: topic.mastery.counts.cards + 1 } } });
          refreshSidebar();
        } catch (err) { toast(err.message, true); }
      } },
      h("h3", {}, "Add your own card"),
      h("div", { class: "grid two" }, front, back),
      h("button", { class: "primary", style: "margin-top:10px", type: "submit" }, "Add card")));
  reviewSession(session, due);
}

function reviewSession(container, cards, onFinish) {
  let i = 0;
  let reviewed = 0;
  const draw = () => {
    if (i >= cards.length) {
      set(container, h("div", { class: "card empty" },
        h("h2", {}, reviewed ? "Session complete ✦" : "Nothing due right now"),
        h("p", {}, reviewed ? `You reviewed ${reviewed} card${reviewed === 1 ? "" : "s"}. They'll come back when your memory needs them.` : "Come back later - or add a few cards of your own.")));
      onFinish?.();
      refreshSidebar();
      return;
    }
    const card = cards[i];
    let revealed = false;
    const answer = h("div", { class: "answer md", hidden: true });
    answer.append(md(card.back));
    const grades = h("div", { class: "grades", hidden: true },
      [[1, "Forgot", "again soon"], [3, "Hard", "shorter gap"], [4, "Good", "normal gap"], [5, "Easy", "longer gap"]].map(([g, label, hint]) =>
        h("button", { onclick: async () => {
          try {
            await api(`/cards/${card.id}/review`, { method: "POST", body: { grade: g } });
            reviewed += 1;
            i += 1;
            draw();
          } catch (err) { toast(err.message, true); }
        } }, label, h("small", {}, hint))));
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      answer.hidden = false;
      grades.hidden = false;
      hint.remove();
    };
    const hint = h("p", { class: "small muted", style: "text-align:center" }, "Recall the answer, then click the card (or press space) to check.");
    const cardEl = h("div", { class: "card flashcard", onclick: reveal, tabindex: 0, onkeydown: (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); reveal(); } } },
      h("div", {},
        card.topicName ? h("div", { class: "pill", style: "margin-bottom:10px" }, card.topicName) : null,
        md(card.front),
        answer));
    set(container, 
      h("div", { class: "small muted", style: "margin-bottom:6px" }, `Card ${i + 1} of ${cards.length}`),
      cardEl, hint, grades);
    cardEl.focus();
  };
  draw();
}

// ---------------- review (all topics) ----------------
async function renderReview() {
  const due = await api("/review");
  const session = h("div");
  set(view(), 
    h("h1", {}, "Daily review"),
    h("p", { class: "muted" }, "Spaced repetition across all your topics. A few minutes a day keeps everything you've learned alive."),
    session);
  reviewSession(session, due);
}

// ---------------- progress ----------------
async function renderProgress() {
  const p = await api("/progress");
  const tile = (value, label) => h("div", { class: "card", style: "margin:0" }, h("div", { class: "stat" }, value), h("div", { class: "stat-label" }, label));
  const max = Math.max(1, ...p.heatmap.map((d) => d.count));
  const level = (c) => (c === 0 ? 0 : Math.min(4, Math.ceil((c / max) * 4)));
  const names = Object.fromEntries(p.topics.map((t) => [t.id, t.name]));
  const coachBox = h("div");

  set(view(), 
    h("h1", {}, "Your progress"),
    h("div", { class: "grid four", style: "margin-bottom:16px" },
      tile(`${p.streak}🔥`, "day streak"),
      tile(`${p.averageMastery}%`, "average mastery"),
      tile(p.topics.length, "topics"),
      tile(p.dueCards, "cards due")),
    h("div", { class: "card accent" },
      h("div", { class: "row" }, h("h2", { style: "margin:0" }, "Coach"), h("span", { class: "spacer" }),
        h("button", { class: "primary", onclick: (e) => runCoach(coachBox, e.currentTarget) }, "What should I do next?")),
      coachBox),
    h("div", { class: "card" },
      h("h2", {}, "Activity (last 12 weeks)"),
      h("div", { class: "heatmap" }, p.heatmap.map((d) => h("span", { "data-l": level(d.count), title: `${d.day}: ${d.count} activities` }))),
      h("p", { class: "small muted", style: "margin:8px 0 0" }, `${p.totalActivities} learning activities logged. Consistency beats intensity.`)),
    h("div", { class: "card" },
      h("h2", {}, "Mastery by topic"),
      h("p", { class: "small muted" }, "Mastery blends your recent quiz scores (45%), teach-back scores (30%) and long-term flashcard retention (25%)."),
      p.topics.length
        ? p.topics.map((t) => h("div", { class: "mastery-row" },
            h("div", { class: "row" },
              h("a", { href: `#/topic/${t.id}` }, h("strong", {}, t.name)),
              h("span", { class: "spacer" }),
              h("span", { class: `pill ${masteryClass(t.mastery.score)}` }, `${t.mastery.level} · ${t.mastery.score}%`)),
            h("div", { style: "margin-top:6px" }, bar(t.mastery.score)),
            h("div", { class: "components" },
              h("span", {}, `Quiz: ${t.mastery.components.quiz ?? "–"}${t.mastery.components.quiz != null ? "%" : ""} (${t.mastery.counts.quizzes})`),
              h("span", {}, `Teach-back: ${t.mastery.components.feynman ?? "–"} (${t.mastery.counts.feynman})`),
              h("span", {}, `Retention: ${t.mastery.components.retention ?? "–"}${t.mastery.components.retention != null ? "%" : ""} of ${t.mastery.counts.cards} cards`),
              t.planProgress ? h("span", {}, `Plan: ${t.planProgress.done}/${t.planProgress.total}`) : null,
              h("a", { href: `#/topic/${t.id}/practice/quiz` }, "Practise →"))))
        : h("div", { class: "empty" }, "No topics yet. ", h("a", { href: "#/" }, "Explore your first one."))),
    p.quizHistory.length
      ? h("div", { class: "card" },
          h("h2", {}, "Recent quiz scores"),
          h("div", { class: "quiz-bars" }, p.quizHistory.map((q) => h("span", { style: `height:${Math.max(3, q.percent)}%`, title: `${names[q.topicId] || ""} · ${q.percent}% · ${q.at.slice(0, 10)}` }))))
      : null,
  );
}

// ---------------- techniques ----------------
function renderTechniques() {
  const tryIt = (t) => {
    if (t.tryIt === "review") return go("#/review");
    if (t.tryIt === "progress") return go("#/progress");
    const topicId = state.lastTopicId || state.topics[0]?.id;
    if (!topicId) {
      toast("Explore a topic first, then try this technique on it.");
      return go("#/");
    }
    go(actionRoute(t.tryIt, topicId));
  };
  set(view(), 
    h("h1", {}, "Learning techniques"),
    h("p", { class: "muted" }, "The most effective, research-backed ways to learn - and where to practise each one in Luminary."),
    h("div", { class: "grid two" }, window.TECHNIQUES.map((t) =>
      h("div", { class: "card technique" },
        h("h3", {}, t.name),
        h("div", { class: "tagline" }, t.tagline),
        h("p", { class: "small" }, t.why),
        h("details", {}, h("summary", { class: "small" }, "How to do it"),
          h("ol", { class: "small" }, t.how.map((s) => h("li", {}, s))),
          h("p", { class: "small muted" }, h("strong", {}, "Best for: "), t.when)),
        h("button", { style: "margin-top:10px", onclick: () => tryIt(t) }, "Try it →")))),
  );
}

// ---------------- boot ----------------
async function boot() {
  $("#menu-btn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  try {
    state.status = await api("/status");
    $("#status").textContent = state.status.mock ? "Demo mode · canned responses" : `Powered by ${state.status.model}`;
  } catch {}
  await refreshSidebar();
  window.addEventListener("hashchange", route);
  route();
}

boot();
