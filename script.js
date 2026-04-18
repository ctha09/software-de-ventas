let carritoVentas = [];
let DB_PRODUCTOS = [];
let totalVentaActual = 0;

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

function manejarLector(e) {
    if (e.key === 'Enter') {
        const input = e.target.value.trim();
        if (!input) return;

        let codigoABuscar = input;
        let cantidad = 1;

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
            alert("⚠️ Producto no encontrado");
        }
        e.target.value = '';
    }
}

function actualizarTablaVentas() {
    const tbody = document.getElementById('lista-ventas-items');
    tbody.innerHTML = '';
    let totalAcumulado = 0;

    carritoVentas.forEach(item => {
        const subtotal = Math.ceil(item.pr * item.cant); // Redondeo para arriba
        totalAcumulado += subtotal;
        tbody.innerHTML += `<tr><td>${item.det}</td><td>$${item.pr}</td><td>${item.cant.toFixed(3)}</td><td>$${subtotal}</td><td><button class="btn-delete-item" onclick="eliminarItemCarrito(${item.id_temp})"><i class="fas fa-trash-alt"></i></button></td></tr>`;
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

// COBRO E IMPRESIÓN
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
    displayVuelto.innerText = `$ ${vuelto < 0 ? 0 : Math.floor(vuelto)}`;
    displayVuelto.style.color = vuelto < 0 ? 'var(--danger)' : 'var(--accent)';
}

function cerrarModalCobro() {
    document.getElementById('modal-cobro').style.display = 'none';
}

function generarTicketImpresion(ticketData) {
    const container = document.getElementById('ticket-print');
    let itemsHtml = '';
    ticketData.items.forEach(i => {
        itemsHtml += `<tr><td colspan="2">${i.det}</td></tr>
                      <tr><td>${i.cant.toFixed(3)} x $${i.pr}</td><td style="text-align:right">$${Math.ceil(i.pr*i.cant)}</td></tr>`;
    });

    container.innerHTML = `
        <h2>LA BARRICA</h2>
        <p>FECHA: ${ticketData.fecha}<br>TIPO: ${ticketData.tipo_comprobante}</p>
        <p>----------------------------</p>
        <table class="items-table">${itemsHtml}</table>
        <p>----------------------------</p>
        <div class="total-area">TOTAL: $${ticketData.total}</div>
        <p>PAGO: ${ticketData.metodo_pago}<br>RECIBIDO: $${ticketData.recibido}<br>VUELTO: $${ticketData.vuelto}</p>
        <p>*** GRACIAS POR SU COMPRA ***</p>
    `;
}

async function finalizarYRegistrarVenta(debeImprimir) {
    const recibido = parseFloat(document.getElementById('pago-recibido').value) || 0;
    const metodoPago = document.getElementById('tipo-pago').value;
    const vuelto = Math.max(0, recibido - totalVentaActual);

    const ticket = {
        fecha: new Date().toLocaleString(),
        tipo_comprobante: document.getElementById('tipo-doc').value,
        metodo_pago: metodoPago,
        items: carritoVentas,
        total: totalVentaActual,
        recibido: recibido,
        vuelto: vuelto
    };

    if (debeImprimir) {
        generarTicketImpresion(ticket);
        window.print(); // Dispara la impresora
    }

    try {
        await window.fs.addDoc(window.fs.collection(window.db, "ventas"), ticket);
        alert("✅ Venta Guardada");
        carritoVentas = [];
        actualizarTablaVentas();
        cerrarModalCobro();
    } catch (e) {
        alert("Error al guardar");
    }
}

// INVENTARIO (SIN CAMBIOS)
function abrirModalProducto() { document.getElementById('modal-producto').style.display = 'flex'; }
function cerrarModalProducto() { document.getElementById('modal-producto').style.display = 'none'; }
async function subirProductoAFirebase() {
    const nuevo = { cod: document.getElementById('nuevo-cod').value, det: document.getElementById('nuevo-det').value.toUpperCase(), pr: parseFloat(document.getElementById('nuevo-pr').value), stock: parseInt(document.getElementById('nuevo-stock').value) || 0 };
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
    const cod = document.getElementById('edit-id').value;
    const q = window.fs.query(window.fs.collection(window.db, "articulos"), window.fs.where("cod", "==", cod));
    const snap = await window.fs.getDocs(q);
    if (!snap.empty) {
        await window.fs.updateDoc(window.fs.doc(window.db, "articulos", snap.docs[0].id), { det: document.getElementById('edit-det').value.toUpperCase(), pr: parseFloat(document.getElementById('edit-pr').value), stock: parseInt(document.getElementById('edit-stock').value) });
        cerrarModalEditar();
        inicializar();
    }
}
async function eliminarArticuloSistema(codigo) {
    if (confirm("¿Eliminar?")) {
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
    lista.forEach(p => {
        tbody.innerHTML += `<tr><td><code>${p.cod}</code></td><td>${p.det}</td><td>$${parseFloat(p.pr).toFixed(2)}</td><td style="color:${p.stock<=5?'red':'white'}">${p.stock}</td><td><button class="btn-edit-item" onclick="prepararEdicion('${p.cod}')"><i class="fas fa-edit"></i></button><button class="btn-delete-item" onclick="eliminarArticuloSistema('${p.cod}')"><i class="fas fa-trash"></i></button></td></tr>`;
    });
}
function filtrarArticulos(val) {
    const f = DB_PRODUCTOS.filter(p => p.det.toLowerCase().includes(val.toLowerCase()) || p.cod.includes(val));
    renderizarTablaInventario(f);
}
setTimeout(inicializar, 1500);
