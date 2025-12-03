// js/admin.js
import { db, auth } from "./firebase.js";
import { collection, getDocs, addDoc, setDoc, doc, deleteDoc, getDoc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const $ = id => document.getElementById(id);

// auth
$('loginBtn').addEventListener('click', async ()=>{
  try{
    await signInWithEmailAndPassword(auth, $('email').value, $('password').value);
  }catch(e){ alert('Error login: '+e.message); }
});

$('logoutBtn').addEventListener('click', async ()=>{
  await signOut(auth);
});

onAuthStateChanged(auth, user => {
  if(user){
    $('authSection')?.setAttribute('style','display:none');
    $('adminPanel').style.display = 'block';
    $('logoutBtn').style.display = 'inline-block';
    loadAll();
  } else {
    $('authSection')?.setAttribute('style','display:block');
    $('adminPanel').style.display = 'none';
    $('logoutBtn').style.display = 'none';
  }
});

// load members for selects and list
async function loadAll(){
  const snap = await getDocs(query(collection(db,'members'), orderBy('name')));
  const members = [];
  snap.forEach(d => members.push({ id: d.id, ...d.data() }));

  populateSelects(members);
  renderList(members);
}

function populateSelects(members){
  const parents = $('parents'); const partners = $('partners'); const children = $('children');
  parents.innerHTML = ''; partners.innerHTML = ''; children.innerHTML = '';
  members.forEach(m=>{
    const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name;
    parents.appendChild(opt.cloneNode(true));
    partners.appendChild(opt.cloneNode(true));
    children.appendChild(opt.cloneNode(true));
  });
  $('memberId').value = '';
  $('memberForm').reset();
}

function renderList(members){
  const div = $('memberList'); div.innerHTML = '';
  if(!members.length) { div.innerHTML = '<p>No hay miembros</p>'; return; }
  members.forEach(m=>{
    const el = document.createElement('div'); el.style.padding='8px'; el.style.borderBottom='1px solid #eee';
    el.innerHTML = `<strong>${m.name}</strong> <small style="color:#666">(${m.id})</small>
      <div style="margin-top:6px">
        <button data-id="${m.id}" class="editBtn">Editar</button>
        <button data-id="${m.id}" class="delBtn">Borrar</button>
      </div>`;
    div.appendChild(el);
  });

  div.querySelectorAll('.editBtn').forEach(b => b.addEventListener('click', async (e)=>{
    const id = e.target.dataset.id;
    const snap = await getDoc(doc(db,'members',id));
    const d = snap.data();
    $('memberId').value = id;
    $('name').value = d.name || '';
    $('birthDate').value = d.birthDate || '';
    $('birthCountry').value = d.birthCountry || '';
    $('birthPlace').value = d.birthPlace || '';
    $('deathDate').value = d.deathDate || '';
    $('deathPlace').value = d.deathPlace || '';
    $('hasPhoto').checked = !!d.photoUrl;
    $('photoFile').value = d.photoUrl ? d.photoUrl.replace(/^img\//,'') : '';

    // select parents / partners / children
    [...$('parents').options].forEach(o => o.selected = (d.parents||[]).includes(o.value));
    [...$('partners').options].forEach(o => o.selected = (d.partners||[]).includes(o.value));
    [...$('children').options].forEach(o => o.selected = (d.children||[]).includes(o.value));
  }));

  div.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', async e=>{
    const id = e.target.dataset.id;
    if(!confirm('Eliminar miembro?')) return;
    await deleteDoc(doc(db,'members',id));
    // optionally, remove references: children/parents/partners left as-is
    loadAll();
  }));
}

// save
$('memberForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const id = $('memberId').value || null;
  const data = {
    name: $('name').value.trim(),
    birthDate: $('birthDate').value || '',
    birthCountry: $('birthCountry').value || '',
    birthPlace: $('birthPlace').value || '',
    deathDate: $('deathDate').value || '',
    deathPlace: $('deathPlace').value || '',
    parents: [...$('parents').options].filter(o=>o.selected).map(o=>o.value),
    partners: [...$('partners').options].filter(o=>o.selected).map(o=>o.value),
    children: [...$('children').options].filter(o=>o.selected).map(o=>o.value),
    createdAt: Date.now()
  };

  if($('hasPhoto').checked){
    const f = $('photoFile').value.trim();
    data.photoUrl = f ? 'img/'+f : null;
  } else {
    data.photoUrl = null;
  }

  try{
    if(id){
      await setDoc(doc(db,'members',id), data, { merge:true });
      alert('Actualizado');
    } else {
      await addDoc(collection(db,'members'), data);
      alert('Creado');
    }
    loadAll();
    $('memberForm').reset();
  }catch(err){
    console.error(err); alert('Error: '+err.message);
  }
});

// cancel
$('cancelBtn').addEventListener('click', ()=> { $('memberForm').reset(); $('memberId').value=''; });

// check missing photos
$('checkPhotosBtn').addEventListener('click', async ()=>{
  $('photoLog').textContent = 'Comprobando...';
  const snap = await getDocs(collection(db,'members'));
  const missing = [];
  const members = [];
  snap.forEach(d=> members.push({ id:d.id, ...d.data() }));
  for(const m of members){
    if(m.photoUrl){
      try{
        const res = await fetch(m.photoUrl, { method:'HEAD' });
        if(!res.ok) missing.push({ name:m.name, file:m.photoUrl });
      }catch(e){ missing.push({ name:m.name, file:m.photoUrl }); }
    }
  }
  if(!missing.length) $('photoLog').textContent = '✅ Todas las fotos están presentes.';
  else $('photoLog').textContent = 'Fotos faltantes:\n' + missing.map(x=>`${x.file} → ${x.name}`).join('\n');
});
