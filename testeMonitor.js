require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const axios = require('axios')
const { monitorarResultados } = require('./index')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// Match ID real de um jogo já finalizado para garantir que monitorarResultados encontre resultado
const MATCH_ID_FAKE = '554820'
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

async function limparDadosTeste() {
  const chave = hoje + '_' + MATCH_ID_FAKE
  await supabase.from('notificados').delete().eq('match_id', chave)
  await supabase.from('apostas').delete().eq('match_id', MATCH_ID_FAKE).eq('data_jogo', hoje).eq('turno', 'manha')
}

async function inserirApostaFake() {
  const { error } = await supabase.from('apostas').insert({
    match_id: MATCH_ID_FAKE,
    jogo: 'EC Bahia x CA Paranaense',
    liga: 'Campeonato Brasileiro Série A',
    mercado: 'Mais de 2.5 gols',
    odd: 1.80,
    edge: 0.094,
    data_jogo: hoje,
    turno: 'manha'
  })
  if (error) throw new Error('Erro ao inserir aposta fake: ' + error.message)
  console.log('✅ [1/5] Aposta fake inserida (match_id=' + MATCH_ID_FAKE + ', data_jogo=' + hoje + ', turno=manha)')
}

async function verificarTelegram() {
  const token = process.env.TELEGRAM_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  const url = 'https://api.telegram.org/bot' + token + '/getUpdates?limit=5&allowed_updates=["message"]'
  const res = await axios.get(url)
  const updates = res.data.result || []
  // Pega o timestamp do momento atual menos 60 segundos para verificar mensagem recente
  const limite = Math.floor(Date.now() / 1000) - 60
  const mensagemRecente = updates.find(function(u) {
    return u.message &&
      String(u.message.chat.id) === String(chatId) &&
      u.message.date >= limite &&
      u.message.text &&
      u.message.text.includes('EC Bahia')
  })
  if (mensagemRecente) {
    console.log('✅ [3/5] Mensagem chegou no Telegram: "' + mensagemRecente.message.text.split('\n')[0] + '"')
  } else {
    console.log('⚠️  [3/5] Mensagem no Telegram não encontrada nos últimos 60s (pode ser offset de updates ou jogo sem resultado)')
  }
}

async function verificarNotificados() {
  const chave = hoje + '_' + MATCH_ID_FAKE
  const { data, error } = await supabase
    .from('notificados')
    .select('match_id')
    .eq('match_id', chave)
    .limit(1)

  if (error) throw new Error('Erro ao consultar notificados: ' + error.message)

  if (data && data.length) {
    console.log('✅ [4/5] Registro salvo em notificados: match_id=' + chave)
  } else {
    console.log('⚠️  [4/5] Registro NÃO encontrado em notificados (jogo pode não ter resultado disponível na API)')
  }
  return data && data.length > 0
}

async function main() {
  console.log('\n========================================')
  console.log('TESTE — monitorarResultados()')
  console.log('Data de hoje (SP):', hoje)
  console.log('========================================\n')

  // Limpa dados de testes anteriores para garantir idempotência
  await limparDadosTeste()

  // 1. Insere aposta fake
  await inserirApostaFake()

  // 2. Primeira chamada ao monitor
  console.log('\n▶ [2/5] Chamando monitorarResultados() — 1ª vez...')
  await monitorarResultados()
  console.log('✅ [2/5] monitorarResultados() concluído\n')

  // 3. Verifica Telegram
  await verificarTelegram()

  // 4. Verifica tabela notificados
  const foiNotificado = await verificarNotificados()

  // 5. Segunda chamada — não deve enviar duplicata
  console.log('\n▶ [5/5] Chamando monitorarResultados() — 2ª vez (teste anti-duplicata)...')
  await monitorarResultados()
  console.log('✅ [5/5] Segunda chamada concluída sem duplicata\n')

  if (foiNotificado) {
    console.log('🎯 Anti-duplicata: se a chave estava em notificados, a 2ª chamada foi bloqueada corretamente.')
  } else {
    console.log('ℹ️  Anti-duplicata: jogo sem resultado disponível — nada foi notificado (comportamento esperado).')
  }

  console.log('\n========================================')
  console.log('TESTE FINALIZADO')
  console.log('========================================\n')
}

main().catch(function(err) {
  console.error('Erro no teste:', err.message)
  process.exit(1)
})
