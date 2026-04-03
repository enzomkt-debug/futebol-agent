process.env.TEST_MODE = 'true'
require('dotenv').config()

const { gerarESubirImagem, gerarESubirStory } = require('./gerarImagem')
const { postarConteudoEducativo } = require('./postEducativo')
const { postarNoticia } = require('./postNoticia')
const { postarContextoJogo } = require('./postContexto')

// ─── DADOS FICTÍCIOS ──────────────────────────────────────────────────────────

const apostas = [{
  jogo: 'Flamengo x Palmeiras',
  mercado: 'Mais de 2.5 gols',
  odd: 1.85,
  dataJogo: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}]

const resultados = [{
  golsCasa: 3,
  golsFora: 1
}]

const jogos = [{
  timeCasa: 'Flamengo',
  timeFora: 'Palmeiras',
  liga:     'Brasileirao Serie A',
  dataJogo: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}]

const jogoDestaque = jogos[0]

// ─── RUNNER ───────────────────────────────────────────────────────────────────

;(async () => {
  console.log('\n══════════════════════════════════════════')
  console.log(' TESTE COMPLETO — TEST_MODE ativo')
  console.log('══════════════════════════════════════════\n')

  // 1. Card de resultado
  console.log('─── [1/5] Card de resultado (gerarImagem) ───')
  try {
    await gerarESubirImagem(apostas, 'manha', resultados)
    await gerarESubirStory(apostas, resultados)
    console.log('✓ Card de resultado gerado\n')
  } catch (e) { console.error('ERRO card resultado:', e.message, '\n') }

  // 2. Post educativo manhã
  console.log('─── [2/5] Post educativo manhã (postEducativo) ───')
  try {
    await postarConteudoEducativo(jogos, null, 'manha')
    console.log('✓ Post educativo manhã gerado\n')
  } catch (e) { console.error('ERRO educativo manhã:', e.message, '\n') }

  // 3. Post de notícia
  console.log('─── [3/5] Post de notícia (postNoticia) ───')
  try {
    await postarNoticia()
    console.log('✓ Post de notícia gerado\n')
  } catch (e) { console.error('ERRO notícia:', e.message, '\n') }

  // 4. Post de contexto
  console.log('─── [4/5] Post de contexto (postContexto) ───')
  try {
    await postarContextoJogo(jogoDestaque, 'manha')
    console.log('✓ Post de contexto gerado\n')
  } catch (e) { console.error('ERRO contexto:', e.message, '\n') }

  // 5. Post educativo tarde
  console.log('─── [5/5] Post educativo tarde (postEducativo) ───')
  try {
    await postarConteudoEducativo(jogos, null, 'tarde')
    console.log('✓ Post educativo tarde gerado\n')
  } catch (e) { console.error('ERRO educativo tarde:', e.message, '\n') }

  console.log('══════════════════════════════════════════')
  console.log(' TESTE COMPLETO FINALIZADO')
  console.log('══════════════════════════════════════════\n')
})()
