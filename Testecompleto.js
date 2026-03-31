require('dotenv').config()
const { postarInstagram } = require('./instagram')
const { postarContextoJogo } = require('./postContexto')
const { postarConteudoEducativo } = require('./postEducativo')

// ─── DADOS DE TESTE ───

const apostasTeste = [{
  matchId: 554820,
  jogo: 'EC Bahia x CA Paranaense',
  liga: 'Campeonato Brasileiro Série A',
  mercado: 'Mais de 2.5 gols',
  odd: 1.80,
  edge: 0.094,
  prioridade: 1,
  dataJogo: '2026-03-30'
}]

const resultadosTeste = [{
  golsCasa: 3,
  golsFora: 1
}]

const jogoContextoTeste = {
  matchId: 554827,
  timeCasa: 'SC Internacional',
  timeFora: 'São Paulo FC',
  liga: 'Campeonato Brasileiro Série A',
  dataJogo: '2026-04-01',
  prioridade: 1
}

const jogosEducativoTeste = [
  {
    matchId: 554827,
    timeCasa: 'SC Internacional',
    timeFora: 'São Paulo FC',
    liga: 'Campeonato Brasileiro Série A',
    dataJogo: '2026-04-01',
    prioridade: 1
  },
  {
    matchId: 554820,
    timeCasa: 'EC Bahia',
    timeFora: 'CA Paranaense',
    liga: 'Campeonato Brasileiro Série A',
    dataJogo: '2026-04-02',
    prioridade: 1
  }
]

// ─── EXECUÇÃO ───

async function main() {
  console.log('\n========================================')
  console.log('TESTE COMPLETO — GOL MATCH BR')
  await postarInstagram(apostasTeste, resultadosTeste, 'manha')

  // 1. Post de resultado (verde — 3x1)
  console.log('▶ [1/3] Testando post de RESULTADO (verde)...')
  await postarInstagram(apostasTeste, resultadosTeste, 'manha')
  console.log('✅ Post de resultado concluído\n')

  // Pausa entre posts para não sobrecarregar APIs
  await new Promise(r => setTimeout(r, 5000))

  // 2. Post de contexto
  console.log('▶ [2/3] Testando post de CONTEXTO...')
  await postarContextoJogo(jogoContextoTeste)
  console.log('✅ Post de contexto concluído\n')

  await new Promise(r => setTimeout(r, 5000))

  // 3. Post educativo
  console.log('▶ [3/3] Testando post EDUCATIVO...')
  await postarConteudoEducativo(jogosEducativoTeste)
  console.log('✅ Post educativo concluído\n')

  console.log('========================================')
  console.log('TESTE COMPLETO FINALIZADO')
  console.log('Verifique o Instagram @golmatchbr')
  console.log('========================================\n')
}

main().catch(err => {
  console.error('Erro no teste:', err.message)
  process.exit(1)
})