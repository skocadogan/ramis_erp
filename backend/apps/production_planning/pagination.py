from rest_framework.pagination import PageNumberPagination


class ProductionPlanningPagination(PageNumberPagination):
    """Üretim planı ve bulunabilirlik listeleri — sayfalı listeleme."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200
