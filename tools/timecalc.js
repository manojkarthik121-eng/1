#!/usr/bin/env node
// Time calculator: differences between clock times, adding/subtracting
// durations, and totalling durations.
//
//   node tools/timecalc.js diff 09:30 17:45      -> 8h 15m
//   node tools/timecalc.js add 22:30 2h15m       -> 00:45 (+1 day)
//   node tools/timecalc.js sub 09:30 45m         -> 08:45
//   node tools/timecalc.js sum 1h30m 45m 2:10    -> 4h 25m
//
// Clock times are HH:MM or HH:MM:SS (24h), optionally with am/pm.
// Durations are like 1h30m, 90m, 45s, 1d2h, 1.5h or H:MM[:SS].
import { pathToFileURL } from "node:url";

const DAY = 86400;
const UNIT = { d: DAY, h: 3600, m: 60, s: 1 };

// Parse a clock time into seconds since midnight.
export function parseClock(text) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text.trim());
  if (!m) throw new Error(`Not a clock time: "${text}" (use HH:MM, HH:MM:SS or 9:30pm)`);
  let [, h, min, s = "0", ampm] = m;
  h = Number(h);
  if (ampm) {
    if (h < 1 || h > 12) throw new Error(`Hour must be 1-12 with am/pm: "${text}"`);
    h = (h % 12) + (ampm.toLowerCase() === "pm" ? 12 : 0);
  }
  if (h > 23 || Number(min) > 59 || Number(s) > 59) throw new Error(`Out of range: "${text}"`);
  return h * 3600 + Number(min) * 60 + Number(s);
}

// Parse a duration into seconds.
export function parseDuration(text) {
  const t = text.trim().toLowerCase();
  if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(t)) {
    const [h, m, s = 0] = t.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  }
  const parts = [...t.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/g)];
  if (!parts.length || parts.map((p) => p[0]).join("") !== t.replace(/\s+/g, "")) {
    throw new Error(`Not a duration: "${text}" (use e.g. 1h30m, 90m, 1.5h or 1:30)`);
  }
  return Math.round(parts.reduce((sum, [, n, u]) => sum + Number(n) * UNIT[u], 0));
}

export function formatClock(seconds) {
  const s = ((seconds % DAY) + DAY) % DAY;
  const pad = (n) => String(n).padStart(2, "0");
  const out = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}`;
  return s % 60 ? `${out}:${pad(s % 60)}` : out;
}

export function formatDuration(seconds) {
  if (seconds === 0) return "0m";
  const sign = seconds < 0 ? "-" : "";
  let rest = Math.abs(seconds);
  const parts = [];
  for (const [u, size] of Object.entries(UNIT)) {
    const n = Math.floor(rest / size);
    rest %= size;
    if (n) parts.push(`${n}${u}`);
  }
  return sign + parts.join(" ");
}

// Seconds from `start` to `end`; an end earlier than the start is the next day.
export function diff(start, end) {
  const d = parseClock(end) - parseClock(start);
  return d < 0 ? d + DAY : d;
}

// Shift a clock time by a signed duration; returns the new time and day offset.
export function shift(clock, seconds) {
  const total = parseClock(clock) + seconds;
  return { time: formatClock(total), days: Math.floor(total / DAY) };
}

export function sum(durations) {
  return durations.reduce((acc, d) => acc + parseDuration(d), 0);
}

function dayNote(days) {
  if (!days) return "";
  return ` (${days > 0 ? "+" : ""}${days} day${Math.abs(days) === 1 ? "" : "s"})`;
}

export function run(args) {
  const [cmd, ...rest] = args;
  switch (cmd) {
    case "diff": {
      if (rest.length !== 2) throw new Error("usage: diff <start> <end>");
      const s = diff(rest[0], rest[1]);
      return `${formatDuration(s)}  (${(s / 3600).toFixed(2)} hours)`;
    }
    case "add":
    case "sub": {
      if (rest.length !== 2) throw new Error(`usage: ${cmd} <time> <duration>`);
      const d = parseDuration(rest[1]);
      const { time, days } = shift(rest[0], cmd === "add" ? d : -d);
      return time + dayNote(days);
    }
    case "sum": {
      if (!rest.length) throw new Error("usage: sum <duration> [duration ...]");
      const s = sum(rest);
      return `${formatDuration(s)}  (${(s / 3600).toFixed(2)} hours)`;
    }
    default:
      return [
        "Time calculator",
        "  diff <start> <end>         time between two clock times",
        "  add  <time> <duration>     clock time plus a duration",
        "  sub  <time> <duration>     clock time minus a duration",
        "  sum  <duration> ...        total of several durations",
        "",
        "Times: 09:30, 17:45:10, 9:30pm   Durations: 1h30m, 90m, 1.5h, 1:30, 1d2h",
      ].join("\n");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    console.log(run(process.argv.slice(2)));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
