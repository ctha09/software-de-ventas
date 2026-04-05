const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Crea o abre el archivo de base de datos en la carpeta del programa
const db = new sqlite3.Database(path.join(__dirname, 'ventas.db'));

db.serialize(() => {
    // Creamos la tabla si no existe
    db.run(`CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,
        nombre TEXT,
        precio REAL,
        stock INTEGER
    )`);

    // Insertamos un producto de prueba (solo para testear)
    db.run(`INSERT OR IGNORE INTO productos (codigo, nombre, precio, stock) 
            VALUES ('7791234567890', 'Producto de Prueba', 1500.50, 10)`);
});

// Función para buscar producto por código de barras
function buscarProducto(codigo) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM productos WHERE codigo = ?", [codigo], (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
}

module.exports = { buscarProducto };
