require('dotenv').config()
const axios = require('axios')
const { gerarESubirImagem } = require('./gerarImagem')

const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY
const ZERNIO_ACCOUNT_ID = process.env.ZERNIO_ACCOUNT_ID

function gerarCaption(apostasOntem, resultados) {
  const hoje = new Date().toLocaleDateString('pt-BR')

  if (!apostasOntem || !apostasOntem.length) {
    return `⚽ RESULTADO DE ONTEM — ${hoje}

Primeiro dia de operacao! Acompanhe nossas analises.

━━━━━━━━━━━━━━━
🔗 Receba as analises ANTES do jogo:
Link na bio 👆

#apostas #futebol #valuebets #brasileirao #gollucrativo`
  }

  let linhasResultados = ''
  let acertos = 0
  let total = 0

  apostasOntem.forEach(function(a, i) {
    const res = resultados[i]
    if (!res) return
    total++
    const totalGols = res.golsCasa + res.golsFora
    const ambasMarcaram = res.golsCasa > 0 && res.golsFora > 0
    let acertou = false
    if (a.mercado === 'Mais de 2.5 gols') acertou = totalGols > 2
    else if (a.mercado === 'Menos de 2.5 gols') acertou = totalGols < 3
    else if (a.mercado === 'Ambas marcam: SIM') acertou = ambasMarcaram
    if (acertou) acertos++
    const placar = res.golsCasa + ' x ' + res.golsFora
    const status = acertou ? '✅ VERDE' : '❌ VERMELHO'
    linhasResultados += (i + 1) + '. ' + a.jogo + '\n'
    linhasResultados += '   ' + a.mercado + ' | ' + placar + ' ' + status + '\n\n'
  })

  const taxa = total > 0 ? Math.round((acertos / total) * 100) : 0
  const emoji = taxa >= 60 ? '🔥' : taxa >= 40 ? '📊' : '📉'

  return `${emoji} RESULTADO DE ONTEM — ${hoje}

${linhasResultados}━━━━━━━━━━━━━━━
📊 Aproveitamento: ${acertos}/${total} certas (${taxa}%)

Quer receber essas analises ANTES dos jogos?
Nossos assinantes ja sabiam desde as 8h 👇
Link na bio

#apostas #futebol #valuebets #apostasesportivas #brasileirao #championsleague #gollucrativo #tipster #resultados #greens`
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

    console.log('Publicado com sucesso via Zernio! ID:', res.data.id)
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