require('dotenv').config()
const axios = require('axios')
const cron = require('node-cron')
const fs = require('fs')
const { postarInstagram } = require('./instagram')
const { createClient } = require('@supabase/supabase-js')

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const API_BASE = 'https://api.football-data.org/v4'

const APOSTAS_FILE = './apostas_ontem.json'

// ─── SUPABASE ───
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// ─── RATE LIMITER ───
// football-data.org free tier: 10 req/min → aguarda 6.5s entre requests
let ultimaRequisicao = 0
async function apiFootball(url, params) {
  const agora = Date.now()
  const espera = ultimaRequisicao + 6500 - agora
  if (espera > 0) await new Promise(r => setTimeout(r, espera))
  ultimaRequisicao = Date.now()

  const res = await axios.get(API_BASE + url, {
    headers: { 'X-Auth-Token': API_FOOTBALL_KEY },
    params
  })
  return res.data
}

// ─── SUPABASE ───

async function salvarApostasSupabase(apostas, turno) {
  try {
    const registros = apostas.map(function(a) {
      return {
        match_id: a.matchId,
        jogo: a.jogo,
        liga: a.liga,
        mercado: a.mercado,
        odd: a.odd,
        edge: a.edge,
        data_jogo: a.dataJogo,
        turno: turno
      }
    })
    const { error } = await supabase.from('apostas').insert(registros)
    if (error) console.error('Erro ao salvar apostas no Supabase:', error.message)
    else console.log(apostas.length + ' apostas salvas no Supabase')
  } catch (err) {
    console.error('Erro Supabase:', err.message)
  }
}

async function salvarResultadosSupabase(apostasOntem, resultados) {
  try {
    for (let i = 0; i < apostasOntem.length; i++) {
      const aposta = apostasOntem[i]
      const resultado = resultados[i]
      if (!resultado) continue

      const { data } = await supabase
        .from('apostas')
        .select('id')
        .eq('match_id', aposta.matchId)
        .order('criado_em', { ascending: false })
        .limit(1)

      if (!data || !data.length) continue

      const totalGols = resultado.golsCasa + resultado.golsFora
      const ambasMarcaram = resultado.golsCasa > 0 && resultado.golsFora > 0
      let acertou = false
      if (aposta.mercado === 'Mais de 2.5 gols') acertou = totalGols > 2
      else if (aposta.mercado === 'Menos de 2.5 gols') acertou = totalGols < 3
      else if (aposta.mercado === 'Ambas marcam: SIM') acertou = ambasMarcaram

      await supabase.from('resultados').insert({
        aposta_id: data[0].id,
        gols_casa: resultado.golsCasa,
        gols_fora: resultado.golsFora,
        acertou: acertou
      })
    }
    console.log('Resultados salvos no Supabase')
  } catch (err) {
    console.error('Erro ao salvar resultados:', err.message)
  }
}

async function buscarPerformance() {
  try {
    const trintaDiasAtras = new Date()
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)
    const dataCorte = trintaDiasAtras.toISOString().split('T')[0]

    const { data } = await supabase
      .from('apostas')
      .select('id, odd, resultados(acertou)')
      .gte('data_jogo', dataCorte)

    if (!data || !data.length) return null

    let total = 0
    let acertos = 0
    let roi = 0

    for (const aposta of data) {
      if (!aposta.resultados || !aposta.resultados.length) continue
      total++
      if (aposta.resultados[0].acertou) {
        acertos++
        roi += aposta.odd - 1
      } else {
        roi -= 1
      }
    }

    if (total === 0) return null

    const taxa = Math.round((acertos / total) * 100)
    const roiPct = Math.round((roi / total) * 100)

    return { total, acertos, taxa, roiPct }
  } catch (err) {
    console.error('Erro ao buscar performance:', err.message)
    return null
  }
}

// ─── LIGAS PRIORIZADAS ───
const LIGAS_PRIORIDADE = {
  2013: { prioridade: 1, nome: 'Brasileirao Serie A' },
  2152: { prioridade: 1, nome: 'Copa Libertadores' },
  2001: { prioridade: 1, nome: 'Champions League' },
  2021: { prioridade: 1, nome: 'Premier League' },
  2014: { prioridade: 2, nome: 'La Liga' },
  2002: { prioridade: 2, nome: 'Bundesliga' },
  2019: { prioridade: 2, nome: 'Serie A' },
  2015: { prioridade: 2, nome: 'Ligue 1' },
  2016: { prioridade: 3, nome: 'Championship' },
  2003: { prioridade: 3, nome: 'Eredivisie' },
  2017: { prioridade: 3, nome: 'Primeira Liga' },
  2000: { prioridade: 4, nome: 'Copa do Mundo' },
  2018: { prioridade: 4, nome: 'Eurocopa' }
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

// ─── CONTROLE DE NOTIFICADOS VIA SUPABASE ───

async function carregarNotificados() {
  try {
    const { data } = await supabase
      .from('notificados')
      .select('match_id')
      .gte('criado_em', new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00')
    if (!data) return {}
    const notificados = {}
    data.forEach(function(r) { notificados[r.match_id] = true })
    return notificados
  } catch (err) {
    console.error('Erro ao carregar notificados:', err.message)
    return {}
  }
}

async function salvarNotificado(matchId) {
  try {
    await supabase.from('notificados').insert({ match_id: String(matchId) })
  } catch (err) {
    console.error('Erro ao salvar notificado:', err.message)
  }
}

// ─── APOSTAS ───

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

async function buscarResultadoPartida(matchId) {
  try {
    const data = await apiFootball('/matches/' + matchId)
    if (data.status !== 'FINISHED') return null
    return {
      golsCasa: data.score.fullTime.home,
      golsFora: data.score.fullTime.away
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
  if (!apostasOntem || !apostasOntem.length) return 'Primeiro dia de operacao!'

  const destaque = apostasOntem[0]
  const resultado = await buscarResultadoPartida(destaque.matchId)
  if (!resultado) return destaque.jogo + '\nResultado ainda nao disponivel'

  const acertou = verificarAcerto(destaque, resultado)
  const placar = resultado.golsCasa + ' x ' + resultado.golsFora
  const status = acertou ? 'VERDE ✅' : 'VERMELHO ❌'

  let acertos = 0
  let total = 0
  for (const aposta of apostasOntem) {
    const res = await buscarResultadoPartida(aposta.matchId)
    if (!res) continue
    total++
    if (verificarAcerto(aposta, res)) acertos++
  }

  let resumo = destaque.jogo + ' (' + placar + ')\n'
  resumo += 'Tip: ' + destaque.mercado + ' - ' + status
  if (total > 1) resumo += '\nDia anterior: ' + acertos + ' de ' + total + ' certas'
  return resumo
}

// ─── MONITORAMENTO EM TEMPO REAL ───

async function monitorarResultados() {
  const apostas = carregarApostasDeOntem()
  if (!apostas || !apostas.length) return

  const notificados = carregarNotificados()
  // Data em horário de Brasília para evitar erro na virada da meia-noite
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  for (const key of Object.keys(notificados)) {
    if (!key.startsWith(hoje)) delete notificados[key]
  }

  let algumNovo = false

  for (const aposta of apostas) {
    const chave = hoje + '_' + aposta.matchId
    if (notificados[chave]) continue

    const resultado = await buscarResultadoPartida(aposta.matchId)
    if (!resultado) continue

    const acertou = verificarAcerto(aposta, resultado)
    const placar = resultado.golsCasa + ' x ' + resultado.golsFora
    const emoji = acertou ? '✅' : '❌'
    const status = acertou ? 'VERDE' : 'VERMELHO'

    const mensagem = [
      emoji + ' RESULTADO — ' + aposta.jogo,
      '',
      'Placar: ' + placar,
      'Tip: ' + aposta.mercado + ' → ' + status,
      '',
      acertou
        ? 'Analise confirmada! Nosso modelo acertou.'
        : 'Nao confirmou dessa vez. Variancia faz parte da analise estatistica.',
      '',
      '---',
      'Acompanhe o historico completo no grupo.'
    ].join('\n')

    await enviarTelegram(mensagem)
    await salvarResultadosSupabase([aposta], [resultado])
    await postarInstagram([aposta], [resultado], 'manha')

    notificados[chave] = true
    algumNovo = true
    console.log('Resultado notificado: ' + aposta.jogo + ' (' + placar + ') — ' + status)
  }

  if (algumNovo) salvarNotificados(notificados)
}

// ─── COLETA DE DADOS ───

async function buscarJogosProximosDias() {
  console.log('Buscando jogos dos proximos 7 dias...')

  const hoje = new Date()
  const fim = new Date()
  fim.setDate(hoje.getDate() + 7)

  const dateFrom = hoje.toISOString().split('T')[0]
  const dateTo = fim.toISOString().split('T')[0]

  try {
    const data = await apiFootball('/matches', { dateFrom, dateTo })
    const matches = data.matches || []
    console.log(matches.length + ' partidas encontradas nos proximos 7 dias')

    const jogos = []
    for (const m of matches) {
      const liga = LIGAS_PRIORIDADE[m.competition.id]
      if (!liga) continue
      jogos.push({
        matchId: m.id,
        timeCasaId: m.homeTeam.id,
        timeForaId: m.awayTeam.id,
        timeCasa: m.homeTeam.name,
        timeFora: m.awayTeam.name,
        liga: m.competition.name,
        ligaId: m.competition.id,
        prioridade: liga.prioridade,
        dataJogo: m.utcDate.split('T')[0],
        horario: m.utcDate
      })
    }

    jogos.sort(function(a, b) {
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade
      return a.dataJogo.localeCompare(b.dataJogo)
    })

    console.log(jogos.length + ' jogos nas ligas prioritarias')
    return jogos

  } catch (err) {
    console.error('Erro ao buscar jogos:', err.response?.data || err.message)
    return []
  }
}

async function buscarJogosHoje() {
  const hoje = new Date().toISOString().split('T')[0]
  try {
    const data = await apiFootball('/matches', { dateFrom: hoje, dateTo: hoje })
    const matches = data.matches || []
    const jogos = []
    for (const m of matches) {
      const liga = LIGAS_PRIORIDADE[m.competition.id]
      if (!liga) continue
      jogos.push({
        matchId: m.id,
        timeCasaId: m.homeTeam.id,
        timeForaId: m.awayTeam.id,
        timeCasa: m.homeTeam.name,
        timeFora: m.awayTeam.name,
        liga: m.competition.name,
        ligaId: m.competition.id,
        prioridade: liga.prioridade,
        dataJogo: hoje,
        horario: m.utcDate
      })
    }
    jogos.sort(function(a, b) { return a.prioridade - b.prioridade })
    return jogos
  } catch (err) {
    console.error('Erro ao buscar jogos de hoje:', err.message)
    return []
  }
}

// ─── H2H REAL ───

async function buscarH2H(matchId) {
  try {
    const data = await apiFootball('/matches/' + matchId + '/head2head', { limit: 10 })
    const partidas = (data.matches || []).filter(m => m.status === 'FINISHED')

    if (!partidas.length) return { mediaGols: 2.0, btts: 0.5 }

    let totalGols = 0
    let bttsCount = 0
    for (const m of partidas) {
      const gc = m.score.fullTime.home ?? 0
      const gf = m.score.fullTime.away ?? 0
      totalGols += gc + gf
      if (gc > 0 && gf > 0) bttsCount++
    }

    return {
      mediaGols: totalGols / partidas.length,
      btts: bttsCount / partidas.length
    }
  } catch (err) {
    console.log('H2H indisponivel para match ' + matchId + ', usando padrao')
    return { mediaGols: 2.0, btts: 0.5 }
  }
}

async function buscarStats(timeCasaId, timeForaId, matchId) {
  try {
    // Busca em sequência para respeitar rate limit
    const resCasa = await apiFootball('/teams/' + timeCasaId + '/matches', { status: 'FINISHED', limit: 8 })
    const resFora = await apiFootball('/teams/' + timeForaId + '/matches', { status: 'FINISHED', limit: 8 })
    const h2h = await buscarH2H(matchId)

    const calcular = function(matches) {
      const finalizados = (matches || []).filter(m => m.status === 'FINISHED').slice(0, 6)
      if (!finalizados.length) return { mediaGols: 1.5, btts: 0.5 }
      let totalGols = 0
      let bttsCount = 0
      for (const m of finalizados) {
        const gc = m.score.fullTime.home ?? 0
        const gf = m.score.fullTime.away ?? 0
        totalGols += gc + gf
        if (gc > 0 && gf > 0) bttsCount++
      }
      return {
        mediaGols: totalGols / finalizados.length,
        btts: bttsCount / finalizados.length
      }
    }

    return {
      casa: calcular(resCasa.matches),
      fora: calcular(resFora.matches),
      h2h
    }
  } catch (err) {
    return null
  }
}

// ─── ODDS DINÂMICAS ───

function estimarOddsOver(mediaGols) {
  if (mediaGols >= 3.2) return { over: 1.55, under: 2.35 }
  if (mediaGols >= 2.8) return { over: 1.70, under: 2.10 }
  if (mediaGols >= 2.5) return { over: 1.85, under: 1.95 }
  if (mediaGols >= 2.2) return { over: 2.00, under: 1.80 }
  if (mediaGols >= 1.8) return { over: 2.20, under: 1.65 }
  return { over: 2.50, under: 1.55 }
}

function estimarOddsBTTS(probBTTS) {
  if (probBTTS >= 0.65) return 1.60
  if (probBTTS >= 0.55) return 1.75
  if (probBTTS >= 0.45) return 2.00
  return 2.20
}

// ─── CÁLCULO DE EDGE COM POISSON ───

function calcularEdge(stats) {
  // Média ponderada: 60% forma recente + 40% H2H real
  const mediaRecente = (stats.casa.mediaGols + stats.fora.mediaGols) / 2
  const mediaPonderada = mediaRecente * 0.6 + stats.h2h.mediaGols * 0.4

  // Distribuição de Poisson para Over/Under 2.5
  const lambda = mediaPonderada
  const p0 = Math.exp(-lambda)
  const p1 = p0 * lambda
  const p2 = p1 * lambda / 2
  const probUnder25 = p0 + p1 + p2
  const probOver25 = 1 - probUnder25

  // BTTS ponderado
  const bttsForma = (stats.casa.btts + stats.fora.btts) / 2
  const probBTTS = bttsForma * 0.6 + stats.h2h.btts * 0.4

  const oddsOver = estimarOddsOver(mediaPonderada)
  const oddBTTS = estimarOddsBTTS(probBTTS)

  const bets = []

  const edgeOver = probOver25 - (1 / oddsOver.over)
  if (edgeOver >= 0.05) bets.push({ mercado: 'Mais de 2.5 gols', odd: oddsOver.over, edge: edgeOver, prob: probOver25 })

  const edgeUnder = probUnder25 - (1 / oddsOver.under)
  if (edgeUnder >= 0.05) bets.push({ mercado: 'Menos de 2.5 gols', odd: oddsOver.under, edge: edgeUnder, prob: probUnder25 })

  const edgeBTTS = probBTTS - (1 / oddBTTS)
  if (edgeBTTS >= 0.05) bets.push({ mercado: 'Ambas marcam: SIM', odd: oddBTTS, edge: edgeBTTS, prob: probBTTS })

  return bets
}

// ─── FORMATAÇÃO ───

function formatarData(dataStr) {
  const d = new Date(dataStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function gerarMensagem(apostas, jogoParaEvitar, resultadoOntem, turno, performance) {
  const hoje = new Date().toLocaleDateString('pt-BR')
  const dica = DICAS[Math.floor(Math.random() * DICAS.length)]
  const hojeStr = new Date().toISOString().split('T')[0]
  const turnoLabel = turno === 'manha' ? 'ANALISE DA MANHA' : turno === 'tarde' ? 'ANALISE DA TARDE' : 'ANALISE DA NOITE'

  let secaoPerformance = ''
  if (turno === 'manha' && performance) {
    const emoji = performance.taxa >= 60 ? '🔥' : performance.taxa >= 50 ? '📊' : '📉'
    secaoPerformance = emoji + ' PERFORMANCE (ultimos 30 dias)\n'
    secaoPerformance += performance.acertos + '/' + performance.total + ' certas | Taxa: ' + performance.taxa + '% | ROI: ' + (performance.roiPct >= 0 ? '+' : '') + performance.roiPct + '%\n\n---\n'
  }

  const jogosMapa = {}
  apostas.forEach(function(a) {
    if (!jogosMapa[a.jogo]) jogosMapa[a.jogo] = []
    jogosMapa[a.jogo].push(a)
  })

  const jogosUnicos = Object.values(jogosMapa)
  let listaApostas = ''
  let contador = 1

  jogosUnicos.forEach(function(mercados) {
    const principal = mercados[0]
    const dataLabel = principal.dataJogo === hojeStr ? 'HOJE' : formatarData(principal.dataJogo)
    const probPct = Math.round(principal.prob * 100)
    const oddImplicita = Math.round((1 / principal.odd) * 100)

    listaApostas += contador + '. ' + principal.jogo + ' (' + principal.liga + ') — ' + dataLabel + '\n'
    listaApostas += '   MELHOR VALOR: ' + principal.mercado + ' | Odd ' + principal.odd.toFixed(2) + '\n'
    listaApostas += '   Nosso modelo: ' + probPct + '% | Casa acha: ' + oddImplicita + '% | Edge: +' + Math.round(principal.edge * 100) + '%\n'

    if (mercados.length > 1) {
      listaApostas += '   OUTRAS OPCOES:\n'
      mercados.slice(1).forEach(function(m) {
        listaApostas += '   — ' + m.mercado + ' | Odd ' + m.odd.toFixed(2) + ' | Edge: +' + Math.round(m.edge * 100) + '%\n'
      })
    }

    listaApostas += '\n'
    contador++
  })

  const destaque = apostas[0]
  const destaqueData = destaque.dataJogo === hojeStr ? 'HOJE' : formatarData(destaque.dataJogo)
  const destaqueProbPct = Math.round(destaque.prob * 100)
  const destaqueOddImplicita = Math.round((1 / destaque.odd) * 100)

  let evitar = ''
  if (jogoParaEvitar) {
    evitar = 'JOGO PARA EVITAR\n\n' + jogoParaEvitar.jogo + '\nA odd nao reflete a probabilidade real — risco nao compensa.\n\n---\n'
  }

  const secaoResultado = turno === 'manha' ? 'RESULTADO DE ONTEM\n' + resultadoOntem + '\n\n---\n' : ''

  // Qualidade do dia baseada no edge medio
  const edgeMedio = apostas.reduce(function(sum, a) { return sum + a.edge }, 0) / apostas.length
  const edgePct = Math.round(edgeMedio * 100)
  let qualidadeDia
  if (edgePct >= 10) {
    qualidadeDia = '🟢 Dia com boa vantagem estatistica (' + edgePct + '% de edge medio)'
  } else if (edgePct >= 7) {
    qualidadeDia = '🟡 Vantagem moderada hoje (' + edgePct + '% de edge medio) — analise com atencao'
  } else {
    qualidadeDia = '🔴 Vantagem abaixo da media hoje (' + edgePct + '% de edge medio) — avalie com cautela'
  }

  return [
    turnoLabel + ' - ' + hoje,
    '---', '',
    qualidadeDia, '',
    '---', '',
    secaoResultado,
    'APOSTA DESTAQUE', '',
    destaque.jogo + ' (' + destaque.liga + ')',
    'Mercado: ' + destaque.mercado,
    'Odd: ' + destaque.odd.toFixed(2) + ' | Quando: ' + destaqueData,
    '',
    'Nosso modelo estima ' + destaqueProbPct + '% de chance.',
    'A casa de apostas esta pagando como se fosse ' + destaqueOddImplicita + '%.',
    'Essa diferenca de ' + Math.round(destaque.edge * 100) + '% e o valor real dessa aposta.',
    '', '---',
    'TODAS AS APOSTAS', '',
    listaApostas,
    '---', evitar,
    secaoPerformance,
    'DICA RAPIDA', '', dica, '',
    '---',
    'Aposte com responsabilidade. Nunca mais do que voce pode perder.'
  ].join('\n')
}

// ─── TELEGRAM ───

async function enviarTelegram(mensagem) {
  try {
    await axios.post('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage', {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensagem
    })
    console.log('Mensagem enviada no Telegram!')
  } catch (err) {
    console.error('Erro Telegram:', err.response?.data || err.message)
  }
}

// ─── AGENTE PRINCIPAL ───

async function runAgent(turno) {
  console.log('\n[' + new Date().toISOString() + '] Agente iniciado - turno: ' + turno)

  try {
    let resultadoOntem = ''
    if (turno === 'manha') {
      resultadoOntem = await gerarResultadoOntem()
      console.log('Resultado ontem: ' + resultadoOntem)
    }

    let jogos = []
    if (turno === 'manha') {
      const todosJogos = await buscarJogosProximosDias()
      const hoje = new Date().toISOString().split('T')[0]
      const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0]
      jogos = todosJogos.filter(function(j) {
        return j.dataJogo === hoje || j.dataJogo === amanha
      })
      if (!jogos.length) jogos = todosJogos.slice(0, 10)
    } else {
      jogos = await buscarJogosHoje()
      const horaCorte = turno === 'tarde' ? 14 : 18
      jogos = jogos.filter(function(j) {
        // Converte horário do jogo para Brasília antes de comparar
        const hora = parseInt(new Date(j.horario).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }))
        return hora >= horaCorte
      })
    }

    if (!jogos.length) {
      console.log('Nenhum jogo relevante para este turno.')
      return
    }

    const todasApostas = []
    const jogosComBaixoEdge = []
    // Limite reduzido para respeitar rate limit (3 reqs por jogo: casa + fora + h2h)
    const jogosFiltrados = jogos.slice(0, 15)

    for (const jogo of jogosFiltrados) {
      const stats = await buscarStats(jogo.timeCasaId, jogo.timeForaId, jogo.matchId)
      if (!stats) continue

      const bets = calcularEdge(stats)

      if (bets.length > 0) {
        for (const b of bets) {
          todasApostas.push({
            matchId: jogo.matchId,
            jogo: jogo.timeCasa + ' x ' + jogo.timeFora,
            liga: jogo.liga,
            mercado: b.mercado,
            odd: b.odd,
            edge: b.edge,
            prob: b.prob,
            prioridade: jogo.prioridade,
            dataJogo: jogo.dataJogo
          })
        }
      } else {
        jogosComBaixoEdge.push({ jogo: jogo.timeCasa + ' x ' + jogo.timeFora })
      }
    }

    if (!todasApostas.length) {
      console.log('Nenhum value bet encontrado neste turno.')
      return
    }

    todasApostas.sort(function(a, b) {
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade
      return b.edge - a.edge
    })

    const top5 = todasApostas.slice(0, 5)
    const jogoParaEvitar = jogosComBaixoEdge[0] || null

    // Salva apostas em todos os turnos para o monitor conseguir rastrear
    salvarApostasDeHoje(top5)
    await salvarApostasSupabase(top5, turno)

    console.log(top5.length + ' value bets encontrados')

    const performance = await buscarPerformance()
    const mensagem = gerarMensagem(top5, jogoParaEvitar, resultadoOntem, turno, performance)
    console.log('\n--- MENSAGEM ---\n' + mensagem + '\n---')

    await enviarTelegram(mensagem)

    if (turno === 'manha') {
      const apostasOntem = carregarApostasDeOntem()
      const resultadosReais = []
      if (apostasOntem && apostasOntem.length) {
        for (const a of apostasOntem) {
          const res = await buscarResultadoPartida(a.matchId)
          resultadosReais.push(res)
        }
        await salvarResultadosSupabase(apostasOntem, resultadosReais)
      }
      await postarInstagram(apostasOntem, resultadosReais, turno)
    }

  } catch (err) {
    console.error('Erro geral:', err.message)
    await enviarTelegram('Erro ao gerar analise de hoje. Voltamos em breve!')
  }

  console.log('[' + new Date().toISOString() + '] Agente finalizado')
}

const { postarContextoJogo } = require('./postContexto')
const { postarConteudoEducativo } = require('./postEducativo')

async function runContexto() {
  console.log('\n[' + new Date().toISOString() + '] Post de contexto iniciado')
  try {
    const jogos = await buscarJogosProximosDias()
    if (!jogos.length) {
      console.log('Nenhum jogo para post de contexto.')
      return
    }
    const jogoDestaque = jogos[0]
    await postarContextoJogo(jogoDestaque)
  } catch (err) {
    console.error('Erro no post de contexto:', err.message)
  }
  console.log('[' + new Date().toISOString() + '] Post de contexto finalizado')
}


async function runEducativo() {
  console.log('\n[' + new Date().toISOString() + '] Post educativo iniciado')
  try {
    const jogos = await buscarJogosProximosDias()
    if (!jogos.length) {
      console.log('Nenhum jogo para post educativo.')
      return
    }
    await postarConteudoEducativo(jogos)
  } catch (err) {
    console.error('Erro no post educativo:', err.message)
  }
  console.log('[' + new Date().toISOString() + '] Post educativo finalizado')
}

// ─── AGENDAMENTOS ───
cron.schedule('0 8 * * *',        function() { runAgent('manha') },     { timezone: 'America/Sao_Paulo' })
cron.schedule('0 12 * * *',       function() { runContexto() },         { timezone: 'America/Sao_Paulo' })
cron.schedule('0 13 * * *',       function() { runAgent('tarde') },     { timezone: 'America/Sao_Paulo' })
cron.schedule('0 19 * * *',       function() { runAgent('noite') },     { timezone: 'America/Sao_Paulo' })
cron.schedule('0 9 * * *',        function() { runEducativo() },        { timezone: 'America/Sao_Paulo' })
cron.schedule('0 15 * * *',       function() { runEducativo() },        { timezone: 'America/Sao_Paulo' })
cron.schedule('*/5 14-23 * * *', function() { monitorarResultados() }, { timezone: 'America/Sao_Paulo' })
cron.schedule('*/5 0-2 * * *',   function() { monitorarResultados() }, { timezone: 'America/Sao_Paulo' })

console.log('Agente agendado: 8h, 12h, 13h, 15h e 19h (horario de Brasilia)')
console.log('Monitor de resultados: a cada 5 minutos entre 14h e 02h')