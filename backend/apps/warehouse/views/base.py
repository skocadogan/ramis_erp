from rest_framework import viewsets, status, filters
from rest_framework.pagination import PageNumberPagination
from rbac.drf import RBACPermission

class StandardPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200
