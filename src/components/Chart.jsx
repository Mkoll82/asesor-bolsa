import { useEffect, useMemo, useRef, useState } from 'react'

// Grafico de lineas en SVG. Sin dependencias: son series diarias sencillas y
// una libreria de charting aqui solo anadiria peso y menos control del tema.
//
// series: [{ name, data: [{date, v}|null...], color, dash, width, area }]
// Todas las series comparten el eje X por indice, asi que deben venir ya
// alineadas al mismo array de fechas.
export default function Chart({
  series,
  height = 260,
  logScale = false,
  yFormat = (v) => v.toFixed(2),
  baseline = null,
  bars = null, // serie opcional dibujada como histograma centrado en 0
  onHover,
}) {
  const wrapRef = useRef(null)
  const [w, setW] = useState(720)
  const [hoverIdx, setHoverIdx] = useState(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const padL = 54
  const padR = 12
  const padT = 10
  const padB = 22
  const innerW = Math.max(10, w - padL - padR)
  const innerH = Math.max(10, height - padT - padB)

  const model = useMemo(() => {
    const visible = (series || []).filter((s) => s?.data?.length)
    if (!visible.length) return null
    const n = Math.max(...visible.map((s) => s.data.length))
    let min = Infinity
    let max = -Infinity
    for (const s of visible) {
      for (const p of s.data) {
        const v = p?.v
        if (v == null || !Number.isFinite(v)) continue
        if (logScale && v <= 0) continue
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    if (baseline != null) {
      min = Math.min(min, baseline)
      max = Math.max(max, baseline)
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null
    if (min === max) {
      min -= 1
      max += 1
    }
    const pad = (max - min) * 0.06
    min -= pad
    max += pad
    if (logScale && min <= 0) min = Math.max(1e-6, max / 1000)

    const tx = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
    const ty = (v) => {
      if (logScale) {
        const lo = Math.log(min)
        const hi = Math.log(max)
        return padT + innerH - ((Math.log(Math.max(v, 1e-9)) - lo) / (hi - lo)) * innerH
      }
      return padT + innerH - ((v - min) / (max - min)) * innerH
    }

    const paths = visible.map((s) => {
      let d = ''
      let open = false
      s.data.forEach((p, i) => {
        const v = p?.v
        if (v == null || !Number.isFinite(v) || (logScale && v <= 0)) {
          open = false
          return
        }
        d += `${open ? 'L' : 'M'}${tx(i).toFixed(1)} ${ty(v).toFixed(1)}`
        open = true
      })
      return { ...s, d }
    })

    const ticks = []
    const steps = 4
    for (let k = 0; k <= steps; k++) {
      const v = logScale
        ? Math.exp(Math.log(min) + ((Math.log(max) - Math.log(min)) * k) / steps)
        : min + ((max - min) * k) / steps
      ticks.push({ v, y: ty(v) })
    }

    const dates = visible[0].data.map((p) => p?.date)
    const xTicks = []
    const every = Math.max(1, Math.floor(n / 6))
    for (let i = 0; i < n; i += every) xTicks.push({ i, x: tx(i), label: (dates[i] || '').slice(0, 7) })

    return { n, min, max, tx, ty, paths, ticks, xTicks, dates, visible }
  }, [series, innerW, innerH, logScale, baseline, padL, padT])

  function handleMove(e) {
    if (!model) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const rel = (x - padL) / innerW
    const i = Math.round(rel * (model.n - 1))
    const clamped = Math.min(model.n - 1, Math.max(0, i))
    setHoverIdx(clamped)
    onHover?.(clamped)
  }

  return (
    <div className="chart" ref={wrapRef}>
      {model ? (
        <svg
          width={w}
          height={height}
          onMouseMove={handleMove}
          onMouseLeave={() => {
            setHoverIdx(null)
            onHover?.(null)
          }}
        >
          {model.ticks.map((t, k) => (
            <g key={k}>
              <line x1={padL} x2={w - padR} y1={t.y} y2={t.y} className="grid" />
              <text x={padL - 8} y={t.y + 3.5} className="axis" textAnchor="end">
                {yFormat(t.v)}
              </text>
            </g>
          ))}
          {model.xTicks.map((t, k) => (
            <text key={k} x={t.x} y={height - 6} className="axis" textAnchor="middle">
              {t.label}
            </text>
          ))}
          {baseline != null && (
            <line
              x1={padL}
              x2={w - padR}
              y1={model.ty(baseline)}
              y2={model.ty(baseline)}
              className="baseline"
            />
          )}
          {bars &&
            bars.data.map((p, i) =>
              p?.v == null ? null : (
                <rect
                  key={i}
                  x={model.tx(i) - Math.max(0.6, innerW / model.n / 2)}
                  width={Math.max(1.2, innerW / model.n)}
                  y={Math.min(model.ty(0), model.ty(p.v))}
                  height={Math.abs(model.ty(p.v) - model.ty(0))}
                  className={p.v >= 0 ? 'bar pos' : 'bar neg'}
                />
              )
            )}
          {model.paths.map((s, k) => (
            <path
              key={k}
              d={s.d}
              fill="none"
              stroke={s.color || 'var(--acc)'}
              strokeWidth={s.width || 1.6}
              strokeDasharray={s.dash || undefined}
              strokeLinejoin="round"
            />
          ))}
          {hoverIdx != null && (
            <g>
              <line
                x1={model.tx(hoverIdx)}
                x2={model.tx(hoverIdx)}
                y1={padT}
                y2={padT + innerH}
                className="crosshair"
              />
              {model.visible.map((s, k) => {
                const p = s.data[hoverIdx]
                if (p?.v == null || !Number.isFinite(p.v)) return null
                return (
                  <circle
                    key={k}
                    cx={model.tx(hoverIdx)}
                    cy={model.ty(p.v)}
                    r={3}
                    fill={s.color || 'var(--acc)'}
                  />
                )
              })}
            </g>
          )}
        </svg>
      ) : (
        <div className="chart-empty">Sin datos suficientes para dibujar</div>
      )}
      <div className="legend">
        {(series || []).map((s, k) => (
          <span key={k} className="legend-item">
            <i style={{ background: s.color || 'var(--acc)' }} />
            {s.name}
            {hoverIdx != null && s.data?.[hoverIdx]?.v != null && Number.isFinite(s.data[hoverIdx].v) && (
              <b>{yFormat(s.data[hoverIdx].v)}</b>
            )}
          </span>
        ))}
        {hoverIdx != null && model?.dates?.[hoverIdx] && (
          <span className="legend-date">{model.dates[hoverIdx]}</span>
        )}
      </div>
    </div>
  )
}
