require('dotenv').config()
const axios = require('axios')
const { gerarESubirImagem } = require('./gerarImagem')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY
const ZERNIO_ACCOUNT_ID = process.env.ZERNIO_ACCOUNT_ID

async function gerarTextoComClaude(jogo) {
  try {
    const prompt = `Voce e um especialista em futebol e apostas esportivas brasileiro.
Gere um post curto e envolvente para o Instagram sobre esse jogo:

Time casa: ${jogo.timeCasa}
Time fora: ${jogo.timeFora}
Liga: ${jogo.liga}
Data: ${jogo.dataJogo}

O post deve:
- Ter no maximo 5 linhas
- Criar curiosidade sobre o jogo sem revelar a aposta
- Terminar com "Nossos assinantes ja sabem o que os dados dizem. Link na bio."
- Tom confiante e direto
- Sem emojis excessivos, no maximo 2
- Em portugues brasileiro informal

Retorne APENAS o texto do post, sem aspas, sem explicacoes.`

    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
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
    console.log('Texto gerado pelo Claude:', texto)
    return texto

  } catch (err) {
    console.error('Erro ao chamar Claude API:', err.response?.data || err.message)
    return null
  }
}

function gerarHashtags(liga) {
  const hashtagsPorLiga = {
    'Campeonato Brasileiro Serie A': '#brasileirao #futebolbrasileiro #serieA',
    'UEFA Champions League': '#championsleague #ucl #futeboleuropeu',
    'Premier League': '#premierleague #futebolengles',
    'Copa Libertadores': '#libertadores #conmebol',
    'La Liga': '#laliga #futebolespanhol',
    'Bundesliga': '#bundesliga #futebolalemo',
    'Serie A': '#serieA #futebolitaliano',
    'Ligue 1': '#ligue1 #futebolfrances'
  }

  const base = hashtagsPorLiga[liga] || '#futebol #apostasesportivas'
  return base + ' #apostas #valuebets #gollucrativo #futebol #apostasesportivas #tipster'
}

async function gerarImagemContexto(jogo) {
  const { createCanvas } = require('canvas')
  const fs = require('fs')
  const path = require('path')

  const width = 1080
  const height = 1080
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Fundo escuro elegante
  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, width, height)

  // Grade sutil
  ctx.strokeStyle = 'rgba(255,255,255,0.025)'
  ctx.lineWidth = 1
  for (let i = 0; i < width; i += 80) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke()
  }

  // Circulo decorativo
  ctx.fillStyle = '#e94560'
  ctx.globalAlpha = 0.05
  ctx.beginPath()
  ctx.arc(900, 200, 500, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // Barra topo
  ctx.fillStyle = '#e94560'
  ctx.fillRect(0, 0, width, 8)

  // Header
  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 48px Arial'
  ctx.fillText('GolLucrativo', 70, 85)

  ctx.fillStyle = '#444455'
  ctx.font = '22px Arial'
  ctx.fillText('@gol.lucrativo', 70, 118)

  // Tag da liga
  const ligaCurta = jogo.liga.length > 25 ? jogo.liga.substring(0, 25) + '...' : jogo.liga
  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 20px Arial'
  ctx.textAlign = 'right'
  ctx.fillText(ligaCurta.toUpperCase(), 1010, 85)
  ctx.textAlign = 'left'

  // Linha
  ctx.fillStyle = '#e94560'
  ctx.fillRect(70, 140, 940, 2)

  // Label JOGO DO DIA
  ctx.fillStyle = '#555566'
  ctx.font = 'bold 20px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('JOGO DO DIA', 540, 210)

  // VS central
  const maxLen = 18
  const casaNome = jogo.timeCasa.length > maxLen ? jogo.timeCasa.substring(0, maxLen) : jogo.timeCasa
  const foraNome = jogo.timeFora.length > maxLen ? jogo.timeFora.substring(0, maxLen) : jogo.timeFora

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 72px Arial'
  ctx.fillText(casaNome, 540, 310)

  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 52px Arial'
  ctx.fillText('VS', 540, 390)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 72px Arial'
  ctx.fillText(foraNome, 540, 470)

  // Data e horario
  const dataFormatada = new Date(jogo.dataJogo + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long'
  })
  ctx.fillStyle = '#888899'
  ctx.font = '26px Arial'
  ctx.fillText(dataFormatada, 540, 535)

  // Linha divisoria
  ctx.fillStyle = '#222233'
  ctx.fillRect(70, 565, 940, 1)

  // Caixa de curiosidade
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
  ctx.font = 'bold 20px Arial'
  ctx.fillText('O QUE OS DADOS DIZEM?', 540, 630)

  ctx.fillStyle = '#ccccdd'
  ctx.font = '24px Arial'
  ctx.fillText('Nossos assinantes ja receberam', 540, 675)
  ctx.fillText('a analise completa as 8h.', 540, 710)

  ctx.fillStyle = '#888899'
  ctx.font = '20px Arial'
  ctx.fillText('Brasileirao · Champions · Premier · Libertadores', 540, 760)

  // CTA
  ctx.fillStyle = '#e94560'
  ctx.beginPath()
  ctx.roundRect(215, 820, 650, 70, 35)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 26px Arial'
  ctx.fillText('ASSINAR — LINK NA BIO', 540, 863)

  ctx.fillStyle = '#444455'
  ctx.font = '22px Arial'
  ctx.fillText('Analise baseada em dados, nao em palpite', 540, 940)

  ctx.fillStyle = '#333344'
  ctx.font = '20px Arial'
  ctx.fillText('gollucrativo · apostas com metodo', 540, 975)

  ctx.textAlign = 'left'

  // Barra rodape
  ctx.fillStyle = '#e94560'
  ctx.fillRect(0, 1072, width, 8)

  // Salva
  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

  const caminhoLocal = path.join(assetsDir, 'card-contexto.png')
  fs.writeFileSync(caminhoLocal, canvas.toBuffer('image/png'))
  console.log('Imagem de contexto gerada')
  return caminhoLocal
}

async function subirImagemGithub(caminhoLocal) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN
  const GITHUB_REPO = process.env.GITHUB_REPO

  if (!GITHUB_TOKEN || !GITHUB_REPO) return null

  try {
    const conteudo = require('fs').readFileSync(caminhoLocal)
    const base64 = conteudo.toString('base64')
    const nomeArquivo = 'card-contexto.png'

    let sha = null
    try {
      const getRes = await axios.get(
        'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
        { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
      )
      sha = getRes.data.sha
    } catch (e) {}

    const body = { message: 'Atualiza card contexto', content: base64 }
    if (sha) body.sha = sha

    await axios.put(
      'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
      body,
      { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
    )

    const urlPublica = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/main/assets/' + nomeArquivo + '?t=' + Date.now()
    console.log('Imagem de contexto subida:', urlPublica)
    return urlPublica

  } catch (err) {
    console.error('Erro ao subir imagem de contexto:', err.message)
    return null
  }
}

async function publicarViaZernio(caption, imageUrl) {
  try {
    const res = await axios.post('https://zernio.com/api/v1/posts', {
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

    // Gera texto com Claude
    const texto = await gerarTextoComClaude(jogoDestaque)
    if (!texto) return

    // Hashtags
    const hashtags = gerarHashtags(jogoDestaque.liga)
    const caption = texto + '\n\n' + hashtags

    // Gera imagem
    const caminhoLocal = await gerarImagemContexto(jogoDestaque)

    // Sobe para GitHub
    const imageUrl = await subirImagemGithub(caminhoLocal)
    if (!imageUrl) return

    // Publica
    await publicarViaZernio(caption, imageUrl)

  } catch (err) {
    console.error('Erro no post de contexto:', err.message)
  }
}

module.exports = { postarContextoJogo }