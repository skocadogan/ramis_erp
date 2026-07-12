"use client";

import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { CustomersTable } from "@/features/customers/components/CustomersTable";
import { CustomerModal } from "@/features/customers/components/CustomerModal";
import { CustomerDetailModal } from "@/features/customers/components/CustomerDetailModal";
import type { Customer } from "@/features/customers/types";

function CustomersPageContent() {
  const [activeModal, setActiveModal] = useState<"add" | "edit" | "view" | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  const handleAdd = () => {
    setSelectedCustomer(null);
    setActiveModal("add");
  };

  const handleEdit = (customer: Customer) => {
    setSelectedCustomer(customer);
    setActiveModal("edit");
  };

  const handleView = (customer: Customer) => {
    setSelectedCustomer(customer);
    setActiveModal("view");
  };

  const handleCloseModal = () => {
    setActiveModal(null);
    setSelectedCustomer(null);
  };

  const handleSuccess = () => {
    handleCloseModal();
    triggerRefresh();
  };

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        <div className="flex-1 space-y-6 overflow-auto p-6">
          <CustomersTable
            onAdd={handleAdd}
            onEdit={handleEdit}
            onView={handleView}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>

      {(activeModal === "add" || activeModal === "edit") && (
        <CustomerModal
          customer={selectedCustomer}
          onClose={handleCloseModal}
          onSuccess={handleSuccess}
        />
      )}

      {activeModal === "view" && selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          onClose={handleCloseModal}
        />
      )}
    </AppShell>
  );
}

export default function CustomersPage() {
  return (
    <AuthGuard module="customers">
      <CustomersPageContent />
    </AuthGuard>
  );
}
