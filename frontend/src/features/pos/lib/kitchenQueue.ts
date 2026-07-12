/** Smart Firing v2 — API yanıtı gelmezse kullanılan varsayılan yoğunluk eşiği (dk). */
export const DEFAULT_KITCHEN_BUSY_BUFFER_THRESHOLD = 15;

export type KitchenQueueBufferState = {
  expectedBuffer: number;
  busyThreshold: number;
};
