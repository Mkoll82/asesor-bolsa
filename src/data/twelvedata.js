// Proveedor de datos: Twelve Data (plan Basic gratuito).
//
// Por que este y no Yahoo: Yahoo no envia cabeceras CORS y responde 429 desde
// el navegador, asi que sin backend no es una opcion. Twelve Data devuelve
// `access-control-allow-origin: *`, que es lo que permite que esta app viva
// entera en el navegador.
//
// Limites del plan gratuito (plan Basic, confirmados en su tarifario): 8
// creditos por minuto y 800 al dia, y solo 3 mercados: acciones y ETFs de
// EE. UU., divisas y cripto. De ahi que el universo sean tickers americanos.
// Un simbolo en una peticion de series = 1 credito, asi que se agrupa en lotes
// de 8 y se espera entre lotes.
//
// La clave va en la cabecera `Authorization`, que es el metodo que recomienda
// su documentacion, y no en la URL: asi no queda escrita en el historial del
// navegador ni en los registros de ningun intermediario. Se ha comprobado que
// su preflight de CORS admite esa cabecera, que es lo que hace viable usarla
// desde el navegador.
const BASE = 'https://api.twelvedata.com'
const BATCH = 8
const WAIT_MS = 61000

// Todos los tickers del universo tienen homonimos en otras bolsas: hay un SPY
// en Mexico, otro en Argentina, un GLD en Sudafrica y Tailandia. Sin acotar el
// pais, el proveedor podria devolver cualquiera de ellos, en su divisa y con su
// calendario, y la app no tendria forma de notarlo. Se fija el pais y ademas se
// guarda la bolsa y la divisa que responde, para poder comprobarlo a la vista.
const PAIS = 'United States'

export async function fetchBars(symbols, { apikey, outputsize = 1500, onProgress } = {}) {
  if (!apikey) throw new Error('Falta la API key de Twelve Data.')
  const result = {}
  const errors = {}
  const chunks = []
  for (let i = 0; i < symbols.length; i += BATCH) chunks.push(symbols.slice(i, i + BATCH))

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c]
    onProgress?.({ phase: 'descargando', done: c * BATCH, total: symbols.length, chunk })
    const url =
      `${BASE}/time_series?symbol=${encodeURIComponent(chunk.join(','))}` +
      `&interval=1day&outputsize=${outputsize}&order=ASC&country=${encodeURIComponent(PAIS)}`
    let json
    try {
      const res = await fetch(url, { headers: cabeceras(apikey) })
      json = await res.json()
    } catch (e) {
      for (const s of chunk) errors[s] = `Red: ${e.message}`
      continue
    }

    // Respuesta de error global (clave mal, cuota agotada...).
    if (json.status === 'error' || (json.code && json.code >= 400 && !json[chunk[0]])) {
      const msg = `${json.code || ''} ${json.message || 'error desconocido'}`.trim()
      if (json.code === 429) throw new Error(`Cuota de Twelve Data agotada: ${msg}`)
      if (json.code === 401) throw new Error(`API key rechazada: ${msg}`)
      for (const s of chunk) errors[s] = msg
      continue
    }

    // Con un solo simbolo la respuesta viene plana; con varios, indexada.
    const perSymbol = chunk.length === 1 ? { [chunk[0]]: json } : json
    for (const s of chunk) {
      const d = perSymbol[s]
      if (!d || d.status === 'error' || !Array.isArray(d.values)) {
        errors[s] = d?.message || 'sin datos'
        continue
      }
      result[s] = {
        bars: d.values
          .map((v) => ({
            date: v.datetime,
            o: +v.open,
            h: +v.high,
            l: +v.low,
            c: +v.close,
            v: v.volume == null ? null : +v.volume,
          }))
          .filter((b) => Number.isFinite(b.c))
          .sort((a, b) => (a.date < b.date ? -1 : 1)),
        source: 'twelvedata',
        currency: d.meta?.currency,
        exchange: d.meta?.exchange,
        micCode: d.meta?.mic_code,
      }
    }

    if (c < chunks.length - 1) {
      onProgress?.({ phase: 'esperando', done: (c + 1) * BATCH, total: symbols.length, waitMs: WAIT_MS })
      await sleep(WAIT_MS)
    }
  }
  onProgress?.({ phase: 'listo', done: symbols.length, total: symbols.length })
  return { data: result, errors }
}

function cabeceras(apikey) {
  return { Authorization: `apikey ${apikey}` }
}

// Comprueba una clave con una sola peticion (1 credito de los 800 diarios).
// Devuelve un mensaje en claro, incluido el que manda Twelve Data cuando la
// rechaza, que suele decir exactamente que pasa.
export async function probarClave(apikey) {
  if (!apikey) return { ok: false, mensaje: 'No has pegado ninguna clave.' }
  try {
    const res = await fetch(`${BASE}/time_series?symbol=SPY&interval=1day&outputsize=1`, {
      headers: cabeceras(apikey),
    })
    const json = await res.json()
    if (json.status === 'error' || json.code >= 400) {
      return {
        ok: false,
        mensaje: `Twelve Data rechaza la clave (${json.code || res.status}): ${json.message || 'sin detalle'}`,
      }
    }
    const ultimo = json.values?.[0]
    if (!ultimo) return { ok: false, mensaje: 'La clave responde pero no ha devuelto cotizaciones.' }
    return {
      ok: true,
      mensaje: `Clave correcta. SPY cerro a ${ultimo.close} el ${ultimo.datetime}.`,
      moneda: json.meta?.currency,
    }
  } catch (e) {
    return { ok: false, mensaje: `No se pudo contactar con Twelve Data: ${e.message}` }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
