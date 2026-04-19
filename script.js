let carritoVentas = [];
let DB_PRODUCTOS = [];
let totalVentaActual = 0;
let graficoGeneral = null;

// --- 1. INICIALIZACIÓN ---
async function inicializar() {
    try {
        const querySnapshot = await window.fs.getDocs(window.fs.collection(window.db, "articulos"));
        DB_PRODUCTOS = [];
        querySnapshot.forEach(doc => {
            DB_PRODUCTOS.push(doc.data());
        });
        console.log("📦 GestOK: Datos sincronizados");
        renderizarTablaInventario();
    } catch (error) {
        console.error("Error al sincronizar:", error);
    }
}

// --- 2. LÓGICA DE VENTAS (TERMINAL) ---
function manejarLector(e) {
    if (e.key === 'Enter') {
        const input = e.target.value.trim();
        if (!input) return;

        let codigoABuscar = input;
        let cantidad = 1;

        // Soporte para balanza (Ej: prefijo 20)
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
        const subtotal = Math.ceil(item.pr * item.cant);
        totalAcumulado += subtotal;

        tbody.innerHTML += `
            <tr>
                <td>${item.det}</td>
                <td>$${item.pr.toFixed(2)}</td>
                <td>${item.cant.toFixed(3)}</td>
                <td style="font-weight:bold;">$ ${subtotal}</td>
                <td style="text-align:right;">
                    <button class="btn-clear" style="padding:5px 10px; width:auto;" onclick="eliminarItemCarrito(${item.id_temp})">
                        <i class="fas fa-times"></i>
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
    if (carritoVentas.length > 0 && confirm("¿Desea vaciar el carrito?")) {
        carritoVentas = [];
        actualizarTablaVentas();
    }
}

// --- 3. COBRO Y TICKETS ---
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
    document.getElementById('cobro-vuelto-display').innerText = `Vuelto: $ ${vuelto > 0 ? Math.floor(vuelto) : 0}`;
}

function cerrarModalCobro() {
    document.getElementById('modal-cobro').style.display = 'none';
}

async function finalizarYRegistrarVenta(debeImprimir) {
    if (carritoVentas.length === 0) return;

    const metodoPago = document.getElementById('tipo-pago').value;
    const ticket = {
        fecha: new Date().toLocaleString('es-AR'),
        tipo_comprobante: document.getElementById('tipo-doc').value,
        metodo_pago: metodoPago,
        items: carritoVentas,
        total: totalVentaActual
    };

    try {
        // Guardar venta
        await window.fs.addDoc(window.fs.collection(window.db, "ventas"), ticket);

        // Descontar stock
        for (const item of carritoVentas) {
            const q = window.fs.query(window.fs.collection(window.db, "articulos"), window.fs.where("cod", "==", String(item.cod)));
            const snap = await window.fs.getDocs(q);
            if (!snap.empty) {
                const docRef = window.fs.doc(window.db, "articulos", snap.docs[0].id);
                const stockActual = snap.docs[0].data().stock || 0;
                await window.fs.updateDoc(docRef, { stock: stockActual - item.cant });
            }
        }

        if (debeImprimir) {
            generarTicketImpresion(ticket);
            setTimeout(() => { window.print(); }, 500);
        }

        alert("✅ Venta realizada");
        carritoVentas = [];
        actualizarTablaVentas();
        cerrarModalCobro();
        inicializar();

    } catch (e) {
        console.error(e);
        alert("Error al procesar la operación.");
    }
}

function generarTicketImpresion(t) {
    const container = document.getElementById('ticket-print');
    let itemsHtml = '';
    t.items.forEach(i => {
        itemsHtml += `<tr><td colspan="2">${i.det}</td></tr>
        <tr><td>${i.cant.toFixed(3)} x $${i.pr}</td><td style="text-align:right">$${Math.ceil(i.pr*i.cant)}</td></tr>`;
    });

    container.innerHTML = `
        <div style="text-align:center; font-size:12px;">
            <h2 style="margin:0;">GestOK</h2>
            <p style="margin:2px 0;">Comprobante de Venta</p>
            <p style="margin:2px 0;">${t.fecha}</p>
        </div>
        <p>----------------------------</p>
        <table style="width:100%; font-size:11px;">${itemsHtml}</table>
        <p>----------------------------</p>
        <div style="font-size:14px; font-weight:bold; display:flex; justify-content:space-between;">
            <span>TOTAL:</span> <span>$${t.total}</span>
        </div>
    `;
}

// --- 4. HISTORIAL DIARIO ---
async function cargarHistorial() {
    const fechaSeleccionada = document.getElementById('filtro-fecha').value; 
    if (!fechaSeleccionada) return;

    try {
        const snapshot = await window.fs.getDocs(window.fs.collection(window.db, "ventas"));
        let totales = { "Efectivo": 0, "Tarjeta de Credito": 0, "Tarjeta de Debito": 0, "Transferencia": 0 };
        const tbody = document.getElementById('tabla-historial-body');
        tbody.innerHTML = '';

        snapshot.forEach(doc => {
            const data = doc.data();
            const [f] = data.fecha.split(','); 
            const [d, m, y] = f.trim().split('/');
            const fFormateada = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;

            if (fFormateada === fechaSeleccionada) {
                if (totales[data.metodo_pago] !== undefined) totales[data.metodo_pago] += data.total;
                tbody.innerHTML += `<tr><td>${data.fecha.split(',')[1]}</td><td>${data.metodo_pago}</td><td>$${data.total}</td><td><i class="fas fa-eye"></i></td></tr>`;
            }
        });

        document.getElementById('res-efectivo').innerText = `$ ${totales["Efectivo"]}`;
        document.getElementById('res-credito').innerText = `$ ${totales["Tarjeta de Credito"]}`;
        document.getElementById('res-debito').innerText = `$ ${totales["Tarjeta de Debito"]}`;
        document.getElementById('res-transf').innerText = `$ ${totales["Transferencia"]}`;

    } catch (e) { console.error(e); }
}

// --- 5. ESTADÍSTICAS AVANZADAS ---
async function cargarEstadisticas() {
    const tipo = document.getElementById('tipo-grafica').value;
    const mesSeleccionado = document.getElementById('filtro-mes-estadistica').value;
    const [anioSel, mesSel] = mesSeleccionado.split('-');

    try {
        const snapshot = await window.fs.getDocs(window.fs.collection(window.db, "ventas"));
        let datosAgrupados = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const [fechaParte] = data.fecha.split(',');
            const [d, m, y] = fechaParte.trim().split('/');
            
            const itemMes = m.padStart(2, '0');
            const itemAnio = y;
            const itemDia = d.padStart(2, '0');

            if (tipo === 'diaria') {
                if (itemAnio === anioSel && itemMes === mesSel) {
                    const etiqueta = `${itemDia}/${itemMes}`;
                    datosAgrupados[etiqueta] = (datosAgrupados[etiqueta] || 0) + data.total;
                }
            } else {
                if (itemAnio === anioSel) {
                    const nombreMes = obtenerNombreMes(parseInt(itemMes));
                    datosAgrupados[nombreMes] = (datosAgrupados[nombreMes] || 0) + data.total;
                }
            }
        });

        const etiquetas = Object.keys(datosAgrupados).sort();
        const valores = etiquetas.map(k => datosAgrupados[k]);
        renderizarGraficoGeneral(etiquetas, valores, tipo === 'diaria' ? 'Ventas del Mes ($)' : 'Ventas del Año ($)');

    } catch (e) { console.error(e); }
}

function renderizarGraficoGeneral(labels, data, titulo) {
    const ctx = document.getElementById('graficoGeneral').getContext('2d');
    if (graficoGeneral) graficoGeneral.destroy();
    graficoGeneral = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: titulo, data: data, backgroundColor: '#38bdf8', borderRadius: 5 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#fff' } } },
            scales: {
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
            }
        }
    });
}

function obtenerNombreMes(n) {
    return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][n - 1];
}

// --- 6. GESTIÓN DE ARTÍCULOS ---
async function subirProductoAFirebase() {
    const nuevo = {
        cod: document.getElementById('nuevo-cod').value,
        det: document.getElementById('nuevo-det').value.toUpperCase(),
        pr: parseFloat(document.getElementById('nuevo-pr').value),
        stock: parseFloat(document.getElementById('nuevo-stock').value) || 0
    };
    await window.fs.addDoc(window.fs.collection(window.db, "articulos"), nuevo);
    cerrarModalProducto();
    inicializar();
}

async function actualizarProductoEnFirebase() {
    const cod = document.getElementById('edit-id').value;
    const q = window.fs.query(window.fs.collection(window.db, "articulos"), window.fs.where("cod", "==", cod));
    const snap = await window.fs.getDocs(q);
    if (!snap.empty) {
        await window.fs.updateDoc(window.fs.doc(window.db, "articulos", snap.docs[0].id), {
            det: document.getElementById('edit-det').value.toUpperCase(),
            pr: parseFloat(document.getElementById('edit-pr').value),
            stock: parseFloat(document.getElementById('edit-stock').value)
        });
        cerrarModalEditar();
        inicializar();
    }
}

async function eliminarArticuloSistema(codigo) {
    if (confirm("¿Eliminar artículo?")) {
        const q = window.fs.query(window.fs.collection(window.db, "articulos"), window.fs.where("cod", "==", codigo));
        const snap = await window.fs.getDocs(q);
        if (!snap.empty) {
            await window.fs.deleteDoc(window.fs.doc(window.db, "articulos", snap.docs[0].id));
            inicializar();
        }
    }
}

function renderizarTablaInventario(lista = DB_PRODUCTOS) {
    const tbody = document.getElementById('tabla-inventario-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    lista.sort((a,b) => a.det.localeCompare(b.det)).forEach(p => {
        tbody.innerHTML += `<tr>
            <td>${p.cod}</td><td>${p.det}</td><td>$${p.pr}</td><td>${p.stock.toFixed(3)}</td>
            <td>
                <button class="btn-confirm" style="padding:5px; width:auto;" onclick="prepararEdicion('${p.cod}')"><i class="fas fa-edit"></i></button>
                <button class="btn-clear" style="padding:5px; width:auto;" onclick="eliminarArticuloSistema('${p.cod}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
}

function filtrarArticulos(val) {
    const f = DB_PRODUCTOS.filter(p => p.det.toLowerCase().includes(val.toLowerCase()) || p.cod.includes(val));
    renderizarTablaInventario(f);
}

function prepararEdicion(cod) {
    const p = DB_PRODUCTOS.find(x => x.cod === cod);
    if (p) {
        document.getElementById('edit-id').value = p.cod;
        document.getElementById('edit-det').value = p.det;
        document.getElementById('edit-pr').value = p.pr;
        document.getElementById('edit-stock').value = p.stock;
        document.getElementById('modal-editar').style.display = 'flex';
    }
}

function cerrarModalProducto() { document.getElementById('modal-producto').style.display = 'none'; }
function cerrarModalEditar() { document.getElementById('modal-editar').style.display = 'none'; }
function abrirModalProducto() { document.getElementById('modal-producto').style.display = 'flex'; }

// Inicio
setTimeout(inicializar, 1000);
