// Pure, DB-free streak logic. Kept isolated so the date-math edge cases
// (day boundaries, freeze tokens) are unit-testable without Mongo.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FREEZE_CAP = 2; // max freeze tokens a user can bank
const FREEZE_EVERY = 7; // earn one freeze each time the streak crosses a multiple of this

// Parse 'YYYY-MM-DD' at UTC noon. Noon (not midnight) keeps whole-day
// differences immune to DST shifts when we only care about the date part.
function dayToUtcNoon(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

// Whole-day difference b - a for two 'YYYY-MM-DD' strings. Positive if b is later.
function dayDiff(a, b) {
  return Math.round((dayToUtcNoon(b) - dayToUtcNoon(a)) / MS_PER_DAY);
}

// Validate a 'YYYY-MM-DD' string.
function isValidDay(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day);
}

/**
 * Apply a reading event on `today` to an existing streak.
 * @param {object} streak - { current, longest, lastActiveDay, freezeTokens, lastFreezeEarnedAt }
 * @param {string} today - 'YYYY-MM-DD' local calendar day the read happened
 * @returns {{ streak: object, extendedToday: boolean }}
 *   extendedToday is true only on the event that grows the streak (drives the
 *   one-shot celebration); false when the same day is logged again.
 */
function applyStreakTransition(streak, today) {
  const prev = {
    current: streak?.current || 0,
    longest: streak?.longest || 0,
    lastActiveDay: streak?.lastActiveDay || null,
    freezeTokens: streak?.freezeTokens || 0,
    lastFreezeEarnedAt: streak?.lastFreezeEarnedAt || 0,
  };

  if (!isValidDay(today)) {
    return { streak: prev, extendedToday: false };
  }

  // Already counted today — idempotent no-op.
  if (prev.lastActiveDay === today) {
    return { streak: prev, extendedToday: false };
  }

  let current;
  let freezeTokens = prev.freezeTokens;

  if (!prev.lastActiveDay || !isValidDay(prev.lastActiveDay)) {
    current = 1; // first ever read
  } else {
    const gap = dayDiff(prev.lastActiveDay, today);
    if (gap <= 0) {
      // Clock skew / out-of-order day (today is same or before last active).
      // Don't extend, don't reset — treat as already active.
      return { streak: prev, extendedToday: false };
    } else if (gap === 1) {
      current = prev.current + 1; // consecutive day
    } else if (gap === 2 && freezeTokens > 0) {
      freezeTokens -= 1; // one missed day, covered by a freeze
      current = prev.current + 1;
    } else {
      current = 1; // streak broken
    }
  }

  const longest = Math.max(prev.longest, current);

  // Earn a freeze each time the streak crosses a new multiple of FREEZE_EVERY.
  let lastFreezeEarnedAt = prev.lastFreezeEarnedAt;
  const milestone = Math.floor(current / FREEZE_EVERY) * FREEZE_EVERY;
  if (milestone >= FREEZE_EVERY && milestone > lastFreezeEarnedAt) {
    lastFreezeEarnedAt = milestone;
    freezeTokens = Math.min(FREEZE_CAP, freezeTokens + 1);
  }

  return {
    streak: { current, longest, lastActiveDay: today, freezeTokens, lastFreezeEarnedAt },
    extendedToday: true,
  };
}

// Is the streak "active" as of `today` (read today, or yesterday and still savable)?
function isActiveToday(streak, today) {
  if (!streak?.lastActiveDay || !isValidDay(today)) return false;
  return streak.lastActiveDay === today;
}

module.exports = {
  applyStreakTransition,
  isActiveToday,
  dayDiff,
  isValidDay,
  FREEZE_CAP,
  FREEZE_EVERY,
};
