import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.branches.models import Branch
from apps.menu.models import Category, Product
from apps.recipes.models import Recipe
from rbac.models import PermissionCategory, Role, RolePermission

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def recipes_cat(db):
    return PermissionCategory.objects.get_or_create(code="recipes", defaults={"name": "Reçeteler"})[0]


def _perm(code: str, name: str | None = None, *, cat):
    return RolePermission.objects.get_or_create(
        code=code,
        defaults={"name": name or code, "category": cat},
    )[0]


@pytest.fixture
def branches(db):
    primary = Branch.objects.create(name="Merkez", code="MERKEZ-SCOPE")
    secondary = Branch.objects.create(name="Diğer", code="OTHER-SCOPE")
    return primary, secondary


@pytest.fixture
def recipe_viewer(db, branches, recipes_cat):
    _primary, secondary = branches
    role = Role.objects.create(name="Reçete Görüntüleyici Test")
    role.permissions.add(_perm("recipes.view_recipe", cat=recipes_cat))
    user = User.objects.create_user(
        username="recipe_viewer_scope",
        email="recipe_viewer_scope@test.com",
        password="testpass123",
    )
    user.branch = secondary
    user.roles.add(role)
    user.save()
    return user


@pytest.mark.django_db
class TestRecipeBranchScope:
    def test_recipe_hidden_when_explicit_branch_does_not_match_even_if_product_on_both(
        self,
        api_client,
        branches,
        recipe_viewer,
    ):
        primary, secondary = branches
        category = Category.objects.create(name="İçecekler")
        product = Product.objects.create(
            category=category,
            name="Çay",
            base_price=Decimal("15.00"),
        )
        product.branches.set([primary, secondary])

        recipe = Recipe.objects.create(name="Çay Reçetesi", product=product, servings=1)
        recipe.branches.set([primary])

        api_client.force_authenticate(user=recipe_viewer)
        response = api_client.get("/api/v1/recipes/recipes/")

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        recipe_ids = {item["id"] for item in results}
        assert str(recipe.id) not in recipe_ids

    def test_recipe_visible_when_no_recipe_branches_but_product_matches_user_branch(
        self,
        api_client,
        branches,
        recipe_viewer,
    ):
        primary, secondary = branches
        category = Category.objects.create(name="Çorbalar")
        product = Product.objects.create(
            category=category,
            name="Mercimek",
            base_price=Decimal("50.00"),
        )
        product.branches.set([primary, secondary])

        recipe = Recipe.objects.create(name="Mercimek Reçetesi", product=product, servings=1)

        api_client.force_authenticate(user=recipe_viewer)
        response = api_client.get("/api/v1/recipes/recipes/")

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        recipe_ids = {item["id"] for item in results}
        assert str(recipe.id) in recipe_ids

    def test_recipe_hidden_when_neither_recipe_nor_product_matches_user_branch(
        self,
        api_client,
        branches,
        recipe_viewer,
    ):
        primary, _secondary = branches
        category = Category.objects.create(name="Salatalar")
        product = Product.objects.create(
            category=category,
            name="Çoban",
            base_price=Decimal("40.00"),
        )
        product.branches.set([primary])

        recipe = Recipe.objects.create(name="Çoban Reçetesi", product=product, servings=1)
        recipe.branches.set([primary])

        api_client.force_authenticate(user=recipe_viewer)
        response = api_client.get("/api/v1/recipes/recipes/")

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        recipe_ids = {item["id"] for item in results}
        assert str(recipe.id) not in recipe_ids
