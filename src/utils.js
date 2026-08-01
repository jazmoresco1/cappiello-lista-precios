export const ARS = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);

// Flete fijo que se suma a TODOS los productos del precio local, aparte de
// la rentabilidad (markup %). No es parte de la ganancia -- cubre el costo
// de envío/entrega de la venta local.
const COSTO_ENVIO_LOCAL = 15000;

// pisoGanancia: ganancia mínima en pesos (si el markup% normal da menos, se
// usa este piso en su lugar). pisoVenta: precio final mínimo (si el
// resultado da menos, se usa este piso). techoVenta: precio final MÁXIMO
// (si el resultado da más, se lo baja a este techo) -- pero nunca por
// debajo de costo+flete, para no vender a pérdida en productos muy caros
// donde el techo quedaría por debajo del costo real. Con todos en 0, el
// cálculo es el de siempre (markup % puro) + el flete fijo.
export function calcular(lista, desc, iva, markup, pisoGanancia = 0, pisoVenta = 0, techoVenta = 0) {
  const neto   = lista  * (1 - desc   / 100);
  const conIva = neto   * (1 + iva    / 100);
  let ganancia = conIva * (markup / 100);
  if (pisoGanancia && ganancia < pisoGanancia) ganancia = pisoGanancia;
  let venta = conIva + ganancia + COSTO_ENVIO_LOCAL;
  if (pisoVenta && venta < pisoVenta) venta = pisoVenta;
  if (techoVenta) {
    const minimoSinPerdida = conIva + COSTO_ENVIO_LOCAL;
    venta = Math.max(Math.min(venta, techoVenta), minimoSinPerdida);
  }
  return { neto, conIva, venta };
}

// Detecta color del producto por nombre
export function getColorBadge(nombre) {
  const n = nombre.toUpperCase();
  if (n.includes("NEGRO") || n.includes("NEGRA")) return "negro";
  if (n.includes("INOXIDABLE") || n.includes("INOX")) return "inox";
  if (n.includes("ALUMINIO") && !n.includes("NEGRO")) return "aluminio";
  return null;
}
