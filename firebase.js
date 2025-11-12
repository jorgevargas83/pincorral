// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { 
    getFirestore, collection, onSnapshot, doc, 
    setDoc, deleteDoc, 
    getDoc, updateDoc, arrayUnion, arrayRemove, writeBatch
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { 
    getAuth, 
    signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";


// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyBFeLhhCLU2TUQUJjG8IsfUG3JBTc-xyTM",
    authDomain: "proyectocorralpin.firebaseapp.com",
    projectId: "proyectocorralpin",
    storageBucket: "proyectocorralpin.appspot.com",
    messagingSenderId: "1058204128531",
    appId: "1:1058204128531:web:dd88871038c1a7c3e5362a"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app); 

// --- EXPORTAR MÉTODOS DE BASE DE DATOS MÁS CÓMODOS ---
export { 
    collection, onSnapshot, doc, 
    setDoc, deleteDoc, 
    getDoc, updateDoc, arrayUnion, arrayRemove, writeBatch
};

/**
 * Función de autenticación al iniciar el sistema.
 */
export async function iniciarAutenticacion() {
    try {
        await signInWithEmailAndPassword(auth, "enndels@gmail.com", "123456789");
        console.log("¡Firebase autenticado con éxito!");
        return true;
    } catch (error) {
        console.error("¡Error fatal al autenticar la página!", error.code, error.message);
        return false;
    }
}