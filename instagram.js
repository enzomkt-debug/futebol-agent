require('dotenv').config()
const axios = require('axios')
const { gerarESubirImagem } = require('./gerarImagem')

const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY
const ZERNIO_ACCOUNT_ID = process.env.ZERNIO_ACCOUNT_ID

function verificarAcerto(aposta, resultado) {
  const totalGols = resultado.golsCasa + resultado.golsFora
  const ambasMarcaram = resultado.golsCasa > 0 && resultado.golsFora > 0
  if (aposta.mercado === 'Mais de 2.5 gols') return totalGols > 2
  if (aposta.mercado === 'Menos de 2.5 gols') return totalGols < 3
  if (aposta.mercado === 'Ambas marcam: SIM') return ambasMarcaram
  return false
}

function gerarCaption(apostasOntem, resultados) {
  const hoje = new Date().toLocaleDateString('pt-BR')

  if (!apostasOntem || !apostasOntem.length || !resultados || !resultados.length) {
    return `⚽ GolLucrativo — ${hoje}

Primeiro dia de operacao! A partir de amanha voce vai ver por que dados batem feeling.

Brasileirao, Champions League, Premier League, Libertadores e mais 9 ligas analisadas automaticamente todo dia.

Todo dia as 8h no seu Telegram. Link na bio para assinar.

#apostas #futebol #valuebets #brasileirao #championsleague #gollucrativo #apostasesportivas #tipster`
  }

  let acertos = 0
  let total = 0
  let destaqueAcertou = false

  apostasOntem.forEach(function(a, i) {
    const res = resultados[i]
    if (!res) return
    total++
    if (verificarAcerto(a, res)) acertos++
    if (i === 0) destaqueAcertou = verificarAcerto(a, res)
  })

  const taxa = total > 0 ? Math.round((acertos / total) * 100) : 0
  const destaqueRes = resultados[0]
  const placar = destaqueRes ? destaqueRes.golsCasa + ' x ' + destaqueRes.golsFora : ''
  const retorno = Math.round(100 * apostasOntem[0].odd)

  if (destaqueAcertou) {
    return `✅ VERDE — ${hoje}

${apostasOntem[0].jogo} · ${placar}
${apostasOntem[0].mercado} · Odd ${apostasOntem[0].odd.toFixed(2)}

R$ 100 apostados → R$ ${retorno} recebidos.

Nossos assinantes receberam essa analise as 8h da manha, com tempo de sobra para apostar.

Ultimos 30 dias: ${acertos}/${total} certas · Taxa: ${taxa}%

Seus concorrentes ja assinaram. Voce ainda vai ficar de fora?
Link na bio.

#green #verde #apostasesportivas #futebol #valuebets #brasileirao #championsleague #libertadores #tipster #gollucrativo #apostasinteligentes #resultados #greens #betbrasil`
  } else {
    return `📊 VERMELHO — e tudo bem.

${apostasOntem[0].jogo} · ${placar}
${apostasOntem[0].mercado} · Odd ${apostasOntem[0].odd.toFixed(2)}

Nosso modelo estimou ${Math.round((1/apostasOntem[0].odd + apostasOntem[0].edge)*100)}% de chance. Nao acertou dessa vez.

Isso faz parte. Value bet nao e sobre acertar sempre — e sobre ter vantagem matematica no longo prazo.

Mesmo assim, ultimos 30 dias: ${acertos}/${total} certas · ${taxa}% de aproveitamento.

Apostador amador entra em panico no vermelho.
Apostador profissional sabe que variancia existe e continua com o metodo.

Link na bio para entender como funciona.

#apostasesportivas #futebol #valuebets #metodo #brasileirao #gollucrativo #tipster #apostasinteligentes #bankrollmanagement #betbrasil`
  }
}

async function publicarViaZernio(caption, imageUrl) {
  try {
    console.log('Publicando no Instagram via Zernio...')

    const res = await axios.post('https://zernio.com/api/v1/posts', {
      platforms: [{ platform: 'instagram', accountId: ZERNIO_ACCOUNT_ID }],
      content: caption,
      mediaItems: [{ type: 'image', url: imageUrl }]
    }, {
      headers: {
        'Authorization': 'Bearer ' + ZERNIO_API_KEY,
        'Content-Type': 'application/json'
      }
    })

    console.log('Publicado com sucesso via Zernio!')
    return true

  } catch (err) {
    console.error('Erro ao publicar via Zernio:', err.response?.data || err.message)
    return false
  }
}

async function postarInstagram(apostasOntem, resultados, turno) {
  if (turno !== 'manha') return

  if (!ZERNIO_API_KEY || !ZERNIO_ACCOUNT_ID) {
    console.log('Credenciais do Zernio nao configuradas.')
    return
  }

  try {
    console.log('Gerando imagem de resultado para Instagram...')
    const imageUrl = await gerarESubirImagem(apostasOntem || [], 'resultado', resultados || [])

    if (!imageUrl) {
      console.log('Nao foi possivel gerar URL publica da imagem.')
      return
    }

    const caption = gerarCaption(apostasOntem, resultados || [])
    await publicarViaZernio(caption, imageUrl)

  } catch (err) {
    console.error('Erro no modulo Instagram:', err.message)
  }
}

module.exports = { postarInstagram }