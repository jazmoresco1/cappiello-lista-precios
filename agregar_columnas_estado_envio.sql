-- Agrega el estado del envío y el estado de la orden de Mercado Libre a la
-- tabla ventas, para poder filtrar por "en curso" / "entregado" / "cancelado".
--
-- estado_envio: viene de GET /shipments/{id} -- valores posibles de ML:
--   pending, handling, ready_to_ship, shipped, delivered, not_delivered, cancelled
-- estado_orden: viene de order.status -- valores posibles de ML:
--   confirmed, payment_required, payment_in_process, partially_paid, paid,
--   cancelled, invalid
--
-- Corré esto una sola vez en el SQL Editor de Supabase.

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS estado_envio text;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS estado_orden text;
