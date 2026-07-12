export type NotificationSoundKey =
  | "kitchen-ready"
  | "table-calling"
  | "guest-arrival"
  | "deficiency-arrived"
  | "kitchen-order-came";

const SOUND_PATHS: Record<NotificationSoundKey, string> = {
  "kitchen-ready": "/sounds/kitchen-ready.mp3",
  "table-calling": "/sounds/table-calling.mp3",
  "guest-arrival": "/sounds/guest-arrival.mp3",
  "deficiency-arrived": "/sounds/deficiency-arrived.mp3",
  "kitchen-order-came": "/sounds/kitchen_order_came.mp3",
};

// Her ses için bir Audio elemanı cache'le. KDS'te her yeni sipariş geldiğinde
// (veya WS her "kds_refresh" event'ında) playNotificationSound çağrılıyordu;
// her çağrıda yeni HTMLAudioElement yaratmak hem GC yükü hem de play pipeline'ında
// gereksiz gecikme yaratıyordu. Cache'lenmiş eleman currentTime=0 ile yeniden başlatılır.
const audioCache: Partial<Record<NotificationSoundKey, HTMLAudioElement>> = {};

function getAudio(key: NotificationSoundKey): HTMLAudioElement {
  let a = audioCache[key];
  if (!a) {
    a = new Audio(SOUND_PATHS[key]);
    a.preload = "auto";
    audioCache[key] = a;
  }
  return a;
}

/** Bildirim türüne göre doğru ses dosyasını çalar. */
export function playNotificationSound(key: NotificationSoundKey): void {
  const audio = getAudio(key);
  // Aynı anda üst üste binen çağrılarda sesi başa sar.
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}
