const axios = require('axios')
const { createCanvas, loadImage } = require('canvas')
const fs = require('fs')
const path = require('path')

const assetsDir = path.join(__dirname, 'assets')
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

const BASE_SITE = 'https://football-logos.cc'

// ─── TIMES A MAPEAR ───────────────────────────────────────────────────────────

// Série A 2025 (20 times)
const SERIE_A = [
  { nome: 'Flamengo',             pagina: '/brazil/flamengo/' },
  { nome: 'Palmeiras',            pagina: '/brazil/palmeiras/' },
  { nome: 'Corinthians',          pagina: '/brazil/corinthians/' },
  { nome: 'Atletico Mineiro',     pagina: '/brazil/atletico-mineiro/' },
  { nome: 'Fluminense',           pagina: '/brazil/fluminense/' },
  { nome: 'Botafogo',             pagina: '/brazil/botafogo/' },
  { nome: 'Internacional',        pagina: '/brazil/internacional/' },
  { nome: 'Sao Paulo',            pagina: '/brazil/sao-paulo/' },
  { nome: 'Gremio',               pagina: '/brazil/gremio/' },
  { nome: 'Vasco da Gama',        pagina: '/brazil/vasco-da-gama/' },
  { nome: 'Bahia',                pagina: '/brazil/bahia/' },
  { nome: 'Fortaleza',            pagina: '/brazil/fortaleza/' },
  { nome: 'Athletico Paranaense', pagina: '/brazil/athletico-paranaense/' },
  { nome: 'Cruzeiro',             pagina: '/brazil/cruzeiro/' },
  { nome: 'Vitoria',              pagina: '/brazil/vitoria/' },
  { nome: 'Juventude',            pagina: '/brazil/juventude/' },
  { nome: 'RB Bragantino',        pagina: '/brazil/rb-bragantino/' },
  { nome: 'Mirassol',             pagina: '/brazil/mirassol/' },
  { nome: 'Ceara',                pagina: '/brazil/ceara/' },
  { nome: 'Sport Recife',         pagina: '/brazil/sport-recife/' },
]

// Times europeus
const EUROPEUS = [
  { nome: 'Real Madrid',        pagina: '/spain/real-madrid/' },
  { nome: 'Barcelona',          pagina: '/spain/barcelona/' },
  { nome: 'Manchester City',    pagina: '/england/manchester-city/' },
  { nome: 'Arsenal',            pagina: '/england/arsenal/' },
  { nome: 'Liverpool',          pagina: '/england/liverpool/' },
  { nome: 'Chelsea',            pagina: '/england/chelsea/' },
  { nome: 'Bayern Munich',      pagina: '/germany/bayern-munchen/' },
  { nome: 'Borussia Dortmund',  pagina: '/germany/borussia-dortmund/' },
  { nome: 'PSG',                pagina: '/france/paris-saint-germain/' },
  { nome: 'Juventus',           pagina: '/italy/juventus/' },
]

const TODOS = [...SERIE_A, ...EUROPEUS]

// ─── SCRAPING ────────────────────────────────────────────────────────────────

async function buscarURL700(pagina) {
  try {
    const r = await axios.get(BASE_SITE + pagina, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 12000
    })
    // Procura URL 700x700 no HTML
    const match = r.data.match(/https:\/\/assets\.football-logos\.cc\/logos\/[^\s"'<>&]+\/700x700\/[^\s"'<>&]+\.png/)
    return match ? match[0] : null
  } catch (e) {
    return null
  }
}

// ─── IMAGEM DE TESTE (Flamengo ou primeiro OK) ───────────────────────────────

async function gerarImagemTeste(url, nome) {
  const W = 1080, H = 1080
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#0a1628'
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

  const img = await loadImage(url)
  const maxSize = 420
  const scale = Math.min(maxSize / img.width, maxSize / img.height)
  const iw = img.width * scale
  const ih = img.height * scale
  ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2 - 60, iw, ih)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 52px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(nome, W / 2, H / 2 + ih / 2 + 20)

  ctx.fillStyle = '#00c48c'
  ctx.font = '20px sans-serif'
  const urlCurta = url.replace('https://assets.football-logos.cc/logos/', '')
  ctx.fillText(urlCurta, W / 2, H / 2 + ih / 2 + 58)

  const destino = path.join(assetsDir, 'teste-logo.png')
  fs.writeFileSync(destino, canvas.toBuffer('image/png'))
  return destino
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fazendo scraping de ' + TODOS.length + ' times...\n')

  const mapa = {}
  const falhas = []
  let destaqueURL = null
  let destaqueNome = null

  // Processa em lotes de 5 para nao sobrecarregar
  for (let i = 0; i < TODOS.length; i += 5) {
    const lote = TODOS.slice(i, i + 5)
    const resultados = await Promise.all(lote.map(async function(t) {
      const url = await buscarURL700(t.pagina)
      return { nome: t.nome, url }
    }))
    for (const r of resultados) {
      const status = r.url ? 'OK  ' : 'FAIL'
      console.log('  [' + status + '] ' + r.nome.padEnd(22) + (r.url ? r.url.replace('https://assets.football-logos.cc/logos/', '') : '—'))
      if (r.url) {
        mapa[r.nome] = r.url
        if (!destaqueURL) { destaqueURL = r.url; destaqueNome = r.nome }
        if (r.nome === 'Flamengo') { destaqueURL = r.url; destaqueNome = r.nome }
      } else {
        falhas.push(r.nome)
      }
    }
  }

  // ─── Resultado ───
  const total = TODOS.length
  const ok = Object.keys(mapa).length
  console.log('\n─────────────────────────────────────────────────────')
  console.log('Mapeados: ' + ok + '/' + total + ' times')
  if (falhas.length) {
    console.log('Falhas:   ' + falhas.join(', '))
  }

  // ─── Gera logosMapa.js ───
  const linhas = Object.entries(mapa).map(function([nome, url]) {
    return "  '" + nome + "': '" + url + "',"
  })
  const conteudo = [
    '// Gerado automaticamente por testeLogos.js',
    '// Fonte: assets.football-logos.cc — ' + new Date().toISOString().slice(0, 10),
    '',
    'const LOGOS = {',
    ...linhas,
    '}',
    '',
    'module.exports = LOGOS',
    '',
  ].join('\n')

  const mapaPath = path.join(__dirname, 'logosMapa.js')
  fs.writeFileSync(mapaPath, conteudo)
  console.log('\nArquivo gerado: ' + mapaPath)

  // ─── Imagem de teste ───
  if (destaqueURL) {
    try {
      const imgPath = await gerarImagemTeste(destaqueURL, destaqueNome)
      console.log('Imagem de teste: ' + imgPath)
    } catch (e) {
      console.log('Aviso: nao foi possivel gerar imagem de teste:', e.message)
    }
  }

  console.log('\nResumo do mapa gerado:')
  console.log('  Serie A: ' + SERIE_A.filter(t => mapa[t.nome]).length + '/' + SERIE_A.length)
  console.log('  Europeus: ' + EUROPEUS.filter(t => mapa[t.nome]).length + '/' + EUROPEUS.length)
}

main().catch(function(err) { console.error('Erro fatal:', err.message) })
