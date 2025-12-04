// js/tree.js — versión corregida y compatible con tree.html
import { db } from './firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let membersMap = {}; // id -> member

//-----------------------------------------------------
// UTILIDAD
//-----------------------------------------------------
function yearFrom(dateStr) {
  if (!dateStr) return "";
  const m = dateStr.toString().match(/(\d{4})/);
  return m ? m[1] : dateStr;
}

function publicFields(m) {
  return {
    id: m.id,
    name: m.name || '',
    birthCountry: m.birthCountry || '',
    birthPlace: m.birthPlace || '',
    birthYear: yearFrom(m.birthDate),
    deathYear: yearFrom(m.deathDate),
    deathPlace: m.deathPlace || '',
    photoUrl: m.photoUrl || null,
    parents: Array.isArray(m.parents) ? m.parents : [],
    partners: Array.isArray(m.partners) ? m.partners : [],
    children: Array.isArray(m.children) ? m.children : []
  };
}

//-----------------------------------------------------
// CARGA DE MIEMBROS
//-----------------------------------------------------
async function loadMembers() {
  const snap = await getDocs(collection(db, 'members'));
  membersMap = {};
  snap.forEach(d => membersMap[d.id] = { id: d.id, ...d.data() });

  populateSelectors();
}

//-----------------------------------------------------
// RELLENA SELECTORES (select-root, family-nav-list)
//-----------------------------------------------------
function populateSelectors() {
  const rootSel = document.getElementById('select-root');
  const navList = document.getElementById('family-nav-list');

  if (rootSel) {
    rootSel.innerHTML = '<option value="">(elige)</option>';

    Object.values(membersMap)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        rootSel.appendChild(opt);
      });

    // seleccionar David automáticamente si existe
    const david = Object.values(membersMap)
      .find(x => x.name && x.name.toLowerCase().includes('David') && x.name.toLowerCase().includes('Cernadas'));

    if (david) rootSel.value = david.id;
  }

  if (navList) {
    navList.innerHTML = '';

    Object.values(membersMap)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'nav-btn';
        btn.textContent = m.name;
        btn.onclick = () => {
          document.getElementById('select-root').value = m.id;
          renderTree();
        };
        navList.appendChild(btn);
      });
  }
}

//-----------------------------------------------------
// SVG
//-----------------------------------------------------
function createSvg(width = 2000, height = 2000) {
  const container = document.getElementById('tree-container');
  container.innerHTML = '';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.id = 'familySvg';

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.id = 'svgGroup';

  svg.appendChild(g);
  container.appendChild(svg);

  installPanAndZoom(svg, g);

  return { svg, g };
}

//-----------------------------------------------------
// LAYOUT DEL ÁRBOL
//-----------------------------------------------------
function layoutTree(rootId, maxGen, hGap = 50, vGap = 170) {
  const positions = {};
  const nodeW = 220, nodeH = 150;

  function computeWidth(id, depth) {
    if (depth > maxGen || !membersMap[id]) return nodeW;
    const children = membersMap[id].children || [];
    if (!children.length) return nodeW;
    const widths = children.map(cid => computeWidth(cid, depth + 1));
    return widths.reduce((a, b) => a + b, 0) + hGap * (children.length - 1);
  }

  function place(id, depth, xCenter) {
    const y = 40 + (depth - 1) * vGap;
    positions[id] = { x: xCenter - nodeW / 2, y, w: nodeW, h: nodeH };
    const children = membersMap[id].children || [];

    if (children.length) {
      const widthSub = computeWidth(id, depth);
      let acc = xCenter - widthSub / 2;

      for (const cid of children) {
        const wSub = computeWidth(cid, depth + 1);
        const childCenter = acc + wSub / 2;
        place(cid, depth + 1, childCenter);
        acc += wSub + hGap;
      }
    }
  }

  const totalW = computeWidth(rootId, 1);
  place(rootId, 1, totalW / 2 + 40);

  return { positions, totalW, nodeW, nodeH };
}

//-----------------------------------------------------
// DIBUJO DEL ÁRBOL
//-----------------------------------------------------
function drawTree(rootId, generations) {
  const { svg, g } = createSvg();

  const layout = layoutTree(rootId, generations);
  const pos = layout.positions;

  //---------------------------------------------
  // LÍNEAS (padre → hijo)
  //---------------------------------------------
  Object.entries(pos).forEach(([id, p]) => {
    const children = membersMap[id].children || [];
    const x1 = p.x + p.w / 2;
    const y1 = p.y + p.h;

    children.forEach(cid => {
      if (!pos[cid]) return;

      const c = pos[cid];
      const x2 = c.x + c.w / 2;
      const y2 = c.y;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('class', 'tree-line');
      g.appendChild(line);
    });
  });

  //---------------------------------------------
  // NODOS
  //---------------------------------------------
  const drawn = new Set();

  Object.entries(pos).forEach(([id, p]) => {
    if (drawn.has(id)) return;

    const member = publicFields(membersMap[id]);
    const partnerId = member.partners?.[0];

    // PAREJA
    if (partnerId && membersMap[partnerId] && pos[partnerId]) {
      const p2 = pos[partnerId];

      const groupX = Math.min(p.x, p2.x);
      const groupY = p.y;

      // PERSONA 1
      drawPerson(g, p.x, p.y, p.w, p.h, member);

      // PERSONA 2 AL LADO
      const partner = publicFields(membersMap[partnerId]);
      drawPerson(g, p.x + p.w + 14, p.y, p.w, p.h, partner);

      drawn.add(id);
      drawn.add(partnerId);
    }

    // INDIVIDUAL
    else {
      drawPerson(g, p.x, p.y, p.w, p.h, member);
      drawn.add(id);
    }
  });

  fitToView(svg, g);
}

function drawPerson(g, x, y, w, h, m) {
  const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  fo.setAttribute('x', x);
  fo.setAttribute('y', y);
  fo.setAttribute('width', w);
  fo.setAttribute('height', h);

  fo.innerHTML = `
    <div xmlns="http://www.w3.org/1999/xhtml" class="person-box" style="width:${w}px;height:${h}px;">
      <div style="padding:8px;">
        ${m.photoUrl ? `<img src="${m.photoUrl}" class="person-photo">` : ''}
        <div class="person-name">${m.name}</div>
        <div class="person-year">${m.birthPlace || ''} ${m.birthYear ? '• ' + m.birthYear : ''}</div>
      </div>
    </div>`;

  g.appendChild(fo);
}

//-----------------------------------------------------
// PAN & ZOOM
//-----------------------------------------------------
function installPanAndZoom(svg, g) {
  let scale = 1, tx = 0, ty = 0;
  let start = null;

  svg.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    scale = Math.max(0.2, Math.min(3, scale * factor));

    g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
  }, { passive: false });

  svg.addEventListener('mousedown', e => {
    start = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mousemove', e => {
    if (!start) return;

    tx += e.clientX - start.x;
    ty += e.clientY - start.y;

    start = { x: e.clientX, y: e.clientY };

    g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
  });

  window.addEventListener('mouseup', () => start = null);
}

function fitToView(svg, g) {
  try {
    const bbox = g.getBBox();
    const vbW = svg.viewBox.baseVal.width;
    const vbH = svg.viewBox.baseVal.height;

    const scale = Math.min(vbW / (bbox.width + 200), vbH / (bbox.height + 200));

    const tx = (vbW - (bbox.x + bbox.width * scale)) / 2 - bbox.x * scale;
    const ty = 40;

    g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
  } catch {}
}

//-----------------------------------------------------
// BOTONES
//-----------------------------------------------------
async function renderTree() {
  const rootId = document.getElementById('select-root').value;
  const generations = Number(document.getElementById('select-gen').value);
  await loadMembers();
  drawTree(rootId, generations);
}

// eventos
document.getElementById('btn-generate').onclick = renderTree;
document.getElementById('btn-reset').onclick = async () => {
  await loadMembers();

  const allChildren = new Set();
  Object.values(membersMap).forEach(m => (m.children || []).forEach(c => allChildren.add(c)));

  const roots = Object.values(membersMap).filter(m => !allChildren.has(m.id));

  if (roots.length) {
    document.getElementById('select-root').value = roots[0].id;
    renderTree();
  }
};

// INICIO AUTOMÁTICO
loadMembers();
