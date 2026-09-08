const pct2 = new Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 2 })
const pct1 = new Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 1 })
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const num2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num4 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

export const fmtPct = (v, one) => (v == null || !Number.isFinite(v) ? '—' : (one ? pct1 : pct2).format(v))
export const fmtEur = (v) => (v == null || !Number.isFinite(v) ? '—' : eur.format(v))
export const fmtNum = (v) => (v == null || !Number.isFinite(v) ? '—' : num2.format(v))
export const fmtUnits = (v) => (v == null || !Number.isFinite(v) ? '—' : num4.format(v))

export const fmtDate = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export const fmtDateShort = (iso) => (iso ? iso.slice(0, 7).split('-').reverse().join('/') : '—')

export const signClass = (v) => (v == null ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '')

export const todayISO = () => new Date().toISOString().slice(0, 10)
