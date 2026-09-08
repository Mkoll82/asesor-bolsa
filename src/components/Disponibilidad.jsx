import { useMemo } from 'react'
import { metaFor, isinParaBuscar } from '../data/universe.js'
import { fmtPct } from '../lib/format.js'
import CodigoCompra from './CodigoCompra.jsx'

// Que activos ofrece cada broker, y cual de ellos puede ejecutar la regla.
//
// Esto empezo siendo una sola casilla de «lo tiene mi broker», hasta que quedo
// claro que el catalogo cambia mucho de un broker a otro: el mismo ETF esta en
// uno y no en el otro. Con una sola casilla se perdia la mitad de lo
// averiguado, y era imposible responder a la pregunta que de verdad importa:
// con cual de los dos se puede seguir esta estrategia.
//
// Tres estados, no dos: sin comprobar NO es lo mismo que no disponible. Solo
// lo comprobado como ausente saca a un activo del ranking.
const ESTADOS = [
  { id: 'si', label: 'sí', tono: 'buy' },
  { id: 'no', label: 'no', tono: 'sell' },
  { id: '', label: '—', tono: '' },
]

export default function Disponibilidad({ settings, patch }) {
  const { disponibilidad, brokerActivo, brokers, universe, cfg } = settings

  function marcar(brokerId, sym, estado) {
    const delBroker = { ...(disponibilidad[brokerId] || {}) }
    if (estado) delBroker[sym] = estado
    else delete delBroker[sym]
    patch({ disponibilidad: { ...disponibilidad, [brokerId]: delBroker } })
  }

  const resumen = useMemo(() => {
    return Object.values(brokers).map((b) => {
      const d = disponibilidad[b.id] || {}
      const si = universe.filter((s) => d[s] === 'si').length
      const no = universe.filter((s) => d[s] === 'no').length
      return {
        broker: b,
        si,
        no,
        sinComprobar: universe.length - si - no,
        // La estrategia necesita al menos tantos activos como posiciones pide,
        // mas la liquidez. Con menos, la regla no puede formar la cartera.
        viable: si >= cfg.topN,
      }
    })
  }, [brokers, disponibilidad, universe, cfg.topN])

  const activo = resumen.find((r) => r.broker.id === brokerActivo)

  return (
    <div className="card">
      <div className="spread">
        <div>
          <h2>Qué tiene cada bróker</h2>
          <p className="hint" style={{ marginBottom: 0 }}>
            El catálogo cambia mucho de un bróker a otro, así que apunta aquí lo que vayas comprobando.
            La regla solo elegirá entre lo que el bróker activo tenga marcado como disponible.{' '}
            <b>«—» significa sin comprobar</b>, que no es lo mismo que no estar: solo lo marcado con «no»
            queda fuera del ranking.
          </p>
        </div>
        <label className="field">
          Bróker con el que decido
          <select value={brokerActivo} onChange={(e) => patch({ brokerActivo: e.target.value })}>
            {Object.values(brokers).map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="stats" style={{ marginTop: 14 }}>
        {resumen.map((r) => (
          <div className="stat" key={r.broker.id}>
            <div className="k">
              {r.broker.nombre}
              {r.broker.id === brokerActivo ? ' · activo' : ''}
            </div>
            <div className={`v ${r.si ? '' : 'neg'}`}>
              {r.si}/{universe.length}
            </div>
            <div className="n">
              {r.no} sin catálogo, {r.sinComprobar} por comprobar
            </div>
          </div>
        ))}
      </div>

      {activo && !activo.viable && activo.si + activo.sinComprobar < cfg.topN && (
        <div className="banner" style={{ marginTop: 14 }}>
          Con {activo.broker.nombre} solo tienes {activo.si} activos disponibles y la regla pide{' '}
          {cfg.topN} posiciones. Así no puede formar la cartera: o compruebas más activos, o bajas el
          número de posiciones, o cambias de bróker.
        </div>
      )}

      <div className="tabla-scroll" style={{ marginTop: 14 }}>
        <table>
          <thead>
            <tr>
              <th>Activo</th>
              <th>Qué buscar</th>
              {Object.values(brokers).map((b) => (
                <th key={b.id}>{b.nombre}</th>
              ))}
              <th>En el ranking</th>
            </tr>
          </thead>
          <tbody>
            {universe.map((sym) => {
              const fuera = (cfg.excluidos || []).includes(sym)
              const esLiquidez = sym === cfg.cashSymbol
              return (
                <tr key={sym} className={fuera ? 'dim' : ''}>
                  <td>
                    <span className="sym">{sym}</span>
                    <div className="name">{metaFor(sym).name}</div>
                  </td>
                  <td style={{ textAlign: 'left' }}>
                    <CodigoCompra symbol={sym} compras={settings.compras} compacto />
                  </td>
                  {Object.values(brokers).map((b) => {
                    const estado = disponibilidad[b.id]?.[sym] || ''
                    return (
                      <td key={b.id}>
                        <div className="row" style={{ gap: 3, justifyContent: 'flex-end' }}>
                          {ESTADOS.map((e) => (
                            <button
                              key={e.id || 'nada'}
                              className={`btn small ${estado === e.id ? 'primary' : ''}`}
                              style={{ padding: '2px 7px' }}
                              onClick={() => marcar(b.id, sym, e.id)}
                              title={
                                e.id === 'si'
                                  ? `Lo he encontrado en ${b.nombre}`
                                  : e.id === 'no'
                                    ? `No está en ${b.nombre}`
                                    : 'Sin comprobar'
                              }
                            >
                              {e.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                  <td>
                    {esLiquidez ? (
                      <span className="tag cash">liquidez</span>
                    ) : fuera ? (
                      <span className="tag sell">fuera</span>
                    ) : (
                      <span className="tag buy">dentro</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
        El activo de liquidez ({cfg.cashSymbol}) nunca sale del ranking: es donde va el dinero que la
        regla decide no invertir. Si tu bróker no lo tiene, déjalo en efectivo y apunta la rentabilidad
        que te dé la cuenta.
        {(cfg.excluidos || []).length > 0 && (
          <>
            {' '}Ahora mismo la regla elige entre {universe.length - cfg.excluidos.length - 1} activos, un{' '}
            {fmtPct((universe.length - cfg.excluidos.length - 1) / (universe.length - 1), true)} del
            universo.
          </>
        )}
      </p>
    </div>
  )
}
