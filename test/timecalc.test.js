import test from "node:test";
import assert from "node:assert/strict";
import { parseClock, parseDuration, formatDuration, diff, shift, sum, run } from "../tools/timecalc.js";

test("parses clock times", () => {
  assert.equal(parseClock("09:30"), 9 * 3600 + 30 * 60);
  assert.equal(parseClock("00:00:15"), 15);
  assert.equal(parseClock("12:00am"), 0);
  assert.equal(parseClock("9:30 pm"), 21 * 3600 + 30 * 60);
  assert.throws(() => parseClock("24:00"));
  assert.throws(() => parseClock("13:00pm"));
  assert.throws(() => parseClock("noon"));
});

test("parses durations", () => {
  assert.equal(parseDuration("1h30m"), 5400);
  assert.equal(parseDuration("90m"), 5400);
  assert.equal(parseDuration("1.5h"), 5400);
  assert.equal(parseDuration("1:30"), 5400);
  assert.equal(parseDuration("1d 2h"), 26 * 3600);
  assert.throws(() => parseDuration("1x"));
  assert.throws(() => parseDuration("1h banana"));
});

test("differences wrap past midnight", () => {
  assert.equal(formatDuration(diff("09:30", "17:45")), "8h 15m");
  assert.equal(formatDuration(diff("22:00", "06:30")), "8h 30m");
  assert.equal(diff("10:00", "10:00"), 0);
});

test("adds and subtracts durations across days", () => {
  assert.deepEqual(shift("22:30", parseDuration("2h15m")), { time: "00:45", days: 1 });
  assert.deepEqual(shift("00:30", -parseDuration("45m")), { time: "23:45", days: -1 });
  assert.equal(run(["add", "22:30", "2h15m"]), "00:45 (+1 day)");
  assert.equal(run(["sub", "09:30", "45m"]), "08:45");
});

test("sums durations", () => {
  assert.equal(formatDuration(sum(["1h30m", "45m", "2:10"])), "4h 25m");
  assert.equal(run(["sum", "30m", "30m"]), "1h  (1.00 hours)");
});
