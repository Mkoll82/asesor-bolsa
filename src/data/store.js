// Ajustes, cartera real y cartera simulada, en localStorage. Nada de esto sale
// del navegador: ni la API key ni las posiciones viajan a ningun servidor.
import { DEFAULT_CFG } from '../lib/momentum.js'
import { DEFAULT_PAPER } from '../lib/paper.js'
import { BROKERS_DEFAULT } from '../lib/brokers.js'
import { DEFAULT_UNIVERSE } from './universe.js'

const KEY = 'asesor-bolsa.v1'

const DEFAULTS = {
  apikey: '',
  universe: DEFAULT_UNIVERSE.map((u) => u.symbol),
  cfg: DEFAULT_CFG,
  paper: DEFAULT_PAPER,
  // ISIN y ticker del equivalente UCITS que el usuario haya confirmado en su
  // broker: { SPY: { isin, ticker, nombre } }. Manda sobre lo que trae
  // universe.js, porque lo ha visto en pantalla y yo no.
  compras: {},
  brokers: BROKERS_DEFAULT,
  // Cartera real: lo que de verdad ha pasado en tu cuenta del broker.
  real: {
    broker: 'traderepublic',
    log: [], // operaciones ejecutadas de verdad
    movimientos: [], // aportaciones (+) y retiradas (-)
    valoraciones: [], // el saldo total que te muestra el broker, una vez al mes
    decisiones: [], // diario: si seguiste la senal de cada mes y por que
  },
  lastRefresh: null,
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULTS)
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULTS,
      ...parsed,
      cfg: { ...DEFAULT_CFG, ...(parsed.cfg || {}) },
      paper: { ...DEFAULT_PAPER, ...(parsed.paper || {}) },
      compras: { ...(parsed.compras || {}) },
      real: { ...DEFAULTS.real, ...(parsed.real || {}) },
      // Se fusiona por broker para que anadir uno nuevo aqui no borre las
      // tarifas que el usuario ya haya corregido.
      brokers: Object.fromEntries(
        Object.entries(BROKERS_DEFAULT).map(([k, v]) => [k, { ...v, ...(parsed.brokers?.[k] || {}) }])
      ),
    }
  } catch {
    return structuredClone(DEFAULTS)
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch (e) {
    console.warn('No se pudieron guardar los ajustes', e)
  }
}
