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
    // Obtener nombre del vendedor desde el usuario actual
    // Usar directamente el nombre del usuario actual
    const vendedorActual = (typeof usuarioActual !== 'undefined' && usuarioActual)
        ? (usuarioActual.charAt(0).toUpperCase() + usuarioActual.slice(1))
        : 'Vendedor';

    const ticket = {
        fecha: new Date().toLocaleString('es-AR'),
        tipo_comprobante: document.getElementById('tipo-doc').value,
        metodo_pago: metodoPago,
        items: JSON.parse(JSON.stringify(carritoVentas)), // copia limpia
        total: totalVentaActual,
        vendedor: vendedorActual
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

        // Generar Factura C en ARCA
        let datosFactura = null;
        try {
            mostrarToast('📄 Generando Factura C en ARCA...');
            datosFactura = await generarFacturaARCA(ticket);
            ticket.cae            = datosFactura.cae;
            ticket.vencimientoCAE = datosFactura.vencimientoCAE;
            ticket.nroComprobante = datosFactura.nroComprobante;
            mostrarToast(`✅ Factura C N° ${datosFactura.nroComprobante} — CAE: ${datosFactura.cae}`);
        } catch (errARCA) {
            mostrarToast('⚠️ Venta registrada pero sin CAE: ' + errARCA.message);
        }

        if (debeImprimir) {
            generarTicketImpresion(ticket);
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

    // Agrupar items por codigo para evitar duplicados
    const agrupados = {};
    t.items.forEach(i => {
        const key = String(i.cod);
        if (agrupados[key]) {
            agrupados[key].cant += i.cant;
        } else {
            agrupados[key] = { ...i };
        }
    });

    // Separador adaptado a 80mm (~42 caracteres Courier 9pt)
    const SEP = '..........................................';

    let filas = '';
    Object.values(agrupados).forEach(i => {
        const cant    = Number.isInteger(i.cant) ? i.cant : i.cant.toFixed(3);
        const subtotal = '$' + Math.ceil(i.pr * i.cant).toLocaleString('es-AR');
        const nombre  = i.det.length > 30 ? i.det.substring(0, 30) : i.det;
        filas += `
            <tr>
                <td colspan="2" style="padding-top:5px; font-weight:bold;">${nombre}</td>
            </tr>
            <tr>
                <td style="font-size:8.5pt; color:#333;">${cant} x $${parseFloat(i.pr).toLocaleString('es-AR')}</td>
                <td style="text-align:right; font-weight:bold;">${subtotal}</td>
            </tr>`;
    });

    const fecha    = t.fecha || new Date().toLocaleString('es-AR');
    const vendedor = t.vendedor ? `<div style="font-size:8pt; margin-top:2px;">Vendedor: ${t.vendedor}</div>` : '';
    const totalStr = '$' + (t.total || 0).toLocaleString('es-AR');

    container.innerHTML = `
        <div style="
            width: 100%;
            font-family: 'Courier New', monospace;
            font-size: 9pt;
            color: black;
            background: white;
            box-sizing: border-box;
        ">
            <!-- ENCABEZADO -->
            <div style="text-align:center; margin-bottom:6px;">
                <div style="font-size:15pt; font-weight:900; letter-spacing:2px;">GestOK</div>
                <div style="font-size:8.5pt;">${t.tipo_comprobante || 'Ticket No Fiscal'}</div>
                <div style="font-size:8pt; color:#444;">${fecha}</div>
                ${vendedor}
            </div>

            <div style="border-top:1px dashed #000; margin:4px 0;"></div>

            <!-- ITEMS -->
            <table style="width:100%; border-collapse:collapse; font-size:9pt; table-layout:fixed;">
                <colgroup>
                    <col style="width:65%;">
                    <col style="width:35%;">
                </colgroup>
                ${filas}
            </table>

            <div style="border-top:1px dashed #000; margin:6px 0;"></div>

            <!-- TOTAL -->
            <table style="width:100%; border-collapse:collapse; font-size:12pt; font-weight:900;">
                <tr>
                    <td style="padding:2px 0;">TOTAL:</td>
                    <td style="text-align:right; padding:2px 0;">${totalStr}</td>
                </tr>
            </table>

            <div style="border-top:1px dashed #000; margin:6px 0;"></div>

            <!-- CAE -->
            ${t.cae ? `
            <div style="border-top:1px dashed #000; margin:6px 0;"></div>
            <div style="font-size:8pt; text-align:center;">
                <div style="font-weight:bold;">CAE: ${t.cae}</div>
                <div>Vto: ${t.vencimientoCAE || ''}</div>
                <div>Comp. N°: ${String(t.nroComprobante || '').padStart(8,'0')}</div>
                <div>Pto.Vta: 00003 | CUIT: 20-32850879-7</div>
            </div>` : ''}

            <!-- PIE -->
            <div style="text-align:center; font-size:8.5pt; margin-top:4px;">${t.metodo_pago || ''}</div>
            <div style="text-align:center; font-size:8pt; color:#555; margin-top:6px;">¡Gracias por su compra!</div>

            <!-- Espacio final para corte -->
            <div style="margin-top:16px;">&nbsp;</div>
        </div>
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
    const tipo         = document.getElementById('tipo-grafica').value;
    const mesSeleccionado = document.getElementById('filtro-mes-estadistica').value;
    const [anioSel, mesSel] = mesSeleccionado.split('-');

    try {
        const snapshot = await window.fs.getDocs(window.fs.collection(window.db, "ventas"));

        // Datos globales para el gráfico
        let datosAgrupados = {};

        // Datos por vendedor: { 'Usuario V1': { ventas: 0, total: 0 }, ... }
        let porVendedor = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const [fechaParte] = data.fecha.split(',');
            const [d, m, y]   = fechaParte.trim().split('/');
            const itemMes  = m.padStart(2,'0');
            const itemAnio = y;
            const itemDia  = d.padStart(2,'0');
            const vendedor = data.vendedor || 'Sin especificar';

            // Acumular por vendedor (sin filtro de mes — muestra histórico total)
            if (!porVendedor[vendedor]) porVendedor[vendedor] = { ventas: 0, total: 0 };
            porVendedor[vendedor].ventas++;
            porVendedor[vendedor].total += data.total || 0;

            // Gráfico filtrado por mes/año seleccionado
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
        renderizarTablaVendedores(porVendedor);

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

// ─────────────────────────────────────────
// TABLA DE RENDIMIENTO POR VENDEDOR
// ─────────────────────────────────────────
function renderizarTablaVendedores(porVendedor) {
    const container = document.getElementById('tabla-vendedores');
    if (!container) return;

    const vendedores = Object.entries(porVendedor)
        .sort((a, b) => b[1].total - a[1].total);

    if (vendedores.length === 0) {
        container.innerHTML = '<p style="opacity:.4; text-align:center; padding:20px;">Sin datos de ventas aún.</p>';
        return;
    }

    const totalGeneral = vendedores.reduce((s, [, v]) => s + v.total, 0);
    const totalVentas  = vendedores.reduce((s, [, v]) => s + v.ventas, 0);

    // Colores por usuario
    const colores = {
        'Sandra':  { bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.3)',  color: '#38bdf8' },
        'Tamara':  { bg: 'rgba(168,85,247,0.1)',  border: 'rgba(168,85,247,0.3)',  color: '#a855f7' },
        'Fabian':  { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  color: '#f59e0b' },
    };
    const colorDefault = { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', color: '#94a3b8' };

    let html = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-bottom:24px;">
            ${vendedores.map(([nombre, datos]) => {
                const c = colores[nombre] || colorDefault;
                const pct = totalGeneral > 0 ? ((datos.total / totalGeneral) * 100).toFixed(1) : 0;
                return `
                <div style="background:${c.bg}; border:1px solid ${c.border}; border-radius:16px; padding:20px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
                        <div style="width:10px;height:10px;border-radius:50%;background:${c.color};flex-shrink:0;"></div>
                        <span style="font-weight:700; font-size:14px;">${nombre}</span>
                    </div>
                    <div style="margin-bottom:10px;">
                        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Monto vendido</div>
                        <div style="font-size:26px;font-weight:900;color:${c.color};">$${datos.total.toLocaleString('es-AR')}</div>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                        <div>
                            <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Tickets</div>
                            <div style="font-size:18px;font-weight:700;">${datos.ventas}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Ticket promedio</div>
                            <div style="font-size:18px;font-weight:700;">$${datos.ventas > 0 ? Math.round(datos.total / datos.ventas).toLocaleString('es-AR') : 0}</div>
                        </div>
                    </div>
                    <div style="background:rgba(0,0,0,0.2);border-radius:6px;height:6px;overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:${c.color};border-radius:6px;transition:.5s;"></div>
                    </div>
                    <div style="font-size:11px;color:#64748b;margin-top:5px;text-align:right;">${pct}% del total</div>
                </div>`;
            }).join('')}
        </div>

        <table class="v-table">
            <thead>
                <tr>
                    <th>Vendedor</th>
                    <th style="text-align:center;">Tickets cerrados</th>
                    <th style="text-align:right;">Ticket promedio</th>
                    <th style="text-align:right;">Total vendido</th>
                    <th style="text-align:right;">Participación</th>
                </tr>
            </thead>
            <tbody>
                ${vendedores.map(([nombre, datos]) => {
                    const c   = colores[nombre] || colorDefault;
                    const pct = totalGeneral > 0 ? ((datos.total / totalGeneral) * 100).toFixed(1) : 0;
                    const avg = datos.ventas > 0 ? Math.round(datos.total / datos.ventas) : 0;
                    return `<tr>
                        <td>
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div style="width:8px;height:8px;border-radius:50%;background:${c.color};"></div>
                                <span style="font-weight:600;">${nombre}</span>
                            </div>
                        </td>
                        <td style="text-align:center;font-weight:700;">${datos.ventas}</td>
                        <td style="text-align:right;color:#94a3b8;">$${avg.toLocaleString('es-AR')}</td>
                        <td style="text-align:right;font-weight:800;color:${c.color};">$${datos.total.toLocaleString('es-AR')}</td>
                        <td style="text-align:right;">
                            <span style="background:${c.bg};color:${c.color};border:1px solid ${c.border};border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;">${pct}%</span>
                        </td>
                    </tr>`;
                }).join('')}
                <tr style="border-top:2px solid rgba(255,255,255,0.1);">
                    <td style="font-weight:700;opacity:.6;">TOTAL</td>
                    <td style="text-align:center;font-weight:900;">${totalVentas}</td>
                    <td style="text-align:right;color:#94a3b8;">$${totalVentas > 0 ? Math.round(totalGeneral / totalVentas).toLocaleString('es-AR') : 0}</td>
                    <td style="text-align:right;font-weight:900;font-size:15px;">$${totalGeneral.toLocaleString('es-AR')}</td>
                    <td style="text-align:right;">
                        <span style="background:rgba(255,255,255,0.05);color:#94a3b8;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;">100%</span>
                    </td>
                </tr>
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

// ─────────────────────────────────────────
// FACTURACIÓN ARCA — INTEGRACIÓN DIRECTA
// ─────────────────────────────────────────
const ARCA_SERVER = 'https://gestok-server-production.up.railway.app';

async function generarFacturaARCA(ticket) {
    try {
        const response = await fetch(`${ARCA_SERVER}/facturar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                total:    ticket.total,
                items:    ticket.items,
                vendedor: ticket.vendedor || 'GestOK'
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error del servidor ARCA');
        }

        const datos = await response.json();
        return datos; // { cae, vencimientoCAE, nroComprobante, ptoVta, cuit }

    } catch (e) {
        console.error('Error ARCA:', e.message);
        throw e;
    }
}
