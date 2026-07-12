from rest_framework.pagination import PageNumberPagination


class MenuCatalogPagination(PageNumberPagination):
    """POS / menü ekranları tüm katalogu görebilsin; varsayılan 20 kayıt yetersiz kalıyordu.

    PERF: ProductSerializer 14 adet SerializerMethodField içerir. Büyük page_size
    değerleri yüzlerce ürün için serialize → binlerce ek DB sorgusu demektir.
    Frontend MENU_CATALOG_PAGE_SIZE ile uyumlu olmalıdır.
    """

    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500
