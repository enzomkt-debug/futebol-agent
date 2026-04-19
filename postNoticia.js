require('dotenv').config()
const axios = require('axios')
const { createCanvas, loadImage, registerFont } = require('canvas')
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const { subirImagemGithub } = require('./utils')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

try {
  registerFont(path.join(__dirname, 'fonts', 'DejaVuSans.ttf'), { family: 'DejaVu Sans', weight: 'normal' })
  registerFont(path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'), { family: 'DejaVu Sans', weight: 'bold' })
} catch (e) { console.log('Aviso: erro ao registrar fonte DejaVu:', e.message) }
const FONTE = 'DejaVu Sans'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const { publicarFeed, publicarStory, credenciaisOk } = require('./publer')
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY
const ALERTA_CHAT_ID = '6116204841'

async function enviarAlerta(mensagem) {
  const payload = { chat_id: ALERTA_CHAT_ID, text: mensagem, parse_mode: 'HTML' }
  try {
    await axios.post('https://api.telegram.org/bot' + process.env.TELEGRAM_TOKEN + '/sendMessage', payload)
  } catch (e) {
    console.error('Erro ao enviar alerta (tentativa 1):', e.message)
    try {
      await new Promise(r => setTimeout(r, 5000))
      await axios.post('https://api.telegram.org/bot' + process.env.TELEGRAM_TOKEN + '/sendMessage', payload)
    } catch (e2) {
      console.error('Erro ao enviar alerta (tentativa 2):', e2.message)
    }
  }
}

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

// Termos de alta relevância que indicam notícias mais importantes
const ALTA_RELEVANCIA = [
  'Champions League', 'Premier League', 'Brasileirão', 'Brasileirao',
  'Libertadores', 'Copa do Brasil', 'Copa do Mundo', 'La Liga', 'Bundesliga',
  'Flamengo', 'Palmeiras', 'Corinthians', 'Real Madrid', 'Barcelona',
  'Manchester City', 'Liverpool', 'Arsenal', 'Bayern'
]

function pontuarNoticia(titulo, desc) {
  const texto = (titulo + ' ' + (desc || '')).toLowerCase()
  let pontos = 0
  for (const termo of ALTA_RELEVANCIA) {
    if (texto.includes(termo.toLowerCase())) pontos++
  }
  return pontos
}

async function buscarNoticiaRSS() {
  const todas = []

  for (const feed of FEEDS) {
    try {
      const res = await axios.get(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      })
      const itens = parseItens(res.data)
      for (const it of itens) {
        if (ehRelevante(it.titulo) || ehRelevante(it.desc)) {
          todas.push({ ...it, fonte: feed.nome })
        }
      }
      console.log('Feed ' + feed.nome + ': ' + itens.length + ' itens, ' + todas.filter(t => t.fonte === feed.nome).length + ' relevantes')
    } catch (e) {
      console.log('Feed ' + feed.nome + ' falhou: ' + e.message)
    }
  }

  if (!todas.length) return null

  // Ordena por pontuação de relevância (maior primeiro)
  todas.sort(function(a, b) {
    return pontuarNoticia(b.titulo, b.desc) - pontuarNoticia(a.titulo, a.desc)
  })

  const melhor = todas[0]
  console.log('Noticia selecionada (' + melhor.fonte + ', pontos=' + pontuarNoticia(melhor.titulo, melhor.desc) + '): ' + melhor.titulo.slice(0, 60))
  return melhor
}

// ─── IMAGEM ───────────────────────────────────────────────────────────────────

async function buscarOgImage(url) {
  if (!url) return null
  try {
    console.log('[IMG] og:image — buscando em: ' + url.slice(0, 100))
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120' },
      timeout: 10000
    })
    const match = res.data.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
               || res.data.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    if (match) {
      console.log('[IMG] og:image — encontrado: ' + match[1].slice(0, 100))
      return match[1]
    }
    console.log('[IMG] og:image — nenhuma meta tag encontrada')
  } catch (e) {
    console.log('[IMG] og:image falhou: ' + e.message)
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
    console.log('[IMG] Unsplash — OK: ' + res.data.urls.regular.slice(0, 80))
    return res.data.urls.regular
  } catch (e) {
    console.log('[IMG] Unsplash falhou: ' + e.message)
    return null
  }
}

async function resolverImagem(noticia) {
  console.log('[IMG] imgUrl do RSS: ' + (noticia.imgUrl || '(vazio)'))
  if (noticia.imgUrl) {
    try {
      const img = await loadImage(noticia.imgUrl)
      console.log('[IMG] RSS imgUrl carregada com sucesso (' + img.width + 'x' + img.height + ') — usando esta')
      return noticia.imgUrl
    } catch (e) {
      console.log('[IMG] RSS imgUrl falhou ao carregar: ' + e.message + ' — buscando alternativa')
    }
  }
  const urlOg = await buscarOgImage(noticia.link)
  if (urlOg) {
    try {
      const img = await loadImage(urlOg)
      console.log('[IMG] og:image carregada com sucesso (' + img.width + 'x' + img.height + ') — usando esta')
      return urlOg
    } catch (e) {
      console.log('[IMG] og:image falhou ao carregar: ' + e.message)
    }
  }
  console.log('[IMG] og:image falhou — tentando Unsplash')
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


// ─── DEDUPLICAÇÃO DE NOTÍCIAS ─────────────────────────────────────────────────

function gerarChaveNoticia(noticia) {
  // Usa os primeiros 80 chars do título como chave única (evita postar a mesma notícia)
  return 'noticia_' + noticia.titulo.trim().slice(0, 80).replace(/\s+/g, '_').toLowerCase()
}

async function jaPostadaNoticia(chave) {
  try {
    const { data } = await supabase.from('notificados').select('match_id').eq('match_id', chave).limit(1)
    return !!(data && data.length)
  } catch (e) {
    return false
  }
}

async function marcarNoticiaPostada(chave) {
  try {
    await supabase.from('notificados').insert({ match_id: chave })
  } catch (e) {
    console.error('Erro ao marcar noticia postada:', e.message)
  }
}

// ─── FUNÇÃO PRINCIPAL ─────────────────────────────────────────────────────────

async function postarNoticia() {
  console.log('\n[' + new Date().toISOString() + '] Post de noticia iniciado')

  if (!credenciaisOk()) {
    console.log('Credenciais do Publer nao configuradas — post de noticia cancelado.')
    return
  }

  try {
    // 1. Busca notícia relevante
    const noticia = await buscarNoticiaRSS()
    if (!noticia) {
      console.log('Nenhuma noticia recente encontrada — post cancelado')
      return
    }

    // Verifica se já foi postada (evita repetição)
    const chave = gerarChaveNoticia(noticia)
    const jaPostada = await jaPostadaNoticia(chave)
    if (jaPostada) {
      console.log('Noticia ja postada anteriormente — pulando: ' + noticia.titulo.slice(0, 60))
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
    let publicado = false
    if (urlFeed) {
      publicado = await publicarFeed(caption, urlFeed, 'noticia')
    } else {
      await enviarAlerta('🔴 <b>postNoticia (feed) — Falha ao subir imagem para o GitHub</b>\ncard-noticia.png retornou url null')
    }
    if (urlStory) {
      await publicarStory(urlStory, 'noticia-story')
    } else {
      await enviarAlerta('🔴 <b>postNoticia (story) — Falha ao subir imagem para o GitHub</b>\ncard-noticia-story.png retornou url null')
    }

    // 6. Marca como postada para evitar repetição
    if (publicado) await marcarNoticiaPostada(chave)

  } catch (e) {
    console.error('Erro no post de noticia:', e.message)
  }

  console.log('[' + new Date().toISOString() + '] Post de noticia finalizado')
}

module.exports = { postarNoticia, gerarCardNoticia, gerarCardNoticiaStory }
