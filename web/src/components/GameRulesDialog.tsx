import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  onClose: () => void
}

const RULES = [
  {
    title: 'Classic',
    body: 'Teams are ranked based on overall standing in the tournament.',
  },
  {
    title: 'Odds Based',
    body: 'The winner of each match will gain points based on the odds to win or draw. For example England Vs Croatia, 2:10 to win. If Croatia win they get 10 points and England 0. Both teams get points on a draw.',
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
] as const

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
