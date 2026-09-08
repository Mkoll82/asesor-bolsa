// Universo por defecto: ETFs cotizados en EE.UU. que cubren las grandes clases
// de activo. Se eligen tickers de EE.UU. porque son los que cubre el plan
// gratuito de Twelve Data; dan la misma exposicion que sus equivalentes
// europeos (IWDA, EUNL...) pero con datos fiables y sin coste.
//
// drift/vol solo se usan para generar el modo demo sin API key.
export const DEFAULT_UNIVERSE = [
  { symbol: 'SPY', name: 'S&P 500', clase: 'Renta variable', drift: 0.09, vol: 0.17 },
  { symbol: 'QQQ', name: 'Nasdaq 100', clase: 'Renta variable', drift: 0.13, vol: 0.24 },
  { symbol: 'IWM', name: 'EE.UU. pequena capitalizacion', clase: 'Renta variable', drift: 0.07, vol: 0.22 },
  { symbol: 'VGK', name: 'Europa desarrollada', clase: 'Renta variable', drift: 0.06, vol: 0.19 },
  { symbol: 'EWP', name: 'Espana (MSCI Spain)', clase: 'Renta variable', drift: 0.05, vol: 0.24 },
  { symbol: 'EFA', name: 'Desarrollado ex-EE.UU.', clase: 'Renta variable', drift: 0.06, vol: 0.18 },
  { symbol: 'EEM', name: 'Emergentes', clase: 'Renta variable', drift: 0.04, vol: 0.21 },
  { symbol: 'VNQ', name: 'Inmobiliario EE.UU.', clase: 'Inmobiliario', drift: 0.05, vol: 0.2 },
  { symbol: 'GLD', name: 'Oro', clase: 'Materias primas', drift: 0.06, vol: 0.15 },
  { symbol: 'DBC', name: 'Materias primas diversificadas', clase: 'Materias primas', drift: 0.03, vol: 0.19 },
  { symbol: 'TLT', name: 'Bonos EE.UU. 20+ anos', clase: 'Renta fija', drift: 0.01, vol: 0.15 },
  { symbol: 'IEF', name: 'Bonos EE.UU. 7-10 anos', clase: 'Renta fija', drift: 0.02, vol: 0.07 },
  { symbol: 'LQD', name: 'Corporativo grado inversion', clase: 'Renta fija', drift: 0.03, vol: 0.09 },
  { symbol: 'BIL', name: 'Letras 1-3 meses (liquidez)', clase: 'Liquidez', drift: 0.042, vol: 0.004 },
]

export const META = Object.fromEntries(DEFAULT_UNIVERSE.map((u) => [u.symbol, u]))

export function metaFor(symbol) {
  return META[symbol] || { symbol, name: symbol, clase: '-', drift: 0.06, vol: 0.18 }
}
