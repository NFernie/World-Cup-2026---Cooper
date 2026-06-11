-- Correct FIFA World Cup 2026 draw: Groups K and L had England/Croatia in K (6 teams) and only 2 in L.

update public.teams set group_letter = 'K' where fifa_code in ('POR', 'COD', 'UZB', 'COL');
update public.teams set group_letter = 'L' where fifa_code in ('ENG', 'CRO', 'GHA', 'PAN');
