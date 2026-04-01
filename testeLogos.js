const axios = require('axios')
const { createCanvas, loadImage } = require('canvas')
const fs = require('fs')
const path = require('path')

const assetsDir = path.join(__dirname, 'assets')
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

const BASE_SITE = 'https://football-logos.cc'

// ─── TIMES A MAPEAR ───────────────────────────────────────────────────────────

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

const SERIE_B = [
  { nome: 'America Mineiro',      pagina: '/brazil/america-mineiro/' },
  { nome: 'Goias',                pagina: '/brazil/goias/' },
  { nome: 'Cuiaba',               pagina: '/brazil/cuiaba/' },
  { nome: 'Atletico Goianiense',  pagina: '/brazil/atletico-goianiense/' },
  { nome: 'Criciuma',             pagina: '/brazil/criciuma/' },
  { nome: 'Coritiba',             pagina: '/brazil/coritiba/' },
  { nome: 'Ponte Preta',          pagina: '/brazil/ponte-preta/' },
  { nome: 'Botafogo SP',          pagina: '/brazil/botafogo-sp/' },
  { nome: 'Operario Ferroviario', pagina: '/brazil/operario-ferroviario/' },
  { nome: 'Paysandu',             pagina: '/brazil/paysandu/' },
  { nome: 'CRB',                  pagina: '/brazil/crb/' },
  { nome: 'Avai',                 pagina: '/brazil/avai/' },
  { nome: 'Amazonas',             pagina: '/brazil/amazonas/' },
  { nome: 'Vila Nova',            pagina: '/brazil/vila-nova/' },
  { nome: 'Novorizontino',        pagina: '/brazil/novorizontino/' },
  { nome: 'Chapecoense',          pagina: '/brazil/chapecoense/' },
  { nome: 'Londrina',             pagina: '/brazil/londrina/' },
  { nome: 'Nautico',              pagina: '/brazil/nautico/' },
  { nome: 'Guarani',              pagina: '/brazil/guarani/' },
  { nome: 'Sao Bernardo',         pagina: '/brazil/sao-bernardo/' },
]

// Champions / Europa frequentes
const ENGLAND = [
  { nome: 'Manchester City',    pagina: '/england/manchester-city/' },
  { nome: 'Arsenal',            pagina: '/england/arsenal/' },
  { nome: 'Liverpool',          pagina: '/england/liverpool/' },
  { nome: 'Chelsea',            pagina: '/england/chelsea/' },
  { nome: 'Manchester United',  pagina: '/england/manchester-united/' },
  { nome: 'Tottenham',          pagina: '/england/tottenham/' },
  { nome: 'Newcastle',          pagina: '/england/newcastle/' },
  { nome: 'Aston Villa',        pagina: '/england/aston-villa/' },
]

const SPAIN = [
  { nome: 'Real Madrid',        pagina: '/spain/real-madrid/' },
  { nome: 'Barcelona',          pagina: '/spain/barcelona/' },
  { nome: 'Atletico Madrid',    pagina: '/spain/atletico-madrid/' },
  { nome: 'Sevilla',            pagina: '/spain/sevilla/' },
  { nome: 'Valencia',           pagina: '/spain/valencia/' },
  { nome: 'Villarreal',         pagina: '/spain/villarreal/' },
]

const ITALY = [
  { nome: 'Juventus',           pagina: '/italy/juventus/' },
  { nome: 'Inter Milan',        pagina: '/italy/inter/' },
  { nome: 'AC Milan',           pagina: '/italy/milan/' },
  { nome: 'Roma',               pagina: '/italy/roma/' },
  { nome: 'Napoli',             pagina: '/italy/napoli/' },
  { nome: 'Lazio',              pagina: '/italy/lazio/' },
]

const GERMANY = [
  { nome: 'Bayern Munich',         pagina: '/germany/bayern-munchen/' },
  { nome: 'Borussia Dortmund',     pagina: '/germany/borussia-dortmund/' },
  { nome: 'RB Leipzig',            pagina: '/germany/rb-leipzig/' },
  { nome: 'Bayer Leverkusen',      pagina: '/germany/bayer-leverkusen/' },
  { nome: 'Eintracht Frankfurt',   pagina: '/germany/eintracht-frankfurt/' },
]

const FRANCE = [
  { nome: 'PSG',                pagina: '/france/paris-saint-germain/' },
  { nome: 'Monaco',             pagina: '/france/as-monaco/' },
  { nome: 'Marseille',          pagina: '/france/marseille/' },
  { nome: 'Lyon',               pagina: '/france/lyon/' },
  { nome: 'Lille',              pagina: '/france/lille/' },
]

const PORTUGAL = [
  { nome: 'Porto',              pagina: '/portugal/fc-porto/' },
  { nome: 'Benfica',            pagina: '/portugal/benfica/' },
  { nome: 'Sporting CP',        pagina: '/portugal/sporting-cp/' },
]

const NETHERLANDS = [
  { nome: 'Ajax',               pagina: '/netherlands/ajax/' },
  { nome: 'PSV',                pagina: '/netherlands/psv/' },
]

// Copa Libertadores / Sul-americanos
const ARGENTINA = [
  { nome: 'River Plate',        pagina: '/argentina/river-plate/' },
  { nome: 'Boca Juniors',       pagina: '/argentina/boca-juniors/' },
  { nome: 'Racing Club',        pagina: '/argentina/racing-club/' },
  { nome: 'Independiente',      pagina: '/argentina/independiente/' },
]

const OUTROS_SA = [
  { nome: 'Nacional',           pagina: '/uruguay/nacional/' },
  { nome: 'Penarol',            pagina: '/uruguay/penarol/' },
  { nome: 'Olimpia',            pagina: '/paraguay/olimpia/' },
  { nome: 'LDU Quito',          pagina: '/ecuador/liga-de-quito/' },
  { nome: 'Colo Colo',          pagina: '/chile/colo-colo/' },
  { nome: 'Universidad de Chile', pagina: '/chile/universidad-de-chile/' },
  { nome: 'Alianza Lima',       pagina: '/peru/alianza-lima/' },
  { nome: 'Universitario',      pagina: '/peru/universitario/' },
]

// Grupos para o resumo final
const GRUPOS = [
  { label: 'Serie A (BR)',   lista: SERIE_A },
  { label: 'Serie B (BR)',   lista: SERIE_B },
  { label: 'England',        lista: ENGLAND },
  { label: 'Spain',          lista: SPAIN },
  { label: 'Italy',          lista: ITALY },
  { label: 'Germany',        lista: GERMANY },
  { label: 'France',         lista: FRANCE },
  { label: 'Portugal',       lista: PORTUGAL },
  { label: 'Netherlands',    lista: NETHERLANDS },
  { label: 'Argentina',      lista: ARGENTINA },
  { label: 'Sul-americanos', lista: OUTROS_SA },
]

const TODOS = GRUPOS.reduce(function(acc, g) { return acc.concat(g.lista) }, [])

// ─── SCRAPING ────────────────────────────────────────────────────────────────

async function buscarURL700(pagina) {
  try {
    const r = await axios.get(BASE_SITE + pagina, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 12000
    })
    const match = r.data.match(/https:\/\/assets\.football-logos\.cc\/logos\/[^\s"'<>&]+\/700x700\/[^\s"'<>&]+\.png/)
    return match ? match[0] : null
  } catch (e) {
    return null
  }
}

// ─── IMAGEM DE TESTE ─────────────────────────────────────────────────────────

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
  ctx.fillText(url.replace('https://assets.football-logos.cc/logos/', ''), W / 2, H / 2 + ih / 2 + 58)

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

  // Processa em lotes de 6 para nao sobrecarregar
  for (let i = 0; i < TODOS.length; i += 6) {
    const lote = TODOS.slice(i, i + 6)
    const resultados = await Promise.all(lote.map(async function(t) {
      const url = await buscarURL700(t.pagina)
      return { nome: t.nome, url }
    }))
    for (const r of resultados) {
      const status = r.url ? 'OK  ' : 'FAIL'
      console.log('  [' + status + '] ' + r.nome.padEnd(24) + (r.url ? r.url.replace('https://assets.football-logos.cc/logos/', '') : '—'))
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
  const ok = Object.keys(mapa).length
  console.log('\n─────────────────────────────────────────────────────')
  console.log('Total mapeado: ' + ok + '/' + TODOS.length + ' times')
  if (falhas.length) console.log('Falhas:        ' + falhas.join(', '))

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

  fs.writeFileSync(path.join(__dirname, 'logosMapa.js'), conteudo)
  console.log('\nArquivo gerado: logosMapa.js')

  // ─── Imagem de teste ───
  if (destaqueURL) {
    try {
      const imgPath = await gerarImagemTeste(destaqueURL, destaqueNome)
      console.log('Imagem de teste: ' + imgPath)
    } catch (e) {
      console.log('Aviso: nao foi possivel gerar imagem de teste:', e.message)
    }
  }

  console.log('\nResumo por grupo:')
  for (const g of GRUPOS) {
    const n = g.lista.filter(function(t) { return mapa[t.nome] }).length
    console.log('  ' + g.label.padEnd(18) + n + '/' + g.lista.length)
  }
}

main().catch(function(err) { console.error('Erro fatal:', err.message) })
