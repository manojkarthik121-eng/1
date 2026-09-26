// Tiny JSON-file persistence layer. Single-user, local-first: every mutation
// is written atomically (temp file + rename) so a crash never corrupts the DB.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const EMPTY = () => ({
  topics: [],
  cards: [],
  quizzes: [],
  feynman: [],
  activity: [],
});

export class Store {
  constructor(file) {
    this.file = file;
    this.data = EMPTY();
    if (file && fs.existsSync(file)) {
      this.data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, "utf8")) };
    }
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  static id() {
    return crypto.randomUUID();
  }

  // ---- topics ----
  listTopics() {
    return this.data.topics;
  }

  getTopic(id) {
    return this.data.topics.find((t) => t.id === id) ?? null;
  }

  createTopic(name) {
    const topic = {
      id: Store.id(),
      name,
      createdAt: new Date().toISOString(),
      depthMap: null,
      plan: null,
      chat: [],
    };
    this.data.topics.unshift(topic);
    this.save();
    return topic;
  }

  updateTopic(id, patch) {
    const topic = this.getTopic(id);
    if (!topic) return null;
    Object.assign(topic, patch);
    this.save();
    return topic;
  }

  deleteTopic(id) {
    const d = this.data;
    d.topics = d.topics.filter((t) => t.id !== id);
    d.cards = d.cards.filter((c) => c.topicId !== id);
    d.quizzes = d.quizzes.filter((q) => q.topicId !== id);
    d.feynman = d.feynman.filter((f) => f.topicId !== id);
    d.activity = d.activity.filter((a) => a.topicId !== id);
    this.save();
  }

  // ---- generic append helpers ----
  add(collection, record) {
    const rec = { id: Store.id(), at: new Date().toISOString(), ...record };
    this.data[collection].push(rec);
    this.save();
    return rec;
  }

  log(type, topicId, detail = {}) {
    return this.add("activity", { type, topicId, ...detail });
  }
}
