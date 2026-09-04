export const CUSTOMER_QUOTE_REQUEST_TYPES = [
  "NEW_QUOTE",
  "REORDER",
  "QUOTE_CHANGE",
] as const;

export const CUSTOMER_DELIVERY_ISSUE_CATEGORIES = [
  "SHORT_DELIVERY",
  "WRONG_GOODS",
  "NOT_RECEIVED",
  "DOCUMENT_INCORRECT",
  "OTHER",
] as const;

export type CustomerQuoteRequestType =
  (typeof CUSTOMER_QUOTE_REQUEST_TYPES)[number];
export type CustomerDeliveryIssueCategory =
  (typeof CUSTOMER_DELIVERY_ISSUE_CATEGORIES)[number];

export interface CustomerPortalPrincipal {
  authUserId: string;
  customerId: string;
  customerName: string;
  portalRole: "CONTACT" | "BILLING";
}

export interface CustomerPortalQuote {
  id: string;
  quotationNumber: string;
  revisionId: string;
  revisionNumber: number;
  status: "SENT" | "ACCEPTED" | "EXPIRED" | "OTHER";
  validUntil: string;
  currency: string;
  totalAmount: string;
  notes: string | null;
  lines: Array<{
    id: string;
    materialName: string;
    quantity: string;
    uomSymbol: string;
    unitPrice: string;
    lineAmount: string;
  }>;
}

export interface CustomerPortalOrder {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  siteName: string | null;
  totalAmount: string;
  currency: string;
  lines: Array<{
    id: string;
    materialId: string;
    materialName: string;
    quantity: string;
    uomId: string;
    uomSymbol: string;
  }>;
}

export interface CustomerPortalDelivery {
  id: string;
  deliveryNumber: string;
  orderNumber: string;
  siteName: string | null;
  scheduledDate: string;
  deliveredAt: string | null;
  status: string;
  canAcknowledge: boolean;
  acknowledgementId: string | null;
  lines: Array<{
    id: string;
    materialName: string;
    plannedQuantity: string;
    actualQuantity: string | null;
    acceptedQuantity: string | null;
    uomSymbol: string;
  }>;
}

export interface CustomerPortalDebt {
  id: string;
  documentNumber: string;
  orderNumber: string;
  originalAmount: string;
  outstandingAmount: string;
  currency: string;
  dueDate: string;
  status: string;
}

export interface CustomerPortalSite {
  id: string;
  name: string;
}

export interface CustomerPortalMaterial {
  id: string;
  name: string;
  uomId: string;
  uomSymbol: string;
}

export interface CustomerPortalSnapshot {
  customerName: string;
  portalRole: "CONTACT" | "BILLING";
  quotes: CustomerPortalQuote[];
  orders: CustomerPortalOrder[];
  deliveries: CustomerPortalDelivery[];
  debts: CustomerPortalDebt[];
  sites: CustomerPortalSite[];
  materials: CustomerPortalMaterial[];
  quoteRequests: Array<{
    id: string;
    requestNumber: string;
    requestType: CustomerQuoteRequestType;
    status: string;
    submittedAt: string;
  }>;
  paymentNotices: Array<{
    id: string;
    noticeNumber: string;
    amount: string;
    transferredOn: string;
    status: string;
    submittedAt: string;
  }>;
}

export type CustomerPortalCommand =
  | {
      kind: "customer.quote.accept";
      revisionId: string;
    }
  | {
      kind: "customer.quote.request";
      requestType: CustomerQuoteRequestType;
      customerSiteId: string;
      materialId: string;
      quantity: string;
      uomId: string;
      note: string;
      sourceSalesOrderId?: string;
      sourceQuotationRevisionId?: string;
    }
  | {
      kind: "customer.delivery.acknowledge";
      deliveryId: string;
    }
  | {
      kind: "customer.delivery.issue";
      deliveryId: string;
      category: CustomerDeliveryIssueCategory;
      description: string;
    }
  | {
      kind: "customer.payment.notice";
      amount: string;
      transferredOn: string;
      bankReference: string;
      note: string;
      evidenceStoragePath: string;
    };
