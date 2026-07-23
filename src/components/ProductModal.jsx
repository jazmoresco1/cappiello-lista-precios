import { PROVEEDORES_INFO } from "../data/catalogo.js";
import { ARS } from "../utils.js";

export default function ProductModal({
  modal, cerrarModal, getPrecios, getCfg, unlocked, cuotas, getStk, updStk, totalStk,
}) {
  const {venta,cuota,desc}=getPrecios(modal);
  const cfg=getCfg(modal.proveedor,modal.familia);
  const neto=modal.listaVenta*(1-desc/100);
  const conIva=neto*(1+cfg.iva/100);
  const info=PROVEEDORES_INFO[modal.proveedor]||{};
  return (
    <div className="ovl" onClick={e=>e.target===e.currentTarget&&cerrarModal()}>
      <div className="mdl">
        <div className="mhd">
          <div>
            <div className="mcd">{modal.id} · {modal.proveedor} · {modal.familia}</div>
            <div className="mtt">{modal.nombre}</div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <button
              onClick={()=>{
                const url = window.location.origin + window.location.pathname + "?p=" + encodeURIComponent(modal.id);
                navigator.clipboard.writeText(url).then(()=>alert("¡Link copiado!")).catch(()=>prompt("Copiá este link:",url));
              }}
              style={{background:"#222",border:"1px solid #333",color:"#aaa",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11,fontFamily:"'DM Sans',sans-serif"}}
              title="Copiar link de este producto">
              🔗 Copiar link
            </button>
            <button className="mx" onClick={()=>cerrarModal()}>✕</button>
          </div>
        </div>
        {modal.images?.length>0
          ? <div className="gal">{modal.images.map((img,i)=><img key={i} src={img} alt={`foto ${i+1}`}/>)}</div>
          : <div className="gal-empty">📷</div>}
        <div className="mb">
          <div className="pbox">
            <div className="pbi"><span className="pbl" style={{fontWeight:700}}>Precio Mayorista (+25%)</span><span className="pbv-big">{ARS(Math.round(modal.listaVenta*1.25))}</span></div>
            <div className="pbi"><span className="pbl" style={{fontWeight:700,color:"var(--ac)"}}>Precio Minorista</span><span className="pbv-big" style={{color:"var(--ac)"}}>{ARS(Math.round(venta))}</span></div>
            <div className="pbi"><span className="pbl">{cuotas.label} s/ minorista</span><span className="pbv-med">{ARS(Math.round(venta*cuotas.multiplicador/cuotas.cant))}/mes</span></div>
            {unlocked && <>
              <div style={{borderTop:"1px solid #2a2a2a",margin:"8px 0",paddingTop:8}}>
                <div className="pbi"><span className="pbl" style={{color:"var(--tx2)"}}>🔒 Neto efectivo</span><span className="pbv-sm">{ARS(venta)}</span></div>
                <div className="pbi"><span className="pbl" style={{color:"var(--tx2)"}}>🔒 Lista proveedor</span><span className="pbv-sm">{ARS(modal.listaVenta)}</span></div>
                <div className="pbi"><span className="pbl" style={{color:"var(--tx2)"}}>🔒 Costo c/IVA {cfg.iva}%</span><span className="pbv-sm">{ARS(conIva)}</span></div>
              </div>
            </>}
          </div>

          {/* STOCK en modal — solo admin */}
          {unlocked && (
          <div className="ms">
            <div className="mst">🔒 Stock</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"8px 14px"}}>
                <span style={{fontSize:12,color:"var(--tx2)",fontWeight:500}}>Royriff</span>
                <input className="stk-edit-inp" type="number" min="0"
                  value={getStk(modal.id).royriff}
                  onChange={e=>updStk(modal.id,"royriff",e.target.value)}/>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"8px 14px"}}>
                <span style={{fontSize:12,color:"var(--tx2)",fontWeight:500}}>Depósito</span>
                <input className="stk-edit-inp" type="number" min="0"
                  value={getStk(modal.id).deposito}
                  onChange={e=>updStk(modal.id,"deposito",e.target.value)}/>
              </div>
              <span style={{fontSize:12,color:"var(--tx2)"}}>Total: <strong style={{color:totalStk(modal.id)>0?"var(--ok)":"#c0392b"}}>{totalStk(modal.id)}</strong></span>
            </div>
          </div>
          )} {/* fin bloque admin stock */}
          <div className="ms">
            <div className="mst">Compatibilidad</div>
            <div className="si"><span className="sd"/>{modal.compat}</div>
          </div>
          {modal.specs?.length>0&&(
            <div className="ms">
              <div className="mst">Especificaciones técnicas</div>
              {modal.specs.map((s,i)=><div className="si" key={i}><span className="sd"/>{s}</div>)}
            </div>
          )}
          {modal.accesorios?.length>0&&(
            <div className="ms">
              <div className="mst">Accesorios</div>
              {modal.accesorios.map((a,i)=>(
                <div className="ai" key={i}>
                  <span>{a.n}</span>
                  <span className={a.inc?"byok":"byno"}>{a.inc?"✓ Incluido":"No incluido"}</span>
                </div>
              ))}
            </div>
          )}
          <div className="ms">
            <div className="mst">Recursos</div>
            <div className="mlnks">
              {unlocked && info.web&&<a href={info.web} target="_blank" rel="noreferrer" className="mln mln-dk">🔒🔗 Ver en {modal.proveedor}</a>}
              {modal.manual&&<a href={modal.manual} target="_blank" rel="noreferrer" className="mln mln-lt">📄 Manual</a>}
              {modal.videos?.map((v,i)=><a key={i} href={v} target="_blank" rel="noreferrer" className="mln mln-lt">▶ Video {i+1}</a>)}
              {(!unlocked||!info.web)&&!modal.manual&&!modal.videos?.length&&<span className="no-rec">Sin recursos cargados aún</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
