// ganado_manager.js

// --- 1. IMPORTAR FUNCIONES Y MÓDULOS ---
// ... (mantenemos las importaciones)
import { 
    iniciarAutenticacion, db, 
    collection, onSnapshot, doc, 
    setDoc, deleteDoc, 
    updateDoc, arrayUnion, arrayRemove, writeBatch
} from './firebase.js'; 

// --- 2. REFERENCIAS A ELEMENTOS DEL HTML ---
// ... (mantenemos todas las referencias)
const listaPendientesUI = document.getElementById('lista-pendientes');
const cargandoPendientesUI = document.getElementById('cargando-pendientes');

// CAMBIOS: Ahora el formulario está en un modal
const modalGanadoUI = document.getElementById('modal-ganado'); 
const formularioTituloUI = document.getElementById('formulario-titulo');
const btnGuardar = document.getElementById('btn-guardar-modal'); 
const btnCancelar = document.getElementById('btn-cancelar-modal'); 

const inventarioUI = document.getElementById('lista-inventario');
const cargandoInventarioUI = document.getElementById('cargando-inventario');
const selectEmbarazada = document.getElementById('form-embarazada');
const campoFechaEstimada = document.getElementById('campo-fecha-estimada');
const inputUltimoParto = document.getElementById('form-ultimo-parto');
const inputFechaEstimada = document.getElementById('form-estimada-parto');
const inputBuscador = document.getElementById('input-buscador');
const selectSexo = document.getElementById('form-sexo');
const camposHembraUI = document.getElementById('campos-hembra');
const inputPartos = document.getElementById('form-partos');
const campoEstadoMacho = document.getElementById('campo-estado-macho');
const selectEstadoMacho = document.getElementById('form-estado-macho');
const selectFiltroSexo = document.getElementById('select-filtro-sexo');
const listaPronosticoUI = document.getElementById('lista-pronostico');
const cargandoPronosticoUI = document.getElementById('cargando-pronostico');
const listaLotesUI = document.getElementById('lista-lotes');
const cargandoLotesUI = document.getElementById('cargando-lotes');
const btnCrearLote = document.getElementById('btn-crear-lote');
const inputLoteNombre = document.getElementById('lote-nombre');
const selectLoteDuracion = document.getElementById('lote-duracion');
const loteFechaInicioUI = document.getElementById('lote-fecha-inicio');
const loteFechaVentaEstUI = document.getElementById('lote-fecha-venta-est');

// REFERENCIAS NUEVAS/MODIFICADAS
const inputFechaNacimiento = document.getElementById('form-fecha-nacimiento');
const selectEstadoHembra = document.getElementById('form-estado-hembra');
const campoPromedioLecheUI = document.getElementById('campo-promedio-leche'); 
const inputPromedioLeche = document.getElementById('form-promedio-leche');

// REFERENCIAS PARA NUEVOS REPORTES
const listaDescansoUI = document.getElementById('lista-descanso');
const cargandoDescansoUI = document.getElementById('cargando-descanso');
const listaDescarteUI = document.getElementById('lista-descarte');
const cargandoDescarteUI = document.getElementById('cargando-descarte');

// Elementos para el Modal de Asignación
const modalAsignarLoteUI = document.getElementById('modal-asignar-lote');
const uidAAsignarUI = document.getElementById('uid-a-asignar');
const listaLotesModalUI = document.getElementById('lista-lotes-modal');
const btnCerrarModal = document.getElementById('btn-cerrar-modal');

// Elementos para el Modal de Detalle del Lote
const modalDetalleLoteUI = document.getElementById('modal-detalle-lote');
const detalleLoteNombreUI = document.getElementById('detalle-lote-nombre');
const detalleLoteIdUI = document.getElementById('detalle-lote-id');
const detalleStatsCantidadUI = document.getElementById('detalle-stats-cantidad');
const detalleStatsPesoUI = document.getElementById('detalle-stats-peso');
const detalleStatsEdadUI = document.getElementById('detalle-stats-edad');
const detalleLoteAnimalesUI = document.getElementById('detalle-lote-animales');
const btnCerrarDetalleModal = document.getElementById('btn-cerrar-detalle-modal');
const btnVenderLote = document.getElementById('btn-vender-lote');
const btnAbrirAsignacionLote = document.getElementById('btn-abrir-asignacion-lote');

// Variables globales
let uidsDeGanado = new Set();
let inventarioCache = []; 
let lotesCache = []; 
let uidTemporalParaAsignacion = null; 
let loteActualDetalle = null; 

// --- UTILIDADES DE FECHA ---
function formatearFecha(fechaStr) {
    if (!fechaStr) return 'N/A';
    try {
        const date = new Date(fechaStr + 'T00:00:00'); 
        if (isNaN(date)) return 'Fecha inválida';
        return date.toLocaleDateString('es-GT', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch (e) {
        return 'N/A';
    }
}

/**
 * Calcula la diferencia de días entre la fecha de inicio y la fecha actual.
 * @param {string} fechaInicioStr - Fecha de inicio en formato YYYY-MM-DD.
 * @returns {number} Número de días transcurridos.
 */
function diasTranscurridos(fechaInicioStr) {
    if (!fechaInicioStr) return Infinity;
    try {
        const hoy = new Date();
        const fechaInicio = new Date(fechaInicioStr + 'T00:00:00');
        if (isNaN(fechaInicio)) return Infinity;
        
        const diffTime = hoy - fechaInicio;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    } catch (e) {
        return Infinity;
    }
}

/**
 * Calcula la fecha óptima para la siguiente concepción/parto (90 días post-parto)
 */
function calcularFechaOptima(ultimoPartoStr, diasDescanso = 90) {
    if (!ultimoPartoStr) return null;
    try {
        const dateParto = new Date(ultimoPartoStr + 'T00:00:00');
        if (isNaN(dateParto)) return null;

        // Sumar los días de descanso (IVE Ideal - 280 días de gestación)
        dateParto.setDate(dateParto.getDate() + diasDescanso);
        
        return dateParto.toISOString().split('T')[0];
    } catch (e) {
        return null;
    }
}

/**
 * Calcula la edad del animal a partir de la fecha de nacimiento.
 * @param {string} fechaNacimientoStr - Fecha de nacimiento en formato YYYY-MM-DD.
 * @returns {{anos: number, texto: string}}
 */
function calcularEdad(fechaNacimientoStr) {
    if (!fechaNacimientoStr) return { anos: 0, texto: 'Edad Desconocida' };

    const hoy = new Date();
    const fechaNac = new Date(fechaNacimientoStr + 'T00:00:00'); // Asegura zona horaria
    
    if (isNaN(fechaNac)) return { anos: 0, texto: 'Fecha Inválida' };

    let anos = hoy.getFullYear() - fechaNac.getFullYear();
    let meses = hoy.getMonth() - fechaNac.getMonth();
    let dias = hoy.getDate() - fechaNac.getDate();

    // Ajuste si aún no cumple el mes
    if (dias < 0) {
        meses--;
        // Calcular días del mes anterior para ajuste (aproximación)
        const tempDate = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
        dias += tempDate.getDate();
    }

    // Ajuste si aún no cumple el año
    if (meses < 0) {
        anos--;
        meses += 12;
    }
    
    // Edad exacta en años decimales (para promedios)
    const edadDecimal = anos + (meses / 12) + (dias / 365.25); 

    let texto = '';
    if (anos > 0) {
        const mesTexto = meses > 0 ? `, ${meses} meses` : '';
        texto = `${anos} año${anos > 1 ? 's' : ''}${mesTexto}`;
    } else if (meses > 0) {
        const diaTexto = dias > 0 ? `, ${dias} días` : '';
        texto = `${meses} mes${meses > 1 ? 'es' : ''}${diaTexto}`;
    } else {
        texto = `${dias} días`;
    }

    return { anos: edadDecimal, texto: texto };
}


// --- FUNCIÓN DE INICIO ---
async function iniciarSistema() {
    cargandoPendientesUI.innerText = "Iniciando...";
    cargandoInventarioUI.innerText = "Iniciando...";
    cargandoLotesUI.innerText = "Iniciando...";
    cargandoDescansoUI.innerText = "Iniciando...";
    cargandoDescarteUI.innerText = "Iniciando...";
    
    // NOTA: Asumimos que la autenticación funciona correctamente
    const autenticado = true; //await iniciarAutenticacion(); 
    
    if (autenticado) {
        escucharInventario(); 
        escucharEscaneosPendientes();
        escucharLotes(); 
        actualizarFechaLote();
    } else {
        cargandoPendientesUI.innerText = "Error de autenticación.";
        cargandoInventarioUI.innerText = "Error de autenticación.";
        cargandoLotesUI.innerText = "Error de autenticación.";
        cargandoDescansoUI.innerText = "Error de autenticación.";
        cargandoDescarteUI.innerText = "Error de autenticación.";
    }
}

// --- LÓGICA DE TABS (PESTAÑAS) ---
document.getElementById('tab-nav').addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-button')) {
        const targetTab = e.target.dataset.tab;

        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        e.target.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
        
        if (targetTab === 'gestion') {
            renderizarReportesGestion();
        } else if (targetTab === 'lotes') {
            renderizarLotes();
        } else if (targetTab === 'inventario') {
            renderizarInventario();
        }
    }
});

// --- ESCUCHAR ESCANEOS PENDIENTES ---
function escucharEscaneosPendientes() {
    const scansRef = collection(db, "public_scans");
    onSnapshot(scansRef, (snapshot) => {
        let hayPendientes = false;
        listaPendientesUI.innerHTML = ''; 

        snapshot.docs.forEach(async (snapshotDoc) => {
            const scan = snapshotDoc.data();
            const scanId = snapshotDoc.id; 
            
            if (!scan.uid) return; 

            if (uidsDeGanado.has(scan.uid)) {
                // Resaltar animal existente si es escaneado nuevamente
                const vacaCard = document.getElementById(`vaca-${scan.uid}`);
                if (vacaCard) {
                    vacaCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    vacaCard.classList.add('highlight-animation');
                    setTimeout(() => { vacaCard.classList.remove('highlight-animation'); }, 2000);
                }
                const scanRef = doc(db, "public_scans", scanId); 
                await deleteDoc(scanRef);
            } else {
                hayPendientes = true;
                let timestampStr = scan.timestamp ? new Date(scan.timestamp).toLocaleString('es-GT') : "Fecha desconocida";

                const item = document.createElement('li');
                item.className = "flex justify-between items-center p-3 bg-gray-50 rounded shadow-sm";
                item.innerHTML = `
                    <span>UID: <strong class="font-mono">${scan.uid}</strong> (Escaneado: ${timestampStr})</span>
                    <button data-uid="${scan.uid}" data-scan-id="${scanId}" class="btn-registrar bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 text-sm">
                        Registrar
                    </button>
                `;
                listaPendientesUI.appendChild(item);
            }
        }); 

        cargandoPendientesUI.style.display = hayPendientes ? 'none' : 'block';
        if (!hayPendientes) cargandoPendientesUI.innerText = "No hay escaneos pendientes.";
        
    });
}

// --- MOSTRAR FORMULARIO (PARA REGISTRAR O EDITAR) ---
async function mostrarFormulario(uid, scanId = null, modoEdicion = false) {
    modalGanadoUI.classList.add('active'); // Muestra el modal
    document.getElementById('form-uid').value = uid;
    document.getElementById('form-scan-id').value = scanId;
    
    // 1. Limpiar formulario por defecto
    formularioTituloUI.textContent = modoEdicion ? "Editar Ganado" : "Registrar Ganado";
    document.getElementById('form-nombre').value = '';
    document.getElementById('form-peso').value = '';
    inputFechaNacimiento.value = ''; 
    
    inputPartos.value = 0;
    selectEmbarazada.value = 'false';
    inputUltimoParto.value = '';
    inputFechaEstimada.value = '';
    campoFechaEstimada.classList.add('hidden');
    selectEstadoMacho.value = 'reproduccion';
    selectEstadoHembra.value = 'reproduccion'; 
    inputPromedioLeche.value = ''; 
    campoPromedioLecheUI.classList.add('hidden'); 
    
    const animal = inventarioCache.find(a => a.uid === uid);
    
    if (animal) {
        // Rellenar campos generales
        document.getElementById('form-nombre').value = animal.nombre || '';
        document.getElementById('form-peso').value = animal.peso || 0;
        selectSexo.value = animal.sexo;
        inputFechaNacimiento.value = animal.fechaNacimiento || ''; 
        
        // Rellenar campos específicos de sexo
        if (animal.sexo === 'hembra') {
            camposHembraUI.classList.remove('hidden');
            campoEstadoMacho.classList.add('hidden');
            
            inputPartos.value = animal.partos || 0;
            selectEmbarazada.value = animal.embarazada ? 'true' : 'false';
            inputUltimoParto.value = animal.ultimoParto || '';
            selectEstadoHembra.value = animal.estadoHembra || 'reproduccion'; 
            
            // LÓGICA: Promedio de Leche (solo si está en estado 'lechera' o 'descanso')
            if (animal.estadoHembra === 'lechera' || animal.estadoHembra === 'descanso') {
                campoPromedioLecheUI.classList.remove('hidden');
                inputPromedioLeche.value = animal.promedioLeche || '';
            } else {
                campoPromedioLecheUI.classList.add('hidden');
            }
            
            if (animal.embarazada && animal.estimadaParto) {
                campoFechaEstimada.classList.remove('hidden');
                inputFechaEstimada.value = animal.estimadaParto;
            } else {
                campoFechaEstimada.classList.add('hidden');
            }
        } else { 
            camposHembraUI.classList.add('hidden');
            campoEstadoMacho.classList.remove('hidden');
            selectEstadoMacho.value = animal.estadoMacho || 'reproduccion';
            campoPromedioLecheUI.classList.add('hidden'); // Asegurar que esté oculto para machos
        }
    } else {
         // Configuración inicial de sexo para nuevo registro
        selectSexo.value = 'hembra';
        camposHembraUI.classList.remove('hidden');
        campoEstadoMacho.classList.add('hidden');
        campoPromedioLecheUI.classList.add('hidden');
    }
}


// Event listeners para formulario
listaPendientesUI.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-registrar')) {
        mostrarFormulario(e.target.dataset.uid, e.target.dataset.scanId, false);
    }
});

// Event listener para el botón Editar
document.getElementById('lista-inventario').addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-editar')) {
        const uid = e.target.dataset.uid;
        mostrarFormulario(uid, null, true);
    }
});


// Cierra el modal de Ganado
btnCancelar.addEventListener('click', () => { modalGanadoUI.classList.remove('active'); });

// Mostrar/ocultar fecha estimada de parto
selectEmbarazada.addEventListener('change', (e) => {
    if (e.target.value === 'true') { campoFechaEstimada.classList.remove('hidden'); } 
    else { campoFechaEstimada.classList.add('hidden'); inputFechaEstimada.value = ''; }
});

// LÓGICA: Mostrar/ocultar promedio de leche (Actualizada para incluir 'descanso')
selectEstadoHembra.addEventListener('change', (e) => {
    const estado = e.target.value;
    if (estado === 'lechera' || estado === 'descanso') {
        campoPromedioLecheUI.classList.remove('hidden');
    } else {
        campoPromedioLecheUI.classList.add('hidden');
        inputPromedioLeche.value = ''; // Limpiar el valor si cambia de estado
    }
});


// Alternar campos Hembra/Macho
selectSexo.addEventListener('change', (e) => {
    const sexo = e.target.value;
    const estadoHembra = selectEstadoHembra.value;
    
    if (sexo === 'macho') {
        camposHembraUI.classList.add('hidden');
        campoFechaEstimada.classList.add('hidden'); 
        campoPromedioLecheUI.classList.add('hidden'); 
        campoEstadoMacho.classList.remove('hidden');
    } else {
        camposHembraUI.classList.remove('hidden');
        
        // Visibilidad de Embarazada
        if (selectEmbarazada.value === 'true') {
            campoFechaEstimada.classList.remove('hidden');
        } else {
            campoFechaEstimada.classList.add('hidden');
        }
        
        // Visibilidad de Promedio de Leche
        if (estadoHembra === 'lechera' || estadoHembra === 'descanso') {
            campoPromedioLecheUI.classList.remove('hidden');
        } else {
            campoPromedioLecheUI.classList.add('hidden');
        }
        
        campoEstadoMacho.classList.add('hidden');
    }
});

// --- LÓGICA DE GUARDADO ---
btnGuardar.addEventListener('click', async () => {
    const uid = document.getElementById('form-uid').value;
    const scanId = document.getElementById('form-scan-id').value; 
    
    const nombre = document.getElementById('form-nombre').value;
    const sexo = selectSexo.value;
    const peso = parseInt(document.getElementById('form-peso').value) || 0;
    const fechaNacimiento = inputFechaNacimiento.value; 
    
    // --- VALIDACIONES BÁSICAS ---
    if (!nombre || !uid || peso <= 0) {
        alert("Error: Verifica todos los campos (Nombre, UID y Peso deben ser válidos).");
        return;
    }
    if (!fechaNacimiento) {
         alert("Error: La Fecha de Nacimiento es obligatoria.");
         return;
    }
    // ---------------------------
    
    // Calcular edad para validación de partos
    const edadCalculada = calcularEdad(fechaNacimiento);
    const edadAnosDecimal = edadCalculada.anos;

    let datosGanado = {
        uid: uid, 
        nombre: nombre, 
        sexo: sexo, 
        peso: peso,
        fechaNacimiento: fechaNacimiento, 
        
        partos: 0, 
        embarazada: false, 
        ultimoParto: null, 
        estimadaParto: null, 
        estadoMacho: null,
        estadoHembra: null,
        promedioLeche: null 
    };

    if (sexo === 'hembra') {
        datosGanado.estadoHembra = selectEstadoHembra.value; 
        datosGanado.partos = parseInt(inputPartos.value) || 0;
        datosGanado.embarazada = selectEmbarazada.value === 'true';
        datosGanado.ultimoParto = inputUltimoParto.value || null;
        datosGanado.estimadaParto = datosGanado.embarazada ? (inputFechaEstimada.value || null) : null;
        
        // LÓGICA: Promedio de Leche (Actualizada para incluir 'descanso')
        if (datosGanado.estadoHembra === 'lechera' || datosGanado.estadoHembra === 'descanso') {
            const leche = parseFloat(inputPromedioLeche.value);
            if (isNaN(leche) || leche < 0) { // Permitir 0 pero advertir
                alert("Error: El Promedio de Leche (L/día) debe ser un número positivo o cero.");
                return;
            }
            if (leche === 0 && (datosGanado.estadoHembra === 'lechera' || datosGanado.estadoHembra === 'descanso')) {
                 console.warn("Advertencia: Se guardó Promedio de Leche como 0 para una vaca lechera/descanso.");
            }
            datosGanado.promedioLeche = leche;
        } else {
            datosGanado.promedioLeche = null;
        }

        if (datosGanado.partos > edadAnosDecimal) { 
            alert(`Error: El número de partos (${datosGanado.partos}) no puede ser mayor que la edad en años (${edadAnosDecimal.toFixed(1)}).`);
            return; 
        }
    } else if (sexo === 'macho') {
        datosGanado.estadoMacho = selectEstadoMacho.value;
        datosGanado.promedioLeche = null; // Asegurar que no se guarde leche para machos
    }

    try {
        const ganadoRef = doc(db, "ganado", uid);
        await setDoc(ganadoRef, datosGanado, { merge: true });

        if (scanId) {
            const scanRef = doc(db, "public_scans", scanId);
            await deleteDoc(scanRef);
            alert("¡Ganado registrado con éxito!");
        } else {
            alert("¡Ganado actualizado con éxito!");
        }
        
        // Cierra el modal después de guardar con éxito
        modalGanadoUI.classList.remove('active'); 
    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Error al guardar el ganado.");
    }
});


// --- ESCUCHA CONTINUA DEL INVENTARIO --- 
function escucharInventario() {
    const ganadoRef = collection(db, "ganado");

    onSnapshot(ganadoRef, (querySnapshot) => {
        cargandoInventarioUI.style.display = 'none';
        uidsDeGanado.clear();
        inventarioCache = []; 
        
        if (querySnapshot.empty) {
            cargandoInventarioUI.innerText = 'Aún no hay ganado registrado.';
            cargandoInventarioUI.style.display = 'block';
            inventarioUI.innerHTML = '';
            return;
        }

        querySnapshot.forEach((doc) => {
            const animalData = doc.data();
            if (!animalData.uid || !animalData.nombre || !animalData.sexo || !doc.id) {
                console.warn("Animal con datos faltantes o corruptos encontrado. Saltando:", animalData);
                return; 
            }
            uidsDeGanado.add(doc.id);
            inventarioCache.push(animalData);
        });
        
        renderizarInventario(); 
        // Llama a la renderización de reportes si la pestaña de Gestión está activa
        if (document.getElementById('gestion').classList.contains('active')) {
            renderizarReportesGestion();
        }
    });
}

// Asocia eventos de búsqueda y filtro
inputBuscador.addEventListener('input', renderizarInventario);
selectFiltroSexo.addEventListener('change', renderizarInventario);


// --- RENDERIZAR INVENTARIO GENERAL (Aplica Filtros) ---
function renderizarInventario() {
    inventarioUI.innerHTML = '';
    const filtroSexo = selectFiltroSexo.value; 
    const terminoBusqueda = inputBuscador.value.toLowerCase();
    
    let listadoFiltrado = inventarioCache.filter(animal => {
        if (!animal.uid || !animal.nombre || !animal.sexo) return false; 

        const nombreUID = (animal.nombre + animal.uid).toLowerCase(); 

        const pasaFiltroSexo = (filtroSexo === 'todos' || animal.sexo === filtroSexo);
        const pasaBusqueda = !terminoBusqueda || nombreUID.includes(terminoBusqueda);

        return pasaFiltroSexo && pasaBusqueda;
    });
    
    if (listadoFiltrado.length === 0) {
        inventarioUI.innerHTML = '<p class="text-gray-600">No se encontraron animales con los criterios de búsqueda o filtros seleccionados.</p>';
        return;
    }

    listadoFiltrado.forEach((animal) => {
        const animalId = animal.uid; 
        
        const item = document.createElement('div');
        item.id = `vaca-${animalId}`; 
        item.className = 'p-4 bg-white border rounded-lg shadow-sm item-vaca';

        // --- CALCULAR Y MOSTRAR EDAD ---
        const edad = calcularEdad(animal.fechaNacimiento);
        const edadTexto = edad.texto; 

        let htmlCamposExtra = '';
        let colorSexo = animal.sexo === 'hembra' ? 'text-pink-600' : 'text-blue-600';

        if (animal.sexo === 'hembra') {
            let estadoTexto = '';
            let colorEstado = '';
            
            switch (animal.estadoHembra) {
                case 'lechera':
                    estadoTexto = 'Lechera';
                    colorEstado = 'text-blue-700';
                    break;
                case 'descanso':
                    estadoTexto = 'Descanso/Espera (Manual)';
                    colorEstado = 'text-indigo-700';
                    break;
                case 'engorda':
                    estadoTexto = 'Engorda/Venta';
                    colorEstado = 'text-orange-700';
                    break;
                case 'descarte':
                    estadoTexto = 'Descarte (Manual)';
                    colorEstado = 'text-red-700 font-bold';
                    break;
                case 'reproduccion':
                default:
                    estadoTexto = 'Reproducción';
                    colorEstado = 'text-green-700';
                    break;
            }
            
            // Mostrar Promedio de Leche para lecheras y descanso
            if ((animal.estadoHembra === 'lechera' || animal.estadoHembra === 'descanso') && animal.promedioLeche >= 0) {
                 estadoTexto += ` (${animal.promedioLeche} L/día)`;
            }

            htmlCamposExtra += `<p>Estado: <strong class="${colorEstado}">${estadoTexto}</strong></p>`; 
            htmlCamposExtra += `<p>Partos: ${animal.partos || 0}</p>`;

            // 1. Mostrar estado de embarazo
            if (animal.embarazada) {
                const fechaEstimadaFmt = formatearFecha(animal.estimadaParto);
                htmlCamposExtra += `<p class="font-bold text-green-700">Embarazada: Sí</p>`;
                htmlCamposExtra += `<p>F. Estimada Parto: ${fechaEstimadaFmt}</p>`;
            } else {
                htmlCamposExtra += `<p>Embarazada: No</p>`;
            }
            
            // 2. Mostrar la fecha óptima SI tiene un último parto registrado y no está embarazada
            if (animal.ultimoParto && !animal.embarazada) {
                const DIAS_DESCANSO_IDEAL = 90; // Periodo de espera para volver a preñar
                const dias = diasTranscurridos(animal.ultimoParto);
                const fechaOptimaStr = calcularFechaOptima(animal.ultimoParto, DIAS_DESCANSO_IDEAL);
                
                if (fechaOptimaStr && dias !== Infinity) {
                     const textoDias = `(${dias} días post-parto)`;
                     const fechaOptimaFmt = formatearFecha(fechaOptimaStr);
                     
                     htmlCamposExtra += `<p class="text-blue-600">Último Parto: ${formatearFecha(animal.ultimoParto)} ${textoDias}</p>`;
                     
                     if (dias < DIAS_DESCANSO_IDEAL) {
                         htmlCamposExtra += `<p class="text-gray-600">F. Óptima Repro: <strong>${fechaOptimaFmt}</strong></p>`; 
                     } else if (dias >= DIAS_DESCANSO_IDEAL && dias < DIAS_DESCANSO_IDEAL + 30) {
                          htmlCamposExtra += `<p class="font-bold text-orange-600">Revisión Celo: ¡Ya! (F. Óptima: ${fechaOptimaFmt})</p>`; 
                     } else if (dias >= DIAS_DESCANSO_IDEAL + 30) {
                          htmlCamposExtra += `<p class="font-bold text-red-600">Revisión Celo: ¡Retrasada! (F. Óptima: ${fechaOptimaFmt})</p>`; 
                     }
                }
            }

        } else if (animal.sexo === 'macho') {
            let estadoTexto = animal.estadoMacho === 'reproduccion' ? 'Reproducción' : 'Venta / Engorde';
            htmlCamposExtra += `<p>Estado: <strong>${estadoTexto}</strong></p>`;
            
            const loteAsignado = lotesCache.find(lote => lote.animales && lote.animales.includes(animalId)); 
            
            if (loteAsignado) {
                htmlCamposExtra += `<p class="text-orange-600">Lote Asignado: <strong>${loteAsignado.nombre || 'Sin nombre'}</strong></p>`;
            } else if (animal.estadoMacho === 'venta' || animal.estadoHembra === 'engorda') { 
                htmlCamposExtra += `
                    <button data-uid="${animalId}" class="btn-asignar-lote bg-green-500 text-white px-3 py-1 mt-2 rounded hover:bg-green-600 text-sm">
                        Asignar a Lote
                    </button>
                `;
            }
        }

        item.innerHTML = `
            <h3 class="text-lg font-semibold text-blue-800">${animal.nombre} (UID: ${animalId})</h3>
            <p class="${colorSexo} text-sm font-medium">Sexo: ${animal.sexo.toUpperCase()}</p>
            <p>F. Nacimiento: ${formatearFecha(animal.fechaNacimiento)}</p>
            <p>Edad: <strong>${edadTexto}</strong></p>
            <p>Peso: ${animal.peso} kg</p>
            ${htmlCamposExtra}
            <div class="mt-3 flex space-x-2">
                <button data-uid="${animalId}" class="btn-editar bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600">
                    Editar
                </button>
                <button data-uid="${animalId}" class="btn-eliminar bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">
                    Eliminar
                </button>
            </div>
        `;
        inventarioUI.appendChild(item);
    });
}

// --- ELIMINAR ANIMAL DEL INVENTARIO ---
inventarioUI.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-eliminar')) {
        const uid = e.target.dataset.uid;
        const animal = inventarioCache.find(a => a.uid === uid);

        if (!confirm(`¿Estás seguro de que quieres eliminar a ${animal.nombre} (UID: ${uid}) del inventario? Esta acción es irreversible.`)) return;

        try {
            const ganadoRef = doc(db, "ganado", uid);
            await deleteDoc(ganadoRef);
            
            const batch = writeBatch(db);
            lotesCache.forEach(lote => {
                if (lote.animales && lote.animales.includes(uid)) {
                    const loteRef = doc(db, "lotes_venta", lote.id);
                    batch.update(loteRef, { animales: arrayRemove(uid) });
                }
            });
            await batch.commit();

            alert("Ganado eliminado con éxito.");
        } catch (error) {
            console.error("Error al eliminar ganado:", error);
            alert("Error al eliminar el ganado.");
        }
    }
});


// --- RENDERIZAR REPORTES DE GESTIÓN (Todo en una función) ---
function renderizarReportesGestion() {
    // Limpiar
    listaPronosticoUI.innerHTML = '';
    listaDescansoUI.innerHTML = '';
    listaDescarteUI.innerHTML = '';
    cargandoPronosticoUI.style.display = 'none';
    cargandoDescansoUI.style.display = 'none';
    cargandoDescarteUI.style.display = 'none';
    
    const hembras = inventarioCache.filter(animal => animal.sexo === 'hembra');
    
    // --- CÁLCULO DE PROMEDIOS (Para descarte) ---
    const vacasLecheras = hembras.filter(a => a.estadoHembra === 'lechera' && a.promedioLeche > 0);
    const totalLeche = vacasLecheras.reduce((sum, a) => sum + a.promedioLeche, 0);
    const promedioLecheGeneral = vacasLecheras.length > 0 ? totalLeche / vacasLecheras.length : 0;
    
    let hayPronostico = false;
    let hayDescanso = false;
    let hayDescarte = false;
    
    // Constantes de Gestión
    const DIAS_DESCANSO_POST_PARTO = 90; // Ideal para esperar antes de volver a preñar
    const DIAS_INFERTILIDAD_ALERTA = 730; // 2 años sin parto para descarte opcional
    const PORCENTAJE_BAJA_PRODUCCION = 0.8; // 80% del promedio para considerar descarte
    
    // Recorrer Hembras
    hembras.forEach(animal => {
        const animalId = animal.uid;
        const edad = calcularEdad(animal.fechaNacimiento);
        
        // 1. Pronóstico de Partos (No necesita inferencia, solo el dato)
        if (animal.embarazada && animal.estimadaParto) {
            hayPronostico = true;
            const fechaParto = new Date((animal.estimadaParto || '') + 'T00:00:00'); 
            if (isNaN(fechaParto.getTime())) return;
            
            const item = document.createElement('div');
            item.className = 'p-3 bg-green-100 border-l-4 border-green-500 rounded-lg shadow-sm';
            item.innerHTML = `
                <h4 class="font-semibold text-green-800">${animal.nombre} (UID: ${animalId})</h4>
                <p>Edad: ${edad.texto}</p>
                <p class="mt-1 font-bold">F. Estimada Parto: <span class="text-lg">${formatearFecha(animal.estimadaParto)}</span></p>
            `;
            listaPronosticoUI.appendChild(item);
        }
        
        // 2. Vacas en Descanso/Espera (INFERENCIA AUTOMÁTICA)
        if (animal.ultimoParto) {
            const diasPostParto = diasTranscurridos(animal.ultimoParto);
            
            // Si tiene un último parto y han pasado menos de 90 días (periodo de espera/descanso)
            if (diasPostParto >= 1 && diasPostParto <= DIAS_DESCANSO_POST_PARTO) {
                hayDescanso = true;
                const fechaOptimaStr = calcularFechaOptima(animal.ultimoParto, DIAS_DESCANSO_POST_PARTO);
                
                let estadoDescanso = '';
                let colorDescanso = 'bg-blue-100 border-blue-500';
                
                const diasRestantes = DIAS_DESCANSO_POST_PARTO - diasPostParto;
                estadoDescanso = `Días post-parto: ${diasPostParto}. Faltan ${diasRestantes} días para el chequeo de celo.`;

                const item = document.createElement('div');
                item.className = `p-3 ${colorDescanso} border-l-4 rounded-lg shadow-sm`;
                item.innerHTML = `
                    <h4 class="font-semibold text-blue-800">${animal.nombre} (UID: ${animalId})</h4>
                    <p>Último Parto: ${formatearFecha(animal.ultimoParto)}</p>
                    <p class="font-bold text-gray-700">${estadoDescanso}</p>
                    <p class="text-sm">Fecha Óptima de Repro: <strong>${formatearFecha(fechaOptimaStr)}</strong></p>
                `;
                listaDescansoUI.appendChild(item);
            }
        }

        // 3. Vacas de Descarte Opcional (INFERENCIA AUTOMÁTICA)
        let motivoDescarte = [];
        
        // Criterio A: Baja Productividad (Lechera con leche bajo promedio)
        if (animal.estadoHembra === 'lechera' && animal.promedioLeche >= 0 && promedioLecheGeneral > 0) {
            if (animal.promedioLeche < promedioLecheGeneral * PORCENTAJE_BAJA_PRODUCCION) { 
                motivoDescarte.push(`Baja producción de leche (${animal.promedioLeche} L/día vs ${promedioLecheGeneral.toFixed(1)} promedio).`);
            }
        }
        
        // Criterio B: Infertilidad/Atraso Reproductivo
        if (!animal.embarazada && animal.ultimoParto) {
            const diasSinParto = diasTranscurridos(animal.ultimoParto);
            if (diasSinParto > DIAS_INFERTILIDAD_ALERTA) { 
                 motivoDescarte.push(`Infertilidad/Atraso Reproductivo (Más de ${DIAS_INFERTILIDAD_ALERTA} días sin parir: ${diasSinParto} días).`);
            }
        }
        
        // Criterio C: Marcado explícitamente (se mantiene por si el usuario lo marca en el formulario)
        if (animal.estadoHembra === 'descarte') {
            motivoDescarte.push("Marcado como Descarte explícitamente por el usuario.");
        }
        
        if (motivoDescarte.length > 0) {
            hayDescarte = true;
            const item = document.createElement('div');
            item.className = 'p-3 bg-red-100 border-l-4 border-red-500 rounded-lg shadow-sm';
            item.innerHTML = `
                <h4 class="font-semibold text-red-800">${animal.nombre} (UID: ${animalId})</h4>
                <p>Estado Actual (Formulario): ${animal.estadoHembra.toUpperCase()}</p>
                <p class="mt-1 font-bold">Motivos Sugeridos de Descarte:</p>
                <ul class="list-disc ml-4 text-sm">
                    ${motivoDescarte.map(m => `<li>${m}</li>`).join('')}
                </ul>
                <button data-uid="${animalId}" class="btn-editar bg-yellow-500 text-white px-3 py-1 mt-2 rounded hover:bg-yellow-600 text-xs">
                    Revisar/Editar Estado
                </button>
            `;
            listaDescarteUI.appendChild(item);
        }
    });

    // Mensajes si no hay datos
    if (!hayPronostico) { cargandoPronosticoUI.innerText = 'No hay hembras preñadas registradas con fecha estimada de parto.'; cargandoPronosticoUI.style.display = 'block'; }
    // El reporte de descanso solo aparece si hay vacas con parto reciente
    if (!hayDescanso) { cargandoDescansoUI.innerText = 'No hay hembras que hayan parido recientemente (últimos 90 días).'; cargandoDescansoUI.style.display = 'block'; }
    if (!hayDescarte) { cargandoDescarteUI.innerText = `No hay vacas que cumplan los criterios automáticos de descarte. (Promedio General Leche: ${promedioLecheGeneral.toFixed(1)} L/día).`; cargandoDescarteUI.style.display = 'block'; }
    
}

// --- LÓGICA DE LOTES DE VENTA ---

function actualizarFechaLote() {
    const meses = parseInt(selectLoteDuracion.value);
    const fechaInicio = new Date();
    const fechaVentaEst = new Date(fechaInicio);
    fechaVentaEst.setMonth(fechaVentaEst.getMonth() + meses);
    
    loteFechaInicioUI.textContent = formatearFecha(fechaInicio.toISOString().split('T')[0]);
    loteFechaVentaEstUI.textContent = formatearFecha(fechaVentaEst.toISOString().split('T')[0]);
}
selectLoteDuracion.addEventListener('change', actualizarFechaLote);

// ESCUCHAR LOTES
function escucharLotes() {
    const lotesRef = collection(db, "lotes_venta");
    onSnapshot(lotesRef, (querySnapshot) => {
        cargandoLotesUI.style.display = 'none';
        lotesCache = [];
        
        querySnapshot.forEach((doc) => {
            const loteData = doc.data();
            if (!loteData.animales || !Array.isArray(loteData.animales)) {
                loteData.animales = []; 
            }
            lotesCache.push({ id: doc.id, ...loteData });
        });
        
        if (document.getElementById('lotes').classList.contains('active')) {
             renderizarLotes();
        }
        renderizarInventario();

        if (modalDetalleLoteUI.classList.contains('active') && loteActualDetalle) {
            mostrarDetallesLote(loteActualDetalle.id);
        }
    });
}

// RENDERIZAR LOTES
function renderizarLotes() {
    listaLotesUI.innerHTML = '';
    cargandoLotesUI.style.display = lotesCache.length === 0 ? 'block' : 'none';
    if (lotesCache.length === 0) {
        cargandoLotesUI.innerText = 'No hay lotes de venta activos.';
        return;
    }
    
    lotesCache.forEach(lote => {
        const item = document.createElement('div');
        item.className = 'p-4 bg-white border border-green-400 rounded-lg shadow-md item-lote';
        item.style.borderColor = '#10b981'; 

        const fechaInicioFmt = formatearFecha(lote.fechaCreacion);
        const fechaVentaFmt = formatearFecha(lote.fechaVentaEstimada);
        const animalesCount = lote.animales.length; 
        
        item.innerHTML = `
            <div class="flex justify-between items-start">
                <h3 class="text-xl font-bold text-orange-700">${lote.nombre || 'Lote sin nombre'}</h3>
                <span class="text-sm text-gray-500">ID Lote: ${lote.id.substring(0, 8)}...</span>
            </div>
            <p>Duración: <strong>${lote.duracionMeses} meses</strong></p>
            <p>Iniciado: ${fechaInicioFmt}</p>
            <p class="text-red-600 font-semibold">Venta Estimada: ${fechaVentaFmt}</p>
            
            <div class="bg-gray-100 p-3 mt-3 rounded">
                <p class="font-medium text-gray-800">Animales en Lote: <strong>${animalesCount}</strong></p>
                ${animalesCount === 0 ? '<p class="text-sm text-gray-500">No hay animales asignados</p>' : ''}
            </div>
            
            <div class="mt-4 flex space-x-2">
                <button data-lote-id="${lote.id}" class="btn-ver-detalle bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">
                    Ver Detalles (${animalesCount})
                </button>
                <button data-lote-id="${lote.id}" class="btn-eliminar-lote bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700">
                    Eliminar Lote
                </button>
            </div>
        `;
        listaLotesUI.appendChild(item);
    });
    renderizarInventario(); 
}

// CREAR LOTE
btnCrearLote.addEventListener('click', async () => {
    const nombre = inputLoteNombre.value.trim();
    const duracionMeses = parseInt(selectLoteDuracion.value);

    if (!nombre) {
        alert("Por favor, ingresa un nombre para el lote.");
        return;
    }

    const fechaCreacion = new Date();
    const fechaVentaEstimada = new Date(fechaCreacion);
    fechaVentaEstimada.setMonth(fechaVentaEstimada.getMonth() + duracionMeses);

    const nuevoLote = {
        nombre: nombre,
        duracionMeses: duracionMeses,
        fechaCreacion: fechaCreacion.toISOString().split('T')[0],
        fechaVentaEstimada: fechaVentaEstimada.toISOString().split('T')[0],
        animales: [] 
    };

    try {
        const loteRef = doc(collection(db, "lotes_venta"));
        await setDoc(loteRef, nuevoLote);
        inputLoteNombre.value = '';
        alert(`Lote "${nombre}" creado con éxito.`);
    } catch (error) {
        console.error("Error al crear lote:", error);
        alert("Error al crear el lote de venta.");
    }
});

// ELIMINAR LOTE
listaLotesUI.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-eliminar-lote')) {
        const loteId = e.target.dataset.loteId;
        if (!confirm("¿Estás seguro de que quieres eliminar este lote? Los animales NO serán eliminados del inventario.")) return;

        try {
            const loteRef = doc(db, "lotes_venta", loteId);
            await deleteDoc(loteRef);
            alert("Lote eliminado con éxito.");
        } catch (error) {
            console.error("Error al eliminar lote:", error);
            alert("Error al eliminar el lote.");
        }
    }
});


// --- LÓGICA DE ASIGNACIÓN/DETALLE DE LOTE ---

// 1. Mostrar Modal de Asignación (desde el botón "Asignar a Lote" en Inventario)
inventarioUI.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-asignar-lote')) {
        uidTemporalParaAsignacion = e.target.dataset.uid;
        abrirModalAsignacion(uidTemporalParaAsignacion);
    }
});

// 2. Abrir Modal de Asignación (desde el botón en Modal de Detalle)
btnAbrirAsignacionLote.addEventListener('click', () => {
    abrirModalAsignacion(null);
});

function abrirModalAsignacion(uid = null) {
    // Si el UID es nulo, estamos abriendo desde el modal de detalle del lote.
    if (!uid && loteActualDetalle) {
        uidAAsignarUI.textContent = `para el Lote: ${loteActualDetalle.nombre}`;
    } else {
         uidAAsignarUI.textContent = uid || 'Múltiples animales';
    }
   
    listaLotesModalUI.innerHTML = '<p id="modal-cargando" class="text-sm text-gray-500">Cargando lotes disponibles...</p>';
    modalAsignarLoteUI.classList.add('active');
    
    listaLotesModalUI.innerHTML = '';
    if (lotesCache.length === 0) {
        listaLotesModalUI.innerHTML = '<p class="text-gray-600">No hay lotes de venta disponibles. Crea uno primero.</p>';
        return;
    }
    
    lotesCache.forEach(lote => {
        if (loteActualDetalle && lote.id === loteActualDetalle.id) return;
        
        const animalesEnLote = lote.animales.length;
        
        const button = document.createElement('button');
        button.className = 'w-full text-left p-3 border rounded hover:bg-blue-50';
        button.innerHTML = `
            <span class="font-semibold">${lote.nombre}</span> 
            <span class="text-sm text-gray-600">(${animalesEnLote} animales)</span><br>
            <span class="text-xs text-red-500">Venta Estimada: ${formatearFecha(lote.fechaVentaEstimada)}</span>
        `;
        
        button.addEventListener('click', () => asignarAnimalALote(uid, lote.id));
        listaLotesModalUI.appendChild(button);
    });
}

// CERRAR MODALES
btnCerrarModal.addEventListener('click', () => { 
    modalAsignarLoteUI.classList.remove('active'); 
    uidTemporalParaAsignacion = null;
});
btnCerrarDetalleModal.addEventListener('click', () => { 
    modalDetalleLoteUI.classList.remove('active'); 
    loteActualDetalle = null; 
});


// FUNCIÓN DE ASIGNACIÓN FINAL
async function asignarAnimalALote(uid, loteId) {
    if (uid) {
         const animalRef = doc(db, "ganado", uid);
         const loteRef = doc(db, "lotes_venta", loteId);

        try {
            // 1. Agregar UID al array 'animales' del lote
            await updateDoc(loteRef, {
                animales: arrayUnion(uid)
            });
            
            // 2. Actualizar el estado del animal a 'engorda' o 'venta'
            const animal = inventarioCache.find(a => a.uid === uid);
            if (animal && animal.sexo === 'macho') {
                await updateDoc(animalRef, { estadoMacho: 'venta' }); 
            } else if (animal && animal.sexo === 'hembra') {
                // El estado para animales en lote de venta es 'engorda'
                await updateDoc(animalRef, { estadoHembra: 'engorda' });
            }

            alert(`Animal ${uid} asignado al lote con éxito.`);
            modalAsignarLoteUI.classList.remove('active');
            uidTemporalParaAsignacion = null;
            
        } catch (error) {
            console.error("Error al asignar animal a lote:", error);
            alert("Error al asignar el animal al lote.");
        }
    } else if (loteActualDetalle) {
        alert("Funcionalidad para añadir múltiples animales al lote desde esta vista aún no implementada. Por favor, usa el botón 'Asignar a Lote' en la tarjeta del animal en el inventario.");
    }
}

// MOSTRAR DETALLES DEL LOTE
listaLotesUI.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-ver-detalle')) {
        const loteId = e.target.dataset.loteId;
        mostrarDetallesLote(loteId);
    }
});

async function mostrarDetallesLote(loteId) {
    loteActualDetalle = lotesCache.find(l => l.id === loteId);
    if (!loteActualDetalle) return;

    detalleLoteNombreUI.textContent = loteActualDetalle.nombre || 'Lote Sin Nombre';
    detalleLoteIdUI.textContent = `ID Lote: ${loteId}`;
    detalleLoteAnimalesUI.innerHTML = '<p id="detalle-cargando" class="text-gray-500">Cargando animales del lote...</p>';
    modalDetalleLoteUI.classList.add('active');

    const uidsEnLote = loteActualDetalle.animales; 
    
    // Estadísticas
    detalleStatsCantidadUI.textContent = uidsEnLote.length;
    let pesoTotal = 0;
    let edadTotalAnos = 0;
    let animalesEncontrados = [];
    
    uidsEnLote.forEach(uid => {
        const animal = inventarioCache.find(a => a.uid === uid);
        if (animal) {
            animalesEncontrados.push(animal);
            pesoTotal += (animal.peso || 0);
            // Usa la función de cálculo de edad
            const edad = calcularEdad(animal.fechaNacimiento);
            edadTotalAnos += edad.anos; 
        }
    });

    const count = animalesEncontrados.length;
    detalleStatsPesoUI.textContent = count > 0 ? `${(pesoTotal / count).toFixed(1)} kg` : '0 kg';
    detalleStatsEdadUI.textContent = count > 0 ? `${(edadTotalAnos / count).toFixed(1)} años` : '0 años';

    // Lista de Animales
    detalleLoteAnimalesUI.innerHTML = '';
    if (count === 0) {
        detalleLoteAnimalesUI.innerHTML = '<p class="text-gray-600">No hay animales asignados a este lote.</p>';
        return;
    }
    
    animalesEncontrados.forEach(animal => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center p-2 bg-white border rounded';
        const edad = calcularEdad(animal.fechaNacimiento);
        item.innerHTML = `
            <span class="font-medium">${animal.nombre} (UID: ${animal.uid})</span>
            <div class="flex items-center space-x-2">
                <span class="text-sm text-gray-700">${animal.peso || 0} kg / ${edad.texto}</span>
                <button data-uid="${animal.uid}" class="btn-quitar-lote bg-red-400 text-white px-2 py-1 rounded hover:bg-red-500 text-xs">
                    Quitar
                </button>
            </div>
        `;
        detalleLoteAnimalesUI.appendChild(item);
    });
}

// QUITAR ANIMAL DE LOTE
detalleLoteAnimalesUI.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-quitar-lote')) {
        const uid = e.target.dataset.uid;
        const loteId = loteActualDetalle.id;

        if (!confirm(`¿Estás seguro de que quieres quitar al animal ${uid} del lote? Su estado se revertirá a 'reproducción'.`)) return;

        const loteRef = doc(db, "lotes_venta", loteId);
        const animalRef = doc(db, "ganado", uid);
        
        try {
            // 1. Quitar UID del array 'animales' del lote
            await updateDoc(loteRef, {
                animales: arrayRemove(uid)
            });
            
            // 2. Revertir el estado del animal a 'reproduccion'
            const animal = inventarioCache.find(a => a.uid === uid);
            if (animal.sexo === 'macho') {
                await updateDoc(animalRef, { estadoMacho: 'reproduccion' });
            } else if (animal.sexo === 'hembra') {
                // Revertimos el estado de la hembra a reproducción, que es el más neutral
                await updateDoc(animalRef, { estadoHembra: 'reproduccion' });
            }

            alert(`Animal ${uid} quitado del lote.`);

        } catch (error) {
            console.error("Error al quitar animal de lote:", error);
            alert("Error al quitar el animal del lote.");
        }
    }
});

// VENDER LOTE (Eliminar Lote y Animales)
btnVenderLote.addEventListener('click', async () => {
    if (!loteActualDetalle) return;
    const loteId = loteActualDetalle.id;
    const nombreLote = loteActualDetalle.nombre || 'el Lote';

    if (!confirm(`ADVERTENCIA: ¿Estás seguro de vender y eliminar ${loteActualDetalle.animales.length} animales del inventario? Esta acción es irreversible.`)) return;
    
    const batch = writeBatch(db);
    const loteRef = doc(db, "lotes_venta", loteId);
    
    // 1. Eliminar el documento del lote
    batch.delete(loteRef);

    // 2. Eliminar cada animal del lote del inventario
    loteActualDetalle.animales.forEach(uid => { 
        const animalRef = doc(db, "ganado", uid);
        batch.delete(animalRef);
    });

    try {
        await batch.commit();
        alert(`Lote "${nombreLote}" vendido y ${loteActualDetalle.animales.length} animales eliminados del inventario.`);
        modalDetalleLoteUI.classList.remove('active');
        loteActualDetalle = null;
    } catch (error) {
        console.error("Error al vender lote:", error);
        alert("Error al vender el lote. Revise la consola.");
    }
});

// Lógica de inicio del sistema
document.addEventListener('DOMContentLoaded', iniciarSistema);