import { useState } from 'react'
import { compraFor } from '../data/universe.js'

// Muestra que buscar en el broker para comprar de verdad un activo del
// universo, con el ISIN listo para pegar. El ISIN es el codigo que funciona en
// cualquier broker europeo; el ticker cambia segun la bolsa, asi que se ofrece
// como referencia pero lo que se copia es el ISIN.
export default function CodigoCompra({ symbol, compras, compacto = false }) {
  const c = compraFor(symbol, compras)
  const [copiado, setCopiado] = useState(false)

  async function copiar(e) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(c.isin)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      // Sin permiso de portapapeles: se selecciona para copiar a mano.
      const r = document.createRange()
      r.selectNodeContents(e.currentTarget.previousElementSibling)
      const sel = getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
    }
  }

  if (!c.isin) {
    return (
      <div className="compra pendiente">
        <span className="tag cash">sin ISIN</span>
        {!compacto && c.buscar && (
          <div className="name">
            busca «{c.buscar}» en tu bróker y pega el ISIN en Ajustes
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="compra">
      <div className="row" style={{ gap: 6 }}>
        {c.ticker && <span className="sym">{c.ticker}</span>}
        <span className="isin mono">{c.isin}</span>
        <button
          className="btn small"
          onClick={copiar}
          title="Copiar el ISIN para pegarlo en el buscador del bróker"
        >
          {copiado ? '✓ copiado' : 'copiar'}
        </button>
        {c.propio && <span className="tag" title="Lo has puesto tú">tuyo</span>}
      </div>
      {!compacto && c.nombre && <div className="name">{c.nombre}</div>}
      {!compacto && c.nota && <div className="name aviso">{c.nota}</div>}
    </div>
  )
}
