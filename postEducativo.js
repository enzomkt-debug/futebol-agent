require('dotenv').config()
const axios = require('axios')
const { createCanvas, loadImage } = require('canvas')
const fs = require('fs')
const path = require('path')
const { gerarESubirStory } = require('./gerarImagem')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY
const ZERNIO_ACCOUNT_ID = process.env.ZERNIO_ACCOUNT_ID
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_REPO = process.env.GITHUB_REPO

// Configura fontconfig para encontrar fontes no Railway (Linux)
if (process.platform !== 'win32') {
  process.env.FONTCONFIG_PATH = '/usr/share/fontconfig'
  process.env.FONTCONFIG_FILE = '/etc/fonts/fonts.conf'
}

const FONTE = process.platform === 'win32' ? 'Arial' : 'DejaVu Sans'

// ─── BUSCA IMAGEM NO UNSPLASH ───

async function buscarImagemUnsplash(query) {
  try {
    const res = await axios.get('https://api.unsplash.com/photos/random', {
      headers: { Authorization: 'Client-ID ' + UNSPLASH_ACCESS_KEY },
      params: {
        query: query,
        orientation: 'squarish',
        content_filter: 'high'
      }
    })
    return res.data.urls.regular
  } catch (err) {
    console.error('Erro ao buscar imagem Unsplash:', err.message)
    return null
  }
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
    console.log('=== RESPOSTA CLAUDE ===\n' + resposta + '\n===')
    const linhasResposta = resposta.split('\n')
    
    let dado = 'Futebol com dados e estatisticas'
    let confronto = ''
    let resumo = ''
    let texto = ''
    let query = 'football stadium crowd'

    linhasResposta.forEach(function(linha) {
      if (linha.startsWith('DADO:')) dado = linha.replace('DADO:', '').trim()
      else if (linha.startsWith('CONFRONTO:')) confronto = linha.replace('CONFRONTO:', '').trim()
      else if (linha.startsWith('RESUMO:')) resumo = linha.replace('RESUMO:', '').trim()
      else if (linha.startsWith('QUERY_IMAGEM:')) query = linha.replace('QUERY_IMAGEM:', '').trim()
    })

    // Extrai TEXTO entre TEXTO: e QUERY_IMAGEM:
    const idxTexto = resposta.indexOf('TEXTO:')
    const idxQuery = resposta.indexOf('QUERY_IMAGEM:')
    if (idxTexto >= 0 && idxQuery > idxTexto) {
      texto = resposta.substring(idxTexto + 6, idxQuery).trim()
    }

    // Extrai RESUMO entre RESUMO: e TEXTO:
    const idxResumo = resposta.indexOf('RESUMO:')
    if (idxResumo >= 0 && idxTexto > idxResumo) {
      resumo = resposta.substring(idxResumo + 7, idxTexto).trim()
    }

    console.log('Dado:', dado)
    console.log('Confronto:', confronto)
    console.log('Resumo:', resumo)
    console.log('Query Unsplash:', query)

    return { dado, confronto, resumo, texto, query }

  } catch (err) {
    console.error('Erro ao chamar Claude:', err.response?.data || err.message)
    return null
  }
}

// ─── GERA CARD COM FOTO DE FUNDO ───

async function gerarCardEducativo(dado, confronto, imagemUrl) {
  const width = 1080
  const height = 1080
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Fundo escuro fallback
  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, width, height)

  // Foto de fundo
  if (imagemUrl) {
    try {
      const img = await loadImage(imagemUrl)
      ctx.drawImage(img, 0, 0, width, height)
    } catch (err) {
      console.log('Erro ao carregar imagem:', err.message)
    }
  }

  // Overlay escuro geral
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(0, 0, width, height)

  // ─── Calcula o texto primeiro para definir o tamanho do card ───
  ctx.textAlign = 'center'
  ctx.fillStyle = '#00c48c'

  // Fonte inicial grande, quebra em linhas
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
  const espacoConfronto = 100
  const alturaLinhas = linhasDado.length * (tamanhoFonte + 12)
  const cardH = paddingV * 2 + alturaLinhas + espacoConfronto
  const cardY = (1080 - cardH) / 2

  // Desenha o card com tamanho calculado
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  ctx.beginPath()
  ctx.roundRect(60, cardY, 960, cardH, 24)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,196,140,0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(60, cardY, 960, cardH, 24)
  ctx.stroke()

  // Dado dentro do card — branco com sombra para destacar
  ctx.shadowColor = '#00c48c'
  ctx.shadowBlur = 20
  ctx.fillStyle = '#ffffff'
  let yDado = cardY + paddingV + tamanhoFonte
  linhasDado.forEach(function(linha) {
    ctx.fillText(linha, 540, yDado)
    yDado += tamanhoFonte + 12
  })
  ctx.shadowBlur = 0

  // Linha divisoria
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(160, yDado + 15, 760, 1)

  // Confronto
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 40px ' + FONTE
  ctx.fillText(confronto, 540, yDado + 65)

  // Salva
  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

  const caminhoLocal = path.join(assetsDir, 'card-educativo.png')
  fs.writeFileSync(caminhoLocal, canvas.toBuffer('image/png'))
  console.log('Card educativo gerado:', caminhoLocal)
  return caminhoLocal
}

// ─── SOBE PARA GITHUB ───

async function subirGithub(caminhoLocal) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) return null

  try {
    const conteudo = fs.readFileSync(caminhoLocal)
    const base64 = conteudo.toString('base64')
    const nomeArquivo = 'card-educativo.png'

    let sha = null
    try {
      const getRes = await axios.get(
        'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
        { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
      )
      sha = getRes.data.sha
    } catch (e) {}

    const body = { message: 'Atualiza card educativo', content: base64 }
    if (sha) body.sha = sha

    await axios.put(
      'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
      body,
      { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
    )

    const urlPublica = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/main/assets/' + nomeArquivo + '?t=' + Date.now()
    console.log('Card educativo subido:', urlPublica)
    return urlPublica

  } catch (err) {
    console.error('Erro ao subir card educativo:', err.message)
    return null
  }
}

// ─── PUBLICA NO INSTAGRAM ───

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

  // Overlay gradiente
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, 'rgba(0,0,0,0.6)')
  gradient.addColorStop(0.35, 'rgba(0,0,0,0.4)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.9)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // Sem header — story minimalista

  // ─── BLOCO DO DADO ───
  const cardY = 500
  const maxLargura = 900

  ctx.textAlign = 'center'
  ctx.fillStyle = '#00c48c'

  // Quebra o dado em linhas
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

  // ─── CONFRONTO ───
  const yConfronto = yDado + 40
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillRect(160, yConfronto - 30, 760, 2)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 52px ' + FONTE
  ctx.fillText(confronto, 540, yConfronto + 20)

  // ─── RESUMO ─── (com quebra automática e margem lateral)
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

  // ─── CTA — respiro de 350px do fundo para icones do Instagram ───
  ctx.fillStyle = '#00c48c'
  ctx.font = 'bold 32px ' + FONTE
  ctx.fillText('Analise completa no Telegram - Link na bio', 540, 1550)

  // Sem rodape — story minimalista

  const assetsDir = path.join(__dirname, 'assets')
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

  const caminhoLocal = path.join(assetsDir, 'card-educativo-story.png')
  fs.writeFileSync(caminhoLocal, canvas.toBuffer('image/png'))
  console.log('Story educativo gerado:', caminhoLocal)
  return caminhoLocal
}

async function subirGithubArquivo(caminhoLocal, nomeArquivo) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) return null

  try {
    const conteudo = fs.readFileSync(caminhoLocal)
    const base64 = conteudo.toString('base64')

    let sha = null
    try {
      const getRes = await axios.get(
        'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
        { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
      )
      sha = getRes.data.sha
    } catch (e) {}

    const body = { message: 'Atualiza ' + nomeArquivo, content: base64 }
    if (sha) body.sha = sha

    await axios.put(
      'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
      body,
      { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
    )

    const urlPublica = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/main/assets/' + nomeArquivo + '?t=' + Date.now()
    console.log('Arquivo subido:', urlPublica)
    return urlPublica

  } catch (err) {
    console.error('Erro ao subir arquivo:', err.message)
    return null
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

    // 1. Claude gera texto e query de imagem
    const resultado = await gerarTextoEducativo(jogos)
    if (!resultado) return

    const { dado, confronto, resumo, texto, query } = resultado

    // 2. Busca imagem no Unsplash
    console.log('Buscando imagem no Unsplash:', query)
    const imagemUrl = await buscarImagemUnsplash(query)

    // 3. Gera card
    const caminhoLocal = await gerarCardEducativo(dado, confronto, imagemUrl)

    // 4. Sobe para GitHub
    const urlPublica = await subirGithub(caminhoLocal)
    if (!urlPublica) return

    // 5. Publica no feed
    const hashtags = gerarHashtags(texto)
    const caption = texto + '\n\n' + hashtags
    await publicarViaZernio(caption, urlPublica)

    // 6. Gera e publica story 9:16 com a mesma foto de fundo
    console.log('Gerando story educativo...')
    const storyLocal = await gerarCardEducativoStory(dado, confronto, resumo, imagemUrl)
    const storyPath = path.join(__dirname, 'assets', 'card-educativo-story.png')
    const storyUrl = await subirGithubArquivo(storyLocal, 'card-educativo-story.png')
    if (storyUrl) {
      await publicarStoryViaZernio(storyUrl)
    }

  } catch (err) {
    console.error('Erro no post educativo:', err.message)
  }
}

module.exports = { postarConteudoEducativo }