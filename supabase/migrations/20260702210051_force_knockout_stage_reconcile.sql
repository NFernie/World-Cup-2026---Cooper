-- Reconcile tournament_stage from finished knockout results (e.g. France still at round_of_32).

select public.assign_knockout_match_numbers();
select public.advance_knockout_winners();
