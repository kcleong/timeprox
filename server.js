const fetch = require('node-fetch')
const http = require('http')

const port = 3000
const year = 1998
const proxyName = 'timeprox'

process.on('uncaughtException', e => { console.error(e) })
process.on('unhandledRejection', e => { throw e })

const pad = v => `${v.toString().length === 1 ? '0' : ''}${v}`

const formatOffset = date => {
  const offset = date.getTimezoneOffset()
  const p = offset < 0 ? '+' : '-'
  const h = pad(Math.floor(Math.abs(offset) / 60))
  const m = pad(Math.abs(offset) % 60)
  return `${p}${h}:${m}`
}

const formatDate = (date = new Date()) => {
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const n = pad(date.getMinutes())
  const s = pad(date.getSeconds())
  const z = `${formatOffset(date)}`
  return `${y}-${m}-${d}T${h}:${n}:${s}${z}`
}

const log = msg => {
  console.log(`[${formatDate()}] ${msg}`)
}

const arcUrl = url => {
  const { pathname } = new URL(url)
  return /^\/web\/\d+(im_)?\//.test(pathname)
    ? `https://web.archive.org${pathname}`
    : `https://web.archive.org/web/${year}0101/${url}`
}

const filterBody = body => body
  .replace(/https?:\/\/web\.archive\.org/g, '')
  .replace(/\/web\/\d+(im_)?\/?/g, '')
  .replace(/^[\s\t\r\n]+</i, '<')
  .replace(/(<head[^>]*>)(.|[\r\n])*<!-- End Wayback Rewrite JS Include -->/i, '$1')
  .replace(/(<html[^>]*>)(.|[\r\n])*<!-- End Wayback Rewrite JS Include -->/i, '$1')

const isStartOf = (substr, str) => str.toString().slice(0, substr.length) === substr

const isFetchResText = fetchRes => {
  const contentType = fetchRes.headers.raw()['content-type']
  return !!['text/html', 'text/plain']
    .find(type => isStartOf(type, contentType))
}

const isFetchResTs404 = fetchRes => fetchRes.headers.raw()['x-ts'][0] === '404'

const isFetchResYear = (setYear, fetchRes) => isStartOf(
  `/web/${setYear}`, (new URL(fetchRes.url)).pathname,
)

const setHeaders = (fetchRes, req, res) => {
  const headers = fetchRes.headers.raw()

  Object.keys(headers).forEach(name => {
    if (['content-encoding', 'link', 'transfer-encoding'].includes(name)) return
    if ([/^x-archive-(?!orig)/].find(r => r.test(name))) return
    res.setHeader(name.replace(/^x-archive-orig-/, ''), headers[name])
    res.setHeader(`x-${proxyName}-archive-url`, fetchRes.url)
    res.setHeader(`x-${proxyName}-request-time`, formatDate())
    res.setHeader(`x-${proxyName}-request-url`, req.url)
  })
}

const sendBody = (fetchRes, res) => {
  if (!isFetchResText(fetchRes)) {
    fetchRes.buffer().then(body => res.end(body))
    return
  }

  fetchRes.text().then(body => res.end(filterBody(body)))
}

const notFound = res => res.writeHead(404).end(`${proxyName}: Not Found`)
const serverError = (res, e) => res.writeHead(500).end(`${proxyName}: Server Error\n\n${e}`)

const server = http.createServer((req, res) => {
  fetch(arcUrl(req.url)).then(fetchRes => {
    log(`${req.url} => ${fetchRes.url}`)
    if (isFetchResTs404(fetchRes)) return notFound(res)
    // if (!isFetchResYear(year, fetchRes)) return notFound(res)
    setHeaders(fetchRes, req, res)
    return sendBody(fetchRes, res)
  }).catch(e => serverError(res, e))
})

log(`HTTP Proxy: http://localhost:${port}`)
server.listen(port)
