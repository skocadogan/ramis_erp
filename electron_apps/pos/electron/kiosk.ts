import { BrowserWindow } from "electron";

let _isKiosk = false;

export function isKioskMode(): boolean {
  return _isKiosk;
}

/** BrowserWindow oluşturulurken kiosk:true verildiğinde dahili bayrağı senkronize et. */
export function markKioskActive(): void {
  _isKiosk = true;
}

export function enterKioskMode(win: BrowserWindow): void {
  win.setResizable(false);
  // Linux birincil monitör: oluşturucu/toggle ile setKiosk güvenilir; setFullScreen tek başına yetmiyor.
  if (process.platform === "linux") {
    win.setKiosk(true);
  } else {
    win.setFullScreen(true);
    win.setKiosk(true);
  }
  _isKiosk = true;
}

export function exitKioskMode(win: BrowserWindow): void {
  win.setKiosk(false);
  win.setFullScreen(false);
  win.setResizable(true);
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
