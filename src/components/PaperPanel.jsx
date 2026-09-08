import { useMemo, useState } from 'react'
import Chart from './Chart.jsx'
import { valuate, replayEquity, makeOp, BUY, SELL } from '../lib/paper.js'
import { metaFor } from '../data/universe.js'
import { fmtDate, fmtEur, fmtNum, fmtPct, fmtUnits, signClass } from '../lib/format.js'

export default function PaperPanel({ settings, patch, aligned, lastIdx, priceOf, openAsset }) {
  const { cfg, paper } = settings
  const val = useMemo(() => valuate(paper, priceOf), [paper, priceOf])
  const curve = useMemo(() => replayEquity(paper, aligned), [paper, aligned])

  // Referencia: comprar y mantener el benchmark desde la primera operacion.
  const benchCurve = useMemo(() => {
    if (!curve.length) return []
    const series = aligned.closes[cfg.benchmark]
    if (!series) return []
    const start = aligned.dates.indexOf(curve[0].date)
    if (start < 0 || series[start] == null) return []
    return curve.map((p, k) => {
      const i = start + k
      return { date: p.date, v: series[i] == null ? null : series[i] / series[start] }
    })
  }, [curve, aligned, cfg.benchmark])

  const stats = useMemo(() => {
    if (!curve.length) return null
    const vals = curve.map((c) => c.v)
    let peak = -Infinity
    let mdd = 0
    for (const v of vals) {
      if (v > peak) peak = v
      mdd = Math.min(mdd, v / peak - 1)
    }
    const benchRet = benchCurve.length ? benchCurve.at(-1).v - 1 : null
    return { mdd, benchRet, days: curve.length }
  }, [curve, benchCurve])

  function removeOp(id) {
    patch({ paper: { ...paper, log: paper.log.filter((o) => o.id !== id) } })
  }

  function reset() {
    if (!confirm('Esto borra todas las operaciones simuladas. ¿Seguir?')) return
    patch({ paper: { ...paper, log: [] } })
  }

  return (
    <>
      <div className="card">
        <div className="spread">
          <h2>Cartera simulada</h2>
          <div className="row">
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center' }}>
              Capital inicial
              <input
                type="number"
                min="100"
                step="500"
                value={paper.startCapital}
                onChange={(e) =>
                  patch({ paper: { ...paper, startCapital: Math.max(100, +e.target.value || 0) } })
                }
                style={{ width: 110, marginLeft: 8 }}
              />
            </label>
            <button className="btn danger small" onClick={reset} disabled={!paper.log.length}>
              Reiniciar
            </button>
          </div>
        </div>

        <div className="stats" style={{ marginTop: 14 }}>
          <div className="stat">
            <div className="k">Valor total</div>
            <div className="v">{fmtEur(val.equity)}</div>
            <div className="n">sobre {fmtEur(paper.startCapital)} iniciales</div>
          </div>
          <div className="stat">
            <div className="k">Rentabilidad</div>
            <div className={`v ${signClass(val.totalReturn)}`}>{fmtPct(val.totalReturn)}</div>
            <div className="n">
              {stats?.benchRet != null
                ? `${cfg.benchmark} comprar y mantener: ${fmtPct(stats.benchRet, true)}`
                : 'sin referencia'}
            </div>
          </div>
          <div className="stat">
            <div className="k">Peor caída</div>
            <div className="v neg">{stats ? fmtPct(stats.mdd, true) : '—'}</div>
            <div className="n">desde máximo de la curva</div>
          </div>
          <div className="stat">
            <div className="k">Liquidez</div>
            <div className="v">{fmtEur(val.cash)}</div>
            <div className="n">{fmtPct(val.equity ? val.cash / val.equity : 0, true)} del total</div>
          </div>
          <div className="stat">
            <div className="k">Comisiones</div>
            <div className="v">{fmtEur(val.fees)}</div>
            <div className="n">{paper.log.length} operaciones</div>
          </div>
          <div className="stat">
            <div className="k">Realizado</div>
            <div className={`v ${signClass(val.realized)}`}>{fmtEur(val.realized)}</div>
            <div className="n">beneficio ya cerrado</div>
          </div>
        </div>
      </div>

      {curve.length > 1 && (
        <div className="card">
          <h2>Evolución</h2>
          <p className="hint">
            Base 1,00 en la primera operación ({fmtDate(curve[0].date)}). Se reconstruye desde el registro
            de operaciones, así que refleja cuándo estuviste en liquidez.
          </p>
          <Chart
            height={280}
            baseline={1}
            yFormat={(v) => v.toFixed(2)}
            series={[
              { name: 'Cartera simulada', data: curve, color: 'var(--acc)', width: 2 },
              ...(benchCurve.length
                ? [{ name: `${cfg.benchmark} comprar y mantener`, data: benchCurve, color: 'var(--ink-3)', dash: '4 3' }]
                : []),
            ]}
          />
        </div>
      )}

      <div className="card">
        <h2>Posiciones</h2>
        {val.rows.filter((r) => r.units > 0).length ? (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Activo</th>
                  <th>Títulos</th>
                  <th>Coste medio</th>
                  <th>Último</th>
                  <th>Valor</th>
                  <th>Peso</th>
                  <th>P/L</th>
                  <th>P/L %</th>
                </tr>
              </thead>
              <tbody>
                {val.rows
                  .filter((r) => r.units > 0)
                  .map((r) => (
                    <tr key={r.symbol} className="clickable" onClick={() => openAsset(r.symbol)}>
                      <td>
                        <span className="sym">{r.symbol}</span>
                        <div className="name">{metaFor(r.symbol).name}</div>
                      </td>
                      <td>{fmtUnits(r.units)}</td>
                      <td>{fmtNum(r.avgCost)}</td>
                      <td>{fmtNum(r.price)}</td>
                      <td>{fmtEur(r.value)}</td>
                      <td>{fmtPct(val.weights[r.symbol], true)}</td>
                      <td className={signClass(r.pnl)}>{fmtEur(r.pnl)}</td>
                      <td className={signClass(r.pnlPct)}>{fmtPct(r.pnlPct, true)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            Todo en liquidez. Registra una operación abajo, o ve a «Señal del mes» y pulsa «Ejecutar en el
            simulador».
          </div>
        )}
      </div>

      <OrderForm
        settings={settings}
        patch={patch}
        aligned={aligned}
        lastIdx={lastIdx}
        val={val}
        cfg={cfg}
      />

      <div className="card">
        <div className="spread">
          <h2>Registro de operaciones</h2>
          <span className="muted small">{paper.log.length} operaciones</span>
        </div>
        {paper.log.length ? (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Acción</th>
                  <th>Activo</th>
                  <th>Títulos</th>
                  <th>Precio</th>
                  <th>Importe</th>
                  <th>Comisión</th>
                  <th>Nota</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...paper.log]
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((o) => (
                    <tr key={o.id}>
                      <td>{fmtDate(o.date)}</td>
                      <td>
                        <span className={`tag ${o.action === BUY ? 'buy' : 'sell'}`}>{o.action}</span>
                      </td>
                      <td className="sym">{o.symbol}</td>
                      <td>{fmtUnits(o.units)}</td>
                      <td>{fmtNum(o.price)}</td>
                      <td>{fmtEur(o.units * o.price)}</td>
                      <td className="muted">{fmtEur(o.fee)}</td>
                      <td className="muted small">{o.note || '—'}</td>
                      <td>
                        <button className="btn small danger" onClick={() => removeOp(o.id)}>
                          borrar
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Sin operaciones todavía.</div>
        )}
      </div>
    </>
  )
}

function OrderForm({ settings, patch, aligned, lastIdx, val, cfg }) {
  const [symbol, setSymbol] = useState(settings.universe[0])
  const [action, setAction] = useState(BUY)
  const [mode, setMode] = useState('importe')
  const [amount, setAmount] = useState(1000)
  const [date, setDate] = useState(aligned.dates[lastIdx])
  const [err, setErr] = useState(null)

  // Precio de cierre de la fecha elegida (o el ultimo anterior disponible).
  const idx = useMemo(() => {
    let i = aligned.dates.indexOf(date)
    if (i >= 0) return i
    for (let k = aligned.dates.length - 1; k >= 0; k--) if (aligned.dates[k] <= date) return k
    return -1
  }, [aligned.dates, date])
  const price = idx >= 0 ? aligned.closes[symbol]?.[idx] : null
  const units = mode === 'importe' ? (price ? amount / price : 0) : amount
  const importe = price ? units * price : 0
  const held = val.rows.find((r) => r.symbol === symbol)?.units || 0

  function submit(e) {
    e.preventDefault()
    setErr(null)
    if (!price) return setErr('No hay precio para ese activo en esa fecha.')
    if (units <= 0) return setErr('La cantidad debe ser mayor que cero.')
    if (action === SELL && units > held + 1e-9)
      return setErr(`Solo tienes ${fmtUnits(held)} títulos de ${symbol}. No se simulan cortos.`)
    const fee = (importe * cfg.commissionBps) / 10000
    if (action === BUY && importe + fee > val.cash + 1e-6)
      return setErr(`Liquidez insuficiente: ${fmtEur(val.cash)} disponibles y necesitas ${fmtEur(importe + fee)}.`)
    const op = makeOp({
      date: aligned.dates[idx],
      symbol,
      action,
      units,
      price,
      commissionBps: cfg.commissionBps,
      note: 'manual',
    })
    patch({ paper: { ...settings.paper, log: [...settings.paper.log, op] } })
  }

  return (
    <div className="card">
      <h2>Operar en ficticio</h2>
      <p className="hint">
        Se ejecuta al precio de cierre de la fecha indicada. Puedes fechar una operación en el pasado: la
        curva de resultados se recalcula entera.
      </p>
      <form className="row" onSubmit={submit} style={{ alignItems: 'flex-end' }}>
        <label className="field">
          Activo
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {settings.universe.map((s) => (
              <option key={s} value={s}>
                {s} — {metaFor(s).name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Acción
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value={BUY}>comprar</option>
            <option value={SELL}>vender</option>
          </select>
        </label>
        <label className="field">
          Medida
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="importe">importe (€)</option>
            <option value="titulos">títulos</option>
          </select>
        </label>
        <label className="field">
          Cantidad
          <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(+e.target.value || 0)} />
        </label>
        <label className="field">
          Fecha
          <input
            type="date"
            value={date}
            min={aligned.dates[0]}
            max={aligned.dates[lastIdx]}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button className="btn primary" type="submit">
          Registrar
        </button>
      </form>
      <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
        {price
          ? `Cierre del ${fmtDate(aligned.dates[idx])}: ${fmtNum(price)} → ${fmtUnits(units)} títulos por ${fmtEur(importe)} (comisión ${fmtEur((importe * cfg.commissionBps) / 10000)}). En cartera: ${fmtUnits(held)} títulos. Liquidez: ${fmtEur(val.cash)}.`
          : 'Sin precio disponible para esa combinación de activo y fecha.'}
      </p>
      {err && <div className="banner" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  )
}
