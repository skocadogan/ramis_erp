from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.branches.models import Branch, KitchenStation
from apps.inventory.models import StockItem, Supplier
from apps.warehouse.models import (
    DeficiencyReport,
    DeficiencyReportItem,
    DeficiencyReportStatus,
    PurchaseOrder,
    PurchaseOrderStatus,
    Warehouse,
    WarehouseStockLevel,
    WarehouseType,
)
from apps.warehouse.services.deficiency_repair_service import repair_orphan_deficiency_reports
from apps.warehouse.tasks import repair_orphan_deficiency_reports as repair_task


@pytest.mark.django_db
class TestDeficiencyRepairService:
    def _mk_branch(self):
        return Branch.objects.create(name="Merkez", code="MRZ")

    def _mk_kitchen_wh(self, branch: Branch):
        wh = Warehouse.objects.create(
            name="Mutfak Depo",
            code=f"KIT-{branch.code}",
            warehouse_type=WarehouseType.KITCHEN,
            is_default=False,
        )
        wh.branches.add(branch)
        return wh

    def _mk_station(self, branch: Branch, kitchen_wh: Warehouse):
        return KitchenStation.objects.create(
            branch=branch,
            name="Ana Mutfak",
            warehouse=kitchen_wh,
        )

    def _mk_supplier(self):
        return Supplier.objects.create(name="Tedarikçi", is_active=True)

    def _mk_report(
        self,
        *,
        station,
        kitchen_wh,
        status=DeficiencyReportStatus.ORDERED,
        stock_item=None,
    ):
        report = DeficiencyReport.objects.create(
            report_number=f"DR-TEST-{status}",
            kitchen_station=station,
            target_warehouse=kitchen_wh,
            status=status,
            notes="test",
        )
        if stock_item is not None:
            DeficiencyReportItem.objects.create(
                report=report,
                stock_item=stock_item,
                quantity=Decimal("5"),
                unit="kg",
            )
            WarehouseStockLevel.objects.update_or_create(
                warehouse=kitchen_wh,
                stock_item=stock_item,
                defaults={
                    "quantity": Decimal("10"),
                    "minimum_quantity": Decimal("5"),
                },
            )
        return report

    def _age_report(self, report: DeficiencyReport, hours: int = 48) -> None:
        old = timezone.now() - timedelta(hours=hours)
        DeficiencyReport.objects.filter(pk=report.pk).update(
            created_at=old,
            updated_at=old,
        )
        report.refresh_from_db()

    def test_skips_when_disabled(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        station = self._mk_station(branch, kitchen_wh)
        report = self._mk_report(station=station, kitchen_wh=kitchen_wh)
        self._age_report(report)

        result = repair_orphan_deficiency_reports(enabled=False)

        assert result["skipped"] is True
        assert result["repaired_count"] == 0
        assert AuditLog.objects.filter(
            action="warehouse.deficiency_report.repair_skipped",
        ).exists()

    def test_reverts_orphan_ordered_without_po(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        station = self._mk_station(branch, kitchen_wh)
        stock_item = StockItem.objects.create(
            name="Soğan",
            sku="SOG-01",
            unit="kg",
            minimum_quantity=Decimal("5"),
        )
        report = self._mk_report(
            station=station,
            kitchen_wh=kitchen_wh,
            stock_item=stock_item,
        )
        self._age_report(report)

        result = repair_orphan_deficiency_reports(
            enabled=True,
            min_age_hours=0,
            ordered_action="revert_to_approved",
        )

        report.refresh_from_db()
        assert result["repaired_count"] == 1
        assert report.status == DeficiencyReportStatus.APPROVED
        assert report.is_active is True
        audit = AuditLog.objects.get(action="warehouse.deficiency_report.repaired")
        assert audit.after_json["issue"] == "orphan_ordered"
        assert audit.after_json["repair_action"] == "revert_to_approved"

    def test_cancels_orphan_ordered_when_configured(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        station = self._mk_station(branch, kitchen_wh)
        report = self._mk_report(station=station, kitchen_wh=kitchen_wh)
        self._age_report(report)

        repair_orphan_deficiency_reports(
            enabled=True,
            min_age_hours=0,
            ordered_action="cancel",
        )

        report.refresh_from_db()
        assert report.status == DeficiencyReportStatus.CANCELLED

    def test_soft_deletes_orphan_ordered_when_configured(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        station = self._mk_station(branch, kitchen_wh)
        report = self._mk_report(station=station, kitchen_wh=kitchen_wh)
        self._age_report(report)

        repair_orphan_deficiency_reports(
            enabled=True,
            min_age_hours=0,
            ordered_action="soft_delete",
        )

        report.refresh_from_db()
        assert report.is_active is False

    def test_syncs_ordered_to_committed_when_po_received(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        station = self._mk_station(branch, kitchen_wh)
        supplier = self._mk_supplier()
        report = self._mk_report(station=station, kitchen_wh=kitchen_wh)
        self._age_report(report)
        PurchaseOrder.objects.create(
            supplier=supplier,
            warehouse=kitchen_wh,
            status=PurchaseOrderStatus.RECEIVED,
            order_date=timezone.localdate(),
            deficiency_report=report,
        )

        repair_orphan_deficiency_reports(enabled=True, min_age_hours=0)

        report.refresh_from_db()
        assert report.status == DeficiencyReportStatus.COMMITTED

    def test_cancels_stale_open_report_when_enabled(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        station = self._mk_station(branch, kitchen_wh)
        stock_item = StockItem.objects.create(
            name="Tuz",
            sku="TUZ-01",
            unit="kg",
            minimum_quantity=Decimal("5"),
        )
        report = self._mk_report(
            station=station,
            kitchen_wh=kitchen_wh,
            status=DeficiencyReportStatus.PENDING,
            stock_item=stock_item,
        )
        self._age_report(report)

        repair_orphan_deficiency_reports(
            enabled=True,
            min_age_hours=0,
            stale_enabled=True,
            stale_action="cancel",
        )

        report.refresh_from_db()
        assert report.status == DeficiencyReportStatus.CANCELLED

    def test_skips_recent_reports_under_min_age(self):
        branch = self._mk_branch()
        kitchen_wh = self._mk_kitchen_wh(branch)
        station = self._mk_station(branch, kitchen_wh)
        report = self._mk_report(station=station, kitchen_wh=kitchen_wh)

        result = repair_orphan_deficiency_reports(
            enabled=True,
            min_age_hours=24,
        )

        report.refresh_from_db()
        assert result["repaired_count"] == 0
        assert report.status == DeficiencyReportStatus.ORDERED

    def test_task_delegates_to_service(self, monkeypatch):
        calls = []

        def _fake_repair(**kwargs):
            calls.append(kwargs)
            return {"skipped": False, "repaired_count": 0, "details": []}

        monkeypatch.setattr(
            "apps.warehouse.services.deficiency_repair_service.repair_orphan_deficiency_reports",
            _fake_repair,
        )

        repair_task(enabled=True)

        assert calls == [{"enabled": True}]
