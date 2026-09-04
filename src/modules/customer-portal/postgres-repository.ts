import "server-only";

import type { Sql, TransactionSql } from "postgres";

import type {
  CustomerPortalCommand,
  CustomerPortalDelivery,
  CustomerPortalOrder,
  CustomerPortalPrincipal,
  CustomerPortalQuote,
  CustomerPortalSnapshot,
} from "@/modules/customer-portal/types";

function quoteStatus(status: string): CustomerPortalQuote["status"] {
  if (status === "SENT" || status === "ACCEPTED" || status === "EXPIRED") return status;
  return "OTHER";
}

export async function readCustomerPortalSnapshot(
  sql: Sql,
  principal: CustomerPortalPrincipal,
): Promise<CustomerPortalSnapshot> {
  const [quoteRows, lineRows, orderRows, orderLineRows, deliveryRows, deliveryLineRows, debtRows, siteRows, materialRows, requestRows, noticeRows] = await Promise.all([
    sql<{
      id: string; quotation_number: string; revision_id: string; revision_number: number;
      status: string; valid_until: string; currency: string; total_amount: string; notes: string | null;
    }[]>`select quotation.id, quotation.quotation_number, revision.id as revision_id,
        revision.revision_number, quotation.status::text as status,
        revision.valid_until::text, revision.currency, revision.total_amount, revision.notes
      from public.quotations quotation
      join public.quotation_revisions revision on revision.id = quotation.active_revision_id
      where quotation.customer_id = ${principal.customerId}
        and revision.status in ('SENT', 'ACCEPTED')
      order by quotation.created_at desc`,
    sql<{
      id: string; revision_id: string; material_name: string; quantity: string;
      uom_symbol: string; unit_price: string; line_amount: string;
    }[]>`select line.id, line.revision_id, line.material_name_snapshot as material_name,
        line.quantity, line.uom_symbol_snapshot as uom_symbol, line.unit_price, line.line_amount
      from public.quotation_lines line
      join public.quotation_revisions revision on revision.id = line.revision_id
      join public.quotations quotation on quotation.id = revision.quotation_id
      where quotation.customer_id = ${principal.customerId}
        and revision.id = quotation.active_revision_id
        and revision.status in ('SENT', 'ACCEPTED')
      order by line.revision_id, line.line_number`,
    sql<{
      id: string; sales_order_number: string; status: string; created_at: string;
      site_name: string | null; total_amount: string; currency: string;
    }[]>`select sales_order.id, sales_order.sales_order_number, sales_order.status::text,
        sales_order.created_at::text, sales_order.customer_site_name_snapshot as site_name,
        sales_order.total_amount, sales_order.currency
      from public.sales_orders sales_order
      where sales_order.customer_id = ${principal.customerId}
      order by sales_order.created_at desc`,
    sql<{
      id: string; sales_order_id: string; material_id: string; material_name: string;
      ordered_quantity: string; uom_id: string; uom_symbol: string;
    }[]>`select line.id, line.sales_order_id, line.material_id,
        line.material_name_snapshot as material_name, line.ordered_quantity,
        line.uom_id, line.uom_symbol_snapshot as uom_symbol
      from public.sales_order_lines line
      join public.sales_orders sales_order on sales_order.id = line.sales_order_id
      where sales_order.customer_id = ${principal.customerId}
      order by line.sales_order_id, line.line_number`,
    sql<{
      id: string; delivery_number: string; order_number: string; site_name: string | null;
      scheduled_date: string; delivered_at: string | null; status: string; acknowledgement_id: string | null;
    }[]>`select delivery.id, delivery.delivery_number, sales_order.sales_order_number as order_number,
        delivery.customer_site_name_snapshot as site_name, delivery.scheduled_date::text,
        delivery.delivered_at::text, delivery.status::text, acknowledgement.id as acknowledgement_id
      from public.deliveries delivery
      join public.sales_orders sales_order on sales_order.id = delivery.sales_order_id
      left join public.customer_delivery_acknowledgements acknowledgement on acknowledgement.delivery_id = delivery.id
      where delivery.customer_id = ${principal.customerId}
      order by delivery.scheduled_date desc, delivery.created_at desc`,
    sql<{
      id: string; delivery_id: string; material_name: string; planned_quantity: string;
      actual_quantity: string | null; accepted_quantity: string | null; uom_symbol: string;
    }[]>`select line.id, line.delivery_id, line.material_name_snapshot as material_name,
        line.planned_quantity, actual.actual_quantity, actual.accepted_quantity,
        line.uom_symbol_snapshot as uom_symbol
      from public.delivery_lines line
      join public.deliveries delivery on delivery.id = line.delivery_id
      left join public.delivery_actuals actual on actual.delivery_line_id = line.id
      where delivery.customer_id = ${principal.customerId}
      order by line.delivery_id, line.line_number`,
    sql<{
      id: string; receivable_number: string; sales_order_number: string; original_amount: string;
      outstanding_amount: string; currency: string; due_date: string; status: string;
    }[]>`select receivable.id, receivable.receivable_number,
        sales_order.sales_order_number, receivable.original_amount,
        receivable.outstanding_amount, receivable.currency, receivable.due_date::text,
        receivable.status::text
      from public.receivables receivable
      join public.sales_orders sales_order on sales_order.id = receivable.sales_order_id
      where receivable.customer_id = ${principal.customerId}
        and receivable.status <> 'REVERSED'
      order by receivable.due_date, receivable.created_at desc`,
    sql<{ id: string; name: string }[]>`select id, name_vi as name
      from public.customer_sites
      where customer_id = ${principal.customerId} and is_active
      order by is_default desc, name_vi`,
    sql<{ id: string; name: string; uom_id: string; uom_symbol: string }[]>`select material.id,
        material.name_vi as name, material.sales_uom_id as uom_id, uom.symbol as uom_symbol
      from public.materials material
      join public.uom_catalog uom on uom.id = material.sales_uom_id
      where material.is_active and uom.is_active
      order by material.name_vi`,
    sql<{ id: string; request_number: string; request_type: "NEW_QUOTE" | "REORDER" | "QUOTE_CHANGE"; status: string; submitted_at: string }[]>`select id, request_number, request_type, status, submitted_at::text
      from public.customer_quote_requests
      where customer_id = ${principal.customerId}
      order by submitted_at desc`,
    sql<{ id: string; notice_number: string; amount: string; transferred_on: string; status: string; submitted_at: string }[]>`select id, notice_number, amount, transferred_on::text, status, submitted_at::text
      from public.customer_payment_notices
      where customer_id = ${principal.customerId}
      order by submitted_at desc`,
  ]);

  const quotes: CustomerPortalQuote[] = quoteRows.map((quote) => ({
    id: quote.id,
    quotationNumber: quote.quotation_number,
    revisionId: quote.revision_id,
    revisionNumber: quote.revision_number,
    status: quoteStatus(quote.status),
    validUntil: quote.valid_until,
    currency: quote.currency,
    totalAmount: quote.total_amount,
    notes: quote.notes,
    lines: lineRows.filter((line) => line.revision_id === quote.revision_id).map((line) => ({
      id: line.id, materialName: line.material_name, quantity: line.quantity,
      uomSymbol: line.uom_symbol, unitPrice: line.unit_price, lineAmount: line.line_amount,
    })),
  }));
  const orders: CustomerPortalOrder[] = orderRows.map((order) => ({
    id: order.id, orderNumber: order.sales_order_number, status: order.status,
    createdAt: order.created_at, siteName: order.site_name, totalAmount: order.total_amount,
    currency: order.currency,
    lines: orderLineRows.filter((line) => line.sales_order_id === order.id).map((line) => ({
      id: line.id, materialId: line.material_id, materialName: line.material_name,
      quantity: line.ordered_quantity, uomId: line.uom_id, uomSymbol: line.uom_symbol,
    })),
  }));
  const deliveries: CustomerPortalDelivery[] = deliveryRows.map((delivery) => ({
    id: delivery.id, deliveryNumber: delivery.delivery_number, orderNumber: delivery.order_number,
    siteName: delivery.site_name, scheduledDate: delivery.scheduled_date,
    deliveredAt: delivery.delivered_at, status: delivery.status,
    canAcknowledge: ["DELIVERED", "CONFIRMED", "PARTIAL"].includes(delivery.status),
    acknowledgementId: delivery.acknowledgement_id,
    lines: deliveryLineRows.filter((line) => line.delivery_id === delivery.id).map((line) => ({
      id: line.id, materialName: line.material_name, plannedQuantity: line.planned_quantity,
      actualQuantity: line.actual_quantity, acceptedQuantity: line.accepted_quantity,
      uomSymbol: line.uom_symbol,
    })),
  }));

  return {
    customerName: principal.customerName,
    portalRole: principal.portalRole,
    quotes,
    orders,
    deliveries,
    debts: debtRows.map((debt) => ({
      id: debt.id, documentNumber: debt.receivable_number, orderNumber: debt.sales_order_number,
      originalAmount: debt.original_amount, outstandingAmount: debt.outstanding_amount,
      currency: debt.currency, dueDate: debt.due_date, status: debt.status,
    })),
    sites: siteRows.map((site) => ({ id: site.id, name: site.name })),
    materials: materialRows.map((material) => ({
      id: material.id, name: material.name, uomId: material.uom_id, uomSymbol: material.uom_symbol,
    })),
    quoteRequests: requestRows.map((request) => ({
      id: request.id, requestNumber: request.request_number, requestType: request.request_type,
      status: request.status, submittedAt: request.submitted_at,
    })),
    paymentNotices: noticeRows.map((notice) => ({
      id: notice.id, noticeNumber: notice.notice_number, amount: notice.amount,
      transferredOn: notice.transferred_on, status: notice.status, submittedAt: notice.submitted_at,
    })),
  };
}

export async function executeCustomerPortalCommand(
  sql: TransactionSql,
  principal: CustomerPortalPrincipal,
  idempotencyKey: string,
  command: CustomerPortalCommand,
) {
  if (command.kind === "customer.quote.accept") {
    return sql<{ id: string }[]>`select app_private.customer_portal_accept_quotation(
      ${command.revisionId}, ${idempotencyKey}, ${principal.authUserId}
    ) as id`;
  }
  if (command.kind === "customer.quote.request") {
    return sql<{ id: string }[]>`select app_private.customer_portal_request_quote(
      ${command.requestType}, ${command.customerSiteId}, ${command.materialId},
      ${command.quantity}, ${command.uomId}, ${command.note},
      ${command.sourceSalesOrderId ?? null}, ${command.sourceQuotationRevisionId ?? null},
      ${idempotencyKey}, ${principal.authUserId}
    ) as id`;
  }
  if (command.kind === "customer.delivery.acknowledge") {
    return sql<{ id: string }[]>`select app_private.customer_portal_acknowledge_delivery(
      ${command.deliveryId}, ${principal.authUserId}
    ) as id`;
  }
  if (command.kind === "customer.delivery.issue") {
    return sql<{ id: string }[]>`select app_private.customer_portal_report_delivery_issue(
      ${command.deliveryId}, ${command.category}, ${command.description}, ${idempotencyKey},
      ${principal.authUserId}
    ) as id`;
  }
  return sql<{ id: string }[]>`select app_private.customer_portal_submit_payment_notice(
    ${command.amount}, ${command.transferredOn}, ${command.bankReference}, ${command.note},
    ${command.evidenceStoragePath}, ${idempotencyKey}, ${principal.authUserId}
  ) as id`;
}
