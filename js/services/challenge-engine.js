/* ==========================================================================
   DagoOS — Challenge Engine
   --------------------------------------------------------------------------
   Pure computation for challenge scoring. No Firebase, no DOM. Every function
   takes data and returns data. Easy to test, easy to reason about.

   Terminology:
     • Task status: "full" | "partial" | "missed"
     • Unmarked tasks: not in the statuses map at all
     • Day score: weighted average of marked tasks (full=1, partial=0.5, missed=0)
     • Overall accuracy: sum of all day scores / total possible over the challenge
   ========================================================================== */

export const STATUS_WEIGHT = {
  full: 1.0,
  partial: 0.5,
  missed: 0.0
};


/* --------------------------------------------------------------------------
   1. DAY SCORING
   -------------------------------------------------------------------------- */

/**
 * Given a day's statuses and the challenge's task list, return the weighted
 * score as a number 0–1, plus metadata.
 */
export function scoreDay(statuses, tasks) {
  if (!tasks || tasks.length === 0) {
    return { score: 0, markedCount: 0, totalCount: 0, percent: 0 };
  }

  let sum = 0;
  let marked = 0;

  for (const task of tasks) {
    const status = statuses?.[task];
    if (status && STATUS_WEIGHT[status] !== undefined) {
      sum += STATUS_WEIGHT[status];
      marked++;
    }
  }

  const score = tasks.length > 0 ? sum / tasks.length : 0;
  return {
    score,
    markedCount: marked,
    totalCount: tasks.length,
    percent: Math.round(score * 100)
  };
}


/* --------------------------------------------------------------------------
   2. DAY COLOR
   -------------------------------------------------------------------------- */

/**
 * Returns a semantic class name for a given day score.
 *   "unmarked" — nothing recorded
 *   "green"    — ≥ 80%
 *   "amber"    — 50–79%
 *   "red"      — < 50%
 */
export function dayColor(score, markedCount) {
  if (markedCount === 0) return 'unmarked';
  if (score >= 0.8) return 'green';
  if (score >= 0.5) return 'amber';
  return 'red';
}


/* --------------------------------------------------------------------------
   3. STREAK
   --------------------------------------------------------------------------
   A "soft streak" = consecutive days where score ≥ 50%. Breaking it is
   informational only — it doesn't affect the final accuracy.
   -------------------------------------------------------------------------- */
export function currentStreak(days, tasks, endDate = null) {
  const byDate = {};
  for (const d of days) byDate[d.date] = d;

  const end = endDate ? new Date(endDate) : new Date();
  let streak = 0;
  let cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  // Walk backwards from today
  for (let i = 0; i < 365; i++) {
    const iso = formatISO(cursor);
    const day = byDate[iso];

    if (!day) break;

    const { score, markedCount } = scoreDay(day.statuses, tasks);
    if (markedCount === 0) break;

    if (score >= 0.5) {
      streak++;
    } else {
      break;
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function longestStreak(days, tasks) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let best = 0;
  let run = 0;
  let prevDate = null;

  for (const d of sorted) {
    const { score, markedCount } = scoreDay(d.statuses, tasks);
    if (markedCount === 0) { run = 0; prevDate = d.date; continue; }

    const isConsecutive = prevDate
      ? daysBetween(prevDate, d.date) === 1
      : true;

    if (!isConsecutive) run = 0;

    if (score >= 0.5) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }

    prevDate = d.date;
  }

  return best;
}


/* --------------------------------------------------------------------------
   4. OVERALL ACCURACY
   -------------------------------------------------------------------------- */

/**
 * Given all days and the challenge's tasks, compute the total weighted
 * accuracy for the whole challenge. Days with no recorded status are counted
 * as 0 (missed).
 */
export function overallAccuracy(challenge, days) {
  const tasks = challenge.tasks || [];
  if (tasks.length === 0) return { accuracy: 0, totalMarked: 0, daysElapsed: 0 };

  const byDate = {};
  for (const d of days) byDate[d.date] = d;

  const start = new Date(challenge.startDate);
  const totalDays = challenge.durationDays;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let totalWeighted = 0;
  let daysElapsed = 0;
  let totalMarked = 0;

  for (let i = 0; i < totalDays; i++) {
    const cursor = new Date(start);
    cursor.setDate(start.getDate() + i);

    // Don't score future days
    if (cursor > today) continue;

    daysElapsed++;
    const iso = formatISO(cursor);
    const day = byDate[iso];

    if (day) {
      const { score, markedCount } = scoreDay(day.statuses, tasks);
      totalWeighted += score;
      totalMarked += markedCount;
    }
    // Unmarked past days contribute 0
  }

  const accuracy = daysElapsed > 0 ? totalWeighted / daysElapsed : 0;
  return {
    accuracy: Math.round(accuracy * 100),
    totalMarked,
    daysElapsed,
    totalDays
  };
}


/* --------------------------------------------------------------------------
   5. HELPERS
   -------------------------------------------------------------------------- */

export function formatISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return formatISO(new Date());
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  const ms = Math.abs(b - a);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}


/* --------------------------------------------------------------------------
   6. ENUMERATE CHALLENGE DATES
   --------------------------------------------------------------------------
   Returns an array of ISO dates for every day from startDate to
   startDate + durationDays - 1.
   -------------------------------------------------------------------------- */
export function enumerateDates(startDateISO, durationDays) {
  const start = new Date(startDateISO);
  const dates = [];
  for (let i = 0; i < durationDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(formatISO(d));
  }
  return dates;
}
