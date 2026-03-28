require('dotenv').config()
const axios = require('axios')
const { gerarESubirImagem } = require('./gerarImagem')

const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID

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
Nossos assinantes ja sabiam desde as 8h da manha 👇
Link na bio

#apostas #futebol #valuebets #apostasesportivas #brasileirao #championsleague #gollucrativo #tipster #resultados #greens`
}

async function publicarNoInstagram(caption, imageUrl) {
  try {
    console.log('Publicando resultado no Instagram...')

    const containerRes = await axios.post(
      'https://graph.instagram.com/v21.0/' + INSTAGRAM_ACCOUNT_ID + '/media',
      {
        image_url: imageUrl,
        caption: caption,
        access_token: INSTAGRAM_ACCESS_TOKEN
      }
    )

    const containerId = containerRes.data.id
    console.log('Container criado:', containerId)

    await new Promise(function(resolve) { setTimeout(resolve, 5000) })

    const publishRes = await axios.post(
      'https://graph.instagram.com/v21.0/' + INSTAGRAM_ACCOUNT_ID + '/media_publish',
      {
        creation_id: containerId,
        access_token: INSTAGRAM_ACCESS_TOKEN
      }
    )

    console.log('Publicado no Instagram! ID:', publishRes.data.id)
    return true

  } catch (err) {
    console.error('Erro ao publicar no Instagram:', err.response?.data || err.message)
    return false
  }
}

async function postarInstagram(apostasOntem, resultados, turno) {
  // Instagram só posta na manha — mostra resultado de ontem
  if (turno !== 'manha') {
    console.log('Instagram: so posta de manha com resultado de ontem.')
    return
  }

  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_ACCOUNT_ID) {
    console.log('Credenciais do Instagram nao configuradas.')
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
    await publicarNoInstagram(caption, imageUrl)

  } catch (err) {
    console.error('Erro no modulo Instagram:', err.message)
  }
}

module.exports = { postarInstagram }
