-- Hoy Supabase solo guarda "costo_base", que ya mezcla el precio del
-- proveedor + el kit (acople/soporte) + envío ML + costo operativo, todo
-- junto -- por eso hay que "adivinar" y restar cosas para volver a
-- comparar contra la factura real del proveedor.
--
-- pricing_todo.py YA calcula el precio neto puro (antes de sumarle nada)
-- en cada corrida, pero lo descarta antes de subir a Supabase. Esto
-- agrega dos columnas para guardarlo, así queda ahí la posta, simple.
--
-- Corré esto una sola vez en el SQL Editor de Supabase.

ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_neto_proveedor numeric;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo_kit_incluido numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN productos.precio_neto_proveedor IS
  'Precio neto (sin IVA, sin kit, sin envío/operativo) tal cual lo lee pricing_todo.py de la lista del proveedor. Para comparar 1 a 1 contra la factura real.';
COMMENT ON COLUMN productos.costo_kit_incluido IS
  'Costo promedio del kit (acople/soporte) que se sumó al calcular costo_base, para enganches/estribos. 0 si no aplica.';

-- Queda en NULL para todo lo que ya estaba cargado -- se completa solo la
-- próxima vez que corras pricing_todo.py para cada proveedor.
