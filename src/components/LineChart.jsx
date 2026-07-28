// Gráfico de línea liviano, sin dependencias externas (SVG a mano).
// points: [{x: string, y: number}], ya ordenados de más viejo a más nuevo.
export default function LineChart({ points, color = "var(--ac)", height = 90, formatY = v => v, invert = false }) {
  const W = 600, H = height, PAD = 8, PADX = 4;

  if (!points || points.length === 0) {
    return <div className="cot-empty" style={{padding:10,fontSize:12}}>Sin datos todavía para graficar.</div>;
  }
  if (points.length === 1) {
    return (
      <div style={{fontSize:12,color:"var(--tx2)",padding:"6px 2px"}}>
        Todavía hay un solo dato ({points[0].x}: {formatY(points[0].y)}) — el gráfico va a ir tomando forma a medida que se acumulen más días.
      </div>
    );
  }

  const ys = points.map(p => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }

  const xStep = (W - PADX * 2) / (points.length - 1);
  const yToPx = y => {
    const t = (y - min) / (max - min); // 0..1
    const tFinal = invert ? t : 1 - t;
    return PAD + tFinal * (H - PAD * 2);
  };

  const coords = points.map((p, i) => [PADX + i * xStep, yToPx(p.y)]);
  const pathLine = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const pathArea = `${pathLine} L${coords[coords.length-1][0].toFixed(1)},${H-PAD} L${coords[0][0].toFixed(1)},${H-PAD} Z`;

  const last = points[points.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none" style={{display:"block"}}>
        <path d={pathArea} fill={color} opacity="0.12" />
        <path d={pathLine} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === coords.length-1 ? 3.5 : 2} fill={color} />
        ))}
      </svg>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--tx2)",marginTop:2}}>
        <span>{points[0].x}</span>
        <span style={{fontWeight:700,color:"var(--tx)"}}>{formatY(last.y)}</span>
        <span>{last.x}</span>
      </div>
    </div>
  );
}
