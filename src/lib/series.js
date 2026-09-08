// Alineado de series diarias de distintos activos sobre un unico eje de fechas.
// Sin esto, comparar rentabilidades entre activos con calendarios distintos
// (festivos, salidas a bolsa, huecos del proveedor) da resultados falsos.

// dataBySymbol: { SYM: { bars: [{date,o,h,l,c,v}, ...] } }  (fechas ISO, ascendente)
// Devuelve { dates: [...], closes: { SYM: [numero|null] } } con arrastre del
// ultimo cierre conocido (forward fill) y null antes de la primera cotizacion.
export function alignSeries(dataBySymbol) {
  const symbols = Object.keys(dataBySymbol)
  const set = new Set()
  for (const s of symbols) for (const b of dataBySymbol[s].bars) set.add(b.date)
  const dates = [...set].sort()
  const index = new Map(dates.map((d, i) => [d, i]))

  const closes = {}
  for (const s of symbols) {
    const arr = new Array(dates.length).fill(null)
    for (const b of dataBySymbol[s].bars) {
      const i = index.get(b.date)
      if (i != null) arr[i] = b.c
    }
    let last = null
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] == null) arr[i] = last
      else last = arr[i]
    }
    closes[s] = arr
  }
  return { dates, closes, symbols }
}

// Indices del ultimo dia habil de cada mes presente en `dates`.
//
// El ultimo dia de la serie es un caso especial: no sabemos si es fin de mes o
// solo el ultimo dato que tenemos. `includeIncompleteLast` decide que hacer.
// El backtest lo pone en false (rebalancear el ultimo dia inventaria una
// comision que falsea el resultado final); la senal en vivo lo deja en true
// para que un cierre de mes real se vea el mismo dia.
export function monthEndIndices(dates, { includeIncompleteLast = true } = {}) {
  const out = []
  for (let i = 0; i < dates.length; i++) {
    const m = dates[i].slice(0, 7)
    const next = dates[i + 1]
    if (!next) {
      if (includeIncompleteLast) out.push(i)
      continue
    }
    if (next.slice(0, 7) !== m) out.push(i)
  }
  return out
}

// Media movil simple calculada solo en el indice i (evita recalcular la serie
// completa dentro del bucle del backtest).
export function smaAt(values, i, period) {
  if (i < period - 1) return null
  let sum = 0
  for (let k = i - period + 1; k <= i; k++) {
    if (values[k] == null) return null
    sum += values[k]
  }
  return sum / period
}

// Si una fecha es (probablemente) el ultimo dia habil de su mes.
// Ignora festivos: solo mira sabados y domingos. Se usa para no presentar el
// ranking de un dia cualquiera como si fuera la senal mensual en vigor.
export function isLikelyMonthEnd(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  const mes = d.getUTCMonth()
  const next = new Date(d)
  do {
    next.setUTCDate(next.getUTCDate() + 1)
  } while (next.getUTCDay() === 0 || next.getUTCDay() === 6)
  return next.getUTCMonth() !== mes
}
