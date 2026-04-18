let carritoVentas = [];
let DB_PRODUCTOS = [];

// 1. CARGA INICIAL DE DATOS
// Se ejecuta al cargar la página para tener los productos listos en memoria
async function inicializar() {
    try {
        const querySnapshot = await window.fs.getDocs(window.fs.collection(window.db, "articulos"));
        DB_PRODUCTOS = [];
        querySnapshot.forEach(doc => {
            DB_PRODUCTOS.push(doc.data());
        });
        console.log("📦 Inventario sincronizado:", DB_PRODUCTOS.length, "productos.");
        renderizarTablaInventario(); // Actualiza la tabla de la sección Artículos
    } catch (error) {
        console.error("Error al sincronizar inventario:", error);
    }
}

// 2. LÓGICA DE VENTAS (Caja de Cobro)
function manejarLector(e) {
    if (e.key === 'Enter') {
        const input = e.target.value.trim();
        if (!input) return;

        let codigoABuscar = input;
        let cantidad = 1;

        // Soporte para balanza (Ej: 20 00004 01510 -> Código 00004, Peso 1.510kg)
        if (input.startsWith('20') && input.length >= 12) {
            codigoABuscar = input.substring(2, 7);
            cantidad = parseInt(input.substring(7, 12)) / 1000;
        }

        const prod = DB_PRODUCTOS.find(p => String(p.cod) === String(codigoABuscar));

        if (prod) {
            // Agregamos al carrito con un ID temporal único para poder borrarlo luego
            carritoVentas.push({
                id_temp: Date.now() + Math.random(), 
                cod: prod.cod,
                det: prod.det,
                pr: parseFloat(prod.pr),
                cant: cantidad
            });
            actualizarTablaVentas();
        } else {
            alert("⚠️ El producto con código " + codigoABuscar + " no existe en el sistema.");
        }
        e.target.value = ''; // Limpiar el lector
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
                <td style="text-align:right">
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
    carritoVentas = carritoVentas.filter(item => item.id_temp !== idTemp);
    actualizarTablaVentas();
}

function limpiarCarritoCompleto() {
    if (carritoVentas.length === 0) return;
    if (confirm("¿Estás seguro de vaciar toda la caja?")) {
        carritoVentas = [];
        actualizarTablaVentas();
    }
}

async function guardarVentaFirebase() {
    if (carritoVentas.length === 0) {
        alert("No hay productos cargados.");
        return;
    }

    const tipoDoc = document.getElementById('tipo-doc').value;
    const totalVenta = carritoVentas.reduce((acc, i) => acc + (i.pr * i.cant), 0);

    const ticket = {
        fecha: new Date().toLocaleString(),
        tipo_comprobante: tipoDoc,
        items: carritoVentas,
        total: totalVenta
    };

    try {
        await window.fs.addDoc(window.fs.collection(window.db, "ventas"), ticket);
        alert("✅ Venta Guardada con éxito (" + tipoDoc + ")");
        carritoVentas = [];
        actualizarTablaVentas();
    } catch (e) {
        console.error("Error al guardar venta:", e);
        alert("Hubo un error al intentar guardar la venta.");
    }
}

// 3. LÓGICA DE ARTÍCULOS (Inventario)
function abrirModalProducto() {
    document.getElementById('modal-producto').style.display = 'flex';
    setTimeout(() => document.getElementById('nuevo-cod').focus(), 200);
}

function cerrarModalProducto() {
    document.getElementById('modal-producto').style.display = 'none';
    ['nuevo-cod', 'nuevo-det', 'nuevo-pr', 'nuevo-stock'].forEach(id => document.getElementById(id).value = '');
}

async function subirProductoAFirebase() {
    const cod = document.getElementById('nuevo-cod').value.trim();
    const det = document.getElementById('nuevo-det').value.trim();
    const pr = document.getElementById('nuevo-pr').value;
    const stock = document.getElementById('nuevo-stock').value;

    if (!cod || !det || !pr) {
        alert("Faltan datos obligatorios (Código, Nombre, Precio)");
        return;
    }

    const nuevoDoc = {
        cod: cod,
        det: det.toUpperCase(),
        pr: parseFloat(pr),
        stock: parseInt(stock) || 0
    };

    try {
        await window.fs.addDoc(window.fs.collection(window.db, "articulos"), nuevoDoc);
        alert("✅ Producto añadido correctamente.");
        cerrarModalProducto();
        inicializar(); // Recargar base de datos local
    } catch (e) {
        alert("Error al guardar el producto en la nube.");
    }
}

function renderizarTablaInventario(lista = DB_PRODUCTOS) {
    const tbody = document.getElementById('tabla-inventario-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    lista.forEach(p => {
        tbody.innerHTML += `
            <tr>
                <td><code style="color:var(--accent)">${p.cod}</code></td>
                <td>${p.det}</td>
                <td>$${parseFloat(p.pr).toFixed(2)}</td>
                <td style="font-weight:bold; color: ${p.stock <= 5 ? 'var(--danger)' : 'white'}">
                    ${p.stock}
                </td>
                <td style="text-align:right">
                    <button class="btn-delete-item" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function filtrarArticulos(busqueda) {
    const filtrados = DB_PRODUCTOS.filter(p => 
        p.det.toLowerCase().includes(busqueda.toLowerCase()) || 
        p.cod.includes(busqueda)
    );
    renderizarTablaInventario(filtrados);
}

// Iniciar sincronización tras un breve delay para asegurar que Firebase cargó
setTimeout(inicializar, 1500);
