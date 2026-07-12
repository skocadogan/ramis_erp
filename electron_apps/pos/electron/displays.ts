import { BrowserWindow, Display, Rectangle, screen } from "electron";
import { enterKioskMode } from "./kiosk";
import { log } from "./logger";

/** Açılışta ve pencere taşırken tüm monitörleri logla (Electron screen API). */
export function logAllDisplays(context = "Displays"): void {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();

  log(`[${context}] Toplam ${displays.length} monitör algılandı`);

  const sorted = [...displays].sort(
    (a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y,
  );

  sorted.forEach((display, index) => {
    const { x, y, width, height } = display.bounds;
    const { x: wx, y: wy, width: ww, height: wh } = display.workArea;
    const flags = [
      display.id === primary.id ? "primary" : null,
      display.internal ? "internal" : "external",
    ]
      .filter(Boolean)
      .join(", ");

    log(
      `[${context}] #${index + 1} id=${display.id} [${flags}] ` +
        `bounds=(${x},${y} ${width}x${height}) ` +
        `workArea=(${wx},${wy} ${ww}x${wh}) scale=${display.scaleFactor}` +
        ("label" in display && display.label ? ` label="${display.label}"` : ""),
    );
  });
}

export function boundsForDisplay(display: Display): Rectangle {
  return { ...display.bounds };
}

/** Pencere merkezine göre hangi monitörde olduğunu bul. */
export function getDisplayForWindow(win: BrowserWindow): Display {
  const bounds = win.getBounds();
  const centerX = bounds.x + Math.round(bounds.width / 2);
  const centerY = bounds.y + Math.round(bounds.height / 2);
  return screen.getDisplayNearestPoint({ x: centerX, y: centerY });
}

/**
 * POS dışındaki monitörü seç.
 * Önce hariç tutulacak monitör (genelde POS penceresi) dışındakiler arasından
 * soldan sağa sıralı ilk monitörü alır.
 */
export function getSecondaryDisplay(excludeDisplayId?: number): Display | null {
  const displays = screen.getAllDisplays();
  if (displays.length < 2) {
    return null;
  }

  const excludeId = excludeDisplayId ?? screen.getPrimaryDisplay().id;
  const candidates = displays
    .filter((d) => d.id !== excludeId)
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);

  return candidates[0] ?? null;
}

/**
 * Pencereyi hedef monitöre taşıyıp göster.
 * Linux'ta kiosk/fullscreen oluşturucu seçenekleri x,y'yi yok sayabildiği için
 * önce bounds ayarlanır, pencere gösterilir, ardından tam ekran/kiosk modu uygulanır.
 */
export function showWindowOnDisplay(
  win: BrowserWindow,
  display: Display,
  mode: "kiosk" | "fullscreen",
): void {
  const bounds = boundsForDisplay(display);
  log(
    `[Displays] Pencere taşınıyor: displayId=${display.id} mode=${mode} bounds=${JSON.stringify(bounds)}`,
  );

  win.setKiosk(false);
  win.setFullScreen(false);
  win.setBounds(bounds);
  win.show();

  const applyMode = (): void => {
    if (win.isDestroyed()) {
      return;
    }
    if (mode === "kiosk") {
      enterKioskMode(win);
    } else {
      win.setFullScreen(true);
    }

    // Linux'ta ilk deneme bazen pencere modunda kalır; kısa gecikmeyle tekrar dene.
    if (process.platform === "linux" && !win.isFullScreen()) {
      setTimeout(() => {
        if (!win.isDestroyed() && !win.isFullScreen()) {
          win.setFullScreen(true);
        }
      }, 100);
    }
  };

  // Wayland/X11 bazen bounds ile fullscreen arasında kısa gecikme ister.
  if (process.platform === "linux") {
    setTimeout(applyMode, 150);
  } else {
    applyMode();
  }
}
