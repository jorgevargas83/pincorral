// login.js
import { auth, signInWithEmailAndPassword } from './firebase.js';

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const loginMessage = document.getElementById('login-message');
const loginButton = document.getElementById('login-button');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que la página se recargue
    
    const email = emailInput.value;
    const password = passwordInput.value;
    
    loginButton.disabled = true;
    loginButton.textContent = "Verificando...";
    loginMessage.textContent = "";

    try {
        // Usamos la función de Firebase para iniciar sesión
        await signInWithEmailAndPassword(auth, email, password);
        
        // Si tiene éxito, redirigimos a la app principal
        window.location.href = 'index.html';

    } catch (error) {
        // Si falla, mostramos un error
        console.error("Error al iniciar sesión:", error.code);
        
        let mensajeError = "Error al iniciar sesión. Verifica tus datos.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            mensajeError = "Email o contraseña incorrectos.";
        } else if (error.code === 'auth/invalid-email') {
             mensajeError = "El formato del email es incorrecto.";
        }
        
        loginMessage.textContent = mensajeError;
        loginButton.disabled = false;
        loginButton.textContent = "Entrar";
    }
});