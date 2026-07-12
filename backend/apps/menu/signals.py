from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Category, Product, ProductVariant
from .ws_broadcast import broadcast_menu_catalog_refresh


@receiver(post_save, sender=Product)
def menu_product_saved(sender, instance, **kwargs):
    broadcast_menu_catalog_refresh(
        "product_saved",
        product_id=str(instance.id),
        category_id=str(instance.category_id),
    )


@receiver(post_delete, sender=Product)
def menu_product_deleted(sender, instance, **kwargs):
    broadcast_menu_catalog_refresh(
        "product_deleted",
        product_id=str(instance.id),
        category_id=str(instance.category_id),
    )


@receiver(post_save, sender=Category)
def menu_category_saved(sender, instance, **kwargs):
    broadcast_menu_catalog_refresh("category_saved", category_id=str(instance.id))


@receiver(post_delete, sender=Category)
def menu_category_deleted(sender, instance, **kwargs):
    broadcast_menu_catalog_refresh("category_deleted", category_id=str(instance.id))


@receiver(post_save, sender=ProductVariant)
def menu_product_variant_saved(sender, instance, **kwargs):
    broadcast_menu_catalog_refresh(
        "product_variant_saved",
        product_id=str(instance.product_id),
        variant_id=str(instance.id),
    )


@receiver(post_delete, sender=ProductVariant)
def menu_product_variant_deleted(sender, instance, **kwargs):
    broadcast_menu_catalog_refresh(
        "product_variant_deleted",
        product_id=str(instance.product_id),
        variant_id=str(instance.id),
    )
