/**
 * WC match form → temporary raw OVR % modifier.
 * Neutral band: 6.0–7.0 inclusive. >7 boosts, <6 penalises. ±2% cap.
 */

export const FORM_NEUTRAL_MIN = 6;
export const FORM_NEUTRAL_MAX = 7;
export const FORM_PCT_PER_POINT = 1;
export const FORM_BOOST_CAP_PCT = 2;
export const FORM_MIN_MINUTES = 45;
export const FORM_DECAY_DAYS = 3;

export function matchRatingToBoostPct(rating: number): number {
  if (!Number.isFinite(rating) || rating <= 0) return 0;
  if (rating >= FORM_NEUTRAL_MIN && rating <= FORM_NEUTRAL_MAX) return 0;

  let pct: number;
  if (rating > FORM_NEUTRAL_MAX) {
    pct = (rating - FORM_NEUTRAL_MAX) * FORM_PCT_PER_POINT;
  } else {
    pct = (rating - FORM_NEUTRAL_MIN) * FORM_PCT_PER_POINT;
  }

  return Math.max(-FORM_BOOST_CAP_PCT, Math.min(FORM_BOOST_CAP_PCT, pct));
}

export function applyFormBoostToRaw(storedRaw: number, boostPct: number): number {
  if (!Number.isFinite(storedRaw) || storedRaw <= 0 || boostPct === 0) return storedRaw;
  return Math.round(storedRaw * (1 + boostPct / 100));
}

export function parseMatchRating(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseMinutes(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? "0"), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
