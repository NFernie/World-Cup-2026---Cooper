import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Dices, Info, RotateCcw, Sparkles, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { TeamFlag } from '@/components/TeamFlag'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { PoolOutletContext } from '@/pages/PoolShell'
import { FORMATIONS, getFormation, type FormationSlot } from '@/lib/xiGame/formations'
import { XiPitch } from '@/components/xiGame/XiPitch'
import { TournamentRun } from '@/components/xiGame/TournamentRun'
import { buildXiGameBanterMetadata, banterSummaryText } from '@/lib/xiGame/banterShare'
import { autoDraftWithRounds } from '@/lib/xiGame/autoDraft'
import { isComplete, openSlots, spinTeam } from '@/lib/xiGame/draft'
import { fetchAllSquadPlayers } from '@/lib/xiGame/squads'
import type { TournamentRunResult } from '@/lib/xiGame/matchPresentation'
import { exitRoundLabel } from '@/lib/xiGame/simulate'
import { formatPositionLabel } from '@/lib/xiGame/positions'
import {
  buildDraftPick,
  type DraftPick,
  type GameTeam,
  type SquadPlayer,
} from '@/lib/xiGame/types'

type Phase = 'setup' | 'auto_drafting' | 'drafting' | 'tournament' | 'result'

const TOTAL_ROUNDS = 11
const GAME_TITLE = 'Can you win the World Cup?'

export function XiGamePage() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user } = useAuth()
  const { assignedTeamName } = useOutletContext<PoolOutletContext>()

  const [phase, setPhase] = useState<Phase>('setup')
  const [formationId, setFormationId] = useState<string>(FORMATIONS[0].id)
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [currentTeam, setCurrentTeam] = useState<GameTeam | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<SquadPlayer | null>(null)
  const [result, setResult] = useState<TournamentRunResult | null>(null)
  const [banterPosted, setBanterPosted] = useState(false)
  const [banterError, setBanterError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [autoDraftRounds, setAutoDraftRounds] = useState<ReturnType<typeof autoDraftWithRounds>>([])
  const [autoDraftIndex, setAutoDraftIndex] = useState(0)

  const settingQuery = useQuery({
    queryKey: ['app-setting', 'spin_draft'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'spin_draft')
        .maybeSingle()
      if (error) throw error
      return (data?.value ?? { enabled: true, squads_provisional: true }) as {
        enabled?: boolean
        squads_provisional?: boolean
      }
    },
  })

  const teamsQuery = useQuery({
    queryKey: ['xi-game-teams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, fifa_code, global_fifa_rank')
        .order('name')
      if (error) throw error
      return (data ?? []) as GameTeam[]
    },
  })

  const squadsQuery = useQuery({
    queryKey: ['xi-game-squads'],
    queryFn: fetchAllSquadPlayers,
  })

  const memberQuery = useQuery({
    queryKey: ['pool-member', poolId, user?.id],
    enabled: Boolean(poolId && user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_members')
        .select('id, display_name')
        .eq('pool_id', poolId!)
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const squadsByTeam = useMemo(() => {
    const map = new Map<string, SquadPlayer[]>()
    for (const p of squadsQuery.data ?? []) {
      const list = map.get(p.team_id) ?? []
      list.push(p)
      map.set(p.team_id, list)
    }
    return map
  }, [squadsQuery.data])

  const formation = getFormation(formationId)
  const usedTeamIds = picks.map((p) => p.team.id)
  const usedPlayerIds = new Set(picks.map((p) => p.player.id))
  const round = picks.length + 1
  const open = openSlots(formation, picks)
  const openSlotIds = new Set(open.map((s) => s.id))
  const squadsReady = (squadsQuery.data?.length ?? 0) > 0
  const provisional = settingQuery.data?.squads_provisional !== false

  function resetSession() {
    setPicks([])
    setCurrentTeam(null)
    setSelectedPlayer(null)
    setResult(null)
    setBanterPosted(false)
    setBanterError(null)
    setAutoDraftRounds([])
    setAutoDraftIndex(0)
  }

  function startGame() {
    resetSession()
    setPhase('drafting')
  }

  function startAutoFill() {
    const teams = (teamsQuery.data ?? []).filter((t) => squadsByTeam.has(t.id))
    if (teams.length === 0) return
    const rounds = autoDraftWithRounds(formation, teams, squadsByTeam)
    resetSession()
    setAutoDraftRounds(rounds)
    setAutoDraftIndex(0)
    setPhase('auto_drafting')
  }

  useEffect(() => {
    if (phase !== 'auto_drafting' || autoDraftRounds.length === 0) return
    const timer = window.setTimeout(() => {
      if (autoDraftIndex + 1 >= autoDraftRounds.length) {
        setPicks(autoDraftRounds.map((r) => r.pick))
        setPhase('tournament')
      } else {
        setAutoDraftIndex((i) => i + 1)
      }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [phase, autoDraftIndex, autoDraftRounds])

  function spin() {
    const teams = (teamsQuery.data ?? []).filter((t) => squadsByTeam.has(t.id))
    if (teams.length === 0) return
    setSelectedPlayer(null)
    setCurrentTeam(spinTeam(teams, usedTeamIds))
  }

  function placeInSlot(slot: FormationSlot) {
    if (!selectedPlayer || !currentTeam) return
    if (!openSlotIds.has(slot.id)) return
    const pick = buildDraftPick(slot, selectedPlayer, currentTeam)
    const nextPicks = [...picks, pick]
    setPicks(nextPicks)
    setCurrentTeam(null)
    setSelectedPlayer(null)
    if (isComplete(formation, nextPicks)) {
      setPhase('tournament')
    }
  }

  function finishTournament(sim: TournamentRunResult) {
    setResult(sim)
    setPhase('result')
    void persistSession(picks, sim)
  }

  async function persistSession(finalPicks: DraftPick[], sim: TournamentRunResult) {
    if (!user) return
    try {
      const { data: session, error } = await supabase
        .from('xi_game_sessions')
        .insert({
          user_id: user.id,
          pool_id: poolId ?? null,
          formation: formationId,
          mode: 'classic',
          status: 'complete',
          result_json: sim,
        })
        .select('id')
        .single()
      if (error || !session) return
      await supabase.from('xi_game_picks').insert(
        finalPicks.map((p, i) => ({
          session_id: session.id,
          round: i + 1,
          spun_team_id: p.team.id,
          squad_player_id: p.player.id,
          slot_position: p.slotLabel,
        })),
      )
    } catch {
      // Persistence is best-effort; the result is already shown.
    }
  }

  async function postToBanter() {
    if (!result || !poolId) return
    const member = memberQuery.data
    if (!member) {
      setBanterError('Join the group to post banter.')
      return
    }
    setPosting(true)
    setBanterError(null)
    try {
      const { error } = await supabase.from('pool_banter_messages').insert({
        pool_id: poolId,
        pool_member_id: member.id,
        user_id: user!.id,
        display_name: member.display_name,
        message: banterSummaryText(result, formation),
        metadata_json: buildXiGameBanterMetadata(picks, formation, result),
      })
      if (error) throw error
      setBanterPosted(true)
    } catch (err) {
      setBanterError((err as Error).message)
    } finally {
      setPosting(false)
    }
  }

  if (settingQuery.data?.enabled === false) {
    return (
      <GameFrame>
        <Card className="p-6 text-center">
          <CardTitle>{GAME_TITLE}</CardTitle>
          <CardDescription className="mt-2">Coming soon.</CardDescription>
        </Card>
      </GameFrame>
    )
  }

  return (
    <GameFrame>
      {provisional && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--primary)]/40 bg-[var(--primary)]/8 px-3 py-2 text-xs text-[var(--foreground)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
          <span>
            <strong>Provisional squads.</strong> Players and ratings are based on current
            data and will update when FIFA announces the final 26-man squads.
          </span>
        </div>
      )}

      {phase === 'setup' && (
        <Card className="space-y-4 p-5">
          <div>
            <CardTitle className="text-xl">{GAME_TITLE}</CardTitle>
            <CardDescription className="mt-1">
              Spin a random nation, draft a player into your XI, and place them in your formation.
              Natural positions perform best — wrong role costs 5%, wrong area costs 10%.
              Fill all 11 spots, then see how far your squad goes.
            </CardDescription>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="formation">Formation</Label>
            <select
              id="formation"
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              value={formationId}
              onChange={(e) => setFormationId(e.target.value)}
            >
              {FORMATIONS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {!squadsReady ? (
            <p className="text-sm text-[var(--muted)]">
              {squadsQuery.isLoading
                ? 'Loading squads…'
                : 'Squads have not been loaded yet. Check back once the squad sync has run.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={startGame} className="w-full sm:w-auto">
                <Dices className="h-4 w-4" /> Start drafting
              </Button>
              <Button variant="outline" onClick={startAutoFill} className="w-full sm:w-auto">
                <Sparkles className="h-4 w-4" /> Auto-fill team
              </Button>
            </div>
          )}
          {squadsReady && (
            <p className="text-xs text-[var(--muted)]">
              Auto-fill spins 11 nations, drafts the best natural-fit players, and jumps straight
              to kick-off.
            </p>
          )}
        </Card>
      )}

      {phase === 'auto_drafting' && autoDraftRounds.length > 0 && (
        <Card className="space-y-4 p-5 text-center">
          <CardTitle className="text-lg">Auto-filling your XI…</CardTitle>
          <CardDescription>
            Round {Math.min(autoDraftIndex + 1, TOTAL_ROUNDS)} of {TOTAL_ROUNDS}
          </CardDescription>
          {autoDraftRounds[autoDraftIndex] && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="animate-pulse">
                <Dices className="h-10 w-10 text-[var(--primary)]" aria-hidden />
              </div>
              <TeamFlag
                fifaCode={autoDraftRounds[autoDraftIndex].team.fifa_code}
                size={48}
                title={autoDraftRounds[autoDraftIndex].team.name}
              />
              <p className="font-semibold">{autoDraftRounds[autoDraftIndex].team.name}</p>
              {autoDraftIndex > 0 && (
                <p className="text-xs text-[var(--muted)]">
                  Placed{' '}
                  <strong>{autoDraftRounds[autoDraftIndex - 1].pick.player.name}</strong> at{' '}
                  {autoDraftRounds[autoDraftIndex - 1].pick.slotLabel}
                </p>
              )}
            </div>
          )}
          <div className="mx-auto flex max-w-xs flex-wrap justify-center gap-1">
            {autoDraftRounds.slice(0, autoDraftIndex).map((r) => (
              <TeamFlag key={r.round} fifaCode={r.team.fifa_code} size={20} title={r.team.name} />
            ))}
          </div>
        </Card>
      )}

      {phase === 'drafting' && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">
                Round {Math.min(round, TOTAL_ROUNDS)} of {TOTAL_ROUNDS}
              </p>
              <p className="text-xs text-[var(--muted)]">{formation.name}</p>
            </div>
            <XiPitch
              formation={formation}
              picks={picks}
              selectedPlayer={selectedPlayer}
              openSlotIds={openSlotIds}
              onSlotClick={placeInSlot}
            />
            {selectedPlayer && (
              <p className="mt-3 text-center text-xs text-[var(--muted)]">
                Tap a highlighted slot to place <strong>{selectedPlayer.name}</strong>.
                Green = matches position code (+5%), amber = matches position area, gold = out of position (−10%).
              </p>
            )}
          </Card>

          <Card className="p-4">
            {!currentTeam ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-[var(--muted)]">
                  Spin to draw a nation, then choose a player and place them on the pitch.
                </p>
                <Button onClick={spin}>
                  <Dices className="h-4 w-4" /> Spin the wheel
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TeamFlag fifaCode={currentTeam.fifa_code} size={36} title={currentTeam.name} />
                  <p className="font-semibold">{currentTeam.name}</p>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {selectedPlayer
                    ? 'Now tap a highlighted position above, or pick a different player.'
                    : 'Choose a player to draft.'}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(squadsByTeam.get(currentTeam.id) ?? []).map((player) => {
                    const used = usedPlayerIds.has(player.id)
                    const selected = selectedPlayer?.id === player.id
                    return (
                      <button
                        key={player.id}
                        type="button"
                        disabled={used}
                        onClick={() => setSelectedPlayer(player)}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          used
                            ? 'cursor-not-allowed border-[var(--border)] opacity-40'
                            : selected
                              ? 'border-[var(--primary)] bg-[var(--primary)]/12 ring-1 ring-[var(--primary)]'
                              : 'border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/8'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{player.name}</span>
                          <span className="text-xs text-[var(--muted)]">
                            {formatPositionLabel(player)}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-md bg-[var(--background)] px-2 py-1 text-xs font-bold tabular-nums">
                          {player.overall_rating}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {phase === 'tournament' && picks.length === TOTAL_ROUNDS && (
        <TournamentRun picks={picks} onComplete={finishTournament} />
      )}

      {phase === 'result' && result && (
        <div className="space-y-4">
          <Card
            className={`p-6 text-center ${
              result.outcome === 'won'
                ? 'border-fifa-gold/50 bg-fifa-gold/10'
                : 'border-[var(--border)]'
            }`}
          >
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/15">
              <Trophy className="h-8 w-8 text-[var(--primary)]" aria-hidden />
            </div>
            <CardTitle className="text-2xl">
              {result.outcome === 'won'
                ? 'You won the World Cup! 🏆'
                : `Knocked out in the ${exitRoundLabel(result.exitRound)}`}
            </CardTitle>
            <CardDescription className="mt-2">
              Squad rating {result.squadOvr} · {formation.name} · Group {result.groupRecord}
            </CardDescription>
          </Card>

          {result.matches.length > 0 && (
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold">Tournament matches</p>
              <ul className="space-y-2 text-sm">
                {result.matches.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
                  >
                    <span className="text-[var(--muted)]">{m.stageLabel}</span>
                    <span>
                      vs {m.opponentName}{' '}
                      <strong className="tabular-nums">
                        {m.score.user}–{m.score.opponent}
                      </strong>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold">Your XI</p>
            <XiPitch formation={formation} picks={picks} size="share" showRatings />
          </Card>

          <Card className="space-y-3 p-4">
            {banterPosted ? (
              <p className="text-sm font-medium text-fifa-green">Posted to the Banter Box.</p>
            ) : (
              <>
                <p className="text-sm text-[var(--muted)]">
                  Share your result and full XI with the group so others can see your squad.
                </p>
                <Button variant="outline" onClick={postToBanter} disabled={posting}>
                  {posting ? 'Posting…' : 'Post to banter box'}
                </Button>
                {banterError && <p className="text-sm text-red-600">{banterError}</p>}
              </>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={startGame}>
                <RotateCcw className="h-4 w-4" /> Draft again
              </Button>
              <Button variant="outline" onClick={startAutoFill}>
                <Sparkles className="h-4 w-4" /> Auto-fill again
              </Button>
            </div>
          </Card>

          {assignedTeamName && (
            <p className="text-center text-xs text-[var(--muted)]">
              Just for fun — this does not affect your {assignedTeamName} pool standing.
            </p>
          )}
        </div>
      )}
    </GameFrame>
  )
}

function GameFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link to="..">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{GAME_TITLE}</h1>
          <p className="text-sm text-[var(--muted)]">Draft an XI and chase the trophy</p>
        </div>
      </div>
      {children}
    </div>
  )
}

