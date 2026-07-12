from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils.translation import gettext_lazy as _
from django.conf import settings
from core.models import BaseModel
from rbac.mixins import RBACUserMixin

class User(RBACUserMixin, AbstractUser, BaseModel):
    # Extend default user with UUID (from BaseModel) and branch
    branch = models.ForeignKey(
        'branches.Branch', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='users'
    )
    roles = models.ManyToManyField(
        'rbac.Role',
        blank=True,
        related_name='users',
        verbose_name=_('Roller')
    )

    class Meta:
        verbose_name = _('Kullanıcı')
        verbose_name_plural = _('Kullanıcılar')
    # email is already in AbstractUser, we can make it unique
    email = models.EmailField(unique=True)

    # i18n: kullanıcı tercih ettiği arayüz dilini buraya kaydeder
    preferred_language = models.CharField(
        max_length=5,
        choices=settings.LANGUAGES,
        default='tr',
        verbose_name=_("Tercih edilen dil"),
    )

    def __str__(self):
        return self.username


class PosUiContext(models.TextChoices):
    POS = "pos", _("POS / Kasa")
    WAITER = "waiter", _("Garson")


class UserPosScreenPreferences(BaseModel):
    """
    POS veya garson ekranı ayarları (kullanıcı + bağlam başına tek kayıt).
    JSON alanı; bildirim/yazıcı tercihleri sunucuda tutulur.
    Atanan POS (uuid + kod) garson/kasa bağlamına göre kaydedilir — cihaz localStorage ile birlikte çalışır.
    """

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="pos_screen_preferences",
        verbose_name=_("Kullanıcı"),
    )
    ui_context = models.CharField(
        max_length=16,
        choices=PosUiContext.choices,
        verbose_name=_("Ekran"),
    )
    data = models.JSONField(default=dict, blank=True, verbose_name=_("Tercihler"))

    class Meta:
        verbose_name = _("POS ekran tercihi")
        verbose_name_plural = _("POS ekran tercihleri")
        constraints = [
            models.UniqueConstraint(
                fields=["user", "ui_context"],
                name="users_pos_pref_user_context_uniq",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} {self.ui_context}"
