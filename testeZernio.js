require('dotenv').config()
const axios = require('axios')

axios.post('https://zernio.com/api/v1/posts', {
  platforms: [{ platform: 'instagram', accountId: process.env.ZERNIO_ACCOUNT_ID }],
  content: 'Teste de publicacao automatica — GolLucrativo ⚽\n\n#gollucrativo #futebol #apostas',
  mediaItems: [{ type: 'image', url: 'https://raw.githubusercontent.com/enzomkt-debug/futebol-agent/main/assets/card-resultado.png' }],
  publishNow: true
}, {
  headers: {
    'Authorization': 'Bearer ' + process.env.ZERNIO_API_KEY,
    'Content-Type': 'application/json'
  }
}).then(function(res) {
  console.log('Status:', res.data.post?.status)
  console.log('ID:', res.data.post?._id)
}).catch(function(err) {
  console.error('Erro:', err.response?.data || err.message)
})