-- Códigos y links de seguimiento de los despachos.
-- Correr una vez en el SQL editor de Supabase.

create table if not exists public.despachos_seguimiento (
  orden_id text primary key,
  codigo text,
  link text,
  updated_at timestamptz default now()
);

-- Solo la función del servidor (service role) puede leer o escribir.
alter table public.despachos_seguimiento enable row level security;

-- Transporte (Andreani, Vía Cargo, etc.). Si la tabla ya existía, correr también esto:
alter table public.despachos_seguimiento add column if not exists transporte text;

-- Estado del despacho y de la entrega (para mostrar el botón correcto). Correr una vez:
alter table public.despachos_seguimiento add column if not exists despachado boolean default false;
alter table public.despachos_seguimiento add column if not exists entregado boolean default false;
