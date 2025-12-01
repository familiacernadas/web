import { auth, db, storage } from "./firebase.js";
import {
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const loginBtn = document.getElementById("loginBtn");
const email = document.getElementById("email");
const pass = document.getElementById("pass");
const adminPanel = document.getElementById("adminPanel");

loginBtn.onclick = async () => {
  await signInWithEmailAndPassword(auth, email.value, pass.value);
  document.getElementById("loginSection").style.display = "none";
  adminPanel.classList.remove("hidden");
  cargar();
};

async function cargar() {
  const lista = document.getElementById("lista");
  lista.innerHTML = "";
  const snap = await getDocs(collection(db, "members"));
  snap.forEach(d => {
    const m = d.data();
    lista.innerHTML += `
      <div class="item">
        <strong>${m.nombre} ${m.apellidos}</strong>
        <button onclick="borrar('${d.id}')">Borrar</button>
      </div>
    `;
  });
}

window.borrar = async function(id) {
  await deleteDoc(doc(db, "members", id));
  cargar();
};

document.getElementById("memberForm").onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));

  if (foto.files.length > 0) {
    const fileRef = ref(storage, "fotos/" + crypto.randomUUID());
    await uploadBytes(fileRef, foto.files[0]);
    data.fotoURL = await getDownloadURL(fileRef);
  }

  await addDoc(collection(db, "members"), data);
  cargar();
  e.target.reset();
};
