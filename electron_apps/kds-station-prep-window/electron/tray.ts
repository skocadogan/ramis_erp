import { app, Menu, Tray, BrowserWindow, nativeImage } from "electron";
import path from "path";
import { APP_NAME } from "./constants";

let tray: Tray | null = null;

function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "resources", "icon.png");
  }
  return path.join(__dirname, "..", "..", "resources", "icon.png");
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

export function createTray(mainWindow: BrowserWindow): void {
  destroyTray();

  const iconPath = getIconPath();
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Ekranı Göster",
      click: () => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: "separator" },
    {
      label: "Yeniden Yükle",
      click: () => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.reload();
      },
    },
    { type: "separator" },
    {
      label: "Çıkış",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  });
}
