import Link from 'next/link';
import { requireInternalAccess } from '@/lib/access/context';
import { createServerSupabase } from '@/lib/supabase/server';
import { catalogs } from '@/modules/catalog/fields';
import { CatalogEditor, type Options } from '@/modules/catalog/editor';
export default async function CatalogPage({searchParams}:{searchParams:Promise<{kind?:string;q?:string;id?:string;customerId?:string}>}) {
 const access=await requireInternalAccess(); const params=await searchParams;
 const available=Object.entries(catalogs).filter(([,v])=>access.permissions.has(v.permission));
 const kind=available.some(([k])=>k===params.kind)?params.kind!:available[0]?.[0];
 if(!kind) return <p>Không có quyền quản lý danh mục.</p>;
 const config=catalogs[kind]; const supabase=await createServerSupabase();
 const visibleFields=config.fields.filter(f=>!f.permission||access.permissions.has(f.permission));
 const columns=['id',...visibleFields.filter(f=>kind!=='customers'||!['credit_limit_vnd','internal_note'].includes(f.key)).map(f=>f.key)].join(',');
 let query=supabase.from(config.table as 'materials').select(kind==='sites'?`${columns},customers!inner(branch_id)`:columns).limit(200);
 if(['customers','suppliers','warehouses','vehicles','machines'].includes(kind)) query=query.eq('branch_id',access.branchId);
 if(kind==='sites') query=query.eq('customers.branch_id',access.branchId);
 if(kind==='branches') query=query.eq('id',params.id??access.branchId);
 if(params.id) query=query.eq('id',params.id);
 else if(params.q){const key=config.fields.some(f=>f.key==='name')?'name':kind==='customers'?'display_name':'id'; if(key!=='id') query=query.ilike(key,`%${params.q.replace(/[%_]/g,'')}%`);}
 const {data,error}=await query.order('id'); if(error) throw new Error('Không tải được danh mục.');
 let rows=data as unknown as Record<string,unknown>[];
 if(kind==='customers'&&rows.length){const privateResult=await supabase.rpc('customer_private_fields',{target_customer_ids:rows.map(row=>String(row.id))});if(privateResult.error)throw new Error('Không tải được thông tin riêng tư khách hàng.');const privateById=new Map<string,{credit_limit_vnd:string|number|null;internal_note:string|null}>((privateResult.data??[]).map((field:{customer_id:string;credit_limit_vnd:string|number|null;internal_note:string|null})=>[field.customer_id,{credit_limit_vnd:field.credit_limit_vnd,internal_note:field.internal_note}] as const));rows=rows.map(row=>{const privateFields=privateById.get(String(row.id));return privateFields?{...row,...privateFields}:row;});}
 const options:Options={};
 for(const optionKind of new Set(visibleFields.flatMap(f=>f.options?[f.options]:[]))){
  if(optionKind==='salesOwners'){
   const r=await supabase.rpc('customer_site_sales_owner_options',{target_branch_id:access.branchId});
   if(r.error) throw new Error('Không tải được nhân viên phụ trách.');
   options[optionKind]=((r.data??[]) as {id:string;name:string;assignable:boolean}[]).map(v=>({id:v.id,name:v.name,assignable:v.assignable}));
   continue;
  }
  const c=catalogs[optionKind];const label=optionKind==='customers'?'display_name':'name';let oq=supabase.from(c.table as 'materials').select(`id,${label}`).eq('active',true).order(label).limit(1000);if(optionKind==='customers') oq=oq.eq('branch_id',access.branchId);const r=await oq; if(r.error) throw new Error('Không tải được lựa chọn danh mục.');options[optionKind]=(r.data as unknown as Record<string,string>[]).map(v=>({id:v.id,name:v[label]}));
  const selected=new Set(visibleFields.filter(f=>f.options===optionKind).flatMap(f=>rows.map(row=>row[f.key])).filter((value):value is string=>typeof value==='string'&&value.length>0));
  const present=new Set(options[optionKind].map(v=>v.id));const missing=[...selected].filter(id=>!present.has(id));
  if(missing.length){let mq=supabase.from(c.table as 'materials').select(`id,${label},active`).in('id',missing).limit(200);if(optionKind==='customers') mq=mq.eq('branch_id',access.branchId);const mr=await mq;if(mr.error) throw new Error('Không tải được lựa chọn đã lưu.');options[optionKind].push(...(mr.data as unknown as Record<string,string|boolean>[]).map(v=>({id:String(v.id),name:`${v[label]}${v.active?'':' (ngừng)'}`,assignable:Boolean(v.active)})));}
 }
 return <><header className="page-heading"><p className="eyebrow">Quản lý danh mục · {access.branchName}</p><h1>{config.title}</h1><p>Ngừng sử dụng thay vì xóa; lịch sử chứng từ không thay đổi.</p></header><nav className="form-actions">{available.map(([k,c])=><Link className="button button-secondary" key={k} href={`/admin/catalog?kind=${k}`}>{c.title}</Link>)}</nav><form className="form-actions"><input type="hidden" name="kind" value={kind}/><label htmlFor="catalog-search">Tìm theo tên</label><input id="catalog-search" name="q" defaultValue={params.q}/><button className="button" type="submit">Tìm</button></form><details className="card card-pad"><summary>Thêm {config.title.toLowerCase()}</summary><CatalogEditor key={`new-${kind}`} kind={kind} options={options} permissions={[...access.permissions]} initial={kind==='sites'&&params.customerId?{customer_id:params.customerId}:undefined}/></details><p className="muted">Hiển thị tối đa 200 bản ghi. Dùng tìm kiếm để thu hẹp danh sách.</p>{rows.map(row=><details className="card card-pad" key={String(row.id)} open={params.id===row.id}><summary>{String(row.code??row.name??row.id)} · {String(row.name??row.display_name??'Quy đổi')} · {row.active?'Đang dùng':'Đã ngừng'}</summary><CatalogEditor kind={kind} record={row} options={options} permissions={[...access.permissions]}/></details>)}</>;
}
