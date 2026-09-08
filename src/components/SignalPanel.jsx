import { useMemo, useState } from 'react'
import { rankAt, targetWeights } from '../lib/momentum.js'
import { monthEndIndices, isLikelyMonthEnd } from '../lib/series.js'
import { valuate, ordersToReach, makeOp } from '../lib/paper.js'
import { metaFor } from '../data/universe.js'
import { fmtDate, fmtEur, fmtNum, fmtPct, signClass, fmtUnits } from '../lib/format.js'

export default function SignalPanel({ settings, patch, aligned, lastIdx, priceOf, openAsset }) {
  const { cfg } = settings
  const [done, setDone] = useState(null)

  // La regla decide con el cierre del ultimo dia habil del mes. Lo que se ve a
  // media de mes es orientativo: distinguirlo evita operar por impaciencia.
  const signalIdx = useMemo(() => {
    // Solo cierres de mes completos. El ultimo dato cuenta como senal nueva
    // unicamente si de verdad es el ultimo dia habil de su mes.
    if (isLikelyMonthEnd(aligned.dates[lastIdx])) return lastIdx
    const past = monthEndIndices(aligned.dates, { includeIncompleteLast: false }).filter(
      (i) => i <= lastIdx
    )
    return past.length ? past[past.length - 1] : lastIdx
  }, [aligned, lastIdx])

  const isFresh = signalIdx === lastIdx
  const rowsSignal = useMemo(() => rankAt(aligned, signalIdx, cfg), [aligned, signalIdx, cfg])
  const rowsToday = useMemo(
    () => (isFresh ? rowsSignal : rankAt(aligned, lastIdx, cfg)),
    [aligned, lastIdx, cfg, isFresh, rowsSignal]
  )
  const target = useMemo(() => targetWeights(rowsSignal, cfg), [rowsSignal, cfg])
  const targetToday = useMemo(() => targetWeights(rowsToday, cfg), [rowsToday, cfg])

  const val = useMemo(() => valuate(settings.paper, priceOf), [settings.paper, priceOf])
  const orders = useMemo(
    () => ordersToReach(target, val, priceOf, { minTicket: 25, commissionBps: cfg.commissionBps }),
    [target, val, priceOf, cfg.commissionBps]
  )

  const drift = useMemo(() => {
    const a = Object.keys(target).sort().join(',')
    const b = Object.keys(targetToday).sort().join(',')
    return a === b ? null : { vigente: a, hoy: b }
  }, [target, targetToday])

  function execute() {
    if (!orders.length) return
    const date = aligned.dates[lastIdx]
    const ops = orders.map((o) =>
      makeOp({
        date,
        symbol: o.symbol,
        action: o.action,
        units: o.units,
        price: o.price,
        commissionBps: cfg.commissionBps,
        note: `señal ${aligned.dates[signalIdx]}`,
      })
    )
    patch({ paper: { ...settings.paper, log: [...settings.paper.log, ...ops] } })
    setDone(`${ops.length} operaciones registradas en el simulador con fecha ${fmtDate(date)}.`)
  }

  return (
    <>
      <div className="card">
        <div className="spread">
          <div>
            <h2>Cartera objetivo según la regla</h2>
            <p className="hint" style={{ marginBottom: 0 }}>
              {isFresh ? 'Calculada' : 'Última señal en vigor, calculada'} con el cierre del{' '}
              <b>{fmtDate(aligned.dates[signalIdx])}</b> · mejores {cfg.topN} por momentum
              {cfg.requireAboveTrend ? `, exigiendo precio sobre la media de ${cfg.trendPeriod} sesiones` : ''}.
            </p>
          </div>
          <div className="row">
            {Object.entries(target)
              .sort((a, b) => b[1] - a[1])
              .map(([sym, w]) => (
                <span key={sym} className={`tag ${sym === cfg.cashSymbol ? 'cash' : 'buy'}`}>
                  {sym} {fmtPct(w, true)}
                </span>
              ))}
          </div>
        </div>

        {drift && (
          <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
            Aviso: con los precios de hoy ({fmtDate(aligned.dates[lastIdx])}) la regla elegiría{' '}
            <b className="mono">{drift.hoy || 'solo liquidez'}</b> en lugar de{' '}
            <b className="mono">{drift.vigente || 'solo liquidez'}</b>. La decisión no se toma hasta el
            cierre de mes, así que esto es solo informativo.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Ranking del universo</h2>
        <p className="hint">
          Puntuación = media de las rentabilidades a {cfg.lookbacks.map((l) => l.label).join(', ')}.
          Pulsa una fila para ver su ficha técnica.
        </p>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Activo</th>
                <th>Precio</th>
                {cfg.lookbacks.map((l) => (
                  <th key={l.label}>{l.label}</th>
                ))}
                <th>Puntuación</th>
                <th>vs SMA{cfg.trendPeriod}</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rowsSignal.map((r) => {
                const m = metaFor(r.symbol)
                const estado = r.eligible
                  ? 'elegido'
                  : r.rank <= cfg.topN
                    ? 'descartado por tendencia'
                    : '—'
                return (
                  <tr
                    key={r.symbol}
                    className={`clickable ${r.eligible ? 'picked' : r.rank > cfg.topN ? 'dim' : ''}`}
                    onClick={() => openAsset(r.symbol)}
                  >
                    <td>{r.rank}</td>
                    <td>
                      <span className="sym">{r.symbol}</span>
                      <div className="name">{m.name}</div>
                    </td>
                    <td>{fmtNum(r.price)}</td>
                    {cfg.lookbacks.map((l) => (
                      <td key={l.label} className={signClass(r.parts[l.label])}>
                        {fmtPct(r.parts[l.label], true)}
                      </td>
                    ))}
                    <td className={signClass(r.score)}>
                      <b>{fmtPct(r.score, true)}</b>
                    </td>
                    <td className={signClass(r.trendGap)}>{fmtPct(r.trendGap, true)}</td>
                    <td>
                      {estado === 'elegido' ? (
                        <span className="tag buy">elegido</span>
                      ) : estado === '—' ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className="tag sell">fuera por tendencia</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <div>
            <h2>Órdenes para llevar el simulador a la cartera objetivo</h2>
            <p className="hint" style={{ marginBottom: 0 }}>
              Precios del {fmtDate(aligned.dates[lastIdx])}. Comisión aplicada: {cfg.commissionBps / 100}%.
              Cartera simulada actual: {fmtEur(val.equity)}.
            </p>
          </div>
          <button className="btn primary" onClick={execute} disabled={!orders.length}>
            Ejecutar en el simulador
          </button>
        </div>

        {done && <div className="banner" style={{ marginTop: 12 }}>{done}</div>}

        {orders.length ? (
          <div className="tabla-scroll" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Acción</th>
                  <th>Activo</th>
                  <th>Títulos</th>
                  <th>Precio</th>
                  <th>Importe</th>
                  <th>Peso actual</th>
                  <th>Peso objetivo</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, k) => (
                  <tr key={k}>
                    <td>
                      <span className={`tag ${o.action === 'compra' ? 'buy' : 'sell'}`}>{o.action}</span>
                    </td>
                    <td>
                      <span className="sym">{o.symbol}</span>
                      <div className="name">{metaFor(o.symbol).name}</div>
                    </td>
                    <td>{fmtUnits(o.units)}</td>
                    <td>{fmtNum(o.price)}</td>
                    <td>{fmtEur(o.amount)}</td>
                    <td className="muted">{fmtPct(val.weights[o.symbol] || 0, true)}</td>
                    <td>{fmtPct(target[o.symbol] || 0, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            El simulador ya está alineado con la cartera objetivo. No hay nada que hacer.
          </div>
        )}
      </div>
    </>
  )
}
