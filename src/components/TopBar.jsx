import { PRODUCTOS } from "../data/productos.js";
import { CUOTAS_MP } from "../data/catalogo.js";

export default function TopBar({
  busqueda, setBusqueda, setBusqGlobal,
  cfgOpen, setCfgOpen, setImgOpen, setImgSP,
  setCotOpen, cotItems,
  abrirVendedores, abrirStock, abrirVentas, abrirSocios, abrirFacturas, abrirGastos, abrirRadar, abrirDashboard,
  abrirControlProveedor,
  unlocked, setUnlocked, setPinOpen,
  cuotas, setCuotas,
  familias, familia, cambiarFamilia,
  subtabCfg, subtabActual, setSubtab,
}) {
  return (
    <>
      <div className="hdr">
        <img src="/logo.jpeg" alt="MonsterTrail" style={{height:36,width:36,borderRadius:6,objectFit:"cover",flexShrink:0}}/>
        <div className="hdr-brand">MonsterTrail</div>
        <div className="hdr-dot"/>
        <div className="hdr-sub">lista de precios 4×4</div>
        <div className="hdr-srch">
          <span className="hdr-srch-ico">🔍</span>
          <input placeholder="Buscar código, nombre, vehículo..."
            value={busqueda} onChange={e=>{setBusqueda(e.target.value);setBusqGlobal(false);}}/>
        </div>
        <button className="hdr-btn" onClick={()=>setCfgOpen(v=>!v)}>⚙ Cuotas</button>
        <button className="hdr-btn" onClick={()=>{setImgOpen(v=>!v);setImgSP(null);}}
          title="Gestor de imágenes y videos">🖼 Imágenes</button>
        <button className="hdr-btn" onClick={()=>setCotOpen(v=>!v)}
          style={{background:cotItems.length?"var(--ac)":"#222",borderColor:cotItems.length?"var(--ac)":"#333",color:"#fff"}}>
          🧾 Cotizar {cotItems.length>0 && <span className="cot-badge">{cotItems.length}</span>}
        </button>
        <button className="hdr-btn" onClick={abrirVendedores}
          title="Vendedores y comisiones (requiere clave)">
          👤 Vendedores
        </button>
        <button className="hdr-btn" onClick={abrirStock}
          title="Cargar / ajustar stock (requiere clave)">
          📦 Stock
        </button>
        <button className="hdr-btn" onClick={abrirVentas}
          title="Ventas y ganancia real (requiere clave)">
          📊 Ventas
        </button>
        <button className="hdr-btn" onClick={abrirSocios}
          title="Reparto de ganancia y gastos entre socios (requiere clave)">
          🤝 Socios
        </button>
        <button className="hdr-btn" onClick={abrirFacturas}
          title="Facturas de proveedor leídas por IA (requiere clave)">
          🧾 Facturas
        </button>
        <button className="hdr-btn" onClick={abrirGastos}
          title="Gastos fijos y variables de la empresa (requiere clave)">
          💸 Gastos
        </button>
        <button className="hdr-btn" onClick={abrirRadar}
          title="Radar de competencia en Mercado Libre (requiere clave)">
          📡 Competencia
        </button>
        <button className="hdr-btn" onClick={abrirDashboard}
          title="Dashboard con filtros dinámicos: ventas, gastos, socios y competencia (requiere clave)">
          📊 Dashboard
        </button>
        <button className="hdr-btn" onClick={abrirControlProveedor}
          title="Subir el informe del proveedor y controlar precios (requiere clave)">
          🔍 Control Proveedor
        </button>
        <button className="hdr-btn" onClick={()=>unlocked?setUnlocked(false):setPinOpen(true)}
          title={unlocked?"Bloquear acceso interno":"Acceso interno"}
          style={{borderColor:unlocked?"var(--ok)":"#333",color:unlocked?"var(--ok)":"#aaa"}}>
          {unlocked?"🔓 Admin":"🔒"}
        </button>
      </div>

      {cfgOpen && (
        <div className="qstrip">
          <div className="qstrip-in">
            <span className="ql">Plan de cuotas</span>
            <div className="qrow"><span className="ql">Seleccionar plan</span>
              <select style={{border:"1px solid var(--bd)",borderRadius:6,padding:"5px 8px",fontFamily:"'DM Sans',sans-serif",fontSize:13,background:"var(--sf2)",color:"var(--tx)",outline:"none"}}
                value={cuotas.cant}
                onChange={e=>setCuotas(CUOTAS_MP.find(c=>c.cant===+e.target.value))}>
                {CUOTAS_MP.map(c=><option key={c.cant} value={c.cant}>{c.label} — ×{c.multiplicador} (tasa {c.tasa}%)</option>)}
              </select></div>
            <span className="qhint">💡 Tasas reales MercadoPago · Dto/IVA/Markup por proveedor ↓</span>
          </div>
        </div>
      )}

      <div className="fnav">
        {familias.map(f=>(
          <button key={f} className={`ftab${familia===f&&!busqueda?" on":""}`}
            onClick={()=>cambiarFamilia(f)}>{f}</button>
        ))}
      </div>

      {/* SUB-TABS (solo cuando la familia los tiene y no hay búsqueda) */}
      {!busqueda && subtabCfg && (
        <div className="snav">
          {subtabCfg.tabs.map(st => {
            const count = PRODUCTOS.filter(p=>p.familia===familia && subtabCfg.fn(p)===st).length;
            return (
              <button key={st} className={`stab${subtabActual===st?" on":""}`}
                onClick={()=>setSubtab(st)}>
                {st} <span style={{fontSize:10,color:"inherit",opacity:.6}}>({count})</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
