// js/tree.js
import { db } from './firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectRoot = document.getElementById('select-root');
const selectGen = document.getElementById('select-gen');
const btnGen = document.getElementById('btn-generate');
const btnReset = document.getElementById('btn-reset');
const treeContainer = document.getElementById('tree-container');
const navList = document.getElementById('family-nav-list');

async function loadMembersMap(){
  const snap = await getDocs(collection(db,'members'));
  const map = {};
  snap.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
  return map;
}

// Public data filter
function publicData(member){
  return {
    nombre: member.nombre || '',
    apellidos: member.apellidos || '',
    paisNacimiento: member.paisNacimiento || '',
    lugarNacimiento: member.lugarNacimiento || '',
    anoNacimiento: member.anoNacimiento || '',
    anoFallecimiento: member.anoFallecimiento || '',
    lugarFallecimiento: member.lugarFallecimiento || '',
    photo: member.photo || ''
  };
}

// Render person card HTML (only public fields)
function renderPersonCard(m){
  const p = publicData(m);
  const photoSrc = p.photo ? p.photo : 'img/default.png';
  return `
    <div class="miembro">
      <div class="thumb">${p.photo ? `<img src="${photoSrc}" alt="${p.nombre} ${p.apellidos}">` : '<div class="noimg">No foto</div>'}</div>
      <div class="info">
        <div class="nombre">${p.nombre} ${p.apellidos}</div>
        <div class="det">${p.paisNacimiento ? p.paisNacimiento + ' • ' : ''}${p.lugarNacimiento || ''}</div>
        <div class="det small">${p.anoNacimiento ? 'Nac. ' + p.anoNacimiento : ''} ${p.anoFallecimiento ? ' • Fal. ' + p.anoFallecimiento : ''}</div>
        <div class="det small">${p.lugarFallecimiento || ''}</div>
      </div>
    </div>
  `;
}

// Build subtree using hijos array stored in parent
function buildSubtree(rootId, membersMap, generations){
  const root = membersMap[rootId];
  if(!root) return '';
  // pair HTML
  const partner = root.pareja ? membersMap[root.pareja] : null;
  const personHtml = renderPersonCard(root);
  const partnerHtml = partner ? renderPersonCard(partner) : '';
  const pairHtml = `<div class="pair">${personHtml}${partnerHtml}</div>`;

  // children
  let childrenHtml = '';
  if(generations > 0){
    const childIds = root.hijos || [];
    if(childIds.length){
      const kids = childIds.map(cid => buildSubtree(cid, membersMap, generations - 1)).join('');
      childrenHtml = `<div class="hijos">${kids}</div>`;
    }
  }

  return `<div class="nodo">${pairHtml}${childrenHtml}</div>`;
}

// Render top-level forest (roots = members who are not listed as child of anyone)
function renderForest(membersMap, generations){
  // compute set of all children
  const allChildIds = new Set();
  Object.values(membersMap).forEach(m => {
    (m.hijos || []).forEach(cid => allChildIds.add(cid));
  });
  const roots = Object.values(membersMap).filter(m => !allChildIds.has(m.id));
  const html = roots.map(r => buildSubtree(r.id, membersMap, generations)).join('');
  return `<div class="forest">${html}</div>`;
}

// Populate select & bottom nav
async function populateUI(){
  const members = await loadMembersMap();
  // select
  selectRoot.innerHTML = '<option value="">(elige)</option>';
  Object.values(members).sort((a,b)=> (a.nombre||'').localeCompare(b.nombre||'')).forEach(m=>{
    const opt = document.createElement('option');
    opt.value = m.id; opt.textContent = `${m.nombre} ${m.apellidos}`;
    selectRoot.appendChild(opt);
  });
  // bottom nav
  navList.innerHTML = '';
  Object.values(members).sort((a,b)=> (a.nombre||'').localeCompare(b.nombre||'')).forEach(m=>{
    const a = document.createElement('a');
    a.href = `tree.html?root=${m.id}`;
    a.textContent = `${m.nombre} ${m.apellidos}`;
    navList.appendChild(a);
  });
  // initial render: show forest
  treeContainer.innerHTML = renderForest(members, Number(selectGen.value));
  // if URL param root present, load it
  const params = new URLSearchParams(window.location.search);
  if(params.has('root')){
    const rid = params.get('root');
    treeContainer.innerHTML = buildSubtree(rid, members, Number(selectGen.value));
    selectRoot.value = rid;
  }
}

btnGen.addEventListener('click', async ()=>{
  const members = await loadMembersMap();
  const root = selectRoot.value;
  const gen = Number(selectGen.value);
  if(!root){ alert('Selecciona un miembro'); return; }
  treeContainer.innerHTML = buildSubtree(root, members, gen);
});

btnReset.addEventListener('click', async ()=>{
  const members = await loadMembersMap();
  treeContainer.innerHTML = renderForest(members, Number(selectGen.value));
});

populateUI();
