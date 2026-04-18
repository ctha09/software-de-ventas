let carritoVentas = [];
let DB_PRODUCTOS = [];
let totalVentaActual = 0;

// 1. CARGA E INICIALIZACIÓN
// Se conecta a Firebase y descarga los productos a la memoria local
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

// 2. LÓGICA DE VENTAS (CAJA)
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
    let total = 0;

    carritoVentas.forEach(item => {
        const subtotal = item.pr * item.cant;
        total += subtotal;
        tbody.innerHTML += `
            <tr>
                <td>${item.det}</td>
                <td>$${item.pr.toFixed(2)}</td>
                <td>${item.cant.toFixed(3)}</td>
                <td>$${subtotal.toFixed(2)}</td>
                <td>
                    <button class="btn-delete-item" onclick="eliminarItemCarrito(${item.id_temp})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    document.getElementById('total-final').innerText = `$ ${total.toFixed(2)}`;
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

// 3. FLUJO DE COBRO Y VUELTO
function guardarVentaFirebase() {
    if (carritoVentas.length === 0) return;

    // Calcular el total para el modal de cobro
    totalVentaActual = carritoVentas.reduce((acc, i) => acc + (i.pr * i.cant), 0);
    
    document.getElementById('cobro-total-display').innerText = `$ ${totalVentaActual.toFixed(2)}`;
    document.getElementById('pago-recibido').value = ''; 
    document.getElementById('cobro-vuelto-display').innerText = `$ 0.00`;
    
    document.getElementById('modal-cobro').style.display = 'flex';
    setTimeout(() => document.getElementById('pago-recibido').focus(), 200);
}

function calcularVuelto() {
    const recibido = parseFloat(document.getElementById('pago-recibido').value) || 0;
    const vuelto = recibido - totalVentaActual;
    const displayVuelto = document.getElementById('cobro-vuelto-display');
    
    if (vuelto < 0) {
        displayVuelto.innerText = `$ 0.00`;
        displayVuelto.style.color = 'var(--danger)';
    } else {
        displayVuelto.innerText = `$ ${vuelto.toFixed(2)}`;
        displayVuelto.style.color = 'var(--accent)';
    }
}

function cerrarModalCobro() {
    document.getElementById('modal-cobro').style.display = 'none';
}

async function finalizarYRegistrarVenta() {
    const recibido = parseFloat(document.getElementById('pago-recibido').value) || 0;
    
    if (recibido < totalVentaActual && recibido !== 0) {
        if (!confirm("El monto es menor al total. ¿Continuar?")) return;
    }

    const ticket = {
        fecha: new Date().toLocaleString(),
        tipo: document.getElementById('tipo-doc').value,
        items: carritoVentas,
        total: totalVentaActual,
        recibido: recibido
    };

    try {
        await window.fs.addDoc(window.fs.collection(window.db, "ventas"), ticket);
        alert("✅ Venta Guardada");
        carritoVentas = [];
        actualizarTablaVentas();
        cerrarModalCobro();
    } catch (e) {
        alert("Error al guardar la venta");
    }
}

// 4. GESTIÓN DE ARTÍCULOS (ALTAS, BAJAS Y EDICIÓN)
function abrirModalProducto() {
    document.getElementById('modal-producto').style.display = 'flex';
}

function cerrarModalProducto() {
    document.getElementById('modal-producto').style.display = 'none';
    ['nuevo-cod', 'nuevo-det', 'nuevo-pr', 'nuevo-stock'].forEach(id => document.getElementById(id).value = '');
}

async function subirProductoAFirebase() {
    const nuevo = {
        cod: document.getElementById('nuevo-cod').value,
        det: document.getElementById('nuevo-det').value.toUpperCase(),
        pr: parseFloat(document.getElementById('nuevo-pr').value),
        stock: parseInt(document.getElementById('nuevo-stock').value) || 0
    };

    try {
        await window.fs.addDoc(window.fs.collection(window.db, "articulos"), nuevo);
        alert("✅ Producto Añadido");
        cerrarModalProducto();
        inicializar(); 
    } catch (e) {
        alert("Error al guardar");
    }
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

function cerrarModalEditar() {
    document.getElementById('modal-editar').style.display = 'none';
}

async function actualizarProductoEnFirebase() {
    const codBusqueda = document.getElementById('edit-id').value;
    try {
        const q = window.fs.query(window.fs.collection(window.db, "articulos"), window.fs.where("cod", "==", codBusqueda));
        const snapshot = await window.fs.getDocs(q);
        if (!snapshot.empty) {
            const docRef = window.fs.doc(window.db, "articulos", snapshot.docs[0].id);
            await window.fs.updateDoc(docRef, {
                det: document.getElementById('edit-det').value.toUpperCase(),
                pr: parseFloat(document.getElementById('edit-pr').value),
                stock: parseInt(document.getElementById('edit-stock').value)
            });
            alert("✅ Actualizado");
            cerrarModalEditar();
            inicializar();
        }
    } catch (e) {
        alert("Error al editar");
    }
}

async function eliminarArticuloSistema(codigo) {
    if (confirm("¿Eliminar este producto permanentemente?")) {
        try {
            const q = window.fs.query(window.fs.collection(window.db, "articulos"), window.fs.where("cod", "==", codigo));
            const snapshot = await window.fs.getDocs(q);
            if (!snapshot.empty) {
                await window.fs.deleteDoc(window.fs.doc(window.db, "articulos", snapshot.docs[0].id));
                alert("🗑️ Eliminado");
                inicializar();
            }
        } catch (e) {
            alert("Error al eliminar");
        }
    }
}

// 5. RENDERIZADO Y FILTROS
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
                <td style="font-weight:bold; color: ${p.stock <= 5 ? 'var(--danger)' : 'white'}">${p.stock}</td>
                <td>
                    <button class="btn-edit-item" onclick="prepararEdicion('${p.cod}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-delete-item" onclick="eliminarArticuloSistema('${p.cod}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function filtrarArticulos(val) {
    const f = DB_PRODUCTOS.filter(p => p.det.toLowerCase().includes(val.toLowerCase()) || p.cod.includes(val));
    renderizarTablaInventario(f);
}

// Iniciar carga tras esperar conexión Firebase
setTimeout(inicializar, 1500);
