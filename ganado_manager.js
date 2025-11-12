// ganado_manager.js

// --- 1. IMPORTAR FUNCIONES Y MÓDULOS ---
import { 
    iniciarAutenticacion, db, 
    collection, onSnapshot, doc, 
    setDoc, deleteDoc, 
    updateDoc, arrayUnion, arrayRemove, writeBatch
} from './firebase.js'; // Asegúrate que la ruta sea correcta

// --- 2. REFERENCIAS A ELEMENTOS DEL HTML ---
const listaPendientesUI = document.getElementById('lista-pendientes');
const cargandoPendientesUI = document.getElementById('cargando-pendientes');
const formularioUI = document.getElementById('formulario-registro');
const formularioTituloUI = document.getElementById('formulario-titulo');
const btnGuardar = document.getElementById('btn-guardar');
const btnCancelar = document.getElementById('btn-cancelar');
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
        const date = new Date(fechaStr + 'T00:00:00'); // Añadir T00:00:00 para evitar problemas de zona horaria
        if (isNaN(date)) return 'Fecha inválida';
        return date.toLocaleDateString('es-GT', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch (e) {
        return 'N/A';
    }
}

/**
 * Calcula la fecha óptima para la siguiente concepción/parto (90 días post-parto)
 */
function calcularFechaOptima(ultimoPartoStr) {
    if (!ultimoPartoStr) return null;
    try {
        // Crear objeto Date del último parto (añadir T00:00:00 para evitar problemas de zona horaria)
        const dateParto = new Date(ultimoPartoStr + 'T00:00:00');
        if (isNaN(dateParto)) return null;

        // Sumar 90 días (intervalo voluntario de espera)
        dateParto.setDate(dateParto.getDate() + 90);
        
        // Formatear para visualización
        return formatearFecha(dateParto.toISOString().split('T')[0]);
    } catch (e) {
        console.error("Error al calcular fecha óptima:", e);
        return null;
    }
}


// --- FUNCIÓN DE INICIO (Modularizada) ---
export async function iniciarSistema() {
    cargandoPendientesUI.innerText = "Iniciando...";
    cargandoInventarioUI.innerText = "Iniciando...";
    cargandoLotesUI.innerText = "Iniciando...";
    
    const autenticado = await iniciarAutenticacion();
    
    if (autenticado) {
        escucharInventario(); 
        escucharEscaneosPendientes();
        escucharLotes(); 
        actualizarFechaLote();
    } else {
        cargandoPendientesUI.innerText = "Error de autenticación.";
        cargandoInventarioUI.innerText = "Error de autenticación.";
        cargandoLotesUI.innerText = "Error de autenticación.";
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
        
        if (targetTab === 'pronostico') {
            renderizarPronosticoPartos();
        } else if (targetTab === 'lotes') {
            renderizarLotes();
        } else if (targetTab === 'inventario') {
            // No es necesario llamar a renderizarInventario, ya se actualiza con el filtro/buscador
            // Solo para asegurar que se actualiza si cambiamos de pestaña sin interacción
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
            
            // Verificamos que el UID exista antes de intentar usar 'has'
            if (!scan.uid) return; 

            if (uidsDeGanado.has(scan.uid)) {
                // El animal ya está registrado, lo resaltamos y eliminamos el scan
                const vacaCard = document.getElementById(`vaca-${scan.uid}`);
                if (vacaCard) {
                    vacaCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    vacaCard.classList.add('highlight-animation');
                    setTimeout(() => { vacaCard.classList.remove('highlight-animation'); }, 2000);
                }
                const scanRef = doc(db, "public_scans", scanId); 
                await deleteDoc(scanRef);
            } else {
                // Es un scan nuevo, lo mostramos como pendiente
                hayPendientes = true;
                let timestampStr = scan.timestamp ? new Date(scan.timestamp).toLocaleString('es-GT') : "Fecha desconocida";

                const item = document.createElement('li');
                item.className = "flex justify-between items-center p-3 bg-gray-50 rounded shadow-sm";
                item.innerHTML = `
                    <span>UID: <strong class="font-mono">${scan.uid}</strong> (Escaneado: ${timestampStr})</span>
                    <button data-uid="${scan.uid}" data-scan-id="${scanId}" class="btn-registrar bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">
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
    formularioUI.classList.remove('hidden');
    document.getElementById('form-uid').value = uid;
    document.getElementById('form-scan-id').value = scanId;
    
    // 1. Limpiar formulario por defecto
    formularioTituloUI.textContent = modoEdicion ? "Editar Ganado" : "Registrar Ganado";
    document.getElementById('form-nombre').value = '';
    document.getElementById('form-peso').value = '';
    document.getElementById('form-edad-anos').value = 0;
    document.getElementById('form-edad-meses').value = 0;
    inputPartos.value = 0;
    selectEmbarazada.value = 'false';
    inputUltimoParto.value = '';
    inputFechaEstimada.value = '';
    campoFechaEstimada.classList.add('hidden');
    selectEstadoMacho.value = 'reproduccion';
    
    // 2. Lógica para modo edición
    if (modoEdicion) {
        const animal = inventarioCache.find(a => a.uid === uid);
        if (animal) {
            document.getElementById('form-nombre').value = animal.nombre || '';
            document.getElementById('form-peso').value = animal.peso || 0;
            // Usar || 0 para proteger contra valores undefined
            document.getElementById('form-edad-anos').value = animal.edadAnos || 0; 
            document.getElementById('form-edad-meses').value = animal.edadMeses || 0;
            selectSexo.value = animal.sexo;
            
            if (animal.sexo === 'hembra') {
                // Campos de hembra
                camposHembraUI.classList.remove('hidden');
                campoEstadoMacho.classList.add('hidden');
                
                inputPartos.value = animal.partos || 0;
                selectEmbarazada.value = animal.embarazada ? 'true' : 'false';
                inputUltimoParto.value = animal.ultimoParto || '';
                
                if (animal.embarazada && animal.estimadaParto) {
                    campoFechaEstimada.classList.remove('hidden');
                    inputFechaEstimada.value = animal.estimadaParto;
                } else {
                    campoFechaEstimada.classList.add('hidden');
                }
            } else { 
                // Campos de macho
                camposHembraUI.classList.add('hidden');
                campoEstadoMacho.classList.remove('hidden');
                selectEstadoMacho.value = animal.estadoMacho || 'reproduccion';
            }
        } else {
            alert("Error: No se encontraron datos para este animal.");
            formularioUI.classList.add('hidden');
            return;
        }
    } else {
         // Modo registro: por defecto Hembra
        selectSexo.value = 'hembra';
        camposHembraUI.classList.remove('hidden');
        campoEstadoMacho.classList.add('hidden');
    }
}

// Event listeners para formulario
listaPendientesUI.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-registrar')) {
        // Asegurarse de usar .dataset correctamente para scan-id
        mostrarFormulario(e.target.dataset.uid, e.target.dataset.scanId, false);
    }
});

// Event listener para el botón Editar
inventarioUI.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-editar')) {
        const uid = e.target.dataset.uid;
        mostrarFormulario(uid, null, true);
    }
});


btnCancelar.addEventListener('click', () => { formularioUI.classList.add('hidden'); });

// Mostrar/ocultar fecha estimada de parto
selectEmbarazada.addEventListener('change', (e) => {
    if (e.target.value === 'true') { campoFechaEstimada.classList.remove('hidden'); } 
    else { campoFechaEstimada.classList.add('hidden'); inputFechaEstimada.value = ''; }
});

// Alternar campos Hembra/Macho
selectSexo.addEventListener('change', (e) => {
    if (e.target.value === 'macho') {
        camposHembraUI.classList.add('hidden');
        campoFechaEstimada.classList.add('hidden'); // Ocultar por si estaba activo
        campoEstadoMacho.classList.remove('hidden');
    } else {
        camposHembraUI.classList.remove('hidden');
        // Mantener visibilidad de campoFechaEstimada según selectEmbarazada
        if (selectEmbarazada.value === 'true') {
             campoFechaEstimada.classList.remove('hidden');
        }
        campoEstadoMacho.classList.add('hidden');
    }
});

btnGuardar.addEventListener('click', async () => {
    const uid = document.getElementById('form-uid').value;
    const scanId = document.getElementById('form-scan-id').value; 
    
    const nombre = document.getElementById('form-nombre').value;
    const sexo = selectSexo.value;
    const peso = parseInt(document.getElementById('form-peso').value) || 0;
    
    const edadAnos = parseInt(document.getElementById('form-edad-anos').value) || 0;
    const edadMeses = parseInt(document.getElementById('form-edad-meses').value) || 0;
    
    const edadTotalMeses = (edadAnos * 12) + edadMeses;
    const edadDecimal = edadAnos + (edadMeses / 12); 

    // --- VALIDACIONES BÁSICAS ---
    if (!nombre || !uid || peso <= 0) {
        alert("Error: Verifica todos los campos (Nombre, UID y Peso deben ser válidos).");
        return;
    }
    if (edadTotalMeses < 0 || edadAnos > 18) {
        alert("Error: La edad no puede ser negativa ni exceder los 18 años.");
        return;
    }
    // ---------------------------

    let datosGanado = {
        uid: uid, 
        nombre: nombre, 
        sexo: sexo, 
        peso: peso,
        edadAnos: edadAnos, 
        edadMeses: edadMeses, 
        edadDecimal: parseFloat(edadDecimal.toFixed(2)),
        // Campos de Hembra (Valores por defecto)
        partos: 0, 
        embarazada: false, 
        ultimoParto: null, 
        estimadaParto: null, 
        // Campo de Macho (Valor por defecto)
        estadoMacho: null
    };

    if (sexo === 'hembra') {
        datosGanado.partos = parseInt(inputPartos.value) || 0;
        datosGanado.embarazada = selectEmbarazada.value === 'true';
        datosGanado.ultimoParto = inputUltimoParto.value || null;
        datosGanado.estimadaParto = datosGanado.embarazada ? (inputFechaEstimada.value || null) : null;

        if (datosGanado.partos > edadAnos) { 
            alert("Error: El número de partos no puede ser mayor que la edad en años.");
            return; 
        }
        if (datosGanado.embarazada && edadTotalMeses < 12) {
            alert("Error: Una hembra debe tener al menos 1 año (12 meses) para estar registrada como embarazada.");
            return;
        }
    } else if (sexo === 'macho') {
        datosGanado.estadoMacho = selectEstadoMacho.value;
        // Los campos de hembra ya tienen valores por defecto de 0/null
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
        
        formularioUI.classList.add('hidden');
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
            // *** Protección anti-corrupción de datos ***
            // La validación es estricta para asegurar que solo datos completos se cachean.
            if (!animalData.uid || !animalData.nombre || !animalData.sexo || !doc.id) {
                 console.warn("Animal con datos faltantes o corruptos encontrado. Saltando:", animalData);
                 return; // Ignorar el animal corrupto
            }
            // *******************************************
            uidsDeGanado.add(doc.id);
            inventarioCache.push(animalData);
        });
        
        renderizarInventario(); 
        if (document.getElementById('pronostico').classList.contains('active')) {
            renderizarPronosticoPartos();
        }
        if (modalDetalleLoteUI.classList.contains('active') && loteActualDetalle) {
            // Se llama a mostrarDetallesLote(loteActualDetalle.id); al final de escucharLotes
        }
    });
}

// --- RENDERIZAR INVENTARIO GENERAL (Aplica Filtros) ---
function renderizarInventario() {
    inventarioUI.innerHTML = '';
    const filtroSexo = selectFiltroSexo.value; 
    const terminoBusqueda = inputBuscador.value.toLowerCase();
    
    // LÓGICA DE FILTRADO (Asegurando que 'todos' funciona)
    let listadoFiltrado = inventarioCache.filter(animal => {
        // Asegurar que solo trabajamos con datos válidos
        if (!animal.uid || !animal.nombre || !animal.sexo) return false; 

        const nombreUID = (animal.nombre + animal.uid).toLowerCase(); 

        // 1. FILTRO POR SEXO: Si es 'todos', siempre pasa.
        const pasaFiltroSexo = (filtroSexo === 'todos' || animal.sexo === filtroSexo);
        
        // 2. FILTRO POR BÚSQUEDA
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

        // Usamos || 0 para proteger contra valores undefined en datos antiguos
        const edadAnos = animal.edadAnos || 0; 
        const edadMeses = animal.edadMeses || 0; 

        let edadTexto = '';
        if (edadAnos > 0) edadTexto += `${edadAnos} años`;
        if (edadMeses > 0) {
            if (edadAnos > 0) edadTexto += `, `;
            edadTexto += `${edadMeses} meses`;
        }
        if (edadTexto === '') edadTexto = `Menos de 1 mes`;


        let htmlCamposExtra = '';
        let colorSexo = animal.sexo === 'hembra' ? 'text-pink-600' : 'text-blue-600';

        if (animal.sexo === 'hembra') {
            htmlCamposExtra += `<p>Partos: ${animal.partos || 0}</p>`;

            if (animal.embarazada) {
                const fechaEstimadaFmt = formatearFecha(animal.estimadaParto);
                htmlCamposExtra += `<p class="font-bold text-green-700">Embarazada: Sí</p>`;
                htmlCamposExtra += `<p>F. Estimada Parto: ${fechaEstimadaFmt}</p>`;
            } else {
                htmlCamposExtra += `<p>Embarazada: No</p>`;
            }
            
            if (animal.ultimoParto) {
                const fechaOptima = calcularFechaOptima(animal.ultimoParto);
                if (fechaOptima) {
                    htmlCamposExtra += `<p class="text-blue-600">F. Óptima Repro: ${fechaOptima}</p>`; 
                }
            }

        } else if (animal.sexo === 'macho') {
            let estadoTexto = animal.estadoMacho === 'reproduccion' ? 'Reproducción' : 'Venta / Engorde';
            htmlCamposExtra += `<p>Estado: <strong>${estadoTexto}</strong></p>`;
            
            // 🛑 CORRECCIÓN DEL ERROR DE TIPO (TypeError)
            // Verificar que lote.animales exista (no sea undefined) antes de usar .includes()
            const loteAsignado = lotesCache.find(lote => lote.animales && lote.animales.includes(animalId)); 
            
            if (loteAsignado) {
                htmlCamposExtra += `<p class="text-orange-600">Lote Asignado: <strong>${loteAsignado.nombre || 'Sin nombre'}</strong></p>`;
            } else if (animal.estadoMacho === 'venta') {
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
            <p>Edad: ${edadTexto}</p>
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

// Asocia eventos de búsqueda y filtro
inputBuscador.addEventListener('input', renderizarInventario);
selectFiltroSexo.addEventListener('change', renderizarInventario);

// --- ELIMINAR ANIMAL DEL INVENTARIO ---
inventarioUI.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-eliminar')) {
        const uid = e.target.dataset.uid;
        const animal = inventarioCache.find(a => a.uid === uid);

        if (!confirm(`¿Estás seguro de que quieres eliminar a ${animal.nombre} (UID: ${uid}) del inventario? Esta acción es irreversible.`)) return;

        try {
            const ganadoRef = doc(db, "ganado", uid);
            await deleteDoc(ganadoRef);
            
            // Eliminar de cualquier lote al que pertenezca
            const batch = writeBatch(db);
            lotesCache.forEach(lote => {
                // Protección para lote.animales
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


// --- RENDERIZAR PRONÓSTICO DE PARTOS ---
function renderizarPronosticoPartos() {
    listaPronosticoUI.innerHTML = '';
    cargandoPronosticoUI.style.display = 'block';

    const hembrasEmbarazadas = inventarioCache
        .filter(animal => animal.sexo === 'hembra' && animal.embarazada && animal.estimadaParto)
        .map(animal => ({
            ...animal,
            // Protección: asegurar que el valor es una string de fecha válida
            fechaParto: new Date((animal.estimadaParto || '') + 'T00:00:00') 
        }))
        .filter(animal => !isNaN(animal.fechaParto.getTime())) // Filtrar fechas inválidas
        .sort((a, b) => a.fechaParto - b.fechaParto);

    cargandoPronosticoUI.style.display = hembrasEmbarazadas.length === 0 ? 'block' : 'none';
    if (hembrasEmbarazadas.length === 0) {
        cargandoPronosticoUI.innerText = 'No hay hembras preñadas registradas con fecha estimada de parto.';
        return;
    }

    hembrasEmbarazadas.forEach(animal => {
        const item = document.createElement('div');
        item.className = 'p-4 bg-green-50 border-l-4 border-green-500 rounded-lg shadow-sm';
        
        const fechaFmt = formatearFecha(animal.estimadaParto);
        
        item.innerHTML = `
            <h3 class="text-lg font-semibold text-green-800">${animal.nombre} (UID: ${animal.uid})</h3>
            <p>Edad: ${animal.edadAnos || 0} años, ${animal.edadMeses || 0} meses</p>
            <p class="mt-1 font-bold">Fecha Estimada de Parto: <span class="text-xl">${fechaFmt}</span></p>
            <p>Partos Previos: ${animal.partos || 0}</p>
        `;
        listaPronosticoUI.appendChild(item);
    });
}


// --- LÓGICA DE LOTES DE VENTA (Simplificada) ---

// Actualiza la fecha de venta estimada en el formulario de lote
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
            // Protección: Asegurar que el array 'animales' siempre esté presente
            if (!loteData.animales) {
                loteData.animales = []; 
            }
            lotesCache.push({ id: doc.id, ...loteData });
        });
        
        renderizarLotes();
         // Actualiza los detalles del lote si el modal está abierto
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
        // Usar lote.animales.length sin riesgo ya que garantizamos que es un array en escucharLotes
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
    // Re-renderizar inventario para actualizar botones de "Asignar a Lote"
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
        animales: [] // Array de UIDs de animales
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
     // Si viene desde el modal de detalle de lote, filtramos animales que ya están en el lote
     // En este caso, el uidTemporalParaAsignacion es null
     abrirModalAsignacion(null);
});

function abrirModalAsignacion(uid = null) {
    uidAAsignarUI.textContent = uid || 'Múltiples animales';
    listaLotesModalUI.innerHTML = '<p id="modal-cargando" class="text-sm text-gray-500">Cargando lotes disponibles...</p>';
    modalAsignarLoteUI.classList.add('active');
    
    // Renderizar la lista de lotes disponibles
    listaLotesModalUI.innerHTML = '';
    if (lotesCache.length === 0) {
         listaLotesModalUI.innerHTML = '<p class="text-gray-600">No hay lotes de venta disponibles. Crea uno primero.</p>';
         return;
    }
    
    lotesCache.forEach(lote => {
        // Si estamos añadiendo desde el modal de detalle, excluimos el lote actual
        if (loteActualDetalle && lote.id === loteActualDetalle.id) return;
        
        const animalesEnLote = lote.animales.length;
        
        const button = document.createElement('button');
        button.className = 'w-full text-left p-3 border rounded hover:bg-blue-50';
        button.innerHTML = `
            <span class="font-semibold">${lote.nombre}</span> 
            <span class="text-sm text-gray-600">(${animalesEnLote} animales)</span><br>
            <span class="text-xs text-red-500">Venta Estimada: ${formatearFecha(lote.fechaVentaEstimada)}</span>
        `;
        
        // Usamos una función anónima para pasar uid y lote.id
        button.addEventListener('click', () => asignarAnimalALote(uid, lote.id));
        listaLotesModalUI.appendChild(button);
    });
}

// CERRAR MODALES
btnCerrarModal.addEventListener('click', () => { modalAsignarLoteUI.classList.remove('active'); });
btnCerrarDetalleModal.addEventListener('click', () => { modalDetalleLoteUI.classList.remove('active'); loteActualDetalle = null; });


// FUNCIÓN DE ASIGNACIÓN FINAL
async function asignarAnimalALote(uid, loteId) {
    if (!uid) return; // Validación básica
    
    const animalRef = doc(db, "ganado", uid);
    const loteRef = doc(db, "lotes_venta", loteId);

    try {
        // 1. Agregar UID al array 'animales' del lote
        await updateDoc(loteRef, {
            animales: arrayUnion(uid)
        });
        
        // 2. Opcional: Actualizar el estado del animal si es necesario
        await updateDoc(animalRef, {
            estadoMacho: 'venta' // Asegurarse de que esté en estado de venta
        });

        alert(`Animal ${uid} asignado al lote con éxito.`);
        modalAsignarLoteUI.classList.remove('active');
        uidTemporalParaAsignacion = null;
        
        // Si estamos en el modal de detalle, lo actualizamos
        // Nota: EscucharLotes() y EscucharInventario() se encargarán de actualizar la caché
        
    } catch (error) {
        console.error("Error al asignar animal a lote:", error);
        alert("Error al asignar el animal al lote.");
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

    // Usar el array 'animales' que ya garantizamos es un array
    const uidsEnLote = loteActualDetalle.animales; 
    
    // Estadísticas
    detalleStatsCantidadUI.textContent = uidsEnLote.length;
    let pesoTotal = 0;
    let edadTotalMeses = 0;
    let animalesEncontrados = [];
    
    uidsEnLote.forEach(uid => {
        const animal = inventarioCache.find(a => a.uid === uid);
        if (animal) {
            animalesEncontrados.push(animal);
            pesoTotal += (animal.peso || 0);
            // Usar || 0 para proteger datos antiguos
            edadTotalMeses += ((animal.edadAnos || 0) * 12) + (animal.edadMeses || 0);
        }
    });

    const count = animalesEncontrados.length;
    detalleStatsPesoUI.textContent = count > 0 ? `${(pesoTotal / count).toFixed(1)} kg` : '0 kg';
    detalleStatsEdadUI.textContent = count > 0 ? `${(edadTotalMeses / count / 12).toFixed(1)} años` : '0 años';

    // Lista de Animales
    detalleLoteAnimalesUI.innerHTML = '';
    if (count === 0) {
         detalleLoteAnimalesUI.innerHTML = '<p class="text-gray-600">No hay animales asignados a este lote.</p>';
         return;
    }
    
    animalesEncontrados.forEach(animal => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center p-2 bg-white border rounded';
        item.innerHTML = `
            <span class="font-medium">${animal.nombre} (UID: ${animal.uid})</span>
            <div class="flex items-center space-x-2">
                 <span class="text-sm text-gray-700">${animal.peso || 0} kg / ${animal.edadAnos || 0} años</span>
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

        if (!confirm(`¿Estás seguro de que quieres quitar al animal ${uid} del lote?`)) return;

        const loteRef = doc(db, "lotes_venta", loteId);
        const animalRef = doc(db, "ganado", uid);
        
        try {
            // 1. Quitar UID del array 'animales' del lote
            await updateDoc(loteRef, {
                animales: arrayRemove(uid)
            });
            
            // 2. Opcional: Revertir el estado del animal a 'reproduccion'
            await updateDoc(animalRef, {
                estadoMacho: 'reproduccion'
            });

            alert(`Animal ${uid} quitado del lote.`);
            // La actualización se manejará automáticamente por onSnapshot/escucharLotes

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
    loteActualDetalle.animales.forEach(uid => { // Garantizado que es un array
        const animalRef = doc(db, "ganado", uid);
        batch.delete(animalRef);
    });

    try {
        await batch.commit();
        alert(`Lote "${nombreLote}" vendido y ${loteActualDetalle.animales.length} animales eliminados del inventario.`);
        modalDetalleLoteUI.classList.remove('active');
        loteActualDetalle = null;
        // La actualización se manejará automáticamente por onSnapshot/escucharLotes
    } catch (error) {
        console.error("Error al vender lote:", error);
        alert("Error al vender el lote. Revise la consola.");
    }
});