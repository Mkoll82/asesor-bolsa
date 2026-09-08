import test from 'node:test'
import assert from 'node:assert/strict'

import { sma, ema, rsi, macd, atr, maxDrawdown, totalReturn } from '../src/lib/indicators.js'
import { alignSeries, monthEndIndices, smaAt } from '../src/lib/series.js'
import { rankAt, targetWeights, ordersFrom, DEFAULT_CFG, breadth } from '../src/lib/momentum.js'
import { runBacktest } from '../src/lib/backtest.js'
import { valuate, replayEquity, ordersToReach, makeOp, BUY, SELL } from '../src/lib/paper.js'
import { demoBars } from '../src/data/demo.js'
import { DEFAULT_UNIVERSE } from '../src/data/universe.js'

const SYMS = DEFAULT_UNIVERSE.map((u) => u.symbol)

test('sma: huecos iniciales y valor sobre serie constante', () => {
  const flat = new Array(30).fill(7)
  const s = sma(flat, 10)
  assert.equal(s.slice(0, 9).every((v) => v === null), true)
  assert.equal(s[9], 7)
  assert.equal(s.at(-1), 7)
})

test('ema converge al valor de una serie constante', () => {
  const flat = new Array(80).fill(5)
  assert.ok(Math.abs(ema(flat, 12).at(-1) - 5) < 1e-9)
})

test('rsi se mantiene entre 0 y 100 y marca extremos', () => {
  const up = Array.from({ length: 60 }, (_, i) => 100 + i)
  const down = Array.from({ length: 60 }, (_, i) => 200 - i)
  assert.equal(rsi(up, 14).at(-1), 100)
  assert.ok(rsi(down, 14).at(-1) < 1)
  const noisy = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 5) * 10)
  for (const v of rsi(noisy, 14)) if (v != null) assert.ok(v >= 0 && v <= 100)
})

test('macd: la senal es mas suave que la linea', () => {
  const v = Array.from({ length: 200 }, (_, i) => 100 * Math.exp(i / 300) + Math.sin(i / 4) * 3)
  const m = macd(v)
  assert.ok(Number.isFinite(m.macd.at(-1)))
  assert.ok(Number.isFinite(m.signal.at(-1)))
  assert.ok(Math.abs(m.hist.at(-1) - (m.macd.at(-1) - m.signal.at(-1))) < 1e-9)
})

test('atr sobre rango diario constante devuelve ese rango', () => {
  const bars = Array.from({ length: 40 }, () => ({ h: 102, l: 98, c: 100 }))
  assert.ok(Math.abs(atr(bars, 14).at(-1) - 4) < 1e-9)
})

test('maxDrawdown localiza pico y valle', () => {
  const r = maxDrawdown([100, 120, 60, 80, 130])
  assert.equal(r.peak, 1)
  assert.equal(r.trough, 2)
  assert.ok(Math.abs(r.mdd - -0.5) < 1e-12)
})

test('totalReturn es null si falta historico', () => {
  assert.equal(totalReturn([1, 2, 3], 10), null)
  assert.ok(Math.abs(totalReturn([100, 110], 1) - 0.1) < 1e-12)
})

test('alignSeries rellena huecos con el ultimo cierre y deja null antes de cotizar', () => {
  const a = { bars: [{ date: '2024-01-02', c: 10 }, { date: '2024-01-04', c: 12 }] }
  const b = { bars: [{ date: '2024-01-03', c: 50 }, { date: '2024-01-04', c: 55 }] }
  const al = alignSeries({ A: a, B: b })
  assert.deepEqual(al.dates, ['2024-01-02', '2024-01-03', '2024-01-04'])
  assert.deepEqual(al.closes.A, [10, 10, 12]) // arrastre del 02 al 03
  assert.deepEqual(al.closes.B, [null, 50, 55]) // aun no cotizaba el 02
})

test('monthEndIndices marca el ultimo dia habil de cada mes', () => {
  const dates = ['2024-01-30', '2024-01-31', '2024-02-01', '2024-02-29', '2024-03-01']
  assert.deepEqual(monthEndIndices(dates), [1, 3, 4])
  // El ultimo dato (2024-03-01) no es fin de mes: el backtest lo descarta.
  assert.deepEqual(monthEndIndices(dates, { includeIncompleteLast: false }), [1, 3])
})

test('smaAt coincide con la sma de la serie completa', () => {
  const v = Array.from({ length: 50 }, (_, i) => i + 1)
  const full = sma(v, 10)
  assert.ok(Math.abs(smaAt(v, 30, 10) - full[30]) < 1e-12)
  assert.equal(smaAt(v, 3, 10), null)
})

test('rankAt ordena por puntuacion y respeta el filtro de tendencia', () => {
  const data = demoBars(SYMS, 900)
  const al = alignSeries(data)
  const i = al.dates.length - 1
  const rows = rankAt(al, i, DEFAULT_CFG)
  assert.ok(rows.length >= SYMS.length - 1) // el activo de liquidez queda fuera
  for (let k = 1; k < rows.length; k++) assert.ok(rows[k - 1].score >= rows[k].score)
  for (const r of rows) {
    if (r.eligible) {
      assert.ok(r.rank <= DEFAULT_CFG.topN)
      assert.equal(r.aboveTrend, true)
    }
  }
  assert.equal(rows.some((r) => r.symbol === DEFAULT_CFG.cashSymbol), false)
})

test('targetWeights suma 1 y manda a liquidez lo no invertido', () => {
  const data = demoBars(SYMS, 900)
  const al = alignSeries(data)
  const rows = rankAt(al, al.dates.length - 1, DEFAULT_CFG)
  const w = targetWeights(rows, DEFAULT_CFG)
  const total = Object.values(w).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(total - 1) < 1e-9, `los pesos suman ${total}`)
  const picks = rows.filter((r) => r.eligible).length
  if (picks < DEFAULT_CFG.topN) assert.ok(w[DEFAULT_CFG.cashSymbol] > 0)
})

test('ordersFrom calcula las diferencias en ambos sentidos', () => {
  const o = ordersFrom({ A: 0.5, B: 0.5 }, { A: 0.33, C: 0.67 })
  const byS = Object.fromEntries(o.map((x) => [x.symbol, x]))
  assert.equal(byS.B.action, 'vender')
  assert.equal(byS.C.action, 'comprar')
  assert.ok(Math.abs(byS.A.delta - -0.17) < 1e-9)
})

test('breadth devuelve una fraccion valida', () => {
  const al = alignSeries(demoBars(SYMS, 900))
  const b = breadth(al, al.dates.length - 1, 200)
  assert.ok(b.pct >= 0 && b.pct <= 1)
  assert.equal(b.total, SYMS.length)
})

test('backtest: sin NaN, comisiones cobradas y benchmark presente', () => {
  const al = alignSeries(demoBars(SYMS, 1500))
  const res = runBacktest(al, DEFAULT_CFG)
  assert.equal(res.error, undefined)
  assert.ok(res.equity.length > 200)
  for (const p of res.equity) assert.ok(Number.isFinite(p.v) && p.v > 0, `equity invalida en ${p.date}`)
  assert.ok(Number.isFinite(res.stats.cagr))
  assert.ok(Number.isFinite(res.stats.maxDD) && res.stats.maxDD <= 0)
  assert.ok(res.stats.totalCost > 0, 'deberia haber pagado comisiones')
  assert.ok(res.benchStats && res.bench.length === res.equity.length)
  assert.ok(res.monthly.length > 10)
  // Los cambios de activo son un subconjunto de las revisiones, y la rotacion
  // por reajuste de pesos no debe contarse como cambio de cartera.
  assert.ok(res.stats.changes < res.stats.rebalances, `${res.stats.changes} cambios de ${res.stats.rebalances}`)
  assert.ok(res.stats.avgTurnover > 0 && res.stats.avgTurnover < 2)
})

test('backtest: comision cero rinde mas que comision alta', () => {
  const al = alignSeries(demoBars(SYMS, 1500))
  const libre = runBacktest(al, { ...DEFAULT_CFG, commissionBps: 0 })
  const caro = runBacktest(al, { ...DEFAULT_CFG, commissionBps: 200 })
  assert.ok(libre.stats.finalMultiple > caro.stats.finalMultiple)
})

test('backtest: avisa si el historico es insuficiente', () => {
  const al = alignSeries(demoBars(SYMS.slice(0, 3), 120))
  const res = runBacktest(al, DEFAULT_CFG)
  assert.match(res.error, /insuficiente|utilizables/)
})

test('backtest: no mira al futuro (recortar el final no cambia el pasado)', () => {
  const full = demoBars(SYMS, 1500)
  const cortado = Object.fromEntries(
    Object.entries(full).map(([s, d]) => [s, { ...d, bars: d.bars.slice(0, d.bars.length - 120) }])
  )
  const a = runBacktest(alignSeries(full), DEFAULT_CFG)
  const b = runBacktest(alignSeries(cortado), DEFAULT_CFG)
  const hasta = b.equity.at(-1).date
  const ea = a.equity.find((p) => p.date === hasta)
  assert.ok(ea, 'la fecha de corte deberia existir en ambos')
  assert.ok(Math.abs(ea.v - b.equity.at(-1).v) < 1e-9, `${ea.v} vs ${b.equity.at(-1).v}`)
})

test('paper: comprar y vender deja la liquidez esperada', () => {
  const paper = {
    startCapital: 10000,
    log: [
      makeOp({ date: '2024-01-02', symbol: 'SPY', action: BUY, units: 10, price: 100, commissionBps: 10 }),
      makeOp({ date: '2024-02-01', symbol: 'SPY', action: SELL, units: 10, price: 110, commissionBps: 10 }),
    ],
  }
  const v = valuate(paper, () => 110)
  // 10000 - 1000 - 1 + 1100 - 1.1 = 10097.9
  assert.ok(Math.abs(v.cash - 10097.9) < 1e-9, `liquidez ${v.cash}`)
  assert.ok(Math.abs(v.equity - 10097.9) < 1e-9)
  assert.ok(Math.abs(v.realized - (100 - 1.1)) < 1e-9, `realizado ${v.realized}`)
  assert.ok(Math.abs(v.fees - 2.1) < 1e-9)
})

test('paper: coste medio y P/L latente', () => {
  const paper = {
    startCapital: 10000,
    log: [
      makeOp({ date: '2024-01-02', symbol: 'GLD', action: BUY, units: 10, price: 100, commissionBps: 0 }),
      makeOp({ date: '2024-01-03', symbol: 'GLD', action: BUY, units: 10, price: 120, commissionBps: 0 }),
    ],
  }
  const v = valuate(paper, () => 130)
  const row = v.rows.find((r) => r.symbol === 'GLD')
  assert.ok(Math.abs(row.avgCost - 110) < 1e-9)
  assert.ok(Math.abs(row.pnl - 400) < 1e-9)
  assert.ok(Math.abs(v.weights.GLD - 2600 / v.equity) < 1e-9)
})

test('paper: vender mas de lo que hay no crea liquidez de la nada', () => {
  const paper = {
    startCapital: 1000,
    log: [
      makeOp({ date: '2024-01-02', symbol: 'SPY', action: BUY, units: 2, price: 100, commissionBps: 0 }),
      makeOp({ date: '2024-01-03', symbol: 'SPY', action: SELL, units: 5, price: 100, commissionBps: 0 }),
    ],
  }
  const v = valuate(paper, () => 100)
  assert.equal(v.rows.find((r) => r.symbol === 'SPY')?.units ?? 0, 0)
  assert.ok(Math.abs(v.cash - 1000) < 1e-9, `liquidez ${v.cash}, deberia ser 1000`)
  assert.ok(Math.abs(v.equity - 1000) < 1e-9)

  const al = alignSeries({ SPY: { bars: [
    { date: '2024-01-02', c: 100 }, { date: '2024-01-03', c: 100 }, { date: '2024-01-04', c: 100 },
  ] } })
  const curve = replayEquity(paper, al)
  assert.ok(Math.abs(curve.at(-1).v - 1) < 1e-9, `curva ${curve.at(-1).v}, deberia ser 1`)
})

test('paper: ordersToReach alcanza la cartera objetivo', () => {
  const al = alignSeries(demoBars(SYMS, 900))
  const i = al.dates.length - 1
  const priceOf = (s) => al.closes[s][i]
  let paper = { startCapital: 10000, log: [] }
  const target = { SPY: 1 / 3, GLD: 1 / 3, TLT: 1 / 3 }

  let v = valuate(paper, priceOf)
  const ordenes = ordersToReach(target, v, priceOf, { commissionBps: 10 })
  assert.equal(ordenes.length, 3)
  paper = {
    ...paper,
    log: ordenes.map((o) =>
      makeOp({ date: al.dates[i], symbol: o.symbol, action: o.action, units: o.units, price: o.price, commissionBps: 10 })
    ),
  }
  v = valuate(paper, priceOf)
  for (const s of Object.keys(target)) {
    assert.ok(Math.abs(v.weights[s] - 1 / 3) < 0.01, `${s} pesa ${v.weights[s]}`)
  }
  // La liquidez nunca queda en negativo: las comisiones estaban reservadas.
  assert.ok(v.cash >= 0, `liquidez ${v.cash}`)
  // Un segundo pase no deberia generar ordenes relevantes.
  assert.equal(ordersToReach(target, v, priceOf, { minTicket: 25, commissionBps: 10 }).length, 0)
})

test('paper: la curva reproduce el registro y arranca cerca de 1', () => {
  const al = alignSeries(demoBars(SYMS, 900))
  const i = al.dates.length - 40
  const paper = {
    startCapital: 10000,
    log: [
      makeOp({
        date: al.dates[i],
        symbol: 'SPY',
        action: BUY,
        units: 10,
        price: al.closes.SPY[i],
        commissionBps: 10,
      }),
    ],
  }
  const curve = replayEquity(paper, al)
  assert.equal(curve.length, 40)
  assert.ok(Math.abs(curve[0].v - 1) < 0.01)
  for (const p of curve) assert.ok(Number.isFinite(p.v))
})

test('demo: series deterministas, positivas y con calendario habil', () => {
  const a = demoBars(['SPY'], 300).SPY.bars
  const b = demoBars(['SPY'], 300).SPY.bars
  assert.deepEqual(a, b)
  for (const bar of a) {
    assert.ok(bar.c > 0 && bar.h >= bar.c && bar.l <= bar.c, JSON.stringify(bar))
    const dow = new Date(bar.date).getUTCDay()
    assert.ok(dow !== 0 && dow !== 6, `${bar.date} cae en fin de semana`)
  }
})
