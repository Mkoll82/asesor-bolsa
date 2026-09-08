// Proveedor de datos: Twelve Data (plan Basic gratuito).
//
// Por que este y no Yahoo: Yahoo no envia cabeceras CORS y responde 429 desde
// el navegador, asi que sin backend no es una opcion. Twelve Data devuelve
// `access-control-allow-origin: *`, que es lo que permite que esta app viva
// entera en el navegador.
//
// Limites del plan gratuito: 8 creditos por minuto y 800 al dia. Un simbolo en
// una peticion de series = 1 credito. Por eso se agrupa en lotes de 8 y se
// espera entre lotes.
const BASE = 'https://api.twelvedata.com'
const BATCH = 8
const WAIT_MS = 61000

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
      `&interval=1day&outputsize=${outputsize}&order=ASC&apikey=${encodeURIComponent(apikey)}`
    let json
    try {
      const res = await fetch(url)
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
