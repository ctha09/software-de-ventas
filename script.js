let carritoVentas = [];
let DB_PRODUCTOS = [];

// 1. CARGAR PRODUCTOS DESDE FIREBASE
async function cargarProductos() {
    try {
        console.log("Sincronizando con Firebase...");
        const querySnapshot = await window.fs.getDocs(window.fs.collection(window.db, "articulos"));
        DB_PRODUCTOS = [];
        querySnapshot.forEach(doc => {
            DB_PRODUCTOS.push(doc.data());
        });
        console.log("Base de datos cargada. Productos encontrados:", DB_PRODUCTOS.length);
    } catch (e) {
        console.error("Error crítico al cargar productos:", e);
        alert("No se pudo conectar con la base de datos de Firebase.");
    }
}

// 2. LÓGICA DEL LECTOR DE BARRAS
function manejarLector(e) {
    if (e.key === 'Enter') {
        const input = e.target.value.trim();
        if (!input) return;

        console.log("LECTURA RECIBIDA:", input);

        let codigoABuscar = input;
        let cantidadOPrecios = 1;
        let esBalanza = false;

        // DETECCIÓN DE BALANZA (Ejemplo: 20 00004 00715 7)
        // Verificamos que empiece con 20 y tenga al menos 12 o 13 dígitos
        if (input.startsWith('20') && input.length >= 12) {
            esBalanza = true;
            // Extraemos los 5 dígitos del producto (00004)
            codigoABuscar = input.substring(2, 7); 
            
            // Extraemos los 5 dígitos del peso (00715) y convertimos a kg
            const pesoGramos = parseInt(input.substring(7, 12));
            cantidadOPrecios = pesoGramos / 1000;
            
            console.log("Detectado como BALANZA. Buscando SKU:", codigoABuscar, "| Peso:", cantidadOPrecios, "kg");
        }

        // BÚSQUEDA EN LA LISTA DESCARGADA
        // Usamos String() y trim() para evitar fallos por espacios o tipos de datos
        const producto = DB_PRODUCTOS.find(p => String(p.cod).trim() === String(codigoABuscar).trim());

        if (producto) {
            agregarAlCarrito(producto, cantidadOPrecios, esBalanza);
        } else {
            console.warn("PRODUCTO NO ENCONTRADO. Código buscado:", codigoABuscar);
            alert("El código [" + codigoABuscar + "] no existe en Firebase.");
        }

        // Limpiar el campo y mantener el foco
        e.target.value = ''; 
        setTimeout(() => document.getElementById('lector-barras').focus(), 10);
    }
}

// 3. AGREGAR AL CARRITO
function agregarAlCarrito(prod, cant, balanza) {
    // Convertimos el precio a número por seguridad
    const precioNumerico = parseFloat(prod.pr);

    if (balanza) {
        // Balanza: Siempre agrega una fila nueva (por si hay dos bolsas de lo mismo con distinto peso)
        carritoVentas.push({
            cod: prod.cod,
            det: prod.det,
            pr: precioNumerico,
            cant: cant,
            esBalanza: true
        });
    } else {
        // Unidad: Si ya existe, suma cantidad
        const existe = carritoVentas.find(i => i.cod === prod.cod && !i.esBalanza);
        if (existe) {
            existe.cant += 1;
        } else {
            carritoVentas.push({
                cod: prod.cod,
                det: prod.det,
                pr: precioNumerico,
                cant: 1,
                esBalanza: false
            });
        }
    }
    actualizarVistaTabla();
}

// 4. ACTUALIZAR TABLA EN PANTALLA
function actualizarVistaTabla() {
    const tbody = document.getElementById('lista-ventas-items');
    tbody.innerHTML = '';
    let totalGral = 0;

    carritoVentas.forEach((item) => {
        const subtotal = item.cant * item.pr;
        totalGral += subtotal;

        const medida = item.esBalanza ? " kg" : " un";

        tbody.innerHTML += `
            <tr class="item-fila">
                <td>${item.cod}</td>
                <td>${item.cant.toFixed(3)}${medida}</td>
                <td>${item.det}</td>
                <td>$${item.pr.toLocaleString('es-AR', {minimumFractionDigits: 2})}</td>
                <td style="font-weight: bold;">$${subtotal.toLocaleString('es-AR', {minimumFractionDigits: 2})}</td>
            </tr>
        `;
    });

    document.getElementById('total-final').innerText = `$${totalGral.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
}

// 5. GUARDAR VENTA FINAL
async function guardarVentaFirebase() {
    if (carritoVentas.length === 0) return;

    try {
        const totalVenta = carritoVentas.reduce((acc, item) => acc + (item.cant * item.pr), 0);
        
        const ticket = {
            fecha: new Date().toISOString(),
            vendedor: "Carlos Acosta",
            items: carritoVentas,
            total: totalVenta
        };

        await window.fs.addDoc(window.fs.collection(window.db, "ventas"), ticket);
        
        alert("¡Venta procesada con éxito!");
        
        // Limpiar todo
        carritoVentas = [];
        actualizarVistaTabla();
        cerrarVentas();
    } catch (e) {
        console.error("Error al guardar venta:", e);
        alert("Error al intentar guardar la venta. Revise la conexión.");
    }
}

// CONTROL DE MODALES
function abrirVentas() {
    document.getElementById('modal-ventas').style.display = 'flex';
    cargarProductos(); // Cada vez que abre, descarga la lista más nueva
    setTimeout(() => document.getElementById('lector-barras').focus(), 300);
}

function cerrarVentas() {
    document.getElementById('modal-ventas').style.display = 'none';
    carritoVentas = []; // Opcional: limpiar al cerrar
}

// ATAJOS DE TECLADO
window.addEventListener('keydown', (e) => {
    if (e.key === 'F6') abrirVentas();
    if (e.key === 'F2') {
        e.preventDefault();
        guardarVentaFirebase();
    }
    if (e.key === 'Escape') cerrarVentas();
});
