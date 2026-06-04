import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const STAGES = [
  'group',
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final',
  'winner',
  'runner_up',
  'eliminated',
] as const

export type TeamAwardRow = {
  id: string
  name: string
  fifa_code: string
  tournament_stage: string
  global_fifa_rank: number | null
  golden_boot_player_name: string | null
  golden_boot_goals: number
  golden_glove_player_name: string | null
  golden_glove_clean_sheets: number
}

export type TeamAwardsSavePayload = {
  teamId: string
  tournament_stage: string
  global_fifa_rank: number | null
  golden_boot_player_name: string | null
  golden_boot_goals: number
  golden_glove_player_name: string | null
  golden_glove_clean_sheets: number
}

function TeamAwardsForm({
  team,
  onSave,
  saving,
}: {
  team: TeamAwardRow
  onSave: (p: TeamAwardsSavePayload) => void
  saving: boolean
}) {
  const [stage, setStage] = useState(team.tournament_stage)
  const [rank, setRank] = useState(String(team.global_fifa_rank ?? ''))
  const [bootName, setBootName] = useState(team.golden_boot_player_name ?? '')
  const [bootGoals, setBootGoals] = useState(String(team.golden_boot_goals ?? 0))
  const [gloveName, setGloveName] = useState(team.golden_glove_player_name ?? '')
  const [gloveCs, setGloveCs] = useState(String(team.golden_glove_clean_sheets ?? 0))

  return (
    <div className="rounded-lg border border-[var(--border)] p-3 text-sm">
      <p className="font-semibold">
        {team.name} ({team.fifa_code})
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Stage</Label>
          <select
            className="mt-1 w-full h-9 rounded border border-[var(--border)] bg-[var(--card)] px-2"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">FIFA rank</Label>
          <Input
            className="mt-1 h-9"
            type="number"
            min={1}
            value={rank}
            onChange={(e) => setRank(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Golden Boot player</Label>
          <Input className="mt-1 h-9" value={bootName} onChange={(e) => setBootName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Goals</Label>
          <Input
            className="mt-1 h-9"
            type="number"
            min={0}
            value={bootGoals}
            onChange={(e) => setBootGoals(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Golden Glove (GK)</Label>
          <Input className="mt-1 h-9" value={gloveName} onChange={(e) => setGloveName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Clean sheets</Label>
          <Input
            className="mt-1 h-9"
            type="number"
            min={0}
            value={gloveCs}
            onChange={(e) => setGloveCs(e.target.value)}
          />
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        className="mt-2"
        disabled={saving}
        onClick={() =>
          onSave({
            teamId: team.id,
            tournament_stage: stage,
            global_fifa_rank: rank === '' ? null : parseInt(rank, 10),
            golden_boot_player_name: bootName.trim() || null,
            golden_boot_goals: parseInt(bootGoals, 10) || 0,
            golden_glove_player_name: gloveName.trim() || null,
            golden_glove_clean_sheets: parseInt(gloveCs, 10) || 0,
          })
        }
      >
        Save {team.fifa_code}
      </Button>
    </div>
  )
}

export function TeamAwardsAdmin({
  teams,
  onSave,
  saving,
}: {
  teams: TeamAwardRow[]
  onSave: (p: TeamAwardsSavePayload) => void
  saving: boolean
}) {
  return (
    <div className="max-h-[28rem] space-y-4 overflow-y-auto">
      {teams.map((team) => (
        <TeamAwardsForm key={team.id} team={team} onSave={onSave} saving={saving} />
      ))}
    </div>
  )
}
