-- Token de Mercado Libre compartido por la app de Vercel.
-- Correr una vez en el SQL editor de Supabase.
-- Una sola fila (id = 1). La función serverless la lee y la actualiza al renovar.

create table if not exists public.ml_tokens (
  id integer primary key check (id = 1),
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  updated_at timestamptz default now()
);

-- Solo la función del servidor (service role) puede leer o escribir.
alter table public.ml_tokens enable row level security;

-- Fila inicial: reemplazar REFRESH_TOKEN_ACTUAL por el valor de MELI_REFRESH_TOKEN
-- de meli_config.txt, en el editor de Supabase (no pegarlo en el chat).
insert into public.ml_tokens (id, refresh_token)
values (1, 'REFRESH_TOKEN_ACTUAL')
on conflict (id) do nothing;
