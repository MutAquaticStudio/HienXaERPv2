'use server';
import { revalidatePath } from 'next/cache';
import { requireInternalPermission } from '@/lib/access/context';
import { createServerSupabase } from '@/lib/supabase/server';
import { portalRpc, PortalRpcError } from '@/modules/portal/server';
import { catalogs } from './fields';
import { catalogHref } from './ownership';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { isExactEntryQuantity } from '@/lib/core/quantity';
import { checkSavedCommandFieldsAction } from '@/lib/core/command-outcome-actions';
import { isAuthoritativeRejection, type CommandOutcome } from '@/lib/core/command-outcome';
import { AppError } from '@/lib/core/errors';
import { masterCommand } from './command';
export type CatalogState = {message:string;success?:boolean;recordId?:string;kind?:string;status?:CommandOutcome['status']};
export async function saveCatalogAction(_:CatalogState|undefined, form:FormData):Promise<CatalogState> {
 const kind=String(form.get('kind')); const config=catalogs[kind];
 if(!config) return {message:'Danh mục không hợp lệ.'};
 const access=await requireInternalPermission(config.permission);
 try {
  const intent = z.guid().safeParse(form.get('operationId'));
  if (!intent.success) return {message:'Mã thao tác chưa hợp lệ. Tải lại biểu mẫu trước khi lưu.',status:'FAILED'};
  const recovery = await checkSavedCommandFieldsAction(form, masterCommand(kind));
  if (recovery) return {message:recovery.message,status:recovery.status};
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
  if(kind==='service_types'){
   if(!/^[A-Z0-9_-]{2,24}$/.test(String(values.code))) return {message:'Mã loại dịch vụ phải viết hoa, gồm 2–24 ký tự A–Z, 0–9, _ hoặc -.'};
   if(String(values.name).length<2||String(values.name).length>120) return {message:'Tên loại dịch vụ cần từ 2 đến 120 ký tự.'};
   if(String(values.unit_label).length>30) return {message:'Đơn vị tính tối đa 30 ký tự.'};
   if(values.default_price_vnd!=null&&!/^\d{1,15}$/.test(String(values.default_price_vnd))) return {message:'Đơn giá phải là số VND nguyên không âm.'};
   if(!['NONE','VEHICLE','MACHINE'].includes(String(values.resource_kind))) return {message:'Chọn loại dịch vụ cần xe, cần máy hay không cần.'};
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
   if(Boolean(values.capacity_quantity)!==Boolean(values.capacity_uom_id)) return {message:'Sức chở phải có cả số lượng và đơn vị, hoặc để trống cả hai.'};
   if(values.capacity_quantity&&!isExactEntryQuantity(String(values.capacity_quantity))) return {message:'Sức chở phải là số dương hợp lệ, tối đa 6 chữ số thập phân.'};
  }
  const original=editing?JSON.parse(String(form.get('original'))):null;
  const expected=original?Object.fromEntries(fields.map(f=>[f.key,original[f.key]??null])):null;
  const recordId=editing?String(form.get('id')):intent.data;
  const rpcName=masterCommand(kind);
  const payload=kind==='branches'
   ? {target_id:recordId,source_branch_id:access.branchId,values_json:values,expected_json:expected,change_reason:String(form.get('reason')??''),operation_id:intent.data}
   : {kind,target_id:recordId,target_branch_id:access.branchId,values_json:values,expected_json:expected,change_reason:String(form.get('reason')??''),operation_id:intent.data};
  await portalRpc(await createServerSupabase(),rpcName,payload);
  for(const path of ['/admin/catalog','/admin/products','/admin/customers','/admin/suppliers','/admin/inventory','/admin/dispatch','/admin/service-jobs',catalogHref(kind).split('?')[0]]) revalidatePath(path);
  return {success:true,message:'Đã lưu và ghi lịch sử thay đổi.',recordId,kind};
 }catch(error){
  const code=error instanceof PortalRpcError?error.code:'';
  if(error instanceof Error&&error.message.includes('vehicle_capacity_locked_by_assignment')) return {message:'Xe đang có phân giao chưa hoàn tất. Xử lý phân giao trước khi thay dữ liệu sức chứa.'};
  if(error instanceof Error&&error.message.includes('vehicle_capacity_locked_by_cargo')) return {message:'Xe còn hàng đã bàn giao chưa được xử lý hết. Đối chiếu và xử lý hàng còn trước khi đổi sức chứa, đơn vị hoặc ngừng sử dụng xe.'};
  return {status:isAuthoritativeRejection(code)?'FAILED':'UNKNOWN',message:code==='40001'||code==='PT409'?'Dữ liệu đã thay đổi. Mở lại bản ghi trước khi lưu.':code==='23505'?'Mã hoặc bản ghi đã tồn tại. Tải lại danh sách trước khi thử lại.':code==='42501'?'Không có quyền với đối tượng/chi nhánh này.':'Chưa xác định được kết quả. Tra cứu hoặc thử lại cùng thao tác; không tạo bản ghi lần nữa.'};
 }
}

export async function saveCatalogWithOutcomeAction(form:FormData):Promise<CommandOutcome> {
 try {
  const result=await saveCatalogAction(undefined,form);
  return result.success&&result.recordId?{status:'SUCCESS',resultId:result.recordId,message:result.message}:{status:result.status==='UNKNOWN'?'UNKNOWN':'FAILED',message:result.message};
 } catch(error) {
  if(error instanceof AppError&&[401,403,409,422].includes(error.status)) return {status:'FAILED',message:error.message};
  throw error;
 }
}

const CATALOG_PATHS=['/admin/catalog','/admin/products','/admin/customers','/admin/suppliers','/admin/inventory','/admin/dispatch','/admin/pricing','/admin/service-jobs'];
const statusInput=z.object({kind:z.string(),id:z.guid(),active:z.boolean(),customerId:z.guid().nullish(),operationId:z.guid()});

/** "Ngừng dùng" / "Dùng lại": flips only `active`, through the same audited save command as the edit form. */
export async function setCatalogActiveAction(input:z.input<typeof statusInput>):Promise<CommandOutcome> {
 const parsed=statusInput.safeParse(input); const config=parsed.success?catalogs[parsed.data.kind]:undefined;
 if(!parsed.success||!config) return {status:'FAILED',message:'Yêu cầu không hợp lệ. Tải lại trang rồi thử lại.'};
 const {kind,id,active,customerId,operationId}=parsed.data;
 if(kind==='sites'&&!customerId) return {status:'FAILED',message:'Thiếu khách hàng của công trình. Tải lại trang rồi thử lại.'};
 try {
  const access=await requireInternalPermission(config.permission);
  const values:Record<string,unknown>=kind==='sites'?{customer_id:customerId,active}:{active};
  const expected:Record<string,unknown>=kind==='sites'?{customer_id:customerId,active:!active}:{active:!active};
  const reason=active?'Dùng lại':'Ngừng sử dụng';
  const payload=kind==='branches'
   ?{target_id:id,source_branch_id:access.branchId,values_json:values,expected_json:expected,change_reason:reason,operation_id:operationId}
   :{kind,target_id:id,target_branch_id:access.branchId,values_json:values,expected_json:expected,change_reason:reason,operation_id:operationId};
  await portalRpc(await createServerSupabase(),masterCommand(kind),payload);
  for(const path of [...CATALOG_PATHS,catalogHref(kind).split('?')[0]]) revalidatePath(path);
  return {status:'SUCCESS',resultId:id,message:active?'Đã dùng lại.':'Đã ngừng sử dụng. Bản ghi không còn hiện khi tạo chứng từ mới.'};
 } catch(error) {
  if(error instanceof AppError&&[401,403].includes(error.status)) return {status:'FAILED',message:error.message};
  const code=error instanceof PortalRpcError?error.code:'';
  const raw=error instanceof PortalRpcError?error.rawMessage:error instanceof Error?error.message:'';
  if(raw.includes('vehicle_capacity_locked')) return {status:'FAILED',message:'Xe đang có phân giao hoặc hàng chưa xử lý. Xử lý xong trước khi ngừng dùng xe.'};
  if(code==='PT409'||code==='40001') return {status:'FAILED',message:'Bản ghi vừa được thay đổi ở nơi khác. Tải lại trang rồi thử lại.'};
  if(code==='42501') return {status:'FAILED',message:'Không có quyền với bản ghi/chi nhánh này.'};
  return isAuthoritativeRejection(code)?{status:'FAILED',message:'Không đổi được trạng thái. Tải lại trang rồi thử lại.'}
   :{status:'UNKNOWN',message:'Chưa xác định được kết quả. Bấm lại cùng nút để kiểm tra; thao tác không bị ghi hai lần.'};
 }
}

const deleteInput=z.object({kind:z.string(),id:z.guid(),operationId:z.guid()});
export type CatalogDeleteOutcome=CommandOutcome&{inUse?:boolean};

/** "Xóa": only while nothing uses the record (the database refuses otherwise and nothing is removed). */
export async function deleteCatalogRecordAction(input:z.input<typeof deleteInput>):Promise<CatalogDeleteOutcome> {
 const parsed=deleteInput.safeParse(input); const config=parsed.success?catalogs[parsed.data.kind]:undefined;
 if(!parsed.success||!config||parsed.data.kind==='branches') return {status:'FAILED',message:'Yêu cầu không hợp lệ. Tải lại trang rồi thử lại.'};
 const {kind,id,operationId}=parsed.data;
 try {
  const access=await requireInternalPermission(config.permission);
  await portalRpc(await createServerSupabase(),'delete_catalog_record',{kind,target_id:id,target_branch_id:access.branchId,change_reason:'Xóa khỏi danh mục',operation_id:operationId});
  for(const path of [...CATALOG_PATHS,catalogHref(kind).split('?')[0]]) revalidatePath(path);
  return {status:'SUCCESS',resultId:id,message:`Đã xóa ${config.title.toLowerCase()}.`};
 } catch(error) {
  if(error instanceof AppError&&[401,403].includes(error.status)) return {status:'FAILED',message:error.message};
  const code=error instanceof PortalRpcError?error.code:'';
  const raw=error instanceof PortalRpcError?error.rawMessage:error instanceof Error?error.message:'';
  if(raw.includes('catalog_record_in_use')) return {status:'FAILED',inUse:true,message:'Đã có chứng từ hoặc dữ liệu liên quan nên không xóa được. Bạn có thể ngừng dùng để ẩn khỏi các lựa chọn mới.'};
  if(code==='PT409') return {status:'FAILED',message:'Bản ghi không còn tồn tại hoặc vừa thay đổi. Tải lại trang.'};
  if(code==='42501') return {status:'FAILED',message:'Không có quyền xóa bản ghi này.'};
  return isAuthoritativeRejection(code)?{status:'FAILED',message:'Không xóa được. Tải lại trang rồi thử lại.'}
   :{status:'UNKNOWN',message:'Chưa xác định được kết quả. Bấm lại cùng nút để kiểm tra; thao tác không bị ghi hai lần.'};
 }
}
