const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// Evitar múltiples instancias
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'GestOK',
        // Ícono de la app
        icon: path.join(__dirname, 'build-resources', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            // Permitir Firebase y recursos externos
            webSecurity: false,
        },
        // Estética: sin barra de menú nativa
        autoHideMenuBar: true,
        backgroundColor: '#0f172a',
        show: false, // Mostrar solo cuando esté listo
    });

    // Cargar el index.html local
    mainWindow.loadURL('https://ctha09.github.io/software-de-ventas/');

    // Mostrar ventana cuando esté lista (evita parpadeo blanco)
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // Maximizar al iniciar
        mainWindow.maximize();
    });

    // Abrir links externos en el navegador, no en Electron
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Menú personalizado (solo los elementos necesarios)
function createMenu() {
    const template = [
        {
            label: 'GestOK',
            submenu: [
                {
                    label: 'Recargar',
                    accelerator: 'F5',
                    click: () => mainWindow && mainWindow.reload()
                },
                { type: 'separator' },
                {
                    label: 'Salir',
                    accelerator: 'Alt+F4',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'Ventana',
            submenu: [
                {
                    label: 'Pantalla completa',
                    accelerator: 'F11',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.setFullScreen(!mainWindow.isFullScreen());
                        }
                    }
                },
                {
                    label: 'Maximizar',
                    click: () => mainWindow && mainWindow.maximize()
                }
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
    createMenu();
    createWindow();

    // En macOS recrear ventana al hacer clic en el dock
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    app.quit();
});

// Si se abre una segunda instancia, enfocar la existente
app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});
