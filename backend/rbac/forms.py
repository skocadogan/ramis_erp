from django import forms
from django.core.exceptions import ValidationError

from rbac import RolePermission, PermissionCategory


class PermissionForm(forms.ModelForm):
    class Meta:
        model = RolePermission
        fields = ['name', 'code', 'category', 'description']
        widgets = {
            'description': forms.Textarea(attrs={'rows': 3}),
        }

    def clean_code(self):
        code = self.cleaned_data['code'].strip()
        category = self.cleaned_data.get('category')
        if not category and 'category' in self.data:
            try:
                category_id = int(self.data.get('category'))
                category = PermissionCategory.objects.get(id=category_id)
            except (ValueError, PermissionCategory.DoesNotExist):
                pass

        if '.' in code:
            parts = code.split('.', 1)
            app_part, codename_part = parts[0], parts[1]
            if not codename_part.isidentifier():
                raise forms.ValidationError(
                    'Kod adı geçerli bir Python tanımlayıcısı olmalıdır (codename kısmı).')
            if not app_part.isidentifier():
                raise forms.ValidationError(
                    'App kısmı geçerli bir Python tanımlayıcısı olmalıdır.')
            # Kategori varsa app kısmı kategori kodu ile tutarlı olmalı
            if category and app_part != category.code:
                raise forms.ValidationError(
                    f'Kodun app kısmı ("{app_part}") seçilen kategori kodu ("{category.code}") ile eşleşmelidir.')
            return code
        elif category and code.isidentifier():
            return f"{category.code}.{code}"

        raise forms.ValidationError(
            'Kod adı app.codename formatında veya kategori seçiliyse sadece codename olmalıdır.')


class PermissionCategoryForm(forms.ModelForm):
    class Meta:
        model = PermissionCategory
        fields = ['name', 'code', 'description']
        widgets = {
            'description': forms.Textarea(attrs={'rows': 3}),
        }

    def clean_code(self):
        code = self.cleaned_data['code'].lower().strip()
        if self.instance.pk:
            if PermissionCategory.objects.filter(code=code).exclude(pk=self.instance.pk).exists():
                raise ValidationError('Bu kod zaten mevcut.')
        else:
            if PermissionCategory.objects.filter(code=code).exists():
                raise ValidationError('Bu kod zaten mevcut.')
        return code
