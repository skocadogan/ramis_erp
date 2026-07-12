import pytest
from django.urls import reverse
from rest_framework import status
from django.contrib.auth import get_user_model
from rbac.models import Role, RolePermission, PermissionCategory
from apps.customers.models import Customer, CustomerType

User = get_user_model()

def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(code=code, defaults={'name': name, 'category': cat})[0]

@pytest.fixture
def rbac_cat(db):
    return PermissionCategory.objects.get_or_create(code='customers', defaults={'name': 'Müşteriler'})[0]

@pytest.fixture
def manager_user(db, rbac_cat):
    role = Role.objects.create(name='Şube Müdürü')
    for code, name in [
        ('customers.view_customer', 'Müşteri Görüntüle'),
        ('customers.manage_customer', 'Müşteri Yönet'),
    ]:
        perm = _make_perm(code, name, rbac_cat)
        role.permissions.add(perm)
    
    user = User.objects.create_user(
        username='managertest', password='pw', email='manager@test.com'
    )
    user.roles.add(role)
    return user

@pytest.fixture
def cashier_user(db, rbac_cat):
    role = Role.objects.create(name='Kasiyer')
    perm = _make_perm('customers.view_customer', 'Müşteri Görüntüle', rbac_cat)
    role.permissions.add(perm)
    
    user = User.objects.create_user(
        username='cashiertest', password='pw', email='cashier@test.com'
    )
    user.roles.add(role)
    return user

@pytest.fixture
def unauthorized_user(db):
    return User.objects.create_user(
        username='unauthtest', password='pw', email='unauth@test.com'
    )

@pytest.fixture
def customer(db):
    return Customer.objects.create(
        customer_type=CustomerType.INDIVIDUAL,
        name='Test Müşterisi',
        phone='05551234567',
        email='test@customer.com',
        tc_no='12345678901'
    )

@pytest.mark.django_db
class TestCustomerViews:
    def test_yetkisiz_kullanici_musteri_listesini_goremez(self, api_client, unauthorized_user):
        url = reverse('customer-list')
        api_client.force_authenticate(user=unauthorized_user)
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_kasiyer_musteri_listesini_gorebilir(self, api_client, cashier_user, customer):
        url = reverse('customer-list')
        api_client.force_authenticate(user=cashier_user)
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['name'] == customer.name

    def test_manager_kullanici_musteri_olusturabilir(self, api_client, manager_user):
        url = reverse('customer-list')
        api_client.force_authenticate(user=manager_user)
        payload = {
            'customer_type': 'CORPORATE',
            'name': 'Ramis A.Ş.',
            'tax_office': 'Kadıköy V.D.',
            'tax_no': '1234567890',
            'phone': '02123334455'
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Ramis A.Ş.'
        assert response.data['customer_type'] == 'CORPORATE'

    def test_kasiyer_musteri_olusturamaz(self, api_client, cashier_user):
        url = reverse('customer-list')
        api_client.force_authenticate(user=cashier_user)
        payload = {
            'customer_type': 'INDIVIDUAL',
            'name': 'Ahmet Yılmaz',
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_manager_musteriyi_soft_delete_edebilir(self, api_client, manager_user, customer):
        url = reverse('customer-detail', kwargs={'pk': customer.id})
        api_client.force_authenticate(user=manager_user)
        
        # Soft delete triggers
        response = api_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Verify from database
        customer.refresh_from_db()
        assert customer.is_active is False
        
        # Verify it's no longer listed in standard queryset
        list_url = reverse('customer-list')
        list_response = api_client.get(list_url)
        assert len(list_response.data['results']) == 0
