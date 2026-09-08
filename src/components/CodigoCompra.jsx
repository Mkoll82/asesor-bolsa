import { useState } from 'react'
import { compraFor, isinParaBuscar } from '../data/universe.js'

// Muestra que buscar en el broker para comprar de verdad un activo del
// universo, con el ISIN listo para copiar.
//
// Distingue dos cosas que no son lo mismo:
//  - Un ISIN CONFIRMADO: el ETF europeo replica el mismo indice que el
//    americano con el que se calcula la señal.
//  - Un CANDIDATO: no existe un UCITS del mismo indice y hay que elegir uno
//    parecido. Se ofrece para que lo puedas buscar, no para que te fies de el.
//
// El ISIN es el codigo que funciona en cualquier broker europeo; el ticker
// cambia segun la bolsa, asi que lo que se copia es siempre el ISIN.
export default function CodigoCompra({ symbol, compras, compacto = false }) {
  const c = isinParaBuscar(symbol, compras)
  const detalle = compraFor(symbol, compras)
  const [copiado, setCopiado] = useState(false)

  async function copiar(e) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(c.isin)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      // Sin permiso de portapapeles: se selecciona el texto para copiar a mano.
      const objetivo = e.currentTarget.previousElementSibling
      if (!objetivo) return
      const r = document.createRange()
      r.selectNodeContents(objetivo)
      const sel = getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
    }
  }

  if (!c.isin) {
    return (
      <div className="compra pendiente">
        <span className="tag cash">sin ISIN</span>
        {!compacto && detalle.buscar && (
          <div className="name">busca «{detalle.buscar}» en tu bróker</div>
        )}
      </div>
    )
  }

  return (
    <div className="compra">
      <div className="row" style={{ gap: 6 }}>
        {detalle.ticker && <span className="sym">{detalle.ticker}</span>}
        <span className="isin mono">{c.isin}</span>
        <button
          className="btn small"
          onClick={copiar}
          title="Copiar el ISIN para pegarlo en el buscador del bróker"
        >
          {copiado ? '✓ copiado' : 'copiar'}
        </button>
        {detalle.propio ? (
          <span className="tag buy" title="Lo has puesto tú, visto en tu bróker">
            tuyo
          </span>
        ) : c.confirmado ? (
          <span className="tag buy" title="Replica el mismo índice que el activo con el que se calcula">
            confirmado
          </span>
        ) : (
          <span
            className="tag cash"
            title="Índice parecido, no el mismo. Verifícalo en tu bróker antes de comprar."
          >
            sin confirmar
          </span>
        )}
      </div>
      {!compacto && c.nombre && <div className="name">{c.nombre}</div>}
      {!compacto && c.datos?.patrimonio && (
        <div className="name">
          {c.datos.patrimonio} · gastos {c.datos.ter} · {c.datos.reparto}
          {!c.confirmado && ' · candidato de justETF, sin verificar'}
        </div>
      )}
      {!compacto && detalle.nota && <div className="name aviso">{detalle.nota}</div>}
    </div>
  )
}
