const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true, // Importante para usar SQLite en el frontend
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
  // win.webContents.openDevTools(); // Descomentá esto para ver errores si algo falla
}

app.whenReady().then(createWindow);
