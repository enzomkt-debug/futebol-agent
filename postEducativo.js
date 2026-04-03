require('dotenv').config()
const axios = require('axios')
const { createCanvas, loadImage, registerFont } = require('canvas')
const fs = require('fs')
const path = require('path')
const { subirImagemGithub } = require('./utils')
const LOGOS = require('./logosMapa')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY
const ZERNIO_ACCOUNT_ID = process.env.ZERNIO_ACCOUNT_ID
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

try {
  registerFont(path.join(__dirname, 'fonts', 'DejaVuSans.ttf'), { family: 'DejaVu Sans', weight: 'normal' })
  registerFont(path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'), { family: 'DejaVu Sans', weight: 'bold' })
} catch (e) {
  console.log('Aviso: erro ao registrar fonte DejaVu:', e.message)
}
const FONTE = 'DejaVu Sans'

const VERDE = '#00c48c'
const AMARELO = '#f5c842'
const BRANCO = '#ffffff'
const NAVY = '#0a1628'

// ─── HELPERS ───

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    const test = current + word + ' '
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current.trim())
      current = word + ' '
    } else {
      current = test
    }
  }
  if (current.trim()) lines.push(current.trim())
  return lines
}

function diaDaSemana() {
  const agora = new Date()
  const sp = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return sp.getDay() // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab
}

function salvarCard(canvas, nome) {
  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)
  const caminho = path.join(assetsDir, nome)
  fs.writeFileSync(caminho, canvas.toBuffer('image/png'))
  return caminho
}

async function carregarFundo(ctx, imagemUrl, width, height) {
  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, width, height)
  if (imagemUrl) {
    try {
      const img = await loadImage(imagemUrl)
      ctx.drawImage(img, 0, 0, width, height)
    } catch (err) {
      console.log('Erro ao carregar imagem de fundo:', err.message)
    }
  }
}

// ─── UNSPLASH ───

async function buscarImagemUnsplash(query) {
  const FALLBACKS = [
    'brazilian soccer stadium',
    'futebol brasileiro torcida',
    'soccer match brazil crowd',
    'estadio futebol brasil',
    'brazilian football fans'
  ]

  async function tentarBusca(q) {
    try {
      const res = await axios.get('https://api.unsplash.com/photos/random', {
        headers: { Authorization: 'Client-ID ' + UNSPLASH_ACCESS_KEY },
        params: { query: q, orientation: 'squarish', content_filter: 'high' },
        timeout: 15000
      })
      return res.data.urls.regular
    } catch (err) {
      console.error('Erro ao buscar imagem Unsplash (' + q + '):', err.message)
      return null
    }
  }

  const resultado = await tentarBusca(query + ' soccer brazil stadium')
  if (resultado) return resultado

  for (const fallback of FALLBACKS) {
    const url = await tentarBusca(fallback)
    if (url) return url
  }
  return null
}

// ─── LOGOS ───

async function buscarLogoTime(nomeTime) {
  if (!nomeTime) return null
  try {
    // Busca exata
    let url = LOGOS[nomeTime]
    // Match parcial: "SC Internacional" bate em "Internacional"
    if (!url) {
      const nome = nomeTime.toLowerCase()
      const chave = Object.keys(LOGOS).find(function(k) {
        const kl = k.toLowerCase()
        return kl.includes(nome) || nome.includes(kl)
      })
      if (chave) url = LOGOS[chave]
    }
    if (!url) return null
    return await loadImage(url)
  } catch (e) {
    return null
  }
}

// ─── CLAUDE ───

function formatarH2H(h2hData) {
  if (!h2hData) return ''
  return '\nDados H2H: media de ' + h2hData.mediaGols.toFixed(1) + ' gols/jogo, ' +
    Math.round(h2hData.btts * 100) + '% dos jogos com ambos marcando.'
}

async function chamarClaude(prompt) {
  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 30000
    })
    return res.data.content[0].text.trim()
  } catch (e) {
    const status = e.response?.status
    console.error('Claude API falhou (' + (status || e.message) + ')')
    await enviarAlerta('🔴 <b>postEducativo — Claude API falhou</b>\n' + (status ? 'HTTP ' + status : e.message))
    return ''
  }
}

function extrairCampo(texto, campo) {
  for (const linha of texto.split('\n')) {
    if (linha.startsWith(campo + ':')) return linha.replace(campo + ':', '').trim()
  }
  return ''
}

function extrairBloco(texto, campo, proximo) {
  const prefixo = campo + ':'
  const idxI = texto.indexOf(prefixo)
  if (idxI < 0) return ''
  const start = idxI + prefixo.length
  if (proximo) {
    const idxF = texto.indexOf(proximo + ':')
    if (idxF > start) return texto.substring(start, idxF).trim()
  }
  return texto.substring(start).trim()
}

function listaJogos(jogos) {
  return jogos.slice(0, 5).map(function(j) {
    return j.timeCasa + ' x ' + j.timeFora + ' (' + j.liga + ') - ' + j.dataJogo
  }).join('\n')
}

// ─── TEXTOS POR FORMATO ───

async function gerarTextoFormato1(jogos, h2hData, turno) {
  const turnoLabel = turno === 'tarde' ? 'tarde' : 'manha'
  const resposta = await chamarClaude(
    'Voce e um especialista em estatistica de futebol. NUNCA mencione apostas, odds, palpites ou ganho financeiro.\n\n' +
    'Jogos:\n' + listaJogos(jogos) + formatarH2H(h2hData) + '\n\n' +
    'Este e o post do turno ' + turnoLabel + '. Gere uma curiosidade COMPLETAMENTE DIFERENTE de qualquer outra que voce ja gerou hoje. ' +
    'Varie o tema: historia do futebol, recordes, curiosidades de jogadores, regras inusitadas, estadios, Copas do Mundo, etc.\n\n' +
    'Escolha o confronto mais interessante. Retorne EXATAMENTE neste formato:\n' +
    'CURIOSIDADE: [fato historico real e impactante sobre estes times, maximo 12 palavras]\n' +
    'CONFRONTO: [Time Casa x Time Fora - DD/MM]\n' +
    'TEXTO: [legenda Instagram 5 linhas, curioso, termine com "Quem esta no grupo ja sabe o que os dados dizem hoje. Link na bio."]\n' +
    'QUERY_IMAGEM: [3 palavras ingles para foto estadio lotado]'
  )
  return {
    curiosidade: extrairCampo(resposta, 'CURIOSIDADE') || 'O historico entre esses times esconde segredos',
    confronto: extrairCampo(resposta, 'CONFRONTO'),
    texto: extrairBloco(resposta, 'TEXTO', 'QUERY_IMAGEM'),
    query: extrairCampo(resposta, 'QUERY_IMAGEM') || 'soccer stadium crowd'
  }
}

async function gerarTextoFormato2(jogos, h2hData, turno) {
  const turnoLabel = turno === 'tarde' ? 'tarde' : 'manha'
  const resposta = await chamarClaude(
    'Voce e um especialista em estatistica de futebol. NUNCA mencione apostas, odds, palpites ou ganho financeiro.\n\n' +
    'Jogos:\n' + listaJogos(jogos) + formatarH2H(h2hData) + '\n\n' +
    'Este e o post do turno ' + turnoLabel + '. Escolha um numero/estatistica COMPLETAMENTE DIFERENTE do que seria destacado no turno oposto. Varie entre: gols marcados, aproveitamento, sequencias de jogos, confrontos diretos, gols sofridos, jogos sem perder, etc.\n\n' +
    'Escolha o confronto mais interessante. Retorne EXATAMENTE neste formato:\n' +
    'NUMERO: [so o numero ou percentual mais impactante, ex: "73%" ou "8" — maximo 5 caracteres]\n' +
    'DESCRICAO: [o que esse numero significa, maximo 8 palavras]\n' +
    'CONFRONTO: [Time Casa x Time Fora - DD/MM]\n' +
    'TEXTO: [legenda Instagram 4 linhas, impactante, termine com "Analise completa no Telegram. Link na bio."]\n' +
    'QUERY_IMAGEM: [3 palavras ingles para foto futebol brasileiro]'
  )
  return {
    numero: extrairCampo(resposta, 'NUMERO') || '?',
    descricao: extrairCampo(resposta, 'DESCRICAO') || 'estatistica relevante do confronto',
    confronto: extrairCampo(resposta, 'CONFRONTO'),
    texto: extrairBloco(resposta, 'TEXTO', 'QUERY_IMAGEM'),
    query: extrairCampo(resposta, 'QUERY_IMAGEM') || 'brazil soccer fans'
  }
}

async function gerarTextoFormato3(jogos, h2hData, turno) {
  const turnoLabel = turno === 'tarde' ? 'tarde' : 'manha'
  const resposta = await chamarClaude(
    'Voce e um especialista em estatistica de futebol. NUNCA mencione apostas, odds, palpites ou ganho financeiro.\n\n' +
    'Jogos:\n' + listaJogos(jogos) + formatarH2H(h2hData) + '\n\n' +
    'Este e o post do turno ' + turnoLabel + '. Gere uma pergunta/cenario COMPLETAMENTE DIFERENTE do que seria gerado no turno oposto. Varie os angulos: goleiro heroi, primeiro gol, virada, defesa decisiva, jogador especifico, atmosfera do estadio, etc.\n\n' +
    'Escolha o confronto mais interessante. Retorne EXATAMENTE neste formato:\n' +
    'PERGUNTA: [pergunta suspense sobre o confronto, comeca com "E SE..." ou "O QUE ACONTECE SE...", maximo 10 palavras — a pergunta deve ser unica e diferente de variacoes obvias como "e se perder" ou "e se nao vencer" — seja mais criativo, ex: "E SE o goleiro for o heroi?", "E SE o primeiro gol definir tudo?"]\n' +
    'TIME_CASA: [nome curto time da casa, maximo 12 caracteres]\n' +
    'TIME_FORA: [nome curto time visitante, maximo 12 caracteres]\n' +
    'CONFRONTO: [Time Casa x Time Fora - DD/MM]\n' +
    'TEXTO: [legenda Instagram 5 linhas, suspense sem responder, termine com "A resposta esta no grupo do Telegram. Link na bio."]\n' +
    'QUERY_IMAGEM: [3 palavras ingles para foto estadio brasileiro lotado]'
  )
  return {
    pergunta: extrairCampo(resposta, 'PERGUNTA') || 'E se o historico se repetir hoje?',
    timeCasa: extrairCampo(resposta, 'TIME_CASA') || (jogos[0] && jogos[0].timeCasa.split(' ')[0]) || 'Casa',
    timeFora: extrairCampo(resposta, 'TIME_FORA') || (jogos[0] && jogos[0].timeFora.split(' ')[0]) || 'Fora',
    confronto: extrairCampo(resposta, 'CONFRONTO'),
    texto: extrairBloco(resposta, 'TEXTO', 'QUERY_IMAGEM'),
    query: extrairCampo(resposta, 'QUERY_IMAGEM') || 'soccer brazil stadium'
  }
}

async function gerarTextoFormato4(jogos, h2hData, turno) {
  const turnoLabel = turno === 'tarde' ? 'tarde' : 'manha'
  const resposta = await chamarClaude(
    'Voce e um especialista em estatistica de futebol. NUNCA mencione apostas, odds, palpites ou ganho financeiro.\n\n' +
    'Jogos:\n' + listaJogos(jogos) + formatarH2H(h2hData) + '\n\n' +
    'Este e o post do turno ' + turnoLabel + '. Escolha 3 metricas COMPLETAMENTE DIFERENTES das que seriam usadas no turno oposto. Varie entre: gols marcados, gols sofridos, aproveitamento, posse de bola, chutes a gol, escanteios, cartoes, vitorias em casa/fora, sequencia invicto, etc.\n\n' +
    'Escolha o confronto mais interessante. Use dados reais dos ultimos 6 jogos. Retorne EXATAMENTE neste formato:\n' +
    'TIME_CASA: [nome curto time da casa, maximo 12 caracteres]\n' +
    'TIME_FORA: [nome curto time visitante, maximo 12 caracteres]\n' +
    'CONFRONTO: [Time Casa x Time Fora - DD/MM]\n' +
    'M1_NOME: [metrica 1, ex: "Gols Marcados" — maximo 2 palavras]\n' +
    'M1_CASA: [valor time casa, ex: "2.3/jogo"]\n' +
    'M1_FORA: [valor time fora]\n' +
    'M2_NOME: [metrica 2, ex: "Gols Sofridos"]\n' +
    'M2_CASA: [valor time casa]\n' +
    'M2_FORA: [valor time fora]\n' +
    'M3_NOME: [metrica 3, ex: "Aproveitamento"]\n' +
    'M3_CASA: [valor time casa, ex: "67%"]\n' +
    'M3_FORA: [valor time fora]\n' +
    'TEXTO: [legenda Instagram 4 linhas, analitico, termine com "Analise completa no Telegram. Link na bio."]'
  )
  return {
    timeCasa: extrairCampo(resposta, 'TIME_CASA') || 'Casa',
    timeFora: extrairCampo(resposta, 'TIME_FORA') || 'Fora',
    confronto: extrairCampo(resposta, 'CONFRONTO'),
    metricas: [
      { nome: extrairCampo(resposta, 'M1_NOME'), casa: extrairCampo(resposta, 'M1_CASA'), fora: extrairCampo(resposta, 'M1_FORA') },
      { nome: extrairCampo(resposta, 'M2_NOME'), casa: extrairCampo(resposta, 'M2_CASA'), fora: extrairCampo(resposta, 'M2_FORA') },
      { nome: extrairCampo(resposta, 'M3_NOME'), casa: extrairCampo(resposta, 'M3_CASA'), fora: extrairCampo(resposta, 'M3_FORA') }
    ],
    texto: extrairBloco(resposta, 'TEXTO', null)
  }
}

// ═══════════════════════════════════════════
// FORMATO 1 — "VOCÊ SABIA?" — FEED 1080x1080
// ═══════════════════════════════════════════

async function gerarFeed_Formato1(curiosidade, confronto, imagemUrl) {
  const W = 1080, H = 1080
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  await carregarFundo(ctx, imagemUrl, W, H)
  ctx.fillStyle = 'rgba(0,0,0,0.74)'
  ctx.fillRect(0, 0, W, H)

  const cX = 70, cY = 200, cW = 940, cH = 640

  ctx.fillStyle = 'rgba(0,0,0,0.82)'
  ctx.beginPath()
  ctx.roundRect(cX, cY, cW, cH, 20)
  ctx.fill()

  ctx.strokeStyle = VERDE
  ctx.lineWidth = 3
  ctx.shadowColor = VERDE
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.roundRect(cX, cY, cW, cH, 20)
  ctx.stroke()
  ctx.shadowBlur = 0

  // Chevrons decorativos nos cantos do card
  ctx.font = 'bold 72px ' + FONTE
  ctx.fillStyle = 'rgba(0,196,140,0.22)'
  ctx.textAlign = 'left'
  ctx.fillText('«', cX + 14, cY + 66)
  ctx.textAlign = 'right'
  ctx.fillText('»', cX + cW - 14, cY + 66)
  ctx.textAlign = 'left'
  ctx.fillText('«', cX + 14, cY + cH - 14)
  ctx.textAlign = 'right'
  ctx.fillText('»', cX + cW - 14, cY + cH - 14)

  ctx.textAlign = 'center'
  ctx.fillStyle = VERDE
  ctx.font = 'bold 44px ' + FONTE
  ctx.fillText('VOCÊ SABIA?', W / 2, cY + 68)

  ctx.fillStyle = 'rgba(0,196,140,0.5)'
  ctx.fillRect(cX + 60, cY + 86, cW - 120, 2)

  let fs = 68
  ctx.font = 'bold ' + fs + 'px ' + FONTE
  let linhas = wrapText(ctx, curiosidade, cW - 120)
  if (linhas.length > 4) {
    fs = 52
    ctx.font = 'bold ' + fs + 'px ' + FONTE
    linhas = wrapText(ctx, curiosidade, cW - 120)
  }
  const lH = fs + 14
  const totalH = linhas.length * lH
  let y = cY + 86 + (cH - 86 - 90 - totalH) / 2 + fs

  ctx.fillStyle = BRANCO
  ctx.shadowColor = 'rgba(0,196,140,0.35)'
  ctx.shadowBlur = 10
  linhas.forEach(function(l) { ctx.fillText(l, W / 2, y); y += lH })
  ctx.shadowBlur = 0

  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.fillRect(cX + 60, cY + cH - 88, cW - 120, 2)

  ctx.fillStyle = BRANCO
  ctx.font = 'bold 36px ' + FONTE
  ctx.fillText(confronto, W / 2, cY + cH - 42)

  console.log('Card educativo gerado (Formato 1 — Voce Sabia?)')
  return salvarCard(canvas, 'card-educativo.png')
}

// ════════════════════════════════════════════
// FORMATO 1 — "VOCÊ SABIA?" — STORY 1080x1920
// ════════════════════════════════════════════

async function gerarStory_Formato1(curiosidade, confronto, imagemUrl) {
  const W = 1080, H = 1920
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  await carregarFundo(ctx, imagemUrl, W, H)
  ctx.fillStyle = 'rgba(0,0,0,0.76)'
  ctx.fillRect(0, 0, W, H)

  const cX = 70, cY = 460, cW = 940, cH = 880

  ctx.fillStyle = 'rgba(0,0,0,0.84)'
  ctx.beginPath()
  ctx.roundRect(cX, cY, cW, cH, 24)
  ctx.fill()

  ctx.strokeStyle = VERDE
  ctx.lineWidth = 3
  ctx.shadowColor = VERDE
  ctx.shadowBlur = 20
  ctx.beginPath()
  ctx.roundRect(cX, cY, cW, cH, 24)
  ctx.stroke()
  ctx.shadowBlur = 0

  ctx.font = 'bold 100px ' + FONTE
  ctx.fillStyle = 'rgba(0,196,140,0.2)'
  ctx.textAlign = 'left'
  ctx.fillText('«', cX + 16, cY + 94)
  ctx.textAlign = 'right'
  ctx.fillText('»', cX + cW - 16, cY + 94)
  ctx.textAlign = 'left'
  ctx.fillText('«', cX + 16, cY + cH - 14)
  ctx.textAlign = 'right'
  ctx.fillText('»', cX + cW - 16, cY + cH - 14)

  ctx.textAlign = 'center'
  ctx.fillStyle = VERDE
  ctx.font = 'bold 54px ' + FONTE
  ctx.fillText('VOCÊ SABIA?', W / 2, cY + 84)

  ctx.fillStyle = 'rgba(0,196,140,0.5)'
  ctx.fillRect(cX + 80, cY + 104, cW - 160, 2)

  let fs = 80
  ctx.font = 'bold ' + fs + 'px ' + FONTE
  let linhas = wrapText(ctx, curiosidade, cW - 140)
  if (linhas.length > 4) {
    fs = 64
    ctx.font = 'bold ' + fs + 'px ' + FONTE
    linhas = wrapText(ctx, curiosidade, cW - 140)
  }
  const lH = fs + 16
  const totalH = linhas.length * lH
  let y = cY + 104 + (cH - 104 - 130 - totalH) / 2 + fs

  ctx.fillStyle = BRANCO
  ctx.shadowColor = 'rgba(0,196,140,0.3)'
  ctx.shadowBlur = 12
  linhas.forEach(function(l) { ctx.fillText(l, W / 2, y); y += lH })
  ctx.shadowBlur = 0

  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.fillRect(cX + 80, cY + cH - 112, cW - 160, 2)

  ctx.fillStyle = BRANCO
  ctx.font = 'bold 42px ' + FONTE
  ctx.fillText(confronto, W / 2, cY + cH - 60)

  ctx.textAlign = 'center'
  ctx.fillStyle = VERDE
  ctx.font = 'bold 34px ' + FONTE
  ctx.fillText('Quem esta no grupo ja sabe o que os dados dizem', W / 2, 1730)
  ctx.fillText('•  Link na bio', W / 2, 1772)

  console.log('Story educativo gerado (Formato 1)')
  return salvarCard(canvas, 'card-educativo-story.png')
}

// ═══════════════════════════════════════════
// FORMATO 2 — "O NÚMERO" — FEED 1080x1080
// ═══════════════════════════════════════════

async function gerarFeed_Formato2(numero, descricao, confronto) {
  const W = 1080, H = 1080
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#080808'
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'

  ctx.fillStyle = 'rgba(0,196,140,0.65)'
  ctx.font = 'bold 32px ' + FONTE
  ctx.fillText('@golmatchbr', W / 2, 86)

  let numSize = 280
  if (numero.length >= 4) numSize = 220
  if (numero.length >= 5) numSize = 180

  ctx.font = 'bold ' + numSize + 'px ' + FONTE
  const grad = ctx.createLinearGradient(280, 360, 800, 360 + numSize)
  grad.addColorStop(0, VERDE)
  grad.addColorStop(1, AMARELO)
  ctx.fillStyle = grad
  ctx.shadowColor = VERDE
  ctx.shadowBlur = 44
  ctx.fillText(numero, W / 2, 610)
  ctx.shadowBlur = 0

  ctx.fillStyle = VERDE
  ctx.fillRect(280, 638, 520, 3)

  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '42px ' + FONTE
  const linhasDesc = wrapText(ctx, descricao, 820)
  let yD = 704
  linhasDesc.forEach(function(l) { ctx.fillText(l, W / 2, yD); yD += 54 })

  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '34px ' + FONTE
  ctx.fillText(confronto, W / 2, 980)

  console.log('Card educativo gerado (Formato 2 — O Numero)')
  return salvarCard(canvas, 'card-educativo.png')
}

// ════════════════════════════════════════════
// FORMATO 2 — "O NÚMERO" — STORY 1080x1920
// ════════════════════════════════════════════

async function gerarStory_Formato2(numero, descricao, confronto) {
  const W = 1080, H = 1920
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#080808'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'

  ctx.fillStyle = 'rgba(0,196,140,0.65)'
  ctx.font = 'bold 38px ' + FONTE
  ctx.fillText('@golmatchbr', W / 2, 160)

  let numSize = 400
  if (numero.length >= 4) numSize = 320
  if (numero.length >= 5) numSize = 260

  ctx.font = 'bold ' + numSize + 'px ' + FONTE
  const grad = ctx.createLinearGradient(180, 700, 900, 700 + numSize)
  grad.addColorStop(0, VERDE)
  grad.addColorStop(1, AMARELO)
  ctx.fillStyle = grad
  ctx.shadowColor = VERDE
  ctx.shadowBlur = 60
  ctx.fillText(numero, W / 2, 1110)
  ctx.shadowBlur = 0

  ctx.fillStyle = VERDE
  ctx.fillRect(240, 1148, 600, 4)

  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '50px ' + FONTE
  const linhasDesc = wrapText(ctx, descricao, 860)
  let yD = 1232
  linhasDesc.forEach(function(l) { ctx.fillText(l, W / 2, yD); yD += 64 })

  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '40px ' + FONTE
  ctx.fillText(confronto, W / 2, yD + 60)

  ctx.fillStyle = VERDE
  ctx.font = 'bold 36px ' + FONTE
  ctx.fillText('Analise completa no Telegram  •  Link na bio', W / 2, 1780)

  console.log('Story educativo gerado (Formato 2)')
  return salvarCard(canvas, 'card-educativo-story.png')
}

// ═══════════════════════════════════════════
// FORMATO 3 — "E SE..." — FEED 1080x1080
// ═══════════════════════════════════════════

async function gerarFeed_Formato3(pergunta, timeCasa, timeFora, confronto, imagemUrl) {
  const W = 1080, H = 1080
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  await carregarFundo(ctx, imagemUrl, W, H)
  ctx.fillStyle = 'rgba(0,0,0,0.68)'
  ctx.fillRect(0, 0, W, H)

  // Carrega escudos em paralelo (nunca quebra se falhar)
  const [logoCasa, logoFora] = await Promise.all([
    buscarLogoTime(timeCasa),
    buscarLogoTime(timeFora)
  ])

  ctx.textAlign = 'center'

  // Pergunta no topo
  let fs = 62
  ctx.font = 'bold ' + fs + 'px ' + FONTE
  let linhas = wrapText(ctx, pergunta, 920)
  if (linhas.length > 3) {
    fs = 50
    ctx.font = 'bold ' + fs + 'px ' + FONTE
    linhas = wrapText(ctx, pergunta, 920)
  }
  ctx.fillStyle = BRANCO
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 10
  let yP = 120
  linhas.forEach(function(l) { ctx.fillText(l, W / 2, yP); yP += fs + 14 })
  ctx.shadowBlur = 0

  // Escudos: acima da linha divisória, nas laterais (160x160, centro y=440)
  function desenharLogo(logo, xCenter, yCenter, size) {
    if (!logo) return
    const scale = Math.min(size / logo.width, size / logo.height)
    const lw = logo.width * scale
    const lh = logo.height * scale
    ctx.drawImage(logo, xCenter - lw / 2, yCenter - lh / 2, lw, lh)
  }
  desenharLogo(logoCasa, 240, 440, 160)
  desenharLogo(logoFora, 840, 440, 160)

  // Linha central
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(60, 538, 960, 2)

  // VS com degradê
  const vsGrad = ctx.createLinearGradient(440, 440, 640, 620)
  vsGrad.addColorStop(0, VERDE)
  vsGrad.addColorStop(1, AMARELO)
  ctx.fillStyle = vsGrad
  ctx.font = 'bold 130px ' + FONTE
  ctx.shadowColor = VERDE
  ctx.shadowBlur = 28
  ctx.fillText('VS', W / 2, 580)
  ctx.shadowBlur = 0

  // Time casa — esquerda (abaixo do VS)
  ctx.textAlign = 'left'
  ctx.fillStyle = VERDE
  ctx.font = 'bold 52px ' + FONTE
  ctx.fillText(timeCasa, 80, 670)

  // Time fora — direita (abaixo do VS)
  ctx.textAlign = 'right'
  ctx.fillStyle = BRANCO
  ctx.font = 'bold 52px ' + FONTE
  ctx.fillText(timeFora, W - 80, 670)

  // Confronto rodapé
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = 'bold 34px ' + FONTE
  ctx.fillText(confronto, W / 2, 980)

  console.log('Card educativo gerado (Formato 3 — E Se...)')
  return salvarCard(canvas, 'card-educativo.png')
}

// ════════════════════════════════════════════
// FORMATO 3 — "E SE..." — STORY 1080x1920
// ════════════════════════════════════════════

async function gerarStory_Formato3(pergunta, timeCasa, timeFora, confronto, imagemUrl) {
  const W = 1080, H = 1920
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  await carregarFundo(ctx, imagemUrl, W, H)

  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, 'rgba(0,0,0,0.62)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.46)')
  grad.addColorStop(1, 'rgba(0,0,0,0.9)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Carrega escudos em paralelo (nunca quebra se falhar)
  const [logoCasa, logoFora] = await Promise.all([
    buscarLogoTime(timeCasa),
    buscarLogoTime(timeFora)
  ])

  ctx.textAlign = 'center'

  // Pergunta
  let fs = 74
  ctx.font = 'bold ' + fs + 'px ' + FONTE
  let linhas = wrapText(ctx, pergunta, 920)
  if (linhas.length > 3) {
    fs = 60
    ctx.font = 'bold ' + fs + 'px ' + FONTE
    linhas = wrapText(ctx, pergunta, 920)
  }
  ctx.fillStyle = BRANCO
  let yP = 370
  linhas.forEach(function(l) { ctx.fillText(l, W / 2, yP); yP += fs + 16 })

  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.fillRect(80, 790, 920, 2)

  // Escudo time casa — centralizado (200x200, centro y=910)
  function desenharLogo(logo, xCenter, yCenter, size) {
    if (!logo) return
    const scale = Math.min(size / logo.width, size / logo.height)
    const lw = logo.width * scale
    const lh = logo.height * scale
    ctx.drawImage(logo, xCenter - lw / 2, yCenter - lh / 2, lw, lh)
  }
  desenharLogo(logoCasa, W / 2, 910, 200)

  // Casa em cima
  ctx.fillStyle = VERDE
  ctx.font = 'bold 80px ' + FONTE
  ctx.fillText(timeCasa, W / 2, 1050)

  // VS
  const vsGrad = ctx.createLinearGradient(400, 1090, 680, 1230)
  vsGrad.addColorStop(0, VERDE)
  vsGrad.addColorStop(1, AMARELO)
  ctx.fillStyle = vsGrad
  ctx.font = 'bold 164px ' + FONTE
  ctx.shadowColor = VERDE
  ctx.shadowBlur = 36
  ctx.fillText('VS', W / 2, 1220)
  ctx.shadowBlur = 0

  // Escudo time fora — centralizado (200x200, centro y=1360)
  desenharLogo(logoFora, W / 2, 1360, 200)

  // Fora embaixo
  ctx.fillStyle = BRANCO
  ctx.font = 'bold 80px ' + FONTE
  ctx.fillText(timeFora, W / 2, 1500)

  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.fillRect(80, 1550, 920, 2)

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = 'bold 40px ' + FONTE
  ctx.fillText(confronto, W / 2, 1620)

  ctx.fillStyle = VERDE
  ctx.font = 'bold 36px ' + FONTE
  ctx.fillText('A resposta esta no Telegram  •  Link na bio', W / 2, 1780)

  console.log('Story educativo gerado (Formato 3)')
  return salvarCard(canvas, 'card-educativo-story.png')
}

// ═══════════════════════════════════════════
// FORMATO 4 — "RAIO-X" — FEED 1080x1080
// ═══════════════════════════════════════════

async function gerarFeed_Formato4(timeCasa, timeFora, metricas) {
  const W = 1080, H = 1080
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = NAVY
  ctx.fillRect(0, 0, W, H)

  // Faixa topo
  ctx.fillStyle = VERDE
  ctx.fillRect(0, 0, W, 6)

  ctx.textAlign = 'center'
  ctx.fillStyle = VERDE
  ctx.font = 'bold 60px ' + FONTE
  ctx.fillText('RAIO-X', W / 2, 92)

  ctx.fillStyle = 'rgba(0,196,140,0.4)'
  ctx.fillRect(80, 108, 920, 2)

  // Carrega logos em paralelo
  const [logoCasa4f, logoFora4f] = await Promise.all([
    buscarLogoTime(timeCasa),
    buscarLogoTime(timeFora)
  ])

  // Times — cabeçalho colunas (logos 60x60, centro y=158)
  function logoFeed4(logo, cx, cy) {
    if (!logo) return
    const sc = Math.min(60 / logo.width, 60 / logo.height)
    const lw = logo.width * sc, lh = logo.height * sc
    ctx.drawImage(logo, cx - lw / 2, cy - lh / 2, lw, lh)
  }
  logoFeed4(logoCasa4f, 90, 158)
  logoFeed4(logoFora4f, W - 90, 158)

  ctx.textAlign = 'left'
  ctx.fillStyle = VERDE
  ctx.font = 'bold 44px ' + FONTE
  ctx.fillText(timeCasa, logoCasa4f ? 130 : 90, 174)

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = 'bold 44px ' + FONTE
  ctx.fillText(timeFora, logoFora4f ? W - 130 : W - 90, 174)

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.font = '34px ' + FONTE
  ctx.fillText('vs', W / 2, 174)

  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(80, 194, 920, 1)

  // 3 cards de métricas lado a lado
  const mW = 296, mH = 240, gap = 26
  const totalW = 3 * mW + 2 * gap
  const startX = (W - totalW) / 2
  const startY = 228

  metricas.forEach(function(m, i) {
    const x = startX + i * (mW + gap)
    const cx = x + mW / 2

    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.beginPath()
    ctx.roundRect(x, startY, mW, mH, 12)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,196,140,0.28)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(x, startY, mW, mH, 12)
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '26px ' + FONTE
    ctx.fillText(m.nome, cx, startY + 36)

    ctx.fillStyle = 'rgba(0,196,140,0.3)'
    ctx.fillRect(x + 20, startY + 48, mW - 40, 1)

    ctx.fillStyle = VERDE
    ctx.font = 'bold 50px ' + FONTE
    ctx.fillText(m.casa, cx, startY + 116)

    ctx.fillStyle = 'rgba(0,196,140,0.55)'
    ctx.font = '22px ' + FONTE
    ctx.fillText(timeCasa, cx, startY + 146)

    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fillRect(cx - 36, startY + 158, 72, 1)

    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    ctx.font = 'bold 44px ' + FONTE
    ctx.fillText(m.fora, cx, startY + 202)

    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.font = '22px ' + FONTE
    ctx.fillText(timeFora, cx, startY + 226)
  })

  // Faixa rodapé
  ctx.fillStyle = VERDE
  ctx.fillRect(0, H - 6, W, 6)

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(0,196,140,0.55)'
  ctx.font = 'bold 30px ' + FONTE
  ctx.fillText('@golmatchbr', W / 2, H - 16)

  console.log('Card educativo gerado (Formato 4 — Raio-X)')
  return salvarCard(canvas, 'card-educativo.png')
}

// ════════════════════════════════════════════
// FORMATO 4 — "RAIO-X" — STORY 1080x1920
// ════════════════════════════════════════════

async function gerarStory_Formato4(timeCasa, timeFora, metricas) {
  const W = 1080, H = 1920
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = NAVY
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = VERDE
  ctx.fillRect(0, 0, W, 8)

  ctx.textAlign = 'center'
  ctx.fillStyle = VERDE
  ctx.font = 'bold 74px ' + FONTE
  ctx.fillText('RAIO-X', W / 2, 148)

  ctx.fillStyle = 'rgba(0,196,140,0.4)'
  ctx.fillRect(80, 172, 920, 2)

  // Carrega logos em paralelo
  const [logoCasa4s, logoFora4s] = await Promise.all([
    buscarLogoTime(timeCasa),
    buscarLogoTime(timeFora)
  ])

  // Times — cabeçalho colunas (logos 80x80, centro y=233)
  function logoStory4(logo, cx, cy) {
    if (!logo) return
    const sc = Math.min(80 / logo.width, 80 / logo.height)
    const lw = logo.width * sc, lh = logo.height * sc
    ctx.drawImage(logo, cx - lw / 2, cy - lh / 2, lw, lh)
  }
  logoStory4(logoCasa4s, 90, 233)
  logoStory4(logoFora4s, W - 90, 233)

  ctx.textAlign = 'left'
  ctx.fillStyle = VERDE
  ctx.font = 'bold 54px ' + FONTE
  ctx.fillText(timeCasa, logoCasa4s ? 140 : 90, 252)

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = 'bold 54px ' + FONTE
  ctx.fillText(timeFora, logoFora4s ? W - 140 : W - 90, 252)

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.font = '40px ' + FONTE
  ctx.fillText('vs', W / 2, 252)

  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(80, 274, 920, 1)

  // Métricas verticais — uma abaixo da outra com mais espaço
  const mH = 310, mW = 880
  const startX = (W - mW) / 2
  const startY = 320

  metricas.forEach(function(m, i) {
    const y = startY + i * (mH + 20)
    const cx = W / 2

    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.beginPath()
    ctx.roundRect(startX, y, mW, mH, 16)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,196,140,0.28)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(startX, y, mW, mH, 16)
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '32px ' + FONTE
    ctx.fillText(m.nome, cx, y + 48)

    ctx.fillStyle = 'rgba(0,196,140,0.3)'
    ctx.fillRect(startX + 30, y + 62, mW - 60, 1)

    // Valores lado a lado dentro do card
    ctx.fillStyle = VERDE
    ctx.font = 'bold 86px ' + FONTE
    ctx.textAlign = 'left'
    ctx.fillText(m.casa, startX + 60, y + 188)

    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = 'bold 78px ' + FONTE
    ctx.textAlign = 'right'
    ctx.fillText(m.fora, startX + mW - 60, y + 188)

    ctx.fillStyle = 'rgba(0,196,140,0.6)'
    ctx.font = '28px ' + FONTE
    ctx.textAlign = 'left'
    ctx.fillText(timeCasa, startX + 60, y + 232)

    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.font = '28px ' + FONTE
    ctx.textAlign = 'right'
    ctx.fillText(timeFora, startX + mW - 60, y + 232)
  })

  ctx.fillStyle = VERDE
  ctx.fillRect(0, H - 8, W, 8)

  ctx.textAlign = 'center'
  ctx.fillStyle = VERDE
  ctx.font = 'bold 36px ' + FONTE
  ctx.fillText('Analise completa no Telegram  •  Link na bio', W / 2, 1780)

  ctx.fillStyle = 'rgba(0,196,140,0.5)'
  ctx.font = 'bold 30px ' + FONTE
  ctx.fillText('@golmatchbr', W / 2, H - 20)

  console.log('Story educativo gerado (Formato 4)')
  return salvarCard(canvas, 'card-educativo-story.png')
}

// ─── PUBLICAÇÃO VIA ZERNIO ───

async function publicarViaZernio(caption, imageUrl) {
  if (process.env.TEST_MODE === 'true') {
    console.log('[TEST MODE] Publicação bloqueada (feed)')
    return true
  }
  try {
    await axios.post('https://zernio.com/api/v1/posts', {
      platforms: [{ platform: 'instagram', accountId: ZERNIO_ACCOUNT_ID }],
      content: caption,
      mediaItems: [{ type: 'image', url: imageUrl }],
      publishNow: true
    }, {
      headers: {
        'Authorization': 'Bearer ' + ZERNIO_API_KEY,
        'Content-Type': 'application/json'
      }
    })
    console.log('Post educativo publicado no Instagram!')
    return true
  } catch (err) {
    console.error('Erro ao publicar:', err.response?.data || err.message)
    return false
  }
}

async function publicarStoryViaZernio(imageUrl) {
  if (process.env.TEST_MODE === 'true') {
    console.log('[TEST MODE] Publicação bloqueada (story)')
    return true
  }
  try {
    await axios.post('https://zernio.com/api/v1/posts', {
      platforms: [{
        platform: 'instagram',
        accountId: ZERNIO_ACCOUNT_ID,
        platformSpecificData: { contentType: 'story' }
      }],
      content: '',
      mediaItems: [{ type: 'image', url: imageUrl }],
      publishNow: true
    }, {
      headers: {
        'Authorization': 'Bearer ' + ZERNIO_API_KEY,
        'Content-Type': 'application/json'
      }
    })
    console.log('Story educativo publicado!')
    return true
  } catch (err) {
    console.error('Erro ao publicar story educativo:', err.response?.data || err.message)
    return false
  }
}

function gerarHashtags(texto) {
  const base = '#futebol #dadosesportivos #analiseesportiva #golmatchbr #estatisticas #futebolanalitico'
  if (texto.toLowerCase().includes('brasileir')) return base + ' #brasileirao #futebolbrasileiro'
  if (texto.toLowerCase().includes('champions')) return base + ' #championsleague #ucl'
  if (texto.toLowerCase().includes('libertadores')) return base + ' #libertadores #conmebol'
  if (texto.toLowerCase().includes('premier')) return base + ' #premierleague'
  return base + ' #futebolmundial'
}

// ─── FUNÇÃO PRINCIPAL ───

async function postarConteudoEducativo(jogos, h2hData, turno) {
  if (!jogos || !jogos.length) {
    console.log('Nenhum jogo disponivel para post educativo.')
    return
  }
  if (!ZERNIO_API_KEY || !ZERNIO_ACCOUNT_ID) {
    console.log('Credenciais do Zernio nao configuradas.')
    return
  }
  if (!UNSPLASH_ACCESS_KEY) {
    console.log('Chave do Unsplash nao configurada.')
    return
  }

  // Seleciona jogo destaque: tarde usa jogos[1] se existir, manha usa jogos[0]
  const jogoDestaque = (turno === 'tarde' && jogos[1]) ? jogos[1] : jogos[0]
  // h2hData já vem buscado para o jogo destaque pelo chamador (index.js)

  try {
    // 0=Dom→4, 1=Seg→1, 2=Ter→2, 3=Qua→3, 4=Qui→1, 5=Sex→2, 6=Sab→3
    const formatoMap = { 0: 4, 1: 1, 2: 2, 3: 3, 4: 1, 5: 2, 6: 3 }
    const dia = diaDaSemana()
    const formato = formatoMap[dia]
    const nomes = { 1: 'Voce Sabia?', 2: 'O Numero', 3: 'E Se...', 4: 'Raio-X' }
    console.log('Gerando conteudo educativo — Formato ' + formato + ' (' + nomes[formato] + ') — turno: ' + (turno || 'manha') + '...')

    // Coloca o jogo destaque na frente para o Claude prioriza-lo
    const jogosOrdenados = jogoDestaque === jogos[0]
      ? jogos
      : [jogoDestaque, ...jogos.filter(function(j) { return j !== jogoDestaque })]

    let feedPath, storyPath, texto

    if (formato === 1) {
      const d = await gerarTextoFormato1(jogosOrdenados, h2hData, turno)
      if (!d.curiosidade) { console.log('Erro: Claude nao retornou CURIOSIDADE valida (Formato 1)'); return }
      const img = await buscarImagemUnsplash(d.query)
      feedPath = await gerarFeed_Formato1(d.curiosidade, d.confronto, img)
      storyPath = await gerarStory_Formato1(d.curiosidade, d.confronto, img)
      texto = d.texto

    } else if (formato === 2) {
      const d = await gerarTextoFormato2(jogosOrdenados, h2hData, turno)
      if (!d.numero) { console.log('Erro: Claude nao retornou NUMERO valido (Formato 2)'); return }
      feedPath = await gerarFeed_Formato2(d.numero, d.descricao, d.confronto)
      storyPath = await gerarStory_Formato2(d.numero, d.descricao, d.confronto)
      texto = d.texto

    } else if (formato === 3) {
      const d = await gerarTextoFormato3(jogosOrdenados, h2hData, turno)
      if (!d.pergunta) { console.log('Erro: Claude nao retornou PERGUNTA valida (Formato 3)'); return }
      const img = await buscarImagemUnsplash(d.query)
      feedPath = await gerarFeed_Formato3(d.pergunta, d.timeCasa, d.timeFora, d.confronto, img)
      storyPath = await gerarStory_Formato3(d.pergunta, d.timeCasa, d.timeFora, d.confronto, img)
      texto = d.texto

    } else {
      const d = await gerarTextoFormato4(jogosOrdenados, h2hData, turno)
      if (!d.timeCasa) { console.log('Erro: Claude nao retornou TIME_CASA valido (Formato 4)'); return }
      feedPath = await gerarFeed_Formato4(d.timeCasa, d.timeFora, d.metricas)
      storyPath = await gerarStory_Formato4(d.timeCasa, d.timeFora, d.metricas)
      texto = d.texto
    }

    const urlFeed = await subirImagemGithub(axios, feedPath, 'card-educativo.png')
    if (!urlFeed) { console.log('Erro: nao foi possivel subir card-educativo.png para o GitHub'); return }

    const hashtags = gerarHashtags(texto || '')
    await publicarViaZernio((texto || '') + '\n\n' + hashtags, urlFeed)

    const urlStory = await subirImagemGithub(axios, storyPath, 'card-educativo-story.png')
    if (urlStory) await publicarStoryViaZernio(urlStory)

  } catch (err) {
    console.error('Erro no post educativo:', err.message)
  }
}

module.exports = {
  postarConteudoEducativo,
  _test: {
    gerarTextoFormato1, gerarTextoFormato2, gerarTextoFormato3, gerarTextoFormato4,
    gerarFeed_Formato1, gerarStory_Formato1,
    gerarFeed_Formato2, gerarStory_Formato2,
    gerarFeed_Formato3, gerarStory_Formato3,
    gerarFeed_Formato4, gerarStory_Formato4,
    buscarImagemUnsplash
  }
}
