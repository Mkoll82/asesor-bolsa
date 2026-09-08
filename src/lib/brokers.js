// Modelo de comisiones por broker.
//
// Los precios de los brokeRs cambian, y algunos dependen del plan que tengas
// contratado. Por eso aqui no hay nada grabado en piedra: todos los parametros
// son editables en Ajustes, y cada uno lleva de donde sale.
//
// `fuente: 'confirmado'` = tarifa publica y estable.
// `fuente: 'revisar'`    = depende de tu plan o ha cambiado varias veces.
//                          Comprueba el numero en tu app antes de fiarte.
export const BROKERS_DEFAULT = {
  traderepublic: {
    id: 'traderepublic',
    nombre: 'Trade Republic',
    fijo: 1, // euros por orden
    pct: 0, // porcentaje sobre el importe
    minimo: 0, // comision minima
    gratisMes: 0, // ordenes sin coste al mes
    fuente: 'confirmado',
    nota: '1 € fijo por orden en concepto de gastos de terceros. Sin custodia. Los planes de inversion periodicos son gratuitos, pero solo sirven para comprar: las ventas que pide la regla siguen costando 1 €.',
  },
  revolut: {
    id: 'revolut',
    nombre: 'Revolut',
    fijo: 0,
    pct: 0.0025,
    minimo: 1,
    gratisMes: 1,
    fuente: 'revisar',
    nota: 'Depende de tu plan (Standard, Plus, Premium, Metal, Ultra) y ha cambiado varias veces: unas veces por porcentaje con minimo, otras tarifa plana por orden. Pon los numeros de tu app; los de aqui son una suposicion.',
  },
}

// Coste de una orden concreta. `ordenesYaHechas` sirve para gastar primero las
// ordenes gratuitas del mes, si el broker las da.
export function costeOrden(broker, importe, ordenesYaHechas = 0) {
  if (!broker) return 0
  if (ordenesYaHechas < (broker.gratisMes || 0)) return 0
  const bruto = (broker.fijo || 0) + importe * (broker.pct || 0)
  return Math.max(bruto, broker.minimo || 0)
}

// Coste de ejecutar un conjunto de ordenes de una vez (un rebalanceo mensual).
export function costeRebalanceo(broker, ordenes) {
  let total = 0
  let n = 0
  const detalle = []
  for (const o of ordenes) {
    const c = costeOrden(broker, o.amount ?? o.units * o.price, n)
    detalle.push({ ...o, coste: c, gratis: c === 0 })
    total += c
    n++
  }
  const importe = ordenes.reduce((a, o) => a + (o.amount ?? o.units * o.price), 0)
  return { total, detalle, ordenes: n, importe, pctSobreImporte: importe ? total / importe : 0 }
}

// Comparativa entre varios brokeRs para las mismas ordenes.
export function comparar(brokers, ordenes) {
  const filas = Object.values(brokers).map((b) => ({
    broker: b,
    ...costeRebalanceo(b, ordenes),
  }))
  filas.sort((a, b) => a.total - b.total)
  return filas
}

// Coste anual estimado si el patron de este mes se repite todos los meses.
// Es la cifra que de verdad importa en una regla que rota: una comision de 1 €
// parece nada hasta que la multiplicas por doce meses y por cada posicion.
export function costeAnual(broker, ordenes, patrimonio) {
  const mes = costeRebalanceo(broker, ordenes).total
  const anual = mes * 12
  return { anual, pctPatrimonio: patrimonio ? anual / patrimonio : null }
}
