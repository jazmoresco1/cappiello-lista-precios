-- Permite guardar ventas de Shopify en la tabla ventas.
--
-- La tabla tiene una restriccion (ventas_canal_check) que solo deja los
-- canales que ya existian. Se vuelve a crear incluyendo 'shopify'.
-- Las filas actuales (mercado_libre y cotizador) no se tocan.
--
-- Corre esto una sola vez en el SQL Editor de Supabase.

ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_canal_check;
ALTER TABLE ventas ADD CONSTRAINT ventas_canal_check
  CHECK (canal IN ('mercado_libre', 'cotizador', 'shopify'));
