// 🔥 Import Firebase correctamente
import { db } from './firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 🌍 Coordenadas por país
const COUNTRY_COORDS = {
  "afghanistan":[33.9391,67.7100],
  "albania":[41.1533,20.1683],
  "algeria":[28.0339,1.6596],
  "andorra":[42.5063,1.5218],
  "angola":[-11.2027,17.8739],
  "antigua and barbuda":[17.0608,-61.7964],
  "argentina":[-34.6037,-58.3816],
  "armenia":[40.0691,45.0382],
  "australia":[-35.2809,149.1300],
  "austria":[48.2082,16.3738],
  "azerbaijan":[40.4093,49.8671],

  "bahamas":[25.0443,-77.3504],
  "bahrain":[26.0667,50.5577],
  "bangladesh":[23.8103,90.4125],
  "barbados":[13.1132,-59.5988],
  "belarus":[53.9006,27.5590],
  "belgium":[50.8503,4.3517],
  "belize":[17.2510,-88.7590],
  "benin":[6.4969,2.6289],
  "bhutan":[27.4728,89.6390],
  "bolivia":[-16.2902,-63.5887],
  "bosnia and herzegovina":[43.8563,18.4131],
  "botswana":[-24.6282,25.9231],
  "brazil":[-15.8267,-47.9218],
  "brunei":[4.9031,114.9398],
  "bulgaria":[42.6977,23.3219],
  "burkina faso":[12.3714,-1.5197],
  "burundi":[-3.3614,29.3599],

  "cabo verde":[14.9330,-23.5133],
  "cambodia":[11.5564,104.9282],
  "cameroon":[3.8480,11.5021],
  "canada":[45.4215,-75.6972],
  "central african republic":[4.3947,18.5582],
  "chad":[12.1348,15.0557],
  "chile":[-33.4489,-70.6693],
  "china":[39.9042,116.4074],
  "colombia":[4.7109,-74.0721],
  "comoros":[-11.6455,43.3333],
  "costa rica":[9.9281,-84.0907],
  "croatia":[45.8150,15.9819],
  "cuba":[23.1136,-82.3666],
  "cyprus":[35.1856,33.3823],
  "czech republic":[50.0755,14.4378],

  "denmark":[55.6761,12.5683],
  "djibouti":[11.8251,42.5903],
  "dominica":[15.3092,-61.3790],
  "dominican republic":[18.4861,-69.9312],

  "ecuador":[-0.1807,-78.4678],
  "egypt":[30.0444,31.2357],
  "el salvador":[13.6929,-89.2182],
  "equatorial guinea":[3.7500,8.7833],
  "eritrea":[15.3229,38.9251],
  "estonia":[59.4370,24.7536],
  "eswatini":[-26.3054,31.1367],
  "ethiopia":[9.0300,38.7400],
  "España":[40.4168,-3.7038],

  "fiji":[-18.1248,178.4501],
  "finland":[60.1699,24.9384],
  "france":[48.8566,2.3522],

  "gabon":[-0.4162,9.4673],
  "gambia":[13.4549,-16.5790],
  "georgia":[41.7151,44.8271],
  "germany":[52.5200,13.4050],
  "ghana":[5.6037,-0.1870],
  "greece":[37.9838,23.7275],
  "grenada":[12.0561,-61.7488],
  "guatemala":[14.6349,-90.5069],
  "guinea":[9.6412,-13.5784],
  "guinea-bissau":[11.8636,-15.5977],
  "guyana":[6.8013,-58.1551],

  "haiti":[18.5944,-72.3074],
  "honduras":[14.0723,-87.1921],
  "hungary":[47.4979,19.0402],

  "iceland":[64.1466,-21.9426],
  "india":[28.6139,77.2090],
  "indonesia":[-6.2088,106.8456],
  "iran":[35.6892,51.3890],
  "iraq":[33.3152,44.3661],
  "ireland":[53.3498,-6.2603],
  "israel":[31.7683,35.2137],
  "italy":[41.9028,12.4964],

  "jamaica":[18.1096,-77.2975],
  "japan":[35.6895,139.6917],
  "jordan":[31.9539,35.9106],

  "kazakhstan":[51.1605,71.4704],
  "kenya":[-1.2864,36.8172],
  "kiribati":[1.4518,173.0322],
  "kuwait":[29.3759,47.9774],
  "kyrgyzstan":[42.8746,74.5698],

  "laos":[17.9757,102.6331],
  "latvia":[56.9496,24.1052],
  "lebanon":[33.8938,35.5018],
  "lesotho":[-29.3151,27.4869],
  "liberia":[6.3005,-10.7969],
  "libya":[32.8872,13.1913],
  "liechtenstein":[47.1660,9.5554],
  "lithuania":[54.6872,25.2797],
  "luxembourg":[49.6116,6.1319],

  "madagascar":[-18.8792,47.5079],
  "malawi":[-13.9626,33.7741],
  "malaysia":[3.1390,101.6869],
  "maldives":[4.1755,73.5093],
  "mali":[12.6392,-8.0029],
  "malta":[35.8989,14.5146],
  "marshall islands":[7.0897,171.3800],
  "mauritania":[18.0735,-15.9582],
  "mauritius":[-20.1609,57.5012],
  "mexico":[19.4326,-99.1332],
  "micronesia":[6.9248,158.1610],
  "moldova":[47.0105,28.8638],
  "monaco":[43.7384,7.4246],
  "mongolia":[47.8864,106.9057],
  "montenegro":[42.4304,19.2594],
  "morocco":[33.5731,-7.5898],
  "mozambique":[-25.9653,32.5892],
  "myanmar":[16.8409,96.1735],

  "namibia":[-22.5609,17.0658],
  "nauru":[-0.5228,166.9315],
  "nepal":[27.7172,85.3240],
  "netherlands":[52.3676,4.9041],
  "new zealand":[-41.2865,174.7762],
  "nicaragua":[12.1150,-86.2362],
  "niger":[13.5127,2.1126],
  "nigeria":[9.0765,7.3986],
  "north korea":[39.0392,125.7625],
  "north macedonia":[41.9981,21.4254],
  "norway":[59.9139,10.7522],

  "oman":[23.5880,58.3829],

  "pakistan":[33.6844,73.0479],
  "palau":[7.5000,134.6240],
  "panama":[8.9824,-79.5199],
  "papua new guinea":[-9.4438,147.1803],
  "paraguay":[-25.2637,-57.5759],
  "peru":[-12.0464,-77.0428],
  "philippines":[14.5995,120.9842],
  "poland":[52.2297,21.0122],
  "portugal":[38.7223,-9.1393],

  "qatar":[25.2854,51.5310],

  "romania":[44.4268,26.1025],
  "russia":[55.7558,37.6173],
  "rwanda":[-1.9499,30.0588],

  "saint kitts and nevis":[17.3026,-62.7177],
  "saint lucia":[13.9094,-60.9789],
  "saint vincent and the grenadines":[13.1600,-61.2248],
  "samoa":[-13.8333,-171.7667],
  "san marino":[43.9333,12.4500],
  "sao tome and principe":[0.3365,6.7273],
  "saudi arabia":[24.7136,46.6753],
  "senegal":[14.7167,-17.4677],
  "serbia":[44.7866,20.4489],
  "seychelles":[-4.6167,55.4500],
  "sierra leone":[8.4657,-13.2317],
  "singapore":[1.3521,103.8198],
  "slovakia":[48.1486,17.1077],
  "slovenia":[46.0569,14.5058],
  "solomon islands":[-9.4456,159.9729],
  "somalia":[2.0469,45.3182],
  "south africa":[-25.7479,28.2293],
  "south korea":[37.5665,126.9780],
  "south sudan":[4.8594,31.5713],
  "Spain":[40.4168,-3.7038],
  "sri lanka":[6.9271,79.8612],
  "sudan":[15.5007,32.5599],
  "suriname":[5.8520,-55.2038],
  "sweden":[59.3293,18.0686],
  "Suiza":[46.9480,7.4474],
  "syria":[33.5138,36.2765],

  "taiwan":[25.0330,121.5654],
  "tajikistan":[38.5598,68.7870],
  "tanzania":[-6.7924,39.2083],
  "thailand":[13.7563,100.5018],
  "timor-leste":[-8.5569,125.5603],
  "togo":[6.1725,1.2314],
  "tonga":[-21.1394,-175.2044],
  "trinidad and tobago":[10.6918,-61.2225],
  "tunisia":[36.8065,10.1815],
  "turkey":[41.0082,28.9784],
  "turkmenistan":[37.9601,58.3261],
  "tuvalu":[-8.5167,179.2167],

  "uganda":[0.3476,32.5825],
  "ukraine":[50.4501,30.5234],
  "united arab emirates":[25.2769,55.2962],
  "united kingdom":[51.5074,-0.1278],
  "usa":[38.9072,-77.0369],
  "uruguay":[-34.9011,-56.1645],
  "uzbekistan":[41.2995,69.2401],

  "vanuatu":[-17.7333,168.3273],
  "vatican city":[41.9029,12.4534],
  "venezuela":[10.4806,-66.9036],
  "vietnam":[21.0278,105.8342],

  "yemen":[15.3694,44.1910],

  "zambia":[-15.3875,28.3228],
  "zimbabwe":[-17.8292,31.0522]
};

// Normaliza nombres de países
function normCountry(s){
  if(!s) return null;
  return s.toString().trim().toLowerCase();
}

// Cargar miembros desde Firestore
async function loadMembers(){
  const snap = await getDocs(collection(db,'members'));
  const arr = [];
  snap.forEach(d => arr.push({ id:d.id, ...d.data() }));
  return arr;
}

// 📸 Collage de 9 fotos
function buildCollage(members){
  const collage = document.getElementById('collage');
  collage.innerHTML = '';

  const withPhoto = members.filter(m => m.photoUrl);
  const fallback = members.filter(m => !m.photoUrl);

  const chosen = withPhoto.slice(0,9);
  if(chosen.length < 9) chosen.push(...fallback.slice(0,9 - chosen.length));

  while(chosen.length < 9)
    chosen.push({ photoUrl: 'img/default.png', name: '' });

  chosen.forEach(m => {
    const img = document.createElement('img');
    img.src = m.photoUrl || `img/${(m.name || '').replace(/\s+/g,'_')}.jpg`;
    img.alt = m.name || '';
    collage.appendChild(img);
  });
}

// 🗺️ Construye mapa Leaflet con miembros por país
function buildMap(members){
  const map = L.map('map', { scrollWheelZoom: false }).setView([20,0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const byCountry = {};

  members.forEach(m => {
    const c = normCountry(m.birthCountry || m.birthPlace || m.country || '');
    if(!c) return;

    if(!byCountry[c]) byCountry[c] = [];
    byCountry[c].push(m);
  });

  Object.entries(byCountry).forEach(([country, list])=>{
    const coords = COUNTRY_COORDS[country];
    if(!coords) return;

    const marker = L.marker(coords).addTo(map);
    const popupHtml = `
      <strong>${country.toUpperCase()}</strong><br>
      ${list.length} miembro(s)<br>
      <ul style="text-align:left;padding-left:12px;margin:6px 0">
        ${list.slice(0,8).map(m=>`<li>${m.name}</li>`).join('')}
      </ul>
    `;
    marker.bindPopup(popupHtml);
  });
}

// 🚀 Inicio
(async function init(){
  const members = await loadMembers();
  buildCollage(members);
  buildMap(members);

  const notablesEl = document.getElementById('notables');
  if(notablesEl && notablesEl.children.length === 1) {
    // dejar el placeholder
  }
})();





