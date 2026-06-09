import type { CommentaryLine } from '@/lib/xiGame/matchPresentation'

type Props = {
  lines: CommentaryLine[]
  limit?: number
  className?: string
}

export function CommentaryFeed({ lines, limit, className = '' }: Props) {
  const visible = limit != null ? lines.slice(0, limit) : lines

  return (
    <div
      className={`space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-xs leading-relaxed ${className}`}
    >
      {visible.map((line, i) => (
        <CommentaryLineRow key={`${line.minute}-${line.type}-${i}`} line={line} />
      ))}
    </div>
  )
}

function CommentaryLineRow({ line }: { line: CommentaryLine }) {
  if (line.type === 'goal') {
    return (
      <div className="rounded-md border border-fifa-gold/40 bg-fifa-gold/10 px-2 py-2">
        <p className="text-base font-extrabold uppercase tracking-wide text-fifa-gold sm:text-lg">
          {line.minute}&apos; GOOOOAL!
        </p>
        <p className="mt-0.5 text-sm font-bold text-fifa-gold">
          {line.scorer} — {line.teamLabel}
        </p>
        <p className="mt-1 text-xs text-[var(--foreground)]">{line.text}</p>
      </div>
    )
  }

  const accent =
    line.type === 'penalty_awarded' || line.type === 'penalty_saved'
      ? 'font-semibold text-amber-600'
      : line.type === 'yellow_card'
        ? 'text-amber-500'
        : line.type === 'halftime' || line.type === 'fulltime'
          ? 'font-semibold text-[var(--muted)]'
          : ''

  return (
    <p className={accent}>
      {line.minute > 0 && <span className="text-[var(--muted)]">{line.minute}&apos; </span>}
      {line.text}
    </p>
  )
}
