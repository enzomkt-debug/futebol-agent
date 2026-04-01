const axios = require('axios')
require('dotenv').config()

const headers = { 'X-Auth-Token': process.env.API_FOOTBALL_KEY }

async function main() {
  // 1. Competições disponíveis no plano
  console.log('=== /v4/competitions ===')
  const resComp = await axios.get('https://api.football-data.org/v4/competitions', { headers })
  resComp.data.competitions.forEach(function(c) {
    console.log(c.id + ' | ' + c.name + ' (' + c.area.name + ')')
  })

  // 2. Partidas dos próximos 7 dias — agrupa competições únicas
  console.log('\n=== Competições nos próximos 7 dias (/v4/matches) ===')
  const hoje = new Date().toISOString().split('T')[0]
  const fim = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const resMatches = await axios.get('https://api.football-data.org/v4/matches', {
    headers,
    params: { dateFrom: hoje, dateTo: fim }
  })
  const vistas = {}
  resMatches.data.matches.forEach(function(m) {
    const key = m.competition.id
    if (!vistas[key]) {
      vistas[key] = m.competition.name + ' (' + (m.area ? m.area.name : '?') + ')'
      console.log(key + ' | ' + vistas[key])
    }
  })
  console.log('\nTotal de partidas:', resMatches.data.matches.length)
}

main().catch(function(err) {
  console.error('ERRO:', err.message)
  if (err.response) console.error(JSON.stringify(err.response.data))
})