require('dotenv').config()
const axios = require('axios')
const cron = require('node-cron')
const fs = require('fs')

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

const APOSTAS_FILE = './apostas_ontem.json'

// ─── LIGAS PRIORIZADAS (IDs API-Football) ───
const LIGAS_PRIORIDADE = {
  // NÚCLEO DURO
  71: 1,    // Brasileirão Série A
  2: 1,     // Champions League
  13: 1,    // Libertadores
  39: 1,    // Premier League
  73: 1,    // Copa do Brasil
  // MUITO FORTES
  140: 2,   // La Liga
  78: 2,    // Bundesliga
  135: 2,   // Serie A Itália
  61: 2,    // Ligue 1
  3: 2,     // Europa League
  848: 2,   // Conference League
  72: 2,    // Brasileirão Série B
  75: 2,    // Brasileirão Série C
  76: 2,    // Brasileirão Série D
  // ESTADUAIS BRASILEIROS
  13: 3,    // Campeonato Paulista (71 na API)
  62: 3,    // Campeonato Carioca
  63: 3,    // Campeonato Mineiro
  64: 3,    // Campeonato Gaúcho
  // SUL-AMERICANO
  11: 3,    // Sul-Americana
  128: 3,   // Liga Profesional Argentina
  // OUTRAS LIGAS
  262: 4,   // Liga MX
  253: 4,   // MLS
  265: 4,   // Primera División Chile
  239: 4,   // Categoría Primera A Colômbia
  // COPAS INTERNACIONAIS
  1: 2,     // Copa do Mundo FIFA
  9: 2,     // Copa América
  4: 2,     // Eurocopa
  32: 2,    // Eliminatórias Copa do Mundo
  15: 2,    // Mundial de Clubes FIFA
  // LIGAS EUROPEIAS SECUNDÁRIAS
  88: 4,    // Eredivisie
  94: 4,    // Primeira Liga Portugal
  40: 4,    // Championship Inglaterra
  179: 4,   // Scottish Premiership
  197: 4,   // Super League Greece
  144: 4,   // Belgian Pro League
  203: 4,   // Campeonato Turco
  // LIGAS ASIÁTICAS/OUTROS
  307: 5,   // Saudi Pro League
  169: 5,   // Qatar Stars League
  98: 5,    // J1 League Japão
  292: 5,   // K League Coreia
  323: 5,   // Indian Super League
  480: 5,   // China Super League
  396: 5,   // Liga Indonésia
  340: 5,   // Liga Vietnã
  188: 5,   // A-League Austrália
  288: 5,   // Premier Soccer League África do Sul
}

const DICAS = [
  'Odd 2.00 significa que a casa acha que tem 50% de chance. Se voce acha que tem 60%, ai existe valor real.',
  'Nunca aposte mais de 2% do seu bankroll em uma unica aposta. Consistencia bate sorte no longo prazo.',
  'Value bet nao e sobre acertar sempre - e sobre apostar quando a odd esta maior do que deveria.',
  'BTTS tende a ter mais valor em jogos entre times do meio da tabela, nao so nos grandes.',
  'Fuja de odds muito baixas (abaixo de 1.40) - o retorno nao compensa o risco real.',
  'Forma recente dos ultimos 5 jogos importa mais do que o historico da temporada inteira.',
  'Jogos de Copa geralmente tem menos gols que jogos de campeonato. Cuidado com Over em mata-mata.',
  'Quanto maior o edge, melhor a aposta. Edge de 10%+ e raro e muito valioso.',
  'Nao chase losses. Se o dia foi ruim, amanha e outro dia com novas oportunidades.',
  'Diversifique as apostas entre ligas diferentes para reduzir o risco.'
]

// ─── RESULTADO DE ONTEM ───

function salvarApostasDeHoje(apostas) {
  try {
    fs.writeFileSync(APOSTAS_FILE, JSON.stringify(apostas, null, 2))
    console.log('Apostas salvas para verificacao')
  } catch (err) {
    console.error('Erro ao salvar apostas:', err.message)
  }
}

function carregarApostasDeOntem() {
  try {
    if (!fs.existsSync(APOSTAS_FILE)) return null
    return JSON.parse(fs.readFileSync(APOSTAS_FILE, 'utf8'))
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
    if (!['FT', 'AET', 'PEN'].includes(status)) return null
    return { golsCasa: fixture.goals.home, golsFora: fixture.goals.away }
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
  if (!apostasOntem || !apostasOntem.length) return 'Primeiro dia de operacao!'

  const destaque = apostasOntem[0]
  const resultado = await buscarResultadoFixture(destaque.fixtureId)
  if (!resultado) return destaque.jogo + '\nResultado ainda nao disponivel'

  const acertou = verificarAcerto(destaque, resultado)
  const placar = resultado.golsCasa + ' x ' + resultado.golsFora
  const status = acertou ? 'VERDE' : 'VERMELHO'

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
  if (total > 1) resumo += '\nDia anterior: ' + acertos + ' de ' + total + ' certas'
  return resumo
}

// ─── COLETA DE DADOS ───

async function buscarJogosDoDia(diasAdiante) {
  const data = new Date()
  data.setDate(data.getDate() + (diasAdiante || 0))
  const dataStr = data.toISOString().split('T')[0]

  try {
    const res = await axios.get('https://v3.football.api-sports.io/fixtures', {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      params: { date: dataStr }
    })

    const fixtures = res.data.response || []
    const jogos = []

    for (const f of fixtures) {
      const prioridade = LIGAS_PRIORIDADE[f.league.id]
      if (!prioridade) continue

      jogos.push({
        fixtureId: f.fixture.id,
        timeCasaId: f.teams.home.id,
        timeForaId: f.teams.away.id,
        timeCasa: f.teams.home.name,
        timeFora: f.teams.away.name,
        liga: f.league.name,
        ligaId: f.league.id,
        prioridade: prioridade,
        dataJogo: dataStr,
        horario: f.fixture.date
      })
    }

    jogos.sort(function(a, b) { return a.prioridade - b.prioridade })
    return jogos
  } catch (err) {
    console.error('Erro ao buscar jogos: ' + err.message)
    return []
  }
}

async function buscarJogosProximosDias() {
  console.log('Buscando jogos dos proximos 7 dias...')
  console.log('Chave API: ' + (API_FOOTBALL_KEY ? 'OK' : 'NAO ENCONTRADA'))

  const todosJogos = []

  for (let i = 0; i <= 6; i++) {
    const jogos = await buscarJogosDoDia(i)
    todosJogos.push(...jogos)
  }

  todosJogos.sort(function(a, b) {
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade
    return a.dataJogo.localeCompare(b.dataJogo)
  })

  console.log(todosJogos.length + ' jogos relevantes encontrados')
  return todosJogos
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

    return Object.keys(resultado).length ? resultado : null
  } catch (err) {
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

function formatarData(dataStr) {
  const d = new Date(dataStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function gerarMensagem(apostas, jogoParaEvitar, resultadoOntem, turno) {
  const hoje = new Date().toLocaleDateString('pt-BR')
  const emojis = ['1.', '2.', '3.', '4.', '5.']
  const dica = DICAS[Math.floor(Math.random() * DICAS.length)]
  const hojeStr = new Date().toISOString().split('T')[0]

  const turnoLabel = turno === 'manha' ? 'ANALISE DA MANHA' : turno === 'tarde' ? 'ANALISE DA TARDE' : 'ANALISE DA NOITE'

  let listaApostas = ''
  apostas.forEach(function(a, i) {
    const dataLabel = a.dataJogo === hojeStr ? 'HOJE' : formatarData(a.dataJogo)
    listaApostas += emojis[i] + ' ' + a.jogo + ' (' + a.liga + ')\n'
    listaApostas += '   ' + a.mercado + ' | Odd ' + a.odd.toFixed(2) + ' | ' + dataLabel + '\n\n'
  })

  const destaque = apostas[0]
  const destaqueData = destaque.dataJogo === hojeStr ? 'HOJE' : formatarData(destaque.dataJogo)

  let evitar = ''
  if (jogoParaEvitar) {
    evitar = 'JOGO PARA EVITAR\n\n' + jogoParaEvitar.jogo + '\nEdge negativo — odd nao compensa o risco.\n\n---\n'
  }

  // Resultado de ontem so aparece na mensagem da manha
  const secaoResultado = turno === 'manha' ? 'RESULTADO DE ONTEM\n' + resultadoOntem + '\n\n---\n' : ''

  const linhas = [
    turnoLabel + ' - ' + hoje,
    '---',
    '',
    secaoResultado,
    'APOSTA DESTAQUE',
    '',
    destaque.jogo + ' (' + destaque.liga + ')',
    'Mercado: ' + destaque.mercado,
    'Odd: ' + destaque.odd.toFixed(2),
    'Quando: ' + destaqueData,
    '',
    '---',
    'TODAS AS APOSTAS',
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

async function runAgent(turno) {
  console.log('\n[' + new Date().toISOString() + '] Agente iniciado - turno: ' + turno)

  try {
    // Resultado de ontem so na manha
    let resultadoOntem = ''
    if (turno === 'manha') {
      console.log('Verificando resultado de ontem...')
      resultadoOntem = await gerarResultadoOntem()
      console.log('Resultado: ' + resultadoOntem)
    }

    // Busca jogos — manha busca 7 dias, tarde e noite busca so hoje
    let jogos = []
    if (turno === 'manha') {
      jogos = await buscarJogosProximosDias()
    } else {
      jogos = await buscarJogosDoDia(0)
      // Tarde: filtra jogos a partir das 14h
      // Noite: filtra jogos a partir das 18h
      const horaCorte = turno === 'tarde' ? 14 : 18
      jogos = jogos.filter(function(j) {
        const hora = new Date(j.horario).getHours()
        return hora >= horaCorte
      })
    }

    if (!jogos.length) {
      console.log('Nenhum jogo relevante para este turno.')
      return // Nao envia nada se nao tiver jogo
    }

    const todasApostas = []
    const jogosComBaixoEdge = []
    const jogosFiltrados = jogos.slice(0, 25)

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
            edge: b.edge,
            prioridade: jogo.prioridade,
            dataJogo: jogo.dataJogo
          })
        }
      } else {
        jogosComBaixoEdge.push({ jogo: jogo.timeCasa + ' x ' + jogo.timeFora })
      }
    }

    if (!todasApostas.length) {
      console.log('Nenhum value bet encontrado neste turno. Nao enviando mensagem.')
      return // Nao envia nada se nao tiver value bet
    }

    todasApostas.sort(function(a, b) {
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade
      return b.edge - a.edge
    })

    const top5 = todasApostas.slice(0, 5)
    const jogoParaEvitar = jogosComBaixoEdge[0] || null

    if (turno === 'manha') salvarApostasDeHoje(top5)

    console.log(top5.length + ' value bets encontrados')

    const mensagem = gerarMensagem(top5, jogoParaEvitar, resultadoOntem, turno)
    console.log('\n--- MENSAGEM ---\n' + mensagem + '\n---')

    await enviarTelegram(mensagem)

  } catch (err) {
    console.error('Erro geral:', err.message)
  }

  console.log('[' + new Date().toISOString() + '] Agente finalizado')
}

// ─── AGENDAMENTO 3x POR DIA ───
cron.schedule('0 8 * * *',  function() { runAgent('manha') }, { timezone: 'America/Sao_Paulo' })
cron.schedule('0 13 * * *', function() { runAgent('tarde') }, { timezone: 'America/Sao_Paulo' })
cron.schedule('0 19 * * *', function() { runAgent('noite') }, { timezone: 'America/Sao_Paulo' })

console.log('Agente agendado: 8h, 13h e 19h (horario de Brasilia)')
console.log('Executando turno da manha para teste...\n')

runAgent('manha')
