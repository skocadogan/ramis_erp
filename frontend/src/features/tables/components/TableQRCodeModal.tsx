'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Loader2, Printer, QrCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Table } from '../types/table.types';
import { tablesApi } from '../services/tablesApi';
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AsyncPdfExportButton } from '@/components/AsyncPdfExportButton';

interface TableQRCodeModalProps {
    table: Table;
    onClose: () => void;
}

export function TableQRCodeModal({ table, onClose }: TableQRCodeModalProps) {
    const t = useTranslations('tables.qrCodeModal');
    const tForm = useTranslations('tables.form');

    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);
        setError(null);
        setQrCodeUrl(null);

        tablesApi.getQrCode(table.id)
            .then(data => {
                if (isMounted) {
                    setQrCodeUrl(data.qr_code);
                    setIsLoading(false);
                }
            })
            .catch(err => {
                console.error(err);
                if (isMounted) {
                    setError(t('errorLoading'));
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [table.id, t]);

    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
            <DialogContent size="sm" className="z-[120]" backdropClassName="z-[120]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <QrCode className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        {t('title')}
                    </DialogTitle>
                    <DialogDescription>
                        <span className="font-medium text-foreground">{table.name}</span>
                        {' · '}
                        {table.zone_name}
                        <span className="mt-0.5 block font-mono text-2xs text-muted-foreground">
                            {t('tableIdLabel', { id: table.id })}
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <DialogBody className="flex flex-col items-center justify-center bg-background py-2">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center space-y-3 py-10">
                            <Loader2 className="h-10 w-10 animate-spin text-indigo-600 dark:text-indigo-400" />
                            <p className="text-sm text-muted-foreground">{tForm('loading')}</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <p className="text-sm font-semibold text-destructive">{error}</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center space-y-4">
                            <div className="relative flex flex-col items-center rounded-2xl border border-border bg-background p-5 shadow-md">
                                <div className="mb-2 text-xs font-bold tracking-widertext-indigo-600 dark:text-indigo-400">
                                    RAMIS ERP
                                </div>
                                <div className="mb-1 text-sm font-bold text-foreground">
                                    {table.name} — {table.zone_name}
                                </div>

                                {qrCodeUrl && (
                                    <div className="rounded-xl border border-border bg-background p-3 shadow-inner">
                                        <Image
                                            src={qrCodeUrl}
                                            alt={`${table.name} QR Code`}
                                            width={176}
                                            height={176}
                                            unoptimized
                                            className="h-44 w-44 select-none object-contain"
                                            draggable={false}
                                        />
                                    </div>
                                )}

                                <div className="mt-4 max-w-[180px] text-center text-2xs leading-relaxed text-muted-foreground">
                                    Sipariş vermek veya menüyü incelemek için taratın.
                                </div>
                            </div>
                        </div>
                    )}
                </DialogBody>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t('close')}
                    </Button>
                    {!isLoading && !error && (
                        <AsyncPdfExportButton
                            reportSlug="table-qr-code"
                            params={{ table_id: table.id }}
                            filename={`table-qr-${table.name.replace(/\s+/g, '-').toLowerCase()}.pdf`}
                            variant="default"
                            size="sm"
                            className="bg-indigo-600 text-white hover:bg-indigo-700"
                        />
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
