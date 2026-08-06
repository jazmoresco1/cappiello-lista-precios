-- Actualiza costo_envio por categoría en configuracion_precios, según los
-- tramos de peso/precio reales que pasaste (0-10kg $20.000, 10-15kg
-- $25.000, 15-20kg $35.000, 20-30kg $45.000, 30-45kg $55.000,
-- 45-76kg $75.000). Los pesos por categoría son estimación (no hay peso
-- real cargado por producto todavía) -- revisalos antes de correr esto.
--
-- Corré esto una sola vez en el SQL Editor de Supabase. Usa UPSERT: si la
-- categoría ya existe la actualiza, si no existe la crea.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('tapa_rigida',        55000),
    ('estribo',            45000),
    ('enganche',           20000),
    ('defensa',            45000),
    ('barra_antivuelco',   45000),
    ('baul',               75000),
    ('bichero',            35000),
    ('proteccion',         20000),
    ('amortiguador',       25000),
    ('antirrobo',          20000),
    ('cobertores',         25000),
    ('lona',               25000),
    ('lomo_baranda',       20000),
    ('cubre_alfombras',    20000),
    ('cobertor_asiento',   20000),
    ('deflector',          20000),
    ('escape',             20000),
    ('driven',             20000),
    ('flexibles',          20000),
    ('herramienta',        20000),
    ('default',            20000)
  ) AS t(categoria, costo_envio)
  LOOP
    IF EXISTS (SELECT 1 FROM configuracion_precios WHERE categoria = r.categoria) THEN
      UPDATE configuracion_precios SET costo_envio = r.costo_envio WHERE categoria = r.categoria;
    ELSE
      INSERT INTO configuracion_precios
        (categoria, costo_envio, tipo_ml, valor_ml, margen_local_pct, comision_ml_pct)
      VALUES
        (r.categoria, r.costo_envio, 'porcentaje', 0.15, 30, 0.145);
    END IF;
  END LOOP;
END $$;

-- Chequeo: revisá que haya quedado bien.
SELECT categoria, costo_envio FROM configuracion_precios ORDER BY categoria;
