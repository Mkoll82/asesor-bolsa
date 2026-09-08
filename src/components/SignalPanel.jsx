import { useMemo, useState } from 'react'
import { rankAt, targetWeights } from '../lib/momentum.js'
import { monthEndIndices, isLikelyMonthEnd } from '../lib/series.js'
import { valuate, ordersToReach, makeOp } from '../lib/paper.js'
import { metaFor, compraFor } from '../data/universe.js'
import { comparar, costeAnual } from '../lib/brokers.js'
import CodigoCompra from './CodigoCompra.jsx'
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
    () =>
      ordersToReach(target, val, priceOf, {
        minTicket: 25,
        commissionBps: cfg.commissionBps,
        commissionFixed: cfg.commissionFixed,
      }),
    [target, val, priceOf, cfg.commissionBps, cfg.commissionFixed]
  )

  // Cuanto cuesta ejecutar este rebalanceo en cada broker.
  const costes = useMemo(
    () => (orders.length ? comparar(settings.brokers, orders) : []),
    [orders, settings.brokers]
  )

  // Activos elegidos para los que todavia no hay ISIN confirmado: sin ese
  // codigo la senal no se puede ejecutar en el broker.
  const sinIsin = useMemo(
    () =>
      Object.keys(target).filter((sym) => !compraFor(sym, settings.compras).isin),
    [target, settings.compras]
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
        commissionFixed: cfg.commissionFixed,
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
              Precios del {fmtDate(aligned.dates[lastIdx])}. Comisión aplicada en el simulador:{' '}
              {cfg.commissionBps ? `${cfg.commissionBps / 100}%` : ''}
              {cfg.commissionBps && cfg.commissionFixed ? ' + ' : ''}
              {cfg.commissionFixed ? `${fmtEur(cfg.commissionFixed)} por orden` : ''}
              {!cfg.commissionBps && !cfg.commissionFixed ? 'ninguna' : ''}. Cartera simulada actual:{' '}
              {fmtEur(val.equity)}.
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
                  <th>Peso objetivo</th>
                  <th>Qué comprar en el bróker</th>
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
                    <td>
                      {fmtPct(target[o.symbol] || 0, true)}
                      <div className="name">antes {fmtPct(val.weights[o.symbol] || 0, true)}</div>
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <CodigoCompra symbol={o.symbol} compras={settings.compras} compacto />
                    </td>
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

      {sinIsin.length > 0 && (
        <div className="card">
          <h2>Te faltan códigos para poder ejecutar esto</h2>
          <p className="hint">
            La cartera objetivo incluye {sinIsin.length === 1 ? 'un activo' : `${sinIsin.length} activos`} sin
            ISIN confirmado. Sin ese código no lo vas a encontrar en el bróker: busca el equivalente UCITS
            con el término que se indica, y pega el ISIN en Ajustes.
          </p>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Activo</th>
                  <th>Peso objetivo</th>
                  <th>Qué buscar en el bróker</th>
                </tr>
              </thead>
              <tbody>
                {sinIsin.map((sym) => {
                  const c = compraFor(sym, settings.compras)
                  return (
                    <tr key={sym}>
                      <td>
                        <span className="sym">{sym}</span>
                        <div className="name">{metaFor(sym).name}</div>
                      </td>
                      <td>{fmtPct(target[sym], true)}</td>
                      <td style={{ textAlign: 'left' }}>
                        {c.buscar || '—'}
                        {c.nota && <div className="name aviso">{c.nota}</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {costes.length > 0 && (
        <div className="card">
          <h2>Lo que te costaría este rebalanceo</h2>
          <p className="hint">
            Mismas órdenes, tarifas de cada bróker. La columna anual supone que este patrón se repite todos
            los meses: es la cifra que de verdad importa en una regla que rota, porque una comisión de 1 €
            parece nada hasta que la multiplicas por doce meses y por cada posición.
          </p>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Bróker</th>
                  <th>Órdenes</th>
                  <th>Importe movido</th>
                  <th>Coste ahora</th>
                  <th>% del importe</th>
                  <th>Coste anual</th>
                  <th>% del patrimonio</th>
                  <th>Tarifa</th>
                </tr>
              </thead>
              <tbody>
                {costes.map((f, k) => {
                  const anual = costeAnual(f.broker, orders, val.equity)
                  return (
                    <tr key={f.broker.id} className={k === 0 ? 'picked' : ''}>
                      <td>
                        <b>{f.broker.nombre}</b>
                        {f.broker.fuente === 'revisar' && (
                          <div className="name aviso">tarifa sin verificar</div>
                        )}
                      </td>
                      <td>{f.ordenes}</td>
                      <td>{fmtEur(f.importe)}</td>
                      <td>
                        <b>{fmtEur(f.total)}</b>
                      </td>
                      <td>{fmtPct(f.pctSobreImporte)}</td>
                      <td>{fmtEur(anual.anual)}</td>
                      <td className={anual.pctPatrimonio > 0.005 ? 'neg' : ''}>
                        {fmtPct(anual.pctPatrimonio)}
                      </td>
                      <td style={{ textAlign: 'left' }} className="muted small">
                        {f.broker.fijo ? `${fmtEur(f.broker.fijo)} fijo` : ''}
                        {f.broker.fijo && f.broker.pct ? ' + ' : ''}
                        {f.broker.pct ? fmtPct(f.broker.pct) : ''}
                        {f.broker.minimo ? `, mínimo ${fmtEur(f.broker.minimo)}` : ''}
                        {f.broker.gratisMes ? `, ${f.broker.gratisMes} gratis/mes` : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
            Las tarifas se editan en Ajustes. La de Revolut depende de tu plan y ha cambiado varias veces,
            así que compruébala en tu app antes de fiarte de esta comparación.
          </p>
        </div>
      )}
    </>
  )
}
