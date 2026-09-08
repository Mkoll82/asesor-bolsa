// Universo por defecto: ETFs cotizados en EE. UU. Se usan para CALCULAR, no
// para comprar.
//
// Por que esta separacion: la normativa europea PRIIPs exige un KID en un
// idioma oficial de la UE, y las gestoras estadounidenses no lo emiten. Eso
// deja SPY, QQQ, GLD y compania vetados a minoristas europeos. Lo que si
// puedes comprar es el equivalente UCITS, domiciliado en Irlanda o Luxemburgo,
// que replica un indice parecido y cotiza en Xetra o Euronext.
//
// Se calcula con los tickers de EE. UU. porque el plan gratuito de Twelve Data
// cubre esas bolsas y no Xetra.
//
// SOBRE LOS DOS NIVELES DE CONFIANZA
//
// `isin` (confirmado): el indice del ETF americano y el del europeo son el
// mismo, asi que la correspondencia no es opinable. Solo pasa con el S&P 500 y
// el Nasdaq 100.
//
// `candidato` (sin confirmar): hay que ELEGIR, porque no existe un UCITS que
// replique exactamente el mismo indice. DBC sigue el DBIQ Optimum Yield y el
// candidato sigue el Bloomberg Commodity; EFA sigue el MSCI EAFE y el
// candidato el MSCI World ex USA, que incluye Canada. Son decisiones, no
// busquedas, y por eso las tiene que validar quien pone el dinero.
//
// Todos los datos de candidatos salen de justETF (consultado el 2026-09-08),
// eligiendo en cada caso el fondo mas grande por patrimonio, que suele ser el
// mas liquido. En cuanto el usuario pegue un ISIN visto en su broker, ese
// manda sobre todo esto.
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
      nombre: 'iShares Core S&P 500 UCITS ETF USD (Acc)',
      bolsa: 'Xetra (SXR8) / Londres (CSPX)',
      patrimonio: '134.824 M€',
      ter: '0,07%',
      reparto: 'acumulación',
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
      isin: 'IE00B53SZB19',
      ticker: 'CNDX',
      nombre: 'iShares Nasdaq 100 UCITS ETF (Acc)',
      bolsa: 'Xetra (SXRV) / Londres (CNDX)',
      patrimonio: '24.257 M€',
      ter: '0,30%',
      reparto: 'acumulación',
      verificado: true,
      nota: 'Alternativa igual de valida: Invesco EQQQ Nasdaq-100, IE0032077012, mas barato de contratar en algunos brokeRs pero reparte dividendos en vez de acumularlos.',
    },
  },
  {
    symbol: 'IWM',
    name: 'EE.UU. pequena capitalizacion',
    clase: 'Renta variable',
    drift: 0.07,
    vol: 0.22,
    compra: {
      isin: '',
      buscar: 'Russell 2000 UCITS',
      verificado: false,
      candidato: {
        isin: 'IE00BJ38QD84',
        nombre: 'State Street SPDR Russell 2000 U.S. Small Cap UCITS ETF USD',
        patrimonio: '4.843 M€',
        ter: '0,30%',
        reparto: 'acumulación',
      },
    },
  },
  {
    symbol: 'VGK',
    name: 'Europa desarrollada',
    clase: 'Renta variable',
    drift: 0.06,
    vol: 0.19,
    compra: {
      isin: '',
      buscar: 'Core MSCI Europe UCITS',
      verificado: false,
      candidato: {
        isin: 'IE00B4K48X80',
        nombre: 'iShares Core MSCI Europe UCITS ETF EUR (Acc)',
        patrimonio: '16.049 M€',
        ter: '0,12%',
        reparto: 'acumulación',
      },
      nota: 'VGK sigue el FTSE Developed Europe y el candidato el MSCI Europe. Practicamente la misma exposicion, no el mismo indice.',
    },
  },
  {
    symbol: 'EWP',
    name: 'Espana (MSCI Spain)',
    clase: 'Renta variable',
    drift: 0.05,
    vol: 0.24,
    compra: {
      isin: '',
      buscar: 'Spanish Equity UCITS',
      verificado: false,
      candidato: {
        isin: 'LU0592216393',
        nombre: 'Xtrackers Spanish Equity UCITS ETF 1C',
        patrimonio: '225 M€',
        ter: '0,30%',
        reparto: 'acumulación',
      },
      nota: 'Es el unico ETF de bolsa espanola con algo de tamano, y aun asi es pequeno (225 M€). Puede que tu broker no lo tenga.',
    },
  },
  {
    symbol: 'EFA',
    name: 'Desarrollado ex-EE.UU.',
    clase: 'Renta variable',
    drift: 0.06,
    vol: 0.18,
    compra: {
      isin: '',
      buscar: 'MSCI World ex USA UCITS',
      verificado: false,
      candidato: {
        isin: 'IE0006WW1TQ4',
        nombre: 'Xtrackers MSCI World ex USA UCITS ETF 1C',
        patrimonio: '6.814 M€',
        ter: '0,15%',
        reparto: 'acumulación',
      },
      nota: 'EFA sigue el MSCI EAFE, que NO incluye Canada; el candidato sigue el World ex USA, que si. Es la diferencia mas grande de toda esta lista.',
    },
  },
  {
    symbol: 'EEM',
    name: 'Emergentes',
    clase: 'Renta variable',
    drift: 0.04,
    vol: 0.21,
    compra: {
      isin: '',
      buscar: 'Core MSCI Emerging Markets IMI UCITS',
      verificado: false,
      candidato: {
        isin: 'IE00BKM4GZ66',
        nombre: 'iShares Core MSCI Emerging Markets IMI UCITS ETF (Acc)',
        patrimonio: '38.814 M€',
        ter: '0,18%',
        reparto: 'acumulación',
      },
      nota: 'El «IMI» del candidato incluye pequena capitalizacion, que EEM no lleva. Diferencia menor.',
    },
  },
  {
    symbol: 'VNQ',
    name: 'Inmobiliario EE.UU.',
    clase: 'Inmobiliario',
    drift: 0.05,
    vol: 0.2,
    compra: {
      isin: '',
      buscar: 'US Property Yield UCITS',
      verificado: false,
      candidato: {
        isin: 'IE00B1FZSF77',
        nombre: 'iShares US Property Yield UCITS ETF',
        patrimonio: '549 M€',
        ter: '0,40%',
        reparto: 'distribución',
      },
      nota: 'El candidato filtra por dividendo alto, asi que no es el mercado inmobiliario completo como VNQ. Y reparte dividendos: te llegara dinero a la cuenta cada trimestre, con su retencion.',
    },
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
      verificado: false,
      candidato: {
        isin: 'IE00B4ND3602',
        nombre: 'iShares Physical Gold ETC',
        patrimonio: '34.014 M€',
        ter: '0,12%',
        reparto: 'acumulación',
      },
      nota: 'El oro se compra como ETC, no como UCITS: juridicamente es un producto distinto, con riesgo de emisor aunque este respaldado por lingotes en camara.',
    },
  },
  {
    symbol: 'DBC',
    name: 'Materias primas diversificadas',
    clase: 'Materias primas',
    drift: 0.03,
    vol: 0.19,
    compra: {
      isin: '',
      buscar: 'Bloomberg Commodity UCITS',
      verificado: false,
      candidato: {
        isin: 'IE00BD6FTQ80',
        nombre: 'Invesco Bloomberg Commodity UCITS ETF Acc',
        patrimonio: '3.879 M€',
        ter: '0,19%',
        reparto: 'acumulación',
      },
      nota: 'DBC sigue el DBIQ Optimum Yield y el candidato el Bloomberg Commodity: indices distintos con rentabilidades parecidas, no iguales. Ademas es sintetico (swap), o sea que replica el indice con un contrato con un banco en lugar de comprando materias primas. Alternativa: iShares Diversified Commodity Swap, IE00BDFL4P12.',
    },
  },
  {
    symbol: 'TLT',
    name: 'Bonos EE.UU. 20+ anos',
    clase: 'Renta fija',
    drift: 0.01,
    vol: 0.15,
    compra: {
      isin: '',
      buscar: 'USD Treasury Bond 20+yr UCITS',
      verificado: false,
      candidato: {
        isin: 'IE00BFM6TC58',
        nombre: 'iShares USD Treasury Bond 20+yr UCITS ETF USD (Acc)',
        patrimonio: '2.651 M€',
        ter: '0,07%',
        reparto: 'acumulación',
      },
    },
  },
  {
    symbol: 'IEF',
    name: 'Bonos EE.UU. 7-10 anos',
    clase: 'Renta fija',
    drift: 0.02,
    vol: 0.07,
    compra: {
      isin: '',
      buscar: 'USD Treasury Bond 7-10yr UCITS',
      verificado: false,
      candidato: {
        isin: 'IE00B3VWN518',
        nombre: 'iShares USD Treasury Bond 7-10yr UCITS ETF (Acc)',
        patrimonio: '4.313 M€',
        ter: '0,07%',
        reparto: 'acumulación',
      },
    },
  },
  {
    symbol: 'LQD',
    name: 'Corporativo grado inversion',
    clase: 'Renta fija',
    drift: 0.03,
    vol: 0.09,
    compra: {
      isin: '',
      buscar: 'USD Corporate Bond UCITS',
      verificado: false,
      candidato: {
        isin: 'IE00BYXYYJ35',
        nombre: 'iShares USD Corporate Bond UCITS ETF (Acc)',
        patrimonio: '3.969 M€',
        ter: '0,20%',
        reparto: 'acumulación',
      },
    },
  },
  {
    symbol: 'BIL',
    name: 'Letras 1-3 meses (liquidez)',
    clase: 'Liquidez',
    drift: 0.042,
    vol: 0.004,
    compra: {
      isin: '',
      buscar: 'EUR Overnight Rate Swap UCITS',
      verificado: false,
      candidato: {
        isin: 'LU0290358497',
        nombre: 'Xtrackers II EUR Overnight Rate Swap UCITS ETF 1C',
        patrimonio: '22.634 M€',
        ter: '0,10%',
        reparto: 'acumulación',
      },
      nota: 'AVISO: aqui el candidato cambia la exposicion a proposito. BIL son letras en DOLARES y el candidato renta el tipo a un dia en EUROS. Para un inversor en euros es la eleccion correcta (no quieres riesgo de divisa en la parte tranquila de la cartera), pero el backtest esta calculado con BIL, asi que en este activo el resultado real se desviara de lo probado.',
    },
  },
]

export const META = Object.fromEntries(DEFAULT_UNIVERSE.map((u) => [u.symbol, u]))

export function metaFor(symbol) {
  return (
    META[symbol] || {
      symbol,
      name: symbol,
      clase: '-',
      drift: 0.06,
      vol: 0.18,
      compra: { isin: '', verificado: false },
    }
  )
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

// El ISIN que se puede copiar para buscar en el broker: el confirmado si lo
// hay, y si no el candidato. Devuelve tambien si esta confirmado, porque la
// interfaz tiene que decirlo: copiar un codigo no es lo mismo que fiarse de el.
export function isinParaBuscar(symbol, overrides = {}) {
  const c = compraFor(symbol, overrides)
  if (c.isin) return { isin: c.isin, confirmado: true, nombre: c.nombre, datos: c }
  if (c.candidato?.isin)
    return {
      isin: c.candidato.isin,
      confirmado: false,
      nombre: c.candidato.nombre,
      datos: c.candidato,
      fuente: 'justETF',
    }
  return { isin: '', confirmado: false, nombre: null, datos: null }
}
