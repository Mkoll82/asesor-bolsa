// Ajustes, cartera real y cartera simulada, en localStorage. Nada de esto sale
// del navegador: ni la API key ni las posiciones viajan a ningun servidor.
import { DEFAULT_CFG } from '../lib/momentum.js'
import { DEFAULT_PAPER } from '../lib/paper.js'
import { DEFAULT_UNIVERSE } from './universe.js'

const KEY = 'asesor-bolsa.v1'

const DEFAULTS = {
  apikey: '',
  universe: DEFAULT_UNIVERSE.map((u) => u.symbol),
  cfg: DEFAULT_CFG,
  paper: DEFAULT_PAPER,
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
