import threading

_thread_local = threading.local()

def get_current_request():
    return getattr(_thread_local, 'request', None)

def set_current_request(request):
    _thread_local.request = request

def clear_current_request():
    if hasattr(_thread_local, 'request'):
        del _thread_local.request
