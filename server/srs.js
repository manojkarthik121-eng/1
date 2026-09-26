// Spaced repetition using the SM-2 algorithm (the one behind SuperMemo/Anki).
// grade: 0 = total blackout ... 5 = perfect recall.

const DAY = 24 * 60 * 60 * 1000;

export function newCard(topicId, front, back, now = Date.now()) {
  return {
    topicId,
    front,
    back,
    ease: 2.5,
    interval: 0, // days
    reps: 0,
    lapses: 0,
    due: new Date(now).toISOString(),
  };
}

export function review(card, grade, now = Date.now()) {
  const g = Math.max(0, Math.min(5, Math.round(grade)));
  let { ease, interval, reps, lapses } = card;

  if (g < 3) {
    reps = 0;
    interval = 1;
    lapses += 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ease);
  }

  ease = Math.max(1.3, ease + (0.1 - (5 - g) * (0.08 + (5 - g) * 0.02)));

  return {
    ...card,
    ease: Number(ease.toFixed(2)),
    interval,
    reps,
    lapses,
    lastReviewed: new Date(now).toISOString(),
    due: new Date(now + interval * DAY).toISOString(),
  };
}

export function isDue(card, now = Date.now()) {
  return new Date(card.due).getTime() <= now;
}

// A card counts as "retained" once it has survived to a week-long interval.
export function isMature(card) {
  return card.interval >= 7;
}
