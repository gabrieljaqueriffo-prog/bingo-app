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
alter publication supabase_realtime add table public.rooms;

-- RLS abierto para el juego casual (solo anon key, sin auth).
-- Si querés más control, cambiá estas políticas.
alter table public.rooms enable row level security;

create policy "salas legibles" on public.rooms for select using (true);
create policy "salas creables" on public.rooms for insert with check (true);
create policy "salas editables" on public.rooms for update using (true);
create policy "salas borrables" on public.rooms for delete using (true);
