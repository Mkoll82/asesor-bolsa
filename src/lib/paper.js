// Cartera simulada (paper trading).
//
// El estado no se guarda: se reconstruye siempre reproduciendo el registro de
// operaciones sobre los precios historicos. Asi la curva de resultados es
// correcta aunque no abras la app en semanas, y cualquier cifra que veas se
// puede rastrear hasta las operaciones que la produjeron.

export const BUY = 'compra'
export const SELL = 'venta'

export const DEFAULT_PAPER = {
  startCapital: 10000,
  log: [], // [{ id, date, symbol, action, units, price, fee, note }]
}

// Estado a una fecha: posiciones, coste medio y liquidez.
export function replayState(paper, upToDate) {
  const positions = {}
  let cash = paper.startCapital
  let fees = 0
  const ops = [...paper.log].sort((a, b) => (a.date < b.date ? -1 : 1))
  for (const op of ops) {
    if (upToDate && op.date > upToDate) continue
    const amount = op.units * op.price
    const p = (positions[op.symbol] ||= { units: 0, cost: 0, realized: 0 })
    if (op.action === BUY) {
      cash -= amount + op.fee
      p.units += op.units
      p.cost += amount
    } else {
      const avg = p.units > 0 ? p.cost / p.units : op.price
      // Se recorta a la posicion real: no se simulan cortos, y sin recortar
      // una venta de mas generaria liquidez de la nada.
      const closed = Math.min(op.units, p.units)
      p.realized += closed * (op.price - avg) - op.fee
      p.cost -= closed * avg
      p.units -= closed
      cash += closed * op.price - op.fee
      if (p.units < 1e-9) {
        p.units = 0
        p.cost = 0
      }
    }
    fees += op.fee
  }
  return { positions, cash, fees }
}

// Valoracion a los ultimos precios disponibles.
export function valuate(paper, priceOf, upToDate) {
  const { positions, cash, fees } = replayState(paper, upToDate)
  const rows = []
  let invested = 0
  let realizedTotal = 0
  for (const [symbol, p] of Object.entries(positions)) {
    realizedTotal += p.realized
    if (p.units < 1e-9) {
      if (p.realized) rows.push({ symbol, units: 0, realized: p.realized, closed: true })
      continue
    }
    const price = priceOf(symbol)
    const value = price == null ? null : p.units * price
    const avg = p.cost / p.units
    invested += value || 0
    rows.push({
      symbol,
      units: p.units,
      avgCost: avg,
      price,
      value,
      pnl: value == null ? null : value - p.cost,
      pnlPct: value == null ? null : value / p.cost - 1,
      realized: p.realized,
    })
  }
  const equity = cash + invested
  rows.sort((a, b) => (b.value || 0) - (a.value || 0))
  return {
    rows,
    cash,
    invested,
    equity,
    fees,
    realized: realizedTotal,
    totalReturn: equity / paper.startCapital - 1,
    weights: Object.fromEntries(
      rows.filter((r) => r.value).map((r) => [r.symbol, r.value / (equity || 1)])
    ),
  }
}

// Curva de resultados dia a dia desde la primera operacion.
export function replayEquity(paper, aligned) {
  if (!paper.log.length || !aligned?.dates?.length) return []
  const first = paper.log.reduce((a, o) => (o.date < a ? o.date : a), paper.log[0].date)
  const { dates, closes } = aligned
  const start = dates.findIndex((d) => d >= first)
  if (start < 0) return []

  const byDate = {}
  for (const op of paper.log) (byDate[op.date] ||= []).push(op)

  let cash = paper.startCapital
  const units = {}
  const out = []
  for (let i = start; i < dates.length; i++) {
    const d = dates[i]
    for (const op of byDate[d] || []) {
      const amount = op.units * op.price
      if (op.action === BUY) {
        cash -= amount + op.fee
        units[op.symbol] = (units[op.symbol] || 0) + op.units
      } else {
        const closed = Math.min(op.units, units[op.symbol] || 0)
        cash += closed * op.price - op.fee
        units[op.symbol] = (units[op.symbol] || 0) - closed
      }
    }
    let v = cash
    for (const [s, u] of Object.entries(units)) {
      if (u < 1e-9) continue
      const p = closes[s]?.[i]
      if (p != null) v += u * p
    }
    out.push({ date: d, v: v / paper.startCapital })
  }
  return out
}

// Convierte una cartera objetivo en pesos en las ordenes concretas que la
// alcanzan desde la cartera simulada actual.
export function ordersToReach(targetWeights, valuation, priceOf, opts = {}) {
  // Hay que reservar lo que se van a comer las comisiones: sin esa reserva,
  // invertir el 100% del patrimonio deja la liquidez en negativo, algo que no
  // puede pasar en una cuenta real. El problema es que la comision fija
  // depende del numero de ordenes, y ese numero no se sabe hasta calcularlas.
  // Se resuelve en dos pasadas: la primera cuenta ordenes, la segunda reserva
  // el importe exacto.
  const primera = calcularOrdenes(targetWeights, valuation, priceOf, opts, 0)
  const reservaFija = primera.length * (opts.commissionFixed ?? 0)
  return calcularOrdenes(targetWeights, valuation, priceOf, opts, reservaFija)
}

function calcularOrdenes(targetWeights, valuation, priceOf, opts, reservaFija) {
  const minTicket = opts.minTicket ?? 25
  const reservaPct = 1 - (2 * (opts.commissionBps ?? 0)) / 10000
  const equity = Math.max(0, valuation.equity * reservaPct - reservaFija)
  const out = []
  const syms = new Set([...Object.keys(targetWeights), ...Object.keys(valuation.weights)])
  for (const symbol of syms) {
    const price = priceOf(symbol)
    if (price == null) continue
    const held = valuation.rows.find((r) => r.symbol === symbol)
    const currentValue = held?.value || 0
    const diff = (targetWeights[symbol] || 0) * equity - currentValue
    if (Math.abs(diff) < minTicket) continue
    const isBuy = diff > 0
    let units = Math.abs(diff) / price
    if (!isBuy) units = Math.min(units, held?.units || 0)
    if (units * price < minTicket) continue
    out.push({ symbol, action: isBuy ? BUY : SELL, units, price, amount: units * price })
  }
  // Vender primero: hace falta la liquidez antes de comprar.
  return out.sort((a, b) =>
    a.action === b.action ? b.amount - a.amount : a.action === SELL ? -1 : 1
  )
}

export function makeOp({
  date,
  symbol,
  action,
  units,
  price,
  commissionBps = 0,
  commissionFixed = 0,
  note = '',
}) {
  return {
    id: `${date}-${symbol}-${action}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    symbol,
    action,
    units,
    price,
    // Dos partes, como cobran los brokeRs europeos: porcentaje mas fijo.
    fee: (units * price * commissionBps) / 10000 + commissionFixed,
    note,
  }
}
