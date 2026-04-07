let carritoVentas = [];

// Simulación de Base de Datos (Aquí cargarás tus datos de PostgreSQL)
const DB_ALMACENAMIENTO = [
    { cod: '00087', det: 'PELON KG', pr: 10500 },
    { cod: '7791813444381', det: '7UP 2.25L', pr: 2200 },
    { cod: '00010', det: 'PAPA NEGRA KG', pr: 800 }
];

// --- FUNCIONES DE NAVEGACIÓN ---
function abrirVentas() {
    document.getElementById('modal-ventas').style.display = 'flex';
    document.getElementById('fecha-venta').value = new Date().toLocaleDateString();
    resetFocus();
}

function cerrarVentas() {
    document.getElementById('modal-ventas').style.display = 'none';
    // No limpiamos el carrito aquí por seguridad, solo al guardar.
}

function abrirArticulos() { alert("Módulo de Artículos"); }

// --- LÓGICA DEL LECTOR (CORREGIDA PARA ESCANEO CONTINUO) ---
async function manejarLector(e) {
    if (e.key === 'Enter') {
        const input = e.target.value.trim();
        if (!input) return;

        let codigoBuscar = input;
        let cantidad = 1;
        let esPesable = false;

        // Procesar código Systel (Balanza)
        if (input.length === 13 && input.startsWith('20')) {
            esPesable = true;
            codigoBuscar = input.substring(2, 7); 
            cantidad = parseFloat(input.substring(7, 12)) / 1000;
        }

        // Búsqueda Dinámica
        const producto = DB_ALMACENAMIENTO.find(p => p.cod === codigoBuscar);

        if (producto) {
            agregarAlCarrito(producto, cantidad, esPesable);
        } else {
            alert("Producto no encontrado: " + codigoBuscar);
        }

        // --- SOLUCIÓN AL SEGUNDO ESCANEO ---
        e.target.value = ''; // Limpia el texto actual
        resetFocus();        // Devuelve el cursor al input inmediatamente
    }
}

function resetFocus() {
    const lector = document.getElementById('lector-barras');
    if (lector) {
        lector.focus();
    }
}

function agregarAlCarrito(prod, cant, pesable) {
    // Si no es de balanza y ya existe, sumamos cantidad
    if (!pesable) {
        const existe = carritoVentas.find(i => i.cod === prod.cod && !i.esPesable);
        if (existe) {
            existe.cant += 1;
            actualizarTablaVentas();
            return;
        }
    }
    // Si es pesable o producto nuevo, línea nueva
    carritoVentas.push({ ...prod, cant: cant, esPesable: pesable });
    actualizarTablaVentas();
}

function actualizarTablaVentas() {
    const tbody = document.getElementById('lista-ventas-items');
    tbody.innerHTML = '';
    let subtotal = 0;

    carritoVentas.forEach((item) => {
        const totalLinea = item.cant * item.pr;
        subtotal += totalLinea;
        const cantTxt = item.esPesable ? `${item.cant.toFixed(3)} kg` : item.cant;

        tbody.innerHTML += `
            <tr>
                <td>${item.cod}</td>
                <td>${cantTxt}</td>
                <td>${item.det}</td>
                <td>$${item.pr.toFixed(2)}</td>
                <td>0%</td>
                <td>$${totalLinea.toFixed(2)}</td>
            </tr>`;
    });
    document.getElementById('total-final').innerText = `$${subtotal.toFixed(2)}`;
}

// --- LISTENERS GLOBALES ---
window.addEventListener('keydown', e => {
    if (e.key === 'F6') { e.preventDefault(); abrirVentas(); }
    if (e.key === 'Escape') { cerrarVentas(); }
});

setInterval(() => {
    const clock = document.getElementById('clock');
    if (clock) clock.innerText = new Date().toLocaleTimeString();
}, 1000);
