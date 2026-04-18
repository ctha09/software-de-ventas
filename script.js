let carritoVentas = [];
let DB_PRODUCTOS = [];
let totalVentaActual = 0;
let miGrafico = null;

// --- 1. INICIALIZACIÓN Y CARGA ---
async function inicializar() {
    try {
        const querySnapshot = await window.fs.getDocs(window.fs.collection(window.db, "articulos"));
        DB_PRODUCTOS = [];
        querySnapshot.forEach(doc => {
            DB_PRODUCTOS.push(doc.data());
        });
        console.log("📦 Inventario sincronizado");
        renderizarTablaInventario();
    } catch (error) {
        console.error("Error al sincronizar:", error);
    }
}

// --- 2. LÓGICA DE VENTAS (CAJA) ---
function manejarLector(e) {
    if (e.key === 'Enter') {
        const input = e.target.value.trim();
        if (!input) return;

        let codigoABuscar = input;
        let cantidad = 1;

        // Soporte para balanza (Ej: 20 00123 01500 -> Código 00123, Peso 1.500kg)
        if (input.startsWith('20') && input.length >= 12) {
            codigoABuscar = input.substring(2, 7);
            cantidad = parseInt(input.substring(7, 12)) / 1000;
        }

        const prod = DB_PRODUCTOS.find(p => String(p.cod) === String(codigoABuscar));

        if (prod) {
            carritoVentas.push({
                id_temp: Date.now() + Math.random(),
                cod: prod.cod,
                det: prod.det,
                pr: parseFloat(prod.pr),
                cant: cantidad
            });
            actualizarTablaVentas();
        } else {
            alert("⚠️ Producto no encontrado: " + codigoABuscar);
        }
        e.target.value = '';
    }
}

function actualizarTablaVentas() {
    const tbody = document.getElementById('lista-ventas-items');
    tbody.innerHTML = '';
    let totalAcumulado = 0;

    carritoVentas.forEach(item => {
        // Redondeo hacia arriba por cada línea
        const subtotal = Math.ceil(item.pr * item.cant);
        totalAcumulado += subtotal;

        tbody.innerHTML += `
            <tr>
                <td>${item.det}</td>
                <td>$${item.pr.toFixed(2)}</td>
                <td>${item.cant.toFixed(3)}</td>
                <td style="font-weight:bold;">$ ${subtotal}</td>
                <td>
                    <button class="btn-clear" style="padding:5px 10px; width:auto;" onclick="eliminarItemCarrito(${item.id_temp})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    totalVentaActual = totalAcumulado;
    document.getElementById('total-final').innerText = `$ ${totalVentaActual}`;
}

function eliminarItemCarrito(idTemp) {
    carritoVentas = carritoVentas.filter(i => i.id_temp !== idTemp);
    actualizarTablaVentas();
}

function limpiarCarritoCompleto() {
    if (carritoVentas.length > 0 && confirm("¿Vaciar venta?")) {
        carritoVentas = [];
        actualizarTablaVentas();
    }
}

// --- 3. COBRO E IMPRESIÓN ---
function abrirModalCobro() {
    if (carritoVentas.length === 0) return;
    document.getElementById('cobro-total-display').innerText = `$ ${totalVentaActual}`;
    document.getElementById('pago-recibido').value = ''; 
    document.getElementById('cobro-vuelto-display').innerText = `Vuelto: $ 0`;
    document.getElementById('modal-cobro').style.display = 'flex';
    setTimeout(() => document.getElementById('pago-recibido').focus(), 200);
}

function calcularVuelto() {
    const recibido = parseFloat(document.getElementById('pago-recibido').value) || 0;
    const vuelto = recibido - totalVentaActual;
    const display = document.getElementById('cobro-vuelto-display');
    display.innerText = `Vuelto: $ ${vuelto > 0 ? Math.floor(vuelto) : 0}`;
}

function cerrarModalCobro() {
    document.getElementById('modal-cobro').style.display = 'none';
}

function generarTicketImpresion(t) {
    const container = document.getElementById('ticket-print');
    let itemsHtml = '';
    t.items.forEach(i => {
        itemsHtml += `
            <tr><td colspan="2">${i.det}</td></tr>
            <tr><td>${i.cant.toFixed(3)} x $${i.pr}</td><td style="text-align:right">$${Math.ceil(i.pr*i.cant)}</td></tr>`;
    });

    container.innerHTML = `
        <div style="text-align:center; font-size:12px;">
            <h2 style="margin:0;">LA BARRICA</h2>
            <p style="margin:2px 0;">${t.fecha}</p>
            <p style="margin:2px 0;">${t.tipo_comprobante}</p>
        </div>
        <p>----------------------------</p>
        <table style="width:100%; font-size:11px;">${itemsHtml}</table>
        <p>----------------------------</p>
        <div style="font-size:14px; font-weight:bold; display:flex; justify-content:space-between;">
            <span>TOTAL:</span> <span>$${t.total}</span>
        </div>
        <p style="font-size:11px; margin-top:10px;">
            PAGO: ${t.metodo_pago}<br>
            RECIBIDO: $${t.recibido}<br>
            VUELTO: $${t.vuelto}
        </p>
        <div style="text-align:center; margin-top:10px; font-size:10px;">
            <p>*** GRACIAS POR SU COMPRA ***</p>
        </div>
    `;
}

async function finalizarYRegistrarVenta(debeImprimir) {
    const recibido = parseFloat(document.getElementById('pago-recibido').value) || 0;
    const metodoPago = document.getElementById('tipo-pago').value;
    const vuelto = Math.max(0, recibido - totalVentaActual);

    const ticket = {
        fecha: new Date().toLocaleString('es-AR'),
        tipo_comprobante: document.getElementById('tipo-doc').value,
        metodo_pago: metodoPago,
        items: carritoVentas,
        total: totalVentaActual,
        recibido: recibido,
        vuelto: vuelto
    };

    if (debeImprimir) {
        generarTicketImpresion(ticket);
        setTimeout(() => { window.print(); }, 500); // Tiempo para que el navegador cargue el ticket
    }

    try {
        await window.fs.addDoc(window.fs.collection(window.db, "ventas"), ticket);
        carritoVentas = [];
        actualizarTablaVentas();
        cerrarModalCobro();
    } catch (e) {
        alert("Error al guardar venta");
    }
}

// --- 4. HISTORIAL Y GRÁFICOS ---
async function cargarHistorial() {
    const fechaSeleccionada = document.getElementById('filtro-fecha').value; 
    if (!fechaSeleccionada) return;

    try {
        const q = window.fs.query(window.fs.collection(window.db, "ventas"));
        const snapshot = await window.fs.getDocs(q);
        
        let ventasDia = [];
        let totales = { "Efectivo": 0, "Tarjeta de Credito": 0, "Tarjeta de Debito": 0, "Transferencia": 0 };

        snapshot.forEach(doc => {
            const data = doc.data();
            const [f] = data.fecha.split(','); 
            const [d, m, y] = f.trim().split('/');
            const fFormateada = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;

            if (fFormateada === fechaSeleccionada) {
                ventasDia.push(data);
                if (totales[data.metodo_pago] !== undefined) totales[data.metodo_pago] += data.total;
            }
        });

        document.getElementById('res-efectivo').innerText = `$ ${totales["Efectivo"]}`;
        document.getElementById('res-credito').innerText = `$ ${totales["Tarjeta de Credito"]}`;
        document.getElementById('res-debito').innerText = `$ ${totales["Tarjeta de Debito"]}`;
        document.getElementById('res-transf').innerText = `$ ${totales["Transferencia"]}`;

        const tbody = document.getElementById('tabla-historial-body');
        tbody.innerHTML = '';
        ventasDia.reverse().forEach(v => {
            tbody.innerHTML += `<tr><td>${v.fecha.split(',')[1]}</td><td>${v.metodo_pago}</td><td>$${v.total}</td><td><button class="btn-confirm" style="padding:5px; width:auto;"><i class="fas fa-eye"></i></button></td></tr>`;
        });

        actualizarGrafico(totales);
    } catch (e) { console.error(e); }
}

function actualizarGrafico(t) {
    const ctx = document.getElementById('graficoVentas').getContext('2d');
    if (miGrafico) miGrafico.destroy();
    miGrafico = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Efectivo', 'Crédito', 'Débito', 'Transf.'],
            datasets: [{
                data: [t["Efectivo"], t["Tarjeta de Credito"], t["Tarjeta de Debito"], t["Transferencia"]],
                backgroundColor: ['#22c55e', '#38bdf8', '#a855f7', '#f59e0b']
            }]
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#fff' } }, x: { ticks: { color: '#fff' } } } }
    });
}

// --- 5. GESTIÓN DE ARTÍCULOS ---
async function subirProductoAFirebase() {
    const nuevo = {
        cod: document.getElementById('nuevo-cod').value,
        det: document.getElementById('nuevo-det').value.toUpperCase(),
        pr: parseFloat(document.getElementById('nuevo-pr').value),
        stock: parseInt(document.getElementById('nuevo-stock').value) || 0
    };
    await window.fs.addDoc(window.fs.collection(window.db, "articulos"), nuevo);
    cerrarModalProducto();
    inicializar();
}

function prepararEdicion(codigo) {
    const p = DB_PRODUCTOS.find(item => String(item.cod) === String(codigo));
    if (p) {
        document.getElementById('edit-id').value = p.cod;
        document.getElementById('edit-det').value = p.det;
        document.getElementById('edit-pr').value = p.pr;
        document.getElementById('edit-stock').value = p.stock;
        document.getElementById('modal-editar').style.display = 'flex';
    }
}

async function actualizarProductoEnFirebase() {
    const codBusqueda = document.getElementById('edit-id').value;
    const q = window.fs.query(window.fs.collection(window.db, "articulos"), window.fs.where("cod", "==", codBusqueda));
    const snapshot = await window.fs.getDocs(q);
    if (!snapshot.empty) {
        const docRef = window.fs.doc(window.db, "articulos", snapshot.docs[0].id);
        await window.fs.updateDoc(docRef, {
            det: document.getElementById('edit-det').value.toUpperCase(),
            pr: parseFloat(document.getElementById('edit-pr').value),
            stock: parseInt(document.getElementById('edit-stock').value)
        });
        cerrarModalEditar();
        inicializar();
    }
}

async function eliminarArticuloSistema(codigo) {
    if (confirm("¿Eliminar?")) {
        const q = window.fs.query(window.fs.collection(window.db, "articulos"), window.fs.where("cod", "==", codigo));
        const snapshot = await window.fs.getDocs(q);
        if (!snapshot.empty) {
            await window.fs.deleteDoc(window.fs.doc(window.db, "articulos", snapshot.docs[0].id));
            inicializar();
        }
    }
}

function renderizarTablaInventario(lista = DB_PRODUCTOS) {
    const tbody = document.getElementById('tabla-inventario-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    lista.forEach(p => {
        tbody.innerHTML += `<tr><td>${p.cod}</td><td>${p.det}</td><td>$${p.pr}</td><td>${p.stock}</td><td>
            <button class="btn-confirm" style="padding:5px; width:auto;" onclick="prepararEdicion('${p.cod}')"><i class="fas fa-edit"></i></button>
            <button class="btn-clear" style="padding:5px; width:auto;" onclick="eliminarArticuloSistema('${p.cod}')"><i class="fas fa-trash"></i></button>
        </td></tr>`;
    });
}

function filtrarArticulos(val) {
    const f = DB_PRODUCTOS.filter(p => p.det.toLowerCase().includes(val.toLowerCase()) || p.cod.includes(val));
    renderizarTablaInventario(f);
}

function cerrarModalProducto() { document.getElementById('modal-producto').style.display = 'none'; }
function cerrarModalEditar() { document.getElementById('modal-editar').style.display = 'none'; }
function abrirModalProducto() { document.getElementById('modal-producto').style.display = 'flex'; }

// Iniciar sistema
setTimeout(inicializar, 1000);
