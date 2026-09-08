import { useMemo, useState } from 'react'
import Chart from './Chart.jsx'
import {
  resumenReal,
  estimacionProxy,
  resumenDecisiones,
  ordenarPorFecha,
  curvaTWR,
  ESTADOS,
} from '../lib/real.js'
import { runBacktest } from '../lib/backtest.js'
import { costeOrden } from '../lib/brokers.js'
import { metaFor, compraFor } from '../data/universe.js'
import { fmtDate, fmtEur, fmtNum, fmtPct, fmtUnits, signClass, todayISO } from '../lib/format.js'
import CodigoCompra from './CodigoCompra.jsx'

export default function RealPanel({ settings, patch, aligned, lastIdx, openAsset }) {
  const { real, cfg } = settings
  const setReal = (campos) => patch({ real: { ...real, ...campos } })

  const res = useMemo(() => resumenReal(real.valoraciones, real.movimientos), [real])
  const est = useMemo(() => estimacionProxy(real.log, aligned, lastIdx), [real.log, aligned, lastIdx])
  const dec = useMemo(() => resumenDecisiones(real.decisiones), [real.decisiones])

  // La regla a ciegas desde el dia de tu primera operacion: es la vara de
  // medir honesta, porque compara contra lo que habrias tenido sin decidir tu.
  const reglaCiega = useMemo(() => {
    if (!res.desde) return null
    const r = runBacktest(aligned, { ...cfg, startDate: res.desde })
    return r.error ? null : r
  }, [aligned, cfg, res.desde])

  // Tu curva y la de la regla, alineadas sobre las fechas de tus valoraciones.
  const series = useMemo(() => {
    if (res.curva.length < 2) return []
    const tuya = res.curva.map((p) => ({ date: p.date, v: p.v }))
    const out = [{ name: 'Tu cartera (ponderada por tiempo)', data: tuya, color: 'var(--acc)', width: 2 }]
    if (reglaCiega) {
      const base = reglaCiega.equity[0]?.v || 1
      const regla = res.curva.map((p) => {
        // Ultimo valor conocido de la regla en o antes de esa fecha.
        let v = null
        for (let k = reglaCiega.equity.length - 1; k >= 0; k--) {
          if (reglaCiega.equity[k].date <= p.date) {
            v = reglaCiega.equity[k].v
            break
          }
        }
        return { date: p.date, v: v == null ? null : v / base }
      })
      out.push({ name: 'La regla, sin tocarla', data: regla, color: 'var(--ink-3)', dash: '4 3' })
    }
    return out
  }, [res.curva, reglaCiega])

  const reglaTotal = useMemo(() => {
    if (!reglaCiega?.equity?.length) return null
    return reglaCiega.equity.at(-1).v / (reglaCiega.equity[0]?.v || 1) - 1
  }, [reglaCiega])

  const desvioProxy = useMemo(() => {
    if (!est?.total || !res.valor) return null
    return res.valor / est.total - 1
  }, [est, res.valor])

  return (
    <>
      <div className="card">
        <h2>Cartera real</h2>
        <p className="hint">
          Lo que de verdad hay en tu bróker. Es un libro aparte del simulador: aquí no se inventa nada, se
          apunta lo que ejecutaste y el saldo que te muestra la app del bróker.
        </p>

        {!res.valoraciones ? (
          <div className="empty">
            Todavía no hay nada. Apunta abajo tu primera aportación y el saldo que te muestre el bróker, y
            a partir de ahí la app mide la rentabilidad de verdad.
          </div>
        ) : (
          <div className="stats">
            <div className="stat">
              <div className="k">Valor hoy</div>
              <div className="v">{fmtEur(res.valor)}</div>
              <div className="n">según tu última valoración, {fmtDate(res.hasta)}</div>
            </div>
            <div className="stat">
              <div className="k">Ganancia</div>
              <div className={`v ${signClass(res.ganancia)}`}>{fmtEur(res.ganancia)}</div>
              <div className="n">
                {fmtPct(res.gananciaPct, true)} sobre {fmtEur(res.aportado)} aportados
              </div>
            </div>
            <div className="stat">
              <div className="k">Rentab. de la estrategia</div>
              <div className={`v ${signClass(res.twr)}`}>{fmtPct(res.twr, true)}</div>
              <div className="n">
                {res.twrAnual != null
                  ? `ponderada por tiempo, ${fmtPct(res.twrAnual, true)} anual`
                  : `ponderada por tiempo, en ${fmtNum(res.anos * 12)} meses`}
              </div>
            </div>
            <div className="stat">
              <div className="k">La regla sola</div>
              <div className={`v ${signClass(reglaTotal)}`}>{fmtPct(reglaTotal, true)}</div>
              <div className="n">
                {reglaTotal != null && res.twr != null
                  ? `le sacas ${fmtPct(res.twr - reglaTotal, true)}`
                  : 'sin datos suficientes'}
              </div>
            </div>
            <div className="stat">
              <div className="k">Aportado neto</div>
              <div className="v">{fmtEur(res.neto)}</div>
              <div className="n">
                {fmtEur(res.aportado)} dentro, {fmtEur(res.retirado)} fuera
              </div>
            </div>
            <div className="stat">
              <div className="k">Disciplina</div>
              <div className="v">{fmtPct(dec.disciplina, true)}</div>
              <div className="n">
                {dec.seguida} de {dec.total} señales seguidas
              </div>
            </div>
          </div>
        )}

        {res.valoraciones === 1 && (
          <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
            Con una sola valoración se puede calcular la ganancia en euros, pero no la rentabilidad de la
            estrategia: para eso hacen falta al menos dos fotos del saldo.
          </p>
        )}
      </div>

      {series.length > 0 && (
        <div className="card">
          <h2>Tú frente a la regla</h2>
          <p className="hint">
            Base 1,00 en tu primera valoración. La línea gris es lo que habrías tenido siguiendo la regla a
            ciegas desde ese mismo día, sin saltártela ninguna vez. Si tu línea va por debajo, tus
            decisiones están restando.
          </p>
          <Chart height={280} baseline={1} yFormat={(v) => v.toFixed(2)} series={series} />
        </div>
      )}

      {est?.total > 0 && res.valor > 0 && (
        <div className="card">
          <h2>Lo que cuesta el envoltorio</h2>
          <p className="hint">
            La señal se calcula con ETFs de EE. UU. pero tú compras el equivalente UCITS en euros. Esta es
            la diferencia entre lo que habría dado la estrategia pura sobre tu dinero y lo que marca tu
            bróker. Recoge la comisión de gestión del ETF, la diferencia de réplica y, sobre todo, el
            euro/dólar.
          </p>
          <div className="stats">
            <div className="stat">
              <div className="k">Estrategia pura</div>
              <div className="v">{fmtEur(est.total)}</div>
              <div className="n">con precios de EE. UU. del {fmtDate(est.fecha)}</div>
            </div>
            <div className="stat">
              <div className="k">Tu bróker dice</div>
              <div className="v">{fmtEur(res.valor)}</div>
              <div className="n">{fmtDate(res.hasta)}</div>
            </div>
            <div className="stat">
              <div className="k">Diferencia</div>
              <div className={`v ${signClass(desvioProxy)}`}>{fmtPct(desvioProxy, true)}</div>
              <div className="n">{fmtEur(res.valor - est.total)}</div>
            </div>
          </div>
        </div>
      )}

      <ValoracionesForm real={real} setReal={setReal} />
      <MovimientosForm real={real} setReal={setReal} />
      <OperacionesReales
        settings={settings}
        real={real}
        setReal={setReal}
        aligned={aligned}
        lastIdx={lastIdx}
        openAsset={openAsset}
      />
      <Diario real={real} setReal={setReal} />
    </>
  )
}

// --- Valoraciones mensuales -------------------------------------------------

function ValoracionesForm({ real, setReal }) {
  const [date, setDate] = useState(todayISO())
  const [total, setTotal] = useState('')
  // La variacion de cada periodo y sus flujos salen del calculo ponderado por
  // tiempo, no de la valoracion suelta.
  const porFecha = useMemo(() => {
    const c = curvaTWR(real.valoraciones, real.movimientos)
    return new Map(c.map((p) => [p.date, p]))
  }, [real.valoraciones, real.movimientos])

  function add(e) {
    e.preventDefault()
    const t = +total
    if (!(t >= 0) || !date) return
    const sin = real.valoraciones.filter((v) => v.date !== date)
    setReal({ valoraciones: ordenarPorFecha([...sin, { date, total: t }]) })
    setTotal('')
  }

  const lista = ordenarPorFecha(real.valoraciones).reverse()

  return (
    <div className="card">
      <h2>Saldo del bróker</h2>
      <p className="hint">
        Un número al mes: el valor total que te muestra la app del bróker. Es lo único que hace falta para
        medir tu rentabilidad de verdad, porque de tu ETF europeo no tengo cotización. Si repites una
        fecha, se sobrescribe.
      </p>
      <form className="row" onSubmit={add} style={{ alignItems: 'flex-end' }}>
        <label className="field">
          Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          Valor total (€)
          <input
            type="number"
            min="0"
            step="0.01"
            value={total}
            placeholder="10450,32"
            onChange={(e) => setTotal(e.target.value)}
          />
        </label>
        <button className="btn primary" type="submit">
          Apuntar saldo
        </button>
      </form>

      {lista.length > 0 && (
        <div className="tabla-scroll" style={{ marginTop: 14 }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Valor</th>
                <th>Variación del periodo</th>
                <th>Flujos del periodo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => {
                const punto = porFecha.get(v.date)
                return (
                  <tr key={v.date}>
                    <td>{fmtDate(v.date)}</td>
                    <td>{fmtEur(v.total)}</td>
                    <td className={signClass(punto?.r)}>
                      {punto?.r != null ? fmtPct(punto.r, true) : '—'}
                    </td>
                    <td className="muted">{punto?.flujos ? fmtEur(punto.flujos) : '—'}</td>
                    <td>
                      <button
                        className="btn small danger"
                        onClick={() =>
                          setReal({ valoraciones: real.valoraciones.filter((x) => x.date !== v.date) })
                        }
                      >
                        borrar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// --- Aportaciones y retiradas -----------------------------------------------

function MovimientosForm({ real, setReal }) {
  const [date, setDate] = useState(todayISO())
  const [importe, setImporte] = useState('')
  const [tipo, setTipo] = useState('aportacion')

  function add(e) {
    e.preventDefault()
    const i = Math.abs(+importe)
    if (!(i > 0) || !date) return
    const signo = tipo === 'aportacion' ? 1 : -1
    setReal({
      movimientos: ordenarPorFecha([
        ...real.movimientos,
        { id: `${date}-${Math.random().toString(36).slice(2, 8)}`, date, importe: signo * i },
      ]),
    })
    setImporte('')
  }

  const lista = ordenarPorFecha(real.movimientos).reverse()

  return (
    <div className="card">
      <h2>Aportaciones y retiradas</h2>
      <p className="hint">
        Cada vez que metas o saques dinero de la cuenta, apúntalo aquí. Es lo que impide que una
        aportación se cuente como si hubieras ganado: sin esto, meter 500 € parecería una subida del 5%.
      </p>
      <form className="row" onSubmit={add} style={{ alignItems: 'flex-end' }}>
        <label className="field">
          Fecha
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="aportacion">aportación</option>
            <option value="retirada">retirada</option>
          </select>
        </label>
        <label className="field">
          Importe (€)
          <input
            type="number"
            min="0"
            step="0.01"
            value={importe}
            placeholder="1000"
            onChange={(e) => setImporte(e.target.value)}
          />
        </label>
        <button className="btn" type="submit">
          Apuntar
        </button>
      </form>

      {lista.length > 0 && (
        <div className="tabla-scroll" style={{ marginTop: 14 }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Importe</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id || m.date + m.importe}>
                  <td>{fmtDate(m.date)}</td>
                  <td>
                    <span className={`tag ${m.importe > 0 ? 'buy' : 'sell'}`}>
                      {m.importe > 0 ? 'aportación' : 'retirada'}
                    </span>
                  </td>
                  <td className={signClass(m.importe)}>{fmtEur(Math.abs(m.importe))}</td>
                  <td>
                    <button
                      className="btn small danger"
                      onClick={() =>
                        setReal({ movimientos: real.movimientos.filter((x) => x !== m) })
                      }
                    >
                      borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// --- Operaciones ejecutadas de verdad ---------------------------------------

function OperacionesReales({ settings, real, setReal, aligned, lastIdx, openAsset }) {
  const [symbol, setSymbol] = useState(settings.universe[0])
  const [action, setAction] = useState('compra')
  const [date, setDate] = useState(todayISO())
  const [units, setUnits] = useState('')
  const [price, setPrice] = useState('')
  const [fee, setFee] = useState('')
  const [broker, setBroker] = useState(real.broker || 'traderepublic')

  const importe = (+units || 0) * (+price || 0)
  const feeSugerida = costeOrden(settings.brokers[broker], importe, 0)

  function add(e) {
    e.preventDefault()
    if (!(+units > 0) || !(+price > 0)) return
    const c = compraFor(symbol, settings.compras)
    setReal({
      broker,
      log: ordenarPorFecha([
        ...real.log,
        {
          id: `${date}-${symbol}-${Math.random().toString(36).slice(2, 8)}`,
          date,
          symbol,
          isin: c.isin || '',
          action,
          units: +units,
          price: +price,
          fee: fee === '' ? feeSugerida : +fee,
          broker,
        },
      ]),
    })
    setUnits('')
    setPrice('')
    setFee('')
  }

  const lista = ordenarPorFecha(real.log).reverse()
  const comisiones = real.log.reduce((a, o) => a + (o.fee || 0), 0)

  return (
    <div className="card">
      <div className="spread">
        <div>
          <h2>Operaciones ejecutadas</h2>
          <p className="hint" style={{ marginBottom: 0 }}>
            Lo que compraste o vendiste de verdad, con el precio y la comisión reales del bróker. Sirve
            para dos cosas: llevar la cuenta de las comisiones y estimar qué habría dado la estrategia
            pura sobre tu dinero.
          </p>
        </div>
        {comisiones > 0 && (
          <div className="stat">
            <div className="k">Comisiones pagadas</div>
            <div className="v">{fmtEur(comisiones)}</div>
            <div className="n">{real.log.length} operaciones</div>
          </div>
        )}
      </div>

      <form className="row" onSubmit={add} style={{ alignItems: 'flex-end', marginTop: 14 }}>
        <label className="field">
          Activo de la señal
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
            <option value="compra">compra</option>
            <option value="venta">venta</option>
          </select>
        </label>
        <label className="field">
          Fecha
          <input
            type="date"
            value={date}
            max={aligned.dates[lastIdx]}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field">
          Títulos
          <input type="number" min="0" step="any" value={units} onChange={(e) => setUnits(e.target.value)} />
        </label>
        <label className="field">
          Precio pagado (€)
          <input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field">
          Bróker
          <select value={broker} onChange={(e) => setBroker(e.target.value)}>
            {Object.values(settings.brokers).map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Comisión (€)
          <input
            type="number"
            min="0"
            step="0.01"
            value={fee}
            placeholder={feeSugerida.toFixed(2)}
            onChange={(e) => setFee(e.target.value)}
          />
        </label>
        <button className="btn primary" type="submit">
          Apuntar operación
        </button>
      </form>
      <div className="hint" style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          Importe {fmtEur(importe)}. Si dejas la comisión vacía, se usa la tarifa de{' '}
          {settings.brokers[broker]?.nombre}: {fmtEur(feeSugerida)}. Comprarás:
        </span>
        <CodigoCompra symbol={symbol} compras={settings.compras} compacto />
      </div>

      {lista.length > 0 && (
        <div className="tabla-scroll" style={{ marginTop: 14 }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Acción</th>
                <th>Señal</th>
                <th>ISIN comprado</th>
                <th>Títulos</th>
                <th>Precio</th>
                <th>Importe</th>
                <th>Comisión</th>
                <th>Bróker</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id}>
                  <td>{fmtDate(o.date)}</td>
                  <td>
                    <span className={`tag ${o.action === 'compra' ? 'buy' : 'sell'}`}>{o.action}</span>
                  </td>
                  <td className="sym clickable" onClick={() => openAsset(o.symbol)}>
                    {o.symbol}
                  </td>
                  <td className="mono small">{o.isin || '—'}</td>
                  <td>{fmtUnits(o.units)}</td>
                  <td>{fmtNum(o.price)}</td>
                  <td>{fmtEur(o.units * o.price)}</td>
                  <td className="muted">{fmtEur(o.fee)}</td>
                  <td className="muted small">{settings.brokers[o.broker]?.nombre || o.broker}</td>
                  <td>
                    <button
                      className="btn small danger"
                      onClick={() => setReal({ log: real.log.filter((x) => x.id !== o.id) })}
                    >
                      borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// --- Diario de decisiones ---------------------------------------------------

function Diario({ real, setReal }) {
  const lista = [...(real.decisiones || [])].sort((a, b) => (a.month < b.month ? 1 : -1))

  function borrar(month) {
    setReal({ decisiones: real.decisiones.filter((d) => d.month !== month) })
  }

  function editarNota(month, nota) {
    setReal({ decisiones: real.decisiones.map((d) => (d.month === month ? { ...d, nota } : d)) })
  }

  return (
    <div className="card">
      <h2>Diario de decisiones</h2>
      <p className="hint">
        Se apunta desde «Señal del mes», con el botón de marcar la señal. Sirve para responder a la
        pregunta incómoda: cuando te saltas la regla, ¿aciertas o te sale caro?
      </p>
      {lista.length ? (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Señal</th>
                <th>Qué decía</th>
                <th>Nota</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => {
                const e = ESTADOS.find((x) => x.id === d.estado)
                return (
                  <tr key={d.month}>
                    <td>{d.month}</td>
                    <td>
                      <span className={`tag ${e?.tono || ''}`}>{e?.label || d.estado}</span>
                    </td>
                    <td style={{ textAlign: 'left' }} className="mono small">
                      {(d.picks || []).join(', ') || 'liquidez'}
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input
                        value={d.nota || ''}
                        placeholder="por qué"
                        onChange={(ev) => editarNota(d.month, ev.target.value)}
                        style={{ width: '100%', minWidth: 180 }}
                      />
                    </td>
                    <td>
                      <button className="btn small danger" onClick={() => borrar(d.month)}>
                        borrar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">Sin decisiones apuntadas todavía.</div>
      )}
    </div>
  )
}
