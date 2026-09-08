import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadSettings, saveSettings } from './data/store.js'
import { loadAll, saveBars, clearAll } from './data/cache.js'
import { demoBars } from './data/demo.js'
import { fetchBars } from './data/twelvedata.js'
import { alignSeries } from './lib/series.js'
import { breadth } from './lib/momentum.js'
import { fmtDate, fmtPct } from './lib/format.js'
import SignalPanel from './components/SignalPanel.jsx'
import PaperPanel from './components/PaperPanel.jsx'
import RealPanel from './components/RealPanel.jsx'
import AssetDetail from './components/AssetDetail.jsx'
import BacktestPanel from './components/BacktestPanel.jsx'
import Settings from './components/Settings.jsx'

const VIEWS = [
  { id: 'senal', label: 'Señal del mes' },
  { id: 'simulador', label: 'Simulador' },
  { id: 'real', label: 'Cartera real' },
  { id: 'activo', label: 'Ficha de activo' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'ajustes', label: 'Ajustes' },
]

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [data, setData] = useState(null)
  const [status, setStatus] = useState({ busy: true, msg: 'Cargando datos locales…' })
  const [view, setView] = useState('senal')
  const [selected, setSelected] = useState(null)
  const mounted = useRef(false)

  // Persistencia de ajustes (se salta el primer render para no reescribir
  // lo mismo que acabamos de leer).
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    saveSettings(settings)
  }, [settings])

  const patch = useCallback((p) => setSettings((s) => ({ ...s, ...p })), [])

  // Carga inicial: cache de IndexedDB y, si esta vacia, datos de demostracion
  // para que la app sea utilizable antes de tener API key.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await loadAll()
        const byS = {}
        for (const r of rows || [])
          byS[r.symbol] = {
            bars: r.bars,
            source: r.source,
            currency: r.currency,
            exchange: r.exchange,
          }
        const missing = settings.universe.filter((s) => !byS[s]?.bars?.length)
        if (missing.length) {
          const demo = demoBars(missing)
          for (const s of missing) {
            byS[s] = demo[s]
            saveBars(s, demo[s].bars, 'demo')
          }
        }
        if (!alive) return
        setData(byS)
        setStatus({
          busy: false,
          msg: missing.length
            ? `${missing.length} activos con datos de demostración. Pon tu API key en Ajustes y pulsa Actualizar.`
            : '',
        })
      } catch (e) {
        if (alive) setStatus({ busy: false, msg: `Error cargando datos: ${e.message}` })
      }
    })()
    return () => {
      alive = false
    }
    // Solo al montar: la recarga del universo se hace desde Ajustes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const aligned = useMemo(() => {
    if (!data) return null
    const present = Object.fromEntries(
      settings.universe.filter((s) => data[s]?.bars?.length).map((s) => [s, data[s]])
    )
    if (!Object.keys(present).length) return null
    return alignSeries(present)
  }, [data, settings.universe])

  const lastIdx = aligned ? aligned.dates.length - 1 : -1
  const priceOf = useCallback(
    (sym) => (aligned && aligned.closes[sym] ? aligned.closes[sym][lastIdx] : null),
    [aligned, lastIdx]
  )

  const sources = useMemo(() => {
    if (!data) return {}
    const c = {}
    for (const s of settings.universe) {
      const src = data[s]?.source || 'sin datos'
      c[src] = (c[src] || 0) + 1
    }
    return c
  }, [data, settings.universe])

  const mkt = useMemo(
    () => (aligned ? breadth(aligned, lastIdx, settings.cfg.trendPeriod) : null),
    [aligned, lastIdx, settings.cfg.trendPeriod]
  )

  async function refresh() {
    if (!settings.apikey) {
      setView('ajustes')
      setStatus({ busy: false, msg: 'Necesitas una API key de Twelve Data para descargar datos reales.' })
      return
    }
    setStatus({ busy: true, msg: 'Descargando…' })
    try {
      const { data: fresh, errors } = await fetchBars(settings.universe, {
        apikey: settings.apikey,
        onProgress: (p) => {
          if (p.phase === 'esperando') {
            setStatus({
              busy: true,
              msg: `${p.done}/${p.total} descargados. Esperando 60 s por el límite de 8 peticiones/minuto del plan gratuito…`,
            })
          } else if (p.phase === 'descargando') {
            setStatus({ busy: true, msg: `Descargando ${p.chunk.join(', ')}…` })
          }
        },
      })
      const next = { ...data }
      for (const [s, d] of Object.entries(fresh)) {
        next[s] = d
        await saveBars(s, d.bars, d.source, {
          currency: d.currency,
          exchange: d.exchange,
          micCode: d.micCode,
        })
      }
      setData(next)
      const errList = Object.entries(errors)
      patch({ lastRefresh: new Date().toISOString() })
      setStatus({
        busy: false,
        msg: errList.length
          ? `Actualizados ${Object.keys(fresh).length}. Sin datos: ${errList
              .map(([s, e]) => `${s} (${e})`)
              .join(', ')}`
          : `Actualizados ${Object.keys(fresh).length} activos.`,
      })
    } catch (e) {
      setStatus({ busy: false, msg: `Error: ${e.message}` })
    }
  }

  function openAsset(sym) {
    setSelected(sym)
    setView('activo')
  }

  const shared = { settings, patch, aligned, lastIdx, priceOf, data, openAsset }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="dot" />
          <h1>Asesor de bolsa</h1>
          <span className="sub">momentum mensual · señales técnicas · simulador</span>
        </div>
        <div className="top-right">
          {mkt && (
            <div className="gauge" title={`${mkt.above} de ${mkt.total} activos por encima de su media de ${settings.cfg.trendPeriod} sesiones`}>
              <span className="gauge-label">Amplitud</span>
              <div className="gauge-bar">
                <i style={{ width: `${(mkt.pct * 100).toFixed(0)}%` }} data-level={mkt.pct > 0.6 ? 'alto' : mkt.pct > 0.35 ? 'medio' : 'bajo'} />
              </div>
              <b>{fmtPct(mkt.pct, true)}</b>
            </div>
          )}
          {sources.demo > 0 && <span className="pill warn">{sources.demo} en demo</span>}
          {sources.twelvedata > 0 && <span className="pill ok">{sources.twelvedata} reales</span>}
          <span className="muted small">
            {settings.lastRefresh ? `Datos: ${fmtDate(settings.lastRefresh)}` : 'Sin descargar'}
          </span>
          <button className="btn primary" onClick={refresh} disabled={status.busy}>
            {status.busy ? 'Trabajando…' : 'Actualizar datos'}
          </button>
        </div>
      </header>

      <nav className="tabs">
        {VIEWS.map((v) => (
          <button key={v.id} className={view === v.id ? 'tab active' : 'tab'} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </nav>

      {status.msg && <div className={`banner ${status.busy ? 'busy' : ''}`}>{status.msg}</div>}

      <main>
        {!aligned ? (
          <div className="card">Cargando series…</div>
        ) : view === 'senal' ? (
          <SignalPanel {...shared} />
        ) : view === 'simulador' ? (
          <PaperPanel {...shared} />
        ) : view === 'real' ? (
          <RealPanel {...shared} />
        ) : view === 'activo' ? (
          <AssetDetail {...shared} selected={selected} setSelected={setSelected} />
        ) : view === 'backtest' ? (
          <BacktestPanel {...shared} />
        ) : (
          <Settings {...shared} onClearCache={async () => {
            await clearAll()
            location.reload()
          }} />
        )}
      </main>

      <footer className="foot">
        Herramienta personal de análisis. No es asesoramiento financiero ni una recomendación de compra
        o venta: las señales son el resultado mecánico de las reglas que tú configuras, y los resultados
        pasados no anticipan los futuros.
      </footer>
    </div>
  )
}
