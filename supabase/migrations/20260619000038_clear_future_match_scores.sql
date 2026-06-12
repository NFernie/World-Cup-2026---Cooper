-- Demo seed (prompt005) marked NED–JPN and GER–CIV as finished with scores before kickoff.
-- Clear any not-yet-played fixture that still has results or live/finished status.

delete from public.member_match_points mmp
using public.matches m
where mmp.match_id = m.id
  and m.kickoff_at > now() - interval '15 minutes';

delete from public.match_events me
using public.matches m
where me.match_id = m.id
  and m.kickoff_at > now() - interval '15 minutes';

update public.matches
set
  status = 'scheduled',
  home_score = null,
  away_score = null,
  scores_synced_at = null,
  events_synced_at = null,
  elapsed_minutes = null,
  extra_minutes = null,
  api_status_short = null,
  status_synced_at = null
where kickoff_at > now() - interval '15 minutes'
  and (
    status in ('finished', 'live')
    or home_score is not null
    or away_score is not null
  );
