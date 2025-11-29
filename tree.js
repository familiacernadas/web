// tree.js
import { db } from './firebase.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';

const rootSel = document.getElementById('rootSel');
const networkContainer = document.getElementById('network');

async function getMembers(){
  const snap = await getDocs(collection(db,'members'));
  const members = [];
  snap.forEach(d=>{ const data = d.data(); data.id = d.id; members.push(data); });
  return members;
}

function buildGraph(members){
  const nodes = [];
  const edges = [];
  const map = {};
  members.forEach(m => map[m.id] = m);

  members.forEach(m=>{
    nodes.push({ id: m.id, label: m.name + (m.birthDate ? '\n' + m.birthDate : ''), shape: 'box' });
    (m.parents || []).forEach(p=>{
      // parent -> child
      edges.push({ from: p, to: m.id, arrows: 'to', color: { color: '#888' } });
    });
    (m.partners || []).forEach(p=>{
      if(m.id < p) edges.push({ from: m.id, to: p, dashes: true, color: { color: '#f39c12' } });
    });
  });

  return { nodes, edges };
}

async function init(){
  const members = await getMembers();
  members.forEach(m=>{
    const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name;
    rootSel.appendChild(opt);
  });
  rootSel.addEventListener('change', ()=> draw(rootSel.value, members));
  if(members.length){
    // try to pick a root without parents
    const roots = members.filter(m => !m.parents || m.parents.length === 0);
    rootSel.value = roots.length ? roots[0].id : members[0].id;
    draw(rootSel.value, members);
  }
}

function draw(rootId, members){
  const { nodes, edges } = buildGraph(members);
  const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
  const options = {
    layout: { hierarchical: { enabled: true, direction: 'UD', sortMethod: 'directed' } },
    nodes: { shape: 'box', margin:10 },
    edges: { smooth: true, arrows: { to: { enabled: true, scaleFactor:0.5 } } },
    physics: { enabled: false }
  };
  const network = new vis.Network(networkContainer, data, options);
  // center
  document.getElementById('centerBtn').onclick = ()=> network.fit();
}

init();
