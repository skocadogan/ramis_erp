import json
import logging

from django.core.serializers.json import DjangoJSONEncoder

from .models import AuditLog
from .thread_local import get_current_request

logger = logging.getLogger(__name__)


def _json_safe(data):
    """JSONField'a yazılabilir, JSON-serileştirilebilir yapıya dönüştürür."""
    if data is None:
        return None
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))

def record_audit(
    action: str,
    target_instance=None,
    before_json=None,
    after_json=None,
    metadata=None,
    actor=None,
    branch=None,
    target_type=None,
    target_id=None
):
    """
    Merkezi denetim kaydı oluşturma fonksiyonu.
    """
    request = get_current_request()
    
    # Otomatik actor ve IP/UA tespiti
    final_actor = actor
    actor_ip = None
    user_agent = None
    
    if request:
        if not final_actor and request.user and request.user.is_authenticated:
            final_actor = request.user
        
        # IP tespiti (proxy desteği ile)
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            actor_ip = x_forwarded_for.split(',')[0].strip()
        else:
            actor_ip = request.META.get('REMOTE_ADDR')
            
        user_agent = request.META.get('HTTP_USER_AGENT')

    # Target tespiti
    final_target_type = target_type
    final_target_id = target_id
    
    if target_instance:
        if not final_target_type:
            final_target_type = f"{target_instance._meta.app_label}.{target_instance._meta.model_name}"
        if not final_target_id:
            final_target_id = str(getattr(target_instance, 'pk', ''))

    # Branch tespiti
    final_branch = branch
    if not final_branch and target_instance and hasattr(target_instance, 'branch'):
        final_branch = target_instance.branch
    elif not final_branch and target_instance and hasattr(target_instance, 'branch_id'):
        from apps.branches.models import Branch
        try:
            final_branch = Branch.objects.get(pk=target_instance.branch_id)
        except Branch.DoesNotExist:
            pass

    try:
        # Atomic transaction içinde olmasına rağmen, audit'in hata vermesi 
        # ana işlemi bozmamalı (ancak roadmap append-only dediği için kaydedilmeli).
        # Hata durumunda loglanır.
        return AuditLog.objects.create(
            actor=final_actor,
            actor_ip=actor_ip,
            user_agent=user_agent,
            branch=final_branch,
            action=action,
            target_type=final_target_type or 'unknown',
            target_id=final_target_id or 'unknown',
            before_json=_json_safe(before_json),
            after_json=_json_safe(after_json),
            metadata=_json_safe(metadata),
        )
    except Exception as e:
        logger.error(f"Failed to record audit log: {e}", exc_info=True)
        return None
