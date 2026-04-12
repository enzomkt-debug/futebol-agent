require('dotenv').config()
const axios = require('axios')

const BASE_URL = 'https://app.publer.com/api/v1'
const ALERTA_CHAT_ID = '6116204841'

async function enviarAlerta(mensagem) {
  const payload = { chat_id: ALERTA_CHAT_ID, text: mensagem, parse_mode: 'HTML' }
  try {
    await axios.post('https://api.telegram.org/bot' + process.env.TELEGRAM_TOKEN + '/sendMessage', payload)
  } catch (e) {
    try {
      await new Promise(r => setTimeout(r, 5000))
      await axios.post('https://api.telegram.org/bot' + process.env.TELEGRAM_TOKEN + '/sendMessage', payload)
    } catch (e2) {
      console.error('Erro ao enviar alerta Publer:', e2.message)
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

function credenciaisOk() {
  return !!(process.env.PUBLER_API_KEY && process.env.PUBLER_INSTAGRAM_ACCOUNT_ID)
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

// ─── FUNÇÕES PÚBLICAS ─────────────────────────────────────────────────────────

async function publicarFeed(caption, imageUrl, contexto) {
  const ctx = contexto || 'feed'
  if (process.env.TEST_MODE === 'true') {
    console.log('[TEST MODE] Publicação bloqueada (' + ctx + ')')
    return true
  }
  if (!credenciaisOk()) {
    await enviarAlerta('🔴 <b>Publer — Credenciais ausentes (' + ctx + ')</b>\nVerificar PUBLER_API_KEY e PUBLER_INSTAGRAM_ACCOUNT_ID no Railway')
    return false
  }
  try {
    const mediaId = await uploadMedia(imageUrl)
    const networks = {
      instagram: { type: 'photo', text: caption, media: [{ id: mediaId, type: 'image' }] }
    }
    await createPost(networks)
    console.log('Post publicado no Instagram via Publer (' + ctx + ')')
    return true
  } catch (err) {
    console.error('Erro Publer (' + ctx + '):', err.message)
    await enviarAlerta('🔴 <b>Publer — Erro ao publicar (' + ctx + ')</b>\n' + err.message)
    return false
  }
}

async function publicarStory(imageUrl, contexto) {
  const ctx = contexto || 'story'
  if (process.env.TEST_MODE === 'true') {
    console.log('[TEST MODE] Publicação bloqueada (' + ctx + ')')
    return true
  }
  if (!credenciaisOk()) {
    return false  // alerta já enviado pelo publicarFeed
  }
  try {
    const mediaId = await uploadMedia(imageUrl)
    const networks = {
      instagram: {
        type: 'photo',
        text: '',
        media: [{ id: mediaId, type: 'image' }],
        details: { type: 'story' }
      }
    }
    await createPost(networks)
    console.log('Story publicado no Instagram via Publer (' + ctx + ')')
    return true
  } catch (err) {
    console.error('Erro Publer story (' + ctx + '):', err.message)
    await enviarAlerta('🔴 <b>Publer — Erro story (' + ctx + ')</b>\n' + err.message)
    return false
  }
}

module.exports = { publicarFeed, publicarStory, credenciaisOk }
