import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  onClose: () => void
}

type Rule = {
  title: string
  body: string
  bullets?: readonly string[]
}

const RULES: readonly Rule[] = [
  {
    title: 'Classic',
    body: 'Teams are ranked based on overall standing in the tournament.',
  },
  {
    title: 'Odds Based',
    body: 'In this format your team will gain points based on official betting odds. It is designed to favour lower ranked teams who overperform in the group stage.',
    bullets: [
      'Each match can gain points based on betting odds determined 2hrs before Kick-Off.',
      'If your team wins it gains the number of points determined by odds on to Win',
      'The losing team earns no points',
      'In the case of a draw, each team gains points equal to their win odds divided by 2 (e.g. England vs Curaçao at 2/30 — on a draw England get 1 and Curaçao get 15).',
    ],
  },
  {
    title: 'Golden Boot / Glove',
    body: 'Winner is the team whose player wins the award. For example Harry Kane wins Golden boot, England take the prize.',
  },
  {
    title: 'Wooden spoon',
    body: 'Highest Rank team to get eliminated in the group stage is our competitions wooden spoon.',
  },
  {
    title: "People's champion",
    body: 'Lowest Rank team to make it out of the group stage is our competitions peoples champion.',
  },
]

export function GameRulesDialog({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-rules-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="game-rules-title" className="text-xl font-bold text-[var(--foreground)]">
            Leaderboard Rules
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ul className="mt-4 space-y-4">
          {RULES.map((rule) => (
            <li key={rule.title}>
              <p className="font-semibold text-[var(--foreground)]">{rule.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{rule.body}</p>
              {rule.bullets && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-[var(--muted)]">
                  {rule.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Got it</Button>
        </div>
      </div>
    </div>
  )
}
