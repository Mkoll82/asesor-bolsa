// Universo por defecto: ETFs cotizados en EE. UU. Se usan para CALCULAR, no
// para comprar.
//
// Por que esta separacion: la normativa europea PRIIPs exige un KID en un
// idioma oficial de la UE, y las gestoras estadounidenses no lo emiten. Eso
// deja SPY, QQQ, GLD y compania vetados a minoristas europeos: ni Trade
// Republic ni Revolut te los venden. Lo que si puedes comprar es el
// equivalente UCITS, domiciliado en Irlanda o Luxemburgo, que replica el mismo
// indice y cotiza en Xetra o Euronext.
//
// Se calcula con los tickers de EE. UU. porque el plan gratuito de Twelve Data
// cubre bien esas bolsas y bastante mal Xetra. Al replicar el mismo indice, el
// ranking de momentum sale practicamente igual.
//
// El campo `compra` dice que buscar en el brokeR. `verificado: false` significa
// que NO esta comprobado: en ese caso solo se ofrece un termino de busqueda, y
// el ISIN lo tienes que pegar tu desde el buscador de tu broker. Un ISIN
// equivocado es comprar otra cosa, asi que aqui no se inventa ninguno.
//
// drift/vol solo se usan para generar el modo demo sin API key.
export const DEFAULT_UNIVERSE = [
  {
    symbol: 'SPY',
    name: 'S&P 500',
    clase: 'Renta variable',
    drift: 0.09,
    vol: 0.17,
    compra: {
      isin: 'IE00B5BMR087',
      ticker: 'CSPX',
      nombre: 'iShares Core S&P 500 UCITS ETF (Acc)',
      bolsa: 'Xetra (SXR8) / Londres (CSPX)',
      verificado: true,
    },
  },
  {
    symbol: 'QQQ',
    name: 'Nasdaq 100',
    clase: 'Renta variable',
    drift: 0.13,
    vol: 0.24,
    compra: {
      isin: 'IE0032077012',
      ticker: 'CNDX',
      nombre: 'iShares Nasdaq 100 UCITS ETF (Acc)',
      bolsa: 'Xetra (SXRV) / Londres (CNDX)',
      verificado: true,
    },
  },
  {
    symbol: 'IWM',
    name: 'EE.UU. pequena capitalizacion',
    clase: 'Renta variable',
    drift: 0.07,
    vol: 0.22,
    compra: { isin: '', buscar: 'S&P Small Cap 600 UCITS o Russell 2000 UCITS', verificado: false },
  },
  {
    symbol: 'VGK',
    name: 'Europa desarrollada',
    clase: 'Renta variable',
    drift: 0.06,
    vol: 0.19,
    compra: { isin: '', buscar: 'MSCI Europe UCITS', verificado: false },
  },
  {
    symbol: 'EWP',
    name: 'Espana (MSCI Spain)',
    clase: 'Renta variable',
    drift: 0.05,
    vol: 0.24,
    compra: {
      isin: '',
      buscar: 'IBEX 35 UCITS',
      nota: 'La oferta de ETFs de Espana en formato UCITS es muy corta; puede que tu broker no tenga ninguno.',
      verificado: false,
    },
  },
  {
    symbol: 'EFA',
    name: 'Desarrollado ex-EE.UU.',
    clase: 'Renta variable',
    drift: 0.06,
    vol: 0.18,
    compra: { isin: '', buscar: 'MSCI World ex USA UCITS o MSCI EAFE UCITS', verificado: false },
  },
  {
    symbol: 'EEM',
    name: 'Emergentes',
    clase: 'Renta variable',
    drift: 0.04,
    vol: 0.21,
    compra: { isin: '', buscar: 'Core MSCI Emerging Markets IMI UCITS', verificado: false },
  },
  {
    symbol: 'VNQ',
    name: 'Inmobiliario EE.UU.',
    clase: 'Inmobiliario',
    drift: 0.05,
    vol: 0.2,
    compra: { isin: '', buscar: 'US Property Yield UCITS o Developed Markets Property Yield UCITS', verificado: false },
  },
  {
    symbol: 'GLD',
    name: 'Oro',
    clase: 'Materias primas',
    drift: 0.06,
    vol: 0.15,
    compra: {
      isin: '',
      buscar: 'Physical Gold ETC',
      nota: 'El oro se compra como ETC, no como UCITS: es un producto distinto, con riesgo de emisor aunque este respaldado por lingotes.',
      verificado: false,
    },
  },
  {
    symbol: 'DBC',
    name: 'Materias primas diversificadas',
    clase: 'Materias primas',
    drift: 0.03,
    vol: 0.19,
    compra: { isin: '', buscar: 'Bloomberg Commodity UCITS o Diversified Commodity Swap UCITS', verificado: false },
  },
  {
    symbol: 'TLT',
    name: 'Bonos EE.UU. 20+ anos',
    clase: 'Renta fija',
    drift: 0.01,
    vol: 0.15,
    compra: { isin: '', buscar: 'USD Treasury Bond 20+yr UCITS', verificado: false },
  },
  {
    symbol: 'IEF',
    name: 'Bonos EE.UU. 7-10 anos',
    clase: 'Renta fija',
    drift: 0.02,
    vol: 0.07,
    compra: { isin: '', buscar: 'USD Treasury Bond 7-10yr UCITS', verificado: false },
  },
  {
    symbol: 'LQD',
    name: 'Corporativo grado inversion',
    clase: 'Renta fija',
    drift: 0.03,
    vol: 0.09,
    compra: { isin: '', buscar: 'USD Corporate Bond UCITS', verificado: false },
  },
  {
    symbol: 'BIL',
    name: 'Letras 1-3 meses (liquidez)',
    clase: 'Liquidez',
    drift: 0.042,
    vol: 0.004,
    compra: {
      isin: '',
      buscar: 'EUR Overnight Return Swap o mercado monetario en euros',
      nota: 'Ojo: BIL son letras en dolares. Tu liquidez deberia estar en euros, o asumes riesgo de divisa justo en la parte de la cartera que quieres tranquila.',
      verificado: false,
    },
  },
]

export const META = Object.fromEntries(DEFAULT_UNIVERSE.map((u) => [u.symbol, u]))

export function metaFor(symbol) {
  return META[symbol] || { symbol, name: symbol, clase: '-', drift: 0.06, vol: 0.18, compra: { isin: '', verificado: false } }
}

// Datos de compra, con lo que el usuario haya corregido a mano por encima.
// `overrides` viene de los ajustes: { SPY: { isin, ticker, nombre } }
export function compraFor(symbol, overrides = {}) {
  const base = metaFor(symbol).compra || { isin: '', verificado: false }
  const mio = overrides[symbol]
  if (!mio || (!mio.isin && !mio.ticker)) return base
  // Si lo has puesto tu, cuenta como verificado: lo has visto en tu broker.
  return { ...base, ...mio, verificado: true, propio: true }
}
