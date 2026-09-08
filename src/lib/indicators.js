// Indicadores tecnicos. Todas las series van de mas antiguo a mas reciente.
// Convencion: devuelven un array de la misma longitud que la entrada, con
// `null` en las posiciones donde no hay suficiente historico. Asi el indice i
// de cualquier indicador siempre corresponde a la barra i del precio.

export function sma(values, period) {
  const out = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null)
  const k = 2 / (period + 1)
  let prev = null
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      let sum = 0
      for (let j = 0; j < period; j++) sum += values[j]
      prev = sum / period
      out[i] = prev
    } else if (i >= period) {
      prev = values[i] * k + prev * (1 - k)
      out[i] = prev
    }
  }
  return out
}

// RSI de Wilder (suavizado exponencial de ganancias/perdidas medias).
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period
    loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const ef = ema(values, fast)
  const es = ema(values, slow)
  const line = values.map((_, i) => (ef[i] == null || es[i] == null ? null : ef[i] - es[i]))
  // La senal es una EMA sobre la parte no nula de la linea MACD.
  const firstIdx = line.findIndex((v) => v != null)
  const signal = new Array(values.length).fill(null)
  const hist = new Array(values.length).fill(null)
  if (firstIdx >= 0) {
    const compact = line.slice(firstIdx)
    const sig = ema(compact, signalPeriod)
    for (let i = 0; i < sig.length; i++) {
      if (sig[i] == null) continue
      signal[firstIdx + i] = sig[i]
      hist[firstIdx + i] = compact[i] - sig[i]
    }
  }
  return { macd: line, signal, hist }
}

// ATR de Wilder sobre barras {h,l,c}. Mide el recorrido diario tipico:
// es la unidad natural para dimensionar un stop.
export function atr(bars, period = 14) {
  const out = new Array(bars.length).fill(null)
  if (bars.length <= period) return out
  const tr = new Array(bars.length).fill(null)
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i]
    const pc = bars[i - 1].c
    tr[i] = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc))
  }
  let sum = 0
  for (let i = 1; i <= period; i++) sum += tr[i]
  let prev = sum / period
  out[period] = prev
  for (let i = period + 1; i < bars.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period
    out[i] = prev
  }
  return out
}

// Rentabilidad total sobre los ultimos n periodos (0.12 = +12%).
export function totalReturn(values, n) {
  if (values.length < n + 1) return null
  const a = values[values.length - 1 - n]
  const b = values[values.length - 1]
  if (!a) return null
  return b / a - 1
}

export function maxDrawdown(values) {
  let peak = -Infinity
  let peakIdx = 0
  let worst = 0
  let at = { peak: 0, trough: 0 }
  for (let i = 0; i < values.length; i++) {
    if (values[i] > peak) {
      peak = values[i]
      peakIdx = i
    }
    const dd = values[i] / peak - 1
    if (dd < worst) {
      worst = dd
      at = { peak: peakIdx, trough: i }
    }
  }
  return { mdd: worst, ...at }
}

export function cagr(first, last, years) {
  if (!first || years <= 0) return null
  return Math.pow(last / first, 1 / years) - 1
}

// Volatilidad anualizada a partir de rentabilidades diarias.
export function annualVol(values) {
  if (values.length < 3) return null
  const rets = []
  for (let i = 1; i < values.length; i++) rets.push(values[i] / values[i - 1] - 1)
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const varc = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)
  return Math.sqrt(varc) * Math.sqrt(252)
}

// Distancia al maximo de las ultimas n barras: 0 = en maximos.
export function drawdownFromHigh(values, n = 252) {
  const slice = values.slice(-n)
  const hi = Math.max(...slice)
  return values[values.length - 1] / hi - 1
}
