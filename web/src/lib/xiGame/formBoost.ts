/** WC match form → temporary raw OVR % modifier (mirrors edge _shared/form-boost.ts). */

export const FORM_NEUTRAL_MIN = 6
export const FORM_NEUTRAL_MAX = 7
export const FORM_PCT_PER_POINT = 1
export const FORM_BOOST_CAP_PCT = 2

export function matchRatingToBoostPct(rating: number): number {
  if (!Number.isFinite(rating) || rating <= 0) return 0
  if (rating >= FORM_NEUTRAL_MIN && rating <= FORM_NEUTRAL_MAX) return 0

  let pct: number
  if (rating > FORM_NEUTRAL_MAX) {
    pct = (rating - FORM_NEUTRAL_MAX) * FORM_PCT_PER_POINT
  } else {
    pct = (rating - FORM_NEUTRAL_MIN) * FORM_PCT_PER_POINT
  }

  return Math.max(-FORM_BOOST_CAP_PCT, Math.min(FORM_BOOST_CAP_PCT, pct))
}

export function applyFormBoostToRaw(storedRaw: number, boostPct: number): number {
  if (!Number.isFinite(storedRaw) || storedRaw <= 0 || boostPct === 0) return storedRaw
  return Math.round(storedRaw * (1 + boostPct / 100))
}

export function formatFormBoostLabel(boostPct: number | null | undefined): string | null {
  if (boostPct == null || boostPct === 0) return null
  const sign = boostPct > 0 ? '+' : ''
  return `${sign}${boostPct}%`
}
