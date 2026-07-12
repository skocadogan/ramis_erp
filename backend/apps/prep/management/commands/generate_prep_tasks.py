from django.core.management.base import BaseCommand
from apps.prep.services import PrepService

class Command(BaseCommand):
    help = 'Aktif hazırlık şablonlarından bugüne ait görevleri üretir.'

    def handle(self, *args, **options):
        self.stdout.write('Görevler üretiliyor...')
        count = PrepService.generate_tasks_from_templates()
        self.stdout.write(self.style.SUCCESS(f'Başarılı: {count} yeni hazırlık görevi oluşturuldu.'))
