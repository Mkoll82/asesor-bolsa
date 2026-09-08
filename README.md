# Asesor de bolsa

Panel personal para decidir inversiones con una regla escrita, no con intuición. Funciona entero en el
navegador: no hay servidor, no hay base de datos y ningún dato sale de tu ordenador.

**No es asesoramiento financiero.** Las señales son el resultado mecánico de las reglas que configuras.
Los resultados pasados no anticipan los futuros.

## Qué hace

| Pestaña | Para qué sirve |
|---|---|
| **Señal del mes** | Ordena el universo por momentum, aplica el filtro de tendencia y te dice la cartera objetivo. Un botón la ejecuta en el simulador. |
| **Simulador** | Cartera ficticia con 10.000 € de partida: posiciones, liquidez, comisiones, curva de resultados frente a comprar y mantener, y registro de operaciones. |
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
npm test          # 24 pruebas del motor: indicadores, backtest y contabilidad del simulador
npm run build     # genera dist/ como sitio estático
```

## Datos reales

Regístrate gratis en [twelvedata.com](https://twelvedata.com/pricing) (plan Basic) y pega la clave en
**Ajustes**. Se guarda en `localStorage`, solo en tu navegador.

Se eligió Twelve Data porque **responde con `access-control-allow-origin: *`**, que es lo que permite que
esta app viva sin backend. Yahoo Finance no manda cabeceras CORS y contesta 429 desde el navegador;
Stooq tampoco trae CORS. Alpha Vantage sirve de alternativa, pero su plan gratuito da 25 peticiones al
día frente a 800.

Límites del plan gratuito y cómo se manejan:

- **8 peticiones por minuto** → las descargas van en lotes de 8 con una espera de 61 s entre lotes.
  Actualizar los 14 activos tarda unos 60 s.
- **800 peticiones al día** → los históricos se guardan en IndexedDB y solo se piden cuando lo pides tú.
- El universo por defecto usa **ETFs cotizados en EE. UU.** (VGK, EWP, EFA para exposición europea)
  porque son los que cubre el plan gratuito.

## Estructura

```
src/lib/indicators.js   SMA, EMA, RSI, MACD, ATR, drawdown, volatilidad
src/lib/series.js       alineado de calendarios, cierres de mes
src/lib/momentum.js     puntuación, ranking, cartera objetivo, amplitud de mercado
src/lib/backtest.js     motor de rebalanceo mensual
src/lib/paper.js        contabilidad del simulador (se reconstruye del registro de operaciones)
src/data/               proveedor, caché IndexedDB, universo, generador de demo
src/components/         una pestaña por archivo, más un gráfico SVG propio sin dependencias
```

El estado del simulador **no se guarda**: se recalcula reproduciendo el registro de operaciones sobre
los precios históricos. Así la curva es correcta aunque no abras la app en semanas, y cualquier cifra se
puede rastrear hasta las operaciones que la produjeron.

## Publicar

`npm run build` genera `dist/`, que es un sitio estático. No hace falta Firebase ni ningún backend: se
puede subir a cualquier hosting estático arrastrando la carpeta. Si lo publicas, ten en cuenta que
cualquiera con el enlace vería la interfaz (los datos y la clave siguen siendo de cada navegador, porque
viven en `localStorage`).

## Lo que no hace

- No incluye impuestos ni deslizamiento, y los dividendos solo cuentan si el proveedor da precios
  ajustados.
- No hay fundamentales (PER, dividendo, deuda) ni noticias.
- No opera: no se conecta a ningún bróker, y no está previsto que lo haga.
