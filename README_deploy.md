Familia Cernadas - despliegue rápido
-----------------------------------

Pasos locales:

1) Estructura de carpetas (desde la raíz del repo):
   /css/styles.css
   /img/   -> todas las fotos (nombre exacto: pueden usar photoUrl o nombre en admin)
   /js/firebase.js
   /js/tree.js
   /js/admin.js
   index.html
   admin.html
   firestore.rules

2) Subir imágenes:
   - En admin, marcar 'Tiene foto' y poner 'nombre_archivo.jpg'
   - Sube físicamente ese archivo a /img/ y haz commit/push a GitHub

3) Reglas Firestore: pega firestore.rules en Firebase Console > Firestore > Rules

4) Deploy:
   - Puedes usar Firebase Hosting o GitHub Pages / Cloudflare Pages.
   - Para Firebase Hosting: `firebase deploy` desde la carpeta inicial (tras firebase init).
   - Para GitHub Pages / Cloudflare Pages: sube el repo; asegúrate de que /index.html esté en la raíz del build.

Notas:
- Ya ejecutaste el script fixChildren.html para generar el campo children.
- El sitio público lee la colección 'members' y muestra solo campos públicos (name, birthDate, birthPlace, birthCountry, deathDate, deathPlace, photoUrl).
