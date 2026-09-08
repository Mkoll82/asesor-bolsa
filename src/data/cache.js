// Cache local en IndexedDB. El plan gratuito de Twelve Data da 800 creditos al
// dia y 8 por minuto, asi que descargar de nuevo el historico en cada recarga
// de la pagina no es viable: se guarda y solo se pide lo que falta.
const DB_NAME = 'asesor-bolsa'
const STORE = 'bars'

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'symbol' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx(mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    const out = fn(store)
    t.oncomplete = () => {
      db.close()
      resolve(out?.result !== undefined ? out.result : out)
    }
    t.onerror = () => {
      db.close()
      reject(t.error)
    }
  })
}

export async function saveBars(symbol, bars, source) {
  return tx('readwrite', (s) => s.put({ symbol, bars, source, fetchedAt: Date.now() }))
}

export async function loadAll() {
  return tx('readonly', (s) => s.getAll())
}

export async function clearAll() {
  return tx('readwrite', (s) => s.clear())
}
