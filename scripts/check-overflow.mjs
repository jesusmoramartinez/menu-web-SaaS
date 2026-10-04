/**
 * Detecta scroll horizontal (la barra blanca / la web cortada en celulares angostos).
 *
 *   npm run dev            # en otra terminal
 *   npm run check:overflow
 *
 * Compara `documentElement.scrollWidth` con el ancho del viewport en varias anchuras y, si
 * se pasa, lista los elementos culpables. Ignora los que están dentro de un contenedor con
 * overflow-x (ésos scrollean a propósito y no rompen la página).
 *
 * Existe porque este bug no se ve leyendo el código: el desborde lo causa el ancho
 * *intrínseco* de un texto o un input, que depende de la fuente y del contenido real.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const BASE = process.env.CHECK_URL ?? 'http://localhost:5173'
const PORT = 9333
const WIDTHS = [320, 360, 390, 412, 768]
const ROUTES = ['/', '/login', '/registro', '/demo/m/demo-mesa-04', '/demo/mozo', '/demo/cocina', '/demo/admin']

const CHROME = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'].find(existsSync)
if (!CHROME) {
  console.error('✘ No encontré Chromium/Chrome. Instalá uno o exportá CHROME_PATH.')
  process.exit(1)
}

const EXPR = `(() => {
  const vw = document.documentElement.clientWidth;
  const clipped = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
    }
    return false;
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (clipped(el)) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').replace(/\\s+/g, ' ').slice(0, 100),
      txt: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
      w: Math.round(r.width), right: Math.round(r.right),
    });
  }
  return JSON.stringify({ vw, scrollWidth: document.documentElement.scrollWidth, offenders: out.slice(0, 8) });
})()`

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let ws
let nextId = 0
const call = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => reject(new Error(`timeout en ${method}`)), 20_000)
    const onMsg = (e) => {
      const m = JSON.parse(e.data)
      if (m.id !== id) return
      clearTimeout(timer)
      ws.removeEventListener('message', onMsg)
      resolve(m.result)
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

let failed = 0
try {
  // Esperar a que Chrome levante el endpoint de depuración
  let version
  for (let i = 0; i < 40 && !version; i++) {
    try {
      version = await (await fetch(`http://localhost:${PORT}/json/version`)).json()
    } catch {
      await sleep(250)
    }
  }
  if (!version) throw new Error('Chrome no respondió en el puerto de depuración')

  try {
    await fetch(BASE)
  } catch {
    throw new Error(`No hay nada escuchando en ${BASE}. Levantá el dev server con \`npm run dev\`.`)
  }

  ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))

  for (const width of WIDTHS) {
    console.log(`\n── ${width}px ──`)
    for (const route of ROUTES) {
      const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
      const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
      await call('Emulation.setDeviceMetricsOverride', { width, height: 820, deviceScaleFactor: 1, mobile: true }, sessionId)
      await call('Page.enable', {}, sessionId)
      await call('Page.navigate', { url: BASE + route }, sessionId)
      await sleep(3000)
      const res = await call('Runtime.evaluate', { expression: EXPR, returnByValue: true }, sessionId)
      const { vw, scrollWidth, offenders } = JSON.parse(res.result.value)
      const over = scrollWidth - vw
      if (over > 0) {
        failed++
        console.log(`  ✘ ${route} — se pasa ${over}px (scrollWidth ${scrollWidth} vs ${vw})`)
        for (const o of offenders) console.log(`      <${o.tag}> w=${o.w} "${o.txt}"  .${o.cls}`)
      } else {
        console.log(`  ✔ ${route}`)
      }
      await call('Target.closeTarget', { targetId })
    }
  }
} catch (e) {
  console.error(`\n✘ ${e.message}`)
  failed++
} finally {
  ws?.close()
  chrome.kill()
}

console.log(failed === 0 ? '\n✔ Sin scroll horizontal en ninguna ruta/ancho.' : `\n✘ ${failed} caso(s) con scroll horizontal.`)
process.exit(failed === 0 ? 0 : 1)
