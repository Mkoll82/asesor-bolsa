import { monthEndIndices } from './series.js'
import { DEFAULT_CFG, rankAt, targetWeights, ordersFrom } from './momentum.js'
import { maxDrawdown, cagr, annualVol } from './indicators.js'

// Backtest de rebalanceo mensual.
//
// Reglas y supuestos, explicitos a proposito:
//  - La decision se toma con el cierre del ultimo dia habil del mes y se
//    ejecuta a ese mismo cierre. No hay mirada al futuro: rankAt(i) solo usa
//    datos hasta i incluido.
//  - Pesos iguales entre los elegibles; el resto del capital va al activo de
//    liquidez (si no esta en los datos, la liquidez renta 0%).
//  - Comision en dos partes: puntos basicos sobre el importe movido mas una
//    cantidad fija por orden. La fija se expresa como fraccion del capital
//    inicial, porque la curva esta en base 1 = capital inicial; asi 1 € sobre
//    10.000 € son siempre 0,0001 unidades, y con 1.000 € de capital pesa diez
//    veces mas. Es la diferencia entre que la regla salga rentable o no.
//  - No modela dividendos aparte: los precios del proveedor son de cierre
//    ajustado o no segun el plan, asi que la rentabilidad puede quedarse corta.
//  - No modela deslizamiento ni impuestos.
export function runBacktest(aligned, cfg = DEFAULT_CFG) {
  const { dates, closes } = aligned
  const maxLookback = Math.max(...cfg.lookbacks.map((l) => l.days))
  const warmup = Math.max(maxLookback, cfg.requireAboveTrend ? cfg.trendPeriod : 0) + 1
  if (dates.length <= warmup + 25) {
    return { error: `Historico insuficiente: hacen falta al menos ${warmup + 25} sesiones y hay ${dates.length}.` }
  }

  // `startDate` permite arrancar el backtest el dia que empezaste tu de
  // verdad, para comparar la regla a ciegas con lo que has hecho.
  const desde = cfg.startDate || null
  const monthEnds = monthEndIndices(dates, { includeIncompleteLast: false }).filter(
    (i) => i >= warmup && (!desde || dates[i] >= desde)
  )
  if (monthEnds.length < 3) return { error: 'Menos de 3 cierres de mes utilizables.' }

  const comm = cfg.commissionBps / 10000
  // 1 € sobre el capital inicial, en las unidades de la curva.
  const fijoUnidades = (cfg.commissionFixed || 0) / (cfg.capital || 10000)
  const start = monthEnds[0]

  let positions = {} // { sym: valor en euros }
  let cash = 1 // capital sin asignar (solo si falta el activo de liquidez)
  let equityVal = 1
  const equity = []
  const trades = []
  const rebalances = []
  let currentWeights = {}
  let totalCost = 0

  const rebalanceSet = new Set(monthEnds)

  for (let i = start; i < dates.length; i++) {
    // 1) Revalorizar posiciones con el movimiento del dia.
    if (i > start) {
      for (const sym of Object.keys(positions)) {
        const p0 = closes[sym][i - 1]
        const p1 = closes[sym][i]
        if (p0 == null || p1 == null || p0 === 0) continue
        positions[sym] *= p1 / p0
      }
    }
    equityVal = cash + Object.values(positions).reduce((a, b) => a + b, 0)

    // 2) Si toca cierre de mes, recalcular la cartera objetivo.
    if (rebalanceSet.has(i)) {
      const rows = rankAt(aligned, i, cfg)
      const target = targetWeights(rows, cfg)
      const orders = ordersFrom(currentWeights, target)

      let moved = 0
      const newPositions = {}
      let newCash = 0
      for (const [sym, w] of Object.entries(target)) {
        const want = equityVal * w
        if (closes[sym]?.[i] == null) {
          // Sin precio para ese activo (p.ej. liquidez no descargada): a caja.
          newCash += want
          continue
        }
        newPositions[sym] = want
      }
      for (const sym of new Set([...Object.keys(positions), ...Object.keys(newPositions)])) {
        moved += Math.abs((newPositions[sym] || 0) - (positions[sym] || 0))
      }
      const cost = moved * comm + orders.length * fijoUnidades
      totalCost += cost
      // La comision se descuenta proporcionalmente de lo que queda invertido.
      const scale = (equityVal - cost) / (equityVal || 1)
      for (const s of Object.keys(newPositions)) newPositions[s] *= scale
      newCash *= scale

      positions = newPositions
      cash = newCash
      currentWeights = target
      equityVal = cash + Object.values(positions).reduce((a, b) => a + b, 0)

      rebalances.push({
        date: dates[i],
        weights: target,
        picks: rows.filter((r) => r.eligible).map((r) => r.symbol),
        turnover: moved,
        ordenes: orders.length,
        cost,
      })
      for (const o of orders) trades.push({ date: dates[i], ...o })
    }

    equity.push({ date: dates[i], v: equityVal })
  }

  // Referencia: comprar y mantener el benchmark, o el universo a pesos iguales.
  const bench = buildBenchmark(aligned, cfg, start)

  const vals = equity.map((e) => e.v)
  const years = yearsBetween(dates[start], dates[dates.length - 1])
  const dd = maxDrawdown(vals)
  const monthly = monthlyReturns(equity)

  const stats = {
    from: dates[start],
    to: dates[dates.length - 1],
    years,
    finalMultiple: vals[vals.length - 1],
    cagr: cagr(vals[0], vals[vals.length - 1], years),
    vol: annualVol(vals),
    maxDD: dd.mdd,
    ddFrom: equity[dd.peak]?.date,
    ddTo: equity[dd.trough]?.date,
    positiveMonths: monthly.length ? monthly.filter((m) => m.r > 0).length / monthly.length : null,
    rebalances: rebalances.length,
    // Cambios reales de cartera: meses en los que entra o sale algun activo.
    // No cuenta el reajuste a pesos iguales, que ocurre todos los meses por la
    // simple deriva de los precios y no es una decision nueva.
    changes: countSetChanges(rebalances),
    avgTurnover: rebalances.length
      ? rebalances.reduce((a, r) => a + r.turnover, 0) / rebalances.length
      : null,
    totalCost,
    // Lo mismo en euros, que es como se entiende de verdad.
    totalCostEuros: totalCost * (cfg.capital || 10000),
    trades: trades.length,
  }
  stats.sharpe = stats.vol ? stats.cagr / stats.vol : null

  const benchStats = bench
    ? (() => {
        const bv = bench.map((e) => e.v)
        const bdd = maxDrawdown(bv)
        return {
          label: bench.label,
          cagr: cagr(bv[0], bv[bv.length - 1], years),
          vol: annualVol(bv),
          maxDD: bdd.mdd,
          finalMultiple: bv[bv.length - 1],
        }
      })()
    : null

  return { equity, bench, stats, benchStats, trades, rebalances, monthly, cfg }
}

// Numero de rebalanceos en los que cambia el conjunto de activos en cartera.
function countSetChanges(rebalances) {
  let n = 0
  let prev = null
  for (const r of rebalances) {
    const key = [...r.picks].sort().join(',')
    if (prev !== null && key !== prev) n++
    prev = key
  }
  return n
}

function buildBenchmark(aligned, cfg, start) {
  const { dates, closes } = aligned
  const sym = cfg.benchmark
  let series
  let label
  if (closes[sym] && closes[sym][start] != null) {
    series = closes[sym]
    label = sym
  } else {
    // Media de los activos con precio en la fecha inicial, a pesos iguales.
    const usable = aligned.symbols.filter((s) => closes[s][start] != null)
    if (!usable.length) return null
    series = dates.map((_, i) => {
      let acc = 0
      let n = 0
      for (const s of usable) {
        if (closes[s][i] == null) continue
        acc += closes[s][i] / closes[s][start]
        n++
      }
      return n ? acc / n : null
    })
    label = 'Universo a pesos iguales'
  }
  const base = series[start]
  const out = []
  for (let i = start; i < dates.length; i++) {
    out.push({ date: dates[i], v: series[i] == null ? out.at(-1)?.v ?? 1 : series[i] / base })
  }
  out.label = label
  return out
}

function monthlyReturns(equity) {
  const out = []
  let prevMonth = null
  let prevVal = null
  let lastVal = null
  for (const e of equity) {
    const m = e.date.slice(0, 7)
    if (prevMonth == null) {
      prevMonth = m
      prevVal = e.v
    } else if (m !== prevMonth) {
      out.push({ month: prevMonth, r: lastVal / prevVal - 1 })
      prevMonth = m
      prevVal = lastVal
    }
    lastVal = e.v
  }
  if (prevMonth && prevVal) out.push({ month: prevMonth, r: lastVal / prevVal - 1 })
  return out
}

function yearsBetween(a, b) {
  return (new Date(b) - new Date(a)) / (365.25 * 24 * 3600 * 1000)
}
