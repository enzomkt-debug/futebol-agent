const axios = require('axios')
require('dotenv').config()

axios.get('https://api.football-data.org/v4/competitions', {
  headers: { 'X-Auth-Token': process.env.API_FOOTBALL_KEY }
}).then(function(res) {
  res.data.competitions.forEach(function(c) {
    console.log(c.id + ' | ' + c.name + ' (' + c.area.name + ')')
  })
}).catch(function(err) {
  console.error('ERRO:', err.message)
  if (err.response) console.error(JSON.stringify(err.response.data))
})