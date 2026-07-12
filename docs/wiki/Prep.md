# Prep (Mutfak Hazırlık Yönetimi)

> **Özet:** Mutfak hazırlık görevleri, tekrarlayan şablonlar ve satış tahminine dayalı akıllı kurallar. İstasyon bazlı görev atama ve takip sistemi.
> **Kütüphaneler:** Django ORM
> **Bağlantılar:** [[Branches]], [[Menu]], [[Users]]

---

## Konum
`backend/apps/prep/`

## Modeller

### PrepTask
| Alan | Tip | Açıklama |
|------|-----|----------|
| `branch` | `FK → Branch` | Şube |
| `station` | `FK → KitchenStation` | İstasyon |
| `title` | `CharField` | Görev başlığı |
| `target_quantity/completed_quantity` | `DecimalField` | Hedef/tamamlanan |
| `status` | `TextChoices` | PENDING / IN_PROGRESS / COMPLETED / CANCELLED |
| `priority` | `PositiveIntegerField` | Öncelik |
| `deadline` | `DateTimeField` | Son tarih |
| `assigned_to/completed_by` | `FK → User` | Atanan/tamamlayan |
| `source_template` | `FK → PrepTemplate` | Kaynak şablon |

### PrepTemplate
Tekrarlayan şablonlar — haftanın günleri ve aktivasyon saati ayarları.

| Alan | Tip | Açıklama |
|------|-----|----------|
| `assigned_to` | `FK → User (null)` | Şablondan oluşturulan görevlere varsayılan atanan kişi (migration 0008) |

`PrepService.create_tasks_from_template()` çalıştığında `PrepTask.assigned_to` bu alandan kopyalanır.

### PrepSmartRule
Satış tahminine dayalı kurallar: ürün satışı × oran = hazırlık miktarı.

### PrepBranchSettings
Şube bazlı ayarlar — eski tamamlanan görevleri gizleme.
