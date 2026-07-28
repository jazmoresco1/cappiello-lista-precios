-- La tabla "producto_socios" está vacía (0 filas), por eso el reparto por
-- socio del panel Dashboard/Socios da $0 para todos: no hay ningún
-- producto asignado a ningún socio todavía.
--
-- Hoy el 100% de la ganancia es de "monstertrail" (la empresa) — recién
-- cuando entren los productos de China se van a repartir entre socios
-- reales (ariel, marcos, etc). Este script le asigna el 100% de TODOS
-- los productos ya cargados en "productos" a "monstertrail", sin duplicar
-- ni tocar ningún producto que ya tenga una asignación.
--
-- Corré esto una sola vez en el SQL Editor de Supabase.

insert into producto_socios (producto_id, socio_id, porcentaje)
select p.id, s.id, 100
from productos p
cross join (select id from socios where nombre = 'monstertrail') s
where not exists (
  select 1 from producto_socios ps where ps.producto_id = p.id
);

-- Chequeo: debería mostrar 1007 filas (o el total de productos cargados),
-- todas con porcentaje 100 y socio "monstertrail".
select count(*) as productos_asignados from producto_socios;
