import { PRODUCTOS } from "../data/productos.js";

export default function ImageManagerPanel({
  imgOvr, saveImgOvr, getImages, getVideos,
  imgFilter, setImgFilter,
  imgSearchProd, setImgSP,
  imgFound, setImgFound, imgSearching, buscarImagenes,
  imgManualUrl, setImgMUrl, imgManualVid, setImgMVid,
  addImg, removeImg, addVid, removeVid,
  onClose,
}) {
  return (
    <div className="img-panel">
      <div className="img-head">
        <div>
          <div className="img-head-title">🖼 Gestor de Imágenes</div>
          <div className="img-head-sub">
            {Object.keys(imgOvr).length} productos con imágenes · {PRODUCTOS.filter(p=>getImages(p).length===0).length} sin fotos
          </div>
        </div>
        <button className="cot-x" onClick={onClose}>✕</button>
      </div>
      <div className="img-body">
        {!imgSearchProd ? (
          <>
            <input className="img-filter" placeholder="Buscar por nombre o código..."
              value={imgFilter} onChange={e=>setImgFilter(e.target.value)}/>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {["Steel Tiger","Ziel Technology","Padlock"].map(prov=>{
                const total=PRODUCTOS.filter(p=>p.proveedor===prov).length;
                const con=PRODUCTOS.filter(p=>p.proveedor===prov&&getImages(p).length>0).length;
                return <div key={prov} style={{flex:1,background:"#141414",borderRadius:8,padding:"8px 10px"}}>
                  <div style={{fontSize:9,color:"#666",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{prov}</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,fontWeight:700,color:"var(--ac)"}}>{con}<span style={{color:"#444"}}>/{total}</span></div>
                </div>;
              })}
            </div>
            <div className="img-prod-list">
              {PRODUCTOS
                .filter(p=>!imgFilter.trim()||p.nombre.toLowerCase().includes(imgFilter.toLowerCase())||p.id.toLowerCase().includes(imgFilter.toLowerCase()))
                .slice(0,60).map(p=>{
                  const imgs=getImages(p);
                  return <div key={p.id} className="img-prod-row" onClick={()=>{setImgSP(p);setImgFound([]);setImgMUrl("");setImgMVid("");}}>
                    {imgs[0]?<img className="img-prod-thumb" src={imgs[0]} alt="" onError={e=>e.target.style.display="none"}/>:<div className="img-prod-thumb-empty">📷</div>}
                    <div className="img-prod-info">
                      <div className="img-prod-code">{p.id} · {p.proveedor}</div>
                      <div className="img-prod-name">{p.nombre}</div>
                      <div className={`img-prod-count${imgs.length>0?" has":""}`}>
                        {imgs.length>0?`✓ ${imgs.length} foto${imgs.length!==1?"s":""}${getVideos(p).length>0?` · ${getVideos(p).length} video${getVideos(p).length!==1?"s":""}`:""}`:"Sin fotos"}
                      </div>
                    </div>
                    <span style={{color:"#444",fontSize:16}}>›</span>
                  </div>;
                })}
            </div>
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button className="img-export-btn" style={{flex:1,marginTop:0}} onClick={()=>{
                const blob=new Blob([JSON.stringify(imgOvr,null,2)],{type:"application/json"});
                const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="img_overrides.json";a.click();
              }}>⬇ Exportar JSON</button>
              <button className="img-export-btn" style={{flex:1,marginTop:0,borderColor:"var(--ac)",color:"var(--ac)"}} onClick={()=>{
                const input=document.createElement("input");
                input.type="file";input.accept=".json";
                input.onchange=e=>{
                  const file=e.target.files[0]; if(!file) return;
                  const reader=new FileReader();
                  reader.onload=ev=>{
                    try{
                      const data=JSON.parse(ev.target.result);
                      const merged={...imgOvr};
                      let count=0;
                      Object.entries(data).forEach(([id,val])=>{
                        if(val.images?.length||val.videos?.length||val.manual){merged[id]=val;count++;}
                      });
                      saveImgOvr(merged);
                      alert(`✓ Importados ${count} productos con imágenes.`);
                    }catch{alert("Error leyendo el JSON.");}
                  };
                  reader.readAsText(file);
                };
                input.click();
              }}>⬆ Importar (scraper)</button>
            </div>
          </>
        ):(
          <div className="img-detail">
            <div className="img-detail-header">
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"#aaa",letterSpacing:".8px",marginBottom:2}}>{imgSearchProd.id} · {imgSearchProd.proveedor}</div>
                <div className="img-detail-name">{imgSearchProd.nombre}</div>
                <div style={{fontSize:11,color:"var(--tx2)",marginTop:2}}>{imgSearchProd.compat}</div>
              </div>
              <button className="img-back" onClick={()=>setImgSP(null)}>← Volver</button>
            </div>
            <div className="img-section-title">📷 Fotos ({getImages(imgSearchProd).length})</div>
            {getImages(imgSearchProd).length>0
              ?<div className="img-gallery">{getImages(imgSearchProd).map((url,i)=>(
                <div key={i} className="img-thumb-wrap">
                  <img src={url} alt="" onError={e=>e.target.parentNode.style.opacity=".3"}/>
                  <button className="img-thumb-del" onClick={()=>removeImg(imgSearchProd.id,url)}>✕</button>
                </div>))}</div>
              :<div className="img-empty-gal">Sin fotos todavía</div>
            }
            <div className="img-section-title">🤖 Buscar con IA automáticamente</div>
            <button className="img-auto-btn" disabled={imgSearching} onClick={()=>buscarImagenes(imgSearchProd)}>
              {imgSearching?<><span className="img-spin">⟳</span> Buscando en la web...</>:"🔍 Buscar fotos y videos automáticamente"}
            </button>
            {imgFound?.error&&<div className="img-found-err">⚠ {imgFound.error}</div>}
            {imgFound?.images?.length>0&&<>
              <div style={{fontSize:11,color:"var(--ok)",marginBottom:8,fontWeight:600}}>✓ {imgFound.images.length} imagen{imgFound.images.length!==1?"es":""} encontrada{imgFound.images.length!==1?"s":""}. Tocá para agregar:</div>
              <div className="img-found-grid">{imgFound.images.map((url,i)=>{
                const ya=getImages(imgSearchProd).includes(url);
                return <div key={i} className="img-found-item" style={{borderColor:ya?"var(--ok)":"transparent"}} onClick={()=>!ya&&addImg(imgSearchProd.id,url)}>
                  <img src={url} alt="" onError={e=>e.target.parentNode.style.opacity=".3"}/>
                  <button className="img-found-add">{ya?"✓":"+"}</button>
                </div>;})}</div>
            </>}
            {imgFound?.videos?.length>0&&<>
              <div style={{fontSize:11,color:"var(--ok)",marginBottom:6,fontWeight:600}}>📹 Videos encontrados:</div>
              {imgFound.videos.map((v,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <div style={{flex:1,fontSize:11,color:"#aaa",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
                <button className="img-manual-btn" onClick={()=>addVid(imgSearchProd.id,v)}>+ Agregar</button>
              </div>)}
            </>}
            <div className="img-section-title">✍ Agregar foto manualmente</div>
            <div className="img-manual-row">
              <input className="img-manual-inp" placeholder="Pegá la URL de la foto (.jpg, .png...)"
                value={imgManualUrl} onChange={e=>setImgMUrl(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&imgManualUrl.trim()){addImg(imgSearchProd.id,imgManualUrl.trim());setImgMUrl("");}}}/>
              <button className="img-manual-btn" onClick={()=>{if(imgManualUrl.trim()){addImg(imgSearchProd.id,imgManualUrl.trim());setImgMUrl("");}}}>+ Foto</button>
            </div>
            <div className="img-section-title">📹 Videos ({getVideos(imgSearchProd).length})</div>
            {getVideos(imgSearchProd).length>0&&<div className="img-vid-list">{getVideos(imgSearchProd).map((v,i)=>(
              <div key={i} className="img-vid-row">
                <div className="img-vid-url" title={v}>{v}</div>
                <a href={v} target="_blank" rel="noreferrer" style={{color:"var(--ac)",fontSize:11}}>▶</a>
                <button className="img-vid-del" onClick={()=>removeVid(imgSearchProd.id,v)}>✕</button>
              </div>))}</div>}
            <div className="img-manual-row">
              <input className="img-manual-inp" placeholder="YouTube, Instagram, etc."
                value={imgManualVid} onChange={e=>setImgMVid(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&imgManualVid.trim()){addVid(imgSearchProd.id,imgManualVid.trim());setImgMVid("");}}}/>
              <button className="img-manual-btn" onClick={()=>{if(imgManualVid.trim()){addVid(imgSearchProd.id,imgManualVid.trim());setImgMVid("");}}}>+ Video</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
