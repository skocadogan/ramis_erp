from rest_framework import serializers
from .models import AuditLog
from apps.users.serializers import UserListSerializer
from apps.branches.serializers import BranchSerializer

class AuditLogSerializer(serializers.ModelSerializer):
    actor_details = UserListSerializer(source='actor', read_only=True)
    branch_details = BranchSerializer(source='branch', read_only=True)
    
    class Meta:
        model = AuditLog
        fields = [
            'id', 'created_at', 'actor', 'actor_details', 
            'actor_ip', 'user_agent', 'branch', 'branch_details',
            'action', 'target_type', 'target_id', 
            'before_json', 'after_json', 'metadata'
        ]
