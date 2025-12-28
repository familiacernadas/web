// admin.js
import { auth, db, storage } from './firebase.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js';

import {
  collection,
  getDocs,
  query,
  orderBy,
  addDoc,
  doc,
  deleteDoc,
  getDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';

import {
  ref as sref,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js';

const el = id => document.getElementById(id);

/* ───────────────── AUTH ───────────────── */

function setupAuthUI(){
  const loginBtn = el('loginBtn');
  const logoutBtn = el('logoutBtn');

  loginBtn?.addEventListener('click', async ()=>{
    try{
      await signInWithEmailAndPassword(auth, el('email').value, el('password').value);
    }catch(e){
      alert('Error login: '+e.message);
    }
  });

  logoutBtn?.addEventListener('click', ()=> signOut(auth));

  onAuthStateChanged(auth, user=>{
    el('authSection').style.display = user ? 'none' : 'block';
    el('adminPanel').style.display = user ? 'block' : 'none';
    logoutBtn.style.display = user ? 'inline-block' : 'none';
    if(user) loadList();
  });

  el('memberForm')?.addEventListener('submit', saveMember);
  el('cancelBtn')?.addEventListener('click', resetForm);
  el('memberSearch')?.addEventListener('input', e => loadList(e.target.value));
}

/* ───────────────── DATA ───────────────── */

async function fetchMembers(filter=''){
  const snap = await getDocs(query(collection(db,'members'), orderBy('name')));
  const list = [];
  snap.forEach(d => list.push({ id:d.id, ...d.data() }));
  if(filter){
    return list.filter(m => (m.name||'').toLowerCase().includes(filter.toLowerCase()));
  }
  return list;
}

async function loadList(filter=''){
  const members = await fetchMembers(filter);
  renderList(members);
}

/* ───────────────── LIST ───────────────── */

function renderList(items){
  const listEl = el('memberList');
  listEl.innerHTML = '';

  if(!items.length){
    listEl.textContent = 'No hay miembros';
    return;
  }

  items.forEach(m=>{
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
      <strong>${m.name}</strong>
      <div>
        <button class="editBtn">Editar</button>
        <button class="deleteBtn">Borrar</button>
      </div>
    `;

    row.querySelector('.editBtn').onclick = ()=> loadMember(m.id);
    row.querySelector('.deleteBtn').onclick = ()=> deleteMember(m.id);

    listEl.appendChild(row);
  });
}

/* ───────────────── FORM ───────────────── */

async function loadMember(id){
  const snap = await getDoc(doc(db,'members',id));
  if(!snap.exists()) return;

  const d = snap.data();
  el('memberId').value = id;
  el('name').value = d.name || '';
  el('birthDate').value = d.birthDate || '';
  el('deathDate').value = d.deathDate || '';
  el('birthCountry').value = d.birthCountry || '';
  el('birthPlace').value = d.birthPlace || '';
  el('photoFile').value = '';
}

function resetForm(){
  el('memberForm').reset();
  el('memberId').value = '';
}

/* ───────────────── SAVE ───────────────── */

async function saveMember(e){
  e.preventDefault();

  const memberId = el('memberId').value || null;
  const name = el('name').value.trim();
  if(!name){ alert('Nombre obligatorio'); return; }

  const data = {
    name,
    birthDate: el('birthDate').value || '',
    deathDate: el('deathDate').value || '',
    birthCountry: el('birthCountry').value || '',
    birthPlace:
      el('birthPlace').style.display !== 'none'
        ? el('birthPlace').value
        : el('birthPlaceManual').value,
    updatedAt: Date.now()
  };

  try{
    // FOTO
    const file = el('photoFile')?.files?.[0];
    if(file){
      const ref = sref(storage, 'photos/'+Date.now()+'_'+file.name);
      const up = await uploadBytes(ref, file);
      data.photoUrl = await getDownloadURL(up.ref);
    }

    if(memberId){
      await updateDoc(doc(db,'members',memberId), data);
      alert('Miembro actualizado');
    } else {
      await addDoc(collection(db,'members'), {
        ...data,
        createdAt: Date.now()
      });
      alert('Miembro creado');
    }

    resetForm();
    loadList();

  }catch(err){
    console.error(err);
    alert('Error guardando: '+err.message);
  }
}

/* ───────────────── DELETE ───────────────── */

async function deleteMember(id){
  if(!confirm('¿Borrar este miembro?')) return;
  await deleteDoc(doc(db,'members',id));
  loadList();
}

/* ───────────────── INIT ───────────────── */

setupAuthUI();
