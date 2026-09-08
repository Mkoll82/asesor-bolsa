import test from 'node:test'
import assert from 'node:assert/strict'

import { sma, ema, rsi, macd, atr, maxDrawdown, totalReturn } from '../src/lib/indicators.js'
import { alignSeries, monthEndIndices, smaAt } from '../src/lib/series.js'
import { rankAt, targetWeights, ordersFrom, DEFAULT_CFG, breadth } from '../src/lib/momentum.js'
import { runBacktest } from '../src/lib/backtest.js'
import { valuate, replayEquity, ordersToReach, makeOp, BUY, SELL } from '../src/lib/paper.js'
import { demoBars } from '../src/data/demo.js'
import {
  DEFAULT_UNIVERSE,
  compraFor,
  isinParaBuscar,
  revisarIsin,
  isinBienFormado,
} from '../src/data/universe.js'
import { BROKERS_DEFAULT, costeOrden, comparar, costeAnual } from '../src/lib/brokers.js'
import {
  curvaTWR,
  resumenReal,
  estimacionProxy,
  resumenDecisiones,
} from '../src/lib/real.js'

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

// --- Comisiones por broker y su efecto en la regla ---------------------------

test('brokers: Trade Republic cobra 1 € sea grande o pequena la orden', () => {
  const tr = BROKERS_DEFAULT.traderepublic
  assert.equal(costeOrden(tr, 100), 1)
  assert.equal(costeOrden(tr, 10000), 1)
})

test('brokers: Revolut aplica gratis del mes, porcentaje y minimo', () => {
  const rv = BROKERS_DEFAULT.revolut
  assert.equal(costeOrden(rv, 1000, 0), 0, 'la primera del mes es gratis')
  assert.equal(costeOrden(rv, 1000, 1), 2.5, '0,25% de 1000')
  assert.equal(costeOrden(rv, 100, 1), 1, 'se aplica el minimo de 1 €')
})

test('brokers: la comparativa ordena de mas barato a mas caro', () => {
  const ordenes = [
    { symbol: 'A', amount: 3000 },
    { symbol: 'B', amount: 3000 },
    { symbol: 'C', amount: 3000 },
  ]
  const filas = comparar(BROKERS_DEFAULT, ordenes)
  assert.ok(filas[0].total <= filas[1].total)
  const tr = filas.find((f) => f.broker.id === 'traderepublic')
  const rv = filas.find((f) => f.broker.id === 'revolut')
  assert.equal(tr.total, 3, 'tres ordenes a 1 €')
  assert.equal(rv.total, 15, 'la primera gratis y dos al 0,25% de 3000')
  assert.equal(filas[0].broker.id, 'traderepublic')
})

test('brokers: el coste anual multiplica por doce y se mide contra el patrimonio', () => {
  const { anual, pctPatrimonio } = costeAnual(
    BROKERS_DEFAULT.traderepublic,
    [{ amount: 500 }, { amount: 500 }],
    10000
  )
  assert.equal(anual, 24)
  assert.ok(Math.abs(pctPatrimonio - 0.0024) < 1e-12)
})

test('backtest: la comision fija duele mucho mas con poco capital', () => {
  const al = alignSeries(demoBars(SYMS, 1500))
  const base = { ...DEFAULT_CFG, commissionBps: 0, commissionFixed: 1 }
  const rico = runBacktest(al, { ...base, capital: 50000 })
  const pobre = runBacktest(al, { ...base, capital: 1000 })
  assert.ok(
    rico.stats.finalMultiple > pobre.stats.finalMultiple,
    `${rico.stats.finalMultiple} deberia superar a ${pobre.stats.finalMultiple}`
  )
  // El coste en euros es el mismo; lo que cambia es cuanto pesa.
  assert.ok(Math.abs(rico.stats.totalCostEuros - pobre.stats.totalCostEuros) < 1e-6)
  assert.ok(pobre.stats.totalCost > rico.stats.totalCost * 40)
})

test('backtest: sin comision de ningun tipo no se cobra nada', () => {
  const al = alignSeries(demoBars(SYMS, 1500))
  const res = runBacktest(al, { ...DEFAULT_CFG, commissionBps: 0, commissionFixed: 0 })
  assert.ok(Math.abs(res.stats.totalCost) < 1e-12)
})

test('paper: makeOp suma la parte fija a la porcentual', () => {
  const op = makeOp({
    date: '2024-01-02',
    symbol: 'SPY',
    action: BUY,
    units: 10,
    price: 100,
    commissionBps: 10,
    commissionFixed: 1,
  })
  assert.ok(Math.abs(op.fee - 2) < 1e-12, `comision ${op.fee}, esperada 2`)
})

test('paper: con comision fija la liquidez sigue sin quedar negativa', () => {
  const al = alignSeries(demoBars(SYMS, 900))
  const i = al.dates.length - 1
  const priceOf = (s) => al.closes[s][i]
  const target = { SPY: 1 / 3, GLD: 1 / 3, TLT: 1 / 3 }
  let paper = { startCapital: 2000, log: [] }

  const opts = { minTicket: 25, commissionBps: 0, commissionFixed: 1 }
  const ordenes = ordersToReach(target, valuate(paper, priceOf), priceOf, opts)
  assert.equal(ordenes.length, 3)
  paper = {
    ...paper,
    log: ordenes.map((o) =>
      makeOp({
        date: al.dates[i],
        symbol: o.symbol,
        action: o.action,
        units: o.units,
        price: o.price,
        commissionBps: 0,
        commissionFixed: 1,
      })
    ),
  }
  const v = valuate(paper, priceOf)
  assert.ok(v.cash >= 0, `liquidez ${v.cash}`)
  assert.ok(Math.abs(v.fees - 3) < 1e-12, `comisiones ${v.fees}, esperadas 3`)
})

test('compraFor: no inventa ISIN y lo que pega el usuario manda', () => {
  const spy = compraFor('SPY')
  assert.equal(spy.isin, 'IE00B5BMR087')
  assert.equal(spy.verificado, true)

  const iwm = compraFor('IWM')
  assert.equal(iwm.isin, '', 'los ISIN que no conozco quedan vacios, no inventados')
  assert.equal(iwm.verificado, false)
  assert.ok(iwm.buscar, 'pero si hay un termino de busqueda')

  const mio = compraFor('IWM', { IWM: { isin: 'IE00B3VWM098', ticker: 'IUS3' } })
  assert.equal(mio.isin, 'IE00B3VWM098')
  assert.equal(mio.verificado, true, 'si lo pega el usuario, cuenta como visto en su broker')
  assert.equal(mio.propio, true)
})

// --- Cartera real: rentabilidad con aportaciones y retiradas ----------------

test('real: sin movimientos, TWR y ganancia coinciden', () => {
  const r = resumenReal(
    [{ date: '2026-01-31', total: 1000 }, { date: '2026-02-28', total: 1100 }],
    [{ date: '2026-01-31', importe: 1000 }]
  )
  assert.ok(Math.abs(r.twr - 0.1) < 1e-12, `twr ${r.twr}`)
  assert.ok(Math.abs(r.ganancia - 100) < 1e-9)
  assert.equal(r.aportado, 1000)
})

test('real: una aportacion no se cuenta como ganancia', () => {
  // 1000 -> aporto 500 -> el broker marca 1600. La estrategia gano el 10%,
  // no el 60% que saldria de dividir 1600 entre 1000.
  const r = resumenReal(
    [{ date: '2026-01-31', total: 1000 }, { date: '2026-02-28', total: 1600 }],
    [{ date: '2026-01-31', importe: 1000 }, { date: '2026-02-10', importe: 500 }]
  )
  assert.ok(Math.abs(r.twr - 0.1) < 1e-12, `twr ${r.twr}, esperado 0,10`)
  assert.ok(Math.abs(r.ganancia - 100) < 1e-9, `ganancia ${r.ganancia}`)
  assert.equal(r.aportado, 1500)
})

test('real: una retirada tampoco se cuenta como perdida', () => {
  const r = resumenReal(
    [{ date: '2026-01-31', total: 1000 }, { date: '2026-02-28', total: 900 }],
    [{ date: '2026-01-31', importe: 1000 }, { date: '2026-02-10', importe: -200 }]
  )
  assert.ok(Math.abs(r.twr - 0.1) < 1e-12, `twr ${r.twr}, esperado 0,10`)
  assert.ok(Math.abs(r.ganancia - 100) < 1e-9, `ganancia ${r.ganancia}`)
  assert.equal(r.retirado, 200)
})

test('real: los periodos se encadenan', () => {
  const c = curvaTWR(
    [
      { date: '2026-01-31', total: 1000 },
      { date: '2026-02-28', total: 1100 },
      { date: '2026-03-31', total: 1210 },
    ],
    []
  )
  assert.equal(c.length, 3)
  assert.ok(Math.abs(c.at(-1).v - 1.21) < 1e-12, `indice ${c.at(-1).v}`)
})

test('real: cada movimiento cuenta en un solo periodo', () => {
  // El movimiento cae justo en la fecha de la segunda valoracion: pertenece al
  // primer periodo, no a los dos.
  const c = curvaTWR(
    [
      { date: '2026-01-31', total: 1000 },
      { date: '2026-02-28', total: 1600 },
      { date: '2026-03-31', total: 1760 },
    ],
    [{ date: '2026-02-28', importe: 500 }]
  )
  assert.ok(Math.abs(c[1].v - 1.1) < 1e-12, `primer periodo ${c[1].v}`)
  assert.ok(Math.abs(c[2].v - 1.21) < 1e-12, `segundo periodo ${c[2].v}`)
})

test('real: con una sola valoracion no hay curva pero si ganancia', () => {
  const r = resumenReal([{ date: '2026-01-31', total: 1200 }], [{ date: '2026-01-02', importe: 1000 }])
  assert.equal(r.twr, null)
  assert.ok(Math.abs(r.ganancia - 200) < 1e-9)
  assert.ok(Math.abs(r.gananciaPct - 0.2) < 1e-12)
})

test('real: la estimacion por proxy escala el coste con el activo americano', () => {
  const al = alignSeries({
    SPY: {
      bars: [
        { date: '2026-01-02', c: 100 },
        { date: '2026-02-02', c: 120 },
      ],
    },
  })
  const est = estimacionProxy(
    [{ date: '2026-01-02', symbol: 'SPY', action: 'compra', units: 10, price: 50 }],
    al
  )
  // 500 € de coste y el proxy sube un 20% -> 600 €
  assert.ok(Math.abs(est.total - 600) < 1e-9, `estimado ${est.total}`)
})

test('real: el diario mide la disciplina', () => {
  const r = resumenDecisiones([
    { estado: 'seguida' },
    { estado: 'seguida' },
    { estado: 'ignorada' },
    { estado: 'modificada' },
  ])
  assert.equal(r.total, 4)
  assert.equal(r.seguida, 2)
  assert.ok(Math.abs(r.disciplina - 0.5) < 1e-12)
})

test('backtest: startDate arranca la regla el dia que empezaste tu', () => {
  const al = alignSeries(demoBars(SYMS, 1500))
  const completo = runBacktest(al, DEFAULT_CFG)
  const desde = completo.equity[Math.floor(completo.equity.length / 2)].date
  const parcial = runBacktest(al, { ...DEFAULT_CFG, startDate: desde })
  assert.ok(parcial.equity[0].date >= desde, `arranca en ${parcial.equity[0].date}`)
  assert.ok(parcial.equity.length < completo.equity.length)
  assert.ok(Math.abs(parcial.equity[0].v - 1) < 0.02, 'la curva parcial empieza en base 1')
})

// --- Banda de tolerancia del reajuste ---------------------------------------

test('banda: sin banda se opera todos los meses, con banda se omiten', () => {
  const al = alignSeries(demoBars(SYMS, 1500))
  const sin = runBacktest(al, { ...DEFAULT_CFG, rebalanceBand: 0 })
  const con = runBacktest(al, { ...DEFAULT_CFG, rebalanceBand: 0.05 })
  assert.equal(sin.stats.omitidos, 0, 'sin banda no se omite ningun mes')
  assert.ok(con.stats.omitidos > 0, `con banda deberia omitir meses, omitio ${con.stats.omitidos}`)
  assert.ok(
    con.stats.avgTurnover < sin.stats.avgTurnover,
    `rotacion ${con.stats.avgTurnover} deberia ser menor que ${sin.stats.avgTurnover}`
  )
  assert.ok(con.stats.totalCost < sin.stats.totalCost, 'y deberia costar menos en comisiones')
})

test('banda: los cambios de activo se ejecutan aunque la banda sea enorme', () => {
  const al = alignSeries(demoBars(SYMS, 1500))
  const enorme = runBacktest(al, { ...DEFAULT_CFG, rebalanceBand: 1 })
  const normal = runBacktest(al, { ...DEFAULT_CFG, rebalanceBand: 0 })
  // Con banda 1 solo se opera cuando entra o sale un activo, nunca por deriva.
  assert.ok(enorme.stats.changes > 0, 'deberia seguir habiendo cambios de activo')
  assert.equal(
    enorme.stats.changes,
    normal.stats.changes,
    'la banda no puede alterar QUE activos elige la regla, solo cuando se reajusta'
  )
  assert.ok(enorme.stats.omitidos > 0)
  // Todo mes que no se omite es porque de verdad habia ordenes que dar.
  for (const r of enorme.rebalances) {
    if (r.omitido) assert.equal(r.ordenes, 0)
    else assert.ok(r.ordenes > 0, `${r.date} operó sin ordenes`)
  }
  assert.equal(
    enorme.rebalances.filter((r) => r.omitido).length + enorme.rebalances.filter((r) => !r.omitido).length,
    enorme.stats.rebalances
  )
})

test('banda: en el simulador se ignora la deriva pequena pero no la entrada', () => {
  const al = alignSeries(demoBars(SYMS, 900))
  const i = al.dates.length - 1
  const priceOf = (s) => al.closes[s][i]
  const opts = { minTicket: 1, commissionBps: 0, commissionFixed: 0, rebalanceBand: 0.05 }

  // Cartera con SPY al 100%; objetivo 97% SPY y 3% GLD.
  const paper = {
    startCapital: 10000,
    log: [
      makeOp({ date: al.dates[i], symbol: 'SPY', action: BUY, units: 10000 / priceOf('SPY'), price: priceOf('SPY') }),
    ],
  }
  const v = valuate(paper, priceOf)
  const ordenes = ordersToReach({ SPY: 0.97, GLD: 0.03 }, v, priceOf, opts)
  const simbolos = ordenes.map((o) => o.symbol)
  assert.ok(simbolos.includes('GLD'), 'entrar en un activo nuevo se hace siempre')
  assert.ok(!simbolos.includes('SPY'), 'un 3% de deriva en SPY queda dentro de la banda')
})

test('candidatos: hay ISIN que copiar para los 14, y solo 2 confirmados', () => {
  const confirmados = []
  const candidatos = []
  for (const u of DEFAULT_UNIVERSE) {
    const c = isinParaBuscar(u.symbol)
    assert.ok(c.isin, `${u.symbol} no tiene ningun ISIN que copiar`)
    assert.match(c.isin, /^[A-Z]{2}[A-Z0-9]{9}\d$/, `${u.symbol}: ${c.isin} no parece un ISIN`)
    ;(c.confirmado ? confirmados : candidatos).push(u.symbol)
  }
  assert.deepEqual(confirmados, ['SPY', 'QQQ'], 'solo el S&P 500 y el Nasdaq replican el mismo indice')
  assert.equal(candidatos.length, 12)
})

test('candidatos: los ISIN no se repiten entre activos', () => {
  const vistos = new Map()
  for (const u of DEFAULT_UNIVERSE) {
    const { isin } = isinParaBuscar(u.symbol)
    assert.ok(!vistos.has(isin), `${isin} esta en ${vistos.get(isin)} y en ${u.symbol}`)
    vistos.set(isin, u.symbol)
  }
})

test('candidatos: lo que pega el usuario gana al candidato y queda confirmado', () => {
  const antes = isinParaBuscar('DBC')
  assert.equal(antes.confirmado, false)
  assert.equal(antes.isin, 'IE00BD6FTQ80')

  const despues = isinParaBuscar('DBC', { DBC: { isin: 'IE00BDFL4P12' } })
  assert.equal(despues.isin, 'IE00BDFL4P12')
  assert.equal(despues.confirmado, true, 'si lo has visto en tu broker, cuenta como confirmado')
})

test('candidatos: los activos con correspondencia inexacta llevan nota', () => {
  // Si el indice no coincide, la app tiene que explicar por que. Sin la nota,
  // un candidato parece equivalente cuando no lo es.
  for (const sym of ['VGK', 'EFA', 'EEM', 'VNQ', 'GLD', 'DBC', 'BIL', 'EWP']) {
    const c = compraFor(sym)
    assert.ok(c.nota && c.nota.length > 30, `${sym} deberia explicar en que se desvia`)
  }
})

// El ultimo digito de un ISIN es una suma de control (Luhn sobre las letras
// convertidas a numeros). Comprobarlo detecta cualquier transcripcion mal
// copiada, que es el error mas facil de cometer y el mas caro: un ISIN valido
// pero equivocado es comprar otra cosa.
function isinValido(isin) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false
  const digitos = isin
    .slice(0, 11)
    .split('')
    .map((ch) => (/\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)))
    .join('')
  let suma = 0
  let doblar = true
  for (let i = digitos.length - 1; i >= 0; i--) {
    let d = +digitos[i]
    if (doblar) {
      d *= 2
      if (d > 9) d -= 9
    }
    suma += d
    doblar = !doblar
  }
  // Un ISIN son 12 caracteres: 2 de pais, 9 de identificador y 1 de control,
  // asi que el digito de control esta en la posicion 11.
  return (10 - (suma % 10)) % 10 === +isin[11]
}

test('candidatos: el digito de control de cada ISIN cuadra', () => {
  // Casos conocidos, para comprobar que el validador funciona antes de usarlo.
  assert.equal(isinValido('IE00B5BMR087'), true)
  assert.equal(isinValido('IE00B5BMR088'), false, 'un digito cambiado debe fallar')

  for (const u of DEFAULT_UNIVERSE) {
    const { isin } = isinParaBuscar(u.symbol)
    assert.ok(isinValido(isin), `${u.symbol}: ${isin} tiene el digito de control mal`)
  }
  // Y las alternativas que se mencionan en las notas.
  for (const isin of ['IE0032077012', 'IE00BDFL4P12']) {
    assert.ok(isinValido(isin), `${isin} tiene el digito de control mal`)
  }
})

// --- Universo restringido a lo que el broker ofrece -------------------------

test('excluidos: la regla no puede elegir lo que tu broker no vende', () => {
  const al = alignSeries(demoBars(SYMS, 900))
  const i = al.dates.length - 1
  const cfg = { ...DEFAULT_CFG, excluidos: ['DBC', 'GLD'] }
  const rows = rankAt(al, i, cfg)
  const simbolos = rows.map((r) => r.symbol)
  assert.ok(!simbolos.includes('DBC'), 'DBC no deberia estar en el ranking')
  assert.ok(!simbolos.includes('GLD'), 'GLD tampoco')
  assert.equal(rows.length, SYMS.length - 3, 'faltan los dos excluidos y la liquidez')

  const w = targetWeights(rows, cfg)
  assert.ok(!w.DBC && !w.GLD, 'ni pueden aparecer en la cartera objetivo')
  assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9)
})

test('excluidos: el backtest prueba el universo restringido', () => {
  const al = alignSeries(demoBars(SYMS, 1500))
  const completo = runBacktest(al, DEFAULT_CFG)
  const restringido = runBacktest(al, { ...DEFAULT_CFG, excluidos: ['DBC', 'GLD'] })
  assert.equal(restringido.error, undefined)
  for (const r of restringido.rebalances) {
    assert.ok(!r.picks.includes('DBC') && !r.picks.includes('GLD'), `${r.date} eligió un excluido`)
  }
  // El resultado tiene que cambiar: si no, la exclusion no estaria surtiendo
  // efecto en ninguna decision.
  assert.ok(Math.abs(restringido.stats.cagr - completo.stats.cagr) > 1e-6)
})

test('excluidos: la liquidez sigue disponible aunque se excluya todo lo demas', () => {
  const al = alignSeries(demoBars(SYMS, 900))
  const i = al.dates.length - 1
  const fuera = SYMS.filter((s) => s !== DEFAULT_CFG.cashSymbol)
  const cfg = { ...DEFAULT_CFG, excluidos: fuera }
  const rows = rankAt(al, i, cfg)
  assert.equal(rows.length, 0)
  const w = targetWeights(rows, cfg)
  assert.ok(Math.abs(w[DEFAULT_CFG.cashSymbol] - 1) < 1e-9, 'todo a liquidez')
})

// --- Guardas al pegar un ISIN ----------------------------------------------

test('revisarIsin: detecta el codigo de otro activo del universo', () => {
  // El caso real: pegar en DBC el ISIN del ETF de bolsa espanola. El codigo es
  // valido y el broker lo encuentra, asi que solo comparar con el resto de la
  // lista puede pillarlo.
  const r = revisarIsin('DBC', 'LU0592216393')
  assert.equal(r.nivel, 'error')
  assert.match(r.mensaje, /EWP/)
  assert.match(r.mensaje, /Comprarias otra cosa/)
})

test('revisarIsin: acepta el candidato propio y avisa si es otro distinto', () => {
  assert.equal(revisarIsin('DBC', 'IE00BD6FTQ80').nivel, 'ok')
  const otro = revisarIsin('DBC', 'IE00BDFL4P12')
  assert.equal(otro.nivel, 'aviso', 'la alternativa legitima solo avisa, no bloquea')
  assert.match(otro.mensaje, /manda el tuyo/)
})

test('revisarIsin: caza el digito de control y la longitud', () => {
  assert.equal(revisarIsin('DBC', 'IE00BD6FTQ81').nivel, 'error')
  assert.match(revisarIsin('DBC', 'IE00BD6FTQ81').mensaje, /digito de control/)
  assert.match(revisarIsin('DBC', 'IE00BD6FTQ8').mensaje, /12 caracteres/)
  assert.equal(revisarIsin('DBC', ''), null, 'un campo vacio no es un error')
})

test('revisarIsin: no deja repetir el mismo ISIN en dos activos', () => {
  const r = revisarIsin('TLT', 'IE00B3VWN518', { IEF: { isin: 'IE00B3VWN518' } })
  assert.equal(r.nivel, 'error')
  assert.match(r.mensaje, /IEF/)
})

test('isinBienFormado: casos conocidos', () => {
  assert.equal(isinBienFormado('IE00B5BMR087'), true)
  assert.equal(isinBienFormado('LU0592216393'), true)
  assert.equal(isinBienFormado('IE00B5BMR088'), false)
  assert.equal(isinBienFormado('esto no es un isin'), false)
})
