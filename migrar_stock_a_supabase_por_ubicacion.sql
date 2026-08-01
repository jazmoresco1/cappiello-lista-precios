-- Hoy el stock por ubicación (Royriff / Depósito) que se ve en cada
-- tarjeta de producto vive SOLO en el navegador (localStorage) -- no es
-- compartido entre dispositivos ni se descuenta al vender. Esto lo migra
-- a Supabase (tabla productos), como única fuente de verdad para todos.
--
-- Corré esto una sola vez en el SQL Editor de Supabase, ANTES de importar
-- la planilla de stock.

-- 1) Columnas de stock por ubicación.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_royriff  integer NOT NULL DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_deposito integer NOT NULL DEFAULT 0;

-- Migra lo que ya había en el "stock" único (numero viejo, sin ubicación)
-- a "deposito" -- es donde asumía que iba todo el código anterior.
UPDATE productos
SET stock_deposito = stock
WHERE stock_deposito = 0 AND COALESCE(stock, 0) > 0;

-- 2) "stock" (el total, que ya usan otras partes del sistema) se
-- mantiene sincronizado solo, como la suma de las dos ubicaciones.
CREATE OR REPLACE FUNCTION sync_stock_total()
RETURNS trigger AS $$
BEGIN
  NEW.stock := COALESCE(NEW.stock_royriff, 0) + COALESCE(NEW.stock_deposito, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_stock_total ON productos;
CREATE TRIGGER trg_sync_stock_total
BEFORE INSERT OR UPDATE OF stock_royriff, stock_deposito ON productos
FOR EACH ROW EXECUTE FUNCTION sync_stock_total();

-- 3) movimientos_stock ahora también registra de qué ubicación fue el
-- movimiento.
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS ubicacion text NOT NULL DEFAULT 'deposito';

-- 4) Recrea registrar_movimiento_stock con ubicación. Se borran TODAS las
-- versiones anteriores de la función primero (sin importar qué parámetros
-- tenía) para no dejar una versión vieja duplicada y ambigua.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'registrar_movimiento_stock' AND n.nspname = 'public'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

-- Nunca deja el stock negativo (una venta se guarda igual aunque no
-- alcance el stock -- vos lo corregís después a mano). Devuelve el total
-- (royriff+deposito) actualizado, igual que hacía la versión vieja.
CREATE OR REPLACE FUNCTION registrar_movimiento_stock(
  p_sku text,
  p_delta integer,
  p_tipo text,
  p_nota text DEFAULT NULL,
  p_referencia text DEFAULT NULL,
  p_ubicacion text DEFAULT 'deposito'
) RETURNS integer AS $$
DECLARE
  v_id uuid;
  v_total integer;
BEGIN
  SELECT id INTO v_id FROM productos WHERE sku = p_sku;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  IF p_ubicacion = 'royriff' THEN
    UPDATE productos SET stock_royriff = GREATEST(stock_royriff + p_delta, 0) WHERE id = v_id
    RETURNING stock INTO v_total;
  ELSE
    UPDATE productos SET stock_deposito = GREATEST(stock_deposito + p_delta, 0) WHERE id = v_id
    RETURNING stock INTO v_total;
  END IF;

  INSERT INTO movimientos_stock (producto_id, tipo, cantidad, referencia, nota, ubicacion)
  VALUES (v_id, p_tipo, p_delta, p_referencia, p_nota, p_ubicacion);

  RETURN v_total;
END;
$$ LANGUAGE plpgsql;
