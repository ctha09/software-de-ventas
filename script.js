let carritoVentas = [];
let DB_PRODUCTOS = [];

// 1. CARGAR PRODUCTOS DESDE FIREBASE
async function cargarProductos() {
    try {
        console.log("Intentando conectar con la colección 'articulos'...");
        
        // Obtenemos la referencia de la colección
        const articulosRef = window.fs.collection(window.db, "articulos");
        const querySnapshot = await window.fs.getDocs(articulosRef);
        
        DB_PRODUCTOS = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            // Limpiamos los datos al entrar para evitar errores de búsqueda
            DB_PRODUCTOS.push({
                cod: String(data.cod || "").trim(),
                det: String(data.det || "Producto sin nombre").toUpperCase(),
                pr: parseFloat(data.pr || 0)
            });
        });

        console.log("Sincronización exitosa. Productos en memoria:", DB_PRODUCTOS.length);
        console.table(DB_PRODUCTOS); // Esto te permite ver la lista en la consola (F12)

    } catch (e) {
        console.error("Error de conexión a Firebase:", e);
        alert("⚠️ Error: No se pudo conectar con Firebase. Revisa las reglas de seguridad o tu conexión a internet.");
    }
}

// 2. MANEJAR ENTRADA DEL LECTOR O TECLADO
function manejarLector(e) {
    if (e.key === 'Enter') {
        const input = e.target.value.trim();
        if (!input) return;

        console.log("Procesando entrada:", input);

        let codigoABuscar = input;
        let cantidadCalculada = 1;
        let esBalanza = false;

        // LÓGICA DE BALANZA (Ej: 20 00004 00715 7)
        if (input.startsWith('20') && input.length >= 12) {
            esBalanza = true;
            // Extraemos código del producto (posiciones 2 a 7)
            codigoABuscar = input.substring(2, 7); 
            
            // Extraemos el peso (posiciones 7 a 12) y pasamos a KG
            const pesoGramos = parseInt(input.substring(7, 12));
            cantidadCalculada = pesoGramos / 1000;
            
            console.log(`Modo Balanza: Buscando SKU ${codigoABuscar} con peso ${cantidadCalculada}kg`);
        }

        // BÚSQUEDA DEL PRODUCTO
        // Buscamos coincidencia exacta ignorando ceros a la izquierda si fuera necesario
        const producto = DB_PRODUCTOS.find(p => p.cod === codigoABuscar);

        if (producto) {
            agregarAlCarrito(producto, cantidadCalculada, esBalanza);
        } else {
            console.warn("Producto no encontrado:", codigoABuscar);
            alert(`El código [${codigoABuscar}] no existe en la base de datos de Firebase.`);
        }

        // Limpiar input y devolver el foco
        e.target.value = '';
        e.target.focus();
    }
}

// 3. AGREGAR AL LISTADO DE VENTA
function agregarAlCarrito(prod, cant, balanza) {
    if (balanza) {
        // Los productos de balanza se agregan siempre como línea nueva
        carritoVentas.push({
            cod: prod.cod,
            det: prod.det,
            pr: prod.pr,
            cant: cant,
            esBalanza: true
        });
    } else {
        // Los productos unitarios se agrupan
        const existe = carritoVentas.find(i => i.cod === prod.cod && !i.esBalanza);
        if (existe) {
            existe.cant += 1;
        } else {
            carritoVentas.push({
                cod: prod.cod,
                det: prod.det,
                pr: prod.pr,
                cant: 1,
                esBalanza: false
            });
        }
    }
    actualizarVistaTabla();
}

// 4. DIBUJAR LA TABLA
function actualizarVistaTabla() {
    const tbody = document.getElementById('lista-ventas-items');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    let totalAcumulado = 0;

    carritoVentas.forEach((item, index) => {
        const subtotal = item.cant * item.pr;
        totalAcumulado += subtotal;

        const unidad = item.esBalanza ? "kg" : "un";

        tbody.innerHTML += `
            <tr>
                <td>${item.cod}</td>
                <td>${item.cant.toFixed(item.esBalanza ? 3 : 0)} ${unidad}</td>
                <td>${item.det}</td>
                <td>$${item.pr.toFixed(2)}</td>
                <td style="font-weight:bold;">$${subtotal.toFixed(2)}</td>
            </tr>
        `;
    });

    document.getElementById('total-final').innerText = `$ ${totalAcumulado.toFixed(2)}`;
}

// 5. FINALIZAR VENTA Y SUBIR A FIREBASE
async function guardarVentaFirebase() {
    if (carritoVentas.length === 0) {
        alert("No hay productos en la venta actual.");
        return;
    }

    try {
        const totalFinal = carritoVentas.reduce((acc, item) => acc + (item.cant * item.pr), 0);
        
        const ticketVenta = {
            fecha: new Date().toISOString(),
            items: carritoVentas,
            total: totalFinal,
            punto_venta: "Caja Principal"
        };

        const ventasRef = window.fs.collection(window.db, "ventas");
        await window.fs.addDoc(ventasRef, ticketVenta);
        
        alert("✅ Venta guardada correctamente.");
        
        // Resetear sistema
        carritoVentas = [];
        actualizarVistaTabla();
        cerrarVentas();

    } catch (e) {
        console.error("Error al guardar venta:", e);
        alert("No se pudo registrar la venta en la nube.");
    }
}

// --- CONTROLES DE INTERFAZ ---

function abrirVentas() {
    document.getElementById('modal-ventas').style.display = 'flex';
    cargarProductos(); // Refresca precios cada vez que abres la caja
    setTimeout(() => {
        const input = document.getElementById('lector-barras');
        if (input) input.focus();
    }, 500);
}

function cerrarVentas() {
    document.getElementById('modal-ventas').style.display = 'none';
    // No limpiamos el carrito aquí por si se cerró por error
}

// ATAJOS DE TECLADO
window.addEventListener('keydown', (e) => {
    if (e.key === 'F6') {
        e.preventDefault();
        abrirVentas();
    }
    if (e.key === 'F2') {
        e.preventDefault();
        guardarVentaFirebase();
    }
    if (e.key === 'Escape') {
        cerrarVentas();
    }
});
