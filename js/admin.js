// admin.js - usa /js/firebase.js (ya existente)
import { app, db, auth } from './firebase.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs, addDoc, doc, setDoc, deleteDoc, getDoc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const el = id => document.getElementById(id);

// Auth UI
el('loginBtn').addEventListener('click', async () => {
  try {
    await signInWithEmailAndPassword(auth, el('email').value, el('password').value);
  } catch (e) { alert('Error login: ' + e.message); }
});
el('logoutBtn').addEventListener('click', async ()=> { await signOut(auth); });

// photo checkbox toggle
el('photoEnabled').addEventListener('change', (e)=>{
  el('photoFileContainer').style.display = e.target.checked ? 'block' : 'none';
});

// on auth state
onAuthStateChanged(auth, user => {
  if (user) {
    el('loginSection').style.display = 'none';
    el('adminPanel').style.display = 'block';
    el('logoutBtn').style.display = 'inline-block';
    loadList();
  } else {
    el('loginSection').style.display = 'block';
    el('adminPanel').style.display = 'none';
    el('logoutBtn').style.display = 'none';
  }
});

// fetch members
async function fetchMembers(q='') {
  const col = collection(db, 'members');
  const snap = await getDocs(query(col, orderBy('nombre')));
  const arr = [];
  snap.forEach(d => { const data = d.data(); data.id = d.id; arr.push(data); });
  if (q) return arr.filter(x => ( (x.nombre||'') + ' ' + (x.apellidos||'') ).toLowerCase().includes(q.toLowerCase()));
  return arr;
}

async function loadList(filterText='') {
  const items = await fetchMembers(filterText);
  populateSelects(items);
  renderList(items);
}

function populateSelects(items){
  const pareja = el('pareja');
  const hijos = el('hijos');
  pareja.innerHTML = '<option value="">(ninguno)</option>';
  hijos.innerHTML = '';
  el('memberSelect').innerHTML = '<option value="">Nuevo miembro</option>';

  items.forEach(it=>{
    const opt = document.createElement('option'); opt.value = it.id; opt.textContent = (it.nombre||'') + ' ' + (it.apellidos||'');
    pareja.appendChild(opt);
    const opt2 = opt.cloneNode(true);
    hijos.appendChild(opt2);
    const opt3 = opt.cloneNode(true);
    el('memberSelect').appendChild(opt3);
  });
}

function renderList(items){
  const list = el('list'); list.innerHTML = '';
  if(!items.length){ list.innerHTML = '<li>No hay miembros</li>'; return; }
  items.forEach(it=>{
    const li = document.createElement('li');
    li.innerHTML = `<strong>${it.nombre||''} ${it.apellidos||''}</strong> <span class="muted">${it.paisNacimiento?(' • '+it.paisNacimiento):''}</span>
      <div><button class="edit" data-id="${it.id}">Editar</button> <button class="del" data-id="${it.id}">Borrar</button></div>`;
    list.appendChild(li);
  });

  list.querySelectorAll('.edit').forEach(b=> b.addEventListener('click', async (e)=>{
    const id = e.target.dataset.id;
    const snap = await getDoc(doc(db,'members',id));
    if(!snap.exists()) return alert('No existe');
    const d = snap.data();
    el('memberId').value = id;
    el('nombre').value = d.nombre || '';
    el('apellidos').value = d.apellidos || '';
    el('paisNacimiento').value = d.paisNacimiento || '';
    el('lugarNacimiento').value = d.lugarNacimiento || '';
    el('anoNacimiento').value = d.anoNacimiento || '';
    el('fechaNacimiento').value = d.fechaNacimiento || '';
    el('fechaMatrimonio').value = d.fechaMatrimonio || '';
    el('lugarMatrimonio').value = d.lugarMatrimonio || '';
    el('mailContacto').value = d.mailContacto || '';
    el('historiaVida').value = d.historiaVida || '';
    el('oficio').value = d.oficio || '';
    el('aficiones').value = d.aficiones || '';
    el('anoFallecimiento').value = d.anoFallecimiento || '';
    el('fechaFallecimiento').value = d.fechaFallecimiento || '';
    el('lugarFallecimiento').value = d.lugarFallecimiento || '';
    el('causaFallecimiento').value = d.causaFallecimiento || '';
    el('photoEnabled').checked = !!d.photo;
    el('photoFile').value = d.photo ? d.photo.replace(/^img\//,'') : '';
    el('photoFileContainer').style.display = d.photo ? 'block' : 'none';
    el('pareja').value = d.pareja || '';
    // select hijos
    [...el('hijos').options].forEach(o => o.selected = (d.hijos||[]).includes(o.value));
  }));

  list.querySelectorAll('.del').forEach(b=> b.addEventListener('click', async (e)=>{
    if(!confirm('Borrar este miembro?')) return;
    const id = e.target.dataset.id;
    await deleteDoc(doc(db,'members',id));
    // clean references
    await cleanReferences(id);
    loadList();
  }));
}

el('filter').addEventListener('input', ()=> loadList(el('filter').value.trim()));

// Cancel button
el('cancelBtn').addEventListener('click', ()=> {
  el('memberForm').reset();
  el('memberId').value = '';
  el('photoFileContainer').style.display = 'none';
});

// Save form
el('memberForm').addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const id = el('memberId').value || null;
  const nombre = el('nombre').value.trim();
  const apellidos = el('apellidos').value.trim();
  if(!nombre || !apellidos) return alert('Nombre y apellidos obligatorios');

  const payload = {
    nombre,
    apellidos,
    paisNacimiento: el('paisNacimiento').value || null,
    lugarNacimiento: el('lugarNacimiento').value || null,
    anoNacimiento: el('anoNacimiento').value ? Number(el('anoNacimiento').value) : null,
    fechaNacimiento: el('fechaNacimiento').value || null,
    fechaMatrimonio: el('fechaMatrimonio').value || null,
    lugarMatrimonio: el('lugarMatrimonio').value || null,
    mailContacto: el('mailContacto').value || null,
    historiaVida: el('historiaVida').value || null,
    oficio: el('oficio').value || null,
    aficiones: el('aficiones').value || null,
    anoFallecimiento: el('anoFallecimiento').value ? Number(el('anoFallecimiento').value) : null,
    fechaFallecimiento: el('fechaFallecimiento').value || null,
    lugarFallecimiento: el('lugarFallecimiento').value || null,
    causaFallecimiento: el('causaFallecimiento').value || null,
    pareja: el('pareja').value || null,
    hijos: [...el('hijos').options].filter(o=>o.selected).map(o=>o.value),
    updatedAt: Date.now()
  };

  // photo logic: only store path to img if enabled + filename provided
  if (el('photoEnabled').checked) {
    const fname = el('photoFile').value.trim();
    if (!fname) return alert('Marca el nombre del archivo de la foto (ej: nombre_apellidos.jpg)');
    payload.photo = 'img/' + fname;
  } else {
    payload.photo = null;
  }

  try {
    if (id) {
      await setDoc(doc(db,'members',id), payload, { merge: true });
      await syncReciprocal(id, payload);
      alert('Miembro actualizado');
    } else {
      const ref = await addDoc(collection(db,'members'), payload);
      await syncReciprocal(ref.id, payload);
      alert('Miembro creado');
    }
    el('memberForm').reset();
    el('memberId').value = '';
    el('photoFileContainer').style.display = 'none';
    loadList();
  } catch (err) { console.error(err); alert('Error: '+err.message); }
});

// Clean references when delete
async function cleanReferences(removedId){
  const all = await fetchMembers('');
  for(const m of all){
    const updates = {};
    let changed = false;
    if(m.pareja === removedId){ updates.pareja = null; changed = true; }
    if(m.hijos && m.hijos.includes(removedId)){ updates.hijos = m.hijos.filter(x=> x !== removedId); changed = true; }
    if(changed) await updateDoc(doc(db,'members',m.id), updates);
  }
}

// sync reciprocal parents/children/partners (simple client-side)
async function syncReciprocal(memberId, payload){
  // ensure parents have this member as child if parents field used (we use hijos/pareja method here)
  // For our schema we maintain pareja and hijos only; if hijo lists parents indirectly they can be set via UI.
  // We will ensure pareja reciprocity:
  const partners = payload.pareja ? [payload.pareja] : [];
  // add member to partner.pareja? we will set partner.pareja = memberId only if empty (optional)
  for(const pid of partners){
    const pSnap = await getDoc(doc(db,'members',pid));
    if(pSnap.exists()){
      const pdata = pSnap.data();
      // if partner not reciprocated, set field partners? Here we keep single pareja field: set to memberId if empty
      if(!pdata.pareja || pdata.pareja !== memberId){
        await updateDoc(doc(db,'members', pid), { pareja: memberId });
      }
    }
  }

  // For hijos: ensure each child has parent references only if you track parent fields. We keep hijos on parent only.
}

