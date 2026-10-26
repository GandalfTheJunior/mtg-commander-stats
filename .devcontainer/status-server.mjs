import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const codespace = process.env.CODESPACE_NAME
if (!codespace || !/^[a-z0-9-]+$/.test(codespace)) {
  throw new Error('A valid CODESPACE_NAME is required')
}
const appUrl = `https://${codespace}-5173.app.github.dev/`
const statusFile = join(homedir(), '.local/state/mtg-commander-stats/startup-status.txt')

const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char])

async function responds(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('ok')
    return
  }
  if (req.url !== '/' && req.url !== '/index.html') {
    res.writeHead(404).end()
    return
  }

  const [frontend, backend, phase] = await Promise.all([
    responds('http://127.0.0.1:5173/'),
    responds('http://127.0.0.1:8080/api/csrf'),
    readFile(statusFile, 'utf8').then((value) => value.trim()).catch(() => 'Start wird vorbereitet')
  ])
  const ready = frontend && backend
  const badge = (ok) => ok ? 'Bereit' : 'Noch nicht erreichbar'
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
  })
  res.end(`<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10"><title>Codespaces-Vorschau: Status</title>
<style>body{font:17px/1.5 system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#202124}
h1{font-size:1.55rem}section{border:1px solid #ddd;border-radius:12px;padding:16px;margin:18px 0}
p{margin:9px 0}strong{font-weight:650}.ok{color:#167345}.pending{color:#995100}
a{color:#1255b4;word-wrap:break-word}small{color:#555}</style></head><body>
<h1>MTG Commander Stats – Vorschau</h1>
<p>${ready ? 'Die Anwendung ist erreichbar.' : 'Die Vorschau wird vorbereitet oder benötigt Aufmerksamkeit.'}</p>
<section><p><strong>Frontend:</strong> <span class="${frontend ? 'ok' : 'pending'}">${badge(frontend)}</span></p>
<p><strong>Backend:</strong> <span class="${backend ? 'ok' : 'pending'}">${badge(backend)}</span></p>
<p><strong>Letzter Startschritt:</strong> ${escapeHtml(phase)}</p></section>
<p><a href="${appUrl}">${ready ? 'Anwendung jetzt öffnen' : 'Anwendungslink (möglicherweise noch nicht bereit)'}</a></p>
<p><small>Diese Seite aktualisiert sich alle 10 Sekunden. Wenn ein Fehler dauerhaft angezeigt wird, genügt es, den Startschritt zu nennen. Keine Passwörter oder Tokens teilen.</small></p>
</body></html>`)
})

server.listen(5174, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] status-server pid=${process.pid} listening on HTTP 5174`)
})
