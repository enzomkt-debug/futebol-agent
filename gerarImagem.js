const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')
const axios = require('axios')

const CORES = {
  fundo: '#0d0d1a',
  acento: '#e94560',
  verde: '#00c48c',
  vermelho: '#e94560',
  amarelo: '#f7b731',
  branco: '#ffffff',
  cinzaClaro: '#ccccdd',
  cinzaEscuro: '#666688'
}

function arredondarRetangulo(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function verificarAcerto(aposta, resultado) {
  const totalGols = resultado.golsCasa + resultado.golsFora
  const ambasMarcaram = resultado.golsCasa > 0 && resultado.golsFora > 0
  if (aposta.mercado === 'Mais de 2.5 gols') return totalGols > 2
  if (aposta.mercado === 'Menos de 2.5 gols') return totalGols < 3
  if (aposta.mercado === 'Ambas marcam: SIM') return ambasMarcaram
  return false
}

async function gerarImagem(apostas, turno, resultados) {
  const width = 1080
  const height = 1080
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Fundo
  ctx.fillStyle = CORES.fundo
  ctx.fillRect(0, 0, width, height)

  // Grade sutil
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'
  ctx.lineWidth = 1
  for (let i = 0; i < width; i += 60) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke()
  }
  for (let i = 0; i < height; i += 60) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke()
  }

  // Círculo decorativo
  ctx.fillStyle = 'rgba(233, 69, 96, 0.05)'
  ctx.beginPath()
  ctx.arc(900, 150, 300, 0, Math.PI * 2)
  ctx.fill()

  // Barra topo
  ctx.fillStyle = CORES.acento
  ctx.fillRect(0, 0, width, 6)

  // Header
  ctx.fillStyle = CORES.acento
  ctx.font = 'bold 52px sans-serif'
  ctx.fillText('GolLucrativo', 60, 85)

  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)
  const dataOntem = ontem.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  ctx.fillStyle = CORES.cinzaClaro
  ctx.font = '28px sans-serif'
  ctx.fillText('Resultados de ' + dataOntem, 60, 125)

  // Linha divisória
  ctx.fillStyle = CORES.acento
  ctx.fillRect(60, 148, 960, 2)

  // Conteúdo de resultado
  if (!apostas || !apostas.length || !resultados || !resultados.length) {
    ctx.fillStyle = CORES.cinzaClaro
    ctx.font = '32px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Primeiro dia de operacao!', width / 2, 500)
    ctx.font = '24px sans-serif'
    ctx.fillStyle = CORES.cinzaEscuro
    ctx.fillText('Acompanhe nossos resultados diarios', width / 2, 560)
    ctx.textAlign = 'left'
  } else {
    let acertos = 0
    let total = 0
    let yAtual = 185

    for (let i = 0; i < Math.min(apostas.length, 5); i++) {
      const aposta = apostas[i]
      const resultado = resultados[i]
      if (!resultado) continue

      total++
      const acertou = verificarAcerto(aposta, resultado)
      if (acertou) acertos++

      const placar = resultado.golsCasa + ' x ' + resultado.golsFora
      const corCard = acertou ? 'rgba(0, 196, 140, 0.12)' : 'rgba(233, 69, 96, 0.12)'
      const corBorda = acertou ? CORES.verde : CORES.vermelho

      // Card
      ctx.fillStyle = corCard
      arredondarRetangulo(ctx, 60, yAtual, 960, 120, 12)
      ctx.fill()
      ctx.strokeStyle = corBorda
      ctx.lineWidth = 1.5
      arredondarRetangulo(ctx, 60, yAtual, 960, 120, 12)
      ctx.stroke()

      // Número
      ctx.fillStyle = CORES.cinzaEscuro
      ctx.font = '20px sans-serif'
      ctx.fillText((i + 1) + '.', 80, yAtual + 40)

      // Jogo
      ctx.fillStyle = CORES.branco
      ctx.font = 'bold 22px sans-serif'
      const nomeJogo = aposta.jogo.length > 38 ? aposta.jogo.substring(0, 38) + '...' : aposta.jogo
      ctx.fillText(nomeJogo, 108, yAtual + 40)

      // Mercado
      ctx.fillStyle = CORES.cinzaClaro
      ctx.font = '20px sans-serif'
      ctx.fillText(aposta.mercado, 108, yAtual + 68)

      // Placar
      ctx.fillStyle = CORES.amarelo
      ctx.font = 'bold 28px sans-serif'
      ctx.fillText(placar, 680, yAtual + 50)

      // Status
      ctx.fillStyle = acertou ? CORES.verde : CORES.vermelho
      ctx.font = 'bold 22px sans-serif'
      ctx.fillText(acertou ? '✓ VERDE' : '✗ VERMELHO', 680, yAtual + 85)

      yAtual += 135
    }

    // Taxa de acerto
    const taxa = Math.round((acertos / total) * 100)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    arredondarRetangulo(ctx, 60, yAtual + 10, 960, 80, 12)
    ctx.fill()

    ctx.fillStyle = CORES.branco
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Aproveitamento: ' + acertos + '/' + total + ' (' + taxa + '%)', width / 2, yAtual + 60)
    ctx.textAlign = 'left'
  }

  // Rodapé
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fillRect(0, 990, width, 90)

  ctx.fillStyle = CORES.acento
  ctx.font = 'bold 24px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Receba as analises ANTES do jogo → Link na bio', width / 2, 1035)

  ctx.fillStyle = CORES.cinzaEscuro
  ctx.font = '18px sans-serif'
  ctx.fillText('@gol.lucrativo', width / 2, 1062)
  ctx.textAlign = 'left'

  ctx.fillStyle = CORES.acento
  ctx.fillRect(0, 1074, width, 6)

  // Salva
  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

  const nomeArquivo = 'card-' + turno + '.png'
  const caminhoLocal = path.join(assetsDir, nomeArquivo)
  fs.writeFileSync(caminhoLocal, canvas.toBuffer('image/png'))
  console.log('Imagem gerada: ' + caminhoLocal)

  return caminhoLocal
}

async function subirImagemGithub(caminhoLocal, turno) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN
  const GITHUB_REPO = process.env.GITHUB_REPO

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    console.log('GitHub token nao configurado.')
    return null
  }

  try {
    const conteudo = fs.readFileSync(caminhoLocal)
    const base64 = conteudo.toString('base64')
    const nomeArquivo = 'card-' + turno + '.png'

    let sha = null
    try {
      const getRes = await axios.get(
        'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
        { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
      )
      sha = getRes.data.sha
    } catch (e) {}

    const body = { message: 'Atualiza card ' + turno, content: base64 }
    if (sha) body.sha = sha

    await axios.put(
      'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
      body,
      { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
    )

    const urlPublica = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/main/assets/' + nomeArquivo + '?t=' + Date.now()
    console.log('Imagem subida para GitHub: ' + urlPublica)
    return urlPublica

  } catch (err) {
    console.error('Erro ao subir imagem:', err.response?.data || err.message)
    return null
  }
}

async function gerarESubirImagem(apostas, turno, resultados) {
  const caminhoLocal = await gerarImagem(apostas, turno, resultados)
  const urlPublica = await subirImagemGithub(caminhoLocal, turno)
  return urlPublica
}

module.exports = { gerarESubirImagem }
