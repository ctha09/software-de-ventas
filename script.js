let carritoVentas = [];

const DB_ALMACENAMIENTO = [
    { cod: '00087', det: 'PELON KG', pr: 10500 },
    { cod: '7791813444381', det: '7UP 2.25L', pr: 2200 },
    { cod: '00010', det: 'PAPA NEGRA KG', pr: 800 },
    { cod: '7790000000123', det: 'GALLETITAS OREO', pr: 1500 }
];

// --- NAVEGACIÓN ---
function abrirVentas() {
    document.getElementById('modal-ventas').style.display = 'flex';
    document.getElementById('fecha-venta').value = new Date().toLocaleDateString();
    resetFocus();
}

function cerrarVentas() {
    document.getElementById('modal-ventas').style.display = 'none';
}

function abrirBuscadorManual() {
    document.getElementById('modal-buscador').style.display = 'flex';
    const tbody = document.getElementById('lista-busqueda-manual');
    tbody.innerHTML = '';
    DB_ALMACENAMIENTO.forEach(p => {
        tbody.innerHTML += `
            <tr onclick="seleccionarArticuloManual('${p.cod}')" style="cursor:pointer">
                <td>${p.cod}</td>
                <td>${p.det}</td>
                <td>$${p.pr}</td>
            </tr>`;
    });
}

function cerrarBuscadorManual() {
    document.getElementById('modal-buscador').style.display = 'none';
    resetFocus();
}

function seleccionarArticuloManual(codigo) {
    const producto = DB_ALMACENAMIENTO.find(p => p.cod === codigo);
    if(producto) {
        agregarAlCarrito(producto, 1, false);
        cerrarBuscadorManual();
    }
}

// --- LÓGICA DEL LECTOR ---
function manejarLector(e) {
    if (e.key === 'Enter') {
        const input = e.target.value.trim();
        if (!input) return;

        let codigoBuscar = input;
        let cantidad = 1;
        let esPesable = false;

        // Procesar código Systel (Balanza) - Ejemplo: 20 00010 00800 5
        if (input.length === 13 && input.startsWith('20')) {
            esPesable = true;
            codigoBuscar = input.substring(2, 7); 
            cantidad = parseFloat(input.substring(7, 12)) / 1000;
        }

        const producto = DB_ALMACENAMIENTO.find(p => p.cod === codigoBuscar);

        if (producto) {
            agregarAlCarrito(producto, cantidad, esPesable);
        } else {
            alert("Producto no encontrado: " + codigoBuscar);
        }

        e.target.value = ''; 
        resetFocus();        
    }
}

function resetFocus() {
    setTimeout(() => {
        const lector = document.getElementById('lector-barras');
        if (lector) lector.focus();
    }, 10);
}

function agregarAlCarrito(prod, cant, pesable) {
    if (!pesable) {
        const existe = carritoVentas.find(i => i.cod === prod.cod && !i.esPesable);
        if (existe) {
            existe.cant += 1;
            actualizarTablaVentas();
            return;
        }
    }
    carritoVentas.push({ ...prod, cant: cant, esPesable: pesable });
    actualizarTablaVentas();
}

function actualizarTablaVentas() {
    const tbody = document.getElementById('lista-ventas-items');
    tbody.innerHTML = '';
    let subtotal = 0;

    carritoVentas.forEach((item, index) => {
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
    document.getElementById('total-final').innerText = `$${subtotal.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
}

// --- LISTENERS GLOBALES ---
window.addEventListener('keydown', e => {
    if (e.key === 'F6') { e.preventDefault(); abrirVentas(); }
    if (e.key === 'F4') { 
        if(document.getElementById('modal-ventas').style.display === 'flex') {
            e.preventDefault(); 
            abrirBuscadorManual(); 
        }
    }
    if (e.key === 'Escape') { 
        cerrarBuscadorManual();
        cerrarVentas(); 
    }
});

setInterval(() => {
    const clock = document.getElementById('clock');
    if (clock) clock.innerText = new Date().toLocaleTimeString();
}, 1000);
