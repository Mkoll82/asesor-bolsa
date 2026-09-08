import { useMemo } from 'react'
import Chart from './Chart.jsx'
import { runBacktest } from '../lib/backtest.js'
import { fmtDate, fmtEur, fmtNum, fmtPct, signClass } from '../lib/format.js'

export default function BacktestPanel({ settings, patch, aligned }) {
  const { cfg } = settings
  // El capital de referencia sale del simulador si no se ha fijado a mano:
  // la comision fija solo se puede convertir en porcentaje si se sabe sobre
  // cuanto dinero se cobra.
  const efectiva = useMemo(
    () => ({ ...cfg, capital: cfg.capital || settings.paper.startCapital || 10000 }),
    [cfg, settings.paper.startCapital]
  )
  const res = useMemo(() => runBacktest(aligned, efectiva), [aligned, efectiva])

  const setCfg = (p) => patch({ cfg: { ...cfg, ...p } })

  return (
    <>
      <div className="card">
        <h2>Reglas</h2>
        <p className="hint">
          Lo que cambies aquí afecta también a la señal del mes: el backtest prueba exactamente la regla
          que después te dice qué comprar. La comisión tiene dos partes porque los brókeres europeos
          cobran así: <b>Trade Republic son 0 pb + 1 €</b> por orden. Y el capital importa: 1 € por orden
          sobre 1.000 € es cien veces más caro, en porcentaje, que sobre 100.000 €.
        </p>
        <p className="hint">
          La <b>banda de reajuste</b> (en puntos porcentuales) evita pagar comisiones por cuadrar la
          cartera al milímetro: con 5, un activo que debería pesar el 33% se deja en paz mientras esté
          entre el 28% y el 38%. Los cambios de activo se ejecutan siempre, al margen de la banda. Sube o
          baja el número y mira «Meses sin tocar» y «Comisiones» para ver cuánto ahorra de verdad.
        </p>
        <div className="row">
          <label className="field">
            Nº de posiciones
            <input
              type="number"
              min="1"
              max="8"
              value={cfg.topN}
              onChange={(e) => setCfg({ topN: Math.min(8, Math.max(1, +e.target.value || 1)) })}
            />
          </label>
          <label className="field">
            Media de tendencia (sesiones)
            <input
              type="number"
              min="20"
              max="300"
              step="10"
              value={cfg.trendPeriod}
              onChange={(e) => setCfg({ trendPeriod: Math.max(20, +e.target.value || 200) })}
            />
          </label>
          <label className="field">
            Comisión % (pb)
            <input
              type="number"
              min="0"
              max="100"
              value={cfg.commissionBps}
              onChange={(e) => setCfg({ commissionBps: Math.max(0, +e.target.value || 0) })}
            />
          </label>
          <label className="field">
            Comisión fija (€/orden)
            <input
              type="number"
              min="0"
              step="0.5"
              value={cfg.commissionFixed}
              onChange={(e) => setCfg({ commissionFixed: Math.max(0, +e.target.value || 0) })}
            />
          </label>
          <label className="field">
            Capital de referencia (€)
            <input
              type="number"
              min="100"
              step="500"
              value={efectiva.capital}
              onChange={(e) => setCfg({ capital: Math.max(100, +e.target.value || 0) })}
            />
          </label>
          <label className="field">
            Referencia
            <select value={cfg.benchmark} onChange={(e) => setCfg({ benchmark: e.target.value })}>
              {settings.universe.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Banda de reajuste
            <input
              type="number"
              min="0"
              max="50"
              step="1"
              value={Math.round((cfg.rebalanceBand || 0) * 100)}
              onChange={(e) => setCfg({ rebalanceBand: Math.max(0, +e.target.value || 0) / 100 })}
            />
          </label>
          <label className="check" style={{ marginTop: 16 }}>
            <input
              type="checkbox"
              checked={cfg.requireAboveTrend}
              onChange={(e) => setCfg({ requireAboveTrend: e.target.checked })}
            />
            exigir precio sobre la media (si no, a liquidez)
          </label>
        </div>
      </div>

      {res.error ? (
        <div className="card">
          <div className="empty">{res.error}</div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="spread">
              <div>
                <h2>Resultado de la regla</h2>
                <p className="hint" style={{ marginBottom: 0 }}>
                  {fmtDate(res.stats.from)} → {fmtDate(res.stats.to)} · {fmtNum(res.stats.years)} años ·
                  rebalanceo mensual
                </p>
              </div>
            </div>
            <div className="stats" style={{ marginTop: 14 }}>
              <div className="stat">
                <div className="k">Rentab. anual</div>
                <div className={`v ${signClass(res.stats.cagr)}`}>{fmtPct(res.stats.cagr, true)}</div>
                <div className="n">
                  {res.benchStats ? `${res.benchStats.label}: ${fmtPct(res.benchStats.cagr, true)}` : ''}
                </div>
              </div>
              <div className="stat">
                <div className="k">Peor caída</div>
                <div className="v neg">{fmtPct(res.stats.maxDD, true)}</div>
                <div className="n">
                  {res.benchStats ? `${res.benchStats.label}: ${fmtPct(res.benchStats.maxDD, true)}` : ''}
                </div>
              </div>
              <div className="stat">
                <div className="k">Volatilidad</div>
                <div className="v">{fmtPct(res.stats.vol, true)}</div>
                <div className="n">
                  {res.benchStats ? `${res.benchStats.label}: ${fmtPct(res.benchStats.vol, true)}` : ''}
                </div>
              </div>
              <div className="stat">
                <div className="k">Rentab. / riesgo</div>
                <div className="v">{fmtNum(res.stats.sharpe)}</div>
                <div className="n">anual entre volatilidad</div>
              </div>
              <div className="stat">
                <div className="k">Multiplicador</div>
                <div className="v">×{fmtNum(res.stats.finalMultiple)}</div>
                <div className="n">
                  {res.benchStats ? `${res.benchStats.label}: ×${fmtNum(res.benchStats.finalMultiple)}` : ''}
                </div>
              </div>
              <div className="stat">
                <div className="k">Meses en verde</div>
                <div className="v">{fmtPct(res.stats.positiveMonths, true)}</div>
                <div className="n">de {res.monthly.length} meses</div>
              </div>
              <div className="stat">
                <div className="k">Cambios de activo</div>
                <div className="v">{res.stats.changes}</div>
                <div className="n">en {res.stats.rebalances} revisiones mensuales</div>
              </div>
              <div className="stat">
                <div className="k">Rotación media</div>
                <div className="v">{fmtPct(res.stats.avgTurnover, true)}</div>
                <div className="n">de la cartera cada mes</div>
              </div>
              <div className="stat">
                <div className="k">Meses sin tocar</div>
                <div className="v">{res.stats.omitidos}</div>
                <div className="n">la banda evitó operar</div>
              </div>
              <div className="stat">
                <div className="k">Comisiones</div>
                <div className="v">{fmtPct(res.stats.totalCost, true)}</div>
                <div className="n">
                  {fmtEur(res.stats.totalCostEuros)} sobre {fmtEur(efectiva.capital)} iniciales
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Curva de resultados</h2>
            <p className="hint">
              Base 1,00. Escala logarítmica: en un gráfico así, la misma pendiente significa la misma
              rentabilidad porcentual, que es lo que interesa comparar.
            </p>
            <Chart
              height={320}
              logScale
              baseline={1}
              yFormat={(v) => v.toFixed(2)}
              series={[
                { name: 'Regla de momentum', data: res.equity, color: 'var(--acc)', width: 2 },
                ...(res.bench
                  ? [{ name: res.bench.label, data: res.bench, color: 'var(--ink-3)', dash: '4 3' }]
                  : []),
              ]}
            />
          </div>

          <div className="card">
            <h2>Rentabilidad mes a mes</h2>
            <p className="hint">Verde = mes positivo. Pasa el ratón por encima para ver el dato.</p>
            <div className="months">
              {res.monthly.map((m) => (
                <i
                  key={m.month}
                  title={`${m.month}: ${fmtPct(m.r, true)}`}
                  style={{
                    background:
                      m.r === 0
                        ? 'var(--panel-2)'
                        : m.r > 0
                          ? `color-mix(in srgb, var(--pos) ${Math.min(100, 25 + Math.abs(m.r) * 700)}%, transparent)`
                          : `color-mix(in srgb, var(--neg) ${Math.min(100, 25 + Math.abs(m.r) * 700)}%, transparent)`,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Últimas revisiones mensuales</h2>
            <p className="hint">
              Qué habría tenido la cartera en cada cierre de mes. Si una fila repite la anterior, ese mes
              no se toca nada.
            </p>
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Cierre de mes</th>
                    <th>Cartera</th>
                    <th>Rotación</th>
                    <th>Órdenes</th>
                    <th>Coste</th>
                  </tr>
                </thead>
                <tbody>
                  {[...res.rebalances]
                    .slice(-24)
                    .reverse()
                    .map((r) => (
                      <tr key={r.date}>
                        <td>{fmtDate(r.date)}</td>
                        <td style={{ textAlign: 'left' }}>
                          <div className="row" style={{ gap: 5 }}>
                            {Object.entries(r.weights)
                              .sort((a, b) => b[1] - a[1])
                              .map(([s, w]) => (
                                <span key={s} className={`tag ${s === cfg.cashSymbol ? 'cash' : 'buy'}`}>
                                  {s} {fmtPct(w, true)}
                                </span>
                              ))}
                          </div>
                        </td>
                        <td className={r.omitido ? 'muted' : ''}>
                          {r.omitido ? 'sin tocar' : fmtPct(r.turnover, true)}
                        </td>
                        <td className="muted">{r.ordenes ?? '—'}</td>
                        <td className="muted">{fmtEur(r.cost * efectiva.capital)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Lo que este backtest no dice</h2>
            <ul className="muted small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
              <li>
                El histórico disponible ({fmtNum(res.stats.years)} años) es corto. Cualquier regla que solo
                haya vivido un tramo alcista parece brillante.
              </li>
              <li>
                No incluye impuestos ni deslizamiento, y los dividendos solo cuentan si el proveedor
                entrega precios ajustados.
              </li>
              <li>
                Has visto los datos antes de fijar los parámetros. Cada vez que ajustas «nº de posiciones»
                mirando el resultado, estás ajustando la regla al pasado, y eso no se repite en el futuro.
              </li>
              <li>
                El universo de hoy no es el de hace años: los ETFs que hoy existen son los que sobrevivieron.
              </li>
            </ul>
          </div>
        </>
      )}
    </>
  )
}
