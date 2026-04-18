let carritoVentas = [];
let DB_PRODUCTOS = [];

// CARGAR PRODUCTOS AL INICIAR
async function inicializar() {
    const querySnapshot = await window.fs.getDocs(window.fs.collection(window.db, "articulos"));
    DB_PRODUCTOS = [];
    querySnapshot.forEach(doc => DB_PRODUCTOS.push(doc.data()));
}

function manejarLector(e) {
    if (e.key === 'Enter') {
        const input = e.target.value.trim();
        if (!input) return;

        let codigoABuscar = input;
        let cantidad = 1;
        let balanza = false;

        if (input.startsWith('20') && input.length >= 12) {
            balanza = true;
            codigoABuscar = input.substring(2, 7);
            cantidad = parseInt(input.substring(7, 12)) / 1000;
        }

        const prod = DB_PRODUCTOS.find(p => String(p.cod) === String(codigoABuscar));

        if (prod) {
            carritoVentas.push({
                id_temp: Date.now(), // Para poder borrarlo individualmente
                cod: prod.cod,
                det: prod.det,
                pr: parseFloat(prod.pr),
                cant: cantidad
            });
            actualizarTabla();
        } else {
            alert("Producto no encontrado");
        }
        e.target.value = '';
    }
}

// BORRAR PRODUCTO INDIVIDUAL
function eliminarItem(idTemp) {
    carritoVentas = carritoVentas.filter(item => item.id_temp !== idTemp);
    actualizarTabla();
}

// BORRAR TODO EL CARRITO
function limpiarCarritoCompleto() {
    if(confirm("¿Estás seguro de borrar toda la carga?")) {
        carritoVentas = [];
        actualizarTabla();
    }
}

function actualizarTabla() {
    const tbody = document.getElementById('lista-ventas-items');
    tbody.innerHTML = '';
    let total = 0;

    carritoVentas.forEach(item => {
        const sub = item.pr * item.cant;
        total += sub;
        tbody.innerHTML += `
            <tr>
                <td>${item.det}</td>
                <td>$${item.pr.toFixed(2)}</td>
                <td>${item.cant.toFixed(3)}</td>
                <td>$${sub.toFixed(2)}</td>
                <td><button class="btn-delete" onclick="eliminarItem(${item.id_temp})"><i class="fas fa-times-circle"></i></button></td>
            </tr>
        `;
    });
    document.getElementById('total-final').innerText = `$ ${total.toFixed(2)}`;
}

async function guardarVentaFirebase() {
    if (carritoVentas.length === 0) return;

    const tipoDoc = document.getElementById('tipo-doc').value;
    
    const ticket = {
        fecha: new Date().toLocaleString(),
        tipo: tipoDoc,
        items: carritoVentas,
        total: carritoVentas.reduce((acc, i) => acc + (i.pr * i.cant), 0)
    };

    try {
        await window.fs.addDoc(window.fs.collection(window.db, "ventas"), ticket);
        alert("Venta guardada como " + tipoDoc);
        carritoVentas = [];
        actualizarTabla();
    } catch (e) {
        alert("Error al guardar");
    }
}

// Iniciar carga de productos
setTimeout(inicializar, 1000);
