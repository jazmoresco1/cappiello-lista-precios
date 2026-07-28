-- Permite que la clave pública (anon) del cotizador use el nuevo panel
-- "💸 Gastos" (Fase 4: costos fijos/variables repartidos entre socios).
-- Sin esto, cargar/ver/borrar gastos desde la app falla por RLS.
--
-- Corré esto una sola vez en el SQL Editor de Supabase. Revisá antes en
-- el dashboard (Authentication > Policies) si alguna de estas tablas ya
-- tiene policies para anon, para no duplicar.

-- Gastos: leer, crear y borrar desde la app.
create policy "cotizador anon puede leer costos_fijos_variables"
  on costos_fijos_variables for select to anon using (true);
create policy "cotizador anon puede crear costos_fijos_variables"
  on costos_fijos_variables for insert to anon with check (true);
create policy "cotizador anon puede borrar costos_fijos_variables"
  on costos_fijos_variables for delete to anon using (true);

-- Socios: solo necesita leer la lista de socios activos para armar el
-- reparto del formulario (el alta de socios se sigue haciendo a mano en
-- Supabase, no hay un panel para eso todavía).
create policy "cotizador anon puede leer socios"
  on socios for select to anon using (true);

-- gasto_socios: el % de reparto que arma la app al guardar un gasto nuevo.
create policy "cotizador anon puede leer gasto_socios"
  on gasto_socios for select to anon using (true);
create policy "cotizador anon puede crear gasto_socios"
  on gasto_socios for insert to anon with check (true);
