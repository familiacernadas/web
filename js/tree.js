// tree.js - muestra parejas juntas y hijos debajo (2 niveles por filtro)
import { db } from './firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const treeEl = document.getElementById('tree');
const searchInput = document.getElementById('searchInput');

async function loadAll(){
  const snap = await getDocs(collection(db,'members'));
  const members = {};
  snap.forEach(d => { members[d.id] = { id: d.id, ...d.data() }; });
  return members;
}

function publicData(m){
  return {
    nombre: m.nombre || '',
    apellidos: m.apellidos || '',
    paisNacimiento: m.paisNacimiento || '',
    lugarNacimiento: m.lugarNacimiento || '',
    anoNacimiento: m.anoNacimiento || '',
    anoFallecimiento: m.anoFallecimiento || '',
    lugarFallecimiento: m.lugarFallecimiento || '',
    photo: m.photo || ''
  };
}

// build subtree up to levels deep (levels includes children levels)
function buildSubtree(rootId, members, levels=2){
  const root = members[rootId];
  if(!root) return null;
  const node = { ...publicData(root), id: root.id, pareja: root.pareja || null, children: [] };
  if(levels <= 0) return node;
  const kids = Object.values(members).filter(m => (m.hijos||[]).includes(root.id) === false) ; // not used

  // children are those where this root is in their 'padre' or 'madre' fields — but we stored hijos on parent.
  const directChildren = Object.values(members).filter(m => (root.hijos||[]).includes(m.id) || (m.pareja===root.id && false));
  // But our admin stores children IDs in parent.hijos, so get them:
  const childIds = root.hijos || [];
  for(const cid of childIds){
    const childNode = buildSubtree(cid, members, levels-1);
    if(childNode) node.children.push(childNode);
  }
  return node;
}

// render subtree as HTML (pair + children)
function renderSubtree(node){
  if(!node) return '<div>No encontrado</div>';
  // pair: node + pareja side-by-side
  const partnerHtml = node.pareja && node.pareja in window._membersMap ? renderPerson(window._membersMap[node.pareja]) : '';
  const meHtml = renderPersonByNode(node);
  const pairHtml = node.pareja ? `<div class="pareja">${meHtml}${partnerHtml}</div>` : `<div class="pareja">${meHtml}</div>`;
  let html = `<div class="nodo">${pairHtml}`;
  if(node.children && node.children.length){
    html += `<div class="hijos">`;
    node.children.forEach(ch => html += renderSubtree(ch));
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

function renderPersonByNode(n){
  const photo = n.photo ? `<img src="${n.photo}" class="foto">` : `<div class="foto noimg">No foto</div>`;
  return `<div class="miembro">
    ${photo}
    <div class="nombre">${n.nombre} ${n.apellidos}</div>
    <div class="detalles">${n.paisNacimiento || ''} ${n.lugarNacimiento ? '• '+n.lugarNacimiento : ''} ${n.anoNacimiento? '• '+n.anoNacimiento : ''}</div>
  </div>`;
}

function renderPerson(m){
  const photo = m.photo ? `<img src="${m.photo}" class="foto">` : `<div class="foto noimg">No foto</div>`;
  return `<div class="miembro">
    ${photo}
    <div class="nombre">${m.nombre || ''} ${m.apellidos || ''}</div>
    <div class="detalles">${m.paisNacimiento || ''} ${m.lugarNacimiento ? '• '+m.lugarNacimiento : ''} ${m.anoNacimiento? '• '+m.anoNacimiento : ''}</div>
  </div>`;
}

async function init(){
  const members = await loadAll();
  window._membersMap = members; // global for pairing lookup

  // fill search select (or input)
  const select = document.createElement('select');
  select.id = 'memberSelectTree';
  select.innerHTML = '<option value="">(Selecciona miembro)</option>';
  Object.values(members).sort((a,b)=> (a.nombre||'').localeCompare(b.nombre||'')).forEach(m=>{
    const opt = document.createElement('option'); opt.value = m.id; opt.textContent = `${m.nombre||''} ${m.apellidos||''}`;
    select.appendChild(opt);
  });

  const container = document.createElement('div');
  container.style.textAlign = 'center';
  container.appendChild(select);
  const btn = document.createElement('button'); btn.textContent = 'Ver descendencia 2 niveles';
  container.appendChild(btn);
  const root = document.getElementById('tree');
  root.innerHTML = '';
  root.appendChild(container);

  btn.addEventListener('click', ()=>{
    const id = select.value;
    if(!id) return alert('Selecciona un miembro');
    const subtree = buildSubtree(id, members, 2);
    root.innerHTML = renderSubtree(subtree);
  });

  // initial: try to auto-select root(s) without parents (we use no parent fields). fallback: show all top-level members
  // For convenience show all members grouped by roots: find those that have hijos or not
  let htmlAll = '<div class="tree-container">';
  const roots = Object.values(members).filter(m => !(Object.values(members).some(x => (x.hijos||[]).includes(m.id)))); // members who are not someone's child
  roots.forEach(r => {
    const subtree = buildSubtree(r.id, members, 1);
    htmlAll += renderSubtree(subtree);
  });
  htmlAll += '</div>';
  root.innerHTML += htmlAll;
}

init();
