'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireInternalPermission } from '@/lib/access/context';
import { createServerSupabase } from '@/lib/supabase/server';
import { portalRpc, PortalRpcError } from '@/modules/portal/server';
import { catalogs } from './fields';
import { catalogHref } from './ownership';
import { z } from 'zod';
import Decimal from 'decimal.js';
export type CatalogState = {message:string;success?:boolean;recordId?:string;kind?:string};
export async function saveCatalogAction(_:CatalogState|undefined, form:FormData):Promise<CatalogState> {
 const kind=String(form.get('kind')); const config=catalogs[kind];
 if(!config) return {message:'Danh mục không hợp lệ.'};
 const access=await requireInternalPermission(config.permission);
 try {
  const editing=form.get('editing')==='true';
  const fields=(kind==='conversions'&&editing?config.fields.filter(f=>f.key==='active'):config.fields).filter(f=>!f.permission||access.permissions.has(f.permission));
  const values:Record<string,string|boolean|null>={};
  for(const f of fields){const raw=String(form.get(f.key)??'').trim(); if(f.required&&!raw) return {message:`Vui lòng nhập ${f.label}.`}; values[f.key]=f.type==='checkbox'?form.get(f.key)==='on':raw||null;}
  if((kind==='customers'||kind==='suppliers')&&values.email&&!z.email().safeParse(values.email).success) return {message:'Địa chỉ thư điện tử chưa hợp lệ.'};
  if((kind==='customers'||kind==='suppliers')&&(!Number.isInteger(Number(values.payment_terms_days))||Number(values.payment_terms_days)<0||Number(values.payment_terms_days)>365)) return {message:'Hạn thanh toán phải từ 0 đến 365 ngày.'};
  if(kind==='customers'&&values.credit_limit_vnd!=null){const amount=String(values.credit_limit_vnd);if(!/^\d+$/.test(amount)||amount.length>19||BigInt(amount)>9223372036854775807n) return {message:'Hạn mức tín dụng phải là số VND nguyên không âm hợp lệ.'};}
  if(kind==='materials'||kind==='groups'){
   const max=kind==='groups'?24:32;
   if(!new RegExp(`^[A-Z0-9_-]{2,${max}}$`).test(String(values.code))) return {message:`Mã ${config.title.toLowerCase()} phải viết hoa, gồm 2–${max} ký tự A–Z, 0–9, _ hoặc -.`};
  }
  if(kind==='materials'&&!values.sale_enabled&&!values.purchase_enabled) return {message:'Vật tư phải cho phép bán hoặc mua.'};
  if(kind==='units'){
   if(!/^[a-z0-9_]{1,20}$/.test(String(values.code))) return {message:'Mã đơn vị phải viết thường, tối đa 20 ký tự a–z, 0–9 hoặc _.'};
   const scale=Number(values.decimal_scale);
   if(!Number.isInteger(scale)||scale<0||scale>6) return {message:'Số chữ số thập phân phải từ 0 đến 6.'};
  }
  if(kind==='conversions'&&!editing){
   if(values.from_uom_id===values.to_uom_id) return {message:'Đơn vị nguồn và đích phải khác nhau.'};
   for(const key of ['numerator','denominator']){
    const ratio=String(values[key]??'');
    try { if(!/^\d+(?:\.\d+)?$/.test(ratio)||!new Decimal(ratio).isPositive()) return {message:'Tử số và mẫu số phải là số dương chính xác.'}; }
    catch { return {message:'Tử số và mẫu số phải là số dương chính xác.'}; }
   }
   const conversionType=String(values.conversion_type);
   if(!['EXACT','PACKAGING','ESTIMATED','MEASURED','VEHICLE_LOAD'].includes(conversionType)) return {message:'Loại quy đổi không hợp lệ.'};
   if(conversionType==='VEHICLE_LOAD'&&values.settlement_allowed) return {message:'Quy đổi theo tải xe chỉ dùng lập kế hoạch, không được phép thanh toán.'};
   if(['ESTIMATED','MEASURED'].includes(conversionType)&&!values.source_note) return {message:'Quy đổi ước lượng hoặc đo thực tế cần ghi nguồn đo.'};
   const scale=Number(values.rounding_scale);
   if(!Number.isInteger(scale)||scale<0||scale>6) return {message:'Số chữ số làm tròn phải từ 0 đến 6.'};
  }
  if(kind==='sites'&&Boolean(values.latitude)!==Boolean(values.longitude)) return {message:'Cần nhập cả vĩ độ và kinh độ, hoặc để trống cả hai.'};
  if(kind==='branches'&&!/^[A-Z0-9_-]{2,24}$/.test(String(values.code))) return {message:'Mã chi nhánh phải viết hoa, gồm 2–24 ký tự A–Z, 0–9, _ hoặc -.'};
  if(kind==='machines'&&String(values.machine_type).length>60) return {message:'Loại máy tối đa 60 ký tự.'};
  if(kind==='vehicles'){
   if(Boolean(values.capacity_quantity)!==Boolean(values.capacity_uom_id)) return {message:'Sức chứa phải có cả số lượng và đơn vị, hoặc để trống cả hai.'};
   if(values.capacity_quantity){const capacity=String(values.capacity_quantity);try{if(!/^\d+(?:\.\d+)?$/.test(capacity)||!new Decimal(capacity).isPositive()) return {message:'Sức chứa phải là số dương.'};}catch{return {message:'Sức chứa phải là số dương.'};}}
  }
  const original=editing?JSON.parse(String(form.get('original'))):null;
  const expected=original?Object.fromEntries(fields.map(f=>[f.key,original[f.key]??null])):null;
  const recordId=editing?String(form.get('id')):randomUUID();
  const rpcName=kind==='branches'?'save_branch_config':kind==='customers'||kind==='sites'?'save_customer_site_profile':'save_catalog_record';
  const payload=kind==='branches'
   ? {target_id:recordId,source_branch_id:access.branchId,values_json:values,expected_json:expected,change_reason:String(form.get('reason')??''),operation_id:randomUUID()}
   : {kind,target_id:recordId,target_branch_id:access.branchId,values_json:values,expected_json:expected,change_reason:String(form.get('reason')??''),operation_id:randomUUID()};
  await portalRpc(await createServerSupabase(),rpcName,payload);
  for(const path of ['/admin/catalog','/admin/products','/admin/customers','/admin/suppliers','/admin/inventory','/admin/dispatch',catalogHref(kind).split('?')[0]]) revalidatePath(path);
  return {success:true,message:'Đã lưu và ghi lịch sử thay đổi.',recordId,kind};
 }catch(error){
  const code=error instanceof PortalRpcError?error.code:'';
  return {message:code==='40001'||code==='PT409'?'Dữ liệu đã thay đổi. Mở lại bản ghi trước khi lưu.':code==='23505'?'Mã hoặc bản ghi đã tồn tại. Tải lại danh sách trước khi thử lại.':code==='42501'?'Không có quyền với đối tượng/chi nhánh này.':'Không thể lưu. Kiểm tra mã, đơn vị, tỷ lệ và thông tin bắt buộc; dữ liệu chưa được xác nhận.'};
 }
}
