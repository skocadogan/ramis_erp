from rest_framework import viewsets, status, filters
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db.models import Count
from rbac.drf import RBACPermission
from core.branch_scope import filter_recipe_queryset_by_accessible_branches

from .models import Recipe, RecipeIngredient, RecipeCategory
from .serializers import (
    RecipeSerializer,
    RecipeCreateSerializer,
    RecipeCategorySerializer,
    RecipeIngredientSerializer,
    RecipeIngredientCreateSerializer,
)
from .services import RecipeService
from . import selectors


class RecipeCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [RBACPermission]
    permission_description = 'Reçete kategorisi yönetimi'
    queryset = (
        RecipeCategory.objects.select_related('parent')
        .annotate(recipes_count=Count('recipes'))
        .order_by('name', 'id')
    )
    serializer_class = RecipeCategorySerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code']

    def get_permissions(self):
        read_codes = ['recipes.view_category', 'recipes.manage_category']
        write_codes = ['recipes.manage_category']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        else:
            self.permission_codes = write_codes
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        parent_id = self.request.query_params.get('parent')
        if parent_id:
            queryset = queryset.filter(parent_id=parent_id)
        return queryset


class RecipeViewSet(viewsets.ModelViewSet):
    serializer_class = RecipeSerializer
    permission_classes = [RBACPermission]

    def get_permissions(self):
        read_codes = ['recipes.view_recipe', 'recipes.manage_recipe']
        write_codes = ['recipes.manage_recipe']
        if self.action in ['list', 'retrieve']:
            self.permission_codes = read_codes
        elif self.action == 'create':
            self.permission_codes = write_codes
        elif self.action in ['update', 'partial_update']:
            self.permission_codes = write_codes
        elif self.action == 'destroy':
            self.permission_codes = ['recipes.delete_recipe']
        elif self.action in ['add_ingredient', 'remove_ingredient']:
            self.permission_codes = write_codes
        else:
            self.permission_codes = read_codes
        return super().get_permissions()

    def get_queryset(self):
        qs = selectors.get_active_recipes()
        
        category_id = self.request.query_params.get('category_id')
        if category_id:
            qs = qs.filter(category_id=category_id)

        qs = filter_recipe_queryset_by_accessible_branches(qs, self.request.user)
        # PERF-1: toplam maliyet tek sorguda hesaplanır (N+1 önlendi)
        return selectors.get_recipes_with_cost(qs)

    def get_serializer_class(self):
        if self.action == 'create':
            return RecipeCreateSerializer
        return RecipeSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        recipe = RecipeService.create_recipe(
            product_id=data.get('product_id'),
            category_id=data.get('category_id'),
            name=data['name'],
            servings=data.get('servings', 1),
            serving_quantity=data.get('serving_quantity'),
            serving_unit=data.get('serving_unit', ''),
            description=data.get('description', ''),
            prep_time_minutes=data.get('prep_time_minutes', 0),
            cook_time_minutes=data.get('cook_time_minutes', 0),
            prep_time_per_serving=data.get('prep_time_per_serving', 0),
            cook_time_per_serving=data.get('cook_time_per_serving', 0),
            instructions=data.get('instructions', ''),
            ingredients_data=data.get('ingredients', []),
            branches_data=data.get('branches', []),
        )
        return Response(
            RecipeSerializer(recipe).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        recipe = self.get_object()
        serializer = RecipeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        updated = RecipeService.update_recipe(
            recipe,
            product_id=data.get('product_id', recipe.product_id),
            category_id=data.get('category_id', recipe.category_id),
            name=data.get('name', recipe.name),
            servings=data.get('servings', recipe.servings),
            serving_quantity=data.get('serving_quantity', recipe.serving_quantity),
            serving_unit=data.get('serving_unit', recipe.serving_unit),
            description=data.get('description', recipe.description),
            prep_time_minutes=data.get('prep_time_minutes', recipe.prep_time_minutes),
            cook_time_minutes=data.get('cook_time_minutes', recipe.cook_time_minutes),
            prep_time_per_serving=data.get('prep_time_per_serving', recipe.prep_time_per_serving),
            cook_time_per_serving=data.get('cook_time_per_serving', recipe.cook_time_per_serving),
            instructions=data.get('instructions', recipe.instructions),
            ingredients_data=data.get('ingredients'),
            branches_data=data.get('branches'),
        )
        return Response(RecipeSerializer(updated).data)

    @action(detail=True, methods=['post'])
    def add_ingredient(self, request, pk=None):
        recipe = self.get_object()
        serializer = RecipeIngredientCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        ingredient = RecipeService.add_ingredient(
            recipe=recipe,
            stock_item_id=data.get('stock_item_id'),
            sub_recipe_id=data.get('sub_recipe_id'),
            quantity=data['quantity'],
            unit=data['unit'],
            notes=data.get('notes', ''),
        )
        return Response(
            RecipeIngredientSerializer(ingredient).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True, methods=['delete'], url_path='remove-ingredient/(?P<ingredient_id>[^/.]+)',
    )
    def remove_ingredient(self, request, pk=None, ingredient_id=None):
        recipe = self.get_object()
        RecipeService.remove_ingredient(recipe, ingredient_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
