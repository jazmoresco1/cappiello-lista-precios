-- Permite editar a mano, desde la app, el costo de envío y el costo de
-- proveedor de cada venta (Mercado Libre y físicas), y protege esa edición
-- para que no se pierda la próxima vez que corra la sincronización de ML.
--
-- Corré esto una sola vez en el SQL Editor de Supabase.

-- 1) Columna que marca "esta fila la edité a mano, no la toques".
ALTER TABLE ventas       ADD COLUMN IF NOT EXISTS editado_manual boolean NOT NULL DEFAULT false;
ALTER TABLE venta_items  ADD COLUMN IF NOT EXISTS editado_manual boolean NOT NULL DEFAULT false;

-- 2) Trigger de protección en "ventas": cuando el workflow de n8n vuelve a
-- sincronizar Mercado Libre y hace UPDATE sobre una fila marcada como
-- editada a mano, este trigger descarta los cambios en los campos de costo
-- y deja los valores que vos cargaste. No importa cómo escriba n8n (Supabase
-- node, HTTP Request, upsert, etc.) -- esto corre siempre, dentro de la base.
CREATE OR REPLACE FUNCTION proteger_edicion_manual_ventas()
RETURNS trigger AS $$
BEGIN
  IF OLD.editado_manual THEN
    NEW.costo_envio              := OLD.costo_envio;
    NEW.costo_unitario_proveedor := OLD.costo_unitario_proveedor;
    NEW.costo_total_proveedor    := OLD.costo_total_proveedor;
    NEW.monto_neto_recibido      := OLD.monto_neto_recibido;
    NEW.ganancia_real            := OLD.ganancia_real;
    NEW.margen_pct               := OLD.margen_pct;
    NEW.editado_manual           := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proteger_edicion_manual_ventas ON ventas;
CREATE TRIGGER trg_proteger_edicion_manual_ventas
BEFORE UPDATE ON ventas
FOR EACH ROW
EXECUTE FUNCTION proteger_edicion_manual_ventas();

-- 3) Policies para que la clave pública (anon) del cotizador pueda hacer el
-- UPDATE del costo de envío y de proveedor desde la app (hoy solo tenían
-- permiso de DELETE, ver permitir_borrar_ventas.sql).
CREATE POLICY "cotizador anon puede editar costos de ventas"
  ON ventas
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "cotizador anon puede editar costos de venta_items"
  ON venta_items
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
