/** Performans analizi — bugünü kapsayan dönemlerde periyodik yenileme (ms). */
const PERFORMANCES_LIVE_POLL_MS = 20_000;

function todayYmdLocal(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Bitiş tarihi bugün veya sonrasıysa yeni kayıt gelebilir; arka planda yoklama açılır. */
export function shouldLivePollPerformances(endDate: string): boolean {
    return endDate >= todayYmdLocal();
}

export function performancesLiveQueryOptions(endDate: string) {
    const live = shouldLivePollPerformances(endDate);
    return {
        staleTime: live ? 0 : undefined,
        refetchInterval: live ? PERFORMANCES_LIVE_POLL_MS : (false as const),
        refetchIntervalInBackground: false as const,
        refetchOnWindowFocus: live ? true : undefined,
    };
}
