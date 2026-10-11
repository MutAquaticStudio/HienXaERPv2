export const documentCommands = ["register_supplier_document", "review_supplier_document", "create_invoice_draft", "approve_invoice_business", "cancel_invoice_draft", "create_invoice_adjustment_draft", "register_purchase_invoice_source"] as const;
export type DocumentCommand = (typeof documentCommands)[number];
