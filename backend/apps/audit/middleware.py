from django.utils.deprecation import MiddlewareMixin
from .thread_local import set_current_request, clear_current_request

class AuditMiddleware(MiddlewareMixin):
    """
    Her istekte request nesnesini thread-local storage'a kaydeder.
    Bu sayede AuditLog servisi IP, User Agent ve Actor bilgilerine erişebilir.
    Yalnızca API isteklerinde çalışır.
    """
    def process_request(self, request):
        if request.path.startswith('/api/'):
            set_current_request(request)

    def process_response(self, request, response):
        if request.path.startswith('/api/'):
            clear_current_request()
        return response

    def process_exception(self, request, exception):
        if request.path.startswith('/api/'):
            clear_current_request()
