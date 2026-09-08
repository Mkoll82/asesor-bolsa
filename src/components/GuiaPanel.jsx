import { useMemo } from 'react'
import { compraFor, isinParaBuscar } from '../data/universe.js'
import { fmtDate, fmtEur } from '../lib/format.js'

// Guia de uso que se marca a si misma.
//
// No es un texto fijo: cada paso comprueba el estado real de la app, asi que
// dice lo que falta de verdad en lugar de repetir una lista generica. Un texto
// estatico se queda desfasado y no orienta; esto siempre sabe por donde vas.
export default function GuiaPanel({ settings, data, goTo }) {
  const { real, paper } = settings

  const estado = useMemo(() => {
    const reales = settings.universe.filter((s) => data?.[s]?.source === 'twelvedata').length
    const sinIsin = settings.universe.filter((s) => {
      const c = isinParaBuscar(s, settings.compras)
      return !c.confirmado && !compraFor(s, settings.compras).propio
    })
    const divisaRara = settings.universe.filter(
      (s) => data?.[s]?.source === 'twelvedata' && data[s].currency && data[s].currency !== 'USD'
    )
    return {
      reales,
      total: settings.universe.length,
      sinIsin,
      conIsin: settings.universe.length - sinIsin.length,
      divisaRara,
      opsSimuladas: paper.log.length,
      mesesSimulados: new Set(paper.log.map((o) => o.date.slice(0, 7))).size,
      valoraciones: (real.valoraciones || []).length,
      decisiones: (real.decisiones || []).length,
      claveOk: !!settings.apikey,
    }
  }, [settings, data, paper.log, real.valoraciones, real.decisiones])

  const pasos = [
    {
      n: 1,
      titulo: 'Traer los datos reales',
      hecho: estado.reales === estado.total,
      parcial: estado.reales > 0 && estado.reales < estado.total,
      tiempo: '2 minutos, una vez',
      ir: { vista: 'ajustes', texto: 'Ir a Ajustes' },
      cuerpo: estado.claveOk ? (
        <>
          Pulsa <b>«Actualizar datos»</b> arriba a la derecha. Tarda unos 60 segundos, porque el plan
          gratuito solo permite 8 peticiones por minuto. Sabrás que ha ido bien cuando la etiqueta naranja
          «en demo» se ponga verde: «reales».
        </>
      ) : (
        <>
          Primero necesitas una clave gratuita de <b>twelvedata.com</b> (plan Basic, sin tarjeta). Se pega
          en Ajustes y hay un botón para comprobarla. <b>Mientras no la tengas, todos los números que ves
          son series inventadas</b>: sirven para ver la app, no para decidir nada.
        </>
      ),
      resumen:
        estado.reales === estado.total
          ? `Los ${estado.total} activos tienen datos reales.`
          : estado.reales > 0
            ? `${estado.reales} de ${estado.total} con datos reales. El resto sigue en demostración.`
            : 'Todo en modo demostración: los números no valen para decidir.',
    },
    {
      n: 2,
      titulo: 'Mirar el backtest antes de tocar un euro',
      hecho: false,
      opcional: false,
      tiempo: '15 minutos, una vez',
      ir: { vista: 'backtest', texto: 'Ir al Backtest' },
      cuerpo: (
        <>
          Ahí ves qué habría hecho esta regla en los últimos años. Fíjate en tres cosas, y no en la
          primera:
          <ul>
            <li>
              <b>Peor caída</b>: cuánto habrías perdido en el peor momento. Si ese número te quita el
              sueño, esta regla no es para ti, y mejor saberlo ahora que dentro de un año.
            </li>
            <li>
              <b>Rentabilidad anual</b> comparada con la de SPY, que aparece debajo en gris. Si la regla
              no le gana a comprar y no tocar nada, todo esto no tiene sentido.
            </li>
            <li>
              <b>La tira de meses</b>: cuenta cuántos cuadraditos rojos hay seguidos. Eso es lo que
              tendrás que aguantar sin abandonar.
            </li>
          </ul>
          Y lee la última tarjeta, «Lo que este backtest no dice». Va en serio.
        </>
      ),
      resumen: 'Esto no se marca solo: es una lectura, no una tarea.',
    },
    {
      n: 3,
      titulo: 'Rellenar los códigos de compra',
      hecho: estado.sinIsin.length === 0,
      parcial: estado.conIsin >= 4 && estado.sinIsin.length > 0,
      tiempo: '20 minutos, una vez',
      ir: { vista: 'ajustes', texto: 'Ir a Ajustes' },
      cuerpo: (
        <>
          Los tickers con los que se calcula son de EE. UU. y <b>no los puedes comprar desde Europa</b>:
          la normativa PRIIPs se lo prohíbe a los minoristas. Hay que comprar el ETF equivalente europeo,
          que se identifica por su ISIN.
          <br />
          <br />
          En Ajustes cada activo ya trae un <b>candidato</b> con su ISIN, sacado de justETF. Sirve para
          buscarlo, no para fiarse: no existe un ETF europeo del mismo índice exacto, así que hay que
          elegir. Búscalo en tu bróker, comprueba que es lo que quieres y pega ahí el ISIN definitivo.
          <br />
          <br />
          <b>Empieza por cuatro o cinco</b>, no por los catorce: el S&P 500 y el Nasdaq vienen
          confirmados, añade el de Europa, el de oro y el de liquidez. El resto, cuando la señal los
          pida.
        </>
      ),
      resumen:
        estado.sinIsin.length === 0
          ? 'Todos los activos tienen un ISIN confirmado o puesto por ti.'
          : `${estado.conIsin} de ${estado.total} confirmados. Con candidato sin verificar: ${estado.sinIsin.join(', ')}.`,
    },
    {
      n: 4,
      titulo: 'Practicar con dinero de mentira',
      hecho: estado.mesesSimulados >= 3,
      parcial: estado.opsSimuladas > 0,
      tiempo: 'dos o tres meses',
      ir: { vista: 'simulador', texto: 'Ir al Simulador' },
      cuerpo: (
        <>
          Este es el paso que todo el mundo se salta y luego lamenta. En «Señal del mes» pulsa{' '}
          <b>«Ejecutar en el simulador»</b> y tendrás una cartera de {fmtEur(paper.startCapital)}{' '}
          ficticios comportándose como se comportaría la tuya.
          <br />
          <br />
          Repítelo cada mes. Cuando hayas visto la cartera bajar sin que se acabe el mundo, ya sabrás si
          aguantas la estrategia. No es lo mismo verlo en un gráfico del pasado que con tu nombre encima.
        </>
      ),
      resumen: estado.opsSimuladas
        ? `${estado.opsSimuladas} operaciones simuladas en ${estado.mesesSimulados} ${estado.mesesSimulados === 1 ? 'mes' : 'meses'} distintos.`
        : 'Sin operaciones simuladas todavía.',
    },
    {
      n: 5,
      titulo: 'Cuando ya inviertas de verdad',
      hecho: estado.valoraciones >= 2,
      parcial: estado.valoraciones === 1,
      tiempo: 'un número al mes',
      ir: { vista: 'real', texto: 'Ir a Cartera real' },
      cuerpo: (
        <>
          Apunta la aportación y, cada mes, el saldo total que te muestre el bróker. Con eso la app
          calcula tu rentabilidad <b>de verdad</b>: si aportas 500 €, no lo cuenta como ganancia, que es
          el error en el que caen casi todas las hojas de cálculo.
          <br />
          <br />
          A partir de la segunda valoración aparecen solas dos cosas: tu curva frente a la de seguir la
          regla a ciegas, y cuánto te ha costado el envoltorio europeo frente a la estrategia pura.
        </>
      ),
      resumen:
        estado.valoraciones >= 2
          ? `${estado.valoraciones} saldos apuntados. Último: ${fmtDate((real.valoraciones || []).at(-1)?.date)}.`
          : estado.valoraciones === 1
            ? 'Un saldo apuntado. Con el segundo ya se puede medir la rentabilidad.'
            : 'Sin saldos apuntados: normal si aún no has invertido.',
    },
  ]

  return (
    <>
      <div className="card">
        <h2>Qué es esto</h2>
        <p className="hint" style={{ marginBottom: 0 }}>
          Una calculadora con memoria, no un gestor automático. <b>No invierte por ti</b> y no se conecta
          a ningún bróker: no te va a pedir nunca las claves de tu cuenta. Aplica una regla escrita, te
          dice qué cartera tocaría tener este mes, y guarda lo que decidas hacer para poder medir después
          si funcionó. Comprar y vender lo haces tú, a mano, en tu bróker.
        </p>
      </div>

      <div className="card">
        <h2>La regla, en una frase</h2>
        <p className="hint" style={{ marginBottom: 0 }}>
          Una vez al mes: de tus {estado.total} activos, se queda con los {settings.cfg.topN} que más han
          subido en los últimos 3, 6 y 12 meses, y descarta los que estén por debajo de su media de{' '}
          {settings.cfg.trendPeriod} sesiones mandando ese dinero a liquidez. Pesos iguales. Y hasta el
          mes siguiente no se toca nada.
        </p>
      </div>

      {estado.divisaRara.length > 0 && (
        <div className="banner">
          Atención: {estado.divisaRara.join(', ')} ha llegado en una divisa que no es el dólar. Puede que
          el proveedor haya devuelto el listado de otra bolsa. Revísalo en Ajustes antes de fiarte de la
          señal.
        </div>
      )}

      {pasos.map((p) => (
        <div className="card" key={p.n}>
          <div className="spread">
            <h2>
              <span className="paso-n">{p.n}</span> {p.titulo}
            </h2>
            <div className="row">
              <span className="muted small">{p.tiempo}</span>
              {p.hecho ? (
                <span className="pill ok">hecho</span>
              ) : p.parcial ? (
                <span className="pill warn">a medias</span>
              ) : (
                <span className="pill">pendiente</span>
              )}
              {p.ir && (
                <button className="btn small" onClick={() => goTo(p.ir.vista)}>
                  {p.ir.texto}
                </button>
              )}
            </div>
          </div>
          <div className="guia-cuerpo">{p.cuerpo}</div>
          <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
            <b>Tu situación:</b> {p.resumen}
          </p>
        </div>
      ))}

      <div className="card">
        <h2>La rutina mensual, que es todo lo que hay que hacer</h2>
        <p className="hint">El último día hábil del mes, o el primero del siguiente. Cinco minutos.</p>
        <ol className="guia-cuerpo" style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li>
            Abre <b>Señal del mes</b>. Arriba está la cartera objetivo.
          </li>
          <li>
            ¿Es la misma que el mes pasado? <b>No hagas nada.</b> Es lo más frecuente, y no hacer nada es
            una decisión correcta.
          </li>
          <li>
            ¿Ha cambiado? La tabla de órdenes dice qué vender y qué comprar, con el ISIN y un botón de
            copiar. Lo pegas en el buscador del bróker y ejecutas.
          </li>
          <li>
            Marca la señal: <b>seguida</b>, <b>modificada</b> o <b>ignorada</b>. Si te la saltas, escribe
            por qué; el diario luego te dirá si tus corazonadas suman o restan.
          </li>
          <li>
            En <b>Cartera real</b>, apunta el saldo que te muestre el bróker.
          </li>
        </ol>
      </div>

      <div className="card">
        <h2>Lo que NO hay que hacer</h2>
        <p className="hint">Esto importa más que ningún parámetro de la regla.</p>
        <ul className="guia-cuerpo" style={{ paddingLeft: 20, lineHeight: 1.9, margin: 0 }}>
          <li>
            <b>No mires la app entre medias.</b> Si entras un martes cualquiera verás un aviso de que «con
            los precios de hoy la regla elegiría otra cosa». Está marcado como informativo a propósito: la
            decisión es a fin de mes, y adelantarse es exactamente cómo se estropea una estrategia que
            funciona.
          </li>
          <li>
            <b>No toques los parámetros mirando el resultado del backtest.</b> Cada vez que subes o bajas
            el número de posiciones porque así sale una cifra más bonita, estás ajustando la regla al
            pasado. Eso no se repite en el futuro.
          </li>
          <li>
            <b>No te fíes de un ISIN que no hayas visto en tu bróker.</b> Un ISIN equivocado es comprar
            otra cosa. En la app solo vienen rellenos los dos que se pueden garantizar.
          </li>
          <li>
            <b>No empieces con dinero real sin haber pasado por el simulador.</b> El paso 4 existe por
            algo.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Y una advertencia que no es de trámite</h2>
        <p className="hint" style={{ marginBottom: 0 }}>
          Esto no es asesoramiento financiero. Las señales son el resultado mecánico de las reglas que tú
          configuras, calculadas sobre datos que pueden tener errores. El backtest mira un tramo corto de
          historia y no incluye impuestos ni deslizamiento. Los resultados pasados no anticipan los
          futuros, y el dinero que metas puede valer menos cuando lo saques. Las decisiones y el riesgo
          son tuyos.
        </p>
      </div>
    </>
  )
}
