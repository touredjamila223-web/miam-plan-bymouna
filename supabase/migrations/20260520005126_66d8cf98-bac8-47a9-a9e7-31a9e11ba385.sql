
create table public.recipe_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  recipe_id uuid not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, recipe_id)
);
alter table public.recipe_notes enable row level security;
create policy "owner all" on public.recipe_notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
