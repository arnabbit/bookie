const { applyStreakTransition, dayDiff, isValidDay, FREEZE_CAP } = require('../src/lib/streak');

const fresh = () => ({ current: 0, longest: 0, lastActiveDay: null, freezeTokens: 0, lastFreezeEarnedAt: 0 });

describe('dayDiff / isValidDay', () => {
  test('counts whole days across month + year boundaries', () => {
    expect(dayDiff('2026-01-01', '2026-01-02')).toBe(1);
    expect(dayDiff('2026-01-31', '2026-02-01')).toBe(1);
    expect(dayDiff('2025-12-31', '2026-01-01')).toBe(1);
    expect(dayDiff('2026-03-08', '2026-03-09')).toBe(1); // US DST spring-forward day
    expect(dayDiff('2026-01-10', '2026-01-05')).toBe(-5);
  });

  test('rejects malformed day strings', () => {
    expect(isValidDay('2026-1-1')).toBe(false);
    expect(isValidDay('not-a-day')).toBe(false);
    expect(isValidDay(null)).toBe(false);
    expect(isValidDay('2026-01-01')).toBe(true);
  });
});

describe('applyStreakTransition', () => {
  test('first ever read starts streak at 1', () => {
    const { streak, extendedToday } = applyStreakTransition(fresh(), '2026-07-13');
    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(1);
    expect(streak.lastActiveDay).toBe('2026-07-13');
    expect(extendedToday).toBe(true);
  });

  test('same day is idempotent (no double count)', () => {
    const s1 = applyStreakTransition(fresh(), '2026-07-13').streak;
    const { streak, extendedToday } = applyStreakTransition(s1, '2026-07-13');
    expect(streak.current).toBe(1);
    expect(extendedToday).toBe(false);
  });

  test('consecutive day extends the streak', () => {
    const s1 = applyStreakTransition(fresh(), '2026-07-13').streak;
    const { streak, extendedToday } = applyStreakTransition(s1, '2026-07-14');
    expect(streak.current).toBe(2);
    expect(streak.longest).toBe(2);
    expect(extendedToday).toBe(true);
  });

  test('a two-day gap resets when no freeze token is banked', () => {
    const s1 = { ...fresh(), current: 5, longest: 5, lastActiveDay: '2026-07-13', freezeTokens: 0 };
    const { streak } = applyStreakTransition(s1, '2026-07-15'); // missed the 14th
    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(5); // longest preserved
  });

  test('a freeze token covers exactly one missed day', () => {
    const s1 = { ...fresh(), current: 5, longest: 5, lastActiveDay: '2026-07-13', freezeTokens: 1, lastFreezeEarnedAt: 0 };
    const { streak, extendedToday } = applyStreakTransition(s1, '2026-07-15');
    expect(streak.current).toBe(6);
    expect(streak.freezeTokens).toBe(0); // token spent
    expect(extendedToday).toBe(true);
  });

  test('a gap larger than a freeze can cover still resets', () => {
    const s1 = { ...fresh(), current: 9, longest: 9, lastActiveDay: '2026-07-13', freezeTokens: 2 };
    const { streak } = applyStreakTransition(s1, '2026-07-20'); // 7-day gap
    expect(streak.current).toBe(1);
    expect(streak.freezeTokens).toBe(2); // untouched — freeze only covers a single day
  });

  test('earns a freeze token every 7th day, capped', () => {
    let s = fresh();
    const days = [];
    for (let d = 1; d <= 21; d++) days.push(`2026-08-${String(d).padStart(2, '0')}`);
    for (const day of days) s = applyStreakTransition(s, day).streak;
    expect(s.current).toBe(21);
    // milestones at 7, 14, 21 would earn 3 but cap is 2
    expect(s.freezeTokens).toBe(FREEZE_CAP);
  });

  test('clock skew (day before last active) does not extend or reset', () => {
    const s1 = { ...fresh(), current: 4, longest: 4, lastActiveDay: '2026-07-13' };
    const { streak, extendedToday } = applyStreakTransition(s1, '2026-07-12');
    expect(streak.current).toBe(4);
    expect(extendedToday).toBe(false);
  });

  test('invalid today string is a no-op', () => {
    const s1 = { ...fresh(), current: 3, longest: 3, lastActiveDay: '2026-07-13' };
    const { streak, extendedToday } = applyStreakTransition(s1, 'garbage');
    expect(streak.current).toBe(3);
    expect(extendedToday).toBe(false);
  });
});
