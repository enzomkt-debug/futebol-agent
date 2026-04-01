const { createCanvas, registerFont } = require('canvas')
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const { verificarAcerto, subirImagemGithub } = require('./utils')

// Registra fonte empacotada no repositorio — funciona em qualquer ambiente
try {
  const fontPath = path.join(__dirname, 'fonts', 'DejaVuSans.ttf')
  const fontBoldPath = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf')
  registerFont(fontPath, { family: 'DejaVu Sans', weight: 'normal' })
  registerFont(fontBoldPath, { family: 'DejaVu Sans', weight: 'bold' })
} catch(e) {
  console.log('Aviso: erro ao registrar fonte DejaVu:', e.message)
}
const FONTE = 'DejaVu Sans'

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

async function gerarImagem(apostas, turno, resultados) {
  const width = 1080
  const height = 1080
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  let acertos = 0
  let total = 0
  let destaqueAcertou = false
  let destaqueResultado = null

  if (apostas && apostas.length && resultados && resultados.length) {
    for (let i = 0; i < apostas.length; i++) {
      const res = resultados[i]
      if (!res) continue
      total++
      if (verificarAcerto(apostas[i], res)) acertos++
      if (i === 0) {
        destaqueAcertou = verificarAcerto(apostas[0], res)
        destaqueResultado = res
      }
    }
  }

  const taxa = total > 0 ? Math.round((acertos / total) * 100) : 0
  const temResultado = total > 0 && destaqueResultado !== null
  const isVerde = temResultado && destaqueAcertou

  const COR_TEMA = isVerde ? '#00c48c' : '#e94560'
  const COR_FUNDO = isVerde ? '#0a1e14' : temResultado ? '#1a0a0d' : '#0d0d1a'
  const COR_CARD = isVerde ? '#0d2a1a' : temResultado ? '#2a0d12' : '#1a1a2e'

  ctx.fillStyle = COR_FUNDO
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(255,255,255,0.025)'
  ctx.lineWidth = 1
  for (let i = 0; i < width; i += 80) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke()
  }
  for (let i = 0; i < height; i += 80) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke()
  }

  ctx.fillStyle = COR_TEMA
  ctx.globalAlpha = 0.05
  ctx.beginPath()
  ctx.arc(900, 180, 450, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  ctx.fillStyle = COR_TEMA
  ctx.fillRect(0, 0, width, 8)

  // Header
  ctx.fillStyle = COR_TEMA
  ctx.font = 'bold 52px ' + FONTE
  ctx.fillText('Gol Match BR', 70, 88)

  ctx.fillStyle = '#444455'
  ctx.font = '24px ' + FONTE
  ctx.fillText('@golmatchbr', 70, 122)

  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)
  const dataStr = ontem.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  ctx.fillStyle = '#555566'
  ctx.font = '22px ' + FONTE
  ctx.textAlign = 'right'
  ctx.fillText(dataStr, 1010, 88)
  ctx.textAlign = 'left'

  ctx.fillStyle = COR_TEMA
  ctx.fillRect(70, 142, 940, 2)

  if (!temResultado) {
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 52px ' + FONTE
    ctx.textAlign = 'center'
    ctx.fillText('Primeiro dia de operacao!', 540, 520)
    ctx.font = '28px ' + FONTE
    ctx.fillStyle = '#888899'
    ctx.fillText('Acompanhe nossos resultados diarios', 540, 580)
    ctx.textAlign = 'left'

  } else if (isVerde) {
    ctx.fillStyle = '#00c48c'
    ctx.globalAlpha = 0.08
    ctx.beginPath()
    ctx.arc(540, 290, 150, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = '#00c48c'
    ctx.beginPath()
    ctx.arc(540, 300, 70, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0a1e14'
    ctx.font = 'bold 80px ' + FONTE
    ctx.textAlign = 'center'
    ctx.fillText('OK', 540, 328)

    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 88px ' + FONTE
    ctx.fillText('ACERTOU', 540, 460)

    const jogoNome = apostas[0].jogo.length > 32 ? apostas[0].jogo.substring(0, 32) + '...' : apostas[0].jogo
    ctx.fillStyle = '#888899'
    ctx.font = '26px ' + FONTE
    ctx.fillText(jogoNome, 540, 530)

    const placar = destaqueResultado.golsCasa + ' x ' + destaqueResultado.golsFora
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 32px ' + FONTE
    ctx.fillText(placar, 540, 575)
    ctx.textAlign = 'left'

    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 70, 605, 940, 130, 16)
    ctx.fill()
    ctx.strokeStyle = '#00c48c'
    ctx.lineWidth = 1.5
    arredondarRetangulo(ctx, 70, 605, 940, 130, 16)
    ctx.stroke()

    const probPct = Math.round((1/apostas[0].odd + apostas[0].edge)*100)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px ' + FONTE
    ctx.textAlign = 'center'
    ctx.fillText('Mercado: ' + apostas[0].mercado, 540, 648)

    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 28px ' + FONTE
    ctx.fillText('Probabilidade estimada: ' + probPct + '% - Confirmado', 540, 690)

    ctx.fillStyle = '#888899'
    ctx.font = '22px ' + FONTE
    ctx.fillText('Analise enviada as 8h - Baseada em dados estatisticos', 540, 720)
    ctx.textAlign = 'left'

    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 70, 755, 940, 75, 14)
    ctx.fill()
    ctx.strokeStyle = '#00c48c'
    ctx.lineWidth = 0.5
    arredondarRetangulo(ctx, 70, 755, 940, 75, 14)
    ctx.stroke()

    ctx.fillStyle = '#888899'
    ctx.font = '22px ' + FONTE
    ctx.textAlign = 'center'
    ctx.fillText('Ultimos 30 dias:', 540, 785)
    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 26px ' + FONTE
    ctx.fillText(acertos + '/' + total + ' corretas - Taxa: ' + taxa + '%', 540, 815)
    ctx.textAlign = 'left'

    ctx.fillStyle = '#00c48c'
    arredondarRetangulo(ctx, 180, 860, 720, 75, 38)
    ctx.fill()
    ctx.fillStyle = '#0a1e14'
    ctx.font = 'bold 26px ' + FONTE
    ctx.textAlign = 'center'
    ctx.fillText('ASSINAR - LINK NA BIO', 540, 905)

    ctx.fillStyle = '#555566'
    ctx.font = '22px ' + FONTE
    ctx.fillText('Quem acompanha o grupo sabia desde as 8h.', 540, 970)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px ' + FONTE
    ctx.fillText('Amanha tem mais. Nao fique de fora.', 540, 1005)
    ctx.textAlign = 'left'

  } else {
    ctx.fillStyle = '#e94560'
    ctx.globalAlpha = 0.08
    ctx.beginPath()
    ctx.arc(540, 290, 150, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = '#e94560'
    ctx.beginPath()
    ctx.arc(540, 290, 70, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 70px ' + FONTE
    ctx.textAlign = 'center'
    ctx.fillText('X', 540, 315)

    ctx.fillStyle = '#e94560'
    ctx.font = 'bold 80px ' + FONTE
    ctx.fillText('NAO CONFIRMOU', 540, 440)

    const jogoNome = apostas[0].jogo.length > 32 ? apostas[0].jogo.substring(0, 32) + '...' : apostas[0].jogo
    ctx.fillStyle = '#888899'
    ctx.font = '26px ' + FONTE
    ctx.fillText(jogoNome, 540, 510)

    const placar = destaqueResultado.golsCasa + ' x ' + destaqueResultado.golsFora
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 32px ' + FONTE
    ctx.fillText(placar, 540, 555)
    ctx.textAlign = 'left'

    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 70, 585, 940, 150, 16)
    ctx.fill()
    ctx.strokeStyle = '#e94560'
    ctx.lineWidth = 1.5
    arredondarRetangulo(ctx, 70, 585, 940, 150, 16)
    ctx.stroke()

    const probPct = Math.round((1/apostas[0].odd + apostas[0].edge)*100)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px ' + FONTE
    ctx.textAlign = 'center'
    ctx.fillText('Mercado: ' + apostas[0].mercado, 540, 625)

    ctx.fillStyle = '#888899'
    ctx.font = '22px ' + FONTE
    ctx.fillText('Modelo estimou ' + probPct + '% de probabilidade', 540, 660)
    ctx.fillStyle = '#ccccdd'
    ctx.fillText((100-probPct) + '% das vezes nao se confirma. Faz parte.', 540, 695)
    ctx.fillStyle = '#e94560'
    ctx.font = 'bold 22px ' + FONTE
    ctx.fillText('Variancia estatistica e parte do metodo.', 540, 724)
    ctx.textAlign = 'left'

    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 70, 755, 940, 75, 14)
    ctx.fill()
    ctx.strokeStyle = '#00c48c'
    ctx.lineWidth = 0.5
    arredondarRetangulo(ctx, 70, 755, 940, 75, 14)
    ctx.stroke()

    ctx.fillStyle = '#888899'
    ctx.font = '22px ' + FONTE
    ctx.textAlign = 'center'
    ctx.fillText('Historico dos ultimos 30 dias:', 540, 785)
    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 26px ' + FONTE
    ctx.fillText(acertos + '/' + total + ' corretas - Taxa: ' + taxa + '%', 540, 815)
    ctx.textAlign = 'left'

    ctx.fillStyle = '#e94560'
    arredondarRetangulo(ctx, 180, 860, 720, 75, 38)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 26px ' + FONTE
    ctx.textAlign = 'center'
    ctx.fillText('ASSINAR - LINK NA BIO', 540, 905)

    ctx.fillStyle = '#555566'
    ctx.font = '22px ' + FONTE
    ctx.fillText('Variancia faz parte da analise estatistica.', 540, 970)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px ' + FONTE
    ctx.fillText('O historico de 30 dias fala por si so.', 540, 1005)
    ctx.textAlign = 'left'
  }

  // Barra rodape
  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  ctx.fillRect(0, 1040, width, 32)
  ctx.fillStyle = '#333344'
  ctx.font = '18px ' + FONTE
  ctx.textAlign = 'center'
  ctx.fillText('golmatchbr.com.br - analise estatistica de futebol', 540, 1062)
  ctx.textAlign = 'left'
  ctx.fillStyle = COR_TEMA
  ctx.fillRect(0, 1072, width, 8)

  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

  const caminhoLocal = path.join(assetsDir, 'card-resultado.png')
  fs.writeFileSync(caminhoLocal, canvas.toBuffer('image/png'))
  console.log('Imagem de resultado gerada')
  return caminhoLocal
}

async function gerarImagemStory(apostas, resultados) {
  const width = 1080
  const height = 1920
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  let acertos = 0
  let total = 0
  let destaqueAcertou = false
  let destaqueResultado = null

  if (apostas && apostas.length && resultados && resultados.length) {
    for (let i = 0; i < apostas.length; i++) {
      const res = resultados[i]
      if (!res) continue
      total++
      if (verificarAcerto(apostas[i], res)) acertos++
      if (i === 0) {
        destaqueAcertou = verificarAcerto(apostas[0], res)
        destaqueResultado = res
      }
    }
  }

  const taxa = total > 0 ? Math.round((acertos / total) * 100) : 0
  const temResultado = total > 0 && destaqueResultado !== null
  const isVerde = temResultado && destaqueAcertou

  const COR_TEMA = isVerde ? '#00c48c' : '#e94560'
  const COR_FUNDO = isVerde ? '#0a1e14' : '#1a0a0d'
  const COR_CARD = isVerde ? '#0d2a1a' : '#2a0d12'

  ctx.fillStyle = COR_FUNDO
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(255,255,255,0.02)'
  ctx.lineWidth = 1
  for (let i = 0; i < width; i += 80) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke()
  }

  ctx.fillStyle = COR_TEMA
  ctx.fillRect(0, 0, width, 8)

  // Header
  ctx.fillStyle = COR_TEMA
  ctx.font = 'bold 52px ' + FONTE
  ctx.textAlign = 'center'
  ctx.fillText('Gol Match BR', 540, 120)
  ctx.fillStyle = '#444455'
  ctx.font = '28px ' + FONTE
  ctx.fillText('@golmatchbr', 540, 162)

  ctx.fillStyle = COR_TEMA
  ctx.fillRect(70, 195, 940, 2)

  if (!temResultado) {
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 60px ' + FONTE
    ctx.fillText('Bem-vindo!', 540, 960)
    ctx.font = '32px ' + FONTE
    ctx.fillStyle = '#888899'
    ctx.fillText('Acompanhe nossos resultados', 540, 1020)
    ctx.textAlign = 'left'
  } else if (isVerde) {
    ctx.fillStyle = '#00c48c'
    ctx.globalAlpha = 0.1
    ctx.beginPath()
    ctx.arc(540, 600, 240, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = '#00c48c'
    ctx.beginPath()
    ctx.arc(540, 580, 110, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0a1e14'
    ctx.font = 'bold 110px ' + FONTE
    ctx.fillText('OK', 540, 618)

    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 120px ' + FONTE
    ctx.fillText('ACERTOU', 540, 780)

    const jogoNome = apostas[0].jogo.length > 28 ? apostas[0].jogo.substring(0, 28) + '...' : apostas[0].jogo
    ctx.fillStyle = '#888899'
    ctx.font = '34px ' + FONTE
    ctx.fillText(jogoNome, 540, 880)

    const placar = destaqueResultado.golsCasa + ' x ' + destaqueResultado.golsFora
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 72px ' + FONTE
    ctx.fillText(placar, 540, 970)

    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 60, 1020, 960, 160, 20)
    ctx.fill()
    ctx.strokeStyle = '#00c48c'
    ctx.lineWidth = 2
    arredondarRetangulo(ctx, 60, 1020, 960, 160, 20)
    ctx.stroke()

    const probPct = Math.round((1/apostas[0].odd + apostas[0].edge)*100)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 30px ' + FONTE
    ctx.fillText('Mercado: ' + apostas[0].mercado, 540, 1065)
    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 34px ' + FONTE
    ctx.fillText('Probabilidade: ' + probPct + '% - Confirmado', 540, 1110)
    ctx.fillStyle = '#888899'
    ctx.font = '26px ' + FONTE
    ctx.fillText('Baseada em dados estatisticos', 540, 1148)

    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 60, 1205, 960, 100, 16)
    ctx.fill()
    ctx.strokeStyle = '#00c48c'
    ctx.lineWidth = 1
    arredondarRetangulo(ctx, 60, 1205, 960, 100, 16)
    ctx.stroke()

    ctx.fillStyle = '#888899'
    ctx.font = '28px ' + FONTE
    ctx.fillText('Ultimos 30 dias:', 540, 1245)
    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 32px ' + FONTE
    ctx.fillText(acertos + '/' + total + ' corretas - Taxa: ' + taxa + '%', 540, 1285)

    ctx.fillStyle = '#00c48c'
    arredondarRetangulo(ctx, 160, 1350, 760, 90, 45)
    ctx.fill()
    ctx.fillStyle = '#0a1e14'
    ctx.font = 'bold 34px ' + FONTE
    ctx.fillText('ASSINAR - LINK NA BIO', 540, 1405)

    ctx.fillStyle = '#555566'
    ctx.font = '28px ' + FONTE
    ctx.fillText('Quem esta no grupo sabia desde as 8h.', 540, 1510)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 30px ' + FONTE
    ctx.fillText('Amanha tem mais. Nao fique de fora.', 540, 1555)

  } else {
    ctx.fillStyle = '#e94560'
    ctx.globalAlpha = 0.1
    ctx.beginPath()
    ctx.arc(540, 600, 240, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = '#e94560'
    ctx.beginPath()
    ctx.arc(540, 570, 110, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 100px ' + FONTE
    ctx.fillText('X', 540, 612)

    ctx.fillStyle = '#e94560'
    ctx.font = 'bold 100px ' + FONTE
    ctx.fillText('NAO CONFIRMOU', 540, 770)

    const jogoNome = apostas[0].jogo.length > 28 ? apostas[0].jogo.substring(0, 28) + '...' : apostas[0].jogo
    ctx.fillStyle = '#888899'
    ctx.font = '34px ' + FONTE
    ctx.fillText(jogoNome, 540, 870)

    const placar = destaqueResultado.golsCasa + ' x ' + destaqueResultado.golsFora
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 72px ' + FONTE
    ctx.fillText(placar, 540, 960)

    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 60, 1010, 960, 180, 20)
    ctx.fill()
    ctx.strokeStyle = '#e94560'
    ctx.lineWidth = 2
    arredondarRetangulo(ctx, 60, 1010, 960, 180, 20)
    ctx.stroke()

    const probPct = Math.round((1/apostas[0].odd + apostas[0].edge)*100)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 30px ' + FONTE
    ctx.fillText('Mercado: ' + apostas[0].mercado, 540, 1055)
    ctx.fillStyle = '#888899'
    ctx.font = '28px ' + FONTE
    ctx.fillText('Modelo estimou ' + probPct + '% de probabilidade.', 540, 1098)
    ctx.fillStyle = '#ccccdd'
    ctx.font = '26px ' + FONTE
    ctx.fillText((100 - probPct) + '% das vezes nao se confirma. Faz parte.', 540, 1135)
    ctx.fillStyle = '#e94560'
    ctx.font = 'bold 26px ' + FONTE
    ctx.fillText('Variancia estatistica e parte do metodo.', 540, 1172)

    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 60, 1215, 960, 100, 16)
    ctx.fill()
    ctx.strokeStyle = '#00c48c'
    ctx.lineWidth = 1
    arredondarRetangulo(ctx, 60, 1215, 960, 100, 16)
    ctx.stroke()

    ctx.fillStyle = '#888899'
    ctx.font = '28px ' + FONTE
    ctx.fillText('Historico dos ultimos 30 dias:', 540, 1255)
    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 32px ' + FONTE
    ctx.fillText(acertos + '/' + total + ' corretas - Taxa: ' + taxa + '%', 540, 1295)

    ctx.fillStyle = '#e94560'
    arredondarRetangulo(ctx, 160, 1360, 760, 90, 45)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 34px ' + FONTE
    ctx.fillText('ASSINAR - LINK NA BIO', 540, 1415)

    ctx.fillStyle = '#888899'
    ctx.font = '28px ' + FONTE
    ctx.fillText('Variancia faz parte da analise estatistica.', 540, 1520)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 30px ' + FONTE
    ctx.fillText('O historico de 30 dias fala por si so.', 540, 1565)
  }

  // Rodape
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  ctx.fillRect(0, 1870, width, 40)
  ctx.fillStyle = COR_TEMA
  ctx.font = 'bold 22px ' + FONTE
  ctx.fillText('golmatchbr.com.br - analise estatistica de futebol', 540, 1897)

  ctx.fillStyle = COR_TEMA
  ctx.fillRect(0, 1910, width, 10)

  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

  const caminhoLocal = path.join(assetsDir, 'card-story.png')
  fs.writeFileSync(caminhoLocal, canvas.toBuffer('image/png'))
  console.log('Story gerada: ' + caminhoLocal)
  return caminhoLocal
}

async function gerarESubirImagem(apostas, turno, resultados) {
  const caminhoLocal = await gerarImagem(apostas, turno, resultados)
  // [skip ci] incluído automaticamente via utils.subirImagemGithub
  const urlPublica = await subirImagemGithub(axios, caminhoLocal, 'card-resultado.png')
  return urlPublica
}

async function gerarESubirStory(apostas, resultados) {
  const caminhoLocal = await gerarImagemStory(apostas, resultados)
  const urlPublica = await subirImagemGithub(axios, caminhoLocal, 'card-story.png')
  return urlPublica
}

module.exports = { gerarESubirImagem, gerarESubirStory }
