const { buscarProductoPorCodigo } = require('./database.js');

let totalVenta = 0;
let iva21Total = 0;

// Referencias a elementos del DOM
const inputBarcode = document.getElementById('barcode-input');
const tablaBody = document.getElementById('grid-body');
const txtTotal = document.getElementById('txt-total');
const txtIva = document.getElementById('txt-iva21');

function onLoad() {
    // Al cargar la ventana, forzamos el foco en el lector
    inputBarcode.focus();
}

// Escuchar el Enter del Lector
inputBarcode.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const codigo = inputBarcode.value.trim();
        if (codigo === '') return;

        try {
            const producto = await buscarProductoPorCodigo(codigo);
            if (producto) {
                if (producto.stock > 0) {
                    agregarATabla(producto);
                    actualizarTotales(producto);
                    inputBarcode.value = ''; // Limpiar para el próximo
                } else {
                    alert('PRODUCTO SIN STOCK');
                }
            } else {
                alert('PRODUCTO NO ENCONTRADO');
            }
        } catch (err) {
            console.error('Error de DB:', err);
        }
    }
});

function agregarATabla(p) {
    const row = tablaBody.insertRow();
    
    // Por defecto agregamos cantidad 1
    const cantidad = 1;
    const totalRow = p.precio * cantidad;

    row.innerHTML = `
        <td>${p.codigo}</td>
        <td>${p.nombre}</td>
        <td><input type="number" value="${cantidad}" style="width: 50px; background:none; border:none; color:white; text-align:center;"></td>
        <td>$${p.precio.toFixed(2)}</td>
        <td class="row-total">$${totalRow.toFixed(2)}</td>
    `;
}

function actualizarTotales(p) {
    // Cálculo simplificado de ejemplo (suponiendo IVA incluido en precio de DB)
    const cantidad = 1;
    const precioBase = p.precio;
    
    // Suponiendo IVA 21%
    const ivaComponente = precioBase * 0.21; 

    totalVenta += precioBase * cantidad;
    iva21Total += ivaComponente * cantidad;

    txtTotal.innerText = `$${totalVenta.toFixed(2)}`;
    txtIva.innerText = `$${iva21Total.toFixed(2)}`;
}

// Prevenir que el foco se pierda del input del lector al hacer clic en cualquier lado
window.addEventListener('click', () => {
    inputBarcode.focus();
});
