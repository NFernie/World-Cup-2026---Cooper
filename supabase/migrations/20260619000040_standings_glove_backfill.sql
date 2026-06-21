-- Backfill group standings and Golden Glove clean sheets after sync fixes.
select public.recalculate_group_standings();
