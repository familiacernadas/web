// ===============================
//   IMPORT FIREBASE
// ===============================
import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


// ===============================
//   HELPERS GENERAL
// ===============================
function yearFrom(dateStr){
  if(!dateStr) return "";
  const m = dateStr.match(/(\d{4})/);
  return m ? m[1] : dateStr;
}

function safe(x){ return x || ""; }

function publicFields(member){
  return {
    id: member.id,
    name: safe(member.name),
    birthCountry: safe(member.birthCountry),
    birthPlace: safe(member.birthPlace),
    birthYear: yearFrom(member.birthDate),
    deathYear: yearFrom(member.deathDate),
    deathPlace: safe(member.deathPlace),
    photoUrl: member.photoUrl || null,
    parents: Array.isArray(member.parents) ? member.parents : [],
    partners: Array.isArray(member.partners) ? member.partners : [],
    children: Array.isArray(member.children) ? member.children : []
  };
}


// ===============================
//   HTML PERSON
// ===============================
function buildPersonHtml(m){
  const photo = m.photoUrl ? m.photoUrl : ( `img/${m.name.replace(/\s+/g,'_')}.jpg` );
  return `
    <div class="person-box" data-id="${m.id}">
      <img src="${photo}" alt="${m.name}">
      <div class="person-name">${m.name}</div>
      <div class="person-meta">
        ${m.birthCountry ? m.birthCountry + " • " : ""}${m.birthPlace}<br>
        ${m.birthYear ? "Nac: " + m.birthYear : ""} ${m.deathYear ? " • Fal: " + m.deathYear : ""}<br>
        ${m.deathPlace || ""}
      </div>
    </div>
  `;
}


// ===============================
//   PAREJA
// ===============================
function buildPairHtml(map, member){
  const partnerId = member.partners?.[0];
  if(partnerId && map[partnerId]){
    const p = publicFields(map[partnerId]);
    return `<div class="pair">${buildPersonHtml(publicFields(member))}${buildPersonHtml(p)}</div>`;
  }
  return `<div class="pair">${buildPersonHtml(publicFields(member))}</div>`;
}


// ===============================
//   ÁRBOL RECURSIVO
// ===============================
export function renderSubtree(id, map, depth){
  if(!map[id] || depth < 1) return "";
  const m = map[id];
  let html = `<div class="node-outer" id="node-${id}">${buildPairHtml(map, m)}`;

  const kids = m.children || [];
  if(kids.length && depth > 1){
    const childrenHtml = kids.map(cid => renderSubtree(cid, map, depth - 1)).join("");
    html += `
      <div class="connector-vertical"></div>
      <div class="children-row">${childrenHtml}</div>
    `;
  }

  html += `</div>`;
  return html;
}

export function renderForest(rootIds, map, depth){
  return rootIds.map(id => renderSubtree(id, map, depth)).join("");
}


// ==============================================================
//     🔥  LÓGICA QUE FALTABA  — AHORA EL ÁRBOL FUNCIONA
// ==============================================================

let members = [];
let membersMap = {};
let currentRoot = null;

// ---- cargar miembros ----
async function loadMembers(){
  const snap = await getDocs(collection(db, "members"));
  members = [];
  snap.forEach(doc => members.push({ id: doc.id, ...doc.data() }));
  membersMap = Object.fromEntries(members.map(m => [m.id, m]));
}

// ---- encontrar raíces ----
function findRoots(){
  const allIds = new Set(members.map(m => m.id));
  const childrenIds = new Set(members.flatMap(m => m.children || []));
  return [...allIds].filter(id => !childrenIds.has(id));
}

// ---- rellenar el selector ----
function fillSelect(){
  const sel = document.getElementById("selectPerson");
  sel.innerHTML = "";

  const optEmpty = document.createElement("option");
  optEmpty.value = "";
  optEmpty.textContent = "(elige)";
  sel.appendChild(optEmpty);

  members
    .sort((a,b)=>a.name.localeCompare(b.name))
    .forEach(m=>{
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.name;
      sel.appendChild(o);
    });
}


// ---- generar árbol ----
function drawTree(rootId){
  if(!rootId) return;

  const depth = 3;  // profundidad fija (puedes cambiar)
  const html = renderSubtree(rootId, membersMap, depth);

  document.getElementById("treeContent").innerHTML = html;
  currentRoot = rootId;

  centerTree();
}


// ==============================================================
//     NAVEGACION (padres / hijos / inicio)
// ==============================================================

function goHome(){
  const roots = findRoots();
  if(roots.length){
    drawTree(roots[0]);
    document.getElementById("selectPerson").value = roots[0];
  }
}

function goUp(){
  if(!currentRoot) return;
  const m = membersMap[currentRoot];
  if(m.parents && m.parents.length){
    drawTree(m.parents[0]);
    document.getElementById("selectPerson").value = m.parents[0];
  }
}

function goDown(){
  if(!currentRoot) return;
  const m = membersMap[currentRoot];
  if(m.children && m.children.length){
    drawTree(m.children[0]);
    document.getElementById("selectPerson").value = m.children[0];
  }
}


// ==============================================================
//     ZOOM + CENTRAR
// ==============================================================

let zoom = 1.0;

function applyZoom(){
  document.getElementById("treeContent").style.transform = `scale(${zoom})`;
  document.getElementById("zoomLabel").textContent = Math.round(zoom*100)+"%";
}

function centerTree(){
  const cont = document.getElementById("treeContainer");
  const content = document.getElementById("treeContent");
  cont.scrollLeft = (content.scrollWidth - cont.clientWidth) / 2;
}


// ==============================================================
//     INIT
// ==============================================================

(async function init(){
  await loadMembers();
  fillSelect();

  // --- establecer miembro raíz por defecto ---
  const defaultRoot = "David Cernadas Fernandez";   // dDBj85CJtTcxtPh4juT1
  document.getElementById("selectPerson").value = defaultRoot;
  drawTree(defaultRoot);

  // eventos UI
  document.getElementById("selectPerson").addEventListener("change",(e)=>{
    if(e.target.value) drawTree(e.target.value);
  });

  document.getElementById("zoomIn").addEventListener("click",()=>{
    zoom = Math.min(zoom+0.1, 2);
    applyZoom();
  });
  document.getElementById("zoomOut").addEventListener("click",()=>{
    zoom = Math.max(zoom-0.1, 0.3);
    applyZoom();
  });
  document.getElementById("centerTree").addEventListener("click", centerTree);

  document.getElementById("goHome").addEventListener("click", goHome);
  document.getElementById("goUp").addEventListener("click", goUp);
  document.getElementById("goDown").addEventListener("click", goDown);
})();




