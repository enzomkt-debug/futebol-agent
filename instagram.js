require('dotenv').config()
const axios = require('axios')
const fs = require('fs')

const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID

// ─── GERA TEXTO DO POST ───

function gerarPostManha(apostas, resultadoOntem) {
  const hoje = new Date().toLocaleDateString('pt-BR')
  const destaque = apostas[0]

  const linhasApostas = apostas.map(function(a, i) {
    return (i + 1) + '. ' + a.jogo + '\n' + a.mercado + ' | Odd ' + a.odd.toFixed(2)
  }).join('\n\n')

  return `⚽ ANÁLISE DO DIA — ${hoje}

📌 RESULTADO DE ONTEM
${resultadoOntem}

━━━━━━━━━━━━━━━
🔥 APOSTA DESTAQUE

${destaque.jogo}
${destaque.mercado} | Odd ${destaque.odd.toFixed(2)}

━━━━━━━━━━━━━━━
📋 APOSTAS DE HOJE

${linhasApostas}

━━━━━━━━━━━━━━━
⚠️ Aposte com responsabilidade.

🔗 Receba as análises ANTES do jogo:
Link na bio 👆

#apostas #futebol #valuebets #apostasesportivas #brasileirao #championsleague #libertadores #betbrasil #gollucrativo`
}

function gerarPostTarde(apostas) {
  const linhasApostas = apostas.map(function(a, i) {
    return (i + 1) + '. ' + a.jogo + ' (' + a.liga + ')\n' + a.mercado + ' | Odd ' + a.odd.toFixed(2)
  }).join('\n\n')

  return `🕐 ATUALIZAÇÃO DA TARDE

Novas apostas identificadas para hoje:

${linhasApostas}

━━━━━━━━━━━━━━━
Quer receber isso às 8h da manhã?
👆 Link na bio — assine o GolLucrativo

#apostas #futebol #valuebets #apostasesportivas #gollucrativo`
}

function gerarPostNoite(apostas) {
  const linhasApostas = apostas.map(function(a, i) {
    return (i + 1) + '. ' + a.jogo + ' (' + a.liga + ')\n' + a.mercado + ' | Odd ' + a.odd.toFixed(2)
  }).join('\n\n')

  return `🌙 APOSTAS DA NOITE

Jogos com valor identificado agora:

${linhasApostas}

━━━━━━━━━━━━━━━
Nossos assinantes já receberam isso às 8h.
Não fique de fora amanhã 👇
Link na bio

#apostas #futebol #valuebets #gollucrativo #apostasesportivas`
}

// ─── PUBLICA NO INSTAGRAM ───

async function publicarNoInstagram(texto, imageUrl) {
  try {
    console.log('Publicando no Instagram...')

    // Passo 1: Criar container da mídia
    const containerRes = await axios.post(
      'https://graph.instagram.com/v21.0/' + INSTAGRAM_ACCOUNT_ID + '/media',
      {
        image_url: imageUrl,
        caption: texto,
        access_token: INSTAGRAM_ACCESS_TOKEN
      }
    )

    const containerId = containerRes.data.id
    console.log('Container criado:', containerId)

    // Aguarda 3 segundos para o container processar
    await new Promise(function(resolve) { setTimeout(resolve, 3000) })

    // Passo 2: Publicar o container
    const publishRes = await axios.post(
      'https://graph.instagram.com/v21.0/' + INSTAGRAM_ACCOUNT_ID + '/media_publish',
      {
        creation_id: containerId,
        access_token: INSTAGRAM_ACCESS_TOKEN
      }
    )

    console.log('Publicado com sucesso! ID:', publishRes.data.id)
    return publishRes.data.id

  } catch (err) {
    console.error('Erro ao publicar no Instagram:', err.response?.data || err.message)
    return null
  }
}

// ─── IMAGEM PADRÃO POR TURNO ───
// Por enquanto usa imagens estáticas hospedadas no GitHub
// Depois podemos gerar dinamicamente

const IMAGENS = {
  manha: 'https://raw.githubusercontent.com/enzomkt-debug/futebol-agent/main/assets/card-manha.png',
  tarde: 'https://raw.githubusercontent.com/enzomkt-debug/futebol-agent/main/assets/card-tarde.png',
  noite: 'https://raw.githubusercontent.com/enzomkt-debug/futebol-agent/main/assets/card-noite.png'
}

// ─── FUNÇÃO PRINCIPAL ───

async function postarInstagram(apostas, resultadoOntem, turno) {
  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_ACCOUNT_ID) {
    console.log('Credenciais do Instagram nao configuradas. Pulando postagem.')
    return
  }

  if (!apostas || !apostas.length) {
    console.log('Sem apostas para postar no Instagram.')
    return
  }

  let texto = ''
  if (turno === 'manha') {
    texto = gerarPostManha(apostas, resultadoOntem)
  } else if (turno === 'tarde') {
    texto = gerarPostTarde(apostas)
  } else {
    texto = gerarPostNoite(apostas)
  }

  const imageUrl = IMAGENS[turno]
  await publicarNoInstagram(texto, imageUrl)
}

module.exports = { postarInstagram }