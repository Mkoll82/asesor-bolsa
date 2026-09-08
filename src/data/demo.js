import { metaFor } from './universe.js'

// Generador de series sinteticas para trabajar sin API key.
// Movimiento browniano geometrico con un factor de mercado comun, para que la
// correlacion entre activos sea realista y el ranking de momentum tenga
// sentido en lugar de ser ruido independiente.
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(rnd) {
  let u = 0
  let v = 0
  while (u === 0) u = rnd()
  while (v === 0) v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function tradingDays(n, endDate = new Date()) {
  const out = []
  const d = new Date(endDate)
  d.setHours(12, 0, 0, 0)
  while (out.length < n) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() - 1)
  }
  return out.reverse()
}

export function demoBars(symbols, n = 1500) {
  const dates = tradingDays(n)
  // Factor de mercado comun: da tramos alcistas y bajistas compartidos.
  const mRnd = mulberry32(20260908)
  const market = []
  let regime = 1
  for (let i = 0; i < n; i++) {
    if (i % 160 === 0) regime = mRnd() < 0.28 ? -1 : 1
    market.push((gauss(mRnd) * 0.008 + (regime > 0 ? 0.0004 : -0.0009)))
  }

  const out = {}
  for (const symbol of symbols) {
    const m = metaFor(symbol)
    const rnd = mulberry32(hash(symbol))
    const beta = m.clase === 'Renta fija' ? -0.25 : m.clase === 'Liquidez' ? 0 : 0.6 + rnd() * 0.7
    const dailyDrift = m.drift / 252
    const idio = (m.vol / Math.sqrt(252)) * 0.6
    let price = 20 + rnd() * 180
    const bars = []
    for (let i = 0; i < n; i++) {
      const r = dailyDrift + beta * market[i] + gauss(rnd) * idio
      const open = price
      price = Math.max(0.5, price * (1 + r))
      const wick = Math.abs(gauss(rnd)) * idio * price * 0.5
      bars.push({
        date: dates[i],
        o: round(open),
        h: round(Math.max(open, price) + wick),
        l: round(Math.max(0.2, Math.min(open, price) - wick)),
        c: round(price),
        v: Math.round(1e6 + rnd() * 9e6),
      })
    }
    out[symbol] = { bars, source: 'demo' }
  }
  return out
}

function round(x) {
  return Math.round(x * 100) / 100
}
