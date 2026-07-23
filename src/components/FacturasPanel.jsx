import { ARS } from "../utils.js";

export default function FacturasPanel({
  facturaSel, setFacturaSel, facturasLoading, facturas, onClose, onMarcarRevisada,
}) {
  return (
    <div className="img-panel">
      <div className="img-head">
        <div>
          <div className="img-head-title">🧾 Facturas de proveedor</div>
          <div className="img-head-sub">Leídas automáticamente por IA desde la carpeta de Drive</div>
        </div>
        <button className="cot-x" onClick={onClose}>✕</button>
      </div>

      <div className="img-body">
        {facturaSel ? (
          <div className="img-detail">
            <div className="img-detail-header">
              <div className="img-detail-name">{facturaSel.proveedor || facturaSel.archivo_nombre || "Factura"}</div>
              <button className="img-back" onClick={()=>setFacturaSel(null)}>← Volver</button>
            </div>
            <div style={{fontSize:12,color:"var(--tx2)",marginBottom:10}}>
              {facturaSel.numero_factura && <>Nº {facturaSel.numero_factura} · </>}
              {facturaSel.fecha_factura && <>{new Date(facturaSel.fecha_factura).toLocaleDateString("es-AR")} · </>}
              Estado: {facturaSel.estado}
            </div>
            <div className="img-section-title">Productos detectados</div>
            <div className="img-prod-list" style={{marginBottom:14}}>
              {(Array.isArray(facturaSel.productos_detectados) ? facturaSel.productos_detectados : []).map((it,i)=>(
                <div key={i} className="img-prod-row" style={{cursor:"default"}}>
                  <div className="img-prod-info">
                    <div className="img-prod-name">{it.descripcion || it.nombre || "(sin descripción)"}</div>
                    <div className="img-prod-count">
                      x{it.cantidad ?? "?"} · {it.precio_unitario!=null ? ARS(it.precio_unitario) : "—"} c/u
                      {it.importe!=null && <> · total {ARS(it.importe)}</>}
                    </div>
                  </div>
                </div>
              ))}
              {(!Array.isArray(facturaSel.productos_detectados) || facturaSel.productos_detectados.length===0) && (
                <div className="cot-empty" style={{padding:12}}>No se detectaron productos en esta factura.</div>
              )}
            </div>
            {facturaSel.estado !== "revisado" && (
              <button className="img-auto-btn" onClick={()=>onMarcarRevisada(facturaSel.id)}>
                Marcar como revisada
              </button>
            )}
          </div>
        ) : facturasLoading ? (
          <div className="cot-empty" style={{padding:12}}>Cargando…</div>
        ) : facturas.length===0 ? (
          <div className="cot-empty">
            <div style={{fontSize:32,marginBottom:8}}>🧾</div>
            <div>Todavía no se leyó ninguna factura</div>
            <div style={{fontSize:11,marginTop:4}}>Subí una foto o PDF a la carpeta "Facturas Proveedores" de Drive</div>
          </div>
        ) : (
          <div className="img-prod-list">
            {facturas.map(f=>(
              <div key={f.id} className="img-prod-row" style={{cursor:"pointer"}} onClick={()=>setFacturaSel(f)}>
                <div className="img-prod-thumb-empty">{f.estado==="revisado"?"✅":"🧾"}</div>
                <div className="img-prod-info">
                  <div className="img-prod-name">{f.proveedor || f.archivo_nombre || "Factura"}</div>
                  <div className="img-prod-count">
                    {f.fecha_factura ? new Date(f.fecha_factura).toLocaleDateString("es-AR") : new Date(f.creado_en).toLocaleDateString("es-AR")}
                    {" · "}{f.total_items ?? 0} productos · {f.estado}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
