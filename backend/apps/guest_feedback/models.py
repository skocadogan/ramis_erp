from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.branches.models import Branch, Table
from apps.customers.models import Customer
from apps.orders.models import Order
from apps.pos_display.models import PosTerminal
from apps.sales.models import Sale
from apps.users.models import User
from core.models import BaseModel


class SurveySource(models.TextChoices):
    POS_DISPLAY = 'POS_DISPLAY', _('Müşteri Ekranı')
    SMART_TABLE = 'SMART_TABLE', _('Smart Table')


class SurveyQuestionType(models.TextChoices):
    RATING = 'RATING', _('Derecelendirme')
    YES_NO = 'YES_NO', _('Evet / Hayır')
    OPTION = 'OPTION', _('Seçenek')
    SHORT_TEXT = 'SHORT_TEXT', _('Kısa Metin')


class SurveyQuestionRole(models.TextChoices):
    NONE = 'NONE', _('Genel')
    NPS = 'NPS', _('NPS')
    FOOD = 'FOOD', _('Yemek')
    SERVICE = 'SERVICE', _('Servis')
    SPEED = 'SPEED', _('Hız')
    CLEANLINESS = 'CLEANLINESS', _('Temizlik')


class SurveySessionStatus(models.TextChoices):
    OPENED = 'OPENED', _('Açıldı')
    ANSWERED = 'ANSWERED', _('Yanıtlandı')
    CLOSED = 'CLOSED', _('Kapatıldı')


class AttentionStatus(models.TextChoices):
    OPEN = 'OPEN', _('Açık')
    REVIEWED = 'REVIEWED', _('İncelendi')
    RESOLVED = 'RESOLVED', _('Çözüldü')


class Survey(BaseModel):
    title = models.CharField(max_length=180, verbose_name=_('Başlık'))
    description = models.TextField(blank=True, default='', verbose_name=_('Açıklama'))
    sort_order = models.PositiveIntegerField(default=0, verbose_name=_('Sıra'))
    branches = models.ManyToManyField(
        Branch,
        related_name='guest_feedback_surveys',
        verbose_name=_('Şubeler'),
    )
    is_customer_display_active = models.BooleanField(
        default=True,
        verbose_name=_('Müşteri ekranında aktif'),
    )
    is_smart_table_active = models.BooleanField(
        default=False,
        verbose_name=_('Smart Table üzerinde aktif'),
    )

    class Meta:
        ordering = ['sort_order', 'title']
        verbose_name = _('Anket')
        verbose_name_plural = _('Anketler')
        indexes = [
            models.Index(fields=['is_active', 'is_customer_display_active'], name='gf_svy_cfd_idx'),
            models.Index(fields=['is_active', 'is_smart_table_active'], name='gf_svy_st_idx'),
        ]

    def __str__(self):
        return self.title


class SurveyQuestion(BaseModel):
    survey = models.ForeignKey(
        Survey,
        on_delete=models.CASCADE,
        related_name='questions',
        verbose_name=_('Anket'),
    )
    text = models.CharField(max_length=500, verbose_name=_('Soru'))
    answer_type = models.CharField(
        max_length=20,
        choices=SurveyQuestionType.choices,
        default=SurveyQuestionType.RATING,
        verbose_name=_('Cevap tipi'),
    )
    question_role = models.CharField(
        max_length=20,
        choices=SurveyQuestionRole.choices,
        default=SurveyQuestionRole.NONE,
        verbose_name=_('Analitik rol'),
    )
    sort_order = models.PositiveIntegerField(default=0, verbose_name=_('Sıra'))
    is_required = models.BooleanField(default=True, verbose_name=_('Zorunlu'))
    placeholder = models.CharField(max_length=200, blank=True, default='', verbose_name=_('Yer tutucu'))
    rating_min_value = models.PositiveSmallIntegerField(default=1, verbose_name=_('Min puan'))
    rating_max_value = models.PositiveSmallIntegerField(default=5, verbose_name=_('Maks puan'))

    class Meta:
        ordering = ['sort_order', 'created_at']
        verbose_name = _('Anket sorusu')
        verbose_name_plural = _('Anket soruları')
        indexes = [
            models.Index(fields=['survey', 'is_active', 'sort_order'], name='gf_q_survey_sort_idx'),
        ]

    def __str__(self):
        return self.text


class SurveyQuestionOption(BaseModel):
    question = models.ForeignKey(
        SurveyQuestion,
        on_delete=models.CASCADE,
        related_name='options',
        verbose_name=_('Soru'),
    )
    label = models.CharField(max_length=200, verbose_name=_('Seçenek'))
    sort_order = models.PositiveIntegerField(default=0, verbose_name=_('Sıra'))

    class Meta:
        ordering = ['sort_order', 'created_at']
        verbose_name = _('Soru seçeneği')
        verbose_name_plural = _('Soru seçenekleri')
        indexes = [
            models.Index(fields=['question', 'is_active', 'sort_order'], name='gf_opt_question_idx'),
        ]

    def __str__(self):
        return self.label


class TableSurveySessionState(BaseModel):
    survey = models.ForeignKey(
        Survey,
        on_delete=models.PROTECT,
        related_name='session_states',
        verbose_name=_('Anket'),
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name='survey_session_states',
        verbose_name=_('Şube'),
    )
    table = models.ForeignKey(
        Table,
        on_delete=models.PROTECT,
        related_name='survey_session_states',
        null=True,
        blank=True,
        verbose_name=_('Masa'),
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.PROTECT,
        related_name='survey_session_states',
        null=True,
        blank=True,
        verbose_name=_('Sipariş'),
    )
    sale = models.ForeignKey(
        Sale,
        on_delete=models.PROTECT,
        related_name='survey_session_states',
        null=True,
        blank=True,
        verbose_name=_('Satış'),
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        related_name='survey_session_states',
        null=True,
        blank=True,
        verbose_name=_('Müşteri'),
    )
    staff_user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='survey_session_states',
        null=True,
        blank=True,
        verbose_name=_('Personel'),
    )
    pos_terminal = models.ForeignKey(
        PosTerminal,
        on_delete=models.PROTECT,
        related_name='survey_session_states',
        null=True,
        blank=True,
        verbose_name=_('POS terminali'),
    )
    source = models.CharField(
        max_length=20,
        choices=SurveySource.choices,
        default=SurveySource.POS_DISPLAY,
        verbose_name=_('Kaynak'),
    )
    session_key = models.CharField(max_length=200, verbose_name=_('Oturum anahtarı'))
    status = models.CharField(
        max_length=20,
        choices=SurveySessionStatus.choices,
        default=SurveySessionStatus.OPENED,
        verbose_name=_('Durum'),
    )
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name=_('Tamamlanma zamanı'))

    class Meta:
        verbose_name = _('Anket oturum durumu')
        verbose_name_plural = _('Anket oturum durumları')
        constraints = [
            models.UniqueConstraint(
                fields=['session_key', 'survey', 'source'],
                name='gf_sess_key_svy_src_uq',
            ),
        ]
        indexes = [
            models.Index(fields=['pos_terminal', 'status'], name='gf_session_terminal_status_idx'),
            models.Index(fields=['survey', 'branch', 'status'], name='gf_session_survey_branch_idx'),
            models.Index(fields=['sale', 'survey'], name='gf_session_sale_survey_idx'),
        ]

    def __str__(self):
        return f'{self.survey_id} @ {self.session_key}'


class SurveyResponse(BaseModel):
    survey = models.ForeignKey(
        Survey,
        on_delete=models.PROTECT,
        related_name='responses',
        verbose_name=_('Anket'),
    )
    session_state = models.OneToOneField(
        TableSurveySessionState,
        on_delete=models.PROTECT,
        related_name='response',
        verbose_name=_('Oturum'),
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name='survey_responses',
        verbose_name=_('Şube'),
    )
    table = models.ForeignKey(
        Table,
        on_delete=models.PROTECT,
        related_name='survey_responses',
        null=True,
        blank=True,
        verbose_name=_('Masa'),
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.PROTECT,
        related_name='survey_responses',
        null=True,
        blank=True,
        verbose_name=_('Sipariş'),
    )
    sale = models.ForeignKey(
        Sale,
        on_delete=models.PROTECT,
        related_name='survey_responses',
        null=True,
        blank=True,
        verbose_name=_('Satış'),
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        related_name='survey_responses',
        null=True,
        blank=True,
        verbose_name=_('Müşteri'),
    )
    staff_user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='survey_responses',
        null=True,
        blank=True,
        verbose_name=_('Personel'),
    )
    pos_terminal = models.ForeignKey(
        PosTerminal,
        on_delete=models.PROTECT,
        related_name='survey_responses',
        null=True,
        blank=True,
        verbose_name=_('POS terminali'),
    )
    source = models.CharField(
        max_length=20,
        choices=SurveySource.choices,
        default=SurveySource.POS_DISPLAY,
        verbose_name=_('Kaynak'),
    )
    session_key = models.CharField(max_length=200, verbose_name=_('Oturum anahtarı'))
    nps_score = models.SmallIntegerField(null=True, blank=True, verbose_name=_('NPS'))
    food_rating = models.SmallIntegerField(null=True, blank=True, verbose_name=_('Yemek puanı'))
    service_rating = models.SmallIntegerField(null=True, blank=True, verbose_name=_('Servis puanı'))
    speed_rating = models.SmallIntegerField(null=True, blank=True, verbose_name=_('Hız puanı'))
    cleanliness_rating = models.SmallIntegerField(null=True, blank=True, verbose_name=_('Temizlik puanı'))
    needs_attention = models.BooleanField(default=False, verbose_name=_('İlgi gerekiyor'))
    attention_status = models.CharField(
        max_length=20,
        choices=AttentionStatus.choices,
        default=AttentionStatus.OPEN,
        verbose_name=_('İlgi durumu'),
    )
    attention_note = models.TextField(blank=True, default='', verbose_name=_('İlgi notu'))
    attention_reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='reviewed_survey_responses',
        null=True,
        blank=True,
        verbose_name=_('İnceleyen kullanıcı'),
    )
    attention_reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('İnceleme zamanı'),
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Anket yanıtı')
        verbose_name_plural = _('Anket yanıtları')
        indexes = [
            models.Index(fields=['survey', 'branch', '-created_at'], name='gf_resp_survey_branch_idx'),
            models.Index(fields=['needs_attention', 'attention_status'], name='gf_resp_attention_idx'),
            models.Index(fields=['sale', 'survey'], name='gf_resp_sale_survey_idx'),
        ]

    def __str__(self):
        return f'{self.survey_id} / {self.created_at:%Y-%m-%d %H:%M:%S}'


class SurveyAnswer(BaseModel):
    response = models.ForeignKey(
        SurveyResponse,
        on_delete=models.CASCADE,
        related_name='answers',
        verbose_name=_('Yanıt'),
    )
    question = models.ForeignKey(
        SurveyQuestion,
        on_delete=models.PROTECT,
        related_name='answers',
        verbose_name=_('Soru'),
    )
    selected_option = models.ForeignKey(
        SurveyQuestionOption,
        on_delete=models.PROTECT,
        related_name='answers',
        null=True,
        blank=True,
        verbose_name=_('Seçilen seçenek'),
    )
    selected_option_label = models.CharField(
        max_length=200,
        blank=True,
        default='',
        verbose_name=_('Seçenek etiketi'),
    )
    rating_value = models.SmallIntegerField(null=True, blank=True, verbose_name=_('Puan'))
    boolean_value = models.BooleanField(null=True, blank=True, verbose_name=_('Evet / Hayır'))
    text_value = models.TextField(blank=True, default='', verbose_name=_('Metin'))

    class Meta:
        ordering = ['created_at']
        verbose_name = _('Soru yanıtı')
        verbose_name_plural = _('Soru yanıtları')
        indexes = [
            models.Index(fields=['response', 'question'], name='gf_ans_resp_q_idx'),
        ]

    def __str__(self):
        return f'{self.response_id} / {self.question_id}'
