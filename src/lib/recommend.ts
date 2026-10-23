import { Macros, SleepLog, Workout } from "./db";

export type Recommendation = { icon: string; text: string };

/**
 * Turns whatever's already been logged into a handful of concrete,
 * data-backed suggestions.
 *
 * Deliberately NOT an AI call: every line here is explainable from the
 * numbers that produced it, costs nothing per view, and never goes stale
 * between visits to the Analytics tab. An LLM call here would trade a free,
 * instant, honest computation for a slow, costed, occasionally wrong one —
 * a bad trade for a page people check daily.
 */
export function buildRecommendations(input: {
  loggedDays: number;
  nDays: number;
  avgProtein: number;
  goalProtein: number;
  avgCalories: number;
  goalCalories: number;
  workouts: Workout[];
  sleep: SleepLog[];
}): Recommendation[] {
  const { loggedDays, nDays, avgProtein, goalProtein, avgCalories, goalCalories, workouts, sleep } = input;
  const out: Recommendation[] = [];

  // --- consistency -----------------------------------------------------
  const loggedRatio = loggedDays / Math.max(nDays, 1);
  if (loggedDays === 0) {
    out.push({ icon: "restaurant-outline", text: "Log a meal to start seeing trends here." });
  } else if (loggedRatio < 0.5) {
    out.push({
      icon: "calendar-outline",
      text: `Only ${loggedDays} of the last ${nDays} days have a meal logged — trends get sharper with more days.`,
    });
  }

  // --- protein -----------------------------------------------------------
  if (loggedDays > 0 && avgProtein < goalProtein * 0.85) {
    const gap = Math.round(goalProtein - avgProtein);
    out.push({
      icon: "flame-outline",
      text: `Protein is averaging ${gap}g short of your ${goalProtein}g goal most days — an extra egg or a scoop of protein closes most of that.`,
    });
  }

  // --- calories direction --------------------------------------------
  if (loggedDays > 0 && goalCalories) {
    const diff = avgCalories - goalCalories;
    if (diff > goalCalories * 0.12) {
      out.push({
        icon: "trending-up-outline",
        text: `Averaging ${Math.round(diff)} kcal over your goal — worth a lighter dinner on the heavier days.`,
      });
    } else if (diff < -goalCalories * 0.12) {
      out.push({
        icon: "trending-down-outline",
        text: `Averaging ${Math.round(-diff)} kcal under your goal — make sure that's intentional, not just under-logging.`,
      });
    }
  }

  // --- workouts ------------------------------------------------------
  const weeks = Math.max(nDays / 7, 1);
  const perWeek = workouts.length / weeks;
  if (workouts.length === 0) {
    out.push({ icon: "barbell-outline", text: "No workouts logged in this range yet — log one from the Training tab." });
  } else if (perWeek < 2) {
    out.push({
      icon: "barbell-outline",
      text: `${workouts.length} ${workouts.length === 1 ? "session" : "sessions"} in ${nDays} days — most programs aim for 3+ a week.`,
    });
  }

  // --- sleep -----------------------------------------------------------
  if (sleep.length > 0) {
    const avgMin = sleep.reduce((s, n) => s + n.minutes, 0) / sleep.length;
    const avgHours = avgMin / 60;
    if (avgHours < 6.5) {
      out.push({
        icon: "moon-outline",
        text: `Averaging ${avgHours.toFixed(1)}h of sleep on the nights you logged — under 7h consistently slows recovery and makes hunger harder to judge.`,
      });
    }
  } else if (loggedDays > 0) {
    out.push({ icon: "moon-outline", text: "No sleep logged yet — add a night from the Training tab to see how it tracks against your eating." });
  }

  return out.slice(0, 4);
}
