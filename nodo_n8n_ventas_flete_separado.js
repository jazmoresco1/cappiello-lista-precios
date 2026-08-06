/**
 * nodo_n8n_ventas_flete_separado.js
 * ==================================
 * Reemplazo para el nodo Code "Preparar Fila Ventas ML" del workflow
 * "04 - Motor de rentabilidad".
 *
 * ARREGLA DOS COSAS
 * -----------------
 * 1) QUE NO SE PISEN LAS EDICIONES A MANO.
 *    El nodo "Guardar Venta en Supabase" hace un upsert con
 *    `on_conflict=canal,id_externo,sku_ml` y `resolution=merge-duplicates`,
 *    y "Buscar Ventas ML" trae las ordenes de AYER A HOY. O sea que cada
 *    corrida del schedule vuelve a escribir las ventas de las ultimas 48hs
 *    y borra lo que hayas corregido en la app.
 *    La tabla ya tiene la columna `editado_manual`, pero nadie la miraba.
 *    Este nodo la consulta y saltea esas ventas.
 *
 * 2) EL FLETE, VISIBLE Y CON EL VALOR QUE CONFIGURAMOS.
 *    Antes `costo_envio` se llenaba con `order.shipping_cost` (dato de ML)
 *    y despues no se usaba para nada; el costo del proveedor venia con el
 *    flete escondido adentro. Ahora:
 *
 *       costo_envio              = el flete que seteamos por familia
 *                                  (configuracion_precios), editable despues
 *       costo_unitario_proveedor = costo_base - ese flete (producto solo)
 *
 * CRITERIO DEL CALCULO
 * --------------------
 *    ganancia = monto_neto_recibido - costo del producto - flete configurado
 *
 * `monto_neto_recibido` es la plata que Mercado Libre efectivamente
 * deposito y NO se recalcula. Lo que ML haya hecho con el envio de su lado
 * (te lo cobro, se lo cobro al cliente, te lo acredito) no se mira: el
 * unico numero de ML que importa es cuanto entro.
 *
 * NODOS QUE HAY QUE AGREGAR ANTES
 * -------------------------------
 * A) HTTP Request "Cargar Config Envios"
 *      GET https://<tu-proyecto>.supabase.co/rest/v1/configuracion_precios
 *      query:   select = categoria,costo_envio
 *      headers: apikey / Authorization  (usar Credentials de n8n, NO pegar
 *               la service key en el nodo)
 *
 * B) HTTP Request "Cargar Ventas Editadas"
 *      GET https://<tu-proyecto>.supabase.co/rest/v1/ventas
 *      query:   select          = id_externo,sku_ml
 *               editado_manual  = eq.true
 *      headers: idem
 *
 * C) El nodo "Cargar Precios desde Supabase" tiene que traer tambien la
 *    categoria:  select = sku,nombre,costo_base,categoria
 *    y "Cargar Base de Precios" tiene que copiarla al objeto:
 *        pricing_productos[sku] = { sku, nombre, costo_base, categoria: fila.categoria }
 */

// ── 1. Flete configurado por familia ────────────────────────────────────
const envioPorCategoria = {};
for (const item of $('Cargar Config Envios').all()) {
  const c = item.json;
  if (c && c.categoria != null) {
    envioPorCategoria[c.categoria] = Number(c.costo_envio) || 0;
  }
}
const ENVIO_DEFAULT = envioPorCategoria['default'] ?? 20000;

// ── 2. Ventas que ya fueron corregidas a mano: no se tocan ──────────────
const editadasAMano = new Set();
for (const item of $('Cargar Ventas Editadas').all()) {
  const e = item.json;
  if (e && e.id_externo != null) {
    editadasAMano.add(`${e.id_externo}|${e.sku_ml ?? ''}`);
  }
}

const filas = $input.all().map(i => i.json);
const salida = [];
let salteadas = 0;

for (const v of filas) {
  const idExterno = String(v.id_venta) + '-' + (v.item_id || '');
  const clave = `${idExterno}|${v.sku_ml ?? ''}`;

  if (editadasAMano.has(clave)) {
    salteadas++;
    continue; // la corregiste vos, mandan tus numeros
  }

  const cantidad = Number(v.cantidad) || 1;
  const montoVenta = Number(v.monto_total_venta) || 0;
  const comisionMl = Number(v.comision_ml) || 0;
  const categoria = v.categoria || null;

  // ── 3. Flete: el nuestro, el configurado para la familia ──────────────
  const envioUnitario = envioPorCategoria[categoria] ?? ENVIO_DEFAULT;
  const envioTotal = envioUnitario * cantidad;

  // ── 4. Costo del producto SIN flete ──────────────────────────────────
  // costo_base = producto + flete + costo operativo. Le sacamos el flete
  // porque ahora va en su propia columna; si no, se restaria dos veces.
  const costoBase = v.costo_unitario_proveedor != null
    ? Number(v.costo_unitario_proveedor)
    : null;
  const costoUnitario = costoBase != null
    ? Math.round(costoBase - envioUnitario)
    : null;
  const costoTotal = costoUnitario != null ? costoUnitario * cantidad : null;

  // ── 5. Neto recibido: se toma tal cual, no se reconstruye ────────────
  const netoRecibido = v.monto_neto_recibido != null
    ? Number(v.monto_neto_recibido)
    : null;

  // ── 6. Ganancia ──────────────────────────────────────────────────────
  const gananciaReal = (costoTotal != null && netoRecibido != null)
    ? Math.round((netoRecibido - costoTotal - envioTotal) * 100) / 100
    : null;

  // margen SIEMPRE en porcentaje. Antes se guardaba la fraccion
  // (ganancia/neto), asi que unas filas tenian 0.0102 y otras 31.85 y
  // cualquier filtro o alerta sobre esta columna daba cualquier cosa.
  const margenPct = (gananciaReal != null && montoVenta)
    ? Math.round((gananciaReal / montoVenta) * 10000) / 100
    : null;

  // ── 7. Alertas ───────────────────────────────────────────────────────
  const alertas = [];
  if (v.alerta) alertas.push(v.alerta);
  if (costoUnitario == null) alertas.push('Sin costo de proveedor: revisar el SKU');
  if (categoria == null) alertas.push(`Sin categoria: se uso el flete default (${ENVIO_DEFAULT})`);
  if (netoRecibido == null) alertas.push('Sin liquidacion de Mercado Pago todavia');
  if (gananciaReal != null && gananciaReal < 0) alertas.push(`VENTA EN PERDIDA: ${gananciaReal}`);

  salida.push({
    json: {
      fecha: v.fecha,
      canal: 'mercado_libre',
      id_externo: idExterno,
      cliente: null,
      forma_pago: null,
      sku: v.sku_usado,
      sku_ml: v.sku_ml,
      metodo_match: v.metodo_match,
      nombre: v.nombre,
      cantidad: cantidad,
      precio_unitario: v.precio_unitario_venta,
      monto_total_venta: montoVenta,
      comision_ml: comisionMl,
      costo_envio: envioUnitario,
      monto_neto_recibido: netoRecibido,
      costo_unitario_proveedor: costoUnitario,
      costo_total_proveedor: costoTotal,
      ganancia_real: gananciaReal,
      margen_pct: margenPct,
      alerta: alertas.length ? alertas.join(' | ') : null,
    },
  });
}

console.log(`Ventas preparadas: ${salida.length} | salteadas por edicion manual: ${salteadas}`);

return salida;
