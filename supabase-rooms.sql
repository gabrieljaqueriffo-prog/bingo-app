-- SQL a ejecutar en supabase.com → SQL Editor → New query → Run
-- Crea la tabla de salas para las partidas online.

create table if not exists public.rooms (
  code text primary key,
  kind text not null,
  rev bigint not null default 1,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Realtime: emitir cambios de INSERT/UPDATE/DELETE de la tabla.
do $$
begin
  if not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime'
      and pr.prrelid = 'public.rooms'::regclass
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end
$$;

-- RLS abierto para el juego casual (solo anon key, sin auth).
-- Si querés más control, cambiá estas políticas.
alter table public.rooms enable row level security;

drop policy if exists "salas legibles" on public.rooms;
create policy "salas legibles" on public.rooms for select using (true);
drop policy if exists "salas creables" on public.rooms;
create policy "salas creables" on public.rooms for insert with check (true);
drop policy if exists "salas editables" on public.rooms;
create policy "salas editables" on public.rooms for update using (true);
drop policy if exists "salas borrables" on public.rooms;
create policy "salas borrables" on public.rooms for delete using (true);
