import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { salesApi } from '../services/salesApi';
import type { Sale, PaymentMethod } from '../types';

interface UseSalesActionsProps {
    fetchSummary?: () => void;
}

export function useSalesActions({ fetchSummary }: UseSalesActionsProps) {
    const queryClient = useQueryClient();
    const [editSale, setEditSale] = useState<Sale | null>(null);
    const [editForm, setEditForm] = useState<{ payment_method: PaymentMethod; notes: string; total_amount: string }>({
        payment_method: 'CASH', notes: '', total_amount: ''
    });
    const [isEditSubmitting, setIsEditSubmitting] = useState(false);

    const [deleteSale, setDeleteSale] = useState<Sale | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);


    const handleEditOpen = useCallback((sale: Sale) => {
        setEditSale(sale);
        setEditForm({ payment_method: sale.payment_method, notes: sale.notes, total_amount: sale.total_amount });
    }, []);

    const handleEditSubmit = useCallback(async () => {
        if (!editSale) return;
        setIsEditSubmitting(true);
        try {
            await salesApi.updateSale(editSale.id, editForm);
            queryClient.invalidateQueries({ queryKey: queryKeys.salesBase });
            setEditSale(null);
        } catch (e) {
            console.error('Satış güncellenemedi:', e);
        } finally {
            setIsEditSubmitting(false);
        }
    }, [editSale, editForm, queryClient]);

    const handleDeleteConfirm = useCallback(async () => {
        if (!deleteSale) return;
        setIsDeleting(true);
        try {
            await salesApi.deleteSale(deleteSale.id);
            queryClient.invalidateQueries({ queryKey: queryKeys.salesBase });
            setDeleteSale(null);
            if (fetchSummary) fetchSummary();
        } catch (e) {
            console.error('Satış silinemedi:', e);
        } finally {
            setIsDeleting(false);
        }
    }, [deleteSale, fetchSummary, queryClient]);


    return {
        editSale, setEditSale,
        editForm, setEditForm,
        isEditSubmitting,
        deleteSale, setDeleteSale,
        isDeleting,
        handleEditOpen,
        handleEditSubmit,
        handleDeleteConfirm,
    };
}
