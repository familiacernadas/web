/* ==========================================================
   tree.js — Árbol genealógico vertical + zoom + navegación
========================================================== */

/* ------------ 1. DATOS DEL ÁRBOL (EDITA AQUÍ) ------------- */

const family = {
    id: "root",
    name: "Persona Inicial",
    born: "1900",
    died: "1980",
    photo: "img/default.jpg",

    parents: null,    // { father: {...}, mother: {...} }
    children: [
        {
            id: "c1",
            name: "Hijo 1",
            born: "1930",
            photo: "img/default.jpg",
            parents: null,
            children: []
        },
        {
            id: "c2",
            name: "Hijo 2",
            born: "1934",
            photo: "img/default.jpg",
            parents: null,
            children: [
                {
                    id: "n1",
                    name: "Nieto 1",
                    born: "1960",
                    photo: "img/default.jpg",
                    parents: null,
                    children: []
                }
            ]
        }
    ]
};


/* ------------ 2. CONSTRUCCIÓN DEL ÁRBOL ------------------- */

function createNode(person) {
    const box = document.createElement("div");
    box.className = "node-outer";

    let html = `
        <div class="person-box">
            <img src="${person.photo || 'img/default.jpg'}" alt="">
            <div class="person-name">${person.name}</div>
            <div class="person-meta">${person.born || ""} ${person.died ? " - " + person.died : ""}</div>
        </div>
    `;

    // CONTENEDOR DE HIJOS
    if (person.children && person.children.length > 0) {
        const childrenDiv = document.createElement("div");
        childrenDiv.className = "children-row";

        person.children.forEach(child => {
            childrenDiv.appendChild(createNode(child));
        });

        // Conector vertical
        html += `<div class="connector-vertical"></div>`;
        box.innerHTML = html;
        box.appendChild(childrenDiv);

    } else {
        box.innerHTML = html;
    }

    return box;
}


/* ------------ 3. RENDER PRINCIPAL -------------------------- */

function renderTree(rootPerson) {
    const container = document.getElementById("treeContent");
    container.innerHTML = "";
    container.appendChild(createNode(rootPerson));
}


/* ------------ 4. SELECTOR DE PERSONA ------------------------ */

function populateSelect() {
    const select = document.getElementById("selectPerson");
    select.innerHTML = "";

    const list = [];
    (function walk(node) {
        list.push(node);
        if (node.children) node.children.forEach(walk);
    })(family);

    list.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
    });

    select.addEventListener("change", () => {
        const target = list.find(p => p.id === select.value);
        renderTree(target);
    });
}


/* ------------ 5. ZOOM Y PAN -------------------------------- */

let zoom = 1;
const treeContent = document.getElementById("treeContent");
const zoomLabel = document.getElementById("zoomLabel");

function applyZoom() {
    treeContent.style.transform = `scale(${zoom})`;
    zoomLabel.textContent = Math.round(zoom * 100) + "%";
}

document.getElementById("zoomIn").addEventListener("click", () => {
    zoom += 0.1;
    applyZoom();
});

document.getElementById("zoomOut").addEventListener("click", () => {
    zoom = Math.max(0.2, zoom - 0.1);
    applyZoom();
});

document.getElementById("centerTree").addEventListener("click", () => {
    zoom = 1;
    applyZoom();
    document.getElementById("treeContainer").scrollTo({
        top: 0,
        left: 0,
        behavior: "smooth"
    });
});


/* Permitir arrastrar (pan) */
let isDragging = false;
let startX, startY, scrollLeft, scrollTop;

const container = document.getElementById("treeContainer");

container.addEventListener("mousedown", e => {
    isDragging = true;
    container.classList.add("dragging");
    startX = e.pageX - container.offsetLeft;
    startY = e.pageY - container.offsetTop;
    scrollLeft = container.scrollLeft;
    scrollTop = container.scrollTop;
});

container.addEventListener("mouseleave", () => (isDragging = false));
container.addEventListener("mouseup", () => (isDragging = false));

container.addEventListener("mousemove", e => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const y = e.pageY - container.offsetTop;
    const walkX = (x - startX);
    const walkY = (y - startY);
    container.scrollLeft = scrollLeft - walkX;
    container.scrollTop = scrollTop - walkY;
});


/* ------------ 6. NAVEGADOR (UP / DOWN / HOME) --------------- */

document.getElementById("goUp").addEventListener("click", () => {
    alert("Funcionalidad pendiente: subir generación");
});

document.getElementById("goDown").addEventListener("click", () => {
    alert("Funcionalidad pendiente: bajar a descendientes");
});

document.getElementById("goHome").addEventListener("click", () => {
    renderTree(family);
});


/* ------------ 7. INICIO ------------------------------------- */

populateSelect();
renderTree(family);
applyZoom();
