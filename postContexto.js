require('dotenv').config()
const axios = require('axios')
const path = require('path')
const fs = require('fs')
const { createCanvas, loadImage, registerFont } = require('canvas')
const { subirImagemGithub } = require('./utils')
const { publicarFeed, publicarStory, credenciaisOk } = require('./publer')
const LOGOS = require('./logosMapa')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
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
} catch(e) { console.log('Aviso: erro ao registrar fonte DejaVu:', e.message) }
const FONTE = 'DejaVu Sans'

const ALIASES = {
  'athletico pr':        'Athletico Paranaense',
  'cap':                 'Athletico Paranaense',
  'ca paranaense':       'Athletico Paranaense',
  'atletico paranaense': 'Athletico Paranaense',
}

async function buscarLogoTime(nomeTime) {
  if (!nomeTime) return null
  try {
    const alias = ALIASES[nomeTime.toLowerCase()]
    const nomeFinal = alias || nomeTime
    let url = LOGOS[nomeFinal]
    if (!url) {
      const nome = nomeFinal.toLowerCase()
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

async function gerarTextoComClaude(jogo, turno) {
  try {
    const turnoLabel = turno === 'tarde' ? 'tarde' : 'manha'
    const angulo = turno === 'tarde'
      ? 'Foque em um angulo DIFERENTE do post da manha: explore o historico de confrontos diretos, o momento atual dos clubes ou uma estatistica defensiva relevante.'
      : 'Foque no contexto geral do confronto: importancia do jogo, forma recente dos times ou estatistica ofensiva marcante.'
    const prompt = `Voce e um especialista em futebol e analise estatistica brasileiro.
Gere um post curto e envolvente para o Instagram sobre esse jogo:

Time casa: ${jogo.timeCasa}
Time fora: ${jogo.timeFora}
Liga: ${jogo.liga}
Data: ${jogo.dataJogo}

Este e o post do turno ${turnoLabel}. ${angulo}

O post deve:
- Ter no maximo 5 linhas
- Criar curiosidade sobre o confronto com base em dados e historico dos times
- Mencionar algo relevante sobre o momento dos clubes, confrontos anteriores ou estatisticas
- Terminar com "Nossos assinantes ja sabem o que os dados dizem. Link na bio."
- Tom analitico e direto, como um comentarista de dados esportivos
- Sem emojis excessivos, no maximo 2
- Em portugues brasileiro informal
- NAO mencionar apostas, palpites, odds ou ganho financeiro de nenhum tipo

Retorne APENAS o texto do post, sem aspas, sem explicacoes.`

    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 30000
    })

    const texto = res.data.content[0].text.trim()
    console.log('Texto gerado pelo Claude para contexto')
    return texto

  } catch (err) {
    console.error('Erro ao chamar Claude API:', err.response?.data || err.message)
    return null
  }
}

function gerarHashtags(liga) {
  const l = liga.toLowerCase()
  let especificas = '#futebol #analiseesportiva'
  if (l.includes('brasileir') || l.includes('serie a') && l.includes('brasil')) especificas = '#brasileirao #futebolbrasileiro #serieA'
  else if (l.includes('champions')) especificas = '#championsleague #ucl #futeboleuropeu'
  else if (l.includes('premier')) especificas = '#premierleague #futebolengles'
  else if (l.includes('libertadores')) especificas = '#libertadores #conmebol'
  else if (l.includes('la liga') || l.includes('laliga')) especificas = '#laliga #futebolespanhol'
  else if (l.includes('bundesliga')) especificas = '#bundesliga #futebolalemo'
  else if (l.includes('serie a') || l.includes('seria a')) especificas = '#serieA #futebolitaliano'
  else if (l.includes('ligue')) especificas = '#ligue1 #futebolfrances'
  return especificas + ' #inteligenciaartificial #dadosesportivos #golmatchbr #futebol #estatisticas #futebolanalitico'
}

async function gerarImagemContexto(jogo) {
  const width = 1080
  const height = 1080
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(255,255,255,0.025)'
  ctx.lineWidth = 1
  for (let i = 0; i < width; i += 80) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke()
  }

  ctx.fillStyle = '#e94560'
  ctx.globalAlpha = 0.05
  ctx.beginPath()
  ctx.arc(900, 200, 500, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  ctx.fillStyle = '#e94560'
  ctx.fillRect(0, 0, width, 8)

  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 48px ' + FONTE
  ctx.fillText('Gol Match BR', 70, 85)

  ctx.fillStyle = '#444455'
  ctx.font = '22px ' + FONTE
  ctx.fillText('@golmatchbr', 70, 118)

  const ligaCurta = jogo.liga.length > 25 ? jogo.liga.substring(0, 25) + '...' : jogo.liga
  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 20px ' + FONTE
  ctx.textAlign = 'right'
  ctx.fillText(ligaCurta.toUpperCase(), 1010, 85)
  ctx.textAlign = 'left'

  ctx.fillStyle = '#e94560'
  ctx.fillRect(70, 140, 940, 2)

  ctx.fillStyle = '#555566'
  ctx.font = 'bold 20px ' + FONTE
  ctx.textAlign = 'center'
  ctx.fillText('ANALISE DO DIA', 540, 210)

  const maxLen = 18
  const casaNome = jogo.timeCasa.length > maxLen ? jogo.timeCasa.substring(0, maxLen) : jogo.timeCasa
  const foraNome = jogo.timeFora.length > maxLen ? jogo.timeFora.substring(0, maxLen) : jogo.timeFora

  // Carrega logos em paralelo
  const [logoCasa, logoFora] = await Promise.all([
    buscarLogoTime(jogo.timeCasa),
    buscarLogoTime(jogo.timeFora)
  ])

  // Nome time casa
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 72px ' + FONTE
  ctx.fillText(casaNome, 540, 310)

  // Escudo casa: à esquerda do texto, centralizado em y=275 (centro visual da linha 310)
  if (logoCasa) {
    ctx.font = 'bold 72px ' + FONTE
    const casaW = ctx.measureText(casaNome).width
    const cx = (540 - casaW / 2) - 10 - 40  // borda esq. do texto − 10px gap − metade do logo (40)
    const scale = Math.min(80 / logoCasa.width, 80 / logoCasa.height)
    const lw = logoCasa.width * scale
    const lh = logoCasa.height * scale
    ctx.drawImage(logoCasa, cx - lw / 2, 275 - lh / 2, lw, lh)
  }

  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 52px ' + FONTE
  ctx.fillText('VS', 540, 390)

  // Nome time fora
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 72px ' + FONTE
  ctx.fillText(foraNome, 540, 470)

  // Escudo fora: à direita do texto, centralizado em y=435 (centro visual da linha 470)
  if (logoFora) {
    ctx.font = 'bold 72px ' + FONTE
    const foraW = ctx.measureText(foraNome).width
    const cx = (540 + foraW / 2) + 10 + 40  // borda dir. do texto + 10px gap + metade do logo (40)
    const scale = Math.min(80 / logoFora.width, 80 / logoFora.height)
    const lw = logoFora.width * scale
    const lh = logoFora.height * scale
    ctx.drawImage(logoFora, cx - lw / 2, 435 - lh / 2, lw, lh)
  }

  const dataFormatada = new Date(jogo.dataJogo + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long'
  })
  ctx.fillStyle = '#888899'
  ctx.font = '26px ' + FONTE
  ctx.fillText(dataFormatada, 540, 535)

  ctx.fillStyle = '#222233'
  ctx.fillRect(70, 565, 940, 1)

  ctx.fillStyle = '#1a1a2e'
  const boxY = 590
  ctx.beginPath()
  ctx.roundRect(70, boxY, 940, 200, 16)
  ctx.fill()
  ctx.strokeStyle = '#333355'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.roundRect(70, boxY, 940, 200, 16)
  ctx.stroke()

  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 20px ' + FONTE
  ctx.fillText('O QUE OS DADOS DIZEM?', 540, 630)

  ctx.fillStyle = '#ccccdd'
  ctx.font = '24px ' + FONTE
  ctx.fillText('Nossos assinantes ja receberam', 540, 675)
  ctx.fillText('a analise completa as 8h.', 540, 710)

  ctx.fillStyle = '#888899'
  ctx.font = '20px ' + FONTE
  ctx.fillText('Brasileirao · Champions · Premier · Libertadores', 540, 760)

  ctx.fillStyle = '#e94560'
  ctx.beginPath()
  ctx.roundRect(215, 820, 650, 70, 35)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 26px ' + FONTE
  ctx.fillText('ASSINAR — LINK NA BIO', 540, 863)

  ctx.fillStyle = '#444455'
  ctx.font = '22px ' + FONTE
  ctx.fillText('Analise baseada em dados, nao em palpite', 540, 940)

  ctx.fillStyle = '#333344'
  ctx.font = '20px ' + FONTE
  ctx.fillText('golmatchbr · analise estatistica de futebol', 540, 975)

  ctx.textAlign = 'left'
  ctx.fillStyle = '#e94560'
  ctx.fillRect(0, 1072, width, 8)

  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

  const caminhoLocal = path.join(assetsDir, 'card-contexto.png')
  fs.writeFileSync(caminhoLocal, canvas.toBuffer('image/png'))
  console.log('Imagem de contexto gerada')
  return caminhoLocal
}


async function gerarImagemContextoStory(jogo) {
  const width = 1080
  const height = 1920
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(255,255,255,0.025)'
  ctx.lineWidth = 1
  for (let i = 0; i < width; i += 80) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke()
  }

  ctx.fillStyle = '#e94560'
  ctx.globalAlpha = 0.05
  ctx.beginPath()
  ctx.arc(900, 400, 600, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  ctx.fillStyle = '#e94560'
  ctx.fillRect(0, 0, width, 10)

  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 56px ' + FONTE
  ctx.textAlign = 'left'
  ctx.fillText('Gol Match BR', 70, 330)

  ctx.fillStyle = '#444455'
  ctx.font = '26px ' + FONTE
  ctx.fillText('@golmatchbr', 70, 370)

  const ligaCurta = jogo.liga.length > 25 ? jogo.liga.substring(0, 25) + '...' : jogo.liga
  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 22px ' + FONTE
  ctx.textAlign = 'right'
  ctx.fillText(ligaCurta.toUpperCase(), 1010, 330)
  ctx.textAlign = 'left'

  ctx.fillStyle = '#e94560'
  ctx.fillRect(70, 400, 940, 2)

  ctx.fillStyle = '#555566'
  ctx.font = 'bold 24px ' + FONTE
  ctx.textAlign = 'center'
  ctx.fillText('ANALISE DO DIA', 540, 470)

  const maxLen = 18
  const casaNome = jogo.timeCasa.length > maxLen ? jogo.timeCasa.substring(0, maxLen) : jogo.timeCasa
  const foraNome = jogo.timeFora.length > maxLen ? jogo.timeFora.substring(0, maxLen) : jogo.timeFora

  const [logoCasa, logoFora] = await Promise.all([
    buscarLogoTime(jogo.timeCasa),
    buscarLogoTime(jogo.timeFora)
  ])

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 80px ' + FONTE
  ctx.fillText(casaNome, 540, 620)

  if (logoCasa) {
    ctx.font = 'bold 80px ' + FONTE
    const casaW = ctx.measureText(casaNome).width
    const cx = (540 - casaW / 2) - 15 - 55
    const scale = Math.min(110 / logoCasa.width, 110 / logoCasa.height)
    const lw = logoCasa.width * scale
    const lh = logoCasa.height * scale
    ctx.drawImage(logoCasa, cx - lw / 2, 580 - lh / 2, lw, lh)
  }

  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 64px ' + FONTE
  ctx.fillText('VS', 540, 740)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 80px ' + FONTE
  ctx.fillText(foraNome, 540, 860)

  if (logoFora) {
    ctx.font = 'bold 80px ' + FONTE
    const foraW = ctx.measureText(foraNome).width
    const cx = (540 + foraW / 2) + 15 + 55
    const scale = Math.min(110 / logoFora.width, 110 / logoFora.height)
    const lw = logoFora.width * scale
    const lh = logoFora.height * scale
    ctx.drawImage(logoFora, cx - lw / 2, 820 - lh / 2, lw, lh)
  }

  const dataFormatada = new Date(jogo.dataJogo + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long'
  })
  ctx.fillStyle = '#888899'
  ctx.font = '30px ' + FONTE
  ctx.fillText(dataFormatada, 540, 940)

  ctx.fillStyle = '#222233'
  ctx.fillRect(70, 990, 940, 1)

  ctx.fillStyle = '#1a1a2e'
  const boxY = 1030
  ctx.beginPath()
  ctx.roundRect(70, boxY, 940, 280, 20)
  ctx.fill()
  ctx.strokeStyle = '#333355'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.roundRect(70, boxY, 940, 280, 20)
  ctx.stroke()

  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 24px ' + FONTE
  ctx.fillText('O QUE OS DADOS DIZEM?', 540, 1090)

  ctx.fillStyle = '#ccccdd'
  ctx.font = '30px ' + FONTE
  ctx.fillText('Nossos assinantes ja receberam', 540, 1165)
  ctx.fillText('a analise completa as 8h.', 540, 1210)

  ctx.fillStyle = '#888899'
  ctx.font = '22px ' + FONTE
  ctx.fillText('Brasileirao · Champions · Premier · Libertadores', 540, 1275)

  ctx.fillStyle = '#e94560'
  ctx.beginPath()
  ctx.roundRect(215, 1380, 650, 90, 45)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 32px ' + FONTE
  ctx.fillText('ASSINAR — LINK NA BIO', 540, 1435)

  ctx.fillStyle = '#444455'
  ctx.font = '24px ' + FONTE
  ctx.fillText('Analise baseada em dados, nao em palpite', 540, 1540)

  ctx.fillStyle = '#333344'
  ctx.font = '22px ' + FONTE
  ctx.fillText('golmatchbr · analise estatistica de futebol', 540, 1580)

  ctx.textAlign = 'left'
  ctx.fillStyle = '#e94560'
  ctx.fillRect(0, 1910, width, 10)

  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

  const caminhoLocal = path.join(assetsDir, 'card-contexto-story.png')
  fs.writeFileSync(caminhoLocal, canvas.toBuffer('image/png'))
  console.log('Imagem de story de contexto gerada')
  return caminhoLocal
}


async function postarContextoJogo(jogoDestaque, turno) {
  if (!jogoDestaque) {
    console.log('Nenhum jogo destaque para postar contexto.')
    return
  }

  if (!credenciaisOk()) {
    console.log('Credenciais do Publer nao configuradas — post de contexto cancelado.')
    return
  }

  if (!ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY nao configurada — post de contexto cancelado.')
    return
  }

  try {
    console.log('Gerando post de contexto para:', jogoDestaque.timeCasa + ' x ' + jogoDestaque.timeFora)

    const texto = await gerarTextoComClaude(jogoDestaque, turno)
    if (!texto) { console.log('Erro: Claude nao retornou texto para contexto — post cancelado'); return }

    const hashtags = gerarHashtags(jogoDestaque.liga)
    const caption = texto + '\n\n' + hashtags

    const caminhoLocal = await gerarImagemContexto(jogoDestaque)

    const imageUrl = await subirImagemGithub(axios, caminhoLocal, 'card-contexto.png')
    if (!imageUrl) {
      await enviarAlerta('🔴 <b>postContexto (feed) — Falha ao subir imagem para o GitHub</b>\ncard-contexto.png retornou url null')
      return
    }

    await publicarFeed(caption, imageUrl, 'contexto')

    const caminhoStory = await gerarImagemContextoStory(jogoDestaque)
    const urlStory = await subirImagemGithub(axios, caminhoStory, 'card-contexto-story.png')
    if (urlStory) {
      await publicarStory(urlStory, 'contexto-story')
    } else {
      await enviarAlerta('🔴 <b>postContexto (story) — Falha ao subir imagem para o GitHub</b>\ncard-contexto-story.png retornou url null')
    }

  } catch (err) {
    console.error('Erro no post de contexto:', err.message)
  }
}

module.exports = { postarContextoJogo }
