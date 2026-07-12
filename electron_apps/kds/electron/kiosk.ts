import { BrowserWindow } from "electron";

let _isKiosk = false;

export function isKioskMode(): boolean {
  return _isKiosk;
}

export function enterKioskMode(win: BrowserWindow): void {
  win.setFullScreen(true);
  win.setKiosk(true);
  win.setResizable(false);
  _isKiosk = true;
}

export function exitKioskMode(win: BrowserWindow): void {
  win.setKiosk(false);
  win.setFullScreen(false);
  _isKiosk = false;
}

export function preventEscape(win: BrowserWindow): void {
  (win as any).on("leave-full-screen", (event: any) => {
    if (_isKiosk) {
      event.preventDefault();
      win.setFullScreen(true);
    }
  });
}
