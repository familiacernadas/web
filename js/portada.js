<!-- LEAFLET — Cargar SIEMPRE ANTES QUE PORTADA.JS -->
<script 
  src="css/leaflet.js"></script>

<script type="module" src="js/firebase.js"></script>
<script type="module" src="js/portada.js"></script>

// js/portada.js  (CORREGIDO)

// 🔥 Import Firebase correctamente
import { db } from './firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 🌍 Coordenadas por país
const COUNTRY_COORDS = {
  "spain":[40.4168, -3.7038],
  "españa":[40.4168, -3.7038],
  "argentina":[-34.6037,-58.3816],
  "uruguay":[-34.9011,-56.1645],
  "chile":[-33.4489,-70.6693],
  "mexico":[19.4326,-99.1332],
  "usa":[38.9072,-77.0369],
  "portugal":[38.7223,-9.1393],
  "france":[48.8566,2.3522],
  "colombia":[4.7109,-74.0721]
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


