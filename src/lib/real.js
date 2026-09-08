// Cartera real: medir lo que de verdad ha pasado en tu cuenta del broker.
//
// El problema central, y la razon de que este archivo exista aparte del
// simulador: si aportas o retiras dinero, el valor total de la cartera sube o
// baja sin que eso sea ganancia ni perdida. Una hoja de calculo que divida el
// valor de hoy entre lo que pusiste al principio da un numero falso en cuanto
// haces la primera aportacion. Aqui se calculan las dos cosas que si
// significan algo:
//
//  - Rentabilidad ponderada por tiempo (TWR): mide como se ha comportado la
//    ESTRATEGIA, aislando el efecto de tus aportaciones. Es la que se compara
//    con el backtest y con el indice, porque es la unica comparable.
//  - Ganancia en euros: valor actual menos lo que has metido, mas lo que has
//    sacado. Mide como te ha ido a TI, y es la que nota tu bolsillo.
//
// Las dos son correctas y responden a preguntas distintas.

// movimientos: [{ date, importe }] con importe positivo si aportas y negativo
// si retiras. valoraciones: [{ date, total }] el saldo que te muestra el broker.

export function ordenarPorFecha(xs) {
  return [...(xs || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// Flujos netos ocurridos en (desde, hasta]. Se excluye el extremo inicial para
// que cada movimiento cuente en un unico periodo.
function flujosEntre(movimientos, desde, hasta) {
  return movimientos
    .filter((m) => m.date > desde && m.date <= hasta)
    .reduce((a, m) => a + m.importe, 0)
}

// Curva ponderada por tiempo, en base 1 en la primera valoracion.
//
// Para cada periodo entre dos valoraciones: r = (V_final - flujos) / V_inicial - 1
// Se supone que el dinero entra al final del periodo, que es lo razonable
// cuando solo tienes una foto al mes. Si aportas justo despues de valorar, el
// calculo es exacto; si aportas a mitad de mes, hay un error pequeno.
export function curvaTWR(valoraciones, movimientos) {
  const vals = ordenarPorFecha(valoraciones)
  const movs = ordenarPorFecha(movimientos)
  if (vals.length < 2) return []
  const out = [{ date: vals[0].date, v: 1, total: vals[0].total }]
  let indice = 1
  for (let i = 1; i < vals.length; i++) {
    const anterior = vals[i - 1]
    const actual = vals[i]
    const flujos = flujosEntre(movs, anterior.date, actual.date)
    if (!anterior.total) {
      // Sin base con la que comparar: se reancla el indice y se sigue.
      out.push({ date: actual.date, v: indice, total: actual.total, sinBase: true })
      continue
    }
    const r = (actual.total - flujos) / anterior.total - 1
    indice *= 1 + r
    out.push({ date: actual.date, v: indice, total: actual.total, r, flujos })
  }
  return out
}

export function resumenReal(valoraciones, movimientos) {
  const vals = ordenarPorFecha(valoraciones)
  const movs = ordenarPorFecha(movimientos)
  const aportado = movs.filter((m) => m.importe > 0).reduce((a, m) => a + m.importe, 0)
  // Math.abs evita el -0 que sale de negar una suma vacia.
  const retirado = Math.abs(movs.filter((m) => m.importe < 0).reduce((a, m) => a + m.importe, 0))
  const valor = vals.length ? vals[vals.length - 1].total : 0
  const neto = aportado - retirado

  const curva = curvaTWR(vals, movs)
  const twr = curva.length ? curva[curva.length - 1].v - 1 : null
  const anos = vals.length > 1 ? aniosEntre(vals[0].date, vals[vals.length - 1].date) : 0
  // Solo se anualiza con al menos un ano de historia. Extrapolar cinco meses
  // buenos a una cifra anual es la forma mas facil de engañarse: un 14% en
  // cinco meses no son un 37% al ano, son un 14% en cinco meses.
  const twrAnual = twr != null && anos >= 1 ? Math.pow(1 + twr, 1 / anos) - 1 : null

  return {
    valor,
    aportado,
    retirado,
    neto,
    // Lo que has ganado de verdad, en euros.
    ganancia: valor + retirado - aportado,
    // Sobre el dinero que has puesto. No es comparable con un indice, porque
    // el dinero no ha estado invertido todo el tiempo.
    gananciaPct: aportado ? (valor + retirado - aportado) / aportado : null,
    twr,
    twrAnual,
    anos,
    desde: vals[0]?.date || null,
    hasta: vals[vals.length - 1]?.date || null,
    valoraciones: vals.length,
    curva,
  }
}

// Estimacion de tu cartera segun los ETFs de EE. UU. con los que se calcula la
// senal: se aplica a cada compra la variacion del activo equivalente desde el
// dia en que la hiciste.
//
// Sirve para responder «que habria dado la estrategia sobre mi dinero», que no
// es lo mismo que tu saldo: tu compraste el UCITS en euros, y ese envoltorio
// tiene su propia comision de gestion, su diferencia de replica y su divisa.
// La distancia entre esta cifra y tu saldo real es justo lo que cuesta el
// envoltorio, y merece la pena mirarla.
export function estimacionProxy(log, aligned, idx) {
  if (!log?.length || !aligned) return null
  const i = idx ?? aligned.dates.length - 1
  const porActivo = {}
  let total = 0
  for (const op of ordenarPorFecha(log)) {
    const serie = aligned.closes[op.symbol]
    if (!serie) continue
    const j = indiceDeFecha(aligned.dates, op.date)
    if (j < 0 || serie[j] == null || serie[i] == null) continue
    const factor = serie[i] / serie[j]
    const importe = op.units * op.price
    const signo = op.action === 'venta' ? -1 : 1
    // Una venta deja de acumular: se resta el valor que tendria esa parte.
    const aporte = signo * importe * factor
    porActivo[op.symbol] = (porActivo[op.symbol] || 0) + aporte
    total += aporte
  }
  return { total, porActivo, fecha: aligned.dates[i] }
}

// Ultimo indice con fecha <= la buscada.
export function indiceDeFecha(dates, date) {
  for (let k = dates.length - 1; k >= 0; k--) if (dates[k] <= date) return k
  return -1
}

function aniosEntre(a, b) {
  return (new Date(b) - new Date(a)) / (365.25 * 24 * 3600 * 1000)
}

// --- Diario de decisiones ---------------------------------------------------

export const ESTADOS = [
  { id: 'seguida', label: 'seguida', tono: 'buy' },
  { id: 'modificada', label: 'modificada', tono: 'cash' },
  { id: 'ignorada', label: 'ignorada', tono: 'sell' },
]

export function resumenDecisiones(decisiones) {
  const lista = decisiones || []
  const cuenta = { seguida: 0, modificada: 0, ignorada: 0 }
  for (const d of lista) if (cuenta[d.estado] != null) cuenta[d.estado]++
  const total = lista.length
  return {
    total,
    ...cuenta,
    disciplina: total ? cuenta.seguida / total : null,
  }
}
