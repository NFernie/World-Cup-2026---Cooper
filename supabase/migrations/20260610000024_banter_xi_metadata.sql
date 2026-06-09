-- Optional structured payload for banter posts (e.g. World Cup XI game squad share).

alter table public.pool_banter_messages
  add column if not exists metadata_json jsonb;

comment on column public.pool_banter_messages.metadata_json is
  'Structured attachment data (e.g. xi_game_result with formation and 11 picks).';
