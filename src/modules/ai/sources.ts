// FB14 (D36): what the chatbot may read. One assistant for the whole system: every source names the permission that opens
// its screen, and the assistant only offers the sources the asking person holds. The query still runs with the person's own
// session, so the database (RLS) decides which rows they see. Only the columns listed here are selected or filtered (no
// positions, notes or other free text the person did not ask for).

/** `global`: a catalog shared by every branch (no branch column). */
export type AiSource = { name: string; label: string; permission: string; columns: readonly string[]; global?: true };

export const AI_SOURCES: readonly AiSource[] = [
  { name: "sales_order_read", label: "Đơn bán", permission: "orders.read", columns: ["id", "order_number", "customer_id", "customer_name_snapshot", "site_name_snapshot", "sales_owner_employee_id", "commercial_state", "fulfillment_state", "payment_state", "total_vnd", "requested_delivery_at", "confirmed_at", "cancelled_at", "created_at"] },
  { name: "customers", label: "Khách hàng", permission: "customers.read", columns: ["id", "code", "display_name", "customer_type", "phone", "tier_code", "payment_terms_days", "credit_limit_vnd", "sales_owner_employee_id", "active", "created_at"] },
  { name: "receivable_read", label: "Công nợ phải thu", permission: "finance.ar.read", columns: ["id", "customer_id", "customer_name", "site_name", "original_amount_vnd", "allocated_amount_vnd", "outstanding_amount_vnd", "due_date", "recorded_at", "source_label", "state", "sales_order_id"] },
  { name: "purchase_order_read", label: "Đơn mua", permission: "purchasing.read", columns: ["id", "purchase_order_number", "supplier_id", "supplier_name_snapshot", "destination_type", "state", "expected_at", "total_cost_vnd", "confirmed_at", "cancelled_at", "created_at", "source_sales_order_id"] },
  { name: "suppliers", label: "Nhà cung cấp", permission: "suppliers.read", columns: ["id", "code", "name", "phone", "payment_terms_days", "active", "created_at"] },
  { name: "payable_read", label: "Công nợ phải trả", permission: "finance.ap.read", columns: ["id", "supplier_id", "supplier_name", "employee_id", "original_amount_vnd", "allocated_amount_vnd", "outstanding_amount_vnd", "due_date", "recorded_at", "source_label", "state"] },
  { name: "warehouse_inventory_read", label: "Tồn kho theo kho", permission: "inventory.read", columns: ["warehouse_id", "material_id", "on_hand_base_quantity", "reserved_base_quantity", "available_base_quantity", "inventory_value_vnd", "average_cost_vnd_per_base"] },
  { name: "low_stock_alert_read", label: "Hàng dưới ngưỡng", permission: "inventory.read", columns: ["warehouse_name", "material_id", "material_name", "base_uom_symbol", "threshold_base_quantity", "on_hand_base_quantity", "reserved_base_quantity", "available_base_quantity"] },
  { name: "materials", label: "Vật tư", permission: "catalog.read", global: true, columns: ["id", "code", "name", "specification", "sale_enabled", "purchase_enabled", "active"] },
  { name: "stock_count_read", label: "Phiếu kiểm kho", permission: "inventory.read", columns: ["id", "warehouse_id", "count_number", "state", "cutoff_at", "line_count", "variance_count", "created_at", "approved_at"] },
  { name: "inventory_movement_read", label: "Xuất nhập kho", permission: "inventory.read", columns: ["material_id", "warehouse_id", "movement_type", "base_quantity_delta", "inventory_value_delta_vnd", "occurred_at"] },
  { name: "delivery_read", label: "Phiếu giao", permission: "delivery.read", columns: ["id", "delivery_number", "sales_order_id", "execution_state", "result_kind", "customer_name_snapshot", "site_name_snapshot", "scheduled_at", "employee_id", "vehicle_id", "external_carrier_name", "created_at", "verified_at"] },
  { name: "service_jobs", label: "Đơn dịch vụ", permission: "service.read", columns: ["id", "job_number", "customer_id", "service_type", "scheduled_start", "scheduled_end", "planned_quantity", "unit_label", "execution_state", "unit_price_vnd", "created_at", "verified_at"] },
  { name: "payment_read", label: "Sổ quỹ (phiếu thu / chi)", permission: "finance.ar.read", columns: ["payment_number", "direction", "counterparty_name", "account_code", "account_kind", "amount_vnd", "allocated_amount_vnd", "unallocated_amount_vnd", "method", "effective_at", "posting_state", "reconciliation_state"] },
  { name: "expense_read", label: "Chi phí", permission: "finance.expense.read", columns: ["expense_number", "category_name", "payee_display", "supplier_name", "amount_vnd", "effective_at", "activity_kind", "approval_state", "settlement", "counts_in_profit"] },
  { name: "workforce_read", label: "Nhân viên", permission: "workforce.read", columns: ["id", "code", "display_name", "active", "role_name", "work_number", "current_work", "work_state"] },
  { name: "attendance_records", label: "Chấm công", permission: "attendance.read", columns: ["employee_id", "work_date", "status", "clock_in_at", "clock_out_at", "worked_minutes", "late_minutes", "early_minutes", "overtime_minutes", "source"] },
  { name: "payroll_lines", label: "Phiếu lương", permission: "compensation.read", columns: ["payroll_period_id", "employee_id", "included", "pay_basis", "work_days", "standard_work_days", "base_amount_vnd", "overtime_amount_vnd", "allowance_vnd", "bonus_vnd", "deduction_vnd", "net_pay_vnd", "other_earnings_vnd"] },
  { name: "earning_event_read", label: "Thu nhập nhân viên", permission: "compensation.read", columns: ["employee_id", "employee_name", "earning_type", "rule_code_snapshot", "calculated_amount_vnd", "approved_amount_vnd", "approval_state", "outstanding_amount_vnd", "created_at", "approved_at"] },
];

/** The sources the person may read: those whose screen permission they hold. */
export function sourcesFor(permissions: ReadonlySet<string> | readonly string[]) {
  const held = new Set(permissions);
  return AI_SOURCES.filter((source) => held.has(source.permission));
}
