# Notas para retomar el proyecto

Contexto que no se deduce del código ni del historial de git. Léelo antes de tocar nada.

## Qué es

Panel personal de decisión de inversión. Aplica una regla de momentum mensual sobre un universo de
ETFs, dice qué cartera tocaría tener, y guarda lo que el usuario decida hacer para medir después si
funcionó. **No invierte, no se conecta a ningún bróker y no pide credenciales de bróker.**

Usuario: Carlos (`Mkoll82` en GitHub), inversor particular en España, sin experiencia previa en esto.
Habla castellano. Nuevo en inversión: las explicaciones tienen que asumir eso.

- Repo: `https://github.com/Mkoll82/asesor-bolsa` (privado, rama `main`)
- Producción: `https://asesor-bolsa-rosy.vercel.app`

## Arrancar y desplegar

```bash
npm install
npm run dev      # puerto 5178
npm test         # 58 pruebas del motor, node:test
npm run build
```

Vercel construye en cada push a `main`. El despliegue tarda entre 30 s y 3 minutos; se comprueba
mirando si el hash del bundle en producción coincide con el de `dist/`.

En este portátil **no hay CLI de Vercel ni `gh`**, y no se pueden instalar sin admin. Las credenciales
de git sí están en Git Credential Manager y `git push` funciona sin pedir nada. **Crear repos nuevos en
GitHub lo tiene que hacer el usuario a mano**, igual que importar el proyecto en Vercel la primera vez.

## Decisiones ya tomadas (no volver a discutirlas)

- **Sin backend.** Elegido por el usuario a sabiendas del problema de CORS. Todo vive en el navegador:
  `localStorage` para ajustes y carteras, IndexedDB para los históricos de precios.
- **Regla núcleo**: momentum mensual (media de rentabilidades a 3/6/12 meses, top 3, filtro de precio
  sobre la SMA200, el resto a liquidez) **más** indicadores técnicos como capa de ejecución **más**
  backtest. Fundamentales y noticias quedaron aparcados para una v2.
- **Simulador antes que dinero real.** El usuario lo pidió explícitamente.
- **Se calcula con tickers de EE. UU. y se compra el equivalente UCITS.** Ver más abajo.
- **Dos brókeres**: Trade Republic y Revolut, para comparar.

## Hechos verificados (con fuente, no de memoria)

Todo esto está comprobado. No lo vuelvas a suponer ni lo cambies sin volver a comprobarlo.

**Proveedor de datos: Twelve Data, plan Basic gratuito.**
- Se eligió porque es el único gratuito que devuelve `access-control-allow-origin: *`. Yahoo Finance no
  manda cabeceras CORS y responde 429 desde el navegador; Stooq y FRED tampoco traen CORS. Alpha
  Vantage vale de alternativa pero da 25 peticiones/día frente a 800.
- Límites confirmados en su tarifario: **8 peticiones/minuto, 800/día, solo 3 mercados** (acciones y
  ETFs de EE. UU., divisas y cripto). De ahí que el universo sean tickers americanos.
- La clave va en la cabecera `Authorization: apikey ...`, que es el método que recomienda su
  documentación. Comprobado que su preflight de CORS declara `Access-Control-Allow-Headers` con
  `Authorization`, que es lo que lo hace viable sin backend.
- `time_series` acepta `country`, `exchange` y `mic_code`. **Se fija `country=United States` y no se
  debe quitar**: los 14 tickers tienen homónimos en México, Argentina, Chile y otros (hay un SPY en
  pesos argentinos, un GLD en Sudáfrica y Tailandia, un BIL en India y Jamaica). Sin acotar, el
  proveedor podría devolver cualquiera de ellos, en su divisa, y nada lo delataría.
- Los endpoints `symbol_search` y `etf` funcionan **sin clave y sin gastar cuota**: sirven para validar
  tickers antes de quemar peticiones del usuario.

**Normativa: PRIIPs.**
Exige un KID en un idioma oficial de la UE, y las gestoras estadounidenses no lo emiten. Por eso un
minorista europeo **no puede comprar SPY, QQQ, GLD ni ningún ETF domiciliado en EE. UU.** Hay que usar
el equivalente UCITS. Esta es la razón de que el universo tenga dos capas: el ticker con el que se
calcula y el ISIN con el que se compra.

**Códigos de compra (justETF, consultado el 2026-09-08).**
Dos niveles de confianza, y la distinción es real, no cosmética:
- **Confirmado** (solo SPY y QQQ): el ETF europeo replica el mismo índice. No es opinable.
- **Candidato** (los otros 12): no existe un UCITS del mismo índice y hay que *elegir*. DBC sigue el
  DBIQ Optimum Yield y el candidato el Bloomberg Commodity; EFA sigue el MSCI EAFE y el candidato el
  MSCI World ex USA, que incluye Canadá; BIL son letras en dólares y el candidato renta el tipo a un
  día en euros. Cada uno lleva una nota explicando en qué se desvía.

**Tarifas.** Trade Republic: 1 € fijo por orden, tarifa pública y estable. **Revolut: no se pudo
encontrar su tarifario de inversión** — las páginas de comisiones de cada plan (incluida Metal) cubren
solo la parte bancaria, y la inversión la presta Revolut Securities Europe UAB con documentación que no
está publicada en la web española. Está marcada como «sin verificar» y es editable. El usuario tiene
cuenta **Metal**. No inventar cifras.

## Convenciones de código

- **Cero dependencias más allá de React.** Los indicadores, el gráfico SVG y todo el motor son propios.
  No añadas librerías de charting ni de indicadores técnicos.
- **Interfaz en castellano con acentos correctos. Comentarios y nombres de código en castellano sin
  acentos** (para no depender de la codificación del archivo). Los identificadores mezclan castellano e
  inglés según lo que ya haya en el archivo; sigue el estilo del vecindario.
- Los comentarios explican **por qué**, no qué. El código está lleno de decisiones que parecen
  arbitrarias y no lo son (el `country`, la reserva de comisiones a dos pasadas, los tres estados de
  disponibilidad). Si borras esos comentarios, alguien las revertirá.
- **Cada cifra que se muestra al usuario tiene que ser defendible.** Si un dato no está verificado, la
  interfaz lo dice. Ese es el principio de diseño central de la app.
- El estado de las carteras **no se guarda: se reconstruye** reproduciendo el registro de operaciones
  sobre los precios históricos. No introduzcas estado derivado almacenado.
- Los mensajes de commit van en castellano sin acentos, explican el porqué del cambio y admiten cuando
  algo medido sale peor de lo esperado.

## Estructura

```
src/lib/indicators.js   SMA, EMA, RSI, MACD, ATR, drawdown, volatilidad
src/lib/series.js       alineado de calendarios distintos, cierres de mes
src/lib/momentum.js     DEFAULT_CFG, puntuación, ranking, cartera objetivo, amplitud
src/lib/backtest.js     rebalanceo mensual, comisiones, banda de tolerancia
src/lib/paper.js        contabilidad del simulador
src/lib/real.js         cartera real: TWR con flujos, estimación por proxy, diario
src/lib/brokers.js      coste por orden y comparativa
src/data/universe.js    los 14 activos, sus ISIN UCITS y las guardas de validación
src/data/twelvedata.js  proveedor
src/components/         una pestaña por archivo, más Chart.jsx y CodigoCompra.jsx
```

`DEFAULT_CFG` en `momentum.js` es la fuente de verdad de la regla. `cfg.excluidos` **se deriva** en
`App.jsx` de la matriz de disponibilidad por bróker; no lo escribas directamente.

## Errores que ya se cometieron (no repetirlos)

1. **Vender más títulos de los que hay creaba dinero.** El abono a caja usaba las unidades pedidas en
   vez de las realmente cerradas. Hay prueba que lo cubre.
2. **Comisión fantasma el último día del backtest**, por tratar el último dato disponible como cierre
   de mes. De ahí `includeIncompleteLast`.
3. **Liquidez negativa** al invertir el 100%: no se reservaban las comisiones. De ahí el cálculo a dos
   pasadas en `ordersToReach`.
4. **«58 cambios de 58 revisiones»**: se contaba cualquier reajuste de pesos como cambio de cartera.
   Engañoso.
5. **Anualizar cinco meses** de historial daba un 37% que no significaba nada. Ahora no se anualiza sin
   un año de datos.
6. **Un ISIN mal atribuido**: se dio `IE0032077012` como el iShares CNDX del Nasdaq y en realidad es el
   Invesco EQQQ, que además reparte dividendos. El correcto es `IE00B53SZB19`. Por eso ahora las
   pruebas validan el dígito de control de todos los ISIN y `revisarIsin()` avisa si pegas el código de
   otro activo de la lista, que es el error silencioso y caro.
7. **La app recomendaba activos que el bróker no vende.** Una regla así te bloquea el mes que los
   elige. De ahí la matriz de disponibilidad.

Patrón: casi todos salieron de escribir una prueba, no de leer el código. Cuando toques dinero,
escribe la prueba primero.

## Estado actual y qué falta

Terminado y desplegado: la regla, el backtest, el simulador, la cartera real con TWR, los códigos
UCITS, la comparativa de comisiones, la guía «Empezar aquí» y la matriz de disponibilidad por bróker.
58 pruebas en verde.

**Pendiente, y depende del usuario:**
1. Pulsar «Actualizar datos» con su clave (ya la tiene y funciona) para pasar de series sintéticas a
   datos reales. **Nada de lo que se ve ahora significa nada hasta entonces.**
2. Revisar el backtest con datos reales, sobre todo 2022. Es la prueba de fuego: si el filtro de la
   SMA200 no le sacó a tiempo cuando cayeron bolsa y bonos a la vez, hay que replantear la regla.
3. Comprobar disponibilidad en sus brókeres. Lo averiguado hasta ahora:
   - `IE00BD6FTQ80` (materias primas): **no** está en Trade Republic ni en Revolut.
   - `LU0592216393` (España): **sí** en Trade Republic, **no** en Revolut. Cotiza a unos 65,4 €.
   - Pendiente y **es el que importa**: `IE00B4ND3602` (oro). Medido sobre datos sintéticos, quitar
     DBC no cambia casi nada, pero quitar el oro empeora la peor caída del −16,5% al −26,5%: es la
     única pata defensiva del universo. Si tampoco está disponible, hay que replantear el universo
     antes de invertir.
   - Prueba decisiva para Revolut: buscar `IE00B5BMR087` (el ETF del S&P 500, 134.000 M€). Si no está
     ni ese, Revolut queda descartado y se abandona la comparativa de brókeres.
4. Poner la tarifa real de inversión de Revolut Metal desde su app.

**Ideas descartadas o aparcadas**, para no volver a proponerlas: Firebase (no hay backend que
justifique nada suyo, y en la red de TYPSA Firestore está bloqueado por QUIC); sincronizar entre
dispositivos (hoy cada navegador tiene su estado, y eso es aceptable); fundamentales y noticias (v2).

## Aviso permanente

La app lleva un descargo en el pie y no se toca: no es asesoramiento financiero, las señales son el
resultado mecánico de las reglas que el usuario configura, y los resultados pasados no anticipan los
futuros. Al hablar con el usuario, explicar la mecánica de la regla está bien; decirle qué comprar, no.
