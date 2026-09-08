import { useState } from 'react'
import { DEFAULT_UNIVERSE, metaFor, compraFor } from '../data/universe.js'
import { BROKERS_DEFAULT } from '../lib/brokers.js'
import { probarClave } from '../data/twelvedata.js'
import { fmtDate, fmtEur, fmtPct } from '../lib/format.js'

export default function Settings({ settings, patch, data, onClearCache }) {
  const { cfg } = settings
  const [nuevo, setNuevo] = useState('')
  const [msg, setMsg] = useState(null)
  const [prueba, setPrueba] = useState(null)
  const [probando, setProbando] = useState(false)

  async function comprobar() {
    setProbando(true)
    setPrueba(null)
    setPrueba(await probarClave(settings.apikey))
    setProbando(false)
  }

  const setCfg = (p) => patch({ cfg: { ...cfg, ...p } })

  const setCompra = (sym, campos) =>
    patch({ compras: { ...settings.compras, [sym]: { ...settings.compras[sym], ...campos } } })

  const setBroker = (id, campos) =>
    patch({ brokers: { ...settings.brokers, [id]: { ...settings.brokers[id], ...campos } } })

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

  const pendientes = settings.universe.filter((s) => !compraFor(s, settings.compras).isin)

  return (
    <>
      {msg && <div className="banner">{msg}</div>}

      <div className="card">
        <h2>API key de Twelve Data</h2>
        <p className="hint">
          Plan Basic gratuito en twelvedata.com: 800 peticiones al día y 8 por minuto. La clave se guarda
          solo en este navegador (localStorage) y las peticiones van directas del navegador a Twelve Data.
          Nunca pasa por ningún servidor mío ni queda en el código publicado.
        </p>
        <div className="row">
          <input
            type="password"
            value={settings.apikey}
            placeholder="pega aquí tu API key"
            onChange={(e) => patch({ apikey: e.target.value.trim() })}
            style={{ minWidth: 320, fontFamily: 'var(--mono)' }}
          />
          <button className="btn" onClick={comprobar} disabled={!settings.apikey || probando}>
            {probando ? 'Comprobando…' : 'Probar la clave'}
          </button>
          {settings.apikey ? (
            <span className="pill ok">guardada, {settings.apikey.length} caracteres</span>
          ) : (
            <span className="pill warn">sin clave: modo demostración</span>
          )}
        </div>
        {prueba && (
          <div className={`banner ${prueba.ok ? 'busy' : ''}`} style={{ marginTop: 12, marginBottom: 0 }}>
            {prueba.ok ? '✓ ' : '✗ '}
            {prueba.mensaje}
            {prueba.ok && ' Ya puedes pulsar «Actualizar datos» arriba.'}
          </div>
        )}
        <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
          Descargar los {settings.universe.length} activos del universo cuesta {settings.universe.length}{' '}
          peticiones y tarda unos {Math.max(0, Math.ceil(settings.universe.length / 8) * 60 - 60)} segundos
          por el límite de 8 por minuto. Última descarga:{' '}
          {settings.lastRefresh ? fmtDate(settings.lastRefresh) : 'nunca'}.
        </p>
      </div>

      <div className="card">
        <h2>Universo y códigos de compra ({settings.universe.length} activos)</h2>
        <p className="hint">
          Los tickers de la izquierda son de EE. UU. y sirven para <b>calcular</b>: son los que cubre el
          plan gratuito de datos. Las dos últimas columnas son para <b>comprar</b>, el equivalente UCITS
          que sí te venden en Europa. Solo vienen rellenos los dos ISIN que puedo garantizar; el resto
          pégalos tú desde el buscador de tu bróker, porque un ISIN inventado es comprar otra cosa.
        </p>
        {pendientes.length > 0 && (
          <div className="banner" style={{ marginBottom: 14 }}>
            Te faltan {pendientes.length} ISIN: {pendientes.join(', ')}. Sin ellos la señal te dirá qué
            comprar pero no con qué código buscarlo.
          </div>
        )}
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Cálculo</th>
                <th>Nombre</th>
                <th>Clase</th>
                <th>Sesiones</th>
                <th>Datos</th>
                <th>Ticker UCITS</th>
                <th>ISIN para comprar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {settings.universe.map((s) => {
                const m = metaFor(s)
                const d = data?.[s]
                const c = compraFor(s, settings.compras)
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
                      <input
                        value={settings.compras[s]?.ticker ?? c.ticker ?? ''}
                        placeholder="CSPX"
                        onChange={(e) => setCompra(s, { ticker: e.target.value.toUpperCase() })}
                        style={{ width: 86, fontFamily: 'var(--mono)' }}
                      />
                    </td>
                    <td>
                      <input
                        value={settings.compras[s]?.isin ?? c.isin ?? ''}
                        placeholder={c.buscar ? 'pega el ISIN' : ''}
                        title={c.buscar ? `Busca «${c.buscar}» en tu bróker` : c.nombre || ''}
                        onChange={(e) =>
                          setCompra(s, { isin: e.target.value.toUpperCase().replace(/\s+/g, '') })
                        }
                        style={{ width: 152, fontFamily: 'var(--mono)' }}
                      />
                      {!c.isin && c.buscar && <div className="name">busca «{c.buscar}»</div>}
                      {c.nota && <div className="name aviso">{c.nota}</div>}
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
        <h2>Tarifas de tus brókeres</h2>
        <p className="hint">
          Los precios cambian y algunos dependen del plan que tengas contratado, así que aquí no hay nada
          grabado en piedra: pon los números que veas en tu app. El coste por orden se calcula como{' '}
          <b>fijo + porcentaje sobre el importe</b>, con un mínimo, descontando las órdenes gratuitas que
          te dé el bróker cada mes.
        </p>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Bróker</th>
                <th>Fijo (€)</th>
                <th>Porcentaje</th>
                <th>Mínimo (€)</th>
                <th>Gratis/mes</th>
                <th>Orden de 1.000 €</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(settings.brokers).map((b) => {
                const ej = Math.max((b.fijo || 0) + 1000 * (b.pct || 0), b.minimo || 0)
                return (
                  <tr key={b.id}>
                    <td>
                      <b>{b.nombre}</b>
                      {b.fuente === 'revisar' ? (
                        <div className="name aviso">sin verificar</div>
                      ) : (
                        <div className="name">tarifa pública</div>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={b.fijo}
                        onChange={(e) => setBroker(b.id, { fijo: Math.max(0, +e.target.value || 0) })}
                        style={{ width: 78 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.05"
                        value={+(b.pct * 100).toFixed(3)}
                        onChange={(e) => setBroker(b.id, { pct: Math.max(0, +e.target.value || 0) / 100 })}
                        style={{ width: 82 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={b.minimo}
                        onChange={(e) => setBroker(b.id, { minimo: Math.max(0, +e.target.value || 0) })}
                        style={{ width: 78 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={b.gratisMes}
                        onChange={(e) => setBroker(b.id, { gratisMes: Math.max(0, +e.target.value || 0) })}
                        style={{ width: 70 }}
                      />
                    </td>
                    <td>
                      {fmtEur(ej)}
                      <div className="name">{fmtPct(ej / 1000)}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => patch({ brokers: structuredClone(BROKERS_DEFAULT) })}>
            Restaurar tarifas por defecto
          </button>
        </div>
        {Object.values(settings.brokers).map((b) =>
          b.nota ? (
            <p className="hint" key={b.id} style={{ marginTop: 10, marginBottom: 0 }}>
              <b>{b.nombre}:</b> {b.nota}
            </p>
          ) : null
        )}
      </div>

      <div className="card">
        <h2>Ventanas de momentum</h2>
        <p className="hint">
          Sesiones que mira cada ventana. 21 sesiones ≈ 1 mes. Ventanas cortas reaccionan antes y se
          equivocan más.
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
                  setCfg({ lookbacks: cfg.lookbacks.map((x, i) => (i === k ? { ...x, days } : x)) })
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
          Los históricos viven en IndexedDB y los ajustes, los ISIN y las operaciones en localStorage. Si
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
