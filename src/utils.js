export const ARS = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);

export function calcular(lista, desc, iva, markup) {
  const neto   = lista  * (1 - desc   / 100);
  const conIva = neto   * (1 + iva    / 100);
  const venta  = conIva * (1 + markup / 100);
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
