if (!process.env.TEST_MODE && process.env.RAILWAY_ENVIRONMENT) {
  console.log('Arquivo de teste — não executar em produção')
  process.exit(0)
}
const axios = require('axios')
const { createCanvas, loadImage } = require('canvas')
const fs = require('fs')
const path = require('path')

const assetsDir = path.join(__dirname, 'assets')
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir)

const BASE_SITE = 'https://football-logos.cc'

// ─── TIMES A MAPEAR ───────────────────────────────────────────────────────────

const SERIE_A = [
  { nome: 'Flamengo',             pagina: '/brazil/flamengo/' },
  { nome: 'Palmeiras',            pagina: '/brazil/palmeiras/' },
  { nome: 'Corinthians',          pagina: '/brazil/corinthians/' },
  { nome: 'Atletico Mineiro',     pagina: '/brazil/atletico-mineiro/' },
  { nome: 'Fluminense',           pagina: '/brazil/fluminense/' },
  { nome: 'Botafogo',             pagina: '/brazil/botafogo/' },
  { nome: 'Internacional',        pagina: '/brazil/internacional/' },
  { nome: 'Sao Paulo',            pagina: '/brazil/sao-paulo/' },
  { nome: 'Gremio',               pagina: '/brazil/gremio/' },
  { nome: 'Vasco da Gama',        pagina: '/brazil/vasco-da-gama/' },
  { nome: 'Bahia',                pagina: '/brazil/bahia/' },
  { nome: 'Fortaleza',            pagina: '/brazil/fortaleza/' },
  { nome: 'Athletico Paranaense', pagina: '/brazil/athletico-paranaense/' },
  { nome: 'Cruzeiro',             pagina: '/brazil/cruzeiro/' },
  { nome: 'Vitoria',              pagina: '/brazil/vitoria/' },
  { nome: 'Juventude',            pagina: '/brazil/juventude/' },
  { nome: 'RB Bragantino',        pagina: '/brazil/rb-bragantino/' },
  { nome: 'Mirassol',             pagina: '/brazil/mirassol/' },
  { nome: 'Ceara',                pagina: '/brazil/ceara/' },
  { nome: 'Sport Recife',         pagina: '/brazil/sport-recife/' },
]

const SERIE_B = [
  { nome: 'America Mineiro',      pagina: '/brazil/america-mineiro/' },
  { nome: 'Goias',                pagina: '/brazil/goias/' },
  { nome: 'Cuiaba',               pagina: '/brazil/cuiaba/' },
  { nome: 'Atletico Goianiense',  pagina: '/brazil/atletico-goianiense/' },
  { nome: 'Criciuma',             pagina: '/brazil/criciuma/' },
  { nome: 'Coritiba',             pagina: '/brazil/coritiba/' },
  { nome: 'Ponte Preta',          pagina: '/brazil/ponte-preta/' },
  { nome: 'Botafogo SP',          pagina: '/brazil/botafogo-sp/' },
  { nome: 'Operario Ferroviario', pagina: '/brazil/operario-ferroviario/' },
  { nome: 'Paysandu',             pagina: '/brazil/paysandu/' },
  { nome: 'CRB',                  pagina: '/brazil/crb/' },
  { nome: 'Avai',                 pagina: '/brazil/avai/' },
  { nome: 'Amazonas',             pagina: '/brazil/amazonas/' },
  { nome: 'Vila Nova',            pagina: '/brazil/vila-nova/' },
  { nome: 'Novorizontino',        pagina: '/brazil/novorizontino/' },
  { nome: 'Chapecoense',          pagina: '/brazil/chapecoense/' },
  { nome: 'Londrina',             pagina: '/brazil/londrina/' },
  { nome: 'Nautico',              pagina: '/brazil/nautico/' },
  { nome: 'Guarani',              pagina: '/brazil/guarani/' },
  { nome: 'Sao Bernardo',         pagina: '/brazil/sao-bernardo/' },
  { nome: 'Santos',               pagina: '/brazil/santos/' },
  { nome: 'Remo',                 pagina: '/brazil/clube-do-remo/' },
]

const PREMIER_LEAGUE = [
  { nome: 'Arsenal',              pagina: '/england/arsenal/' },
  { nome: 'Aston Villa',          pagina: '/england/aston-villa/' },
  { nome: 'Bournemouth',          pagina: '/england/bournemouth/' },
  { nome: 'Brentford',            pagina: '/england/brentford/' },
  { nome: 'Brighton',             pagina: '/england/brighton/' },
  { nome: 'Chelsea',              pagina: '/england/chelsea/' },
  { nome: 'Crystal Palace',       pagina: '/england/crystal-palace/' },
  { nome: 'Everton',              pagina: '/england/everton/' },
  { nome: 'Fulham',               pagina: '/england/fulham/' },
  { nome: 'Ipswich',              pagina: '/england/ipswich/' },
  { nome: 'Leicester City',       pagina: '/england/leicester/' },
  { nome: 'Liverpool',            pagina: '/england/liverpool/' },
  { nome: 'Manchester City',      pagina: '/england/manchester-city/' },
  { nome: 'Manchester United',    pagina: '/england/manchester-united/' },
  { nome: 'Newcastle',            pagina: '/england/newcastle/' },
  { nome: 'Nottingham Forest',    pagina: '/england/nottingham-forest/' },
  { nome: 'Southampton',          pagina: '/england/southampton/' },
  { nome: 'Tottenham',            pagina: '/england/tottenham/' },
  { nome: 'West Ham',             pagina: '/england/west-ham/' },
  { nome: 'Wolves',               pagina: '/england/wolves/' },
]

const CHAMPIONSHIP = [
  { nome: 'Birmingham City',      pagina: '/england/birmingham/' },
  { nome: 'Blackburn Rovers',     pagina: '/england/blackburn-rovers/' },
  { nome: 'Bristol City',         pagina: '/england/bristol-city/' },
  { nome: 'Burnley',              pagina: '/england/burnley/' },
  { nome: 'Charlton Athletic',    pagina: '/england/charlton/' },
  { nome: 'Coventry City',        pagina: '/england/coventry-city/' },
  { nome: 'Derby County',         pagina: '/england/derby-county/' },
  { nome: 'Hull City',            pagina: '/england/hull-city/' },
  { nome: 'Leeds United',         pagina: '/england/leeds-united/' },
  { nome: 'Middlesbrough',        pagina: '/england/middlesbrough/' },
  { nome: 'Millwall',             pagina: '/england/millwall/' },
  { nome: 'Norwich City',         pagina: '/england/norwich-city/' },
  { nome: 'Oxford United',        pagina: '/england/oxford-united/' },
  { nome: 'Portsmouth',           pagina: '/england/portsmouth/' },
  { nome: 'Preston North End',    pagina: '/england/preston-north-end/' },
  { nome: 'QPR',                  pagina: '/england/queens-park-rangers/' },
  { nome: 'Sheffield United',     pagina: '/england/sheffield-united/' },
  { nome: 'Sheffield Wednesday',  pagina: '/england/sheffield-wednesday/' },
  { nome: 'Stoke City',           pagina: '/england/stoke-city/' },
  { nome: 'Sunderland',           pagina: '/england/sunderland/' },
  { nome: 'Swansea City',         pagina: '/england/swansea-city/' },
  { nome: 'Watford',              pagina: '/england/watford/' },
  { nome: 'West Brom',            pagina: '/england/west-bromwich-albion/' },
  { nome: 'Wrexham',              pagina: '/england/wrexham/' },
]

const LA_LIGA = [
  { nome: 'Real Madrid',          pagina: '/spain/real-madrid/' },
  { nome: 'Barcelona',            pagina: '/spain/barcelona/' },
  { nome: 'Atletico Madrid',      pagina: '/spain/atletico-madrid/' },
  { nome: 'Athletic Club',        pagina: '/spain/athletic-club/' },
  { nome: 'Real Betis',           pagina: '/spain/real-betis/' },
  { nome: 'Real Sociedad',        pagina: '/spain/real-sociedad/' },
  { nome: 'Sevilla',              pagina: '/spain/sevilla/' },
  { nome: 'Valencia',             pagina: '/spain/valencia/' },
  { nome: 'Villarreal',           pagina: '/spain/villarreal/' },
  { nome: 'Celta Vigo',           pagina: '/spain/celta/' },
  { nome: 'Osasuna',              pagina: '/spain/osasuna/' },
  { nome: 'Getafe',               pagina: '/spain/getafe/' },
  { nome: 'Girona',               pagina: '/spain/girona/' },
  { nome: 'Mallorca',             pagina: '/spain/mallorca/' },
  { nome: 'Rayo Vallecano',       pagina: '/spain/rayo-vallecano/' },
  { nome: 'Espanyol',             pagina: '/spain/espanyol/' },
  { nome: 'Elche',                pagina: '/spain/elche/' },
  { nome: 'Levante',              pagina: '/spain/levante/' },
  { nome: 'Deportivo',            pagina: '/spain/deportivo/' },
  { nome: 'Oviedo',               pagina: '/spain/oviedo/' },
]

const BUNDESLIGA = [
  { nome: 'Bayern Munich',          pagina: '/germany/bayern-munchen/' },
  { nome: 'Borussia Dortmund',      pagina: '/germany/borussia-dortmund/' },
  { nome: 'RB Leipzig',             pagina: '/germany/rb-leipzig/' },
  { nome: 'Bayer Leverkusen',       pagina: '/germany/bayer-leverkusen/' },
  { nome: 'Eintracht Frankfurt',    pagina: '/germany/eintracht-frankfurt/' },
  { nome: 'Borussia Monchengladbach', pagina: '/germany/borussia-monchengladbach/' },
  { nome: 'Stuttgart',              pagina: '/germany/vfb-stuttgart/' },
  { nome: 'Wolfsburg',              pagina: '/germany/wolfsburg/' },
  { nome: 'Hoffenheim',             pagina: '/germany/hoffenheim/' },
  { nome: 'Freiburg',               pagina: '/germany/freiburg/' },
  { nome: 'Werder Bremen',          pagina: '/germany/werder-bremen/' },
  { nome: 'Union Berlin',           pagina: '/germany/union-berlin/' },
  { nome: 'Augsburg',               pagina: '/germany/augsburg/' },
  { nome: 'Mainz',                  pagina: '/germany/mainz-05/' },
  { nome: 'Koln',                   pagina: '/germany/koln/' },
  { nome: 'Heidenheim',             pagina: '/germany/fc-heidenheim/' },
  { nome: 'St Pauli',               pagina: '/germany/st-pauli/' },
  { nome: 'Hamburg',                pagina: '/germany/hamburger-sv/' },
]

const SERIE_A_IT = [
  { nome: 'Juventus',             pagina: '/italy/juventus/' },
  { nome: 'Inter Milan',          pagina: '/italy/inter/' },
  { nome: 'AC Milan',             pagina: '/italy/milan/' },
  { nome: 'Roma',                 pagina: '/italy/roma/' },
  { nome: 'Napoli',               pagina: '/italy/napoli/' },
  { nome: 'Lazio',                pagina: '/italy/lazio/' },
  { nome: 'Atalanta',             pagina: '/italy/atalanta/' },
  { nome: 'Fiorentina',           pagina: '/italy/fiorentina/' },
  { nome: 'Torino',               pagina: '/italy/torino/' },
  { nome: 'Udinese',              pagina: '/italy/udinese/' },
  { nome: 'Bologna',              pagina: '/italy/bologna/' },
  { nome: 'Genoa',                pagina: '/italy/genoa/' },
  { nome: 'Verona',               pagina: '/italy/verona/' },
  { nome: 'Cagliari',             pagina: '/italy/cagliari/' },
  { nome: 'Lecce',                pagina: '/italy/lecce/' },
  { nome: 'Parma',                pagina: '/italy/parma/' },
  { nome: 'Sassuolo',             pagina: '/italy/sassuolo/' },
  { nome: 'Como',                 pagina: '/italy/como-1907/' },
  { nome: 'Cremonese',            pagina: '/italy/cremonese/' },
  { nome: 'Pisa',                 pagina: '/italy/pisa/' },
]

const LIGUE_1 = [
  { nome: 'PSG',                  pagina: '/france/paris-saint-germain/' },
  { nome: 'Monaco',               pagina: '/france/as-monaco/' },
  { nome: 'Marseille',            pagina: '/france/marseille/' },
  { nome: 'Lyon',                 pagina: '/france/lyon/' },
  { nome: 'Lille',                pagina: '/france/lille/' },
  { nome: 'Rennes',               pagina: '/france/rennes/' },
  { nome: 'Nice',                 pagina: '/france/nice/' },
  { nome: 'Lens',                 pagina: '/france/rc-lens/' },
  { nome: 'Strasbourg',           pagina: '/france/rc-strasbourg-alsace/' },
  { nome: 'Nantes',               pagina: '/france/nantes/' },
  { nome: 'Toulouse',             pagina: '/france/toulouse/' },
  { nome: 'Brest',                pagina: '/france/brest/' },
  { nome: 'Le Havre',             pagina: '/france/le-havre-ac/' },
  { nome: 'Auxerre',              pagina: '/france/auxerre/' },
  { nome: 'Angers',               pagina: '/france/angers/' },
  { nome: 'Lorient',              pagina: '/france/lorient/' },
  { nome: 'Metz',                 pagina: '/france/fc-metz/' },
  { nome: 'Paris FC',             pagina: '/france/paris-fc/' },
]

const PRIMEIRA_LIGA = [
  { nome: 'Porto',                pagina: '/portugal/fc-porto/' },
  { nome: 'Benfica',              pagina: '/portugal/benfica/' },
  { nome: 'Sporting CP',          pagina: '/portugal/sporting-cp/' },
  { nome: 'Braga',                pagina: '/portugal/sc-braga/' },
  { nome: 'Vitoria Guimaraes',    pagina: '/portugal/vitoria-de-guimaraes/' },
  { nome: 'Rio Ave',              pagina: '/portugal/rio-ave/' },
  { nome: 'Famalicao',            pagina: '/portugal/famalicao/' },
  { nome: 'Gil Vicente',          pagina: '/portugal/gil-vicente/' },
  { nome: 'Casa Pia',             pagina: '/portugal/casa-pia-ac/' },
  { nome: 'Santa Clara',          pagina: '/portugal/santa-clara/' },
  { nome: 'Estoril',              pagina: '/portugal/estoril/' },
  { nome: 'Moreirense',           pagina: '/portugal/moreirense/' },
  { nome: 'Arouca',               pagina: '/portugal/arouca/' },
  { nome: 'Estrela Amadora',      pagina: '/portugal/estrela-da-amadora/' },
  { nome: 'Nacional Madeira',     pagina: '/portugal/nacional-da-madeira/' },
  { nome: 'Alverca',              pagina: '/portugal/alverca/' },
  { nome: 'AVS',                  pagina: '/portugal/avs-futebol-sad/' },
  { nome: 'Tondela',              pagina: '/portugal/tondela/' },
]

const EREDIVISIE = [
  { nome: 'Ajax',                 pagina: '/netherlands/ajax/' },
  { nome: 'PSV',                  pagina: '/netherlands/psv/' },
  { nome: 'Feyenoord',            pagina: '/netherlands/feyenoord/' },
  { nome: 'AZ Alkmaar',           pagina: '/netherlands/az-alkmaar/' },
  { nome: 'Twente',               pagina: '/netherlands/twente/' },
  { nome: 'Utrecht',              pagina: '/netherlands/fc-utrecht/' },
  { nome: 'Heerenveen',           pagina: '/netherlands/sc-heerenveen/' },
  { nome: 'Groningen',            pagina: '/netherlands/fc-groningen/' },
  { nome: 'Sparta Rotterdam',     pagina: '/netherlands/sparta-rotterdam/' },
  { nome: 'NAC Breda',            pagina: '/netherlands/nac-breda/' },
  { nome: 'NEC',                  pagina: '/netherlands/nec-nijmegen/' },
  { nome: 'Go Ahead Eagles',      pagina: '/netherlands/go-ahead-eagles/' },
  { nome: 'Heracles',             pagina: '/netherlands/heracles-almelo/' },
  { nome: 'PEC Zwolle',           pagina: '/netherlands/pec-zwolle/' },
  { nome: 'Fortuna Sittard',      pagina: '/netherlands/fortuna-sittard/' },
  { nome: 'Excelsior',            pagina: '/netherlands/excelsior-rotterdam/' },
  { nome: 'Volendam',             pagina: '/netherlands/volendam/' },
  { nome: 'Telstar',              pagina: '/netherlands/telstar/' },
]

const ARGENTINA = [
  { nome: 'River Plate',          pagina: '/argentina/river-plate/' },
  { nome: 'Boca Juniors',         pagina: '/argentina/boca-juniors/' },
  { nome: 'Racing Club',          pagina: '/argentina/racing-club/' },
  { nome: 'Independiente',        pagina: '/argentina/independiente/' },
  { nome: 'San Lorenzo',          pagina: '/argentina/san-lorenzo-de-almagro/' },
  { nome: 'Estudiantes',          pagina: '/argentina/estudiantes-de-la-plata/' },
  { nome: 'Newells',              pagina: '/argentina/newells-old-boys/' },
  { nome: 'Rosario Central',      pagina: '/argentina/rosario-central/' },
  { nome: 'Talleres',             pagina: '/argentina/talleres/' },
  { nome: 'Velez',                pagina: '/argentina/velez-sarsfield/' },
  { nome: 'Lanus',                pagina: '/argentina/lanus/' },
  { nome: 'Huracan',              pagina: '/argentina/ca-huracan/' },
  { nome: 'Belgrano',             pagina: '/argentina/belgrano/' },
  { nome: 'Godoy Cruz',           pagina: '/argentina/godoy-cruz/' },
  { nome: 'Defensa y Justicia',   pagina: '/argentina/defensa-y-justicia/' },
  { nome: 'Atletico Tucuman',     pagina: '/argentina/atletico-tucuman/' },
  { nome: 'Gimnasia La Plata',    pagina: '/argentina/gimnasia-lp/' },
  { nome: 'Banfield',             pagina: '/argentina/banfield/' },
  { nome: 'Union Santa Fe',       pagina: '/argentina/union/' },
  { nome: 'Tigre',                pagina: '/argentina/tigre/' },
  { nome: 'Platense',             pagina: '/argentina/platense/' },
  { nome: 'Sarmiento',            pagina: '/argentina/sarmiento/' },
]

const URUGUAY = [
  { nome: 'Penarol',              pagina: '/uruguay/penarol/' },
  { nome: 'Nacional',             pagina: '/uruguay/nacional/' },
  { nome: 'Defensor Sporting',    pagina: '/uruguay/defensor-sporting/' },
  { nome: 'Danubio',              pagina: '/uruguay/danubio/' },
  { nome: 'Liverpool Montevideo', pagina: '/uruguay/liverpool/' },
  { nome: 'River Plate Uruguay',  pagina: '/uruguay/river-plate/' },
  { nome: 'Montevideo City Torque', pagina: '/uruguay/montevideo-city-torque/' },
  { nome: 'Boston River',         pagina: '/uruguay/boston-river/' },
  { nome: 'Cerro',                pagina: '/uruguay/cerro/' },
  { nome: 'Cerro Largo',          pagina: '/uruguay/cerro-largo/' },
]

const CHILE = [
  { nome: 'Colo Colo',            pagina: '/chile/colo-colo/' },
  { nome: 'Universidad de Chile', pagina: '/chile/universidad-de-chile/' },
  { nome: 'Universidad Catolica', pagina: '/chile/universidad-catolica/' },
  { nome: 'Audax Italiano',       pagina: '/chile/audax-italiano/' },
  { nome: 'Cobresal',             pagina: '/chile/cobresal/' },
  { nome: 'Huachipato',           pagina: '/chile/huachipato/' },
  { nome: 'Nublense',             pagina: '/chile/nublense/' },
  { nome: 'Palestino',            pagina: '/chile/palestino/' },
  { nome: 'Union Espanola',       pagina: '/chile/union-espanola/' },
  { nome: 'Union La Calera',      pagina: '/chile/union-la-calera/' },
  { nome: 'OHiggins',             pagina: '/chile/ohiggins/' },
  { nome: 'Coquimbo Unido',       pagina: '/chile/coquimbo-unido/' },
  { nome: 'Everton Chile',        pagina: '/chile/everton/' },
]

const PERU = [
  { nome: 'Universitario',        pagina: '/peru/universitario/' },
  { nome: 'Alianza Lima',         pagina: '/peru/alianza-lima/' },
  { nome: 'Sporting Cristal',     pagina: '/peru/sporting-cristal/' },
  { nome: 'Melgar',               pagina: '/peru/melgar/' },
  { nome: 'Cusco FC',             pagina: '/peru/cusco/' },
  { nome: 'Cienciano',            pagina: '/peru/cienciano-del-cusco/' },
  { nome: 'Sport Huancayo',       pagina: '/peru/sport-huancayo/' },
  { nome: 'Atletico Grau',        pagina: '/peru/atletico-grau/' },
]

const ECUADOR = [
  { nome: 'LDU Quito',            pagina: '/ecuador/liga-de-quito/' },
  { nome: 'Independiente del Valle', pagina: '/ecuador/independiente-del-valle/' },
  { nome: 'Barcelona SC',         pagina: '/ecuador/barcelona-sc/' },
  { nome: 'Emelec',               pagina: '/ecuador/emelec/' },
  { nome: 'Aucas',                pagina: '/ecuador/aucas/' },
  { nome: 'El Nacional',          pagina: '/ecuador/el-nacional/' },
  { nome: 'Delfin',               pagina: '/ecuador/delfin/' },
  { nome: 'Macara',               pagina: '/ecuador/macara/' },
  { nome: 'Deportivo Cuenca',     pagina: '/ecuador/deportivo-cuenca/' },
  { nome: 'Tecnico Universitario', pagina: '/ecuador/tecnico-universitario/' },
]

const PARAGUAY = [
  { nome: 'Olimpia',              pagina: '/paraguay/olimpia/' },
  { nome: 'Cerro Porteno',        pagina: '/paraguay/cerro-porteno/' },
  { nome: 'Libertad',             pagina: '/paraguay/libertad/' },
  { nome: 'Guarani Paraguay',     pagina: '/paraguay/guarani/' },
  { nome: 'Nacional Paraguay',    pagina: '/paraguay/nacional/' },
  { nome: 'Sportivo Luqueno',     pagina: '/paraguay/sportivo-luqueno/' },
]

const COLOMBIA = [
  { nome: 'Atletico Nacional',    pagina: '/colombia/atletico-nacional/' },
  { nome: 'Independiente Medellin', pagina: '/colombia/independiente-medellin/' },
  { nome: 'America de Cali',      pagina: '/colombia/america-de-cali/' },
  { nome: 'Deportes Tolima',      pagina: '/colombia/deportes-tolima/' },
  { nome: 'Deportivo Cali',       pagina: '/colombia/deportivo-cali/' },
  { nome: 'Millonarios',          pagina: '/colombia/millonarios/' },
  { nome: 'Junior',               pagina: '/colombia/atletico-junior/' },
  { nome: 'Santa Fe',             pagina: '/colombia/independiente-santa-fe/' },
  { nome: 'Once Caldas',          pagina: '/colombia/once-caldas/' },
  { nome: 'Deportivo Pereira',    pagina: '/colombia/deportivo-pereira/' },
]

const BOLIVIA = [
  { nome: 'Bolivar',              pagina: '/bolivia/bolivar/' },
  { nome: 'The Strongest',        pagina: '/bolivia/the-strongest/' },
  { nome: 'Always Ready',         pagina: '/bolivia/always-ready/' },
  { nome: 'Blooming',             pagina: '/bolivia/blooming/' },
  { nome: 'Oriente Petrolero',    pagina: '/bolivia/oriente-petrolero/' },
  { nome: 'Wilstermann',          pagina: '/bolivia/jorge-wilstermann/' },
  { nome: 'Aurora',               pagina: '/bolivia/aurora/' },
  { nome: 'Guabira',              pagina: '/bolivia/guabira/' },
]

// Grupos para o resumo final
const GRUPOS = [
  { label: 'Serie A (BR)',       lista: SERIE_A },
  { label: 'Serie B (BR)',       lista: SERIE_B },
  { label: 'Premier League',     lista: PREMIER_LEAGUE },
  { label: 'Championship',       lista: CHAMPIONSHIP },
  { label: 'La Liga',            lista: LA_LIGA },
  { label: 'Bundesliga',         lista: BUNDESLIGA },
  { label: 'Serie A (IT)',       lista: SERIE_A_IT },
  { label: 'Ligue 1',            lista: LIGUE_1 },
  { label: 'Primeira Liga',      lista: PRIMEIRA_LIGA },
  { label: 'Eredivisie',         lista: EREDIVISIE },
  { label: 'Argentina',          lista: ARGENTINA },
  { label: 'Uruguay',            lista: URUGUAY },
  { label: 'Chile',              lista: CHILE },
  { label: 'Peru',               lista: PERU },
  { label: 'Ecuador',            lista: ECUADOR },
  { label: 'Paraguay',           lista: PARAGUAY },
  { label: 'Colombia',           lista: COLOMBIA },
  { label: 'Bolivia',            lista: BOLIVIA },
]

const TODOS = GRUPOS.reduce(function(acc, g) { return acc.concat(g.lista) }, [])

// ─── SCRAPING ────────────────────────────────────────────────────────────────

async function buscarURL700(pagina) {
  try {
    const r = await axios.get(BASE_SITE + pagina, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 12000
    })
    const match = r.data.match(/https:\/\/assets\.football-logos\.cc\/logos\/[^\s"'<>&]+\/700x700\/[^\s"'<>&]+\.png/)
    return match ? match[0] : null
  } catch (e) {
    return null
  }
}

// ─── IMAGEM DE TESTE ─────────────────────────────────────────────────────────

async function gerarImagemTeste(url, nome) {
  const W = 1080, H = 1080
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#0a1628'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

  const img = await loadImage(url)
  const maxSize = 420
  const scale = Math.min(maxSize / img.width, maxSize / img.height)
  const iw = img.width * scale
  const ih = img.height * scale
  ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2 - 60, iw, ih)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 52px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(nome, W / 2, H / 2 + ih / 2 + 20)
  ctx.fillStyle = '#00c48c'
  ctx.font = '20px sans-serif'
  ctx.fillText(url.replace('https://assets.football-logos.cc/logos/', ''), W / 2, H / 2 + ih / 2 + 58)

  const destino = path.join(assetsDir, 'teste-logo.png')
  fs.writeFileSync(destino, canvas.toBuffer('image/png'))
  return destino
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fazendo scraping de ' + TODOS.length + ' times...\n')

  const mapa = {}
  const falhas = []
  let destaqueURL = null
  let destaqueNome = null

  // Processa em lotes de 6 para nao sobrecarregar
  for (let i = 0; i < TODOS.length; i += 6) {
    const lote = TODOS.slice(i, i + 6)
    const resultados = await Promise.all(lote.map(async function(t) {
      const url = await buscarURL700(t.pagina)
      return { nome: t.nome, url }
    }))
    for (const r of resultados) {
      const status = r.url ? 'OK  ' : 'FAIL'
      console.log('  [' + status + '] ' + r.nome.padEnd(26) + (r.url ? r.url.replace('https://assets.football-logos.cc/logos/', '') : '—'))
      if (r.url) {
        mapa[r.nome] = r.url
        if (!destaqueURL) { destaqueURL = r.url; destaqueNome = r.nome }
        if (r.nome === 'Flamengo') { destaqueURL = r.url; destaqueNome = r.nome }
      } else {
        falhas.push(r.nome)
      }
    }
  }

  // ─── Resultado ───
  const ok = Object.keys(mapa).length
  console.log('\n─────────────────────────────────────────────────────')
  console.log('Total mapeado: ' + ok + '/' + TODOS.length + ' times')
  if (falhas.length) console.log('Falhas:        ' + falhas.join(', '))

  // ─── Gera logosMapa.js ───
  const linhas = Object.entries(mapa).map(function([nome, url]) {
    return "  '" + nome + "': '" + url + "',"
  })
  const conteudo = [
    '// Gerado automaticamente por testeLogos.js',
    '// Fonte: assets.football-logos.cc — ' + new Date().toISOString().slice(0, 10),
    '',
    'const LOGOS = {',
    ...linhas,
    '}',
    '',
    'module.exports = LOGOS',
    '',
  ].join('\n')

  fs.writeFileSync(path.join(__dirname, 'logosMapa.js'), conteudo)
  console.log('\nArquivo gerado: logosMapa.js')

  // ─── Imagem de teste ───
  if (destaqueURL) {
    try {
      const imgPath = await gerarImagemTeste(destaqueURL, destaqueNome)
      console.log('Imagem de teste: ' + imgPath)
    } catch (e) {
      console.log('Aviso: nao foi possivel gerar imagem de teste:', e.message)
    }
  }

  console.log('\nResumo por grupo:')
  for (const g of GRUPOS) {
    const n = g.lista.filter(function(t) { return mapa[t.nome] }).length
    console.log('  ' + g.label.padEnd(20) + n + '/' + g.lista.length)
  }
}

main().catch(function(err) { console.error('Erro fatal:', err.message) })
