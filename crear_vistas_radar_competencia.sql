-- Fase 7: dos vistas sobre la tabla "competencia_ventas_dia" (que ya está
-- viva y actualizándose todos los días — 9550+ filas hoy) para que el
-- nuevo panel "📡 Competencia" de la app pueda mostrar algo liviano en vez
-- de bajar las miles de filas del día.
--
-- Corré esto una sola vez en el SQL Editor de Supabase.

-- 1) Tu posición (Monster Trail) en cada categoría, último día cargado.
create or replace view v_radar_competencia_propio as
select categoria_nombre, posicion, fecha
from competencia_ventas_dia
where es_propio = true
  and fecha = (select max(fecha) from competencia_ventas_dia);

-- 2) Los 8 competidores con más ventas brutas del mes, por categoría,
-- del último día cargado (para no traer las miles de filas del día).
create or replace view v_radar_competencia_top as
select categoria_nombre, alias, nombre_editado, titulo, precio,
       cantidad_ventas_mes, ventas_brutas_mes, facturacion_dia, posicion, fecha
from (
  select c.*,
         row_number() over (
           partition by categoria_nombre
           order by ventas_brutas_mes desc nulls last
         ) as rn
  from competencia_ventas_dia c
  where es_propio = false
    and fecha = (select max(fecha) from competencia_ventas_dia)
) t
where rn <= 8;
