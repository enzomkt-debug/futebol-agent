require('dotenv').config()
const axios = require('axios')
const { gerarESubirImagem, gerarESubirStory } = require('./gerarImagem')
const { verificarAcerto } = require('./utils')

const BASE_URL = 'https://app.publer.com/api/v1'
const ALERTA_CHAT_ID = '6116204841'

async function enviarAlerta(mensagem) {
  const payload = { chat_id: ALERTA_CHAT_ID, text: mensagem, parse_mode: 'HTML' }
  try {
    await axios.post('https://api.telegram.org/bot' + process.env.TELEGRAM_TOKEN + '/sendMessage', payload)
  } catch (e) {
    console.error('Erro ao enviar alerta (tentativa 1):', e.message)
    try {
      await new Promise(r => setTimeout(r, 5000))
      await axios.post('https://api.telegram.org/bot' + process.env.TELEGRAM_TOKEN + '/sendMessage', payload)
    } catch (e2) {
      console.error('Erro ao enviar alerta (tentativa 2):', e2.message)
    }
  }
}

function publerHeaders() {
  return {
    Authorization: `Bearer-API ${process.env.PUBLER_API_KEY}`,
    'Publer-Workspace-Id': process.env.PUBLER_WORKSPACE_ID,
    'Content-Type': 'application/json',
  }
}

async function pollJob(jobId, maxAttempts = 15, intervalMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs))
    const { data } = await axios.get(`${BASE_URL}/job_status/${jobId}`, { headers: publerHeaders() })
    const status = data?.status
    if (status === 'complete') return data.payload?.[0]
    if (status === 'failed') throw new Error(`Publer job failed: ${JSON.stringify(data)}`)
  }
  throw new Error(`Publer job ${jobId} timed out`)
}

async function uploadMedia(imageUrl) {
  let res
  try {
    res = await axios.post(
      `${BASE_URL}/media/from-url`,
      { media: [{ url: imageUrl, account_ids: [process.env.PUBLER_INSTAGRAM_ACCOUNT_ID] }] },
      { headers: publerHeaders(), timeout: 30000 }
    )
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message
    throw new Error(`Publer media upload ${err.response?.status ?? ''}: ${detail}`)
  }

  if (res.data?.job_id) {
    const result = await pollJob(res.data.job_id)
    const mediaId = result?.id
    if (!mediaId) throw new Error(`Publer media job sem ID: ${JSON.stringify(result)}`)
    return mediaId
  }

  throw new Error(`Publer media upload resposta inesperada: ${JSON.stringify(res.data)}`)
}

async function createPost(networks) {
  let res
  try {
    res = await axios.post(
      `${BASE_URL}/posts/schedule/publish`,
      {
        bulk: {
          state: 'scheduled',
          posts: [{ networks, accounts: [{ id: process.env.PUBLER_INSTAGRAM_ACCOUNT_ID }] }],
        },
      },
      { headers: publerHeaders(), timeout: 30000 }
    )
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message
    throw new Error(`Publer post ${err.response?.status ?? ''}: ${detail}`)
  }

  const jobId = res.data?.job_id
  if (!jobId) throw new Error(`Publer post sem job_id: ${JSON.stringify(res.data)}`)
  return jobId
}

function gerarCaption(apostasOntem, resultados) {
  const hoje = new Date().toLocaleDateString('pt-BR')

  if (!apostasOntem || !apostasOntem.length || !resultados || !resultados.length) {
    return `⚽ Gol Match BR — ${hoje}

Primeiro dia de operacao! A partir de amanha voce acompanha os resultados das nossas analises diarias.

Brasileirao, Champions League, Premier League, Libertadores e mais 9 ligas analisadas automaticamente por inteligencia artificial todo dia.

Analise completa todo dia as 8h no Telegram. Link na bio para acessar.

#futebol #analiseesportiva #inteligenciaartificial #brasileirao #championsleague #golmatchbr #dadosesportivos #futebolanalitico #estatisticas`
  }

  let acertos = 0
  let total = 0
  let destaqueAcertou = false

  apostasOntem.forEach(function(a, i) {
    const res = resultados[i]
    if (!res) return
    total++
    if (verificarAcerto(a, res)) acertos++
    if (i === 0) destaqueAcertou = verificarAcerto(a, res)
  })

  const taxa = total > 0 ? Math.round((acertos / total) * 100) : 0
  const destaqueRes = resultados[0]
  const placar = destaqueRes ? destaqueRes.golsCasa + ' x ' + destaqueRes.golsFora : ''
  const probPct = (apostasOntem[0].odd && isFinite(apostasOntem[0].odd)) ? Math.round((1/apostasOntem[0].odd + (apostasOntem[0].edge || 0))*100) : 0

  if (destaqueAcertou) {
    return `✅ ACERTOU — ${hoje}

${apostasOntem[0].jogo} · ${placar}
Mercado: ${apostasOntem[0].mercado}

Nossa analise apontou ${probPct}% de probabilidade estatistica. Confirmado.

Quem acompanha o grupo recebeu essa analise as 8h da manha, antes do jogo comecar.

Ultimos 30 dias: ${acertos}/${total} analises corretas · ${taxa}% de aproveitamento.

Quer receber antes? Link na bio.

#futebol #analiseesportiva #inteligenciaartificial #brasileirao #championsleague #libertadores #estatisticas #golmatchbr #dadosesportivos #futebolanalitico`
  } else {
    return `📊 NAO CONFIRMOU — faz parte da analise estatistica.

${apostasOntem[0].jogo} · ${placar}
Mercado: ${apostasOntem[0].mercado}

Modelo estimou ${probPct}% de probabilidade. Dessa vez nao se confirmou.

Analise de dados nao e certeza — e identificar vantagem matematica no longo prazo. A consistencia esta nos numeros acumulados.

Ultimos 30 dias: ${acertos}/${total} corretas · ${taxa}% de aproveitamento.

Acompanha o historico completo. Link na bio.

#futebol #analiseesportiva #inteligenciaartificial #brasileirao #estatisticas #golmatchbr #dadosesportivos #futebolanalitico #metodo`
  }
}

async function publicarViaPubler(caption, imageUrl) {
  if (process.env.TEST_MODE === 'true') {
    console.log('[TEST MODE] Publicação bloqueada (feed)')
    console.log('[TEST MODE] imageUrl:', imageUrl)
    console.log('[TEST MODE] caption:', caption)
    return true
  }
  try {
    console.log('Publicando no Instagram via Publer...')
    const mediaId = await uploadMedia(imageUrl)
    const networks = {
      instagram: { type: 'photo', text: caption, media: [{ id: mediaId, type: 'image' }] },
    }
    await createPost(networks)
    console.log('Publicado com sucesso via Publer!')
    return true
  } catch (err) {
    console.error('Erro ao publicar via Publer:', err.message)
    await enviarAlerta('🔴 <b>Instagram (feed) — Erro Publer</b>\n' + err.message)
    return false
  }
}

async function publicarStoryViaPubler(imageUrl) {
  if (process.env.TEST_MODE === 'true') {
    console.log('[TEST MODE] Publicação bloqueada (story)')
    console.log('[TEST MODE] imageUrl:', imageUrl)
    return true
  }
  try {
    console.log('Publicando Story no Instagram via Publer...')
    const mediaId = await uploadMedia(imageUrl)
    const networks = {
      instagram: {
        type: 'photo',
        text: '',
        media: [{ id: mediaId, type: 'photo' }],
        details: { type: 'story' },
      },
    }
    const jobId = await createPost(networks)
    await pollJob(jobId)
    console.log('Story publicado com sucesso!')
    return true
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message
    console.error('Erro ao publicar story:', detail)
    await enviarAlerta('🔴 <b>Instagram (story) — Erro Publer</b>\n' + detail)
    return false
  }
}

async function postarInstagram(apostasOntem, resultados, turno) {
  if (turno !== 'manha') return

  if (!process.env.PUBLER_API_KEY || !process.env.PUBLER_INSTAGRAM_ACCOUNT_ID) {
    console.log('Credenciais do Publer nao configuradas.')
    return
  }

  try {
    console.log('Gerando imagem de resultado para Instagram...')
    const imageUrl = await gerarESubirImagem(apostasOntem || [], 'resultado', resultados || [])

    if (!imageUrl) {
      console.log('Nao foi possivel gerar URL publica da imagem.')
      return
    }

    const caption = gerarCaption(apostasOntem, resultados || [])
    await publicarViaPubler(caption, imageUrl)

    console.log('Gerando story de resultado...')
    const storyUrl = await gerarESubirStory(apostasOntem || [], resultados || [])
    if (!storyUrl) {
      console.error('Nao foi possivel gerar URL publica do story.')
      await enviarAlerta('🔴 <b>Instagram (story) — Erro ao gerar imagem</b>\nURL nula após gerarESubirStory')
      return
    }
    await publicarStoryViaPubler(storyUrl)

  } catch (err) {
    console.error('Erro no modulo Instagram:', err.message)
  }
}

module.exports = { postarInstagram }
