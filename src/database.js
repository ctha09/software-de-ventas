const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Carpeta para la base de datos
const dbPath = path.join(__dirname, '..', 'database', 'ventas.db');

// Asegurar que la carpeta existe
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath));
}

const db = new sqlite3.Database(dbPath);

// Función para inicializar la base de datos
function initDB() {
    db.serialize(() => {
        // Tabla de Productos
        db.run(`CREATE TABLE IF NOT EXISTS productos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT UNIQUE,
            nombre TEXT,
            precio REAL,
            iva INTEGER DEFAULT 21,
            stock INTEGER DEFAULT 0
        )`);

        // Tabla de Ventas Encabezado
        db.run(`CREATE TABLE IF NOT EXISTS ventas_encabezado (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            cae TEXT,
            tipo_comprobante TEXT,
            cliente TEXT,
            total REAL
        )`);

        // Insertar productos de prueba si la tabla está vacía
        db.get('SELECT count(*) as count FROM productos', (err, row) => {
            if (row.count === 0) {
                const dummy = [
                    ['7791234567890', 'Gaseosa Cola 500ml', 1500.50, 21, 100],
                    ['00001', 'Galletitas Dulces 150g', 2100.00, 21, 50],
                    ['9999999', 'Producto Sin Stock', 3000.00, 10.5, 0]
                ];
                dummy.forEach(p => {
                    db.run('INSERT INTO productos (codigo, nombre, precio, iva, stock) VALUES (?, ?, ?, ?, ?)', p);
                });
                console.log('Productos de prueba cargados.');
            }
        });
    });
}

// Función para buscar por lector de barras
function buscarProductoPorCodigo(codigo) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM productos WHERE codigo = ?', [codigo], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
}

module.exports = { initDB, buscarProductoPorCodigo };
