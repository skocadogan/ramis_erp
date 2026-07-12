from django.urls import path
from .views import RecycleBinSummaryView, RecycleBinListView, RecycleBinActionView

urlpatterns = [
    path('recycle-bin/summary/', RecycleBinSummaryView.as_view(), name='recycle_bin_summary'),
    path('recycle-bin/list/<str:app_label>/<str:model_name>/', RecycleBinListView.as_view(), name='recycle_bin_list'),
    path('recycle-bin/action/', RecycleBinActionView.as_view(), name='recycle_bin_action'),
]
