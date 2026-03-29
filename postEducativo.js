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

Escolha o confronto mais interessante e crie um post para o Instagram que:
- Tenha no maximo 6 linhas
- Seja informativo e curioso sobre o confronto ou sobre um dos times
- Pode falar sobre historico entre os times, momento atual, estatisticas interessantes, recordes
- Termine com "Acompanha a analise completa no nosso Telegram. Link na bio."
- Tom envolvente, como um comentarista esportivo apaixonado
- Em portugues brasileiro informal
- NAO mencione apostas, palpites, odds ou ganho financeiro
- NAO invente estatisticas — fique em observacoes gerais e contextuais

Retorne APENAS:
1. O texto do post
2. Uma linha separada com: QUERY_IMAGEM: [3 palavras em ingles para buscar no Unsplash, ex: "football stadium crowd"]

Formato:
[texto do post]
---
QUERY_IMAGEM: [query]`
      }]
    }, {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    })

    const resposta = res.data.content[0].text.trim()
    const partes = resposta.split('---')
    const texto = partes[0].trim()
    const queryLine = partes[1] ? partes[1].trim() : ''
    const query = queryLine.replace('QUERY_IMAGEM:', '').trim() || 'football stadium'

    console.log('Texto educativo gerado:', texto)
    console.log('Query Unsplash:', query)

    return { texto, query }

  } catch (err) {
    console.error('Erro ao chamar Claude:', err.response?.data || err.message)
    return null
  }
}

// ─── GERA CARD COM FOTO DE FUNDO ───

async function gerarCardEducativo(texto, imagemUrl) {
  const width = 1080
  const height = 1080
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Fundo escuro fallback
  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, width, height)

  // Carrega imagem de fundo se disponível
  if (imagemUrl) {
    try {
      const img = await loadImage(imagemUrl)
      ctx.drawImage(img, 0, 0, width, height)
    } catch (err) {
      console.log('Erro ao carregar imagem, usando fundo escuro:', err.message)
    }
  }

  // Overlay gradiente escuro para legibilidade
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)')
  gradient.addColorStop(0.4, 'rgba(0,0,0,0.45)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.88)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  // Barra topo
  ctx.fillStyle = '#00c48c'
  ctx.fillRect(0, 0, width, 8)

  // Header
  ctx.fillStyle = '#00c48c'
  ctx.font = 'bold 46px ' + FONTE
  ctx.textAlign = 'left'
  ctx.fillText('Gol Match BR', 70, 80)

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '22px ' + FONTE
  ctx.fillText('@golmatchbr', 70, 112)

  // Tag "FUTEBOL & DADOS"
  ctx.fillStyle = 'rgba(0,196,140,0.2)'
  ctx.beginPath()
  ctx.roundRect(width - 240, 48, 170, 40, 20)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,196,140,0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(width - 240, 48, 170, 40, 20)
  ctx.stroke()
  ctx.fillStyle = '#00c48c'
  ctx.font = 'bold 16px ' + FONTE
  ctx.textAlign = 'center'
  ctx.fillText('FUTEBOL & DADOS', width - 155, 73)

  // Linha divisoria
  ctx.fillStyle = 'rgba(0,196,140,0.4)'
  ctx.fillRect(70, 132, 940, 1)

  // Texto principal — quebra automática de linha
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  const linhas = texto.split('\n').filter(l => l.trim())
  const maxLinhas = 7
  const linhasExibir = linhas.slice(0, maxLinhas)

  // Calcula posição vertical centralizada
  const tamanhoFonte = linhasExibir.length <= 4 ? 36 : linhasExibir.length <= 5 ? 32 : 28
  const alturaBloco = linhasExibir.length * (tamanhoFonte + 18)
  let yTexto = (height - alturaBloco) / 2 + 40

  ctx.font = tamanhoFonte + 'px ' + FONTE

  linhasExibir.forEach(function(linha, i) {
    // Última linha em verde (CTA)
    if (i === linhasExibir.length - 1) {
      ctx.fillStyle = '#00c48c'
      ctx.font = 'bold ' + tamanhoFonte + 'px ' + FONTE
    } else {
      ctx.fillStyle = '#ffffff'
      ctx.font = tamanhoFonte + 'px ' + FONTE
    }

    // Quebra linha se muito longa
    const maxWidth = 940
    if (ctx.measureText(linha).width > maxWidth) {
      const palavras = linha.split(' ')
      let linhaAtual = ''
      palavras.forEach(function(palavra) {
        const teste = linhaAtual + palavra + ' '
        if (ctx.measureText(teste).width > maxWidth && linhaAtual) {
          ctx.fillText(linhaAtual.trim(), 70, yTexto)
          yTexto += tamanhoFonte + 14
          linhaAtual = palavra + ' '
        } else {
          linhaAtual = teste
        }
      })
      if (linhaAtual) {
        ctx.fillText(linhaAtual.trim(), 70, yTexto)
        yTexto += tamanhoFonte + 18
      }
    } else {
      ctx.fillText(linha, 70, yTexto)
      yTexto += tamanhoFonte + 18
    }
  })

  // Rodape
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(0, 1042, width, 38)
  ctx.fillStyle = '#00c48c'
  ctx.font = 'bold 18px ' + FONTE
  ctx.textAlign = 'center'
  ctx.fillText('golmatchbr.com.br - analise estatistica de futebol', 540, 1067)

  ctx.fillStyle = '#00c48c'
  ctx.fillRect(0, 1072, width, 8)

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


async function gerarCardEducativoStory(texto, imagemUrl) {
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

  // Texto centralizado verticalmente
  const linhas = texto.split('\n').filter(l => l.trim()).slice(0, 7)
  const tamanhoFonte = linhas.length <= 4 ? 46 : linhas.length <= 5 ? 40 : 36
  const alturaBloco = linhas.length * (tamanhoFonte + 24)
  let yTexto = (height - alturaBloco) / 2 + 20

  linhas.forEach(function(linha, i) {
    if (i === linhas.length - 1) {
      ctx.fillStyle = '#00c48c'
      ctx.font = 'bold ' + tamanhoFonte + 'px ' + FONTE
    } else {
      ctx.fillStyle = '#ffffff'
      ctx.font = tamanhoFonte + 'px ' + FONTE
    }

    const maxWidth = 940
    if (ctx.measureText(linha).width > maxWidth) {
      const palavras = linha.split(' ')
      let linhaAtual = ''
      palavras.forEach(function(palavra) {
        const teste = linhaAtual + palavra + ' '
        if (ctx.measureText(teste).width > maxWidth && linhaAtual) {
          ctx.fillText(linhaAtual.trim(), 540, yTexto)
          yTexto += tamanhoFonte + 18
          linhaAtual = palavra + ' '
        } else {
          linhaAtual = teste
        }
      })
      if (linhaAtual) {
        ctx.fillText(linhaAtual.trim(), 540, yTexto)
        yTexto += tamanhoFonte + 24
      }
    } else {
      ctx.fillText(linha, 540, yTexto)
      yTexto += tamanhoFonte + 24
    }
  })

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

    const { texto, query } = resultado

    // 2. Busca imagem no Unsplash
    console.log('Buscando imagem no Unsplash:', query)
    const imagemUrl = await buscarImagemUnsplash(query)

    // 3. Gera card
    const caminhoLocal = await gerarCardEducativo(texto, imagemUrl)

    // 4. Sobe para GitHub
    const urlPublica = await subirGithub(caminhoLocal)
    if (!urlPublica) return

    // 5. Publica no feed
    const hashtags = gerarHashtags(texto)
    const caption = texto + '\n\n' + hashtags
    await publicarViaZernio(caption, urlPublica)

    // 6. Gera e publica story 9:16 com a mesma foto de fundo
    console.log('Gerando story educativo...')
    const storyLocal = await gerarCardEducativoStory(texto, imagemUrl)
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