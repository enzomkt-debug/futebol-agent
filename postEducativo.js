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

HEADLINE: [frase de impacto curta em maiusculas, maximo 4 palavras, ex: CHOQUE DE GIGANTES]
CONFRONTO: [Time Casa x Time Fora - Data, ex: Flamengo x Palmeiras - 03/04]
TEXTO: [post completo para legenda do Instagram, maximo 5 linhas, curioso e informativo sobre o confronto, termine com "Acompanha a analise completa no nosso Telegram. Link na bio.", sem apostas, sem inventar estatisticas]
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
    
    let headline = 'FUTEBOL & DADOS'
    let confronto = ''
    let texto = ''
    let query = 'football stadium crowd'

    linhasResposta.forEach(function(linha) {
      if (linha.startsWith('HEADLINE:')) headline = linha.replace('HEADLINE:', '').trim()
      else if (linha.startsWith('CONFRONTO:')) confronto = linha.replace('CONFRONTO:', '').trim()
      else if (linha.startsWith('QUERY_IMAGEM:')) query = linha.replace('QUERY_IMAGEM:', '').trim()
      else if (linha.startsWith('TEXTO:')) texto = linha.replace('TEXTO:', '').trim()
    })

    // Se o texto vier em múltiplas linhas após TEXTO:
    const idxTexto = resposta.indexOf('TEXTO:')
    const idxQuery = resposta.indexOf('QUERY_IMAGEM:')
    if (idxTexto >= 0 && idxQuery > idxTexto) {
      texto = resposta.substring(idxTexto + 6, idxQuery).trim()
    }

    console.log('Headline:', headline)
    console.log('Confronto:', confronto)
    console.log('Query Unsplash:', query)

    return { headline, confronto, texto, query }

  } catch (err) {
    console.error('Erro ao chamar Claude:', err.response?.data || err.message)
    return null
  }
}

// ─── GERA CARD COM FOTO DE FUNDO ───

async function gerarCardEducativo(headline, confronto, imagemUrl) {
  const width = 1080
  const height = 1080
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Fundo escuro fallback
  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, width, height)

  // Carrega imagem de fundo
  if (imagemUrl) {
    try {
      const img = await loadImage(imagemUrl)
      ctx.drawImage(img, 0, 0, width, height)
    } catch (err) {
      console.log('Erro ao carregar imagem, usando fundo escuro:', err.message)
    }
  }

  // Overlay gradiente — mais escuro no centro para destacar o texto
  const gradient = ctx.createRadialGradient(540, 540, 100, 540, 540, 700)
  gradient.addColorStop(0, 'rgba(0,0,0,0.65)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // Headline grande centralizado
  ctx.textAlign = 'center'
  ctx.fillStyle = '#00c48c'
  ctx.font = 'bold 100px ' + FONTE
  ctx.fillText(headline, 540, 460)

  // Linha divisoria sutil
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillRect(200, 490, 680, 2)

  // Confronto
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 52px ' + FONTE
  ctx.fillText(confronto, 540, 580)

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


async function gerarCardEducativoStory(headline, confronto, imagemUrl) {
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

  // Barra topo
  ctx.fillStyle = '#00c48c'
  ctx.fillRect(0, 0, width, 10)

  // Header
  ctx.fillStyle = '#00c48c'
  ctx.font = 'bold 58px ' + FONTE
  ctx.textAlign = 'center'
  ctx.fillText('Gol Match BR', 540, 120)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '30px ' + FONTE
  ctx.fillText('@golmatchbr', 540, 168)

  ctx.fillStyle = 'rgba(0,196,140,0.4)'
  ctx.fillRect(70, 195, 940, 1)

  // Headline grande centralizado verticalmente
  ctx.textAlign = 'center'
  ctx.fillStyle = '#00c48c'
  ctx.font = 'bold 130px ' + FONTE
  ctx.fillText(headline, 540, 880)

  // Linha divisoria
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillRect(150, 910, 780, 2)

  // Confronto
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 64px ' + FONTE
  ctx.fillText(confronto, 540, 990)

  // Rodape
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 1870, width, 40)
  ctx.fillStyle = '#00c48c'
  ctx.font = 'bold 22px ' + FONTE
  ctx.fillText('golmatchbr.com.br - analise estatistica de futebol', 540, 1897)
  ctx.fillStyle = '#00c48c'
  ctx.fillRect(0, 1910, width, 10)

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

    const { headline, confronto, texto, query } = resultado

    // 2. Busca imagem no Unsplash
    console.log('Buscando imagem no Unsplash:', query)
    const imagemUrl = await buscarImagemUnsplash(query)

    // 3. Gera card
    const caminhoLocal = await gerarCardEducativo(headline, confronto, imagemUrl)

    // 4. Sobe para GitHub
    const urlPublica = await subirGithub(caminhoLocal)
    if (!urlPublica) return

    // 5. Publica no feed
    const hashtags = gerarHashtags(texto)
    const caption = texto + '\n\n' + hashtags
    await publicarViaZernio(caption, urlPublica)

    // 6. Gera e publica story 9:16 com a mesma foto de fundo
    console.log('Gerando story educativo...')
    const storyLocal = await gerarCardEducativoStory(headline, confronto, imagemUrl)
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