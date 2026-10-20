-- Tabla para mapear el "alias" random que muestra Mercado Libre (ej. BEGONIA.MORSA.POPULAR)
-- al nombre real del competidor, cuando ya lo identificaste.
--
-- Cómo usarla: pegá una fila por cada alias que ya sepas quién es. El workflow de n8n
-- "03- Reporte Competidores ML con cookies" la usa automáticamente para mostrar el nombre
-- real en vez del alias, en TODO el reporte (rankings, tabla de ventas del día, productos).
--
-- Correr esto una sola vez en el SQL Editor de Supabase.

create table if not exists public.alias_nombre_real (
  alias text primary key,
  nombre_real text not null,
  notas text,
  creado_en timestamptz default now(),
  actualizado_en timestamptz default now()
);

-- Ejemplo de cómo cargar un alias ya identificado (borrá o editá esta línea):
-- insert into public.alias_nombre_real (alias, nombre_real, notas)
-- values ('BEGONIA.MORSA.POPULAR', 'Nombre real acá', 'cómo lo identificaste, opcional')
-- on conflict (alias) do update set nombre_real = excluded.nombre_real, actualizado_en = now();

-- Desde el 30/10/2026 Supabase ya no da acceso a la API automaticamente a las
-- tablas nuevas: n8n (service_role) necesita este permiso explicito.
grant select, insert, update, delete on public.alias_nombre_real to service_role;
