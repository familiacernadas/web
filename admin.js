// admin.js
import { auth, db, storage } from './firebase.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js';
import { collection, getDocs, query, orderBy, addDoc, doc, setDoc, deleteDoc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';
import { ref as sref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js';

function el(id){ return document.getElementById(id); }

function setupAuthUI(){
  const loginBtn = el('loginBtn');
  const logoutBtn = el('logoutBtn');
  const email = el('email');
  const password = el('password');

  if(!loginBtn) return;
  loginBtn.addEventListener('click', async ()=>{
    try{ await signInWithEmailAndPassword(auth, email.value, password.value); }
    catch(e){ alert('Error login: '+e.message); }
  });

  logoutBtn.addEventListener('click', async ()=>{ await signOut(auth); });

  onAuthStateChanged(auth, user=>{
    const authPanel = el('auth');
    const adminPanel = el('adminPanel');
    if(user){
      if(authPanel) authPanel.style.display='none';
      if(adminPanel) adminPanel.style.display='block';
      el('logoutBtn').style.display='inline-block';
      loadList();
    } else {
      if(authPanel) authPanel.style.display='block';
      if(adminPanel) adminPanel.style.display='none';
      el('logoutBtn').style.display='none';
    }
  });

  const form = el('memberForm');
  if(form){
    form.addEventListener('submit', saveMember);
    el('cancelEdit').addEventListener('click', ()=>{
      form.reset();
      el('memberId').value='';
    });
  }
  el('filter').addEventListener('input', ()=> loadList(el('filter').value.trim()));
}

async function fetchMembers(q=''){
  const col = collection(db, 'members');
  const snap = await getDocs(query(col, orderBy('name')));
  const list = [];
  snap.forEach(d=>{
    const data = d.data();
    data.id = d.id;
    list.push(data);
  });
  if(q) return list.filter(x=> (x.name||'').toLowerCase().includes(q.toLowerCase()));
  return list;
}

async function loadList(filterText=''){
  const items = await fetchMembers(filterText);
  populateSelects(items);
  renderList(items);
}

function populateSelects(items){
  ['parent1','parent2','partner'].forEach(selId=>{
    const sel = el(selId);
    if(!sel) return;
    sel.innerHTML = '<option value="">(ninguno)</option>';
    items.forEach(it=>{
      const opt = document.createElement('option');
      opt.value = it.id; opt.textContent = it.name; sel.appendChild(opt);
    });
  });
}

function renderList(items){
  const listEl = el('list'); if(!listEl) return;
  if(!items.length){ listEl.innerHTML = '<li>No hay miembros</li>'; return; }
  listEl.innerHTML = '';
  items.forEach(it=>{
    const li = document.createElement('li');
    li.innerHTML = `<div><strong>${it.name}</strong><div style="font-size:13px;color:#666">${it.birthDate?it.birthDate+' • ':''}${it.description||''}</div></div>
      <div>
        <button data-id="${it.id}" class="editBtn">Editar</button>
        <button data-id="${it.id}" class="delBtn">Borrar</button>
      </div>`;
    listEl.appendChild(li);
  });

  listEl.querySelectorAll('.editBtn').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const id = b.getAttribute('data-id');
      const snap = await getDoc(doc(db,'members', id));
      if(snap.exists()){
        const data = snap.data();
        el('memberId').value = id;
        el('name').value = data.name || '';
        el('birthDate').value = data.birthDate || '';
        el('gender').value = data.gender || '';
        el('description').value = data.description || '';
        el('parent1').value = (data.parents && data.parents[0])?data.parents[0]:'';
        el('parent2').value = (data.parents && data.parents[1])?data.parents[1]:'';
        el('partner').value = (data.partners && data.partners[0])?data.partners[0]:'';
      }
    });
  });

  listEl.querySelectorAll('.delBtn').forEach(b=>{
    b.addEventListener('click', async ()=>{
      if(!confirm('Borrar este miembro?')) return;
      const id = b.getAttribute('data-id');
      try{
        await removeMemberAndReferences(id);
        alert('Miembro borrado');
        loadList();
      }catch(err){ alert('Error borrando: '+err.message); }
    });
  });
}

async function saveMember(e){
  e.preventDefault();
  const id = el('memberId').value || null;
  const name = el('name').value.trim(); if(!name){ alert('El nombre es obligatorio'); return; }
  const birthDate = el('birthDate').value || '';
  const gender = el('gender').value || '';
  const description = el('description').value.trim();
  const parent1 = el('parent1').value || null;
  const parent2 = el('parent2').value || null;
  const partner = el('partner').value || null;
  const photoFile = el('photo').files[0];

  try{
    let photoUrl = null;
    if(photoFile){
      const storageRef = sref(storage, 'photos/'+Date.now()+'_'+photoFile.name);
      const uploaded = await uploadBytes(storageRef, photoFile);
      photoUrl = await getDownloadURL(uploaded.ref);
    }

    const docData = {
      name, birthDate, gender, description,
      parents: [...(parent1? [parent1]: []), ...(parent2? [parent2]: [])],
      partners: partner? [partner] : [],
      photoUrl: photoUrl || null,
      createdAt: Date.now()
    };

    if(id){
      await setDoc(doc(db,'members',id), docData, { merge: true });
      await updateReciprocalRelations(id, docData);
      alert('Miembro actualizado');
    } else {
      const newRef = await addDoc(collection(db,'members'), docData);
      await updateReciprocalRelations(newRef.id, docData);
      alert('Miembro creado');
    }
    el('memberForm').reset();
    loadList();
  }catch(err){ console.error(err); alert('Error guardando: '+err.message); }
}

async function removeMemberAndReferences(memberId){
  await deleteDoc(doc(db,'members',memberId));
  const all = await fetchMembers('');
  for(const m of all){
    let changed=false;
    const updates = {};
    if(m.parents && m.parents.includes(memberId)){
      updates.parents = m.parents.filter(x=> x !== memberId); changed=true;
    }
    if(m.children && m.children.includes(memberId)){
      updates.children = m.children.filter(x=> x !== memberId); changed=true;
    }
    if(m.partners && m.partners.includes(memberId)){
      updates.partners = m.partners.filter(x=> x !== memberId); changed=true;
    }
    if(changed) await updateDoc(doc(db,'members', m.id), updates);
  }
}

async function updateReciprocalRelations(memberId, docData){
  const parents = docData.parents || [];
  const partners = docData.partners || [];

  for(const pid of parents){
    const pSnap = await getDoc(doc(db,'members', pid));
    if(pSnap.exists()){
      const pdata = pSnap.data();
      const children = pdata.children || [];
      if(!children.includes(memberId)){
        children.push(memberId);
        await updateDoc(doc(db,'members', pid), { children });
      }
    }
  }

  const prevSnap = await getDoc(doc(db,'members', memberId));
  if(prevSnap.exists()){
    const prev = prevSnap.data();
    const prevParents = prev.parents || [];
    for(const oldPid of prevParents){
      if(!parents.includes(oldPid)){
        const oldSnap = await getDoc(doc(db,'members', oldPid));
        if(oldSnap.exists()){
          const oldChildren = (oldSnap.data().children || []).filter(x=> x !== memberId);
          await updateDoc(doc(db,'members', oldPid), { children: oldChildren });
        }
      }
    }
  }

  for(const pid of partners){
    const pSnap = await getDoc(doc(db,'members', pid));
    if(pSnap.exists()){
      const plist = pSnap.data().partners || [];
      if(!plist.includes(memberId)){
        plist.push(memberId);
        await updateDoc(doc(db,'members', pid), { partners: plist });
      }
    }
  }
  if(prevSnap.exists()){
    const prev = prevSnap.data();
    const prevPartners = prev.partners || [];
    for(const old of prevPartners){
      if(!partners.includes(old)){
        const oldSnap = await getDoc(doc(db,'members', old));
        if(oldSnap.exists()){
          const newP = (oldSnap.data().partners || []).filter(x=> x !== memberId);
          await updateDoc(doc(db,'members', old), { partners: newP });
        }
      }
    }
  }
}

// init
setupAuthUI();
