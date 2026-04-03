require('dotenv').config()
const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')
const { verificarAcerto } = require('./utils')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY
const API_BASE = 'https://api.football-data.org/v4'
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

// Rate limiter: free tier = 10 req/min → 6.5s entre requests
let ultimaRequisicao = 0
async function apiFootball(url) {
  const agora = Date.now()
  const espera = ultimaRequisicao + 6500 - agora
  if (espera > 0) {
    process.stdout.write('  (aguardando rate limit ' + Math.ceil(espera / 1000) + 's...)\r')
    await new Promise(r => setTimeout(r, espera))
  }
  ultimaRequisicao = Date.now()
  const res = await axios.get(API_BASE + url, {
    headers: { 'X-Auth-Token': API_FOOTBALL_KEY }
  })
  return res.data
}

async function buscarResultadoPartida(matchId) {
  try {
    const data = await apiFootball('/matches/' + matchId)
    return {
      status: data.status,
      golsCasa: data.score?.fullTime?.home ?? null,
      golsFora: data.score?.fullTime?.away ?? null
    }
  } catch (err) {
    const status = err.response?.status
    if (status === 429) {
      console.error('  ⚠️  Rate limit atingido (429) ao buscar matchId ' + matchId + ' — aguardar antes de continuar')
    } else {
      console.error('  Erro ao buscar matchId ' + matchId + ':', status || err.message)
    }
    return null
  }
}

async function popularResultados() {
  console.log('\n=== popularResultados.js ===')
  console.log('Buscando apostas passadas sem resultado...\n')

  // Delay de 10s para não conflitar com o rate limiter do index.js (runAgent das 8h)
  await new Promise(r => setTimeout(r, 10000))

  // 1. Apostas com data_jogo <= hoje e turno = 'manha' — limita aos últimos 30 dias
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const trintaDiasAtras = new Date()
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)
  const dataLimite = trintaDiasAtras.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  const { data: apostas, error } = await supabase
    .from('apostas')
    .select('id, match_id, jogo, liga, mercado, data_jogo')
    .eq('turno', 'manha')
    .gte('data_jogo', dataLimite)
    .lte('data_jogo', hoje)
    .order('data_jogo', { ascending: true })
    .limit(30)

  if (error) {
    console.error('Erro ao buscar apostas:', error.message)
    return
  }

  if (!apostas || !apostas.length) {
    console.log('Nenhuma aposta passada encontrada.')
    return
  }

  console.log('Total de apostas encontradas: ' + apostas.length)
  console.log('Período: ' + apostas[0].data_jogo + ' → ' + apostas[apostas.length - 1].data_jogo + '\n')

  let inseridos = 0
  let jaExistiam = 0
  let naoFinalizados = 0

  for (const aposta of apostas) {
    process.stdout.write('[' + aposta.data_jogo + '] ' + aposta.jogo + ' ... ')

    // 2. Verifica se já existe resultado para esta aposta
    const { data: existente } = await supabase
      .from('resultados')
      .select('id')
      .eq('aposta_id', aposta.id)
      .limit(1)

    if (existente && existente.length) {
      console.log('já existe — pulando')
      jaExistiam++
      continue
    }

    // 3. Busca resultado real na API
    const resultado = await buscarResultadoPartida(aposta.match_id)

    if (!resultado) {
      console.log('erro na API')
      await enviarAlerta('🔴 <b>popularResultados — Erro API</b>\nFalha ao buscar resultado de ' + aposta.jogo + ' (matchId: ' + aposta.match_id + ')')
      naoFinalizados++
      continue
    }

    if (resultado.status !== 'FINISHED') {
      console.log('status: ' + resultado.status + ' — aguardando')
      naoFinalizados++
      continue
    }

    // 4. Calcula acerto e insere
    const apostaFormatada = { mercado: aposta.mercado }
    const acertou = verificarAcerto(apostaFormatada, resultado)
    const placar = resultado.golsCasa + ' x ' + resultado.golsFora
    const emoji = acertou ? '✅' : '❌'

    const { error: errInsert } = await supabase.from('resultados').insert({
      aposta_id: aposta.id,
      gols_casa: resultado.golsCasa,
      gols_fora: resultado.golsFora,
      acertou: acertou
    })

    if (errInsert) {
      console.log('erro ao inserir: ' + errInsert.message)
    } else {
      console.log(placar + ' | ' + aposta.mercado + ' | ' + emoji + (acertou ? ' ACERTOU' : ' ERROU'))
      inseridos++
    }
  }

  // 5. Resumo final
  console.log('\n─────────────────────────────────────')
  console.log('RESUMO:')
  console.log('  Resultados inseridos:     ' + inseridos)
  console.log('  Já existiam:              ' + jaExistiam)
  console.log('  Jogos não finalizados:    ' + naoFinalizados)
  console.log('─────────────────────────────────────\n')

  if (inseridos > 0) {
    await enviarAlerta('✅ <b>popularResultados concluído</b>\n' + inseridos + ' resultado(s) inserido(s), ' + jaExistiam + ' já existiam, ' + naoFinalizados + ' não finalizados')
  }
}

if (require.main === module) {
  popularResultados().catch(console.error)
}

module.exports = popularResultados
