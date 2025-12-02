// js/admin.js (versión final)
import { app, db, auth } from './firebase.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs, addDoc, doc, setDoc, deleteDoc, getDoc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const $ = id => document.getElementById(id);

// Auth handlers
$('loginBtn').addEventListener('click', async ()=>{
  try{ await signInWithEmailAndPassword(auth, $('email').value, $('password').value); }
  catch(e){ alert('Error login: '+e.message); }
});
$('logoutBtn')?.addEventListener('click', async ()=> await signOut(auth));

// show/hide photo file input
$('photoEnabled').addEventListener('change', e => {
  $('photoFileContainer').style.display = e.target.checked ? 'block' : 'none';
});

// auth state
onAuthStateChanged(auth, user => {
  if(user){
    $('loginSection').style.display = 'none';
    $('adminPanel').style.display = 'block';
    $('logoutBtn').style.display = 'inline-block';
    loadMembers();
  } else {
    $('loginSection').style.display = 'block';
    $('adminPanel').style.display = 'none';
    $('logoutBtn').style.display = 'none';
  }
});

// fetch
async function fetchAll(q=''){
  const snap = await getDocs(query(collection(db,'members'), orderBy('nombre')));
  const list = [];
  snap.forEach(d => { const data = d.data(); data.id = d.id; list.push(data); });
  if(q) return list.filter(x => ((x.nombre||'') + ' ' + (x.apellidos||'')).toLowerCase().includes(q.toLowerCase()));
  return list;
}

async function loadMembers(filter=''){
  const items = await fetchAll(filter);
  // populate selects
  const pareja = $('pareja'); pareja.innerHTML = '<option value="">(ninguno)</option>';
  const hijos = $('hijos'); hijos.innerHTML = '';
  const memberSelect = $('memberSelect'); memberSelect.innerHTML = '<option value="">Nuevo miembro</option>';
  items.forEach(it=>{
    const opt = document.createElement('option'); opt.value = it.id; opt.textContent = `${it.nombre} ${it.apellidos}`;
    pareja.appendChild(opt);
    hijos.appendChild(opt.cloneNode(true));
    memberSelect.appendChild(opt.cloneNode(true));
  });
  // render list
  const listEl = $('list'); listEl.innerHTML = '';
  if(!items.length) { listEl.innerHTML = '<li>No hay miembros</li>'; return; }
  items.forEach(it=>{
    const li = document.createElement('li');
    li.innerHTML = `<strong>${it.nombre} ${it.apellidos}</strong><div><button class="edit" data-id="${it.id}">Editar</button> <button class="del" data-id="${it.id}">Borrar</button></div>`;
    listEl.appendChild(li);
  });
  // attach edit/delete handlers
  listEl.querySelectorAll('.edit').forEach(b => b.addEventListener('click', async e=>{
    const id = e.target.dataset.id;
    const snap = await getDoc(doc(db,'members',id));
    if(!snap.exists()) return alert('No existe');
    const d = snap.data();
    $('memberId').value = id;
    $('nombre').value = d.nombre || '';
    $('apellidos').value = d.apellidos || '';
    $('paisNacimiento').value = d.paisNacimiento || '';
    $('lugarNacimiento').value = d.lugarNacimiento || '';
    $('anoNacimiento').value = d.anoNacimiento || '';
    $('fechaNacimiento').value = d.fechaNacimiento || '';
    $('fechaMatrimonio').value = d.fechaMatrimonio || '';
    $('lugarMatrimonio').value = d.lugarMatrimonio || '';
    $('mailContacto').value = d.mailContacto || '';
    $('historiaVida').value = d.historiaVida || '';
    $('oficio').value = d.oficio || '';
    $('aficiones').value = d.aficiones || '';
    $('anoFallecimiento').value = d.anoFallecimiento || '';
    $('fechaFallecimiento').value = d.fechaFallecimiento || '';
    $('lugarFallecimiento').value = d.lugarFallecimiento || '';
    $('causaFallecimiento').value = d.causaFallecimiento || '';
    $('photoEnabled').checked = !!d.photo;
    $('photoFile').value = d.photo ? d.photo.replace(/^img\//,'') : '';
    $('photoFileContainer').style.display = d.photo ? 'block' : 'none';
    $('pareja').value = d.pareja || '';
    [...$('hijos').options].forEach(o => o.selected = (d.hijos||[]).includes(o.value));
  }));

  listEl.querySelectorAll('.del').forEach(b => b.addEventListener('click', async e=>{
    if(!confirm('Borrar?')) return;
    const id = e.target.dataset.id;
    await deleteDoc(doc(db,'members',id));
    await cleanReferences(id);
    loadMembers();
  }));
}

// filter
$('filter').addEventListener('input', ()=> loadMembers($('filter').value.trim()));

// cancel
$('cancelBtn').addEventListener('click', ()=> {
  $('memberForm').reset();
  $('memberId').value = '';
  $('photoFileContainer').style.display = 'none';
});

// save
$('memberForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const id = $('memberId').value || null;
  const payload = {
    nombre: $('nombre').value.trim(),
    apellidos: $('apellidos').value.trim(),
    paisNacimiento: $('paisNacimiento').value || null,
    lugarNacimiento: $('lugarNacimiento').value || null,
    anoNacimiento: $('anoNacimiento').value ? Number($('anoNacimiento').value) : null,
    fechaNacimiento: $('fechaNacimiento').value || null,
    fechaMatrimonio: $('fechaMatrimonio').value || null,
    lugarMatrimonio: $('lugarMatrimonio').value || null,
    mailContacto: $('mailContacto').value || null,
    historiaVida: $('historiaVida').value || null,
    oficio: $('oficio').value || null,
    aficiones: $('aficiones').value || null,
    anoFallecimiento: $('anoFallecimiento').value ? Number($('anoFallecimiento').value) : null,
    fechaFallecimiento: $('fechaFallecimiento').value || null,
    lugarFallecimiento: $('lugarFallecimiento').value || null,
    causaFallecimiento: $('causaFallecimiento').value || null,
    pareja: $('pareja').value || null,
    hijos: [...$('hijos').options].filter(o=>o.selected).map(o=>o.value),
    updatedAt: Date.now()
  };
  // photo logic
  if($('photoEnabled').checked){
    const fname = $('photoFile').value.trim();
    if(!fname){ return alert('Introduce nombre de archivo de la foto (ej: nombre_apellidos.jpg)'); }
    payload.photo = 'img/' + fname;
  } else {
    payload.photo = null;
  }

  try{
    if(id){
      await setDoc(doc(db,'members',id), payload, { merge:true });
      await syncReciprocal(id, payload);
      alert('Miembro actualizado');
    } else {
      const ref = await addDoc(collection(db,'members'), payload);
      await syncReciprocal(ref.id, payload);
      alert('Miembro creado');
      $('memberId').value = ref.id;
    }
    $('memberForm').reset();
    $('photoFileContainer').style.display = 'none';
    loadMembers();
  } catch(err){ console.error(err); alert('Error: '+err.message); }
});

// clean refs
async function cleanReferences(removedId){
  const all = await fetchAll('');
  for(const m of all){
    const updates = {};
    let changed=false;
    if(m.pareja === removedId){ updates.pareja = null; changed=true; }
    if(m.hijos && m.hijos.includes(removedId)){ updates.hijos = m.hijos.filter(x=> x !== removedId); changed=true; }
    if(changed) await updateDoc(doc(db,'members', m.id), updates);
  }
}

// reciprocity: ensure partner reciprocates and children parentage is coherent
async function syncReciprocal(memberId, payload){
  // pareja reciprocity: set partner.pareja = memberId if empty or different
  if(payload.pareja){
    const pSnap = await getDoc(doc(db,'members', payload.pareja));
    if(pSnap.exists()){
      const pdata = pSnap.data();
      if(pdata.pareja !== memberId){
        await updateDoc(doc(db,'members', payload.pareja), { pareja: memberId });
      }
    }
  }
  // For children we keep children lists on parents only. If you want parent pointers in child docs, handle manually.
}

/**
 * Genera lista de miembros con foto marcada pero sin archivo en /img.
 * El usuario debe subir manualmente el archivo al repositorio GitHub.
 */

async function checkMissingPhotos() {
    const imgDir = "img/";

    const membersSnapshot = await db.collection("members").get();
    const members = membersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log("📸 Verificando imágenes faltantes...");

    const missing = [];

    for (const m of members) {
        if (m.hasPhoto) {
            // Generar nombre esperado del archivo
            const fileName =
                `${m.nombre.replace(/ /g, "_")}_${m.apellidos.replace(/ /g, "_")}.jpg`
                    .toLowerCase();

            const imagePath = `${imgDir}${fileName}`;

            // Verificar si el archivo existe en GitHub Hosting
            try {
                const res = await fetch(imagePath, { method: "HEAD" });
                if (!res.ok) {
                    missing.push({ member: m, fileName, imagePath });
                }
            } catch (err) {
                missing.push({ member: m, fileName, imagePath });
            }
        }
    }

    if (missing.length === 0) {
        console.log("✅ Todas las fotografías están subidas correctamente.");
    } else {
        console.log("⚠️ FOTOS FALTANTES:");
        missing.forEach(item => {
            console.log(
                `➡️ SUBIR: ${item.fileName} (para ${item.member.nombre} ${item.member.apellidos})`
            );
        });
    }
}

