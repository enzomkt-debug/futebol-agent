require('dotenv').config()
const axios = require('axios')
const { createCanvas, loadImage, registerFont } = require('canvas')
const fs = require('fs')
const path = require('path')
const { subirImagemGithub } = require('./utils')

try {
  registerFont(path.join(__dirname, 'fonts', 'DejaVuSans.ttf'), { family: 'DejaVu Sans', weight: 'normal' })
  registerFont(path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'), { family: 'DejaVu Sans', weight: 'bold' })
} catch (e) { console.log('Aviso: erro ao registrar fonte DejaVu:', e.message) }
const FONTE = 'DejaVu Sans'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY
const ZERNIO_ACCOUNT_ID = process.env.ZERNIO_ACCOUNT_ID
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY

const VERMELHO = '#e94560'
const AMARELO  = '#f5c842'
const BRANCO   = '#ffffff'

// ─── FILTROS DE RELEVÂNCIA ────────────────────────────────────────────────────

const PALAVRAS_RELEVANTES = [
  'Flamengo','Palmeiras','Corinthians','Fluminense','Botafogo','Internacional',
  'São Paulo','Sao Paulo','Grêmio','Gremio','Atletico','Atlético','Vasco','Bahia',
  'Fortaleza','Cruzeiro',
  'Brasileirão','Brasileirao','Libertadores','Copa do Brasil',
  'Champions League','Premier League','Real Madrid','Barcelona','Manchester',
  'Liverpool','Arsenal','Chelsea','Bayern','PSG','Juventus','La Liga','Bundesliga',
  'Serie A'
]

function ehRelevante(texto) {
  const t = (texto || '').toLowerCase()
  return PALAVRAS_RELEVANTES.some(function(p) { return t.includes(p.toLowerCase()) })
}

// ─── RSS ──────────────────────────────────────────────────────────────────────

const FEEDS = [
  { nome: 'IG Esporte',  url: 'https://esporte.ig.com.br/rss' },
  { nome: 'Metropoles',  url: 'https://www.metropoles.com/esportes/feed' },
  { nome: 'Folha',       url: 'https://feeds.folha.uol.com.br/esporte/rss091.xml' },
]

function extrairTag(xml, tag) {
  const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i')
  const m = xml.match(re)
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''
}

function extrairAttr(xml, tag, attr) {
  const re = new RegExp('<' + tag + '[^>]*\\s' + attr + '=["\']([^"\']+)["\']', 'i')
  const m = xml.match(re)
  return m ? m[1] : ''
}

function decodeHtml(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
}

function parseItens(xml) {
  const itens = []
  const blocos = xml.split('<item')
  const limite = Date.now() - 86400000  // 24 horas atrás
  for (let i = 1; i < blocos.length; i++) {
    const b = blocos[i]
    const titulo  = extrairTag(b, 'title')
    const desc    = extrairTag(b, 'description')
    const link    = extrairTag(b, 'link') || extrairAttr(b, 'link', 'href')
    const pubDate = extrairTag(b, 'pubDate')
    // Tenta imagem em: <media:content>, <enclosure>, <media:thumbnail>
    let imgUrl = extrairAttr(b, 'media:content', 'url') ||
                 extrairAttr(b, 'enclosure', 'url') ||
                 extrairAttr(b, 'media:thumbnail', 'url') || ''
    // Tenta dentro de description se tiver <img src=...>
    if (!imgUrl) {
      const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/i)
      if (imgMatch) imgUrl = imgMatch[1]
    }
    if (!titulo) continue
    // Filtra por data — descarta itens com mais de 24h
    if (pubDate) {
      const ts = Date.parse(pubDate)
      if (!isNaN(ts) && ts < limite) continue
    }
    itens.push({ titulo: decodeHtml(titulo), desc: decodeHtml(desc), link, imgUrl })
  }
  return itens
}

async function buscarNoticiaRSS() {
  for (const feed of FEEDS) {
    try {
      const res = await axios.get(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      })
      const itens = parseItens(res.data)
      const relevante = itens.find(function(it) {
        return ehRelevante(it.titulo) || ehRelevante(it.desc)
      })
      if (relevante) {
        console.log('Noticia encontrada em ' + feed.nome + ': ' + relevante.titulo.slice(0, 60))
        return { ...relevante, fonte: feed.nome }
      }
    } catch (e) {
      console.log('Feed ' + feed.nome + ' falhou: ' + e.message)
    }
  }
  return null
}

// ─── IMAGEM ───────────────────────────────────────────────────────────────────

function extrairPalavrasChave(titulo) {
  // Remove pontuação e palavras genéricas, mantém nomes próprios e termos relevantes
  const stopwords = new Set([
    'a','o','as','os','e','de','do','da','dos','das','em','no','na','nos','nas',
    'por','para','com','se','que','um','uma','ao','à','pelo','pela','após','ante',
    'mas','ou','nem','vai','vai','ser','está','são','foi','com','não','mais','já',
    'sobre','contra','após','seus','sua','seu','quer','ser','isso','este','esse'
  ])
  const palavras = titulo
    .replace(/["""''():;!?]/g, ' ')
    .split(/\s+/)
    .filter(p => p.length > 2 && !stopwords.has(p.toLowerCase()))
    .slice(0, 5)
  return palavras.join(' ') || titulo.slice(0, 40)
}

async function buscarImagemGoogle(query) {
  try {
    const keywords = extrairPalavrasChave(query)
    const q = encodeURIComponent(keywords + ' futebol')
    const res = await axios.get('https://www.google.com/search?q=' + q + '&tbm=isch&hl=pt-BR', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      },
      timeout: 10000
    })
    // Extrai URLs de imagem do HTML do Google Images
    const matches = res.data.match(/"(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/g)
    if (matches && matches.length) {
      const url = matches[0].replace(/"/g, '')
      // Verifica se a URL carrega
      const img = await loadImage(url)
      return url
    }
  } catch (e) {
    console.log('Google Images falhou: ' + e.message)
  }
  return null
}

async function buscarImagemUnsplash(query) {
  try {
    const res = await axios.get('https://api.unsplash.com/photos/random', {
      headers: { Authorization: 'Client-ID ' + UNSPLASH_ACCESS_KEY },
      params: { query: query, orientation: 'squarish', content_filter: 'high' },
      timeout: 8000
    })
    return res.data.urls.regular
  } catch (e) {
    console.log('Unsplash falhou: ' + e.message)
    return null
  }
}

async function resolverImagem(noticia) {
  if (noticia.imgUrl) {
    try {
      await loadImage(noticia.imgUrl)
      return noticia.imgUrl
    } catch (e) {}
  }
  const urlGoogle = await buscarImagemGoogle(noticia.titulo)
  if (urlGoogle) return urlGoogle
  const urlUnsplash = await buscarImagemUnsplash('football soccer stadium')
  return urlUnsplash
}

// ─── CLAUDE ───────────────────────────────────────────────────────────────────

async function gerarLegendaClaude(noticia) {
  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{
        role: 'user',
        content: `Voce e um repórter esportivo criando conteúdo para o Instagram do canal Gol Match BR.

Noticia: ${noticia.titulo}
Resumo: ${(noticia.desc || '').replace(/<[^>]+>/g, '').trim().slice(0, 300)}

Crie uma legenda para o Instagram seguindo EXATAMENTE esta estrutura:

1. Uma primeira linha impactante — o lead da noticia, direto ao ponto, que pare o scroll
2. Uma linha em branco
3. Dois ou três parágrafos curtos desenvolvendo o contexto: o que aconteceu, quem está envolvido e qual a importância para o futebol brasileiro ou mundial
4. Uma linha em branco
5. Uma pergunta ou provocação para engajar comentários — algo que convide o seguidor a opinar (ex: "O que você acha?", "Vai ser titular?", "Merece a chance?", "Esse time vai longe?")
6. Uma linha em branco
7. A frase exata: Acompanhe tudo no nosso Telegram. Link na bio.

Regras:
- Tom jornalístico mas acessível, como um repórter esportivo nas redes sociais
- Maximo 2000 caracteres no total
- Sem mencionar apostas, odds, palpites ou ganhos financeiros
- Sem hashtags (elas serão adicionadas separadamente)
- Em portugues brasileiro informal
- Retorne APENAS o texto da legenda, sem aspas, sem explicacoes`
      }]
    }, {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    })
    return res.data.content[0].text.trim()
  } catch (e) {
    console.error('Claude falhou:', e.message)
    return noticia.titulo + '\n\nAcompanhe tudo no nosso Telegram. Link na bio.'
  }
}

function gerarHashtags(texto) {
  const t = (texto || '').toLowerCase()
  let tags = '#futebol #golmatchbr #noticias'
  if (t.includes('flamengo'))             tags += ' #flamengo #mengao'
  if (t.includes('palmeiras'))            tags += ' #palmeiras #verdao'
  if (t.includes('corinthians'))          tags += ' #corinthians #timao'
  if (t.includes('brasileir'))            tags += ' #brasileirao #serieA'
  if (t.includes('libertadores'))         tags += ' #libertadores #conmebol'
  if (t.includes('champions'))            tags += ' #championsleague #ucl'
  if (t.includes('premier'))              tags += ' #premierleague'
  if (t.includes('real madrid') || t.includes('barcelona') || t.includes('la liga')) tags += ' #laliga'
  if (t.includes('bayern') || t.includes('bundesliga')) tags += ' #bundesliga'
  tags += ' #futebolbrasileiro #esporte'
  return tags
}

// ─── CARD 1080x1080 ───────────────────────────────────────────────────────────

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const test = cur + w + ' '
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur.trim()); cur = w + ' '
    } else { cur = test }
  }
  if (cur.trim()) lines.push(cur.trim())
  return lines
}

async function gerarCardNoticia(noticia, imgUrl) {
  const W = 1080, H = 1080
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // Fundo escuro como fallback
  ctx.fillStyle = '#111111'
  ctx.fillRect(0, 0, W, H)

  // Foto ocupando 100% do card
  if (imgUrl) {
    try {
      const img = await loadImage(imgUrl)
      // Cover: mantém proporção, corta para preencher 1080x1080
      const scale = Math.max(W / img.width, H / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
    } catch (e) { console.log('Aviso: nao foi possivel carregar imagem no card noticia (feed), usando fundo escuro:', e.message) }
  }

  // Overlay: transparente no topo → escuro na metade inferior
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0,    'rgba(0,0,0,0)')
  grad.addColorStop(0.35, 'rgba(0,0,0,0)')
  grad.addColorStop(0.65, 'rgba(0,0,0,0.6)')
  grad.addColorStop(1,    'rgba(0,0,0,0.85)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // ── Pré-calcula linhas de título e resumo ──────────────────────────────────
  ctx.textAlign = 'left'
  const MARGIN = 60
  const MAXW   = W - MARGIN * 2

  let fsTitulo = 72
  ctx.font = 'bold ' + fsTitulo + 'px ' + FONTE
  let linhasTitulo = wrapText(ctx, noticia.titulo, MAXW)
  if (linhasTitulo.length > 3) {
    fsTitulo = 60
    ctx.font = 'bold ' + fsTitulo + 'px ' + FONTE
    linhasTitulo = wrapText(ctx, noticia.titulo, MAXW)
  }
  if (linhasTitulo.length > 3) {
    fsTitulo = 50
    ctx.font = 'bold ' + fsTitulo + 'px ' + FONTE
    linhasTitulo = wrapText(ctx, noticia.titulo, MAXW)
  }
  if (linhasTitulo.length > 3) linhasTitulo = linhasTitulo.slice(0, 3)

  const descLimpa = (noticia.desc || '')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 220)
  let linhasDesc = []
  if (descLimpa) {
    ctx.font = '30px ' + FONTE
    linhasDesc = wrapText(ctx, descLimpa, MAXW)
    if (linhasDesc.length > 2) linhasDesc = linhasDesc.slice(0, 2)
  }

  // ── Calcula altura total do bloco e ancora na parte inferior ───────────────
  const TAG_H       = 40
  const TAG_GAP     = 18   // espaço entre tag e título
  const tituloLineH = fsTitulo + 10
  const tituloBlockH = linhasTitulo.length * tituloLineH - 10
  const descGap     = linhasDesc.length > 0 ? 20 : 0
  const descLineH   = 38
  const descBlockH  = linhasDesc.length > 0 ? descLineH * linhasDesc.length - (descLineH - 30) : 0
  const FONTE_GAP   = 16
  const FONTE_H     = 26
  const totalH      = TAG_H + TAG_GAP + tituloBlockH + descGap + descBlockH + FONTE_GAP + FONTE_H
  const BOTTOM_PAD  = 70
  const yBase       = H - BOTTOM_PAD - totalH  // topo do bloco

  // ── Tag "NOTÍCIA" ──────────────────────────────────────────────────────────
  ctx.font = 'bold 22px ' + FONTE
  const tagPad = 16
  const tagTxt = 'NOTÍCIA'
  const tagW   = ctx.measureText(tagTxt).width + tagPad * 2
  ctx.fillStyle = AMARELO
  ctx.beginPath()
  ctx.roundRect(MARGIN, yBase, tagW, TAG_H, 5)
  ctx.fill()
  ctx.fillStyle = '#0d0d0d'
  ctx.fillText(tagTxt, MARGIN + tagPad, yBase + TAG_H - 10)

  // ── Título ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = BRANCO
  ctx.shadowColor = 'rgba(0,0,0,0.95)'
  ctx.shadowBlur = 12
  ctx.font = 'bold ' + fsTitulo + 'px ' + FONTE
  let yTit = yBase + TAG_H + TAG_GAP
  linhasTitulo.forEach(function(l) {
    ctx.fillText(l, MARGIN, yTit + fsTitulo)
    yTit += tituloLineH
  })
  ctx.shadowBlur = 0

  // ── Resumo ─────────────────────────────────────────────────────────────────
  if (linhasDesc.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.78)'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 8
    ctx.font = '30px ' + FONTE
    let yDesc = yBase + TAG_H + TAG_GAP + tituloBlockH + descGap + 30
    linhasDesc.forEach(function(l) { ctx.fillText(l, MARGIN, yDesc); yDesc += descLineH })
    ctx.shadowBlur = 0
  }

  // ── Fonte discreta ─────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.40)'
  ctx.font = '22px ' + FONTE
  ctx.fillText('Fonte: ' + noticia.fonte, MARGIN, H - BOTTOM_PAD - 4)

  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)
  const caminho = path.join(assetsDir, 'card-noticia.png')
  fs.writeFileSync(caminho, canvas.toBuffer('image/png'))
  console.log('Card de noticia gerado')
  return caminho
}

// ─── CARD STORY 1080x1920 ─────────────────────────────────────────────────────

async function gerarCardNoticiaStory(noticia, imgUrl) {
  const W = 1080, H = 1920
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  const MARGIN = 70
  const MAXW   = W - MARGIN * 2

  ctx.fillStyle = '#111111'
  ctx.fillRect(0, 0, W, H)

  // Foto cobrindo 100% do story
  if (imgUrl) {
    try {
      const img = await loadImage(imgUrl)
      const scale = Math.max(W / img.width, H / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
    } catch (e) { console.log('Aviso: nao foi possivel carregar imagem no card noticia (story), usando fundo escuro:', e.message) }
  }

  // Overlay: transparente no topo → escuro nos 40% inferiores
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0,    'rgba(0,0,0,0)')
  grad.addColorStop(0.42, 'rgba(0,0,0,0)')
  grad.addColorStop(0.62, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1,    'rgba(0,0,0,0.88)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'left'

  // ── Pré-calcula linhas ─────────────────────────────────────────────────────
  let fsTitulo = 80
  ctx.font = 'bold ' + fsTitulo + 'px ' + FONTE
  let linhasTitulo = wrapText(ctx, noticia.titulo, MAXW)
  if (linhasTitulo.length > 3) {
    fsTitulo = 68
    ctx.font = 'bold ' + fsTitulo + 'px ' + FONTE
    linhasTitulo = wrapText(ctx, noticia.titulo, MAXW)
  }
  if (linhasTitulo.length > 3) {
    fsTitulo = 58
    ctx.font = 'bold ' + fsTitulo + 'px ' + FONTE
    linhasTitulo = wrapText(ctx, noticia.titulo, MAXW)
  }
  if (linhasTitulo.length > 3) linhasTitulo = linhasTitulo.slice(0, 3)

  const descLimpa = (noticia.desc || '')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 220)
  let linhasDesc = []
  if (descLimpa) {
    ctx.font = '34px ' + FONTE
    linhasDesc = wrapText(ctx, descLimpa, MAXW)
    if (linhasDesc.length > 2) linhasDesc = linhasDesc.slice(0, 2)
  }

  // ── Ancora bloco na parte inferior ────────────────────────────────────────
  const TAG_H        = 46
  const TAG_GAP      = 22
  const tituloLineH  = fsTitulo + 12
  const tituloBlockH = linhasTitulo.length * tituloLineH - 12
  const descGap      = linhasDesc.length > 0 ? 24 : 0
  const descLineH    = 46
  const descBlockH   = linhasDesc.length > 0 ? descLineH * linhasDesc.length - (descLineH - 34) : 0
  const FONTE_GAP    = 20
  const FONTE_H      = 30
  const totalH       = TAG_H + TAG_GAP + tituloBlockH + descGap + descBlockH + FONTE_GAP + FONTE_H
  const BLOCK_BOTTOM = 1550   // bloco termina aqui — 370px livres para ícones do Instagram
  const yBase        = BLOCK_BOTTOM - totalH

  // ── Tag "NOTÍCIA" ──────────────────────────────────────────────────────────
  ctx.font = 'bold 26px ' + FONTE
  const tagPad = 18
  const tagW   = ctx.measureText('NOTÍCIA').width + tagPad * 2
  ctx.fillStyle = AMARELO
  ctx.beginPath()
  ctx.roundRect(MARGIN, yBase, tagW, TAG_H, 6)
  ctx.fill()
  ctx.fillStyle = '#0d0d0d'
  ctx.fillText('NOTÍCIA', MARGIN + tagPad, yBase + TAG_H - 12)

  // ── Título ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = BRANCO
  ctx.shadowColor = 'rgba(0,0,0,0.95)'
  ctx.shadowBlur = 14
  ctx.font = 'bold ' + fsTitulo + 'px ' + FONTE
  let yTit = yBase + TAG_H + TAG_GAP
  linhasTitulo.forEach(function(l) {
    ctx.fillText(l, MARGIN, yTit + fsTitulo)
    yTit += tituloLineH
  })
  ctx.shadowBlur = 0

  // ── Resumo ─────────────────────────────────────────────────────────────────
  if (linhasDesc.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.78)'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 8
    ctx.font = '34px ' + FONTE
    let yDesc = yBase + TAG_H + TAG_GAP + tituloBlockH + descGap + 34
    linhasDesc.forEach(function(l) { ctx.fillText(l, MARGIN, yDesc); yDesc += descLineH })
    ctx.shadowBlur = 0
  }

  // ── Fonte discreta ─────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.40)'
  ctx.font = '26px ' + FONTE
  ctx.fillText('Fonte: ' + noticia.fonte, MARGIN, BLOCK_BOTTOM - 4)

  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)
  const caminho = path.join(assetsDir, 'card-noticia-story.png')
  fs.writeFileSync(caminho, canvas.toBuffer('image/png'))
  console.log('Card story de noticia gerado')
  return caminho
}

// ─── ZERNIO ───────────────────────────────────────────────────────────────────

async function publicarViaZernio(caption, imageUrl, contentType) {
  const tipo = contentType || 'feed'
  try {
    await axios.post('https://zernio.com/api/v1/posts', {
      platforms: [{ platform: 'instagram', accountId: ZERNIO_ACCOUNT_ID }],
      content: caption,
      mediaItems: [{ type: 'image', url: imageUrl }],
      contentType: tipo,
      publishNow: true
    }, {
      headers: {
        'Authorization': 'Bearer ' + ZERNIO_API_KEY,
        'Content-Type': 'application/json'
      }
    })
    console.log('Noticia publicada no Instagram (' + tipo + ') via Zernio!')
    return true
  } catch (e) {
    console.error('Erro Zernio (' + tipo + '):', e.response?.data || e.message)
    return false
  }
}

// ─── FUNÇÃO PRINCIPAL ─────────────────────────────────────────────────────────

async function postarNoticia() {
  console.log('\n[' + new Date().toISOString() + '] Post de noticia iniciado')

  if (!ZERNIO_API_KEY || !ZERNIO_ACCOUNT_ID) {
    console.log('Credenciais Zernio nao configuradas.')
    return
  }

  try {
    // 1. Busca notícia relevante
    const noticia = await buscarNoticiaRSS()
    if (!noticia) {
      console.log('Nenhuma noticia recente encontrada — post cancelado')
      return
    }

    // 2. Resolve imagem (RSS → Google → Unsplash)
    const imgUrl = await resolverImagem(noticia)
    if (!imgUrl) {
      console.log('Nao foi possivel obter imagem para a noticia.')
      return
    }

    // 3. Gera cards (feed + story) e legenda em paralelo
    const [caminhoFeed, caminhoStory, legendaTexto] = await Promise.all([
      gerarCardNoticia(noticia, imgUrl),
      gerarCardNoticiaStory(noticia, imgUrl),
      gerarLegendaClaude(noticia)
    ])

    const hashtags = gerarHashtags(noticia.titulo + ' ' + noticia.desc)
    const caption  = legendaTexto + '\n\n' + hashtags

    // 4. Sobe imagens para GitHub
    const [urlFeed, urlStory] = await Promise.all([
      subirImagemGithub(axios, caminhoFeed,  'card-noticia.png'),
      subirImagemGithub(axios, caminhoStory, 'card-noticia-story.png')
    ])

    // 5. Publica feed e story
    if (urlFeed)  await publicarViaZernio(caption, urlFeed,  'feed')
    if (urlStory) await publicarViaZernio('',      urlStory, 'story')

  } catch (e) {
    console.error('Erro no post de noticia:', e.message)
  }

  console.log('[' + new Date().toISOString() + '] Post de noticia finalizado')
}

module.exports = { postarNoticia }
