'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireInternalPermission } from '@/lib/access/context';
import { reasonOrDefault } from '@/lib/core/reason';
import { createServerSupabase } from '@/lib/supabase/server';

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
