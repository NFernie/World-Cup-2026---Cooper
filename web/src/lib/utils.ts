import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPoints(value: number | string | null | undefined) {
  const n = Number(value ?? 0)
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}
