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
