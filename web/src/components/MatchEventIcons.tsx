/** Compact icons for match event rows. */
export function GoalIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`shrink-0 text-[var(--foreground)] ${className}`}
      aria-hidden
      fill="currentColor"
    >
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 2.2 10.1 5.5 8 8.8 5.9 5.5Z" opacity="0.85" />
      <path d="M8 13.8 5.9 10.5 8 7.2 10.1 10.5Z" opacity="0.85" />
      <path d="M2.2 8 5.5 5.9 8.8 8 5.5 10.1Z" opacity="0.85" />
      <path d="M13.8 8 10.5 10.1 7.2 8 10.5 5.9Z" opacity="0.85" />
    </svg>
  )
}

export function YellowCardIcon({ className = 'h-3.5 w-2.5' }: { className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-[2px] bg-yellow-400 shadow-sm ring-1 ring-yellow-500/40 ${className}`}
      aria-hidden
    />
  )
}

export function RedCardIcon({ className = 'h-3.5 w-2.5' }: { className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-[2px] bg-red-600 shadow-sm ring-1 ring-red-700/40 ${className}`}
      aria-hidden
    />
  )
}
