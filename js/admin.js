// ======================================================
//  FIREBASE IMPORT
// ======================================================
import { db } from "./firebase.js";
import {
  collection, getDocs, doc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { auth } from "./firebase.js";


// ======================================================
//  LISTA CERRADA DE PAÍSES
// ======================================================
export const COUNTRY_LIST = [
  "España", "Portugal", "Francia", "Italia", "Alemania",
  "Argentina", "Uruguay", "Chile", "México", "Colombia",
  "Perú", "Venezuela", "Brasil", "USA", "Canadá",
  "Reino Unido", "Irlanda", "Suiza", "Bélgica", "Holanda"
];

// ======================================================
//  LUGARES SEGÚN PAÍS (LISTA CERRADA)
// ======================================================
export const COUNTRY_PLACES = {
  "España": ["Madrid", "Barcelona", "A Coruña", "Lugo", "Ourense", "Pontevedra", "Valencia", "Sevilla"],
  "Portugal": ["Lisboa", "Oporto", "Braga", "Coímbra"],
  "Francia": ["París", "Lyon", "Marsella", "Burdeos"],
  "Italia": ["Roma", "Milán", "Nápoles", "Turín"],
  "Alemania": ["Berlín", "Múnich", "Hamburgo"],
  "Argentina": ["Buenos Aires", "Córdoba", "Rosario"],
  "Uruguay": ["Montevideo", "Salto", "Paysandú"],
  "Chile": ["Santiago", "Valparaíso", "Concepción"],
  "México": ["Ciudad de México", "Guadalajara", "Monterrey"],
  "Colombia": ["Bogotá", "Medellín", "Cali"],
  "Perú": ["Lima", "Cusco", "Arequipa"],
  "Venezuela": ["Caracas", "Maracaibo"],
  "Brasil": ["São Paulo", "Río de Janeiro"],
  "USA": ["Washington", "New York", "Miami", "Los Ángeles"],
  "Canadá": ["Toronto", "Vancouver"],
  "Reino Unido": ["Londres", "Manchester"],
  "Irlanda": ["Dublín", "Cork"],
  "Suiza": ["Zúrich", "Ginebra"],
  "Bélgica": ["Bruselas", "Amberes"],
  "Holanda": ["Ámsterdam", "Róterdam"]
};


// ======================================================
//  GLOBALS
// ======================================================
let members = [];
let editingId = null;


// ======================================================
//  LOAD MEMBERS
// ======================================================
async function loadMembers() {
  const snap = await getDocs(collection(db, "members"));
  members = [];
  snap.forEach(doc => {
    members.push({ id: doc.id, ...doc.data() });
  });
  refreshMemberList();
  fillRelationshipSelectors();
}


// ======================================================
//  FILL SELECT: PAISES
// ======================================================
function fillCountrySelect() {
  const sel = document.getElementById("birthCountry");
  sel.innerHTML = `<option value="">(elige país)</option>`;

  COUNTRY_LIST.forEach(p => {
    const op = document.createElement("option");
    op.value = p;
    op.textContent = p;
    sel.appendChild(op);
  });
}


// ======================================================
//  FILL SELECT: PLACES (cuando cambias país)
// ======================================================
function updatePlaceSelect() {
  const country = document.getElementById("birthCountry").value;
  const placeSel = document.getElementById("birthPlace");

  placeSel.innerHTML = `<option value="">(elige lugar)</option>`;

  if (!country || !COUNTRY_PLACES[country]) return;

  COUNTRY_PLACES[country].forEach(city => {
    const op = document.createElement("option");
    op.value = city;
    op.textContent = city;
    placeSel.appendChild(op);
  });
}


// ======================================================
//  LISTA DE MIEMBROS EN PANTALLA
// ======================================================
function refreshMemberList() {
  const div = document.getElementById("memberList");
  div.innerHTML = "";

  members
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(m => {
      const row = document.createElement("div");
      row.className = "member-row";
      row.innerHTML = `
        <strong>${m.name}</strong> 
        <button data-id="${m.id}" class="editBtn">Editar</button>
        <button data-id="${m.id}" class="deleteBtn">Eliminar</button>
      `;
      div.appendChild(row);
    });

  document.querySelectorAll(".editBtn").forEach(btn =>
    btn.onclick = () => loadForEdit(btn.dataset.id)
  );
  document.querySelectorAll(".deleteBtn").forEach(btn =>
    btn.onclick = () => deleteMember(btn.dataset.id)
  );
}


// ======================================================
//  SELECTS DE RELACIONES (padres, parejas, hijos)
// ======================================================
function fillRelationshipSelectors() {
  const parents = document.getElementById("parents");
  const partners = document.getElementById("partners");
  const children = document.getElementById("children");

  parents.innerHTML = "";
  partners.innerHTML = "";
  children.innerHTML = "";

  members
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(m => {
      const op1 = new Option(m.name, m.id);
      const op2 = new Option(m.name, m.id);
      const op3 = new Option(m.name, m.id);
      parents.add(op1);
      partners.add(op2);
      children.add(op3);
    });
}


// ======================================================
//  CARGAR MIEMBRO PARA EDITAR
// ======================================================
function loadForEdit(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;

  editingId = id;

  document.getElementById("memberId").value = id;
  document.getElementById("name").value = m.name || "";
  document.getElementById("birthDate").value = m.birthDate || "";
  document.getElementById("birthCountry").value = m.birthCountry || "";
  
  updatePlaceSelect();
  document.getElementById("birthPlace").value = m.birthPlace || "";

  document.getElementById("deathDate").value = m.deathDate || "";
  document.getElementById("deathPlace").value = m.deathPlace || "";

  document.getElementById("hasPhoto").checked = !!m.photoUrl;
  document.getElementById("photoFile").value = m.photoUrl ? m.photoUrl.replace("img/", "") : "";

  // Relaciones
  selectMultiple("parents", m.parents);
  selectMultiple("partners", m.partners);
  selectMultiple("children", m.children);
}

function selectMultiple(id, arr) {
  const sel = document.getElementById(id);
  [...sel.options].forEach(o => o.selected = arr?.includes(o.value));
}


// ======================================================
//  GUARDAR MIEMBRO
// ======================================================
document.getElementById("memberForm").onsubmit = async (e) => {
  e.preventDefault();

  const id = document.getElementById("memberId").value || crypto.randomUUID();

  const name = document.getElementById("name").value.trim();
  const birthDate = document.getElementById("birthDate").value.trim();
  const birthCountry = document.getElementById("birthCountry").value.trim();
  const birthPlace = document.getElementById("birthPlace").value.trim();

  const deathDate = document.getElementById("deathDate").value.trim();
  const deathPlace = document.getElementById("deathPlace").value.trim();

  const hasPhoto = document.getElementById("hasPhoto").checked;
  const photoFile = document.getElementById("photoFile").value.trim();
  const photoUrl = hasPhoto && photoFile ? `img/${photoFile}` : "";

  const parents = getSelected("parents");
  const partners = getSelected("partners");
  const children = getSelected("children");

  const data = {
    name, birthDate, birthCountry, birthPlace,
    deathDate, deathPlace,
    parents, partners, children,
    photoUrl
  };

  await setDoc(doc(db, "members", id), data);

  alert("Guardado correctamente");
  editingId = null;
  e.target.reset();
  await loadMembers();
};

function getSelected(id) {
  return [...document.getElementById(id).selectedOptions].map(o => o.value);
}


// ======================================================
//  BORRAR
// ======================================================
async function deleteMember(id) {
  if (!confirm("¿Seguro que quieres eliminar este miembro?")) return;
  await deleteDoc(doc(db, "members", id));
  await loadMembers();
}


// ======================================================
//  LOGIN / LOGOUT
// ======================================================
document.getElementById("loginBtn").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    alert("Error: " + e.message);
  }
};

document.getElementById("logoutBtn").onclick = () => {
  signOut(auth);
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("authSection").style.display = "none";
    document.getElementById("adminPanel").style.display = "block";
    document.getElementById("logoutBtn").style.display = "block";
    loadMembers();
  } else {
    document.getElementById("authSection").style.display = "block";
    document.getElementById("adminPanel").style.display = "none";
    document.getElementById("logoutBtn").style.display = "none";
  }
});


// ======================================================
//  INIT
// ======================================================
fillCountrySelect();
document.getElementById("birthCountry").addEventListener("change", updatePlaceSelect);
