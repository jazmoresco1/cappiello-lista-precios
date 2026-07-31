export default function PinModal({ pinTarget, pinInput, setPinInput, pinError, setPinError, pinErrorMsg, handlePin, onClose }) {
  return (
    <div className="ovl" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mdl" style={{maxWidth:320,padding:24}}>
        <div className="mhd" style={{marginBottom:16}}>
          <div className="mtt">Acceso interno</div>
          <button className="mx" onClick={onClose}>✕</button>
        </div>
        <p style={{fontSize:13,color:"var(--tx2)",marginBottom:16}}>
          {pinTarget==="vendedores" ? "Ingresá la clave de administrador para configurar vendedores y comisiones."
            : pinTarget==="ventas" ? "Ingresá la clave de administrador para ver ventas y ganancia real."
            : pinTarget==="socios" ? "Ingresá la clave de administrador para ver el reparto entre socios."
            : pinTarget==="facturas" ? "Ingresá la clave de administrador para ver las facturas de proveedor."
            : pinTarget==="gastos" ? "Ingresá la clave de administrador para ver gastos fijos y variables."
            : pinTarget==="radar" ? "Ingresá la clave de administrador para ver el radar de competencia."
            : pinTarget==="dashboard" ? "Ingresá la clave de administrador para ver el dashboard."
            : pinTarget==="controlProveedor" ? "Ingresá la clave de administrador para controlar precios de proveedor."
            : pinTarget==="stock" ? "Ingresá tu clave (admin o vendedor) para ver el stock."
            : pinTarget==="guardarVenta" ? "Ingresá tu clave (admin o vendedor) para guardar esta venta."
            : "Ingresá tu clave de administrador o de vendedor."}
        </p>
        <input
          autoFocus type="password" placeholder="Clave…"
          value={pinInput} onChange={e=>{setPinInput(e.target.value);setPinError(false);}}
          onKeyDown={e=>e.key==="Enter"&&handlePin()}
          style={{width:"100%",background:"#222",border:`1px solid ${pinError?"#c0392b":"#444"}`,borderRadius:8,padding:"10px 14px",color:"#fff",fontSize:15,fontFamily:"'DM Sans',sans-serif",outline:"none",boxSizing:"border-box",marginBottom:8}}
        />
        {pinError && <div style={{color:"#c0392b",fontSize:12,marginBottom:8}}>{pinErrorMsg || "Clave incorrecta"}</div>}
        <button onClick={handlePin}
          style={{width:"100%",background:"var(--ac)",border:"none",borderRadius:8,padding:"10px",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
          Ingresar
        </button>
      </div>
    </div>
  );
}
