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

function $(id){ return document.getElementById(id); }


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
  const sel = $("birthCountry");
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
  const country = $("birthCountry").value;
  const placeSel = $("birthPlace");
  const manual = $("birthPlaceManual");

  placeSel.innerHTML = `<option value="">(elige lugar)</option>`;

  // Si NO hay lista predefinida → mostrar campo manual
  if (!country || !COUNTRY_PLACES[country]) {
    placeSel.style.display = "none";
    manual.style.display = "block";
    manual.value = "";
    return;
  }

  // Si hay lista → mostrar select
  placeSel.style.display = "block";
  manual.style.display = "none";

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
//  BUSQUEDA RÁPIDA DE MIEMBROS
// ======================================================
function filterMembers() {
  const q = document.getElementById("memberSearch").value.toLowerCase();
  const div = document.getElementById("memberList");

  div.innerHTML = "";

  members
    .filter(m => m.name.toLowerCase().includes(q))
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

  // Reasignar eventos tras filtrado
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
  const parents = $("parents");
  const partners = $("partners");
  const children = $("children");

  parents.innerHTML = "";
  partners.innerHTML = "";
  children.innerHTML = "";

  members
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(m => {
      parents.add(new Option(m.name, m.id));
      partners.add(new Option(m.name, m.id));
      children.add(new Option(m.name, m.id));
    });
}


// ======================================================
//  CARGAR MIEMBRO PARA EDITAR
// ======================================================
function loadForEdit(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;

  editingId = id;

  $("memberId").value = id;
  $("name").value = m.name || "";
  $("birthDate").value = m.birthDate || "";
  $("birthCountry").value = m.birthCountry || "";

  updatePlaceSelect();

  if (COUNTRY_PLACES[m.birthCountry]) {
    $("birthPlace").value = m.birthPlace || "";
  } else {
    $("birthPlaceManual").value = m.birthPlace || "";
  }

  $("deathDate").value = m.deathDate || "";
  $("deathPlace").value = m.deathPlace || "";

  $("hasPhoto").checked = !!m.photoUrl;
  $("photoFile").value = m.photoUrl ? m.photoUrl.replace("img/", "") : "";

  selectMultiple("parents", m.parents);
  selectMultiple("partners", m.partners);
  selectMultiple("children", m.children);
}

function selectMultiple(id, arr) {
  const sel = $(id);
  [...sel.options].forEach(o => o.selected = arr?.includes(o.value));
}


// ======================================================
//  GUARDAR MIEMBRO (con BirthPlace automático)
// ======================================================
$("memberForm").onsubmit = async (e) => {
  e.preventDefault();

  const id = $("memberId").value || crypto.randomUUID();

  const data = {
    name: $("name").value.trim(),
    birthDate: $("birthDate").value.trim(),
    birthCountry: $("birthCountry").value.trim(),

    birthPlace: (
      $("birthPlace").style.display !== "none"
        ? $("birthPlace").value
        : $("birthPlaceManual").value
    ),

    deathDate: $("deathDate").value.trim(),
    deathPlace: $("deathPlace").value.trim(),

    parents: getSelected("parents"),
    partners: getSelected("partners"),
    children: getSelected("children"),

    photoUrl: $("hasPhoto").checked && $("photoFile").value.trim()
      ? `img/${$("photoFile").value.trim()}`
      : ""
  };

  await setDoc(doc(db, "members", id), data);

  alert("Guardado correctamente");
  editingId = null;
  e.target.reset();
  await loadMembers();
};

function getSelected(id) {
  return [...$(id).selectedOptions].map(o => o.value);
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
$("loginBtn").onclick = async () => {
  const email = $("email").value.trim();
  const pass = $("password").value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    alert("Error: " + e.message);
  }
};

$("logoutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth, (user) => {
  if (user) {
    $("authSection").style.display = "none";
    $("adminPanel").style.display = "block";
    $("logoutBtn").style.display = "block";
    loadMembers();
  } else {
    $("authSection").style.display = "block";
    $("adminPanel").style.display = "none";
    $("logoutBtn").style.display = "none";
  }
});


// ======================================================
//  INIT
// ======================================================
fillCountrySelect();
$("birthCountry").addEventListener("change", updatePlaceSelect);
document.getElementById("memberSearch")
  .addEventListener("input", filterMembers);