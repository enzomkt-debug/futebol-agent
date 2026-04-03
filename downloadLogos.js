require('dotenv').config()
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const LOGOS = require('./logosMapa')

const DIR = path.join(__dirname, 'assets', 'logos')
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true })

function nomeArquivo(chave) {
  return chave
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    + '.png'
}

async function baixar(chave, url) {
  const url64 = url
  const destino = path.join(DIR, nomeArquivo(chave))
  try {
    const res = await axios.get(url64, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.football-logos.cc/',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    })
    fs.writeFileSync(destino, res.data)
    return true
  } catch (e) {
    console.error('  FALHOU ' + chave + ': ' + e.message)
    return false
  }
}

;(async () => {
  const entradas = Object.entries(LOGOS)
  console.log('Baixando ' + entradas.length + ' logos em assets/logos/ ...\n')

  let ok = 0
  let falhas = 0

  for (const [chave, url] of entradas) {
    process.stdout.write('  ' + chave + ' ... ')
    const sucesso = await baixar(chave, url)
    if (sucesso) {
      console.log('OK → ' + nomeArquivo(chave))
      ok++
    } else {
      falhas++
    }
  }

  console.log('\n─────────────────────────────')
  console.log('Baixados com sucesso: ' + ok + '/' + entradas.length)
  if (falhas) console.log('Falhas:              ' + falhas)
  console.log('─────────────────────────────')
})()
