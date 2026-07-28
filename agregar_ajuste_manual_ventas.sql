-- Suma un ajuste manual (+/-) con descripción a cada venta, además del
-- costo de envío y de proveedor editables que ya agregó
-- permitir_editar_costos_venta.sql. Sirve para casos puntuales que no
-- entran en "costo de envío" ni "costo de proveedor" (ej. una devolución
-- parcial, un descuento post-venta, un gasto extra de esa venta puntual).
--
-- Corré esto una sola vez en el SQL Editor de Supabase, DESPUÉS de haber
-- corrido permitir_editar_costos_venta.sql.

ALTER TABLE ventas       ADD COLUMN IF NOT EXISTS ajuste_monto numeric NOT NULL DEFAULT 0;
ALTER TABLE ventas       ADD COLUMN IF NOT EXISTS ajuste_descripcion text;

ALTER TABLE venta_items  ADD COLUMN IF NOT EXISTS ajuste_monto numeric NOT NULL DEFAULT 0;
ALTER TABLE venta_items  ADD COLUMN IF NOT EXISTS ajuste_descripcion text;

-- El trigger de proteger_edicion_manual_ventas() (creado en
-- permitir_editar_costos_venta.sql) también tiene que conservar el ajuste
-- si la sync de Mercado Libre vuelve a correr sobre una fila editada.
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
    NEW.ajuste_monto             := OLD.ajuste_monto;
    NEW.ajuste_descripcion       := OLD.ajuste_descripcion;
    NEW.editado_manual           := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
