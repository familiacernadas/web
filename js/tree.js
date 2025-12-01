import { db } from "./firebase.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

async function cargarArbol() {
  const snap = await getDocs(collection(db, "members"));
  const miembros = {};
  snap.forEach(d => miembros[d.id] = { id: d.id, ...d.data() });

  // Crear árbol con padres y parejas
  const roots = Object.values(miembros).filter(m => !m.padre && !m.madre);

  let html = "<h2>Árbol Familiar</h2><div class='tree-container'>";

  function pintarMiembro(m) {
    const foto = m.fotoURL ? `<img src="${m.fotoURL}" class="foto">` : "";
    return `
      <div class="miembro">
        ${foto}
        <div class="nombre">${m.nombre} ${m.apellidos}</div>
        <div class="detalles">${m.paisNac} - ${m.lugarNac}</div>
      </div>`;
  }

  function pintarPareja(m) {
    const pareja = Object.values(miembros).find(p => p.padre === m.id || p.madre === m.id);
    if (!pareja) return pintarMiembro(m);
    return `
      <div class="pareja">
        ${pintarMiembro(m)}
        ${pintarMiembro(pareja)}
      </div>
    `;
  }

  function hijosDe(id) {
    return Object.values(miembros).filter(h => h.padre === id || h.madre === id);
  }

  function pintarNodo(m) {
    let html = `<div class="nodo">${pintarPareja(m)}`;
    const hijos = hijosDe(m.id);
    if (hijos.length) {
      html += `<div class="hijos">`;
      hijos.forEach(h => html += pintarNodo(h));
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  roots.forEach(r => html += pintarNodo(r));
  html += "</div>";

  document.getElementById("tree").innerHTML = html;
}

cargarArbol();
