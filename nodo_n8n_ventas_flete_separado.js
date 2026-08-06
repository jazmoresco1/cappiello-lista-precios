/**
 * nodo_n8n_ventas_flete_separado.js
 * ==================================
 * Reemplazo para el nodo Code "Preparar Fila Ventas ML" del workflow
 * "MonsterTrail - Motor de Rentabilidad ML".
 *
 * QUE ARREGLA
 * -----------
 * Hoy el nodo arma la fila asi:
 *
 *     costo_envio: 0,                          // nunca se escribe
 *     costo_unitario_proveedor: costoBase,     // costoBase YA trae el flete
 *
 * Y despues la ganancia se calcula como
 * `monto_neto_recibido - costo_total_proveedor`. Como Mercado Libre ya le
 * descuenta el flete a lo que deposita, y costoBase tambien lo trae sumado
 * adentro, el flete termina restado DOS VECES y la ganancia sale muy por
 * debajo de la real (una tapa que dejo ~90.000 figuraba con 9.491).
 *
 * COMO QUEDA
 * ----------
 * El flete pasa a ser un campo propio y el costo de proveedor queda solo con
 * el producto:
 *
 *     costo_envio              = flete real de la liquidacion de ML
 *                                (o el configurado si todavia no liquido)
 *     costo_unitario_proveedor = costoBase - flete configurado
 *
 * Asi la app puede mostrarlo por separado y vos podes corregirlo a mano
 * cuando el envio salio mas caro o mas barato.
 *
 * QUE NECESITA ANTES
 * ------------------
 * Un nodo Supabase (o HTTP Request) que traiga `configuracion_precios`
 * (columnas `categoria` y `costo_envio`) y que en este Code node se pueda
 * leer. Abajo se asume que ese nodo se llama "Config Precios" -- si en tu
 * workflow tiene otro nombre, cambiá SOLO esa string.
 */

// ── 1. Flete configurado por categoría ──────────────────────────────────
// Cambiá "Config Precios" por el nombre real de tu nodo.
const configPrecios = $('Config Precios').all().map(i => i.json);
const envioPorCategoria = {};
for (const c of configPrecios) {
  envioPorCategoria[c.categoria] = Number(c.costo_envio) || 0;
}
const ENVIO_DEFAULT = envioPorCategoria['default'] ?? 20000;

const salida = [];

for (const item of $input.all()) {
  const v = item.json;

  // ── 2. Datos que ya venían de antes ──────────────────────────────────
  const cantidad     = Number(v.cantidad) || 1;
  const montoVenta   = Number(v.monto_total_venta) || 0;
  const comisionMl   = Number(v.comision_ml) || 0;
  const costoBase    = v.costo_base != null ? Number(v.costo_base) : null; // de productos
  const categoria    = v.categoria || null;
  const netoLiquidado = v.monto_neto_recibido != null ? Number(v.monto_neto_recibido) : null;

  // ── 3. Costo del proveedor SIN flete ─────────────────────────────────
  // costoBase = producto + flete + costo operativo. Le sacamos el flete
  // porque el flete ya viene contemplado del lado de Mercado Libre, adentro
  // de lo que deposita; si no, se restaría dos veces.
  const envioConfigurado = envioPorCategoria[categoria] ?? ENVIO_DEFAULT;
  const costoUnitario = costoBase != null
    ? Math.round(costoBase - envioConfigurado)
    : null;
  const costoTotal = costoUnitario != null ? costoUnitario * cantidad : null;

  // ── 4. Neto recibido: es LA VERDAD, no se reconstruye ────────────────
  // Lo que Mercado Libre deposita ya viene neto de comision, envio E
  // impuestos/retenciones. OJO: la linea "Envios" de la liquidacion es
  // POSITIVA cuando el envio lo pago el cliente (te lo acreditan), asi que
  // `venta - comision - neto` puede dar NEGATIVO y eso no es un error.
  // Si la venta todavia no esta liquidada, se estima con el flete configurado.
  const montoNetoRecibido = netoLiquidado != null
    ? netoLiquidado
    : Math.round((montoVenta - comisionMl - envioConfigurado) * 100) / 100;

  // Informativo: neto de todo lo que ML sumo o resto ademas de la comision.
  // Positivo = te cobraron envio. Negativo = el cliente lo pago y te quedo
  // a favor. No entra en el calculo de la ganancia: ya esta dentro del neto.
  const costoEnvio = Math.round((montoVenta - comisionMl - montoNetoRecibido) * 100) / 100;

  // ── 5. Ganancia ──────────────────────────────────────────────────────
  const gananciaReal = costoTotal != null
    ? Math.round((montoNetoRecibido - costoTotal) * 100) / 100
    : null;

  // margen SIEMPRE en porcentaje (antes algunas filas guardaban la fracción,
  // ej. 0.0102 en vez de 1.02, y eso rompía cualquier filtro o alerta).
  const margenPct = (gananciaReal != null && montoVenta)
    ? Math.round((gananciaReal / montoVenta) * 10000) / 100
    : null;

  // ── 6. Alertas ───────────────────────────────────────────────────────
  const alertas = [];
  if (costoBase == null) {
    alertas.push('No se encontro costo para este SKU en productos');
  }
  if (netoLiquidado == null) {
    alertas.push(`Venta sin liquidar todavia: el neto es estimado con el envio configurado (${envioConfigurado})`);
  }
  if (costoEnvio > envioConfigurado * 1.5) {
    alertas.push(`Envio mas caro de lo previsto: ML descontó ${costoEnvio} vs ${envioConfigurado} configurado`);
  }
  if (gananciaReal != null && gananciaReal < 0) {
    alertas.push(`Venta en perdida: ${gananciaReal}`);
  }

  salida.push({
    json: {
      ...v,
      costo_envio: costoEnvio,
      costo_unitario_proveedor: costoUnitario,
      costo_total_proveedor: costoTotal,
      monto_neto_recibido: montoNetoRecibido,
      ganancia_real: gananciaReal,
      margen_pct: margenPct,
      alerta: alertas.length ? alertas.join(' | ') : (v.alerta || null),
    },
  });
}

return salida;
