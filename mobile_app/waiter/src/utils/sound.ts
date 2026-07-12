/**
 * Bildirim sesleri — SDK 55+: expo-audio (Expo Go uyumlu).
 */
let lastPlayer: { remove: () => void } | null = null;

async function playAsset(source: number): Promise<void> {
  try {
    const { createAudioPlayer } = await import("expo-audio");

    if (lastPlayer) {
      try {
        lastPlayer.remove();
      } catch {
        /* ignore */
      }
      lastPlayer = null;
    }

    const player = createAudioPlayer(source);
    lastPlayer = player;
    player.play();

    const safeRemove = () => {
      try {
        player.remove();
        if (lastPlayer === player) lastPlayer = null;
      } catch {
        /* ignore */
      }
    };

    setTimeout(safeRemove, 8000);
  } catch (error) {
    console.warn("Sound playback skipped:", error);
  }
}

export async function playKitchenReadySound(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return playAsset(require("../../assets/kitchen-ready.mp3"));
}

export async function playTableCallingSound(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return playAsset(require("../../assets/table-calling.mp3"));
}
