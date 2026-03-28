require('dotenv').config()
const axios = require('axios')
const cron = require('node-cron')
const fs = require('fs')

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

const APOSTAS_FILE = './apostas_ontem.json'

const LIGAS_PRIORITARIAS = new Set([71, 73, 13, 2, 39, 140, 135, 78])

const DICAS = [
  'Odd 2.00 significa que a casa acha que tem 50% de chance. Se voce acha que tem 60%, ai existe valor real.',
  'Nunca aposte mais de 2% do seu bankroll em uma unica aposta. Consistencia bate sorte no longo prazo.',
  'Value bet nao e sobre acertar sempre - e sobre apostar quando a odd esta maior do que deveria.',
  'BTTS tende a ter mais valor em jogos entre times do meio da tabela, nao so nos grandes.',
  'Fuja de odds muito baixas (abaixo de 1.40) - o retorno nao compensa o risco real.',
  'Forma recente dos ultimos 5 jogos importa mais do que o historico da temporada inteira.',
  'Jogos de Copa geralmente tem menos gols que jogos de campeonato. Cuidado com Over em mata-mata.'
]

// ─── RESULTADO DE ONTEM (automatico) ───

function salvarApostasDeHoje(apostas) {
  try {
    fs.writeFileSync(APOSTAS_FILE, JSON.stringify(apostas, null, 2))
    console.log('Apostas de hoje salvas para verificacao amanha')
  } catch (err) {
    console.error('Erro ao salvar apostas:', err.message)
  }
}

function carregarApostasDeOntem() {
  try {
    if (!fs.existsSync(APOSTAS_FILE)) return null
    const data = fs.readFileSync(APOSTAS_FILE, 'utf8')
    return JSON.parse(data)
  } catch (err) {
    return null
  }
}

async function buscarResultadoFixture(fixtureId) {
  try {
    const res = await axios.get('https://v3.football.api-sports.io/fixtures', {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      params: { id: fixtureId }
    })
    const fixture = res.data.response?.[0]
    if (!fixture) return null

    const status = fixture.fixture.status.short
    // FT = full time, AET = after extra time, PEN = penalties
    if (!['FT', 'AET', 'PEN'].includes(status)) return null

    return {
      golsCasa: fixture.goals.home,
      golsFora: fixture.goals.away,
      status: status
    }
  } catch (err) {
    return null
  }
}

function verificarAcerto(aposta, resultado) {
  const totalGols = resultado.golsCasa + resultado.golsFora
  const ambasMarcaram = resultado.golsCasa > 0 && resultado.golsFora > 0

  if (aposta.mercado === 'Mais de 2.5 gols') return totalGols > 2
  if (aposta.mercado === 'Menos de 2.5 gols') return totalGols < 3
  if (aposta.mercado === 'Ambas marcam: SIM') return ambasMarcaram
  return false
}

async function gerarResultadoOntem() {
  const apostasOntem = carregarApostasDeOntem()
  if (!apostasOntem || !apostasOntem.length) {
    return 'Primeiro dia de operacao!'
  }

  const destaque = apostasOntem[0]
  const resultado = await buscarResultadoFixture(destaque.fixtureId)

  if (!resultado) {
    return destaque.jogo + '\nResultado ainda nao disponivel'
  }

  const acertou = verificarAcerto(destaque, resultado)
  const placar = resultado.golsCasa + ' x ' + resultado.golsFora
  const status = acertou ? 'VERDE ✅' : 'VERMELHO ❌'

  // Conta acertos do dia
  let acertos = 0
  let total = 0
  for (const aposta of apostasOntem) {
    const res = await buscarResultadoFixture(aposta.fixtureId)
    if (!res) continue
    total++
    if (verificarAcerto(aposta, res)) acertos++
  }

  let resumo = destaque.jogo + ' (' + placar + ')\n'
  resumo += 'Tip: ' + destaque.mercado + ' - ' + status
  if (total > 1) {
    resumo += '\nDia anterior: ' + acertos + ' de ' + total + ' certas'
  }

  return resumo
}

// ─── COLETA DE DADOS ───

async function buscarJogosDoDia() {
  const hoje = new Date().toISOString().split('T')[0]
  console.log('Buscando jogos para ' + hoje + '...')
  console.log('Chave API: ' + (API_FOOTBALL_KEY ? 'OK' : 'NAO ENCONTRADA'))

  try {
    const res = await axios.get('https://v3.football.api-sports.io/fixtures', {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      params: { date: hoje }
    })

    const fixtures = res.data.response || []
    console.log(fixtures.length + ' jogos encontrados hoje no total')

    const prioritarias = []
    const outras = []

    for (const f of fixtures) {
      const jogo = {
        fixtureId: f.fixture.id,
        timeCasaId: f.teams.home.id,
        timeForaId: f.teams.away.id,
        timeCasa: f.teams.home.name,
        timeFora: f.teams.away.name,
        liga: f.league.name,
        ligaId: f.league.id
      }
      if (LIGAS_PRIORITARIAS.has(f.league.id)) {
        prioritarias.push(jogo)
      } else {
        outras.push(jogo)
      }
    }

    console.log(prioritarias.length + ' jogos em ligas prioritarias')
    console.log(outras.length + ' jogos em outras ligas (backup)')

    return [...prioritarias, ...outras]

  } catch (err) {
    console.error('Erro ao buscar jogos: ' + err.message)
    return []
  }
}

async function buscarOdds(fixtureId) {
  try {
    const res = await axios.get('https://v3.football.api-sports.io/odds', {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      params: { fixture: fixtureId, bookmaker: 8 }
    })

    const bookmakers = res.data.response?.[0]?.bookmakers || []
    if (!bookmakers.length) return null

    const bets = bookmakers[0].bets || []
    const resultado = {}

    for (const bet of bets) {
      if (bet.name === 'Goals Over/Under') {
        for (const v of bet.values) {
          if (v.value === 'Over 2.5') resultado.over25 = parseFloat(v.odd)
          if (v.value === 'Under 2.5') resultado.under25 = parseFloat(v.odd)
        }
      }
      if (bet.name === 'Both Teams Score') {
        for (const v of bet.values) {
          if (v.value === 'Yes') resultado.bttsSim = parseFloat(v.odd)
        }
      }
    }

    return resultado
  } catch (err) {
    console.error('Erro odds fixture ' + fixtureId + ': ' + err.message)
    return null
  }
}

async function buscarStats(timeCasaId, timeForaId) {
  try {
    const [resCasa, resFora, resH2H] = await Promise.all([
      axios.get('https://v3.football.api-sports.io/fixtures', {
        headers: { 'x-apisports-key': API_FOOTBALL_KEY },
        params: { team: timeCasaId, last: 5 }
      }),
      axios.get('https://v3.football.api-sports.io/fixtures', {
        headers: { 'x-apisports-key': API_FOOTBALL_KEY },
        params: { team: timeForaId, last: 5 }
      }),
      axios.get('https://v3.football.api-sports.io/fixtures/headtohead', {
        headers: { 'x-apisports-key': API_FOOTBALL_KEY },
        params: { h2h: timeCasaId + '-' + timeForaId, last: 5 }
      })
    ])

    const calcular = function(fixtures) {
      if (!fixtures.length) return { mediaGols: 1.5, btts: 0.5 }
      let totalGols = 0
      let bttsCount = 0
      for (const f of fixtures) {
        const gc = f.goals.home ?? 0
        const gf = f.goals.away ?? 0
        totalGols += gc + gf
        if (gc > 0 && gf > 0) bttsCount++
      }
      return { mediaGols: totalGols / fixtures.length, btts: bttsCount / fixtures.length }
    }

    return {
      casa: calcular(resCasa.data.response || []),
      fora: calcular(resFora.data.response || []),
      h2h: calcular(resH2H.data.response || [])
    }
  } catch (err) {
    return null
  }
}

function calcularEdge(stats, odds) {
  const mediaPonderada = ((stats.casa.mediaGols + stats.fora.mediaGols) / 2) * 0.7 + stats.h2h.mediaGols * 0.3

  let probOver25
  if (mediaPonderada >= 2.8) probOver25 = 0.65
  else if (mediaPonderada >= 2.3) probOver25 = 0.55
  else if (mediaPonderada >= 1.8) probOver25 = 0.45
  else probOver25 = 0.35

  const probBTTS = ((stats.casa.btts + stats.fora.btts) / 2) * 0.6 + stats.h2h.btts * 0.4

  const bets = []

  if (odds.over25) {
    const edge = probOver25 - (1 / odds.over25)
    if (edge >= 0.05) bets.push({ mercado: 'Mais de 2.5 gols', odd: odds.over25, edge: edge })
  }
  if (odds.under25) {
    const edge = (1 - probOver25) - (1 / odds.under25)
    if (edge >= 0.05) bets.push({ mercado: 'Menos de 2.5 gols', odd: odds.under25, edge: edge })
  }
  if (odds.bttsSim) {
    const edge = probBTTS - (1 / odds.bttsSim)
    if (edge >= 0.05) bets.push({ mercado: 'Ambas marcam: SIM', odd: odds.bttsSim, edge: edge })
  }

  return bets
}

function gerarMensagem(apostas, jogoParaEvitar, resultadoOntem) {
  const hoje = new Date().toLocaleDateString('pt-BR')
  const emojis = ['1.', '2.', '3.', '4.', '5.']
  const dica = DICAS[new Date().getDay() % DICAS.length]

  let listaApostas = ''
  apostas.forEach(function(a, i) {
    listaApostas += emojis[i] + ' ' + a.jogo + '\n   ' + a.mercado + ' | Odd ' + a.odd.toFixed(2) + '\n\n'
  })

  const destaque = apostas[0]

  let evitar = ''
  if (jogoParaEvitar) {
    evitar = 'JOGO PARA EVITAR\n\n' + jogoParaEvitar.jogo + '\nA odd parece tentadora mas o edge real nao justifica o risco hoje.\n\n---\n'
  }

  const linhas = [
    'ANALISE DO DIA - ' + hoje,
    '---',
    '',
    'RESULTADO DE ONTEM',
    resultadoOntem,
    '',
    '---',
    'APOSTA DESTAQUE DO DIA',
    '',
    destaque.jogo,
    'Mercado: ' + destaque.mercado,
    'Odd: ' + destaque.odd.toFixed(2),
    '',
    '---',
    'TODAS AS APOSTAS DE HOJE',
    '',
    listaApostas,
    '---',
    evitar,
    'DICA RAPIDA',
    '',
    dica,
    '',
    '---',
    'Aposte com responsabilidade. Nunca mais do que voce pode perder.'
  ]

  return linhas.join('\n')
}

async function enviarTelegram(mensagem) {
  try {
    await axios.post('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage', {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensagem
    })
    console.log('Mensagem enviada com sucesso!')
  } catch (err) {
    console.error('Erro Telegram:', err.response?.data || err.message)
  }
}

// ─── AGENTE PRINCIPAL ───

async function runAgent() {
  console.log('\n[' + new Date().toISOString() + '] Agente iniciado')

  try {
    // 1. Busca resultado de ontem automaticamente
    console.log('Verificando resultado de ontem...')
    const resultadoOntem = await gerarResultadoOntem()
    console.log('Resultado ontem: ' + resultadoOntem)

    // 2. Busca jogos de hoje
    const jogos = await buscarJogosDoDia()

    if (!jogos.length) {
      console.log('Nenhum jogo hoje.')
      await enviarTelegram('Sem jogos hoje. Dia de descanso!')
      return
    }

    // 3. Analisa jogos
    const todasApostas = []
    const jogosComBaixoEdge = []
    const jogosFiltrados = jogos.slice(0, 20)

    for (const jogo of jogosFiltrados) {
      const odds = await buscarOdds(jogo.fixtureId)
      const stats = await buscarStats(jogo.timeCasaId, jogo.timeForaId)

      if (!odds || !stats) continue

      const bets = calcularEdge(stats, odds)

      if (bets.length > 0) {
        for (const b of bets) {
          todasApostas.push({
            fixtureId: jogo.fixtureId,
            jogo: jogo.timeCasa + ' x ' + jogo.timeFora,
            liga: jogo.liga,
            mercado: b.mercado,
            odd: b.odd,
            edge: b.edge
          })
        }
      } else {
        jogosComBaixoEdge.push({ jogo: jogo.timeCasa + ' x ' + jogo.timeFora })
      }
    }

    if (!todasApostas.length) {
      await enviarTelegram('Nenhuma aposta com valor real encontrada hoje. Dia de passar!')
      return
    }

    // 4. Seleciona top 5 e salva para verificar amanha
    todasApostas.sort(function(a, b) { return b.edge - a.edge })
    const top5 = todasApostas.slice(0, 5)
    const jogoParaEvitar = jogosComBaixoEdge[0] || null

    salvarApostasDeHoje(top5)

    console.log(top5.length + ' value bets encontrados')

    // 5. Gera e envia mensagem
    const mensagem = gerarMensagem(top5, jogoParaEvitar, resultadoOntem)
    console.log('\n--- MENSAGEM ---\n' + mensagem + '\n---')

    await enviarTelegram(mensagem)

  } catch (err) {
    console.error('Erro geral:', err.message)
    await enviarTelegram('Erro ao gerar analise de hoje. Voltamos em breve!')
  }

  console.log('[' + new Date().toISOString() + '] Agente finalizado')
}

cron.schedule('0 8 * * *', runAgent, { timezone: 'America/Sao_Paulo' })

console.log('Agente agendado para 8h todos os dias (horario de Brasilia)')
console.log('Executando agora para teste...\n')

runAgent()
