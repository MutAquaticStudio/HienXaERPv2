'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireInternalPermission } from '@/lib/access/context';
import { reasonOrDefault } from '@/lib/core/reason';
import { createServerSupabase } from '@/lib/supabase/server';
import { portalLinkDoneMessage, portalLinkError } from '@/lib/auth/portal-link';

export type RevokePortalAccessState = { success?: boolean; message?: string } | undefined;

/** "Thu hồi" a customer login: it can no longer open the customer portal; the history stays. */
export async function revokeCustomerPortalAccessAction(_: RevokePortalAccessState, form: FormData): Promise<RevokePortalAccessState> {
  const parsed = z.object({ customerId: z.guid(), membershipId: z.guid(), reason: z.string().trim().max(300).nullish() })
    .safeParse({ customerId: form.get('customerId'), membershipId: form.get('membershipId'), reason: form.get('reason') });
  if (!parsed.success) return { message: 'Ghi chú tối đa 300 ký tự; tải lại trang nếu tài khoản đã thay đổi.' };
  await requireInternalPermission('customers.manage');
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('revoke_customer_portal_access', { target_membership_id: parsed.data.membershipId, reason: reasonOrDefault(parsed.data.reason, 'Thu hồi tài khoản cổng khách'),
    operation_id: randomUUID() });
  if (error) return { message: error.code === '42501' ? 'Bạn không có quyền quản lý tài khoản của khách này.' : 'Không thu hồi được tài khoản. Thử lại sau.' };
  revalidatePath(`/admin/customers/${parsed.data.customerId}`);
  return { success: true, message: 'Đã thu hồi tài khoản. Khách không vào được cổng khách bằng tài khoản này nữa.' };
}

export type PortalLinkState = { success?: boolean; message?: string } | undefined;

/**
 * D78: the office's answer to a self-registration whose phone number this customer already has — link the login to this
 * customer (with the chosen role), make a new customer for it, or refuse it. The database checks customers.manage.
 */
export async function decidePortalLinkRequestAction(_: PortalLinkState, form: FormData): Promise<PortalLinkState> {
  const parsed = z.object({
    customerId: z.guid(), requestId: z.guid(), decision: z.enum(['LINK', 'NEW_CUSTOMER', 'REJECT']),
    role: z.enum(['OWNER', 'FINANCE_CONTACT', 'RECEIVER']).default('OWNER'), note: z.string().trim().max(300).nullish(), operationId: z.guid(),
  }).safeParse({ customerId: form.get('customerId'), requestId: form.get('requestId'), decision: form.get('decision'), role: form.get('role') ?? undefined,
    note: form.get('note'), operationId: form.get('operationId') });
  if (!parsed.success) return { message: 'Ghi chú tối đa 300 ký tự; tải lại trang rồi chọn lại.' };
  const note = parsed.data.note && parsed.data.note.length >= 3 ? parsed.data.note : null;
  if (parsed.data.note && !note) return { message: 'Ghi chú cần ít nhất 3 ký tự, hoặc để trống.' };
  await requireInternalPermission('customers.manage');
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('decide_portal_link_request', { target_request_id: parsed.data.requestId, decision: parsed.data.decision,
    membership_role: parsed.data.role, note, operation_id: parsed.data.operationId });
  if (error) return { message: portalLinkError(`${error.code ?? ''} ${error.message}`) };
  revalidatePath(`/admin/customers/${parsed.data.customerId}`);
  revalidatePath('/admin/customers');
  return { success: true, message: portalLinkDoneMessage(parsed.data.decision) };
}
