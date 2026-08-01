-- Cada vendedor tiene su propia clave para entrar a la app (antes había
-- una sola clave compartida para todos los vendedores). Con esto, al
-- entrar el sistema ya sabe qué vendedor es -- no hace falta elegirlo del
-- desplegable del cotizador, y las ventas/comisiones quedan atribuidas
-- solas.
--
-- Corré esto una sola vez en el SQL Editor de Supabase.

ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS pin text;

-- Evita que dos vendedores tengan la misma clave por error (NULL se puede
-- repetir sin problema -- son los vendedores que todavía no tienen clave
-- asignada).
CREATE UNIQUE INDEX IF NOT EXISTS vendedores_pin_unico
  ON vendedores (pin)
  WHERE pin IS NOT NULL;

-- Después de correr esto, entrá a "👤 Vendedores" en la app (con la clave
-- de admin) y asignale una clave a cada vendedor activo.
