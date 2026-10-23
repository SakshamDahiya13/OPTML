import { Workout } from "./db";

/**
 * Picks an icon for an exercise name.
 *
 * Every session used to get the same barbell icon regardless of what was in
 * it, which made a run and a push day indistinguishable at a glance. This is
 * a keyword match, not a category field on the exercise — adding a type
 * column would mean every existing row needs backfilling, and a guess from
 * the name the user already typed costs nothing.
 */
export function exerciseIcon(name: string): string {
  const n = name.toLowerCase();
  if (/run|jog|sprint|treadmill/.test(n)) return "walk-outline";
  if (/cycl|bike|spin/.test(n)) return "bicycle-outline";
  if (/swim/.test(n)) return "water-outline";
  if (/walk|hike/.test(n)) return "footsteps-outline";
  if (/row(ing)?\b/.test(n)) return "boat-outline";
  if (/yoga|stretch|mobility/.test(n)) return "body-outline";
  if (/plank|core|ab(s|dominal)/.test(n)) return "ellipse-outline";
  if (/push[\s-]?up|pull[\s-]?up|dip|burpee|bodyweight/.test(n)) return "fitness-outline";
  return "barbell-outline";
}

/** The best single icon to represent a whole workout — its first exercise. */
export function workoutIcon(w: Workout): string {
  const first = w.exercise_sets?.[0]?.exercise;
  return first ? exerciseIcon(first) : "barbell-outline";
}

/**
 * Whether ANY set in this workout has a weight on it.
 *
 * Volume (reps × weight) is meaningless for a workout that's entirely
 * cardio or bodyweight — every set shows up as "0kg" because there's
 * genuinely nothing to multiply, not because anything's missing.
 */
export function hasWeight(w: Workout): boolean {
  return (w.exercise_sets ?? []).some((s) => s.weight_kg != null && Number(s.weight_kg) > 0);
}

/** A short line describing a session: duration if it has one, else volume or set count. */
export function workoutSummary(w: Workout, volumeKg: number): string {
  if (w.duration_min) {
    return w.duration_min >= 60
      ? `${Math.floor(w.duration_min / 60)}h ${w.duration_min % 60 ? `${w.duration_min % 60}m` : ""}`.trim()
      : `${w.duration_min} min`;
  }
  const sets = w.exercise_sets?.length ?? 0;
  if (hasWeight(w)) return `${Math.round(volumeKg)} kg`;
  return `${sets} ${sets === 1 ? "set" : "sets"}`;
}

/** Whether this exercise is duration-based rather than rep-based. */
export function isCardio(name: string): boolean {
  return /run|jog|sprint|treadmill|cycl|bike|spin|swim|walk|hike|row(ing)?\b|plank|elliptical/i.test(name);
}
