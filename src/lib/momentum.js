import { smaAt } from './series.js'

export const DEFAULT_CFG = {
  // Ventanas de momentum en sesiones (~21 sesiones = 1 mes).
  lookbacks: [
    { days: 63, weight: 1 / 3, label: '3m' },
    { days: 126, weight: 1 / 3, label: '6m' },
    { days: 252, weight: 1 / 3, label: '12m' },
  ],
  trendPeriod: 200, // filtro de tendencia: precio por encima de su SMA200
  requireAboveTrend: true,
  topN: 3,
  cashSymbol: 'BIL', // donde va el peso que no se invierte
  // Comision en dos partes, porque los brokeRs europeos cobran asi:
  // un porcentaje sobre el importe (pb) mas una cantidad fija por orden.
  // El valor por defecto es el de Trade Republic: 0 pb + 1 € por orden.
  commissionBps: 0,
  commissionFixed: 1, // euros por orden
  capital: 10000, // referencia para convertir la comision fija a porcentaje
  // Banda de tolerancia del reajuste de pesos, en tanto por uno. Con 0.05, un
  // activo que deberia pesar el 33% se deja en paz mientras este entre el 28%
  // y el 38%. Los cambios de activo se ejecutan siempre, al margen de esto.
  rebalanceBand: 0.05,
  benchmark: 'SPY',
}

// Puntuacion = media ponderada de las rentabilidades de cada ventana.
export function scoreAt(closes, i, cfg = DEFAULT_CFG) {
  let score = 0
  let wsum = 0
  const parts = {}
  for (const lb of cfg.lookbacks) {
    const j = i - lb.days
    if (j < 0 || closes[j] == null || closes[i] == null) return null
    const r = closes[i] / closes[j] - 1
    parts[lb.label] = r
    score += r * lb.weight
    wsum += lb.weight
  }
  if (wsum === 0) return null
  return { score: score / wsum, parts }
}

// Clasificacion del universo en la sesion `i`.
export function rankAt(aligned, i, cfg = DEFAULT_CFG) {
  const rows = []
  for (const sym of aligned.symbols) {
    if (sym === cfg.cashSymbol) continue
    const closes = aligned.closes[sym]
    const s = scoreAt(closes, i, cfg)
    if (!s) continue
    const trend = smaAt(closes, i, cfg.trendPeriod)
    const price = closes[i]
    rows.push({
      symbol: sym,
      price,
      score: s.score,
      parts: s.parts,
      trend,
      aboveTrend: trend == null ? null : price > trend,
      trendGap: trend == null ? null : price / trend - 1,
    })
  }
  rows.sort((a, b) => b.score - a.score)
  rows.forEach((r, k) => {
    r.rank = k + 1
    // Elegible = esta entre los mejores Y no esta en tendencia bajista.
    r.eligible = r.rank <= cfg.topN && (!cfg.requireAboveTrend || r.aboveTrend === true)
  })
  return rows
}

// Cartera objetivo: peso igual entre los elegibles, el resto a liquidez.
export function targetWeights(rows, cfg = DEFAULT_CFG) {
  const picks = rows.filter((r) => r.eligible)
  const w = {}
  const slot = 1 / cfg.topN
  for (const p of picks) w[p.symbol] = slot
  const cash = 1 - picks.length * slot
  if (cash > 1e-9) w[cfg.cashSymbol] = (w[cfg.cashSymbol] || 0) + cash
  return w
}

// Ordenes necesarias para pasar de `current` a `target` (pesos 0..1).
export function ordersFrom(current, target) {
  const syms = new Set([...Object.keys(current || {}), ...Object.keys(target || {})])
  const out = []
  for (const s of syms) {
    const from = current?.[s] || 0
    const to = target?.[s] || 0
    const delta = to - from
    if (Math.abs(delta) < 1e-6) continue
    out.push({ symbol: s, from, to, delta, action: delta > 0 ? 'comprar' : 'vender' })
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

// Amplitud de mercado: que porcentaje del universo esta sobre su SMA200.
// Es un termometro de regimen que no cuesta ninguna llamada extra a la API.
export function breadth(aligned, i, period = 200) {
  let above = 0
  let total = 0
  for (const sym of aligned.symbols) {
    const t = smaAt(aligned.closes[sym], i, period)
    const p = aligned.closes[sym][i]
    if (t == null || p == null) continue
    total++
    if (p > t) above++
  }
  return total ? { above, total, pct: above / total } : null
}
