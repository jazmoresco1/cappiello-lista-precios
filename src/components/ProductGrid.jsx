import { PROVEEDORES_INFO } from "../data/catalogo.js";
import { ARS, getColorBadge } from "../utils.js";

export default function ProductGrid({
  busqueda, setBusqueda, busqGlobal, setBusqGlobal, familia,
  filtrados, proveedores,
  getCfg, updCfg, unlocked, getPrecios, cuotas,
  overrides, setOvr, editando, setEditando,
  getImages, editStock, setEditStk, getStk, updStk, totalStk,
  abrirModal, agregarACot, cotItems,
}) {
  return (
    <div className="cnt">
      {busqueda && (
        <div className="srch-info">
          {filtrados.length} resultado{filtrados.length!==1?"s":""} en {busqGlobal?"todo el catálogo":familia} para "<strong>{busqueda}</strong>"
          {!busqGlobal && (
            <button onClick={()=>setBusqGlobal(true)}
              style={{marginLeft:8,background:"var(--ac-bg)",border:"1px solid var(--ac)",color:"var(--ac)",cursor:"pointer",fontSize:11,borderRadius:5,padding:"2px 8px"}}>
              🔍 Buscar en todo el catálogo
            </button>
          )}
          {busqGlobal && (
            <button onClick={()=>setBusqGlobal(false)}
              style={{marginLeft:8,background:"none",border:"1px solid #444",color:"#aaa",cursor:"pointer",fontSize:11,borderRadius:5,padding:"2px 8px"}}>
              ← Solo en {familia}
            </button>
          )}
          <button onClick={()=>{setBusqueda("");setBusqGlobal(false);}}
            style={{marginLeft:8,background:"none",border:"none",color:"#666",cursor:"pointer",fontSize:12}}>✕</button>
        </div>
      )}

      {filtrados.length===0
        ? <div className="no-res">
            Sin resultados{busqueda?` para "${busqueda}" en ${busqGlobal?"el catálogo":familia}`:" en esta familia"}.
            {busqueda && !busqGlobal && (
              <button onClick={()=>setBusqGlobal(true)}
                style={{marginLeft:8,background:"var(--ac-bg)",border:"1px solid var(--ac)",color:"var(--ac)",cursor:"pointer",fontSize:11,borderRadius:5,padding:"2px 8px"}}>
                Buscar en todo el catálogo
              </button>
            )}
          </div>
        : proveedores.map(prov=>{
            const pp = filtrados.filter(p=>p.proveedor===prov);
            const info = PROVEEDORES_INFO[prov]||{};
            const fams = busqueda ? [...new Set(pp.map(p=>p.familia))] : [familia];
            return (
              <div className="pb" key={prov}>
                <div className="ph">
                  <div className="ph-top">
                    <div style={{display:"flex",alignItems:"center",gap:9}}>
                      <span className="ph-badge">{prov}</span>
                      <span className="ph-cnt">{pp.length} productos</span>
                    </div>
                    <div className="ph-meta">
                      {info.web && unlocked && <a href={info.web} target="_blank" rel="noreferrer" className="ph-link">🔒🔗 {prov}</a>}
                    </div>
                  </div>
                  <div className="ph-cfgs">
                    {fams.map(fam=>{
                      const cfg=getCfg(prov,fam);
                      return (
                        <div className="cfg-grp" key={fam}>
                          <span className="cgl">{fam}</span>
                          <div className="cgrow"><span className="cgu">Dto</span>
                            <input className="cgi" type="number" value={cfg.descuento}
                              onChange={e=>updCfg(prov,fam,"descuento",e.target.value)}/>
                            <span className="cgu">%</span></div>
                          <div className="cgrow"><span className="cgu">IVA</span>
                            <input className="cgi" type="number" value={cfg.iva}
                              onChange={e=>updCfg(prov,fam,"iva",e.target.value)}/>
                            <span className="cgu">%</span></div>
                          <div className="cgrow"><span className="cgu">Mkp</span>
                            <input className="cgi" type="number" value={cfg.markup}
                              onChange={e=>updCfg(prov,fam,"markup",e.target.value)}/>
                            <span className="cgu">%</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid">
                  {pp.map(p=>{
                    const {venta,cuota,desc}=getPrecios(p);
                    const tieneOvr = overrides[p.id]!==undefined||p.descuentoOverride!==undefined;
                    const enEdit   = editando===p.id;
                    const colorBadge = getColorBadge(p.nombre);
                    return (
                      <div className="card" key={p.id}>
                        {getImages(p).length>0
                          ? <img className="card-img" src={getImages(p)[0]} alt={p.nombre} onError={e=>{e.currentTarget.style.display="none";}}/>
                          : <div className="card-nimg">📦</div>}
                        <div className="cb">
                          <div className="cb-r1">
                            <span className="cb-code">{p.id}</span>
                            <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                              {colorBadge==="negro"    && <span className="cbadge cbadge-negro">● Negro</span>}
                              {colorBadge==="aluminio" && <span className="cbadge cbadge-aluminio">● Aluminio</span>}
                              {colorBadge==="inox"     && <span className="cbadge cbadge-inox">✦ Inox</span>}
                              {tieneOvr && <span className="cb-ovr">dto {desc}% ✎</span>}
                            </div>
                          </div>
                          <div className="cb-name">{p.nombre}</div>
                          <div className="cb-compat">{p.compat}</div>
                          <div className="cb-prices">
                            <div className="pr">
                              <span className="prl">Mayorista</span>
                              <span className="pref">{ARS(Math.round(p.listaVenta*1.25))}</span>
                            </div>
                            <div className="pr">
                              <span className="prl">Minorista</span>
                              <span className="pref" style={{color:"var(--ac)"}}>{ARS(Math.round(venta))}</span>
                            </div>
                            {unlocked && (
                              <div className="pr">
                                <span className="prl">Efectivo (neto)</span>
                                <span className="pref" style={{fontSize:12,color:"var(--tx2)"}}>{ARS(venta)}</span>
                              </div>
                            )}
                            <div className="pr">
                              <span className="prl">{cuotas.label}</span>
                              <div style={{textAlign:"right"}}>
                                <span className="prq">{ARS(Math.round(venta*cuotas.multiplicador/cuotas.cant))}/mes</span>
                                <div style={{fontSize:10,color:"var(--tx2)",marginTop:1}}>sobre precio minorista</div>
                              </div>
                            </div>
                          </div>

                          {/* STOCK — solo admin */}
                          {unlocked && (
                            editStock===p.id ? (
                            <div className="stk-edit-wrap" style={{marginBottom:10}}>
                              <span className="stk-edit-lbl">Royriff</span>
                              <input className="stk-edit-inp" type="number" min="0"
                                defaultValue={getStk(p.id).royriff}
                                onChange={e=>updStk(p.id,"royriff",e.target.value)}/>
                              <span className="stk-edit-lbl">Depósito</span>
                              <input className="stk-edit-inp" type="number" min="0"
                                defaultValue={getStk(p.id).deposito}
                                onChange={e=>updStk(p.id,"deposito",e.target.value)}/>
                              <button className="drst" onClick={()=>setEditStk(null)}>✓</button>
                            </div>
                          ) : (
                            <div className="stk-row" onClick={()=>setEditStk(p.id)} title="Click para editar stock" style={{cursor:"pointer"}}>
                              <span className="stk-lbl">Stock</span>
                              <div className="stk-loc">
                                <span className="stk-loc-name">Royriff</span>
                                <span className={`stk-loc-val${getStk(p.id).royriff>0?" ok":" zero"}`}>{getStk(p.id).royriff}</span>
                              </div>
                              <div className="stk-loc">
                                <span className="stk-loc-name">Depósito</span>
                                <span className={`stk-loc-val${getStk(p.id).deposito>0?" ok":" zero"}`}>{getStk(p.id).deposito}</span>
                              </div>
                              {totalStk(p.id)===0
                                ? <span className="stk-badge stk-badge-zero">Sin stock</span>
                                : totalStk(p.id)<=2
                                ? <span className="stk-badge stk-badge-low">Último/s</span>
                                : <span className="stk-badge stk-badge-ok">En stock</span>
                              }
                            </div>
                          ))}
                          <div className="cb-acts">
                            <button className="bver" onClick={()=>abrirModal(p)}>
                              Ver más →{getImages(p).length>0&&<span style={{fontSize:10,marginLeft:4,opacity:.7}}>📷{getImages(p).length}</span>}
                            </button>
                            <button title="Agregar a cotización"
                              onClick={()=>agregarACot(p)}
                              style={{padding:"8px 10px",background:"#141414",border:"1px solid #2a2a2a",borderRadius:8,cursor:"pointer",fontSize:14,color:cotItems.find(i=>i.id===p.id)?"var(--ac)":"#aaa",transition:"all .15s",flexShrink:0}}
                            >🧾</button>
                            {enEdit ? (
                              <div className="dedit">
                                <input autoFocus type="number"
                                  defaultValue={overrides[p.id]??p.descuentoOverride??getCfg(p.proveedor,p.familia).descuento}
                                  onBlur={e=>{setOvr(prev=>({...prev,[p.id]:parseFloat(e.target.value)||0}));setEditando(null)}}
                                  onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape")setEditando(null)}}/>
                                {overrides[p.id]!==undefined&&(
                                  <button className="drst" onClick={()=>{setOvr(prev=>{const n={...prev};delete n[p.id];return n});setEditando(null)}}>↺</button>
                                )}
                              </div>
                            ):(
                              <button className={`bdsc${tieneOvr?" on":""}`} onClick={()=>setEditando(p.id)} title="Editar descuento individual">
                                ✎ {desc}%
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
      }
    </div>
  );
}
