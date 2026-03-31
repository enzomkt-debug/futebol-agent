require('dotenv').config()
const axios = require('axios')
const { createCanvas, loadImage, registerFont } = require('canvas')
const fs = require('fs')
const path = require('path')
const { subirImagemGithub } = require('./utils')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY
const ZERNIO_ACCOUNT_ID = process.env.ZERNIO_ACCOUNT_ID
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY

try {
  registerFont(path.join(__dirname, 'fonts', 'DejaVuSans.ttf'), { family: 'DejaVu Sans', weight: 'normal' })
  registerFont(path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'), { family: 'DejaVu Sans', weight: 'bold' })
} catch(e) {
  console.log('Aviso: erro ao registrar fonte DejaVu:', e.message)
}
const FONTE = 'DejaVu Sans'

// ─── BUSCA IMAGEM NO UNSPLASH ───

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
        params: { query: q, orientation: 'squarish', content_filter: 'high' }
      })
      return res.data.urls.regular
    } catch (err) {
      console.error('Erro ao buscar imagem Unsplash (' + q + '):', err.message)
      return null
    }
  }

  const queryFinal = query + ' soccer brazil'
  const resultado = await tentarBusca(queryFinal)
  if (resultado) return resultado

  for (const fallback of FALLBACKS) {
    const url = await tentarBusca(fallback)
    if (url) return url
  }

  return null
}

// ─── GERA TEXTO COM CLAUDE ───

async function gerarTextoEducativo(jogos) {
  try {
    const listaJogos = jogos.slice(0, 10).map(function(j) {
      return j.timeCasa + ' x ' + j.timeFora + ' (' + j.liga + ') - ' + j.dataJogo
    }).join('\n')

    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Voce e um especialista em futebol e estatistica esportiva.

Esses sao os jogos mais relevantes dos proximos dias:
${listaJogos}

Escolha o confronto mais interessante e retorne EXATAMENTE neste formato, sem texto adicional:

DADO: [curiosidade ou estatistica impactante sobre o confronto ou times, pode ser numero, pergunta provocativa ou fato historico, maximo 10 palavras, ex: "83% dos jogos terminaram com mais de 2 gols" ou "Voce sabia? Esses times se enfrentaram 3 vezes em finais" — seja criativo e variado]
CONFRONTO: [Time Casa x Time Fora - Data curta, ex: Flamengo x Palmeiras - 03/04]
RESUMO: [exatamente 2 frases completas, cada uma com no maximo 60 caracteres, terminando com ponto final, sobre o confronto, sem mencionar apostas]
TEXTO: [post completo para legenda do Instagram, maximo 5 linhas, curioso e informativo, termine com "Acompanha a analise completa no nosso Telegram. Link na bio.", sem apostas]
QUERY_IMAGEM: [3 palavras em ingles para foto no Unsplash, ex: football stadium crowd]`
      }]
    }, {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    })

    const resposta = res.data.content[0].text.trim()
    const linhasResposta = resposta.split('\n')

    let dado = 'Futebol com dados e estatisticas'
    let confronto = ''
    let resumo = ''
    let texto = ''
    let query = 'football stadium crowd'

    linhasResposta.forEach(function(linha) {
      if (linha.startsWith('DADO:')) dado = linha.replace('DADO:', '').trim()
      else if (linha.startsWith('CONFRONTO:')) confronto = linha.replace('CONFRONTO:', '').trim()
      else if (linha.startsWith('QUERY_IMAGEM:')) query = linha.replace('QUERY_IMAGEM:', '').trim()
    })

    const idxTexto = resposta.indexOf('TEXTO:')
    const idxQuery = resposta.indexOf('QUERY_IMAGEM:')
    if (idxTexto >= 0 && idxQuery > idxTexto) {
      texto = resposta.substring(idxTexto + 6, idxQuery).trim()
    }

    const idxResumo = resposta.indexOf('RESUMO:')
    if (idxResumo >= 0 && idxTexto > idxResumo) {
      resumo = resposta.substring(idxResumo + 7, idxTexto).trim()
    }

    console.log('Conteudo educativo gerado — Dado:', dado, '| Confronto:', confronto)
    return { dado, confronto, resumo, texto, query }

  } catch (err) {
    console.error('Erro ao chamar Claude:', err.response?.data || err.message)
    return null
  }
}

// ─── GERA CARD FEED 1:1 ───

async function gerarCardEducativo(dado, confronto, imagemUrl) {
  const width = 1080
  const height = 1080
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, width, height)

  if (imagemUrl) {
    try {
      const img = await loadImage(imagemUrl)
      ctx.drawImage(img, 0, 0, width, height)
    } catch (err) {
      console.log('Erro ao carregar imagem:', err.message)
    }
  }

  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, 0, width, height)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#00c48c'

  let tamanhoFonte = 88
  ctx.font = 'bold ' + tamanhoFonte + 'px ' + FONTE

  const palavras = dado.split(' ')
  let linhasDado = []
  let linhaAtual = ''
  palavras.forEach(function(p) {
    const teste = linhaAtual + p + ' '
    if (ctx.measureText(teste).width > 880 && linhaAtual) {
      linhasDado.push(linhaAtual.trim())
      linhaAtual = p + ' '
    } else { linhaAtual = teste }
  })
  if (linhaAtual) linhasDado.push(linhaAtual.trim())

  if (linhasDado.length > 3) {
    tamanhoFonte = 70
    ctx.font = 'bold ' + tamanhoFonte + 'px ' + FONTE
    linhasDado = []
    linhaAtual = ''
    palavras.forEach(function(p) {
      const teste = linhaAtual + p + ' '
      if (ctx.measureText(teste).width > 880 && linhaAtual) {
        linhasDado.push(linhaAtual.trim())
        linhaAtual = p + ' '
      } else { linhaAtual = teste }
    })
    if (linhaAtual) linhasDado.push(linhaAtual.trim())
  }

  const paddingV = 50
  const fonteConfronto = 40
  const espacoLinha = 25
  const alturaLinhas = linhasDado.length * (tamanhoFonte + 12)
  const cardH = paddingV + alturaLinhas + tamanhoFonte + espacoLinha + 2 + 15 + fonteConfronto + paddingV
  const cardY = (1080 - cardH) / 2

  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  ctx.beginPath()
  ctx.roundRect(60, cardY, 960, cardH, 24)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,196,140,0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(60, cardY, 960, cardH, 24)
  ctx.stroke()

  ctx.shadowColor = '#00c48c'
  ctx.shadowBlur = 20
  ctx.fillStyle = '#ffffff'
  let yBase = cardY + paddingV + tamanhoFonte
  linhasDado.forEach(function(linha) {
    ctx.fillText(linha, 540, yBase)
    yBase += tamanhoFonte + 12
  })
  ctx.shadowBlur = 0

  const yLinha = yBase + espacoLinha
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(160, yLinha, 760, 2)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold ' + fonteConfronto + 'px ' + FONTE
  const yConfrontoFinal = cardY + cardH - paddingV + fonteConfronto - 10
  ctx.fillText(confronto, 540, yConfrontoFinal)

  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

  const caminhoLocal = path.join(assetsDir, 'card-educativo.png')
  fs.writeFileSync(caminhoLocal, canvas.toBuffer('image/png'))
  console.log('Card educativo gerado')
  return caminhoLocal
}

// ─── GERA CARD STORY 9:16 ───

async function gerarCardEducativoStory(dado, confronto, resumo, imagemUrl) {
  const width = 1080
  const height = 1920
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, width, height)

  if (imagemUrl) {
    try {
      const img = await loadImage(imagemUrl)
      ctx.drawImage(img, 0, 0, width, height)
    } catch (err) {
      console.log('Erro ao carregar imagem no story:', err.message)
    }
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, 'rgba(0,0,0,0.6)')
  gradient.addColorStop(0.35, 'rgba(0,0,0,0.4)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.9)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  const cardY = 500
  const maxLargura = 900

  ctx.textAlign = 'center'
  ctx.fillStyle = '#00c48c'

  let tamanhoFonte = 90
  ctx.font = 'bold ' + tamanhoFonte + 'px ' + FONTE
  const palavras = dado.split(' ')
  let linhasDado = []
  let linhaAtual = ''
  palavras.forEach(function(p) {
    const teste = linhaAtual + p + ' '
    if (ctx.measureText(teste).width > maxLargura && linhaAtual) {
      linhasDado.push(linhaAtual.trim())
      linhaAtual = p + ' '
    } else { linhaAtual = teste }
  })
  if (linhaAtual) linhasDado.push(linhaAtual.trim())

  if (linhasDado.length > 2) {
    tamanhoFonte = 70
    ctx.font = 'bold ' + tamanhoFonte + 'px ' + FONTE
  }

  let yDado = cardY
  linhasDado.forEach(function(linha) {
    ctx.fillText(linha, 540, yDado)
    yDado += tamanhoFonte + 16
  })

  const yConfronto = yDado + 40
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillRect(160, yConfronto - 30, 760, 2)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 52px ' + FONTE
  ctx.fillText(confronto, 540, yConfronto + 20)

  const yResumoInicio = yConfronto + 100
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '34px ' + FONTE
  const maxWidthResumo = 860
  const palavrasResumo = resumo.replace('\n', ' ').split(' ').filter(p => p)
  const linhasResumo = []
  let lAtual = ''
  palavrasResumo.forEach(function(p) {
    const teste = lAtual + p + ' '
    if (ctx.measureText(teste).width > maxWidthResumo && lAtual) {
      linhasResumo.push(lAtual.trim())
      lAtual = p + ' '
    } else { lAtual = teste }
  })
  if (lAtual) linhasResumo.push(lAtual.trim())

  let yResumo = yResumoInicio
  linhasResumo.slice(0, 4).forEach(function(linha) {
    ctx.fillText(linha, 540, yResumo)
    yResumo += 46
  })

  ctx.fillStyle = '#00c48c'
  ctx.font = 'bold 32px ' + FONTE
  ctx.fillText('Analise completa no Telegram - Link na bio', 540, 1550)

  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

  const caminhoLocal = path.join(assetsDir, 'card-educativo-story.png')
  fs.writeFileSync(caminhoLocal, canvas.toBuffer('image/png'))
  console.log('Story educativo gerado')
  return caminhoLocal
}

// ─── PUBLISH ───

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
    console.log('Post educativo publicado no Instagram!')
    return true
  } catch (err) {
    console.error('Erro ao publicar:', err.response?.data || err.message)
    return false
  }
}

async function publicarStoryViaZernio(imageUrl) {
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

async function postarConteudoEducativo(jogos) {
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

  try {
    console.log('Gerando conteudo educativo...')

    const resultado = await gerarTextoEducativo(jogos)
    if (!resultado) return

    const { dado, confronto, resumo, texto, query } = resultado

    console.log('Buscando imagem no Unsplash:', query)
    const imagemUrl = await buscarImagemUnsplash(query)

    const caminhoLocal = await gerarCardEducativo(dado, confronto, imagemUrl)

    // [skip ci] incluído automaticamente via utils.subirImagemGithub
    const urlPublica = await subirImagemGithub(axios, caminhoLocal, 'card-educativo.png')
    if (!urlPublica) return

    const hashtags = gerarHashtags(texto)
    const caption = texto + '\n\n' + hashtags
    await publicarViaZernio(caption, urlPublica)

    console.log('Gerando story educativo...')
    const storyLocal = await gerarCardEducativoStory(dado, confronto, resumo, imagemUrl)
    const storyUrl = await subirImagemGithub(axios, storyLocal, 'card-educativo-story.png')
    if (storyUrl) {
      await publicarStoryViaZernio(storyUrl)
    }

  } catch (err) {
    console.error('Erro no post educativo:', err.message)
  }
}

module.exports = { postarConteudoEducativo }

// CORREÇÃO: linha de auto-execução removida — causava execução imediata no deploy
// A função é chamada apenas pelo cron em index.js
