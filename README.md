# Asesor de bolsa

Panel personal para decidir inversiones con una regla escrita, no con intuición. Funciona entero en el
navegador: no hay servidor, no hay base de datos y ningún dato sale de tu ordenador.

**No es asesoramiento financiero.** Las señales son el resultado mecánico de las reglas que configuras.
Los resultados pasados no anticipan los futuros.

## Qué hace

| Pestaña | Para qué sirve |
|---|---|
| **Empezar aquí** | Guía de uso que se marca a sí misma: cada paso comprueba el estado real de la app y dice qué falta. Es la pantalla de entrada mientras no haya clave ni datos descargados. |
| **Señal del mes** | Ordena el universo por momentum, aplica el filtro de tendencia y te dice la cartera objetivo. Un botón la ejecuta en el simulador. |
| **Simulador** | Cartera ficticia con 10.000 € de partida: posiciones, liquidez, comisiones, curva de resultados frente a comprar y mantener, y registro de operaciones. |
| **Cartera real** | Lo que de verdad hay en tu bróker: operaciones ejecutadas, aportaciones y retiradas, el saldo que apuntas cada mes, y el diario de si seguiste la señal o no. |
| **Ficha de activo** | Precio con SMA 50/200, RSI 14, MACD 12-26-9, ATR y rentabilidades a 1/3/6/12 meses. |
| **Backtest** | Prueba la regla sobre el histórico disponible: rentabilidad anual, peor caída, rotación, mes a mes y qué cartera habría tenido en cada cierre de mes. |
| **Ajustes** | API key, universo, ventanas de momentum, exportar/importar y vaciar caché. |

## La regla

1. Cada **último día hábil del mes**, se calcula para cada activo la media de sus rentabilidades a
   **3, 6 y 12 meses**.
2. Se ordenan de mayor a menor y se toman los **3 primeros**.
3. Filtro de seguridad: un activo solo entra si cotiza **por encima de su media de 200 sesiones**. El
   hueco que deja va a **liquidez** (BIL, letras a 1-3 meses).
4. Pesos iguales entre los elegidos. Se revisa una vez al mes y nada más.

Todos los parámetros se cambian en la pestaña Backtest, y lo que cambies ahí afecta también a la señal:
el backtest prueba exactamente la regla que después te dice qué comprar.

## Arrancar

```bash
npm install
npm run dev
```

Abre http://localhost:5178. Sin API key funciona con **series sintéticas** (deterministas, con un factor
de mercado común para que las correlaciones sean realistas): sirve para ver la app entera, no para
decidir nada.

```bash
npm test          # 42 pruebas del motor: indicadores, backtest, comisiones y contabilidad
npm run build     # genera dist/ como sitio estático
```

## Medir la rentabilidad real

Aquí hay dos preguntas distintas que dan números distintos, y la app calcula las dos:

- **¿Funcionó la estrategia?** Rentabilidad ponderada por tiempo (TWR), que aísla el efecto de tus
  aportaciones. Es la única comparable con el backtest o con un índice.
- **¿Cuánto he ganado?** Valor actual menos lo aportado más lo retirado, en euros. Es la que nota tu
  bolsillo.

La distinción no es pedantería: si tienes 10.000 €, aportas 5.000 y el bróker marca 15.600, dividir
15.600 entre 10.000 da un 56% que no has ganado. El cálculo correcto es un 3,4%. Cualquier hoja de
cálculo que no descuente los flujos te miente en cuanto haces la primera aportación.

Como el ETF UCITS que compras no está en los datos, el saldo lo aportas tú: un número al mes. A cambio,
la app compara tu curva real con tres cosas: la regla seguida a ciegas desde el día que empezaste, la
estimación de la estrategia pura sobre tu dinero, y la diferencia entre ambas, que es lo que cuesta el
envoltorio UCITS y la divisa.

## Qué comprar de verdad

El universo son ETFs de EE. UU. y sirven para **calcular**. No los puedes **comprar**: la normativa
PRIIPs exige un KID en un idioma de la UE y las gestoras estadounidenses no lo emiten, así que ni Trade
Republic ni Revolut te venden SPY o QQQ. Hay que usar el equivalente UCITS.

Cada activo lleva su ISIN UCITS con un botón de copiar, listo para pegar en el buscador del bróker.
Solo vienen rellenos los dos que se pueden garantizar (CSPX y CNDX); el resto trae un término de
búsqueda y el ISIN vacío, porque un ISIN inventado es comprar otra cosa. Se pegan en Ajustes.

La app también compara el coste de cada rebalanceo entre brókeres, con la tarifa como fijo más
porcentaje. La de Trade Republic (1 € por orden) es pública y estable; la de Revolut depende del plan,
así que viene marcada como sin verificar y es editable.

## Datos reales

Regístrate gratis en [twelvedata.com](https://twelvedata.com/pricing) (plan Basic, sin tarjeta) y pega
la clave en **Ajustes**. Hay un botón «Probar la clave» que gasta una sola petición y te dice si
funciona, con el mensaje literal de Twelve Data si la rechaza.

La clave se guarda en `localStorage`, solo en tu navegador, y viaja en la cabecera `Authorization` que
recomienda su documentación, no en la URL: así no queda escrita en el historial del navegador. Su
preflight de CORS admite esa cabecera, que es lo que hace viable usarla sin backend.

Se eligió Twelve Data porque **responde con `access-control-allow-origin: *`**, que es lo que permite que
esta app viva sin backend. Yahoo Finance no manda cabeceras CORS y contesta 429 desde el navegador;
Stooq tampoco trae CORS. Alpha Vantage sirve de alternativa, pero su plan gratuito da 25 peticiones al
día frente a 800.

Límites del plan gratuito y cómo se manejan:

- **8 peticiones por minuto** → las descargas van en lotes de 8 con una espera de 61 s entre lotes.
  Actualizar los 14 activos tarda unos 60 s.
- **800 peticiones al día** → los históricos se guardan en IndexedDB y solo se piden cuando lo pides tú.
- **Solo 3 mercados** en el plan Basic: acciones y ETFs de EE. UU., divisas y cripto. De ahí que el
  universo sean tickers americanos (VGK, EWP, EFA cubren la exposición europea desde bolsas de EE. UU.).

## Estructura

```
src/lib/indicators.js   SMA, EMA, RSI, MACD, ATR, drawdown, volatilidad
src/lib/series.js       alineado de calendarios, cierres de mes
src/lib/momentum.js     puntuación, ranking, cartera objetivo, amplitud de mercado
src/lib/backtest.js     motor de rebalanceo mensual
src/lib/paper.js        contabilidad del simulador (se reconstruye del registro de operaciones)
src/lib/real.js         cartera real: rentabilidad con flujos, estimación por proxy, diario
src/lib/brokers.js      coste por orden y comparativa entre brókeres
src/data/               proveedor, caché IndexedDB, universo con ISIN UCITS, generador de demo
src/components/         una pestaña por archivo, más un gráfico SVG propio sin dependencias
                        GuiaPanel.jsx es la guía de uso, y comprueba el estado en vez de narrarlo
```

El estado del simulador **no se guarda**: se recalcula reproduciendo el registro de operaciones sobre
los precios históricos. Así la curva es correcta aunque no abras la app en semanas, y cualquier cifra se
puede rastrear hasta las operaciones que la produjeron.

## Publicar

Desplegado en https://asesor-bolsa-rosy.vercel.app. Vercel construye en cada push a `main` y detecta
Vite solo; `vercel.json` solo añade la reescritura de rutas al índice. No hace falta backend de ningún
tipo.

Cualquiera con el enlace ve la interfaz, pero no tus datos: la API key, los ISIN, el simulador y la
cartera real viven en el `localStorage` de tu navegador y nunca salen de ahí. El precio de eso es que
**no se sincronizan entre dispositivos**: si abres la app en el móvil, empieza vacía. Exporta desde
Ajustes para llevártelos.

## Lo que no hace

- No incluye impuestos ni deslizamiento, y los dividendos solo cuentan si el proveedor da precios
  ajustados.
- No hay fundamentales (PER, dividendo, deuda) ni noticias.
- No opera: no se conecta a ningún bróker, y no está previsto que lo haga.
