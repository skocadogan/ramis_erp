'use client';

import {
    MoreHorizontal,
    Pencil,
    Trash2,
    Eye,
    EyeOff,
    Star,
    StarOff,
    Copy,
    Tag,
    Flame,
    ChefHat,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Product } from '@/features/menu/types';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface ProductActionsMenuProps {
    product: Product;
    canManage: boolean;
    onEdit: (product: Product) => void;
    onDelete: (product: Product) => void;
    onCopy?: (product: Product) => void;
    onRemoveDiscount?: (product: Product) => void;
    onToggleActive: (product: Product) => void;
    onTogglePos: (product: Product) => void;
    onToggleFeatured: (product: Product) => void;
    onTogglePopular: (product: Product) => void;
    onToggleChefRecommendation: (product: Product) => void;
    align?: 'left' | 'right';
}

export function ProductActionsMenu({
    product,
    canManage,
    onEdit,
    onDelete,
    onCopy,
    onRemoveDiscount,
    onTogglePos,
    onToggleFeatured,
    onTogglePopular,
    onToggleChefRecommendation,
    align = 'right',
}: ProductActionsMenuProps) {
    const t = useTranslations('menu_management');
    if (!canManage) return null;

    const menuAlign = align === 'right' ? 'end' : 'start';

    return (
        <div
            className={`inline-flex shrink-0 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
        >
            <DropdownMenu>
                <DropdownMenuTrigger
                    className="p-1.5 rounded-md text-muted-foreground hover: hover: dark:hover: transition-colors flex items-center justify-center"
                    aria-label={t('productActions.triggerAria')}
                >
                    <MoreHorizontal size={18} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align={menuAlign} className="w-56">
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>{t('productActions.label')}</DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        <DropdownMenuItem onClick={() => onEdit(product)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t('productActions.edit')}
                        </DropdownMenuItem>


                        <DropdownMenuItem onClick={() => onTogglePos(product)}>
                            {product.show_on_pos ? (
                                <>
                                    <EyeOff className="mr-2 h-4 w-4 text-muted-foreground" />
                                    {t('productActions.hidePos')}
                                </>
                            ) : (
                                <>
                                    <Eye className="mr-2 h-4 w-4 text-blue-500" />
                                    {t('productActions.showPos')}
                                </>
                            )}
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => onToggleFeatured(product)}>
                            {product.is_featured ? (
                                <>
                                    <StarOff className="mr-2 h-4 w-4 text-amber-500" />
                                    {t('productActions.unfeature')}
                                </>
                            ) : (
                                <>
                                    <Star className="mr-2 h-4 w-4 text-amber-500" />
                                    {t('productActions.feature')}
                                </>
                            )}
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => onTogglePopular(product)}>
                            {product.is_popular ? (
                                <>
                                    <Flame className="mr-2 h-4 w-4 text-orange-500" />
                                    {t('productActions.unmarkPopular')}
                                </>
                            ) : (
                                <>
                                    <Flame className="mr-2 h-4 w-4 text-orange-500" />
                                    {t('productActions.markPopular')}
                                </>
                            )}
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => onToggleChefRecommendation(product)}>
                            {product.is_chef_recommendation ? (
                                <>
                                    <ChefHat className="mr-2 h-4 w-4 text-violet-500" />
                                    {t('productActions.unmarkChefRecommendation')}
                                </>
                            ) : (
                                <>
                                    <ChefHat className="mr-2 h-4 w-4 text-violet-500" />
                                    {t('productActions.markChefRecommendation')}
                                </>
                            )}
                        </DropdownMenuItem>

                        {onCopy && (
                            <DropdownMenuItem onClick={() => onCopy(product)}>
                                <Copy className="mr-2 h-4 w-4 text-blue-500" />
                                {t('productActions.copy')}
                            </DropdownMenuItem>
                        )}

                        {parseFloat(String(product.discount_rate ?? 0)) > 0 && onRemoveDiscount ? (
                            <DropdownMenuItem onClick={() => onRemoveDiscount(product)}>
                                <Tag className="mr-2 h-4 w-4 text-rose-500" />
                                {t('productActions.removeDiscount')}
                            </DropdownMenuItem>
                        ) : null}

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                            onClick={() => onDelete(product)}
                            className="text-rose-600 dark:text-rose-400"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('productActions.delete')}
                        </DropdownMenuItem>
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
