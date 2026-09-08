import { useState } from 'react'
import { DEFAULT_UNIVERSE, metaFor } from '../data/universe.js'
import { fmtDate } from '../lib/format.js'

export default function Settings({ settings, patch, data, onClearCache }) {
  const { cfg } = settings
  const [nuevo, setNuevo] = useState('')
  const [msg, setMsg] = useState(null)

  const setCfg = (p) => patch({ cfg: { ...cfg, ...p } })

  function addSymbol(e) {
    e.preventDefault()
    const s = nuevo.trim().toUpperCase()
    if (!s) return
    if (settings.universe.includes(s)) {
      setMsg(`${s} ya está en el universo.`)
      return
    }
    patch({ universe: [...settings.universe, s] })
    setNuevo('')
    setMsg(`${s} añadido. Pulsa «Actualizar datos» para descargar su histórico.`)
  }

  function removeSymbol(s) {
    if (s === cfg.cashSymbol) {
      setMsg(`${s} es el activo de liquidez. Cámbialo antes de quitarlo.`)
      return
    }
    patch({ universe: settings.universe.filter((x) => x !== s) })
  }

  function exportar() {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `asesor-bolsa-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      patch(parsed)
      setMsg('Ajustes y operaciones importados.')
    } catch (err) {
      setMsg(`No se pudo leer el archivo: ${err.message}`)
    }
  }

  return (
    <>
      {msg && <div className="banner">{msg}</div>}

      <div className="card">
        <h2>API key de Twelve Data</h2>
        <p className="hint">
          Plan Basic gratuito en twelvedata.com: 800 peticiones al día y 8 por minuto. La clave se guarda
          solo en este navegador (localStorage) y las peticiones van directas del navegador a Twelve Data.
          Si algún día publicas esta app en internet, no metas la clave en el código: introdúcela aquí.
        </p>
        <div className="row">
          <input
            type="password"
            value={settings.apikey}
            placeholder="pega aquí tu API key"
            onChange={(e) => patch({ apikey: e.target.value.trim() })}
            style={{ minWidth: 320, fontFamily: 'var(--mono)' }}
          />
          <span className="muted small">
            {settings.apikey ? `${settings.apikey.length} caracteres guardados` : 'sin clave: modo demostración'}
          </span>
        </div>
        <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
          Descargar los {settings.universe.length} activos del universo cuesta {settings.universe.length}{' '}
          peticiones y tarda unos {Math.ceil(settings.universe.length / 8) * 60 - 60} segundos por el
          límite de 8 por minuto. Última descarga:{' '}
          {settings.lastRefresh ? fmtDate(settings.lastRefresh) : 'nunca'}.
        </p>
      </div>

      <div className="card">
        <h2>Universo ({settings.universe.length} activos)</h2>
        <p className="hint">
          Usa tickers de bolsas de EE.UU.: son los que cubre el plan gratuito. Para exposición europea
          existen ETFs cotizados en EE.UU. (VGK, EWP, EFA) que evitan el problema.
        </p>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Nombre</th>
                <th>Clase</th>
                <th>Sesiones</th>
                <th>Origen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {settings.universe.map((s) => {
                const m = metaFor(s)
                const d = data?.[s]
                return (
                  <tr key={s}>
                    <td className="sym">{s}</td>
                    <td style={{ textAlign: 'left' }}>{m.name}</td>
                    <td style={{ textAlign: 'left' }} className="muted small">
                      {m.clase}
                    </td>
                    <td>{d?.bars?.length ?? 0}</td>
                    <td>
                      {d?.source === 'twelvedata' ? (
                        <span className="pill ok">real</span>
                      ) : d?.source === 'demo' ? (
                        <span className="pill warn">demo</span>
                      ) : (
                        <span className="pill">sin datos</span>
                      )}
                    </td>
                    <td>
                      <button className="btn small danger" onClick={() => removeSymbol(s)}>
                        quitar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <form className="row" onSubmit={addSymbol} style={{ marginTop: 14 }}>
          <input
            list="sugerencias"
            value={nuevo}
            placeholder="p. ej. VT, XLE, SLV…"
            onChange={(e) => setNuevo(e.target.value)}
            style={{ width: 200 }}
          />
          <datalist id="sugerencias">
            {DEFAULT_UNIVERSE.filter((u) => !settings.universe.includes(u.symbol)).map((u) => (
              <option key={u.symbol} value={u.symbol}>
                {u.name}
              </option>
            ))}
          </datalist>
          <button className="btn" type="submit">
            Añadir activo
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => patch({ universe: DEFAULT_UNIVERSE.map((u) => u.symbol) })}
          >
            Restaurar universo por defecto
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Ventanas de momentum</h2>
        <p className="hint">
          Sesiones que mira cada ventana y su peso en la puntuación. 21 sesiones ≈ 1 mes. Ventanas cortas
          reaccionan antes y se equivocan más.
        </p>
        <div className="row">
          {cfg.lookbacks.map((l, k) => (
            <label className="field" key={k}>
              {l.label} · sesiones
              <input
                type="number"
                min="10"
                max="504"
                step="21"
                value={l.days}
                onChange={(e) => {
                  const days = Math.max(10, +e.target.value || l.days)
                  const next = cfg.lookbacks.map((x, i) => (i === k ? { ...x, days } : x))
                  setCfg({ lookbacks: next })
                }}
              />
            </label>
          ))}
          <label className="field">
            Activo de liquidez
            <select value={cfg.cashSymbol} onChange={(e) => setCfg({ cashSymbol: e.target.value })}>
              {settings.universe.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Datos y copias</h2>
        <p className="hint">
          Los históricos viven en IndexedDB y los ajustes con la cartera simulada en localStorage. Si
          vacías los datos del navegador, se pierden: exporta de vez en cuando.
        </p>
        <div className="row">
          <button className="btn" onClick={exportar}>
            Exportar ajustes y operaciones
          </button>
          <label className="btn" style={{ display: 'inline-flex' }}>
            Importar…
            <input type="file" accept="application/json" onChange={importar} style={{ display: 'none' }} />
          </label>
          <button className="btn danger" onClick={onClearCache}>
            Vaciar caché de precios y recargar
          </button>
        </div>
      </div>
    </>
  )
}
