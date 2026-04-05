const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const dbModule = require('./src/database.js'); // Importamos la DB

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, // Un poco más ancha para tu diseño
    height: 900,
    backgroundColor: '#10141a', // Fondo oscuro por defecto
    frame: true, // Puedes ponerlo en false para marco custom más adelante
    webPreferences: {
      nodeIntegration: true, // Importante para SQLite y AFIP local
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, 'src/index.html'));
  
  // win.webContents.openDevTools(); // Descomentá para debuguear
}

// Inicializar la base de datos antes de abrir la ventana
dbModule.initDB();

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
