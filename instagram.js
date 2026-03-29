require('dotenv').config()
const axios = require('axios')
const { gerarESubirImagem, gerarESubirStory } = require('./gerarImagem')

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
    return `⚽ Gol Match BR — ${hoje}

Primeiro dia de operacao! A partir de amanha voce acompanha os resultados das nossas analises diarias.

Brasileirao, Champions League, Premier League, Libertadores e mais 9 ligas analisadas automaticamente por inteligencia artificial todo dia.

Analise completa todo dia as 8h no Telegram. Link na bio para acessar.

#futebol #analiseesportiva #inteligenciaartificial #brasileirao #championsleague #golmatchbr #dadosesportivos #futebolanalitico #estatisticas`
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
  const probPct = Math.round((1/apostasOntem[0].odd + apostasOntem[0].edge)*100)

  if (destaqueAcertou) {
    return `✅ ACERTOU — ${hoje}

${apostasOntem[0].jogo} · ${placar}
Mercado: ${apostasOntem[0].mercado}

Nossa analise apontou ${probPct}% de probabilidade estatistica. Confirmado.

Quem acompanha o grupo recebeu essa analise as 8h da manha, antes do jogo comecar.

Ultimos 30 dias: ${acertos}/${total} analises corretas · ${taxa}% de aproveitamento.

Quer receber antes? Link na bio.

#futebol #analiseesportiva #inteligenciaartificial #brasileirao #championsleague #libertadores #estatisticas #golmatchbr #dadosesportivos #futebolanalitico`
  } else {
    return `📊 NAO CONFIRMOU — faz parte da analise estatistica.

${apostasOntem[0].jogo} · ${placar}
Mercado: ${apostasOntem[0].mercado}

Modelo estimou ${probPct}% de probabilidade. Dessa vez nao se confirmou.

Analise de dados nao e certeza — e identificar vantagem matematica no longo prazo. A consistencia esta nos numeros acumulados.

Ultimos 30 dias: ${acertos}/${total} corretas · ${taxa}% de aproveitamento.

Acompanha o historico completo. Link na bio.

#futebol #analiseesportiva #inteligenciaartificial #brasileirao #estatisticas #golmatchbr #dadosesportivos #futebolanalitico #metodo`
  }
}

async function publicarViaZernio(caption, imageUrl) {
  try {
    console.log('Publicando no Instagram via Zernio...')

    const res = await axios.post('https://zernio.com/api/v1/posts', {
      platforms: [{ platform: 'instagram', accountId: ZERNIO_ACCOUNT_ID }],
      content: caption,
      mediaItems: [{ type: 'image', url: imageUrl }],
      publishNow: true
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


async function publicarStoryViaZernio(imageUrl) {
  try {
    console.log('Publicando Story no Instagram via Zernio...')

    await axios.post('https://zernio.com/api/v1/posts', {
      platforms: [{
        platform: 'instagram',
        accountId: ZERNIO_ACCOUNT_ID,
        platformSpecificData: { contentType: 'story' }
      }],
      content: '',
      mediaItems: [{ type: 'image', url: imageUrl }],
      publishNow: true
    }, {
      headers: {
        'Authorization': 'Bearer ' + ZERNIO_API_KEY,
        'Content-Type': 'application/json'
      }
    })

    console.log('Story publicado com sucesso!')
    return true

  } catch (err) {
    console.error('Erro ao publicar story:', err.response?.data || err.message)
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

    // Publica no feed
    const caption = gerarCaption(apostasOntem, resultados || [])
    await publicarViaZernio(caption, imageUrl)

    // Gera e publica story 9:16
    console.log('Gerando story de resultado...')
    const storyUrl = await gerarESubirStory(apostasOntem || [], resultados || [])
    if (storyUrl) {
      await publicarStoryViaZernio(storyUrl)
    }

  } catch (err) {
    console.error('Erro no modulo Instagram:', err.message)
  }
}

module.exports = { postarInstagram }