"use client";

import { memo } from "react";
import { CartItemNode } from "../ui/CartItemNode";
import type { CartItem } from "@/types/pos";

interface CartItemRowProps {
  cart: CartItem[];
  onUpdateQuantity: (cartId: string, delta: number) => void;
}

const CartItemRow = memo(function CartItemRow({ cart, onUpdateQuantity }: CartItemRowProps) {
  if (cart.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {cart.map((item) => (
        <CartItemNode
          key={item.cartId}
          item={item}
          onUpdateQuantity={onUpdateQuantity}
        />
      ))}
    </div>
  );
});

export { CartItemRow };
