const { registerFont } = require('canvas')
const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')
const axios = require('axios')

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

  // Calcula resultados
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

  // Cores do tema baseado no resultado
  const COR_TEMA = isVerde ? '#00c48c' : temResultado ? '#e94560' : '#e94560'
  const COR_FUNDO = isVerde ? '#0a1e14' : temResultado ? '#1a0a0d' : '#0d0d1a'
  const COR_CARD = isVerde ? '#0d2a1a' : temResultado ? '#2a0d12' : '#1a1a2e'

  // Fundo
  ctx.fillStyle = COR_FUNDO
  ctx.fillRect(0, 0, width, height)

  // Grade sutil
  ctx.strokeStyle = 'rgba(255,255,255,0.025)'
  ctx.lineWidth = 1
  for (let i = 0; i < width; i += 80) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke()
  }
  for (let i = 0; i < height; i += 80) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke()
  }

  // Circulo decorativo
  ctx.fillStyle = COR_TEMA
  ctx.globalAlpha = 0.05
  ctx.beginPath()
  ctx.arc(900, 180, 450, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // Barra topo
  ctx.fillStyle = COR_TEMA
  ctx.fillRect(0, 0, width, 8)

  // Header — Logo
  ctx.fillStyle = COR_TEMA
  ctx.font = 'bold 52px Arial'
  ctx.fillText('GolLucrativo', 70, 88)

  ctx.fillStyle = '#444455'
  ctx.font = '24px Arial'
  ctx.fillText('@gol.lucrativo', 70, 122)

  // Data
  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)
  const dataStr = ontem.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  ctx.fillStyle = '#555566'
  ctx.font = '22px Arial'
  ctx.textAlign = 'right'
  ctx.fillText(dataStr, 1010, 88)
  ctx.textAlign = 'left'

  // Linha divisoria
  ctx.fillStyle = COR_TEMA
  ctx.fillRect(70, 142, 940, 2)

  if (!temResultado) {
    // Primeiro dia
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 52px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Primeiro dia de operacao!', 540, 520)
    ctx.font = '28px Arial'
    ctx.fillStyle = '#888899'
    ctx.fillText('Acompanhe nossos resultados diarios', 540, 580)
    ctx.textAlign = 'left'

  } else if (isVerde) {
    // ─── TEMPLATE VERDE ───

    ctx.fillStyle = '#00c48c'
    ctx.globalAlpha = 0.08
    ctx.beginPath()
    ctx.arc(540, 290, 150, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 160px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('✓', 540, 370)

    ctx.font = 'bold 88px Arial'
    ctx.fillText('ACERTOU', 540, 470)

    // Jogo destaque
    const jogoNome = apostas[0].jogo.length > 32 ? apostas[0].jogo.substring(0, 32) + '...' : apostas[0].jogo
    ctx.fillStyle = '#888899'
    ctx.font = '26px Arial'
    ctx.fillText(jogoNome, 540, 530)

    const placar = destaqueResultado.golsCasa + ' x ' + destaqueResultado.golsFora
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 32px Arial'
    ctx.fillText(placar, 540, 575)
    ctx.textAlign = 'left'

    // Card da analise
    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 70, 605, 940, 130, 16)
    ctx.fill()
    ctx.strokeStyle = '#00c48c'
    ctx.lineWidth = 1.5
    arredondarRetangulo(ctx, 70, 605, 940, 130, 16)
    ctx.stroke()

    const probPct = Math.round((1/apostas[0].odd + apostas[0].edge)*100)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Mercado: ' + apostas[0].mercado, 540, 648)

    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 28px Arial'
    ctx.fillText('Probabilidade estimada: ' + probPct + '% · Confirmado', 540, 690)

    ctx.fillStyle = '#888899'
    ctx.font = '22px Arial'
    ctx.fillText('Analise enviada as 8h · Baseada em dados estatisticos', 540, 720)
    ctx.textAlign = 'left'

    // Performance
    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 70, 755, 940, 75, 14)
    ctx.fill()
    ctx.strokeStyle = '#00c48c'
    ctx.lineWidth = 0.5
    arredondarRetangulo(ctx, 70, 755, 940, 75, 14)
    ctx.stroke()

    ctx.fillStyle = '#888899'
    ctx.font = '22px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Ultimos 30 dias:', 540, 785)
    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 26px Arial'
    ctx.fillText(acertos + '/' + total + ' corretas · Taxa: ' + taxa + '%', 540, 815)
    ctx.textAlign = 'left'

    // CTA verde
    ctx.fillStyle = '#00c48c'
    arredondarRetangulo(ctx, 180, 860, 720, 75, 38)
    ctx.fill()
    ctx.fillStyle = '#0a1e14'
    ctx.font = 'bold 26px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('ASSINAR — LINK NA BIO', 540, 905)

    ctx.fillStyle = '#555566'
    ctx.font = '22px Arial'
    ctx.fillText('Quem acompanha o grupo sabia desde as 8h.', 540, 970)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px Arial'
    ctx.fillText('Amanha tem mais. Nao fique de fora.', 540, 1005)
    ctx.textAlign = 'left'

  } else {
    // ─── TEMPLATE VERMELHO ───

    ctx.fillStyle = '#e94560'
    ctx.globalAlpha = 0.08
    ctx.beginPath()
    ctx.arc(540, 290, 150, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = '#e94560'
    ctx.font = 'bold 130px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('✗', 540, 370)

    ctx.font = 'bold 80px Arial'
    ctx.fillText('NAO CONFIRMOU', 540, 460)

    ctx.fillStyle = '#888899'
    ctx.font = '26px Arial'
    const jogoNome = apostas[0].jogo.length > 32 ? apostas[0].jogo.substring(0, 32) + '...' : apostas[0].jogo
    ctx.fillText(jogoNome, 540, 520)

    const placar = destaqueResultado.golsCasa + ' x ' + destaqueResultado.golsFora
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 32px Arial'
    ctx.fillText(placar, 540, 565)
    ctx.textAlign = 'left'

    // Card explicativo
    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 70, 595, 940, 145, 16)
    ctx.fill()
    ctx.strokeStyle = '#e94560'
    ctx.lineWidth = 1.5
    arredondarRetangulo(ctx, 70, 595, 940, 145, 16)
    ctx.stroke()

    const probPct = Math.round((1/apostas[0].odd + apostas[0].edge)*100)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Mercado: ' + apostas[0].mercado, 540, 635)
    ctx.fillStyle = '#888899'
    ctx.font = '22px Arial'
    ctx.fillText('Modelo estimou ' + probPct + '% de probabilidade.', 540, 668)
    ctx.fillStyle = '#ccccdd'
    ctx.font = '22px Arial'
    ctx.fillText('Isso significa que ' + (100 - probPct) + '% das vezes nao se confirma.', 540, 700)
    ctx.fillStyle = '#e94560'
    ctx.font = 'bold 22px Arial'
    ctx.fillText('Variancia estatistica faz parte da analise.', 540, 732)
    ctx.textAlign = 'left'

    // Performance
    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 70, 758, 940, 80, 14)
    ctx.fill()
    ctx.strokeStyle = '#00c48c'
    ctx.lineWidth = 0.5
    arredondarRetangulo(ctx, 70, 758, 940, 80, 14)
    ctx.stroke()

    ctx.fillStyle = '#888899'
    ctx.font = '22px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Historico dos ultimos 30 dias:', 540, 788)
    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 26px Arial'
    ctx.fillText(acertos + '/' + total + ' corretas · Taxa: ' + taxa + '% · Metodo consistente', 540, 822)
    ctx.textAlign = 'left'

    // CTA vermelho
    ctx.fillStyle = '#e94560'
    arredondarRetangulo(ctx, 180, 868, 720, 75, 38)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('ASSINAR — LINK NA BIO', 540, 913)

    ctx.fillStyle = '#888899'
    ctx.font = '22px Arial'
    ctx.fillText('Variancia faz parte da analise estatistica.', 540, 975)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 22px Arial'
    ctx.fillText('O historico de 30 dias fala por si so.', 540, 1010)
    ctx.textAlign = 'left'
  }

  // Rodape
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  ctx.fillRect(0, 1042, width, 38)
  ctx.fillStyle = COR_TEMA
  ctx.font = 'bold 20px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('gollucrativo.com.br · analise estatistica de futebol · baseado em dados', 540, 1067)
  ctx.textAlign = 'left'

  // Barra rodape
  ctx.fillStyle = COR_TEMA
  ctx.fillRect(0, 1072, width, 8)

  // Salva
  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

  const nomeArquivo = 'card-resultado.png'
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
    const nomeArquivo = 'card-resultado.png'

    let sha = null
    try {
      const getRes = await axios.get(
        'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
        { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
      )
      sha = getRes.data.sha
    } catch (e) {}

    const body = { message: 'Atualiza card resultado', content: base64 }
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