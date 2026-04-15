// ─── UTILS COMPARTILHADOS ───
// Centraliza funções usadas em múltiplos módulos

function verificarAcerto(aposta, resultado) {
  if (!resultado || resultado.golsCasa == null || resultado.golsFora == null) return null
  const totalGols = resultado.golsCasa + resultado.golsFora
  const ambasMarcaram = resultado.golsCasa > 0 && resultado.golsFora > 0
  if (aposta.mercado === 'Mais de 2.5 gols') return totalGols > 2
  if (aposta.mercado === 'Menos de 2.5 gols') return totalGols < 3
  if (aposta.mercado === 'Ambas marcam: SIM') return ambasMarcaram
  if (aposta.mercado === 'Ambas marcam: NAO') return !ambasMarcaram
  console.warn('[verificarAcerto] Mercado desconhecido:', aposta.mercado)
  return null
}

// Sobe um arquivo PNG para o GitHub com [skip ci] para não triggar redeploy no Railway
async function subirImagemGithub(axios, caminhoLocal, nomeArquivo) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN
  const GITHUB_REPO = process.env.GITHUB_REPO
  const fs = require('fs')

  if (!GITHUB_TOKEN || !GITHUB_REPO) return null

  try {
    const conteudo = fs.readFileSync(caminhoLocal)
    const base64 = conteudo.toString('base64')

    const apiUrl = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo
    const headers = { Authorization: 'token ' + GITHUB_TOKEN }

    const getSha = async () => {
      try {
        const getRes = await axios.get(apiUrl, { headers })
        return getRes.data.sha
      } catch (e) {
        if (e.response && e.response.status === 404) return null
        throw e
      }
    }

    let sha = await getSha()

    // [skip ci] impede que o Railway faça redeploy ao detectar este commit
    const body = { message: 'Atualiza ' + nomeArquivo + ' [skip ci]', content: base64 }
    if (sha) body.sha = sha

    try {
      await axios.put(apiUrl, body, { headers })
    } catch (e) {
      // 409 = conflito: arquivo existe mas SHA estava desatualizado; busca SHA fresh e tenta de novo
      if (e.response && e.response.status === 409) {
        sha = await getSha()
        if (sha) body.sha = sha
        await axios.put(apiUrl, body, { headers })
      } else {
        throw e
      }
    }

    const urlPublica = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/main/assets/' + nomeArquivo + '?t=' + Date.now()
    console.log('Imagem subida para GitHub:', urlPublica)
    // Aguarda propagação do CDN do GitHub antes de retornar a URL
    await new Promise(r => setTimeout(r, 5000))
    return urlPublica

  } catch (err) {
    console.error('Erro ao subir imagem para GitHub (' + nomeArquivo + '):', err.message)
    return null
  }
}

module.exports = { verificarAcerto, subirImagemGithub }
