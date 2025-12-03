// js/tree.js
// funciones para construir el árbol público (sólo usa datos públicos)

function yearFrom(dateStr){
  if(!dateStr) return "";
  // intenta extraer año de "YYYY" o "YYYY-MM-DD"
  const m = dateStr.match(/(\d{4})/);
  return m ? m[1] : dateStr;
}

function safe(x){ return x || ""; }

function publicFields(member){
  return {
    id: member.id,
    name: safe(member.name),
    birthCountry: safe(member.birthCountry),
    birthPlace: safe(member.birthPlace),
    birthYear: yearFrom(member.birthDate),
    deathYear: yearFrom(member.deathDate),
    deathPlace: safe(member.deathPlace),
    photoUrl: member.photoUrl || null,
    parents: Array.isArray(member.parents) ? member.parents : [],
    partners: Array.isArray(member.partners) ? member.partners : [],
    children: Array.isArray(member.children) ? member.children : []
  };
}

function buildPersonHtml(m){
  const photo = m.photoUrl ? m.photoUrl : ( `img/${m.name.replace(/\s+/g,'_')}.jpg` );
  const imgTag = m.photoUrl || true ? `<img src="${photo}" alt="${m.name}">` : "";
  return `
    <div class="person-box" data-id="${m.id}">
      ${imgTag}
      <div class="person-name">${m.name}</div>
      <div class="person-meta">
        ${m.birthCountry ? m.birthCountry + ' • ' : ''}${m.birthPlace ? m.birthPlace : ''}<br>
        ${m.birthYear ? 'Nac: ' + m.birthYear : ''} ${m.deathYear ? ' • Fal: ' + m.deathYear : ''}<br>
        ${m.deathPlace ? m.deathPlace : ''}
      </div>
    </div>
  `;
}

// build couple (person + first partner) — if multiple partners, show first only in same box
function buildPairHtml(membersMap, member){
  const partnerId = (member.partners && member.partners[0]) ? member.partners[0] : null;
  if(partnerId && membersMap[partnerId]){
    const partner = publicFields(membersMap[partnerId]);
    return `<div class="pair">${buildPersonHtml(publicFields(member))}${buildPersonHtml(partner)}</div>`;
  } else {
    return `<div class="pair">${buildPersonHtml(publicFields(member))}</div>`;
  }
}

// recursive build: returns HTML for subtree starting at memberId up to depth
export function renderSubtree(memberId, membersMap, depth){
  if(!membersMap[memberId] || depth < 1) return "";
  const member = membersMap[memberId];
  const nodeHtml = `<div class="node-outer" id="node-${memberId}">${buildPairHtml(membersMap, member)}`;

  // children row
  let kidsHtml = "";
  const kids = member.children || [];
  if(kids.length && depth > 1){
    const childPieces = kids.map(cid => renderSubtree(cid, membersMap, depth - 1)).join("");
    kidsHtml = `<div class="connector-vertical"></div><div class="children-row">${childPieces}</div>`;
  }

  return nodeHtml + kidsHtml + `</div>`;
}

// helper to render a forest from a set of roots
export function renderForest(rootIds, membersMap, depth){
  return rootIds.map(rid => renderSubtree(rid, membersMap, depth)).join("");
}
