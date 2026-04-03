if (!process.env.TEST_MODE && process.env.RAILWAY_ENVIRONMENT) {
  console.log('Arquivo de teste — não executar em produção')
  process.exit(0)
}
process.env.TEST_MODE = 'true'
require('dotenv').config()
const { gerarCardNoticia, gerarCardNoticiaStory } = require('./postNoticia')

const noticia = {
  titulo: 'Neymar detona árbitro por amarelo: "Quer ser protagonista"',
  desc: 'O atacante do Santos se irritou com a marcação no duelo contra o Flamengo e desabafou nas redes sociais após o jogo.',
  fonte: 'IG Esporte',
  link: 'https://esporte.ig.com.br/futebol/2026-04-02/neymar-detona-arbitro-amarelo-quer-ser-protagonista.html'
}

const imgUrl = 'https://i0.statig.com.br/bancodeimagens/cm/43/97/cm4397z7wixh18bmnhov988nm.jpg'

;(async () => {
  console.log('Gerando card feed...')
  const feed = await gerarCardNoticia(noticia, imgUrl)
  console.log('Feed gerado:', feed)

  console.log('Gerando card story...')
  const story = await gerarCardNoticiaStory(noticia, imgUrl)
  console.log('Story gerado:', story)
})()
