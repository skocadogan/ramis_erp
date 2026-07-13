'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, GripVertical } from 'lucide-react';
import { toastApiError, toastApiSuccess } from '@/lib/operationalToast';
import type { Branch } from '@/types/user.types';
import type { Zone, ZoneCreatePayload, ZoneUpdatePayload } from '../types/table.types';
import { useZones, useZoneMutations } from '../hooks/useTables';
import { useTranslations } from 'next-intl';
import { ZoneFormModal } from './ZoneFormModal';
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// DND kit imports
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


interface SortableZoneItemProps {
    zone: Zone;
    canManage: boolean;
    onEdit: (z: Zone) => void;
    onDelete: (z: Zone) => void;
}

function SortableZoneItem({ zone, canManage, onEdit, onDelete }: SortableZoneItemProps) {
    const t = useTranslations('tables.zones');
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: zone.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
    };

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={`flex items-center justify-between gap-3 bg-background px-4 py-3
 ${isDragging ? 'relative z-50 scale-[1.02] rounded-lg border-2 border-primary/40 shadow-xl' : 'border-b border-border'}
 transition-all group hover:bg-background`}
        >
            <div className="min-w-0 flex-1 flex items-center gap-3">
                {canManage && (
                    <div
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing p-1 -ml-1 hover:text-muted-foreground transition-colors"
                        title={t('dragToReorder')}
                    >
                        <GripVertical size={16} />
                    </div>
                )}
                <div
                    className="w-3 h-3 rounded-full shrink-0 border border-border shadow-sm"
                    style={{ backgroundColor: zone.color || '#94a3b8' }}
                />
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{zone.name}</p>
                    {zone.description && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{zone.description}</p>
                    )}
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
                {!zone.is_active && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t('inactive')}
                    </span>
                )}
                {canManage && !isDragging && (
                    <>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onEdit(zone)}
                            aria-label={`${zone.name} düzenle`}
                        >
                            <Pencil size={15} />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onDelete(zone)}
                            aria-label={`${zone.name} sil`}
                            className="hover:text-destructive"
                        >
                            <Trash2 size={15} />
                        </Button>
                    </>
                )}
            </div>
        </li>
    );
}

export interface ZoneManageModalProps {
    branchId: string;
    branchName?: string;
    branches: Branch[];
    canPickBranch: boolean;
    canManage: boolean;
    onClose: () => void;
}

export function ZoneManageModal({
    branchId,
    branchName,
    branches,
    canPickBranch,
    canManage,
    onClose,
}: ZoneManageModalProps) {
    const t = useTranslations('tables.zones');
    const tCommon = useTranslations('tables.form');
    const { data: zones = [], isLoading } = useZones(branchId);
    const { createZone, updateZone, deleteZone, reorderZone, isPending } = useZoneMutations();

    const [localZones, setLocalZones] = useState<Zone[]>(() => zones.filter(z => z.is_active !== false));
    const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
    const [editingZone, setEditingZone] = useState<Zone | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Zone | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Sync local state with remote data when remote data changes
    useEffect(() => {
        setLocalZones(zones.filter(z => z.is_active !== false));
    }, [zones]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = localZones.findIndex(z => z.id === active.id);
            const newIndex = localZones.findIndex(z => z.id === over.id);
            const reordered = arrayMove(localZones, oldIndex, newIndex);

            // Immediate UI update
            setLocalZones(reordered);

            try {
                // Persist to backend
                await reorderZone(reordered.map(z => z.id));
                toastApiSuccess(t('reorderedSuccess'));
            } catch (e) {
                toastApiError(e, t('reorderedError'));
                // Rollback if failed
                setLocalZones(zones);
            }
        }
    };

    const handleCreate = async (payload: ZoneCreatePayload) => {
        try {
            await createZone(payload);
            setFormMode(null);
            toastApiSuccess(t('createdSuccess'));
        } catch (e) {
            toastApiError(e, t('createdError'));
        }
    };

    const handleUpdate = async (id: string, payload: ZoneUpdatePayload) => {
        try {
            await updateZone({ id, payload });
            setFormMode(null);
            setEditingZone(null);
            toastApiSuccess(t('updatedSuccess'));
        } catch (e) {
            toastApiError(e, t('updatedError'));
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await deleteZone(deleteTarget.id);
            setDeleteTarget(null);
            toastApiSuccess(t('deletedSuccess'));
        } catch (e) {
            toastApiError(e, t('deletedError'));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
                <DialogContent
                    layout="scroll"
                    size="md"
                    className="z-[100]"
                    backdropClassName="z-[100]"
                >
                    <DialogHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pr-12">
                        <div className="min-w-0 flex-1">
                            <DialogTitle>{t('title')}</DialogTitle>
                            {branchName && (
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {t('branch')}: {branchName}
                                </p>
                            )}
                        </div>
                        {canManage && (
                            <Button
                                type="button"
                                size="sm"
                                className="shrink-0"
                                onClick={() => {
                                    setEditingZone(null);
                                    setFormMode('create');
                                }}
                            >
                                <Plus size={14} />
                                {t('add')}
                            </Button>
                        )}
                    </DialogHeader>

                    <DialogBody className="p-1">
                        {isLoading ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">{tCommon('loading')}</div>
                        ) : localZones.length === 0 ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">
                                {t('noZones')}
                                {canManage && ` ${t('addHint')}`}
                            </div>
                        ) : (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={localZones.map(z => z.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <ul>
                                        {localZones.map(z => (
                                            <SortableZoneItem
                                                key={z.id}
                                                zone={z}
                                                canManage={canManage}
                                                onEdit={z => {
                                                    setEditingZone(z);
                                                    setFormMode('edit');
                                                }}
                                                onDelete={z => setDeleteTarget(z)}
                                            />
                                        ))}
                                    </ul>
                                </SortableContext>
                            </DndContext>
                        )}
                    </DialogBody>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            {tCommon('cancel')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {formMode && (
                <ZoneFormModal
                    zone={formMode === 'edit' ? editingZone : null}
                    branches={branches}
                    defaultBranchId={branchId}
                    canPickBranch={canPickBranch && formMode === 'create'}
                    onClose={() => {
                        setFormMode(null);
                        setEditingZone(null);
                    }}
                    onCreate={handleCreate}
                    onUpdate={handleUpdate}
                    isSubmitting={isPending}
                />
            )}

            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent className="z-[120]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget &&
                                t.rich('deleteDesc', {
                                    name: deleteTarget.name,
                                    b: (chunk) => <span className="font-medium text-foreground">{chunk}</span>,
                                })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>{tCommon('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                void handleDelete();
                            }}
                            disabled={isDeleting}
                            className="bg-destructive text-white hover:bg-destructive/90"
                        >
                            {isDeleting && <Loader2 size={13} className="animate-spin" />}
                            {isDeleting ? t('deleting') : tCommon('delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
