import { useMemo, useState } from 'react'
import Chart from './Chart.jsx'
import { sma, rsi, macd, atr, totalReturn, annualVol, drawdownFromHigh } from '../lib/indicators.js'
import { metaFor } from '../data/universe.js'
import CodigoCompra from './CodigoCompra.jsx'
import { fmtDate, fmtNum, fmtPct, signClass } from '../lib/format.js'

const RANGOS = [
  { label: '6 meses', days: 126 },
  { label: '1 año', days: 252 },
  { label: '3 años', days: 756 },
  { label: 'Todo', days: Infinity },
]

export default function AssetDetail({ settings, data, selected, setSelected }) {
  const symbol = selected && data[selected] ? selected : settings.universe[0]
  const [rango, setRango] = useState(1)
  const [log, setLog] = useState(false)

  const bars = data[symbol]?.bars || []
  const closes = useMemo(() => bars.map((b) => b.c), [bars])

  const ind = useMemo(() => {
    if (closes.length < 30) return null
    return {
      sma50: sma(closes, 50),
      sma200: sma(closes, settings.cfg.trendPeriod),
      rsi14: rsi(closes, 14),
      macd: macd(closes),
      atr14: atr(bars, 14),
    }
  }, [closes, bars, settings.cfg.trendPeriod])

  const n = bars.length
  const cut = Math.max(0, n - (RANGOS[rango].days === Infinity ? n : RANGOS[rango].days))

  const slice = (arr) =>
    arr.slice(cut).map((v, i) => ({ date: bars[cut + i].date, v: v == null ? null : v }))

  const last = n ? bars[n - 1] : null
  const atrLast = ind?.atr14?.[n - 1]
  const rsiLast = ind?.rsi14?.[n - 1]
  const macdLast = ind?.macd?.macd?.[n - 1]
  const sigLast = ind?.macd?.signal?.[n - 1]
  const sma50Last = ind?.sma50?.[n - 1]
  const sma200Last = ind?.sma200?.[n - 1]
  const m = metaFor(symbol)

  const lectura = useMemo(() => {
    if (!ind || !last) return []
    const out = []
    if (sma200Last != null)
      out.push(
        last.c > sma200Last
          ? `Precio un ${fmtPct(last.c / sma200Last - 1, true)} por encima de su media de ${settings.cfg.trendPeriod} sesiones: la regla lo considera en tendencia alcista.`
          : `Precio un ${fmtPct(last.c / sma200Last - 1, true)} respecto a su media de ${settings.cfg.trendPeriod} sesiones: la regla lo excluye por tendencia.`
      )
    if (sma50Last != null && sma200Last != null)
      out.push(
        sma50Last > sma200Last
          ? 'La media de 50 sesiones va por encima de la de 200 (cruce dorado en vigor).'
          : 'La media de 50 sesiones va por debajo de la de 200 (cruce de la muerte en vigor).'
      )
    if (rsiLast != null)
      out.push(
        rsiLast > 70
          ? `RSI ${fmtNum(rsiLast)}: sobrecomprado a 14 sesiones, entrar aquí suele salir caro.`
          : rsiLast < 30
            ? `RSI ${fmtNum(rsiLast)}: sobrevendido a 14 sesiones.`
            : `RSI ${fmtNum(rsiLast)}: zona neutra.`
      )
    if (macdLast != null && sigLast != null)
      out.push(
        macdLast > sigLast
          ? 'MACD por encima de su señal: el impulso reciente acompaña.'
          : 'MACD por debajo de su señal: el impulso reciente se está apagando.'
      )
    if (atrLast != null)
      out.push(
        `Recorrido diario típico (ATR 14) de ${fmtNum(atrLast)}, un ${fmtPct(atrLast / last.c, true)} del precio. Un stop a 2 ATR quedaría en ${fmtNum(last.c - 2 * atrLast)}.`
      )
    return out
  }, [ind, last, sma50Last, sma200Last, rsiLast, macdLast, sigLast, atrLast, settings.cfg.trendPeriod])

  if (!bars.length) return <div className="card">Sin datos para {symbol}.</div>

  return (
    <>
      <div className="card">
        <div className="spread">
          <div className="row">
            <select value={symbol} onChange={(e) => setSelected(e.target.value)}>
              {settings.universe.map((s) => (
                <option key={s} value={s}>
                  {s} — {metaFor(s).name}
                </option>
              ))}
            </select>
            <span className="muted small">
              {data[symbol]?.source === 'demo' ? 'datos de demostración' : `datos reales · ${bars.length} sesiones`}
            </span>
          </div>
          <div className="row">
            {RANGOS.map((r, k) => (
              <button key={r.label} className={`btn small ${rango === k ? 'primary' : ''}`} onClick={() => setRango(k)}>
                {r.label}
              </button>
            ))}
            <label className="check">
              <input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} />
              escala log
            </label>
          </div>
        </div>

        <div className="stats" style={{ marginTop: 14 }}>
          <div className="stat">
            <div className="k">Último cierre</div>
            <div className="v">{fmtNum(last.c)}</div>
            <div className="n">{fmtDate(last.date)}</div>
          </div>
          {[
            { k: '1 mes', d: 21 },
            { k: '3 meses', d: 63 },
            { k: '6 meses', d: 126 },
            { k: '12 meses', d: 252 },
          ].map((x) => {
            const r = totalReturn(closes, x.d)
            return (
              <div className="stat" key={x.k}>
                <div className="k">{x.k}</div>
                <div className={`v ${signClass(r)}`}>{fmtPct(r, true)}</div>
              </div>
            )
          })}
          <div className="stat">
            <div className="k">Desde máximo</div>
            <div className={`v ${signClass(drawdownFromHigh(closes, 252))}`}>
              {fmtPct(drawdownFromHigh(closes, 252), true)}
            </div>
            <div className="n">últimas 52 semanas</div>
          </div>
          <div className="stat">
            <div className="k">Volatilidad</div>
            <div className="v">{fmtPct(annualVol(closes.slice(-252)), true)}</div>
            <div className="n">anualizada</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Cómo comprarlo</h2>
        <p className="hint">
          {symbol} cotiza en EE. UU. y sirve para calcular la señal, pero no lo puedes comprar desde
          Europa: la normativa PRIIPs se lo impide a los minoristas. Esto es el equivalente UCITS que sí
          puedes buscar en el bróker.
        </p>
        <CodigoCompra symbol={symbol} compras={settings.compras} />
      </div>

      <div className="card">
        <h2>
          {symbol} · {m.name}
        </h2>
        <p className="hint">
          Precio con la media de 50 sesiones (medio plazo) y la de {settings.cfg.trendPeriod} (la que usa
          el filtro de tendencia de la regla).
        </p>
        <Chart
          height={300}
          logScale={log}
          yFormat={(v) => v.toFixed(v < 10 ? 2 : 0)}
          series={[
            { name: 'Cierre', data: slice(closes), color: 'var(--acc)', width: 1.8 },
            ...(ind ? [{ name: 'SMA 50', data: slice(ind.sma50), color: 'var(--warn)', width: 1.2 }] : []),
            ...(ind
              ? [{ name: `SMA ${settings.cfg.trendPeriod}`, data: slice(ind.sma200), color: 'var(--ink-3)', width: 1.2, dash: '4 3' }]
              : []),
          ]}
        />
      </div>

      {ind && (
        <div className="grid2">
          <div className="card">
            <h2>RSI 14</h2>
            <p className="hint">Por encima de 70 se considera sobrecomprado; por debajo de 30, sobrevendido.</p>
            <Chart
              height={170}
              baseline={50}
              yFormat={(v) => v.toFixed(0)}
              series={[{ name: 'RSI', data: slice(ind.rsi14), color: 'var(--acc)' }]}
            />
          </div>
          <div className="card">
            <h2>MACD 12-26-9</h2>
            <p className="hint">Las barras son la diferencia entre la línea MACD y su señal: miden aceleración.</p>
            <Chart
              height={170}
              baseline={0}
              yFormat={(v) => v.toFixed(2)}
              bars={{ data: slice(ind.macd.hist) }}
              series={[
                { name: 'MACD', data: slice(ind.macd.macd), color: 'var(--acc)' },
                { name: 'Señal', data: slice(ind.macd.signal), color: 'var(--warn)', dash: '3 2' },
              ]}
            />
          </div>
        </div>
      )}

      {lectura.length > 0 && (
        <div className="card">
          <h2>Lectura de los indicadores</h2>
          <p className="hint">
            Descripción mecánica de lo que dicen los números, no una recomendación. Contradicciones entre
            indicadores son normales y frecuentes.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            {lectura.map((l, k) => (
              <li key={k}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
