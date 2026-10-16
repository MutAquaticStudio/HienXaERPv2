'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireInternalPermission } from '@/lib/access/context';
import { createServerSupabase } from '@/lib/supabase/server';
import { portalRpc } from '@/modules/portal/server';

type QuickCreateResult = { success: boolean; message: string; id?: string; name?: string; address?: string };
const customerInput = z.object({
  // Customer codes are stored upper-case; "kh-01" typed in a hurry is the same code as "KH-01".
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(60).optional(),
});
const siteInput = z.object({
  customerId: z.uuid(),
  code: z.string().trim().min(2).max(32),
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().min(3).max(500),
  receiverName: z.string().trim().max(120).optional(),
  receiverPhone: z.string().trim().max(60).optional(),
});

export async function createCustomerQuickAction(_: QuickCreateResult | undefined, form: FormData): Promise<QuickCreateResult> {
  const parsed = customerInput.safeParse({code:form.get('code'),name:form.get('name'),phone:form.get('phone')});
  if (!parsed.success) return {success:false,message:parsed.error.issues.some((issue)=>issue.path[0]==='code')
    ?'Mã khách gồm 2–32 ký tự: chữ không dấu, số, dấu gạch ngang hoặc gạch dưới (vd KH-001).'
    :'Tên khách cần từ 2 đến 160 ký tự.'};
  const access = await requireInternalPermission('customers.manage');
  const id = randomUUID();
  try {
    await portalRpc(await createServerSupabase(),'save_customer_site_profile',{
      kind:'customers',target_id:id,target_branch_id:access.branchId,
      values_json:{code:parsed.data.code,display_name:parsed.data.name,customer_type:'BUSINESS',phone:parsed.data.phone||null,active:true},
      expected_json:null,change_reason:'Tạo nhanh trong Sales',operation_id:randomUUID(),
    });
  } catch { return {success:false,message:'Không thể tạo khách. Kiểm tra mã khách đã tồn tại.'}; }
  revalidatePath('/admin/orders/new'); revalidatePath('/admin/quotations/new');
  return {success:true,message:'Đã tạo khách hàng.',id,name:parsed.data.name};
}

export async function createSiteQuickAction(_: QuickCreateResult | undefined, form: FormData): Promise<QuickCreateResult> {
  const parsed = siteInput.safeParse({customerId:form.get('customerId'),code:form.get('code'),name:form.get('name'),address:form.get('address'),receiverName:form.get('receiverName'),receiverPhone:form.get('receiverPhone')});
  if (!parsed.success) return {success:false,message:'Thông tin công trình chưa hợp lệ.'};
  const access = await requireInternalPermission('customers.manage');
  const id = randomUUID();
  try {
    await portalRpc(await createServerSupabase(),'save_customer_site_profile',{
      kind:'sites',target_id:id,target_branch_id:access.branchId,
      values_json:{customer_id:parsed.data.customerId,code:parsed.data.code,name:parsed.data.name,address_text:parsed.data.address,receiver_name:parsed.data.receiverName||null,receiver_phone:parsed.data.receiverPhone||null,active:true},
      expected_json:null,change_reason:'Tạo nhanh trong Sales',operation_id:randomUUID(),
    });
  } catch { return {success:false,message:'Không thể tạo công trình. Kiểm tra khách hàng, mã và chi nhánh.'}; }
  revalidatePath('/admin/orders/new'); revalidatePath('/admin/quotations/new');
  return {success:true,message:'Đã tạo công trình.',id,name:parsed.data.name,address:parsed.data.address};
}
