-- Stadium, referee, and optional attendance for fixture match info.
alter table public.matches
  add column if not exists venue_name text,
  add column if not exists venue_city text,
  add column if not exists referee text,
  add column if not exists attendance int;
