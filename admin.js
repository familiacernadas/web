// admin.js - Firebase v9 modular SDK usage for CRUD and auth
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js';
import { getFirestore, collection, getDocs, query, where, addDoc, doc, setDoc, deleteDoc, orderBy, getDoc } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';
import { getStorage, ref as sref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js';

let app, auth, db, storage;
let readOnlyMode = false;

export function initFirebase(config, opts = {}) {
  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  readOnlyMode = !!opts.readOnly;
  setupAuthUI();
  return app;
}

function setupAuthUI(){
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const authPanel = document.getElementById('auth');
  const adminPanel = document.getElementById('adminPanel');

  if(!loginBtn) return;

  loginBtn.addEventListener('click', async ()=>{
    try{ await signInWithEmailAndPassword(auth, email.value, password.value); }catch(e){ alert('Error login: '+e.message); }
  });

  logoutBtn.addEventListener('click', async ()=>{ await signOut(auth); });

  onAuthStateChanged(auth, user=>{
    if(user){
      authPanel.style.display='none';
      adminPanel.style.display='block';
      logoutBtn.style.display='inline-block';
      loadList();
    } else {
      authPanel.style.display='block';
      adminPanel.style.display='none';
      logoutBtn.style.display='none';
    }
  });

  const form = document.getElementById('memberForm');
  if(form){
    form.addEventListener('submit', saveMember);
    document.getElementById('cancelEdit').addEventListener('click', ()=>{ form.reset(); document.getElementById('memberId').value=''; });
  }
}

export async function fetchMembers(searchQ=''){
  const col = collection(db, 'members');
  const snap = await getDocs(query(col, orderBy('name')));
  const list = [];
  snap.forEach(d=>{ const data = d.data(); data.id = d.id; list.push(data); });
  if(searchQ) return list.filter(x=> (x.name||'').toLowerCase().includes(searchQ.toLowerCase()));
  return list;
}

async function saveMember(e){
  e.preventDefault();
  if(readOnlyMode) return alert('Modo solo lectura activo.');
  const id = document.getElementById('memberId').value || null;
  const name = document.getElementById('name').value.trim();
  const description = document.getElementById('description').value.trim();
  const photoFile = document.getElementById('photo').files[0];
  if(!name){ alert('El nombre es obligatorio'); return; }

  try{
    let photoUrl = null;
    if(photoFile){
      const storageRef = sref(storage, 'photos/'+Date.now()+'_'+photoFile.name);
      const uploaded = await uploadBytes(storageRef, photoFile);
      photoUrl = await getDownloadURL(uploaded.ref);
    }

    if(id){
      const docRef = doc(db, 'members', id);
      await setDoc(docRef, { name, description, photoUrl }, { merge: true });
      alert('Miembro actualizado');
    } else {
      await addDoc(collection(db,'members'), { name, description, photoUrl, createdAt: Date.now() });
      alert('Miembro creado');
    }
    document.getElementById('memberForm').reset();
    loadList();
  }catch(err){ console.error(err); alert('Error guardando: '+err.message); }
}

async function loadList(){
  const listEl = document.getElementById('list');
  listEl.innerHTML = 'Cargando...';
  const items = await fetchMembers('');
  if(!items.length){ listEl.innerHTML = '<li>No hay miembros</li>'; return; }
  listEl.innerHTML = '';
  items.forEach(it=>{
    const li = document.createElement('li');
    li.innerHTML = `<div><strong>${it.name}</strong><div style="font-size:13px;color:#666">${it.description||''}</div></div>
      <div>
        <button data-id="${it.id}" class="editBtn">Editar</button>
        <button data-id="${it.id}" class="delBtn">Borrar</button>
      </div>`;
    listEl.appendChild(li);
  });

  listEl.querySelectorAll('.editBtn').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const id = b.getAttribute('data-id');
      const docRef = doc(db,'members', id);
      const snap = await getDoc(docRef);
      if(snap.exists()){
        const data = snap.data();
        document.getElementById('memberId').value = id;
        document.getElementById('name').value = data.name || '';
        document.getElementById('description').value = data.description || '';
      }
    });
  });

  listEl.querySelectorAll('.delBtn').forEach(b=>{
    b.addEventListener('click', async ()=>{
      if(!confirm('Borrar este miembro?')) return;
      const id = b.getAttribute('data-id');
      try{ await deleteDoc(doc(db,'members',id)); alert('Miembro borrado'); loadList(); }catch(err){ alert('Error borrando: '+err.message); }
    });
  });
}
