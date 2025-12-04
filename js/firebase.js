// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCwL9iZXaPAwFpEkMcsogbXgwitQjZWHx4",
  authDomain: "familia-cernadas.firebaseapp.com",
  projectId: "familia-cernadas",
  storageBucket: "familia-cernadas.appspot.com",
  messagingSenderId: "218976620410",
  appId: "1:218976620410:web:3719cbee4c9dda323790c3",
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
