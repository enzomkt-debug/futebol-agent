require('dotenv').config()
const { gerarESubirImagem, gerarESubirStory } = require('./gerarImagem')

const apostas = [{
  jogo: 'Athletico PR x Botafogo',
  liga: 'Brasileirao Serie A',
  mercado: 'Mais de 2.5 gols',
  odd: 2.1,
  edge: 0.08
}]

const resultados = [{
  golsCasa: 4,
  golsFora: 1
}]

async function main() {
  console.log('Gerando imagem feed...')
  await gerarESubirImagem(apostas, 'resultado', resultados)

  console.log('Gerando story...')
  await gerarESubirStory(apostas, resultados)

  console.log('Pronto! Verifique a pasta assets/')
}

main()