const { createCanvas, registerFont } = require('canvas')
const fs = require('fs')
const path = require('path')
const axios = require('axios')

// ─── REGISTRO EXPLÍCITO DE FONTE NO RAILWAY (LINUX) ───
if (process.platform !== 'win32') {
  try {
    const { execSync } = require('child_process')

    // Descobre paths reais via fc-list
    const output = execSync('fc-list | grep -i dejavu').toString()
    console.log('Fontes DejaVu encontradas no sistema:\n' + output)

    const linhas = output.split('\n').filter(l => l.includes('.ttf') || l.includes('.TTF'))

    const regular = linhas.find(l => l.toLowerCase().includes('sans.ttf') && !l.toLowerCase().includes('bold') && !l.toLowerCase().includes('oblique') && !l.toLowerCase().includes('italic'))
    const bold    = linhas.find(l => l.toLowerCase().includes('bold.ttf') && !l.toLowerCase().includes('oblique') && !l.toLowerCase().includes('italic'))

    const extrairPath = (linha) => linha ? linha.split(':')[0].trim() : null

    const pathRegular = extrairPath(regular)
    const pathBold    = extrairPath(bold)

    if (pathRegular && fs.existsSync(pathRegular)) {
      registerFont(pathRegular, { family: 'DejaVu Sans', weight: 'normal' })
      console.log('Fonte DejaVu Sans registrada:', pathRegular)
    } else {
      console.log('AVISO: DejaVu Sans regular nao encontrada')
    }

    if (pathBold && fs.existsSync(pathBold)) {
      registerFont(pathBold, { family: 'DejaVu Sans', weight: 'bold' })
      console.log('Fonte DejaVu Sans Bold registrada:', pathBold)
    } else {
      console.log('AVISO: DejaVu Sans Bold nao encontrada')
    }

  } catch (err) {
    console.log('AVISO: Nao foi possivel registrar fontes:', err.message)
  }
}

// Fonte compativel com Linux (Railway) e Windows
const FONTE = process.platform === 'win32' ? 'Arial' : 'DejaVu Sans'

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

  const COR_TEMA = isVerde ? '#00c48c' : temResultado ? '#e94560' : '#e94560'
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
    // ─── TEMPLATE VERDE ───

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
    // ─── TEMPLATE VERMELHO ───

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

    ctx.fillStyle = '#888899'
    ctx.font = '26px ' + FONTE
    const jogoNome = apostas[0].jogo.length > 32 ? apostas[0].jogo.substring(0, 32) + '...' : apostas[0].jogo
    ctx.fillText(jogoNome, 540, 500)

    const placar = destaqueResultado.golsCasa + ' x ' + destaqueResultado.golsFora
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 32px ' + FONTE
    ctx.fillText(placar, 540, 545)
    ctx.textAlign = 'left'

    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 70, 575, 940, 145, 16)
    ctx.fill()
    ctx.strokeStyle = '#e94560'
    ctx.lineWidth = 1.5
    arredondarRetangulo(ctx, 70, 575, 940, 145, 16)
    ctx.stroke()

    const probPct = Math.round((1/apostas[0].odd + apostas[0].edge)*100)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px ' + FONTE
    ctx.textAlign = 'center'
    ctx.fillText('Mercado: ' + apostas[0].mercado, 540, 615)
    ctx.fillStyle = '#888899'
    ctx.font = '22px ' + FONTE
    ctx.fillText('Modelo estimou ' + probPct + '% de probabilidade.', 540, 648)
    ctx.fillStyle = '#ccccdd'
    ctx.font = '22px ' + FONTE
    ctx.fillText((100 - probPct) + '% das vezes nao se confirma. Faz parte.', 540, 680)
    ctx.fillStyle = '#e94560'
    ctx.font = 'bold 22px ' + FONTE
    ctx.fillText('Variancia estatistica faz parte da analise.', 540, 712)
    ctx.textAlign = 'left'

    ctx.fillStyle = COR_CARD
    arredondarRetangulo(ctx, 70, 738, 940, 80, 14)
    ctx.fill()
    ctx.strokeStyle = '#00c48c'
    ctx.lineWidth = 0.5
    arredondarRetangulo(ctx, 70, 738, 940, 80, 14)
    ctx.stroke()

    ctx.fillStyle = '#888899'
    ctx.font = '22px ' + FONTE
    ctx.textAlign = 'center'
    ctx.fillText('Historico dos ultimos 30 dias:', 540, 768)
    ctx.fillStyle = '#00c48c'
    ctx.font = 'bold 26px ' + FONTE
    ctx.fillText(acertos + '/' + total + ' corretas - Taxa: ' + taxa + '% - Metodo consistente', 540, 802)
    ctx.textAlign = 'left'

    ctx.fillStyle = '#e94560'
    arredondarRetangulo(ctx, 180, 848, 720, 75, 38)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px ' + FONTE
    ctx.textAlign = 'center'
    ctx.fillText('ASSINAR - LINK NA BIO', 540, 893)

    ctx.fillStyle = '#888899'
    ctx.font = '22px ' + FONTE
    ctx.fillText('Variancia faz parte da analise estatistica.', 540, 955)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 22px ' + FONTE
    ctx.fillText('O historico de 30 dias fala por si so.', 540, 990)
    ctx.textAlign = 'left'
  }

  // Rodape
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  ctx.fillRect(0, 1042, width, 38)
  ctx.fillStyle = COR_TEMA
  ctx.font = 'bold 20px ' + FONTE
  ctx.textAlign = 'center'
  ctx.fillText('golmatchbr.com.br - analise estatistica de futebol - baseado em dados', 540, 1067)
  ctx.textAlign = 'left'

  ctx.fillStyle = COR_TEMA
  ctx.fillRect(0, 1072, width, 8)

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

async function gerarImagemStory(apostas, resultados) {
  const width = 1080
  const height = 1920
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  let destaqueAcertou = false
  let destaqueResultado = null
  let acertos = 0
  let total = 0

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

  ctx.strokeStyle = 'rgba(255,255,255,0.025)'
  ctx.lineWidth = 1
  for (let i = 0; i < width; i += 80) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke()
  }
  for (let i = 0; i < height; i += 80) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke()
  }

  ctx.fillStyle = COR_TEMA
  ctx.globalAlpha = 0.06
  ctx.beginPath()
  ctx.arc(900, 400, 600, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  ctx.fillStyle = COR_TEMA
  ctx.fillRect(0, 0, width, 10)

  // Header
  ctx.fillStyle = COR_TEMA
  ctx.font = 'bold 58px ' + FONTE
  ctx.textAlign = 'center'
  ctx.fillText('Gol Match BR', 540, 120)

  ctx.fillStyle = '#444455'
  ctx.font = '28px ' + FONTE
  ctx.fillText('@golmatchbr', 540, 165)

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
    // ── STORY VERDE ──

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
    // ── STORY VERMELHO ──

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

async function subirImagemGithubStory(caminhoLocal) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN
  const GITHUB_REPO = process.env.GITHUB_REPO

  if (!GITHUB_TOKEN || !GITHUB_REPO) return null

  try {
    const conteudo = fs.readFileSync(caminhoLocal)
    const base64 = conteudo.toString('base64')
    const nomeArquivo = 'card-story.png'

    let sha = null
    try {
      const getRes = await axios.get(
        'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
        { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
      )
      sha = getRes.data.sha
    } catch (e) {}

    const body = { message: 'Atualiza card story', content: base64 }
    if (sha) body.sha = sha

    await axios.put(
      'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
      body,
      { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
    )

    const urlPublica = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/main/assets/' + nomeArquivo + '?t=' + Date.now()
    console.log('Story subida para GitHub: ' + urlPublica)
    return urlPublica

  } catch (err) {
    console.error('Erro ao subir story:', err.response?.data || err.message)
    return null
  }
}

async function gerarESubirStory(apostas, resultados) {
  const caminhoLocal = await gerarImagemStory(apostas, resultados)
  const urlPublica = await subirImagemGithubStory(caminhoLocal)
  return urlPublica
}

module.exports = { gerarESubirImagem, gerarESubirStory }