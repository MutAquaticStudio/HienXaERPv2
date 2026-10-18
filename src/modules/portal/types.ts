export type PortalProof = {
  id: string;
  mime_type?: string;
  created_at?: string;
};

export type WorkerJob = {
  id: string;
  number: string;
  kind?: string;
  state: string;
  version: number;
  title?: string;
  description?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  quantity?: string;
  unit?: string;
  customer_name?: string;
  site_name?: string;
  address?: string;
  receiver_name?: string;
  receiver_phone?: string;
  access_note?: string;
  receiving_window?: string;
  proofs?: PortalProof[];
  delivery?: {
    id: string;
    version: number;
    state: string;
    assignment_version: number | null;
    can_submit_result: boolean;
    /** The job is on the worker's list but the warehouse has not handed the goods over yet. */
    awaiting_handoff?: boolean;
    lines: { id: string; material_name: string; unit: string; planned_base_quantity: string;
      loaded_base_quantity?: string | null; reportable_base_quantity: string;
      /** Unit the order was sold in and its ratio to the base unit (1 bao = 50 kg). */
      sold_unit?: string | null; sold_numerator?: string | null; sold_denominator?: string | null }[];
  };
};

export type WorkerEarning = {
  id: string;
  type?: string;
  state?: string;
  amount_vnd?: string;
  occurred_at?: string;
};

export type WorkerPortalSnapshot = {
  employee: { id: string; code: string; display_name: string };
  current: WorkerJob | null;
  next: WorkerJob | null;
  /** Every open job of the worker by scheduled time. */
  jobs?: WorkerJob[];
  pool: WorkerJob[];
  earnings: WorkerEarning[];
};

export type CustomerDelivery = {
  id: string;
  number?: string;
  state?: string;
  result?: string;
  scheduled_at?: string;
  delivered_at?: string;
  site_name?: string;
  address?: string;
  receiver_name?: string;
  receiver_phone?: string;
  receiving_window?: string;
};

export type CustomerPayment = {
  id: string;
  number: string;
  amount_vnd: string;
  allocated_amount_vnd: string;
  order_allocated_amount_vnd: string;
  effective_at: string;
  state: string;
  reconciliation_state: string;
};

export type CustomerDocument = {
  id: string;
  kind: "QUOTATION" | "DELIVERY" | "PAYMENT";
  title: string;
  state?: string;
  issued_at?: string;
  href?: string;
};

export type CustomerOrder = {
  id: string;
  number?: string;
  state?: string;
  fulfillment_state?: string;
  payment_state?: string;
  ordered_at?: string;
  requested_delivery_date?: string;
  total_amount_vnd?: string;
  deliveries: CustomerDelivery[];
  /** D15: CUSTOMER_PORTAL orders were placed by the customer; a DRAFT one is "Chờ duyệt". */
  channel?: "INTERNAL" | "CUSTOMER_PORTAL";
  site_name?: string;
  delivery_address?: string;
  receiver_name?: string;
  receiver_phone?: string;
  portal_note?: string;
  can_cancel?: boolean;
  cancel_reason?: string;
  lines?: { id: string; material_name: string; quantity: string; uom_symbol: string; unit_price_vnd?: string; line_total_vnd?: string }[];
  can_view_finance?: boolean;
  debt?: null | {
    original_amount_vnd: string | number;
    outstanding_amount_vnd: string | number;
    items: CustomerDebtItem[];
  };
  payments?: CustomerPayment[];
  documents?: CustomerDocument[];
};

export type CustomerDebtItem = {
  id: string;
  source_type?: string;
  source_number?: string;
  original_amount_vnd?: string;
  outstanding_amount_vnd?: string;
  due_date?: string;
};

export type PaymentNotice = {
  id: string;
  branch_id?: string;
  customer_id?: string;
  customer_name?: string;
  amount_vnd: string | number;
  paid_on: string;
  reference?: string;
  note?: string;
  state: string;
  version: number;
  submitted_at: string;
  evidence_id: string;
  review_note?: string;
};

export type CustomerPortalSnapshot = {
  customer: { id: string; code: string; display_name: string };
  membership_role: "OWNER" | "FINANCE_CONTACT" | "RECEIVER";
  can_view_debt: boolean;
  quotation: null | {
    id: string;
    number?: string;
    state?: string;
    current_revision_id: string;
    valid_until?: string;
    can_respond?: boolean;
  };
  orders: CustomerOrder[];
  debt: null | {
    outstanding_amount_vnd: string | number;
    overdue_amount_vnd: string | number;
    items: CustomerDebtItem[];
  };
  payment_notices: PaymentNotice[];
};

/** D15 ordering catalog: this customer's sale units and prices; stock only as "Còn hàng" / "Đặt trước". */
export type PortalCatalogItem = {
  material_id: string; code: string; name: string; specification: string | null; group_name: string;
  uom_id: string; uom_name: string; uom_symbol: string; decimal_scale: number; base_symbol: string;
  conversion_numerator: string; conversion_denominator: string; unit_price_vnd: string; in_stock: boolean;
  /** FB6: variants of one product ("hàng cùng loại"), e.g. "Xi măng Bút Sơn" · "Mác: PCB40"; absent outside a group. */
  variant_group_id?: string | null; variant_name?: string | null; variant_label?: string | null;
};
export type PortalCatalog = {
  customer: { id: string; code: string; display_name: string };
  sites: { id: string; name: string; address_text: string; receiver_name: string | null; receiver_phone: string | null }[];
  items: PortalCatalogItem[];
};
