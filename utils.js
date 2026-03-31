// ─── UTILS COMPARTILHADOS ───
// Centraliza funções usadas em múltiplos módulos

function verificarAcerto(aposta, resultado) {
  const totalGols = resultado.golsCasa + resultado.golsFora
  const ambasMarcaram = resultado.golsCasa > 0 && resultado.golsFora > 0
  if (aposta.mercado === 'Mais de 2.5 gols') return totalGols > 2
  if (aposta.mercado === 'Menos de 2.5 gols') return totalGols < 3
  if (aposta.mercado === 'Ambas marcam: SIM') return ambasMarcaram
  return false
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

    let sha = null
    try {
      const getRes = await axios.get(
        'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
        { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
      )
      sha = getRes.data.sha
    } catch (e) {}

    // [skip ci] impede que o Railway faça redeploy ao detectar este commit
    const body = { message: 'Atualiza ' + nomeArquivo + ' [skip ci]', content: base64 }
    if (sha) body.sha = sha

    await axios.put(
      'https://api.github.com/repos/' + GITHUB_REPO + '/contents/assets/' + nomeArquivo,
      body,
      { headers: { Authorization: 'token ' + GITHUB_TOKEN } }
    )

    const urlPublica = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/main/assets/' + nomeArquivo + '?t=' + Date.now()
    console.log('Imagem subida para GitHub:', urlPublica)
    return urlPublica

  } catch (err) {
    console.error('Erro ao subir imagem para GitHub (' + nomeArquivo + '):', err.message)
    return null
  }
}

module.exports = { verificarAcerto, subirImagemGithub }
