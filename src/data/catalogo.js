/* ═══════════════════════════════════════════════════════════════════
   CONFIG POR PROVEEDOR + FAMILIA  (descuento, IVA, markup default)
   Los productos con descuentoOverride ignoran el descuento de aca.
   ═══════════════════════════════════════════════════════════════════ */
export const CONFIG_INICIAL = {
  "Steel Tiger|Tapas Rígidas":     { descuento:3, iva:10.5, markup:30 },
  "Steel Tiger|Estribos":          { descuento:7, iva:10.5, markup:30 },
  "Steel Tiger|Enganches Pesados": { descuento:7, iva:10.5, markup:30 },
  "Steel Tiger|Enganches Livianos":{ descuento:7, iva:10.5, markup:30 },
  "Steel Tiger|Defensas Bajas":    { descuento:7, iva:10.5, markup:30 },
  "Steel Tiger|Cubrecarter":       { descuento:3, iva:10.5, markup:30 },
  "Steel Tiger|Baúl":     { descuento:3, iva:10.5, markup:30 },
  "Steel Tiger|Barras de Trabajo":  { descuento:7, iva:10.5, markup:30 },
  "Steel Tiger|Barra Extreme Plus": { descuento:7, iva:10.5, markup:30 },
  "Steel Tiger|Barras Modulares":   { descuento:7, iva:10.5, markup:30 },
  "Steel Tiger|Amortiguadores":     { descuento:3, iva:10.5, markup:30 },
  // ── Ziel Technology ──
  "Ziel Technology|Alfombras":  { descuento:0, iva:21, markup:30 },
  "Ziel Technology|Cobertores de Caja":{ descuento:0, iva:21, markup:30 },
  "Ziel Technology|Bandeja de Baúl":  { descuento:0, iva:21, markup:30 },
  "Ziel Technology|Accesorios ZT":    { descuento:0, iva:21, markup:30 },
  // ── Padlock ──
  "Padlock|Kit Antirrobo Auxilio":    { descuento:0, iva:10.5, markup:30 },
  // ── Flashcover ──
  "Flashcover|Lonas Flashcover":      { descuento:0, iva:0, markup:30 },
  // ── Kraken ──
  "Kraken|Tapas Rígidas":              { descuento:0, iva:0, markup:30 },
  // ── Bepo ──
  "Bepo|Estribos":                    { descuento:0, iva:10.5, markup:30 },
  "Bepo|Barras de Trabajo":           { descuento:0, iva:10.5, markup:30 },
  "Bepo|Baúl":              { descuento:0, iva:10.5, markup:30 },
  "Bepo|Lomos de Caja":               { descuento:0, iva:10.5, markup:30 },
  // ── Kraken (barras) ──
  "Kraken|Barras de Trabajo":         { descuento:0, iva:0, markup:30 },
  "Kraken|Baúl":             { descuento:0, iva:0, markup:30 },
  // ── DP-20 ──
  "DP-20|Electrónica DP-20":          { descuento:0, iva:21, markup:30 },
  // ── Original Cars 4x4 ──
  "Original Cars 4x4|Deflectores":    { descuento:0, iva:10.5, markup:30 },
  
  // ── Coversax ──
  "Coversax|Fundas de Asientos":      { descuento:0, iva:21, markup:30 },
  // ── ProForm ──
  "Truckliner|Cobertores de Caja":        { descuento:0, iva:10.5, markup:30 },
  "DP-20|Estribos":                   { descuento:0, iva:21, markup:30 },
};

export const PROVEEDORES_INFO = {
  "Steel Tiger":      { web:"https://steeltiger.ar/" },
  "Ziel Technology":  { web:"https://zieltechnology.com.ar/" },
  "Padlock":          { web:"https://www.padlockpro.com.ar/" },
  "Flashcover":       { web:"https://www.flashcover.com.br/es/principio/" },
  "Kraken":           { web:"https://www.accesorioskraken.com.ar/" },
  "Bepo":             { web:"https://www.bepo.com.br/comienzo" },
  "DP-20":            { web:"https://www.dp20.com.ar/" },
  "Original Cars 4x4":{ web:"https://originalcars4x4.com/" },
  "Coversax":          { web:"https://www.coversaxs.com.ar/" },
  "Truckliner":        { web:"https://www.truckliner.com.ar/" },
};

export const CUOTAS_MP = [
  { cant:2,  label:"2 cuotas",  tasa:3.5,  multiplicador:1.0683 },
  { cant:3,  label:"3 cuotas",  tasa:4.9,  multiplicador:1.1023 },
  { cant:6,  label:"6 cuotas",  tasa:10.3, multiplicador:1.2207 },
  { cant:9,  label:"9 cuotas",  tasa:15.3, multiplicador:1.3696 },
  { cant:12, label:"12 cuotas", tasa:19.5, multiplicador:1.5355 },
  { cant:18, label:"18 cuotas", tasa:26.1, multiplicador:1.8651 },
];
export const CUOTAS_DEFAULT = CUOTAS_MP.find(c => c.cant === 12); // 12 cuotas por defecto

/* ═══════════════════════════════════════════════════════════════════
   COMISIONES DE VENDEDORES
   ═══════════════════════════════════════════════════════════════════ */
export const FORMAS_PAGO = [
  { key:"efectivo", label:"Efectivo" },
  ...CUOTAS_MP.map(c => ({ key:String(c.cant), label:c.label })),
];

// Sub-tabs por familia (derivados del ID del producto)
export const SUBTAB_CFG = {
  "Estribos":           { tabs:["BlackTrend","Aluminio","G3 Pulido","G3 Negro","Inyectado","Eléctrico DP-20","Soportes"],
    fn: p => {
      if(p.id.startsWith("SEA")) return "Soportes";
      if(["7500","7506","7511","7521","7516"].includes(p.id)) return "Eléctrico DP-20";
      if(p.id.startsWith("EBT")||p.id.startsWith("EBW")||p.id.startsWith("EBWL")) return "BlackTrend";
      if(p.id.startsWith("EIM")||p.id.startsWith("EOP")||p.id.startsWith("ESG")||p.id.startsWith("EIMN")||p.id.startsWith("EOPN")||p.id.startsWith("ESGN")) return "Aluminio";
      if(p.id.includes("A-B1")) return "G3 Negro";
      if(p.id.includes("-B1")) return "G3 Pulido";
      return "Inyectado";
    }
  },
  "Enganches Pesados":  { tabs:["Enganches","Acoples"],   fn: p => p.id.startsWith("ASE") ? "Acoples"    : "Enganches" },
  "Enganches Livianos": { tabs:["Enganches","Acoples"],   fn: p => p.id.startsWith("EAC") ? "Acoples"    : "Enganches" },
  "Defensas Bajas":     { tabs:["Inoxidable","Negra"],    fn: p => p.id.startsWith("DBI") ? "Inoxidable" : "Negra" },
  "Baúl":      { tabs:["Baúles","Barras"],       fn: p => p.nombre.includes("BARRA") ? "Barras"  : "Baúles" },
  "Barras de Trabajo":  { tabs:["Barras","Lanzas"],       fn: p => p.id.startsWith("LBT")   ? "Lanzas"      : "Barras" },
  "Barra Extreme Plus": { tabs:["Inoxidable","Negra"],    fn: p => p.id.startsWith("BPI")   ? "Inoxidable"  : "Negra" },
  // Ziel Technology
  "Alfombras":    { tabs:["Habitáculo","Combo"],    fn: p => p.nombre.includes("COMBO") ? "Combo" : "Habitáculo" },
  "Accesorios ZT":      { tabs:["Neumáticos","Otros"],    fn: p => ["ZTR1116/110","ZTD1120/111","ZTCP/114","ZTCom/115","ZTComXXL/116","ZTKRN/120"].includes(p.id) ? "Neumáticos" : "Otros" },
  "Cobertores de Caja": { tabs:["Ziel","ProForm Bedliner"], fn: p => p.proveedor==="Truckliner" ? "ProForm Bedliner" : "Ziel" },
  "Lonas Flashcover":  { tabs:["Force","Roller","Repuestos"], fn: p => p.id.endsWith("FF") || p.id.includes("FF-") ? "Force" : p.id.endsWith("RP") ? "Roller" : "Repuestos" },
  "Tapas Rígidas":     { tabs:["Top Tiger","Tricover","Plegable","Retráctil"], fn: p => p.id.startsWith("KTT") ? "Tricover" : p.id.startsWith("KTP") ? "Plegable" : p.id.startsWith("KTR") ? "Retráctil" : "Top Tiger" },
};
