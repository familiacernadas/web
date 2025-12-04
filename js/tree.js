// js/tree.js
import { db } from './js/firebase.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let membersMap = {}; // id -> member

// extrae año de YYYY or YYYY-MM-DD
function yearFrom(dateStr){
  if(!dateStr) return "";
  const m = dateStr.toString().match(/(\d{4})/);
  return m ? m[1] : dateStr;
}

function publicFields(m){
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

async function loadMembers(){
  const snap = await getDocs(collection(db,'members'));
  membersMap = {};
  snap.forEach(d => membersMap[d.id] = { id: d.id, ...d.data() });
  populateSelectors();
}

// UI: populate root selector and navigator (used in portada -> "index.html" route)
function populateSelectors(){
  const rootSel = document.getElementById('rootSelector') || document.getElementById('startMember');
  const navigatorDiv = document.getElementById('navigator') || document.getElementById('navigatorDiv') || document.getElementById('memberNavigator');
  if(rootSel){
    rootSel.innerHTML = '<option value="">(elige)</option>';
    Object.values(membersMap).sort((a,b)=> (a.name||'').localeCompare(b.name||'')).forEach(m=>{
      const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name;
      rootSel.appendChild(opt);
    });
    // try to select David automatically
    const david = Object.values(membersMap).find(x => x.name && x.name.toLowerCase().includes('david') && x.name.toLowerCase().includes('cernadas'));
    if(david) rootSel.value = david.id;
  }
  if(navigatorDiv){
    navigatorDiv.innerHTML = '';
    Object.values(membersMap).sort((a,b)=> (a.name||'').localeCompare(b.name||'')).forEach(m=>{
      const btn = document.createElement('button'); btn.className = 'nav-btn'; btn.textContent = m.name;
      btn.onclick = ()=> { document.getElementById('rootSelector').value = m.id; renderTree(); };
      navigatorDiv.appendChild(btn);
    });
  }
}

// RENDER: vertical tree using SVG inside #treeContainer (creates <svg> with nodes & lines)
function createSvg(width=2000,height=2000){
  const container = document.getElementById('treeContainer');
  container.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','100%');
  svg.setAttribute('height','100%');
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.style.display = 'block';
  svg.id = 'familySvg';
  // group for pan/zoom
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('id','svgGroup');
  svg.appendChild(g);
  container.appendChild(svg);
  installPanAndZoom(svg, g);
  return { svg, g, width, height };
}

// simple layout: compute positions top-down.
// returns positions map: id -> {x,y,width,height}
function layoutTree(rootId, maxGen, hGap=40, vGap=160){
  const positions = {};
  const nodeW = 200, nodeH = 140;

  // recursively compute width required for subtree
  function computeWidth(id, depth){
    if(depth > maxGen || !membersMap[id]) return nodeW;
    const children = membersMap[id].children || [];
    if(!children.length) return nodeW;
    const widths = children.map(cid => computeWidth(cid, depth+1));
    return widths.reduce((a,b)=>a+b, 0) + hGap*(children.length-1);
  }

  function place(id, depth, xCenter){
    const y = 40 + (depth-1) * vGap;
    const widthSub = computeWidth(id, depth);
    const xLeft = xCenter - widthSub/2;
    // if no children -> place at xCenter
    positions[id] = { x: xCenter - nodeW/2, y, w: nodeW, h: nodeH };
    const children = membersMap[id].children || [];
    if(children.length){
      let acc = xLeft;
      for(const cid of children){
        const wSub = computeWidth(cid, depth+1);
        const childCenter = acc + wSub/2;
        place(cid, depth+1, childCenter);
        acc += wSub + hGap;
      }
    }
  }

  // compute total width
  const totalW = computeWidth(rootId,1);
  place(rootId,1, totalW/2 + 40);
  return { positions, totalW: Math.max(totalW + 80, 1000), nodeW, nodeH };
}

// draw nodes and connectors on SVG group
function drawTree(rootId, generations){
  const { svg, g, width, height } = createSvg(2000, 2000);
  const layout = layoutTree(rootId, generations);
  const pos = layout.positions;

  // draw connectors (parent -> child)
  Object.entries(pos).forEach(([id, p])=>{
    const children = membersMap[id].children || [];
    const x1 = p.x + p.w/2;
    const y1 = p.y + p.h;
    children.forEach(cid => {
      if(!pos[cid]) return;
      const c = pos[cid];
      const x2 = c.x + c.w/2;
      const y2 = c.y;
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('class','tree-line');
      g.appendChild(line);
    });
  });

  // draw nodes (pair together if partner exists and partner is in membersMap)
  const drawn = new Set();
  Object.entries(pos).forEach(([id, p])=>{
    if(drawn.has(id)) return;
    const member = publicFields(membersMap[id]);
    const partnerId = (member.partners && member.partners[0]) ? member.partners[0] : null;
    if(partnerId && membersMap[partnerId] && pos[partnerId]){
      // place pair side-by-side inside combined width
      const partnerPos = pos[partnerId];
      const groupX = Math.min(p.x, partnerPos.x);
      const groupY = p.y;
      const group = document.createElementNS('http://www.w3.org/2000/svg','g');
      group.setAttribute('transform', `translate(${groupX}, ${groupY})`);
      // draw first
      const rect1 = document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect1.setAttribute('x', 0); rect1.setAttribute('y',0); rect1.setAttribute('width', p.w); rect1.setAttribute('height', p.h);
      rect1.setAttribute('rx', 10); rect1.setAttribute('class','node-rect');
      g.appendChild(rect1.cloneNode());
      // individual nodes drawn using foreignObject to allow HTML-like content
      const fo1 = document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
      fo1.setAttribute('x', 0); fo1.setAttribute('y', 0); fo1.setAttribute('width', p.w); fo1.setAttribute('height', p.h);
      fo1.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml" class="person-box" style="width:${p.w}px;height:${p.h}px;">
          <div style="padding:8px;">
            ${member.photoUrl ? `<img src="${member.photoUrl}" style="width:100px;height:100px;border-radius:6px;display:block;margin:0 auto 6px;">` : ''}
            <div style="font-weight:700;text-align:center;">${member.name}</div>
            <div style="font-size:12px;color:#666;text-align:center;">${member.birthPlace || ''} ${member.birthYear ? '• ' + member.birthYear : ''}</div>
          </div>
        </div>`;
      g.appendChild(fo1);

      // partner
      const partner = publicFields(membersMap[partnerId]);
      const offsetX = p.w + 12;
      const fo2 = document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
      fo2.setAttribute('x', offsetX); fo2.setAttribute('y', 0); fo2.setAttribute('width', partnerPos.w); fo2.setAttribute('height', partnerPos.h);
      fo2.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml" class="person-box" style="width:${partnerPos.w}px;height:${partnerPos.h}px;">
          <div style="padding:8px;">
            ${partner.photoUrl ? `<img src="${partner.photoUrl}" style="width:100px;height:100px;border-radius:6px;display:block;margin:0 auto 6px;">` : ''}
            <div style="font-weight:700;text-align:center;">${partner.name}</div>
            <div style="font-size:12px;color:#666;text-align:center;">${partner.birthPlace || ''} ${partner.birthYear ? '• ' + partner.birthYear : ''}</div>
          </div>
        </div>`;
      g.appendChild(fo2);

      drawn.add(id); drawn.add(partnerId);
    } else {
      // single node
      const fo = document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
      fo.setAttribute('x', p.x); fo.setAttribute('y', p.y); fo.setAttribute('width', p.w); fo.setAttribute('height', p.h);
      const m = publicFields(membersMap[id]);
      fo.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml" class="person-box" style="width:${p.w}px;height:${p.h}px;">
          <div style="padding:8px;">
            ${m.photoUrl ? `<img src="${m.photoUrl}" style="width:100px;height:100px;border-radius:6px;display:block;margin:0 auto 6px;">` : ''}
            <div style="font-weight:700;text-align:center;">${m.name}</div>
            <div style="font-size:12px;color:#666;text-align:center;">${m.birthPlace || ''} ${m.birthYear ? '• ' + m.birthYear : ''}</div>
          </div>
        </div>`;
      g.appendChild(fo);
      drawn.add(id);
    }
  });

  // center/fit
  fitToView(svg, g);
}

// -- PAN & ZOOM helpers --
function installPanAndZoom(svg, g){
  let scale = 1, min=0.2, max=3;
  let tx = 0, ty = 0;
  let isPanning = false, start = null;

  function update(){
    g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
  }

  svg.addEventListener('wheel', e=>{
    if(!e.ctrlKey) return;
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    scale = Math.max(min, Math.min(max, scale * factor));
    update();
  }, { passive:false });

  svg.addEventListener('mousedown', e=>{
    isPanning = true; start = {x: e.clientX, y: e.clientY};
  });
  window.addEventListener('mousemove', e=>{
    if(!isPanning || !start) return;
    const dx = e.clientX - start.x; const dy = e.clientY - start.y;
    tx += dx; ty += dy; start = {x: e.clientX, y: e.clientY};
    update();
  });
  window.addEventListener('mouseup', ()=> { isPanning=false; start=null; });

  // expose controls
  window.treeZoomIn = ()=> { scale = Math.min(max, scale*1.15); update(); };
  window.treeZoomOut = ()=> { scale = Math.max(min, scale/1.15); update(); };
  window.treeReset = ()=> { scale = 1; tx = 0; ty = 0; update(); fitToView(svg, g); };
}

// fit group to visible view (basic)
function fitToView(svg, g){
  // try to compute bbox of g and center
  try{
    const bbox = g.getBBox();
    const svgW = svg.viewBox.baseVal.width;
    const svgH = svg.viewBox.baseVal.height;
    const scale = Math.min(svgW / (bbox.width + 200), svgH / (bbox.height + 200), 1.5);
    const tx = (svgW - (bbox.x + bbox.width*scale))/2 - bbox.x*scale;
    const ty = 20;
    g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
  }catch(e){
    // ignore
  }
}

// public render function (used by index.html / portada)
export async function renderTreeFrom(rootId, generations){
  await loadMembers();
  if(!rootId){
    // choose roots = members who are not child of anyone
    const allChildren = new Set();
    Object.values(membersMap).forEach(m => (m.children||[]).forEach(c=>allChildren.add(c)));
    const roots = Object.values(membersMap).filter(m => !allChildren.has(m.id));
    if(!roots.length) { console.warn('No roots found'); return; }
    // create a synthetic root that contains first root
    rootId = roots[0].id;
  }
  drawTree(rootId, generations || 2);
}

// simple init for pages that include this file directly
if(typeof window !== 'undefined' && document.getElementById('renderTreeBtn')){
  document.getElementById('renderTreeBtn').addEventListener('click', ()=>{
    const root = document.getElementById('rootSelector').value;
    const gen = Number(document.getElementById('levelsSelector')?.value || document.getElementById('generationDepth')?.value || 2);
    renderTreeFrom(root, gen);
  });
  window.addEventListener('DOMContentLoaded', ()=> {
    loadMembers().then(()=> {
      // try auto-render default if element exists
      const rootSel = document.getElementById('rootSelector');
      if(rootSel && rootSel.value) renderTreeFrom(rootSel.value, Number(document.getElementById('levelsSelector').value));
      else {
        // choose David if present
        const david = Object.values(membersMap).find(x => x.name && x.name.toLowerCase().includes('david') && x.name.toLowerCase().includes('cernadas'));
        if(david) {
          const sel = document.getElementById('rootSelector');
          if(sel) sel.value = david.id;
          renderTreeFrom(david.id, Number(document.getElementById('levelsSelector')?.value || 2));
        }
      }
    });
  });
}
