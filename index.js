require('dotenv').config()
const axios = require('axios')
const cron = require('node-cron')
const { verificarAcerto } = require('./utils')
const { postarInstagram } = require('./instagram')
const { createClient } = require('@supabase/supabase-js')

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const ALERTA_CHAT_ID = '6116204841'

// Mutex para monitorarResultados — impede execuções sobrepostas
let monitorEmExecucao = false

// ─── HANDLERS GLOBAIS DE CRASH ───
process.on('uncaughtException', async function(err) {
  console.error('UNCAUGHT EXCEPTION:', err.message)
  await enviarAlerta('🔴 <b>CRASH — uncaughtException</b>\n' + err.message)
  process.exit(1)
})
process.on('unhandledRejection', async function(reason) {
  console.error('UNHANDLED REJECTION:', reason)
  await enviarAlerta('🔴 <b>CRASH — unhandledRejection</b>\n' + String(reason))
})

// ─── SUPABASE ───
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ─── RATE LIMITER (compartilhado com popularResultados.js via apiFootball.js) ───
const { apiFootball } = require('./apiFootball')

// ─── APOSTAS VIA SUPABASE (substitui apostas_ontem.json) ───
// CORREÇÃO CRÍTICA: o filesystem do Railway é efêmero.
// Apostas são sempre persistidas e lidas do Supabase.

async function salvarApostasHojeSupabase(apostas, turno) {
  try {
    const registros = apostas.map(function(a) {
      return {
        match_id: String(a.matchId),
        jogo: a.jogo,
        liga: a.liga,
        mercado: a.mercado,
        odd: a.odd,
        edge: a.edge,
        data_jogo: a.dataJogo,
        turno: turno
      }
    })
    // Filtra registros que já existem para evitar duplicatas
    const novos = []
    for (const r of registros) {
      const { data: existe } = await supabase.from('apostas')
        .select('id').eq('match_id', r.match_id).eq('data_jogo', r.data_jogo).limit(1)
      if (!existe || !existe.length) novos.push(r)
    }
    if (!novos.length) { console.log('Apostas já existem no Supabase — nenhuma inserida'); return }
    const { error } = await supabase.from('apostas').insert(novos)
    if (error) console.error('Erro ao salvar apostas no Supabase:', error.message)
    else console.log(novos.length + ' apostas novas salvas no Supabase (' + (registros.length - novos.length) + ' já existiam)')
  } catch (err) {
    console.error('Erro Supabase salvarApostas:', err.message)
  }
}

// Busca as apostas de ontem direto do Supabase, sem depender de arquivo local
async function carregarApostasOntemSupabase() {
  try {
    const ontem = new Date()
    ontem.setDate(ontem.getDate() - 1)
    const dataOntem = ontem.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

    const { data, error } = await supabase
      .from('apostas')
      .select('*')
      .eq('data_jogo', dataOntem)
      .eq('turno', 'manha')
      .order('criado_em', { ascending: true })

    if (error) {
      console.error('Erro ao carregar apostas de ontem:', error.message)
      return null
    }

    if (!data || !data.length) return null

    // Normaliza para o mesmo formato usado pelo restante do código
    return data.map(function(r) {
      return {
        matchId: r.match_id,
        jogo: r.jogo,
        liga: r.liga,
        mercado: r.mercado,
        odd: r.odd,
        edge: r.edge,
        dataJogo: r.data_jogo,
        prioridade: 1
      }
    })
  } catch (err) {
    console.error('Erro ao carregar apostas de ontem:', err.message)
    return null
  }
}

// Busca apostas de HOJE para o monitor (todas as apostas salvas hoje)
async function carregarApostasDoDia() {
  try {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

    const { data, error } = await supabase
      .from('apostas')
      .select('*')
      .eq('data_jogo', hoje)
      .order('criado_em', { ascending: true })

    if (error) {
      console.error('Erro ao carregar apostas do dia:', error.message)
      return []
    }

    if (!data || !data.length) return []

    return data.map(function(r) {
      return {
        matchId: r.match_id,
        jogo: r.jogo,
        liga: r.liga,
        mercado: r.mercado,
        odd: r.odd,
        edge: r.edge,
        dataJogo: r.data_jogo,
        prioridade: 1
      }
    })
  } catch (err) {
    console.error('Erro ao carregar apostas do dia:', err.message)
    return []
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
        .eq('match_id', String(aposta.matchId))
        .order('criado_em', { ascending: false })
        .limit(1)

      if (!data || !data.length) continue

      const acertou = verificarAcerto(aposta, resultado)

      // Evita inserir resultado duplicado para a mesma aposta
      const { data: existente } = await supabase
        .from('resultados')
        .select('id')
        .eq('aposta_id', data[0].id)
        .limit(1)

      if (existente && existente.length) continue

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
      const acertou = aposta.resultados[0].acertou
      if (acertou === null) continue  // resultado pendente / mercado desconhecido — não contabiliza
      total++
      if (acertou === true) {
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

// ─── NORMALIZAÇÃO DE NOMES DE TIMES ───
const NOMES_TIMES = {
  // Série A brasileira
  'SC Corinthians Paulista':       'Corinthians',
  'SE Palmeiras':                  'Palmeiras',
  'CA Paranaense':                 'Athletico Paranaense',
  'Athletico Paranaense':          'Athletico Paranaense',
  'Club Atlético Paranaense':      'Athletico Paranaense',
  'EC Bahia':                      'Bahia',
  'Fluminense FC':                 'Fluminense',
  'Botafogo FR':                   'Botafogo',
  'CR Flamengo':                   'Flamengo',
  'SC Internacional':              'Internacional',
  'Grêmio FBPA':                   'Gremio',
  'São Paulo FC':                  'Sao Paulo',
  'Club de Regatas Vasco da Gama': 'Vasco da Gama',
  'CA Mineiro':                    'Atletico Mineiro',
  'RB Bragantino':                 'RB Bragantino',
  // Série B e outros brasileiros
  'América FC':                    'America Mineiro',
  'Goiás EC':                      'Goias',
  'Cuiabá EC':                     'Cuiaba',
  'Atlético Goianiense':           'Atletico Goianiense',
  'Criciúma EC':                   'Criciuma',
  'Coritiba FC':                   'Coritiba',
  'AA Ponte Preta':                'Ponte Preta',
  'Botafogo FC':                   'Botafogo SP',
  'Operário FC':                   'Operario Ferroviario',
  'Paysandu SC':                   'Paysandu',
  'Avaí FC':                       'Avai',
  'Amazonas FC':                   'Amazonas',
  'Vila Nova FC':                  'Vila Nova',
  'Clube do Remo':                 'Remo',
  'Chapecoense AF':                'Chapecoense',
  'Santos FC':                     'Santos',
  'Rayo Vallecano de Madrid':      'Rayo Vallecano',
  'Elche CF':                      'Elche',
  'Charlton Athletic FC':          'Charlton Athletic',
  'Bristol City FC':               'Bristol City',
  // Premier League
  'Manchester City FC':            'Manchester City',
  'Arsenal FC':                    'Arsenal',
  'Liverpool FC':                  'Liverpool',
  'Chelsea FC':                    'Chelsea',
  'Manchester United FC':          'Manchester United',
  'Tottenham Hotspur FC':          'Tottenham',
  'Newcastle United FC':           'Newcastle',
  'Aston Villa FC':                'Aston Villa',
  // La Liga
  'Real Madrid CF':                'Real Madrid',
  'FC Barcelona':                  'Barcelona',
  'Club Atlético de Madrid':       'Atletico Madrid',
  'Sevilla FC':                    'Sevilla',
  'Valencia CF':                   'Valencia',
  'Villarreal CF':                 'Villarreal',
  // Bundesliga
  'FC Bayern München':             'Bayern Munich',
  'RasenBallsport Leipzig':        'RB Leipzig',
  'Bayer 04 Leverkusen':           'Bayer Leverkusen',
  'Eintracht Frankfurt':           'Eintracht Frankfurt',
  // Serie A italiana
  'Juventus FC':                   'Juventus',
  'FC Internazionale Milano':      'Inter Milan',
  'AC Milan':                      'AC Milan',
  'AS Roma':                       'Roma',
  'SSC Napoli':                    'Napoli',
  'SS Lazio':                      'Lazio',
  // Ligue 1
  'Paris Saint-Germain FC':        'PSG',
  'AS Monaco FC':                  'Monaco',
  'Olympique de Marseille':        'Marseille',
  'Olympique Lyonnais':            'Lyon',
  'LOSC Lille':                    'Lille',
  // Champions / Europa
  'FC Porto':                      'Porto',
  'Sport Lisboa e Benfica':        'Benfica',
  'Sporting CP':                   'Sporting CP',
  'AFC Ajax':                      'Ajax',
  'PSV':                           'PSV',
  // Libertadores / Sul-americanos
  'Club Atlético River Plate':     'River Plate',
  'Club Atlético Boca Juniors':    'Boca Juniors',
  'Racing Club':                   'Racing Club',
  'Club Atlético Independiente':   'Independiente',
  'Club Nacional':                 'Nacional',
  'Club Atlético Peñarol':         'Penarol',
  'Club Olimpia':                  'Olimpia',
  'Club Universidad de Chile':     'Universidad de Chile',
  'Club Deportivo Colo-Colo':      'Colo Colo',
  'Club Alianza Lima':             'Alianza Lima',
  'Club Universitario de Deportes':'Universitario',
}

function normalizarNomeTime(nome) {
  return NOMES_TIMES[nome] || nome
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
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const { data } = await supabase
      .from('notificados')
      .select('match_id')
      .gte('criado_em', hoje + 'T00:00:00')
    if (!data) return {}
    const notificados = {}
    data.forEach(function(r) { notificados[r.match_id] = true })
    return notificados
  } catch (err) {
    console.error('Erro ao carregar notificados:', err.message)
    return {}
  }
}

async function salvarNotificado(chave) {
  try {
    await supabase.from('notificados').insert({ match_id: String(chave) })
  } catch (err) {
    console.error('Erro ao salvar notificado:', err.message)
  }
}

async function jaPostadoInstagram(matchId, dataJogo) {
  try {
    const chave = 'ig_' + dataJogo + '_' + matchId
    const { data } = await supabase.from('notificados').select('match_id').eq('match_id', chave).limit(1)
    return !!(data && data.length)
  } catch (err) {
    return false
  }
}

async function marcarPostadoInstagram(matchId, dataJogo) {
  try {
    const chave = 'ig_' + dataJogo + '_' + matchId
    await supabase.from('notificados').insert({ match_id: chave })
  } catch (err) {
    console.error('Erro ao marcar postado Instagram:', err.message)
  }
}

// ─── RESULTADO DE PARTIDA ───

async function buscarResultadoPartida(matchId) {
  try {
    const data = await apiFootball('/matches/' + matchId)
    if (data.status !== 'FINISHED') return null
    return {
      golsCasa: data.score.fullTime.home,
      golsFora: data.score.fullTime.away
    }
  } catch (err) {
    const status = err.response?.status
    if (status === 429) {
      console.error('Rate limit (429) ao buscar matchId ' + matchId)
      await enviarAlerta('⚠️ <b>API football-data.org — Rate limit (429)</b>\nbuscarResultadoPartida matchId=' + matchId)
    } else if (status === 403) {
      console.error('Auth falhou (403) ao buscar matchId ' + matchId)
      await enviarAlerta('🔴 <b>API football-data.org — Auth falhou (403)</b>\nVerificar API_FOOTBALL_KEY')
    } else {
      console.error('Erro ao buscar matchId ' + matchId + ':', status || err.message)
    }
    return null
  }
}

// ─── GERAÇÃO DE RESULTADO DE ONTEM (usa dados já buscados, sem chamadas API extras) ───

// Versão síncrona que reutiliza apostas e resultados já buscados pelo runAgent
function gerarTextoResultado(apostas, resultados) {
  if (!apostas || !apostas.length) return 'Primeiro dia de operacao!'
  const destaque = apostas[0]
  const resultado = resultados[0]
  if (!resultado) return destaque.jogo + '\nResultado ainda nao disponivel'

  const acertou = verificarAcerto(destaque, resultado)
  const placar = resultado.golsCasa + ' x ' + resultado.golsFora
  const status = acertou ? 'VERDE ✅' : 'VERMELHO ❌'

  let acertos = acertou ? 1 : 0
  let total = 1
  for (let i = 1; i < apostas.length; i++) {
    const res = resultados[i]
    if (!res) continue
    total++
    if (verificarAcerto(apostas[i], res)) acertos++
  }

  let resumo = destaque.jogo + ' (' + placar + ')\n'
  resumo += 'Tip: ' + destaque.mercado + ' - ' + status
  if (total > 1) resumo += '\nDia anterior: ' + acertos + ' de ' + total + ' certas'
  return resumo
}

// ─── MONITORAMENTO EM TEMPO REAL ───

async function monitorarResultados() {
  // Só monitora entre 14h e 02h (horário de Brasília) — fora desse intervalo não há jogos
  const horaAtual = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }))
  if (horaAtual >= 2 && horaAtual < 14) return

  if (monitorEmExecucao) {
    console.log('[monitor] Execução anterior ainda em andamento — pulando este tick')
    return
  }
  monitorEmExecucao = true

  try {
  // Carrega apostas de HOJE do Supabase (não de arquivo local)
  const apostas = await carregarApostasDoDia()
  if (!apostas || !apostas.length) return

  const notificados = await carregarNotificados()
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  const apostaPrincipal = apostas[0]

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

    // Salva resultado no Supabase PRIMEIRO — só marca como notificado após sucesso
    // (evita perda de dados: se Supabase falhar, próximo tick re-tenta)
    try {
      await salvarResultadosSupabase([aposta], [resultado])
    } catch (err) {
      await enviarAlerta('🔴 <b>Monitor — Erro Supabase</b>\nFalha ao salvar resultado de ' + aposta.jogo + '\n' + err.message)
      continue  // não marca como notificado — próximo tick tenta novamente
    }

    await salvarNotificado(chave)
    await enviarTelegram(mensagem)

    // Instagram: posta APENAS quando a aposta principal terminar
    const ehPrincipal = aposta.matchId === apostaPrincipal.matchId
    if (ehPrincipal) {
      const igJaPostado = await jaPostadoInstagram(aposta.matchId, hoje)
      if (!igJaPostado) {
        try {
          await postarInstagram([aposta], [resultado], 'manha')
          await marcarPostadoInstagram(aposta.matchId, hoje)
          await enviarAlerta('✅ <b>Monitor — Instagram postado</b>\n' + emoji + ' ' + aposta.jogo + ' ' + placar + ' — ' + status)
        } catch (err) {
          await enviarAlerta('🔴 <b>Monitor — Erro Instagram</b>\nFalha ao publicar card de ' + aposta.jogo + '\n' + err.message)
        }
      } else {
        console.log('Instagram já postado para ' + aposta.jogo + ' — pulando')
      }
    }

    console.log('Resultado notificado: ' + aposta.jogo + ' (' + placar + ') — ' + status)
  }

  } catch (err) {
    console.error('[monitor] Erro inesperado:', err.message)
    await enviarAlerta('🔴 <b>Monitor — Erro inesperado</b>\n' + err.message)
  } finally {
    monitorEmExecucao = false
  }
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
      const ligaConhecida = LIGAS_PRIORIDADE[m.competition.id]
      jogos.push({
        matchId: m.id,
        timeCasaId: m.homeTeam.id,
        timeForaId: m.awayTeam.id,
        timeCasa: normalizarNomeTime(m.homeTeam.name),
        timeFora: normalizarNomeTime(m.awayTeam.name),
        liga: m.competition.name,
        ligaId: m.competition.id,
        prioridade: ligaConhecida ? ligaConhecida.prioridade : 99,
        dataJogo: m.utcDate.split('T')[0],
        horario: m.utcDate
      })
    }

    jogos.sort(function(a, b) {
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade
      return a.dataJogo.localeCompare(b.dataJogo)
    })

    console.log(jogos.length + ' jogos encontrados (' + jogos.filter(function(j) { return j.prioridade !== 99 }).length + ' ligas conhecidas, ' + jogos.filter(function(j) { return j.prioridade === 99 }).length + ' desconhecidas)')
    return jogos

  } catch (err) {
    console.error('Erro ao buscar jogos:', err.response?.data || err.message)
    await enviarAlerta('⚠️ <b>API football-data.org — Erro</b>\nbuscarJogosProximosDias falhou\n' + (err.response?.status || err.message))
    return []
  }
}

async function buscarJogosHoje() {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  try {
    const data = await apiFootball('/matches', { dateFrom: hoje, dateTo: hoje })
    const matches = data.matches || []
    const jogos = []
    for (const m of matches) {
      const ligaConhecida = LIGAS_PRIORIDADE[m.competition.id]
      jogos.push({
        matchId: m.id,
        timeCasaId: m.homeTeam.id,
        timeForaId: m.awayTeam.id,
        timeCasa: normalizarNomeTime(m.homeTeam.name),
        timeFora: normalizarNomeTime(m.awayTeam.name),
        liga: m.competition.name,
        ligaId: m.competition.id,
        prioridade: ligaConhecida ? ligaConhecida.prioridade : 99,
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

// ─── H2H ───

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
    return { mediaGols: 2.0, btts: 0.5 }
  }
}

async function buscarStats(timeCasaId, timeForaId, matchId) {
  try {
    const resCasa = await apiFootball('/teams/' + timeCasaId + '/matches', { status: 'FINISHED', limit: 10 })
    const resFora = await apiFootball('/teams/' + timeForaId + '/matches', { status: 'FINISHED', limit: 10 })
    const h2h = await buscarH2H(matchId)

    // Calcula stats separando jogos em casa e fora, com peso exponencial (jogos recentes valem mais)
    const calcularAtaque = function(matches, teamId, comoMandante) {
      const finalizados = (matches || [])
        .filter(m => m.status === 'FINISHED')
        .filter(m => comoMandante ? m.homeTeam.id === teamId : m.awayTeam.id === teamId)
        .slice(0, 6)
      if (!finalizados.length) return { mediaGolsMarcados: 1.2, mediaGolsSofridos: 1.2 }
      let totalMarcados = 0
      let totalSofridos = 0
      let pesoTotal = 0
      finalizados.forEach(function(m, i) {
        const peso = Math.pow(0.85, i) // jogo mais recente vale mais
        const marcados = comoMandante ? (m.score.fullTime.home ?? 0) : (m.score.fullTime.away ?? 0)
        const sofridos  = comoMandante ? (m.score.fullTime.away ?? 0) : (m.score.fullTime.home ?? 0)
        totalMarcados += marcados * peso
        totalSofridos += sofridos * peso
        pesoTotal += peso
      })
      return {
        mediaGolsMarcados: totalMarcados / pesoTotal,
        mediaGolsSofridos: totalSofridos / pesoTotal
      }
    }

    // Time da casa jogando em casa, time de fora jogando fora
    const statsCasa = calcularAtaque(resCasa.matches, timeCasaId, true)
    const statsFora = calcularAtaque(resFora.matches, timeForaId, false)

    return {
      casa: statsCasa,
      fora: statsFora,
      h2h
    }
  } catch (err) {
    return null
  }
}

// ─── ODDS E EDGE ───

function estimarOddsOver(mediaGols) {
  if (mediaGols >= 3.2) return { over: 1.55, under: 2.35 }
  if (mediaGols >= 2.8) return { over: 1.70, under: 2.10 }
  if (mediaGols >= 2.5) return { over: 1.85, under: 1.95 }
  if (mediaGols >= 2.2) return { over: 2.00, under: 1.80 }
  if (mediaGols >= 1.8) return { over: 2.20, under: 1.65 }
  return { over: 2.50, under: 1.55 }
}


// Poisson: probabilidade de exatamente k gols com média lambda
function poissonProb(lambda, k) {
  let p = Math.exp(-lambda)
  for (let i = 0; i < k; i++) p *= lambda / (i + 1)
  return p
}

function calcularEdge(stats) {
  // Dixon-Coles: lambda separado para cada time
  // lambdaCasa = ataque do time da casa × defesa do time de fora
  // lambdaFora = ataque do time de fora × defesa do time da casa
  const lambdaCasa = stats.casa.mediaGolsMarcados * stats.fora.mediaGolsSofridos
  const lambdaFora = stats.fora.mediaGolsMarcados * stats.casa.mediaGolsSofridos

  // Pondera com H2H (30%) para suavizar
  const lambdaTotal = (lambdaCasa + lambdaFora) * 0.7 + stats.h2h.mediaGols * 0.3

  // Probabilidades over/under 2.5 via Poisson
  const probUnder25 = poissonProb(lambdaTotal, 0) + poissonProb(lambdaTotal, 1) + poissonProb(lambdaTotal, 2)
  const probOver25 = 1 - probUnder25

  const oddsOver = estimarOddsOver(lambdaTotal)
  const bets = []

  const edgeOver = probOver25 - (1 / oddsOver.over)
  if (edgeOver >= 0.08) bets.push({ mercado: 'Mais de 2.5 gols', odd: oddsOver.over, edge: edgeOver, prob: probOver25 })

  const edgeUnder = probUnder25 - (1 / oddsOver.under)
  if (edgeUnder >= 0.08) bets.push({ mercado: 'Menos de 2.5 gols', odd: oddsOver.under, edge: edgeUnder, prob: probUnder25 })

  return bets
}

// ─── FORMATAÇÃO ───

function formatarData(dataStr) {
  const d = new Date(dataStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function formatarHorarioBrasilia(horarioUtc) {
  if (!horarioUtc) return '--:--'
  const d = new Date(horarioUtc)
  const h = String((d.getUTCHours() - 3 + 24) % 24).padStart(2, '0')
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  return h + ':' + m
}

function gerarMensagem(apostas, resultadoOntem, turno, performance) {
  const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const amanhaStr = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  // Sem apostas com edge suficiente
  if (!apostas || !apostas.length) {
    const dataLabel = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    return [
      '📅 ANALISE — ' + dataLabel,
      '',
      'Nenhum jogo com vantagem estatistica identificada para hoje e amanha.',
      '',
      'Monitoramos Brasileirao, Champions League, Premier League, Libertadores e mais 6 ligas — quando houver oportunidade real, voce sera o primeiro a saber.',
      '',
      'Analise com responsabilidade.'
    ].join('\n')
  }

  const destaque = apostas[0]
  const probPct = Math.round(destaque.prob * 100)
  const horario = formatarHorarioBrasilia(destaque.horario)

  let tituloData
  if (destaque.dataJogo === hojeStr) {
    tituloData = '🎯 APOSTA DE HOJE — ' + new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } else if (destaque.dataJogo === amanhaStr) {
    tituloData = '🎯 APOSTA DE AMANHA — ' + new Date(Date.now() + 86400000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } else {
    const d = new Date(destaque.dataJogo + 'T12:00:00')
    tituloData = '🎯 APOSTA — ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  const linhas = [tituloData, '']

  if (turno === 'manha' && resultadoOntem) {
    linhas.push('📋 RESULTADO DE ONTEM')
    linhas.push(resultadoOntem)
    linhas.push('')
    linhas.push('---')
    linhas.push('')
  }

  if (turno === 'manha' && performance) {
    const emoji = performance.taxa >= 60 ? '🔥' : performance.taxa >= 50 ? '📊' : '📉'
    linhas.push(emoji + ' PERFORMANCE (30 dias): ' + performance.acertos + '/' + performance.total + ' | Taxa: ' + performance.taxa + '% | ROI: ' + (performance.roiPct >= 0 ? '+' : '') + performance.roiPct + '%')
    linhas.push('')
    linhas.push('---')
    linhas.push('')
  }

  linhas.push(destaque.jogo)
  linhas.push('🏆 ' + destaque.liga + ' | ' + horario + 'h')
  linhas.push('📊 Mercado: ' + destaque.mercado)
  linhas.push('📈 Probabilidade: ' + probPct + '% | Odd: ' + destaque.odd.toFixed(2))
  linhas.push('⚡ Edge: +' + Math.round(destaque.edge * 100) + '%')
  linhas.push('')
  linhas.push('Nosso modelo identificou vantagem estatistica real nesse jogo.')
  linhas.push('')
  linhas.push('---')
  linhas.push('Analise com responsabilidade. Os dados sao uma ferramenta, nao uma garantia.')

  return linhas.join('\n')
}

function gerarMensagemPanorama(todasApostas, jogosNeutros, jogosEvitar, jogosOriginais) {
  const SEP = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const MAX_JOGOS = 10

  // Mapa de horário/liga por matchId a partir dos jogos originais da API
  const horarioMap = {}
  const ligaMap = {}
  if (jogosOriginais) {
    jogosOriginais.forEach(function(j) {
      horarioMap[j.matchId] = j.horario
      ligaMap[j.matchId] = j.liga
    })
  }

  // Agrupa todas as apostas por matchId
  const jogosMapa = {}
  todasApostas.forEach(function(a) {
    if (!jogosMapa[a.matchId]) jogosMapa[a.matchId] = []
    jogosMapa[a.matchId].push(a)
  })
  const gruposRecomendados = Object.values(jogosMapa)

  // Seção recomendados — o primeiro jogo (destaque) é substituído pelo aviso
  let secaoRec = '🟢 RECOMENDADOS\n\n'
  secaoRec += '⭐ Aposta destaque enviada acima\n\n'

  const demaisGrupos = gruposRecomendados.slice(1).slice(0, MAX_JOGOS - 1)
  if (demaisGrupos.length) {
    demaisGrupos.forEach(function(bets) {
      const a = bets[0]
      const horario = formatarHorarioBrasilia(horarioMap[a.matchId] || a.horario)
      const liga = ligaMap[a.matchId] || a.liga || ''
      secaoRec += '⚽ ' + a.jogo + '\n'
      secaoRec += '   ' + liga + ' · ' + horario + 'h\n'
      bets.forEach(function(b) {
        const probPct = Math.round(b.prob * 100)
        secaoRec += '   ✔ ' + b.mercado + ' | Odd ' + b.odd.toFixed(2) + ' | Prob ' + probPct + '% | Edge +' + Math.round(b.edge * 100) + '%\n'
      })
      secaoRec += '\n'
    })
  } else {
    secaoRec += 'Nenhum outro jogo recomendado neste turno.\n\n'
  }

  // Seção neutros — limita para não estourar 4096 chars
  const neutrosLimitados = jogosNeutros.slice(0, Math.max(1, MAX_JOGOS - gruposRecomendados.length))
  let secaoNeutros = '🟡 JOGOS NEUTROS\n\n'
  if (neutrosLimitados.length) {
    neutrosLimitados.forEach(function(j) {
      secaoNeutros += '• ' + j.jogo + '\n'
      secaoNeutros += '  ' + (j.liga || '') + ' · ' + formatarHorarioBrasilia(j.horario) + 'h\n'
    })
    if (jogosNeutros.length > neutrosLimitados.length) {
      secaoNeutros += '  ... e mais ' + (jogosNeutros.length - neutrosLimitados.length) + ' jogos\n'
    }
  } else {
    secaoNeutros += 'Nenhum jogo neutro identificado.\n'
  }

  // Seção evitar
  let secaoEvitar = '🔴 EVITAR\n\n'
  if (jogosEvitar.length) {
    const e = jogosEvitar[0]
    secaoEvitar += '✖ ' + e.jogo + '\n'
    secaoEvitar += '  ' + (e.liga || '') + ' · ' + formatarHorarioBrasilia(e.horario) + 'h\n'
    secaoEvitar += '  Sem vantagem estatistica identificada — edge insuficiente em todos os mercados.\n'
  } else {
    secaoEvitar += 'Nenhum jogo identificado para evitar.\n'
  }

  // Resumo
  const totalAnalisado = gruposRecomendados.length + jogosNeutros.length + jogosEvitar.length
  const edgeMedio = todasApostas.length
    ? Math.round((todasApostas.reduce(function(s, a) { return s + a.edge }, 0) / todasApostas.length) * 100)
    : 0

  const secaoResumo = [
    '📊 RESUMO DO DIA',
    '',
    'Total analisado: ' + totalAnalisado + ' jogos',
    'Recomendados: ' + gruposRecomendados.length + ' | Neutros: ' + jogosNeutros.length + ' | Evitar: ' + jogosEvitar.length,
    'Edge medio dos recomendados: ' + edgeMedio + '%',
    '',
    'Analise com responsabilidade. Os dados sao uma ferramenta, nao uma garantia.'
  ].join('\n')

  return [
    '📅 PANORAMA COMPLETO — ' + hoje,
    SEP, '',
    secaoRec,
    SEP, '',
    secaoNeutros, '',
    SEP, '',
    secaoEvitar, '',
    SEP, '',
    secaoResumo
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

async function enviarAlerta(mensagem) {
  const payload = { chat_id: ALERTA_CHAT_ID, text: mensagem, parse_mode: 'HTML' }
  try {
    await axios.post('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage', payload)
  } catch (err) {
    console.error('Erro ao enviar alerta (tentativa 1):', err.message)
    try {
      await new Promise(r => setTimeout(r, 5000))
      await axios.post('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage', payload)
    } catch (err2) {
      console.error('Erro ao enviar alerta (tentativa 2):', err2.message)
    }
  }
}

// ─── AGENTE PRINCIPAL ───

async function runAgent(turno) {
  console.log('\n[' + new Date().toISOString() + '] Agente iniciado - turno: ' + turno)

  try {
    // CORREÇÃO DE ORDEM: no turno manhã, carregar apostas/resultados de ontem ANTES de salvar as de hoje
    let apostasOntemParaInstagram = null
    let resultadosReaisParaInstagram = []
    let resultadoOntem = ''

    if (turno === 'manha') {
      // 1. Carrega apostas de ontem do Supabase
      apostasOntemParaInstagram = await carregarApostasOntemSupabase()

      // 2. Busca resultados das apostas de ontem
      if (apostasOntemParaInstagram && apostasOntemParaInstagram.length) {
        for (const a of apostasOntemParaInstagram) {
          const res = await buscarResultadoPartida(a.matchId)
          resultadosReaisParaInstagram.push(res)
        }
        await salvarResultadosSupabase(apostasOntemParaInstagram, resultadosReaisParaInstagram)
      }

      // 3. Gera texto do resultado usando dados já buscados (sem chamadas API extras)
      resultadoOntem = gerarTextoResultado(apostasOntemParaInstagram, resultadosReaisParaInstagram)
      console.log('Resultado ontem: ' + resultadoOntem)
    }

    // 4. Busca jogos para análise de HOJE
    let jogos = []
    if (turno === 'manha') {
      const todosJogos = await buscarJogosProximosDias()
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      const amanha = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      jogos = todosJogos.filter(function(j) {
        return j.dataJogo === hoje || j.dataJogo === amanha
      })
      if (!jogos.length) jogos = todosJogos.slice(0, 10)
    } else {
      jogos = await buscarJogosHoje()
      const horaCorte = turno === 'tarde' ? 14 : 18
      jogos = jogos.filter(function(j) {
        const hora = (new Date(j.horario).getUTCHours() - 3 + 24) % 24
        return hora >= horaCorte
      })
    }

    if (!jogos.length) {
      console.log('Nenhum jogo relevante para este turno.')
      return
    }

    const todasApostas = []
    const jogosComBaixoEdge = []
    const jogosFiltrados = jogos.slice(0, 30)

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
        jogosComBaixoEdge.push({
          jogo: jogo.timeCasa + ' x ' + jogo.timeFora,
          liga: jogo.liga,
          horario: jogo.horario
        })
      }
    }

    if (!todasApostas.length) {
      console.log('Nenhum value bet encontrado neste turno.')
      await enviarTelegram(gerarMensagem([], resultadoOntem, turno, null))
      await enviarAlerta('⚠️ <b>runAgent(' + turno + ')</b>\nNenhuma aposta encontrada para o dia')
      return
    }

    todasApostas.sort(function(a, b) {
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade
      return b.edge - a.edge
    })

    const top5 = todasApostas.slice(0, 5)

    // 5. Salva apostas de HOJE no Supabase (após já ter processado as de ontem)
    await salvarApostasHojeSupabase(top5, turno)

    console.log(top5.length + ' value bets encontrados')

    const performance = await buscarPerformance()
    const mensagem = gerarMensagem(top5, resultadoOntem, turno, performance)
    console.log('\n--- MENSAGEM ---\n' + mensagem + '\n---')

    await enviarTelegram(mensagem)

    if (turno === 'manha') {
      let panorama = gerarMensagemPanorama(
        todasApostas,
        jogosComBaixoEdge.slice(1),
        jogosComBaixoEdge.slice(0, 1),
        jogosFiltrados
      )
      if (panorama.length > 4000) {
        panorama = panorama.slice(0, 4000) + '\n... (lista completa no grupo)'
      }
      await enviarTelegram(panorama)
    }

    // 6. Posta no Instagram com dados de ontem (turno manhã)
    // Verifica se o monitor já postou para evitar duplicata
    if (turno === 'manha' && apostasOntemParaInstagram && apostasOntemParaInstagram.length) {
      const ontem = new Date()
      ontem.setDate(ontem.getDate() - 1)
      const dataOntem = ontem.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      const igJaPostado = await jaPostadoInstagram(apostasOntemParaInstagram[0].matchId, dataOntem)
      if (!igJaPostado) {
        try {
          await postarInstagram(apostasOntemParaInstagram, resultadosReaisParaInstagram, turno)
          await marcarPostadoInstagram(apostasOntemParaInstagram[0].matchId, dataOntem)
        } catch (err) {
          await enviarAlerta('🔴 <b>runAgent(manha) — Erro Instagram</b>\nFalha ao gerar/publicar card\n' + err.message)
        }
      } else {
        console.log('Instagram já postado pelo monitor — pulando publicação no runAgent')
      }
    }

    if (turno === 'manha') {
      const nResultados = resultadosReaisParaInstagram.filter(Boolean).length
      await enviarAlerta('✅ <b>runAgent(manha) concluído</b>\n' + top5.length + ' apostas geradas, ' + nResultados + ' resultados processados, Instagram postado')
    }

  } catch (err) {
    console.error('Erro geral:', err.message)
    await enviarTelegram('Erro ao gerar analise de hoje. Voltamos em breve!')
    await enviarAlerta('🔴 <b>runAgent(' + turno + ') — Erro geral</b>\n' + err.message)
  }

  console.log('[' + new Date().toISOString() + '] Agente finalizado')
}

const { postarContextoJogo } = require('./postContexto')
const { postarConteudoEducativo } = require('./postEducativo')
const { postarNoticia } = require('./postNoticia')
const popularResultados = require('./popularResultados')

async function runContexto() {
  console.log('\n[' + new Date().toISOString() + '] Post de contexto iniciado')
  try {
    const jogos = await buscarJogosProximosDias()
    if (!jogos.length) {
      console.log('Nenhum jogo para post de contexto.')
      return
    }
    // Usa top jogos de alta prioridade (1-2) para maior variedade de temas
    // Rotaciona pelo dia do mês para evitar repetir sempre o mesmo confronto
    const topJogos = jogos.filter(function(j) { return j.prioridade <= 2 }).slice(0, 6)
    const pool = topJogos.length >= 2 ? topJogos : jogos.slice(0, 6)
    const idx = new Date().getDate() % pool.length
    const jogoEscolhido = pool[idx]
    console.log('Jogo de contexto escolhido (idx=' + idx + '): ' + jogoEscolhido.timeCasa + ' x ' + jogoEscolhido.timeFora)
    await postarContextoJogo(jogoEscolhido)
  } catch (err) {
    console.error('Erro no post de contexto:', err.message)
    await enviarAlerta('🔴 <b>runContexto — Erro</b>\n' + err.message)
  }
  console.log('[' + new Date().toISOString() + '] Post de contexto finalizado')
}

async function runEducativo(turno) {
  console.log('\n[' + new Date().toISOString() + '] Post educativo iniciado (' + turno + ')')
  try {
    const jogos = await buscarJogosProximosDias()
    if (!jogos.length) {
      console.log('Nenhum jogo para post educativo.')
      return
    }
    // Usa top jogos de alta prioridade (1-2) para maior variedade de temas
    // Manhã e tarde usam índices diferentes para nunca repetir o mesmo jogo no dia
    const topJogos = jogos.filter(function(j) { return j.prioridade <= 2 }).slice(0, 8)
    const pool = topJogos.length >= 3 ? topJogos : jogos.slice(0, 8)
    const base = new Date().getDate()
    const idxManha = base % pool.length
    const idxTarde = (base + Math.ceil(pool.length / 2)) % pool.length
    const jogoDestaque = turno === 'tarde' ? pool[idxTarde] : pool[idxManha]
    console.log('Jogo educativo (' + turno + ', idx=' + (turno === 'tarde' ? idxTarde : idxManha) + '): ' + jogoDestaque.timeCasa + ' x ' + jogoDestaque.timeFora)
    const h2hData = jogoDestaque ? await buscarH2H(jogoDestaque.matchId) : null
    await postarConteudoEducativo(jogos, h2hData, turno)
  } catch (err) {
    console.error('Erro no post educativo:', err.message)
    await enviarAlerta('🔴 <b>runEducativo(' + turno + ') — Erro</b>\n' + err.message)
  }
  console.log('[' + new Date().toISOString() + '] Post educativo finalizado')
}

// ─── AGENDAMENTOS (só ativa quando executado diretamente, não quando importado) ───
if (require.main === module) {
  cron.schedule('55 7 * * *',       function() { popularResultados() },   { timezone: 'America/Sao_Paulo' })
  cron.schedule('0 8 * * *',        function() { runAgent('manha') },     { timezone: 'America/Sao_Paulo' })
  cron.schedule('0 12 * * *',       function() { runContexto() },         { timezone: 'America/Sao_Paulo' })
  cron.schedule('0 13 * * *',       function() { runAgent('tarde') },     { timezone: 'America/Sao_Paulo' })
  cron.schedule('0 19 * * *',       function() { runAgent('noite') },     { timezone: 'America/Sao_Paulo' })
  cron.schedule('0 10 * * *',       function() { postarNoticia() },       { timezone: 'America/Sao_Paulo' })
  cron.schedule('0 9 * * *',        function() { runEducativo('manha') }, { timezone: 'America/Sao_Paulo' })
  cron.schedule('0 15 * * *',       function() { runEducativo('tarde') }, { timezone: 'America/Sao_Paulo' })
  cron.schedule('*/5 * * * *', function() { monitorarResultados() }, { timezone: 'America/Sao_Paulo' })

  console.log('Agente agendado: 8h, 9h, 10h, 12h, 13h, 15h e 19h (horario de Brasilia)')
  console.log('Monitor de resultados: a cada 5 minutos entre 14h e 02h')
}

module.exports = { monitorarResultados }
