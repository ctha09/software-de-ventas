let carritoVentas = [];
let DB_PRODUCTOS = [];
let totalVentaActual = 0;
let graficoGeneral = null;

// ─────────────────────────────────────────
// 1. INICIALIZACIÓN
// ─────────────────────────────────────────
async function inicializar() {
    try {
        const querySnapshot = await window.fs.getDocs(window.fs.collection(window.db, "articulos"));
        DB_PRODUCTOS = [];
        querySnapshot.forEach(doc => DB_PRODUCTOS.push(doc.data()));
        console.log("📦 GestOK: Datos sincronizados —", DB_PRODUCTOS.length, "productos");
        renderizarTablaInventario();
    } catch (error) {
        console.error("Error al sincronizar:", error);
    }
}

// ─────────────────────────────────────────
// 2. LÓGICA DE VENTAS — SCANNER
// ─────────────────────────────────────────

// Busca primero en el cache local (DB_PRODUCTOS).
// Si no lo encuentra, va directamente a Firebase como fallback.
// Esto resuelve: productos cargados desde otra PC, y race conditions al iniciar.
function manejarLector(e) {
    if (e.key !== 'Enter') return;

    const input = e.target.value.trim();
    if (!input) return;

    let codigoABuscar = input;
    let cantidad = 1;

    // Soporte balanza (prefijo 20, código 5 dígitos, peso 5 dígitos / 1000)
    if (input.startsWith('20') && input.length >= 12) {
        codigoABuscar = input.substring(2, 7);
        cantidad = parseInt(input.substring(7, 12)) / 1000;
    }

    e.target.value = '';

    // 1° — buscar en cache local (rápido, sin red)
    const prodLocal = DB_PRODUCTOS.find(p => String(p.cod) === String(codigoABuscar));

    if (prodLocal) {
        agregarAlCarrito(prodLocal, cantidad);
        return;
    }

    // 2° — no estaba en cache: buscar en Firebase y actualizar cache
    mostrarToast('🔍 Buscando en base de datos...');
    buscarEnFirebase(codigoABuscar, cantidad);
}

async function buscarEnFirebase(codigoABuscar, cantidad) {
    try {
        const q    = window.fs.query(
            window.fs.collection(window.db, "articulos"),
            window.fs.where("cod", "==", String(codigoABuscar))
        );
        const snap = await window.fs.getDocs(q);

        if (!snap.empty) {
            const prod = snap.docs[0].data();

            // Actualizar cache local para no volver a consultar Firebase por este mismo código
            const yaEnCache = DB_PRODUCTOS.find(p => String(p.cod) === String(prod.cod));
            if (!yaEnCache) DB_PRODUCTOS.push(prod);

            agregarAlCarrito(prod, cantidad);
        } else {
            // Tampoco existe en Firebase
            flashScanner('err');
            mostrarToast('⚠️ Producto no encontrado: ' + codigoABuscar);
        }
    } catch (err) {
        console.error('Error buscando en Firebase:', err);
        mostrarToast('❌ Error de conexión. Verificá tu red.');
    }
}

function agregarAlCarrito(prod, cantidad) {
    const existente = carritoVentas.find(i => String(i.cod) === String(prod.cod));
    if (existente) {
        existente.cant += cantidad;
    } else {
        carritoVentas.push({
            id_temp: Date.now() + Math.random(),
            cod:  prod.cod,
            det:  prod.det,
            pr:   parseFloat(prod.pr),
            cant: cantidad
        });
    }
    flashScanner('ok');
    actualizarTablaVentas();
}

// Flash visual en el input del scanner
function flashScanner(tipo) {
    const inp = document.getElementById('lector-barras');
    if (!inp) return;
    inp.classList.add(tipo === 'ok' ? 'scan-ok' : 'scan-err');
    setTimeout(() => { inp.classList.remove('scan-ok', 'scan-err'); }, 420);
}

// Toast liviano (no interrumpe el flujo como alert)
function mostrarToast(msg) {
    let t = document.getElementById('gestok-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'gestok-toast';
        t.style.cssText = `
            position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
            background: #1e293b; color: #f1f5f9; border: 1px solid rgba(239,68,68,0.4);
            padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600;
            z-index: 9999; transition: opacity .3s; pointer-events: none;
        `;
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}

// ─────────────────────────────────────────
// 3. RENDERIZADO DE LA TABLA DE VENTAS
// ─────────────────────────────────────────
function actualizarTablaVentas() {
    const body  = document.getElementById('lista-ventas-items');
    const count = document.getElementById('items-count-label');
    const meta  = document.getElementById('total-meta-label');
    const btn   = document.getElementById('cobrar-btn');
    if (!body) return;

    // Carrito vacío
    if (carritoVentas.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <i class="fas fa-shopping-cart"></i>
                        <p>El carrito está vacío</p>
                        <p style="font-size:12px; opacity:.6;">Escaneá un producto para comenzar</p>
                    </div>
                </td>
            </tr>`;
        totalVentaActual = 0;
        document.getElementById('total-final').innerText = '$ 0';
        if (meta)  meta.innerText = '—';
        if (count) count.innerText = '0 artículos';
        if (btn)   btn.disabled = true;
        return;
    }

    let totalAcumulado = 0;
    let totalItems = 0;
    body.innerHTML = '';

    carritoVentas.forEach(item => {
        const subtotal = Math.ceil(item.pr * item.cant);
        totalAcumulado += subtotal;
        totalItems += item.cant;

        const cantDisplay = Number.isInteger(item.cant) ? item.cant : item.cant.toFixed(3);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="item-name">${item.det}</div>
                <div class="item-cod">${item.cod}</div>
            </td>
            <td class="item-price">$ ${item.pr.toLocaleString('es-AR')}</td>
            <td style="text-align:center;">
                <span class="qty-badge">${cantDisplay}</span>
            </td>
            <td class="item-subtotal">$ ${subtotal.toLocaleString('es-AR')}</td>
            <td>
                <div class="del-item" onclick="eliminarItemCarrito(${item.id_temp})">
                    <i class="fas fa-times"></i>
                </div>
            </td>
        `;
        body.appendChild(tr);
    });

    totalVentaActual = totalAcumulado;

    document.getElementById('total-final').innerText = '$ ' + totalAcumulado.toLocaleString('es-AR');

    const cantLabel = totalItems === 1 ? '1 artículo' : `${Number.isInteger(totalItems) ? totalItems : totalItems.toFixed(3)} artículos`;
    if (meta)  meta.innerText = cantLabel + ' · ' + (document.getElementById('tipo-doc')?.value || '');
    if (count) count.innerText = cantLabel;
    if (btn)   btn.disabled = false;
}

function eliminarItemCarrito(idTemp) {
    carritoVentas = carritoVentas.filter(i => i.id_temp !== idTemp);
    actualizarTablaVentas();
}

function limpiarCarritoCompleto() {
    if (carritoVentas.length === 0) return;
    if (confirm('¿Desea vaciar el carrito?')) {
        carritoVentas = [];
        actualizarTablaVentas();
    }
}

// ─────────────────────────────────────────
// 4. COBRO Y TICKETS
// ─────────────────────────────────────────
// La apertura del modal se maneja desde index.html para poder capturar
// el flag de impresión. Esta función sigue siendo compatible.
function calcularVuelto() {
    const recibido = parseFloat(document.getElementById('pago-recibido').value) || 0;
    const vuelto   = recibido - totalVentaActual;
    document.getElementById('cobro-vuelto-display').innerText =
        '$ ' + (vuelto > 0 ? Math.floor(vuelto).toLocaleString('es-AR') : 0);
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
        items: JSON.parse(JSON.stringify(carritoVentas)), // copia limpia
        total: totalVentaActual
    };

    try {
        // Guardar venta en Firestore
        await window.fs.addDoc(window.fs.collection(window.db, "ventas"), ticket);

        // Descontar stock
        for (const item of carritoVentas) {
            const q = window.fs.query(
                window.fs.collection(window.db, "articulos"),
                window.fs.where("cod", "==", String(item.cod))
            );
            const snap = await window.fs.getDocs(q);
            if (!snap.empty) {
                const docRef    = window.fs.doc(window.db, "articulos", snap.docs[0].id);
                const stockAct  = snap.docs[0].data().stock || 0;
                await window.fs.updateDoc(docRef, { stock: stockAct - item.cant });
            }
        }

        if (debeImprimir) {
            generarTicketImpresion(ticket);
            // Quitar foco de todos los inputs antes de imprimir
            // para que la impresora POS no dispare el lector de barras
            setTimeout(() => {
                document.activeElement && document.activeElement.blur();
                document.querySelectorAll('input').forEach(i => i.blur());
                window.print();
            }, 500);
        }

        mostrarToast('✅ Venta registrada — $ ' + totalVentaActual.toLocaleString('es-AR'));
        carritoVentas = [];
        actualizarTablaVentas();
        cerrarModalCobro();
        inicializar();

    } catch (e) {
        console.error(e);
        mostrarToast('❌ Error al procesar la operación.');
    }
}

function generarTicketImpresion(t) {
    const container = document.getElementById('ticket-print');

    // Agrupar ítems por código para evitar duplicados
    const agrupados = {};
    t.items.forEach(i => {
        const key = String(i.cod);
        if (agrupados[key]) {
            agrupados[key].cant += i.cant;
        } else {
            agrupados[key] = { ...i };
        }
    });

    const linea = '--------------------------------';
    let itemsHtml = '';
    Object.values(agrupados).forEach(i => {
        const cant    = Number.isInteger(i.cant) ? i.cant : i.cant.toFixed(3);
        const subtotal = Math.ceil(i.pr * i.cant);
        // Nombre del producto (truncar si es muy largo)
        const nombre  = i.det.length > 28 ? i.det.substring(0, 28) : i.det;
        itemsHtml += `
            <tr>
                <td colspan="2" style="padding-top:6px; font-weight:bold; font-size:10pt;">${nombre}</td>
            </tr>
            <tr>
                <td style="font-size:9pt; color:#444;">${cant} x $${i.pr.toLocaleString('es-AR')}</td>
                <td style="text-align:right; font-weight:bold; font-size:10pt;">$${subtotal.toLocaleString('es-AR')}</td>
            </tr>`;
    });

    // Fecha formateada
    const ahora  = new Date();
    const fecha  = t.fecha || ahora.toLocaleString('es-AR');
    const vendedor = t.vendedor ? `<p style="margin:2px 0; font-size:9pt;">Vendedor: ${t.vendedor}</p>` : '';

    container.innerHTML = `
        <div style="text-align:center; margin-bottom:6px;">
            <div style="font-size:16pt; font-weight:900; letter-spacing:1px;">GestOK</div>
            <div style="font-size:9pt;">${t.tipo_comprobante || 'Ticket No Fiscal'}</div>
            <div style="font-size:8pt; color:#555;">${fecha}</div>
            ${vendedor}
        </div>
        <div style="border-top:1px dashed #000; margin:4px 0;"></div>
        <table style="width:100%; border-collapse:collapse; font-family:'Courier New',monospace;">
            ${itemsHtml}
        </table>
        <div style="border-top:1px dashed #000; margin:6px 0;"></div>
        <table style="width:100%; font-size:13pt; font-weight:900;">
            <tr>
                <td>TOTAL:</td>
                <td style="text-align:right;">$${t.total.toLocaleString('es-AR')}</td>
            </tr>
        </table>
        <div style="border-top:1px dashed #000; margin:6px 0;"></div>
        <div style="text-align:center; font-size:9pt; color:#555; margin-top:6px;">
            ${t.metodo_pago}
        </div>
        <div style="text-align:center; font-size:8pt; color:#888; margin-top:8px;">
            ¡Gracias por su compra!
        </div>
        <br><br>
    `;
}

// ─────────────────────────────────────────
// 5. HISTORIAL DIARIO
// ─────────────────────────────────────────
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
            const [f]  = data.fecha.split(',');
            const [d, m, y] = f.trim().split('/');
            const fFormateada = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;

            if (fFormateada === fechaSeleccionada) {
                if (totales[data.metodo_pago] !== undefined) totales[data.metodo_pago] += data.total;
                const hora = data.fecha.split(',')[1]?.trim() || '';
                tbody.innerHTML += `
                    <tr>
                        <td>${hora}</td>
                        <td>${data.metodo_pago}</td>
                        <td style="font-weight:700;">$${data.total.toLocaleString('es-AR')}</td>
                        <td style="opacity:.5; font-size:12px;">${data.tipo_comprobante || ''}</td>
                    </tr>`;
            }
        });

        document.getElementById('res-efectivo').innerText = '$ ' + totales["Efectivo"].toLocaleString('es-AR');
        document.getElementById('res-credito').innerText  = '$ ' + totales["Tarjeta de Credito"].toLocaleString('es-AR');
        document.getElementById('res-debito').innerText   = '$ ' + totales["Tarjeta de Debito"].toLocaleString('es-AR');
        document.getElementById('res-transf').innerText   = '$ ' + totales["Transferencia"].toLocaleString('es-AR');

    } catch (e) { console.error(e); }
}

// ─────────────────────────────────────────
// 6. ESTADÍSTICAS
// ─────────────────────────────────────────
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
            const [d, m, y]   = fechaParte.trim().split('/');
            const itemMes  = m.padStart(2,'0');
            const itemAnio = y;
            const itemDia  = d.padStart(2,'0');

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
        const valores   = etiquetas.map(k => datosAgrupados[k]);
        renderizarGraficoGeneral(etiquetas, valores, tipo === 'diaria' ? 'Ventas del Mes ($)' : 'Ventas del Año ($)');

    } catch (e) { console.error(e); }
}

function renderizarGraficoGeneral(labels, data, titulo) {
    const ctx = document.getElementById('graficoGeneral').getContext('2d');
    if (graficoGeneral) graficoGeneral.destroy();
    graficoGeneral = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: titulo, data,
                backgroundColor: 'rgba(56,189,248,0.7)',
                borderColor: '#38bdf8',
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8' } } },
            scales: {
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
            }
        }
    });
}

function obtenerNombreMes(n) {
    return ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][n-1];
}

// ─────────────────────────────────────────
// 7. GESTIÓN DE ARTÍCULOS
// ─────────────────────────────────────────
async function subirProductoAFirebase() {
    const nuevo = {
        cod:   document.getElementById('nuevo-cod').value.trim(),
        det:   document.getElementById('nuevo-det').value.toUpperCase().trim(),
        pr:    parseFloat(document.getElementById('nuevo-pr').value),
        stock: parseFloat(document.getElementById('nuevo-stock').value) || 0
    };
    if (!nuevo.cod || !nuevo.det || isNaN(nuevo.pr)) {
        mostrarToast('⚠️ Completá todos los campos.');
        return;
    }
    await window.fs.addDoc(window.fs.collection(window.db, "articulos"), nuevo);
    cerrarModalProducto();
    inicializar();
}

async function actualizarProductoEnFirebase() {
    const cod = document.getElementById('edit-id').value;
    const q   = window.fs.query(window.fs.collection(window.db, "articulos"), window.fs.where("cod","==",cod));
    const snap = await window.fs.getDocs(q);
    if (!snap.empty) {
        await window.fs.updateDoc(window.fs.doc(window.db, "articulos", snap.docs[0].id), {
            det:   document.getElementById('edit-det').value.toUpperCase(),
            pr:    parseFloat(document.getElementById('edit-pr').value),
            stock: parseFloat(document.getElementById('edit-stock').value)
        });
        cerrarModalEditar();
        inicializar();
    }
}

async function eliminarArticuloSistema(codigo) {
    if (!confirm('¿Eliminar artículo?')) return;
    const q    = window.fs.query(window.fs.collection(window.db, "articulos"), window.fs.where("cod","==",codigo));
    const snap = await window.fs.getDocs(q);
    if (!snap.empty) {
        await window.fs.deleteDoc(window.fs.doc(window.db, "articulos", snap.docs[0].id));
        inicializar();
    }
}

function renderizarTablaInventario(lista = DB_PRODUCTOS) {
    const tbody = document.getElementById('tabla-inventario-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    lista.sort((a,b) => a.det.localeCompare(b.det)).forEach(p => {
        const stockColor = p.stock <= 0 ? 'color:var(--danger)' : p.stock < 5 ? 'color:var(--warning)' : '';
        tbody.innerHTML += `
            <tr>
                <td style="font-family:monospace; color:var(--muted);">${p.cod}</td>
                <td style="font-weight:500;">${p.det}</td>
                <td>$ ${parseFloat(p.pr).toLocaleString('es-AR')}</td>
                <td style="font-weight:700; ${stockColor}">${parseFloat(p.stock).toFixed(3)}</td>
                <td style="display:flex; gap:8px;">
                    <button class="btn btn-confirm" style="padding:6px 14px; width:auto;" onclick="prepararEdicion('${p.cod}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-clear" style="padding:6px 14px; width:auto;" onclick="eliminarArticuloSistema('${p.cod}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
    });
}

function filtrarArticulos(val) {
    const f = DB_PRODUCTOS.filter(p =>
        p.det.toLowerCase().includes(val.toLowerCase()) || String(p.cod).includes(val)
    );
    renderizarTablaInventario(f);
}

function prepararEdicion(cod) {
    const p = DB_PRODUCTOS.find(x => x.cod === cod);
    if (!p) return;
    document.getElementById('edit-id').value    = p.cod;
    document.getElementById('edit-det').value   = p.det;
    document.getElementById('edit-pr').value    = p.pr;
    document.getElementById('edit-stock').value = p.stock;
    document.getElementById('modal-editar').style.display = 'flex';
}

function cerrarModalProducto() { document.getElementById('modal-producto').style.display = 'none'; }
function cerrarModalEditar()   { document.getElementById('modal-editar').style.display = 'none'; }
function abrirModalProducto()  { document.getElementById('modal-producto').style.display = 'flex'; }

// ─────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────
setTimeout(inicializar, 1000);
