'use client';

import { useEffect, useRef, useState } from 'react';

function resolveSeconds(
    cleaningUntil?: string | null,
    cleaningRemainingSeconds?: number | null,
): number | null {
    if (cleaningRemainingSeconds != null && Number.isFinite(cleaningRemainingSeconds)) {
        return Math.max(0, Math.floor(cleaningRemainingSeconds));
    }
    if (!cleaningUntil) return null;
    const untilMs = Date.parse(cleaningUntil);
    if (!Number.isFinite(untilMs)) return null;
    return Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
}

export function formatCleaningCountdown(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function useCleaningCountdown(
    cleaningUntil?: string | null,
    cleaningRemainingSeconds?: number | null,
): number | null {
    // Mevcut değerleri ref'te tut; interval mount başına bir kez kurulsun.
    // (Önceki implementasyon: prop identity her değiştiğinde interval clearInterval + setInterval
    //  ile yeniden kuruluyordu. WS push'ları her seferinde yeni string referansı oluşturduğu için
    //  interval saniyede bir reset oluyordu.)
    const [seconds, setSeconds] = useState<number | null>(() =>
        resolveSeconds(cleaningUntil, cleaningRemainingSeconds),
    );

    const valuesRef = useRef({ cleaningUntil, cleaningRemainingSeconds });
    useEffect(() => {
        valuesRef.current = { cleaningUntil, cleaningRemainingSeconds };
        // İlk değer değişiminde anında state'i de senkronla, böylece 1 saniye beklemeden
        // yeni cleaningRemainingSeconds değeri yansır.
        setSeconds(
            resolveSeconds(cleaningUntil, cleaningRemainingSeconds),
        );
    }, [cleaningUntil, cleaningRemainingSeconds]);

    useEffect(() => {
        const id = window.setInterval(() => {
            const { cleaningUntil: u, cleaningRemainingSeconds: r } = valuesRef.current;
            setSeconds(resolveSeconds(u, r));
        }, 1000);
        return () => window.clearInterval(id);
    }, []);

    return seconds;
}

/** Temizlik süresi dolduğunda tek seferlik callback tetikler (Celery yoksa veya WS gecikirse). */
export function useAutoFinishCleaningOnExpire(
    active: boolean,
    tableId: string,
    cleaningUntil: string | null | undefined,
    seconds: number | null,
    onExpire: (tableId: string) => void,
): void {
    const onExpireRef = useRef(onExpire);
    const firedSessionRef = useRef<string | null>(null);
    const sessionKey = active ? cleaningUntil ?? tableId : null;

    useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

    useEffect(() => {
        if (!sessionKey) {
            firedSessionRef.current = null;
            return;
        }
        if (seconds == null || seconds > 0) return;
        if (firedSessionRef.current === sessionKey) return;
        firedSessionRef.current = sessionKey;
        onExpireRef.current(tableId);
    }, [sessionKey, tableId, seconds]);
}
