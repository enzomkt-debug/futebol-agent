require('dotenv').config()
const axios = require('axios')
const path = require('path')
const fs = require('fs')
const { createCanvas, registerFont } = require('canvas')
const { subirImagemGithub } = require('./utils')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY
const ZERNIO_ACCOUNT_ID = process.env.ZERNIO_ACCOUNT_ID

try {
  registerFont(path.join(__dirname, 'fonts', 'DejaVuSans.ttf'), { family: 'DejaVu Sans', weight: 'normal' })
  registerFont(path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'), { family: 'DejaVu Sans', weight: 'bold' })
} catch(e) {}
const FONTE = 'DejaVu Sans'

async function gerarTextoComClaude(jogo) {
  try {
    const prompt = `Voce e um especialista em futebol e analise estatistica brasileiro.
Gere um post curto e envolvente para o Instagram sobre esse jogo:

Time casa: ${jogo.timeCasa}
Time fora: ${jogo.timeFora}
Liga: ${jogo.liga}
Data: ${jogo.dataJogo}

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
      }
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

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 72px ' + FONTE
  ctx.fillText(casaNome, 540, 310)

  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 52px ' + FONTE
  ctx.fillText('VS', 540, 390)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 72px ' + FONTE
  ctx.fillText(foraNome, 540, 470)

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

async function publicarViaZernio(caption, imageUrl) {
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
    console.log('Post de contexto publicado no Instagram!')
    return true
  } catch (err) {
    console.error('Erro ao publicar contexto:', err.response?.data || err.message)
    return false
  }
}

async function postarContextoJogo(jogoDestaque) {
  if (!jogoDestaque) {
    console.log('Nenhum jogo destaque para postar contexto.')
    return
  }

  if (!ZERNIO_API_KEY || !ZERNIO_ACCOUNT_ID) {
    console.log('Credenciais do Zernio nao configuradas.')
    return
  }

  try {
    console.log('Gerando post de contexto para:', jogoDestaque.timeCasa + ' x ' + jogoDestaque.timeFora)

    const texto = await gerarTextoComClaude(jogoDestaque)
    if (!texto) return

    const hashtags = gerarHashtags(jogoDestaque.liga)
    const caption = texto + '\n\n' + hashtags

    const caminhoLocal = await gerarImagemContexto(jogoDestaque)

    // [skip ci] incluído automaticamente via utils.subirImagemGithub
    const imageUrl = await subirImagemGithub(axios, caminhoLocal, 'card-contexto.png')
    if (!imageUrl) return

    await publicarViaZernio(caption, imageUrl)

  } catch (err) {
    console.error('Erro no post de contexto:', err.message)
  }
}

module.exports = { postarContextoJogo }
