require('dotenv').config()
const axios = require('axios')

const API_BASE = 'https://api.football-data.org/v4'

// Rate limiter compartilhado entre index.js e popularResultados.js
// Free tier: 10 req/min → 6.5s entre requests
// O slot é RESERVADO antes do sleep (padrão token bucket) para evitar
// race condition quando duas funções chamam apiFootball ao mesmo tempo.
let proximoSlot = 0

async function apiFootball(url, params) {
  const agora = Date.now()
  const slot = Math.max(agora, proximoSlot)
  proximoSlot = slot + 6500

  const espera = slot - agora
  if (espera > 0) await new Promise(r => setTimeout(r, espera))

  const res = await axios.get(API_BASE + url, {
    headers: { 'X-Auth-Token': process.env.API_FOOTBALL_KEY },
    params
  })
  return res.data
}

module.exports = { apiFootball }
