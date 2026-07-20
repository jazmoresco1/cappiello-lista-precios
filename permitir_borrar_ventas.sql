-- Permite que la clave publica (anon) del cotizador borre movimientos de venta.
-- Sin esto, el boton "Borrar movimiento" del panel de Ventas va a fallar con
-- un error de permisos (RLS bloqueando el DELETE).
--
-- Revisa antes en el dashboard de Supabase (Authentication > Policies) si
-- ya existe alguna policy de DELETE en estas tablas para no duplicar.

create policy "cotizador anon puede borrar ventas"
  on ventas
  for delete
  to anon
  using (true);

create policy "cotizador anon puede borrar venta_items"
  on venta_items
  for delete
  to anon
  using (true);
