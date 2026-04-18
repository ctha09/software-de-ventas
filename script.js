let carritoVentas = [];
let DB_PRODUCTOS = [];
let totalVentaActual = 0;
let miGrafico = null;

// --- 1. CARGA E INICIALIZACIÓN ---
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
        // REDONDEO PARA ARRIBA EN CADA ITEM
        const subtotal = Math.ceil(item.pr * item.cant);
        totalAcumulado += subtotal;

        tbody.innerHTML += `
            <tr>
                <td>${item.det}</td>
                <td>$${item.pr.toFixed(2)}</td>
                <td>${item.cant.toFixed(3)}</td>
                <td style="font-weight:bold;">$ ${subtotal}</td>
                <td>
                    <button class="btn-delete-item" onclick="eliminarItemCarrito(${item.id_temp})">
                        <i class="fas fa-trash-alt"></i>
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
    if (carritoVentas.length > 0 && confirm("¿Vaciar toda la venta actual?")) {
        carritoVentas = [];
        actualizarTablaVentas();
    }
}

// --- 3. COBRO E IMPRESIÓN ---
function abrirModalCobro() {
    if (carritoVentas.length === 0) return;
    document.getElementById('cobro-total-display').innerText = `$ ${totalVentaActual}`;
    document.getElementById('pago-recibido').value = ''; 
    document.getElementById('cobro-vuelto-display').innerText = `$ 0`;
    document.getElementById('modal-cobro').style.display = 'flex';
    setTimeout(() => document.getElementById('pago-recibido').focus(), 200);
}

function calcularVuelto() {
    const recibido = parseFloat(document.getElementById('pago-recibido').value) || 0;
    const vuelto = recibido - totalVentaActual;
    const displayVuelto = document.getElementById('cobro-vuelto-display');
    
    if (vuelto < 0) {
        displayVuelto.innerText = `$ 0`;
        displayVuelto.style.color = 'var(--danger)';
    } else {
        displayVuelto.innerText = `$ ${Math.floor(vuelto)}`;
        displayVuelto.style.color = 'var(--accent)';
    }
}

function cerrarModalCobro() {
    document.getElementById('modal-cobro').style.display = 'none';
}

function generarTicketImpresion(ticketData) {
    const container = document.getElementById('ticket-print');
    let itemsHtml = '';
    ticketData.items.forEach(i => {
        itemsHtml += `
            <tr><td colspan="2">${i.det}</td></tr>
            <tr><td>${i.cant.toFixed(3)} x $${i.pr}</td><td style="text-align:right">$${Math.ceil(i.pr*i.cant)}</td></tr>`;
    });

    container.innerHTML = `
        <div style="text-align:center;">
            <h2 style="margin:0;">LA BARRICA</h2>
            <p style="margin:2px 0;">${ticketData.fecha}</p>
            <p style="margin:2px 0;">${ticketData.tipo_comprobante}</p>
        </div>
        <p>----------------------------</p>
        <table style="width:100%; font-size:10px;">${itemsHtml}</table>
        <p>----------------------------</p>
        <div style="font-size:14px; font-weight:bold; display:flex; justify-content:space-between;">
            <span>TOTAL:</span> <span>$${ticketData.total}</span>
        </div>
        <p style="font-size:10px; margin-top:10px;">
            PAGO: ${ticketData.metodo_pago}<br>
            RECIBIDO: $${ticketData.recibido}<br>
            VUELTO: $${ticketData.vuelto}
        </p>
        <div style="text-align:center; margin-top:10px;">
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
        window.print();
    }

    try {
        await window.fs.addDoc(window.fs.collection(window.db, "ventas"), ticket);
        alert("✅ Venta Guardada");
        carritoVentas = [];
        actualizarTablaVentas();
        cerrarModalCobro();
    } catch (e) {
        alert("Error al guardar en la base de datos");
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
            const [fechaVenta] = data.fecha.split(','); 
            const [d, m, y] = fechaVenta.trim().split('/');
            const fechaFormateada = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;

            if (fechaFormateada === fechaSeleccionada) {
                ventasDia.push(data);
                if (totales[data.metodo_pago] !== undefined) {
                    totales[data.metodo_pago] += data.total;
                }
            }
        });

        renderizarHistorial(ventasDia, totales);
        actualizarGrafico(totales);
    } catch (e) {
        console.error("Error historial:", e);
    }
}

function renderizarHistorial(ventas, totales) {
    document.getElementById('res-efectivo').innerText = `$ ${totales["Efectivo"]}`;
    document.getElementById('res-credito').innerText = `$ ${totales["Tarjeta de Credito"]}`;
    document.getElementById('res-debito').innerText = `$ ${totales["Tarjeta de Debito"]}`;
    document.getElementById('res-transf').innerText = `$ ${totales["Transferencia"]}`;

    const tbody = document.getElementById('tabla-historial-body');
    tbody.innerHTML = '';
    ventas.reverse().forEach(v => {
        const hora = v.fecha.split(',')[1];
        tbody.innerHTML += `
            <tr>
                <td>${hora}</td>
                <td>${v.tipo_comprobante}</td>
                <td>${v.metodo_pago}</td>
                <td style="font-weight:800;">$ ${v.total}</td>
                <td><button class="btn-edit-item" onclick="alert('Funcionalidad de detalle en desarrollo')"><i class="fas fa-eye"></i></button></td>
            </tr>
        `;
    });
}

function actualizarGrafico(totales) {
    const ctx = document.getElementById('graficoVentas').getContext('2d');
    if (miGrafico) { miGrafico.destroy(); }
    miGrafico = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Efectivo', 'T. Crédito', 'T. Débito', 'Transferencia'],
            datasets: [{
                label: 'Monto ($)',
                data: [totales["Efectivo"], totales["Tarjeta de Credito"], totales["Tarjeta de Debito"], totales["Transferencia"]],
                backgroundColor: ['#22c55e', '#38bdf8', '#a855f7', '#f59e0b'],
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#fff' } },
                x: { ticks: { color: '#fff' } }
            }
        }
    });
}

// --- 5. GESTIÓN DE ARTÍCULOS ---
function abrirModalProducto() { document.getElementById('modal-producto').style.display = 'flex'; }
function cerrarModalProducto() { document.getElementById('modal-producto').style.display = 'none'; }

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

function cerrarModalEditar() { document.getElementById('modal-editar').style.display = 'none'; }

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
    if (confirm("¿Eliminar producto?")) {
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
        tbody.innerHTML += `
            <tr>
                <td><code>${p.cod}</code></td>
                <td>${p.det}</td>
                <td>$${parseFloat(p.pr).toFixed(2)}</td>
                <td style="color:${p.stock <= 5 ? 'red' : 'white'}">${p.stock}</td>
                <td>
                    <button class="btn-edit-item" onclick="prepararEdicion('${p.cod}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-delete-item" onclick="eliminarArticuloSistema('${p.cod}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    });
}

function filtrarArticulos(val) {
    const f = DB_PRODUCTOS.filter(p => p.det.toLowerCase().includes(val.toLowerCase()) || p.cod.includes(val));
    renderizarTablaInventario(f);
}

// Inicio diferido para esperar a Firebase
setTimeout(inicializar, 1500);
