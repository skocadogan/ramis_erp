from django.db import transaction
from django.utils.translation import gettext as _
from rest_framework import serializers

from apps.branches.models import Branch

from .models import (
    AttentionStatus,
    Survey,
    SurveyAnswer,
    SurveyQuestion,
    SurveyQuestionOption,
    SurveyQuestionRole,
    SurveyQuestionType,
    SurveyResponse,
    TableSurveySessionState,
)


class SurveyQuestionOptionSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)

    class Meta:
        model = SurveyQuestionOption
        fields = ['id', 'label', 'sort_order', 'is_active']
        read_only_fields = []


class SurveyQuestionSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    options = SurveyQuestionOptionSerializer(many=True, required=False)

    class Meta:
        model = SurveyQuestion
        fields = [
            'id',
            'text',
            'answer_type',
            'question_role',
            'sort_order',
            'is_required',
            'placeholder',
            'rating_min_value',
            'rating_max_value',
            'is_active',
            'options',
        ]
        read_only_fields = []

    def validate(self, attrs):
        answer_type = attrs.get('answer_type', getattr(self.instance, 'answer_type', None))
        question_role = attrs.get('question_role', getattr(self.instance, 'question_role', SurveyQuestionRole.NONE))
        rating_min = attrs.get('rating_min_value', getattr(self.instance, 'rating_min_value', 1))
        rating_max = attrs.get('rating_max_value', getattr(self.instance, 'rating_max_value', 5))

        if answer_type == SurveyQuestionType.RATING and rating_min >= rating_max:
            raise serializers.ValidationError(
                {'rating_max_value': _('Maksimum puan minimum puandan büyük olmalıdır.')}
            )

        if question_role == SurveyQuestionRole.NPS:
            if answer_type != SurveyQuestionType.RATING:
                raise serializers.ValidationError(
                    {'question_role': _('NPS soruları yalnızca derecelendirme tipinde olabilir.')}
                )
            if rating_min != 0 or rating_max != 10:
                raise serializers.ValidationError(
                    {'rating_max_value': _('NPS soruları 0-10 aralığında olmalıdır.')}
                )

        return attrs


class SurveySerializer(serializers.ModelSerializer):
    branches = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Branch.objects.filter(is_active=True),
    )
    branch_names = serializers.SerializerMethodField(read_only=True)
    questions = SurveyQuestionSerializer(many=True)
    question_count = serializers.SerializerMethodField(read_only=True)
    response_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Survey
        fields = [
            'id',
            'title',
            'description',
            'sort_order',
            'is_active',
            'is_customer_display_active',
            'is_smart_table_active',
            'branches',
            'branch_names',
            'questions',
            'question_count',
            'response_count',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'branch_names', 'question_count', 'response_count']

    def get_branch_names(self, obj):
        return list(obj.branches.values_list('name', flat=True))

    def get_question_count(self, obj):
        return obj.questions.filter(is_active=True).count()

    def get_response_count(self, obj):
        return getattr(obj, 'response_count', obj.responses.count())

    def validate(self, attrs):
        questions = attrs.get('questions', [])
        branches = attrs.get('branches', [])

        if not branches:
            raise serializers.ValidationError({'branches': _('En az bir şube seçmelisiniz.')})
        if not questions:
            raise serializers.ValidationError({'questions': _('En az bir soru eklemelisiniz.')})

        active_roles: set[str] = set()
        for index, question in enumerate(questions):
            answer_type = question.get('answer_type')
            options = question.get('options', [])
            role = question.get('question_role', SurveyQuestionRole.NONE)
            is_active = question.get('is_active', True)

            if not is_active:
                continue

            if answer_type == SurveyQuestionType.OPTION and not options:
                raise serializers.ValidationError(
                    {'questions': _(f'{index + 1}. soru için en az bir seçenek gerekli.')}
                )
            if answer_type != SurveyQuestionType.OPTION and options:
                raise serializers.ValidationError(
                    {'questions': _(f'{index + 1}. soruda seçenekler yalnızca Seçenek tipi için tanımlanabilir.')}
                )

            if role != SurveyQuestionRole.NONE:
                if role in active_roles:
                    raise serializers.ValidationError(
                        {'questions': _('Aynı analitik rol bir ankette yalnızca bir kez kullanılabilir.')}
                    )
                active_roles.add(role)

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        questions_data = validated_data.pop('questions', [])
        branches = validated_data.pop('branches', [])
        survey = Survey.objects.create(**validated_data)
        survey.branches.set(branches)
        self._sync_questions(survey, questions_data)
        return survey

    @transaction.atomic
    def update(self, instance, validated_data):
        questions_data = validated_data.pop('questions', None)
        branches = validated_data.pop('branches', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if branches is not None:
            instance.branches.set(branches)
        if questions_data is not None:
            self._sync_questions(instance, questions_data)
        return instance

    def _sync_questions(self, survey: Survey, questions_data: list[dict]):
        existing_questions = {str(item.id): item for item in survey.questions.all()}
        kept_question_ids: set[str] = set()

        for question_data in questions_data:
            options_data = question_data.pop('options', [])
            question_id = str(question_data.pop('id', '') or '')

            if question_id and question_id in existing_questions:
                question = existing_questions[question_id]
                for attr, value in question_data.items():
                    setattr(question, attr, value)
                question.is_active = question_data.get('is_active', True)
                question.save()
            else:
                question = SurveyQuestion.objects.create(
                    survey=survey,
                    **question_data,
                )
            kept_question_ids.add(str(question.id))
            self._sync_options(question, options_data)

        for question in survey.questions.exclude(id__in=kept_question_ids):
            if question.is_active:
                question.delete()

    def _sync_options(self, question: SurveyQuestion, options_data: list[dict]):
        existing_options = {str(item.id): item for item in question.options.all()}
        kept_option_ids: set[str] = set()

        for option_data in options_data:
            option_id = str(option_data.pop('id', '') or '')
            if option_id and option_id in existing_options:
                option = existing_options[option_id]
                for attr, value in option_data.items():
                    setattr(option, attr, value)
                option.is_active = option_data.get('is_active', True)
                option.save()
            else:
                option = SurveyQuestionOption.objects.create(question=question, **option_data)
            kept_option_ids.add(str(option.id))

        for option in question.options.exclude(id__in=kept_option_ids):
            if option.is_active:
                option.delete()


class SurveyAnswerReadSerializer(serializers.ModelSerializer):
    question_text = serializers.CharField(source='question.text', read_only=True)
    question_role = serializers.CharField(source='question.question_role', read_only=True)
    answer_value = serializers.SerializerMethodField()

    class Meta:
        model = SurveyAnswer
        fields = [
            'id',
            'question',
            'question_text',
            'question_role',
            'selected_option',
            'selected_option_label',
            'rating_value',
            'boolean_value',
            'text_value',
            'answer_value',
        ]

    def get_answer_value(self, obj):
        if obj.rating_value is not None:
            return obj.rating_value
        if obj.boolean_value is not None:
            return obj.boolean_value
        if obj.selected_option_label:
            return obj.selected_option_label
        return obj.text_value


class SurveyResponseSerializer(serializers.ModelSerializer):
    survey_title = serializers.CharField(source='survey.title', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    table_name = serializers.CharField(source='table.name', read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    staff_name = serializers.SerializerMethodField()
    answers = SurveyAnswerReadSerializer(many=True, read_only=True)
    answers_preview = serializers.SerializerMethodField()

    class Meta:
        model = SurveyResponse
        fields = [
            'id',
            'survey',
            'survey_title',
            'branch',
            'branch_name',
            'table',
            'table_name',
            'order',
            'sale',
            'customer',
            'customer_name',
            'staff_user',
            'staff_name',
            'source',
            'needs_attention',
            'attention_status',
            'attention_note',
            'nps_score',
            'food_rating',
            'service_rating',
            'speed_rating',
            'cleanliness_rating',
            'answers_preview',
            'answers',
            'created_at',
        ]
        read_only_fields = fields

    def get_staff_name(self, obj):
        if not obj.staff_user:
            return None
        name = obj.staff_user.get_full_name()
        return name.strip() or obj.staff_user.username

    def get_answers_preview(self, obj):
        parts: list[str] = []
        for answer in obj.answers.select_related('question').all():
            if answer.rating_value is not None:
                value = str(answer.rating_value)
            elif answer.boolean_value is not None:
                value = _('Evet') if answer.boolean_value else _('Hayır')
            elif answer.selected_option_label:
                value = answer.selected_option_label
            else:
                value = answer.text_value
            parts.append(f'{answer.question.text}: {value}')
        return ' | '.join(parts)


class SurveyResponseAttentionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SurveyResponse
        fields = ['attention_status', 'attention_note']

    def validate_attention_status(self, value):
        if value not in dict(AttentionStatus.choices):
            raise serializers.ValidationError(_('Geçersiz ilgi durumu.'))
        return value


class DisplaySurveyQuestionOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SurveyQuestionOption
        fields = ['id', 'label', 'sort_order']


class DisplaySurveyQuestionSerializer(serializers.ModelSerializer):
    options = serializers.SerializerMethodField()

    class Meta:
        model = SurveyQuestion
        fields = [
            'id',
            'text',
            'answer_type',
            'question_role',
            'sort_order',
            'is_required',
            'placeholder',
            'rating_min_value',
            'rating_max_value',
            'options',
        ]

    def get_options(self, obj):
        serializer = DisplaySurveyQuestionOptionSerializer(
            obj.options.filter(is_active=True).order_by('sort_order', 'created_at'),
            many=True,
        )
        return serializer.data


class DisplaySurveySerializer(serializers.ModelSerializer):
    questions = serializers.SerializerMethodField()

    class Meta:
        model = Survey
        fields = [
            'id',
            'title',
            'description',
            'questions',
        ]

    def get_questions(self, obj):
        serializer = DisplaySurveyQuestionSerializer(
            obj.questions.filter(is_active=True).order_by('sort_order', 'created_at'),
            many=True,
        )
        return serializer.data


class DisplaySurveyPromptSerializer(serializers.ModelSerializer):
    session_id = serializers.UUIDField(source='id', read_only=True)
    survey = DisplaySurveySerializer(read_only=True)

    class Meta:
        model = TableSurveySessionState
        fields = [
            'session_id',
            'survey',
            'sale',
            'order',
            'table',
            'source',
            'session_key',
        ]


class DisplaySurveySubmitAnswerSerializer(serializers.Serializer):
    question_id = serializers.UUIDField()
    selected_option_id = serializers.UUIDField(required=False, allow_null=True)
    rating_value = serializers.IntegerField(required=False, allow_null=True)
    boolean_value = serializers.BooleanField(required=False, allow_null=True)
    text_value = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class DisplaySurveySubmitSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    answers = DisplaySurveySubmitAnswerSerializer(many=True)


class DisplaySurveyCloseSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()


class SmartTableSurveyOpenSerializer(serializers.Serializer):
    survey_id = serializers.UUIDField()
    order_id = serializers.UUIDField()
