import Link from 'next/link';
import { requireInternalAccess } from '@/lib/access/context';
import { createServerSupabase } from '@/lib/supabase/server';
import { branchScopedCatalogs, catalogs } from '@/modules/catalog/fields';
import { CatalogTable } from './catalog-dialog';
import { loadCatalogOptions, visibleCatalogFields } from './editor-data';
import { catalogHref, manageableCatalogs, type CatalogQuery } from './ownership';
export default async function ModuleCatalogPage({searchParams,kinds}:{searchParams:Promise<CatalogQuery>;kinds:readonly string[]}) {
 const access=await requireInternalAccess(); const params=await searchParams;
 const available=manageableCatalogs(kinds,access.permissions);
 const kind=available.some(([k])=>k===params.kind)?params.kind!:available[0]?.[0];
 if(!kind) return <p>Không có quyền quản lý danh mục.</p>;
 const config=catalogs[kind]; const supabase=await createServerSupabase();
 const visibleFields=visibleCatalogFields(kind,access.permissions);
 const columns=['id',...visibleFields.filter(f=>kind!=='customers'||!['credit_limit_vnd','internal_note'].includes(f.key)).map(f=>f.key)].join(',');
 let query=supabase.from(config.table as 'materials').select(kind==='sites'?`${columns},customers!inner(branch_id)`:columns).limit(200);
 if(branchScopedCatalogs.includes(kind)) query=query.eq('branch_id',access.branchId);
 if(kind==='sites') query=query.eq('customers.branch_id',access.branchId);
 if(kind==='branches') query=query.eq('id',params.id??access.branchId);
 if(params.id) query=query.eq('id',params.id);
 else if(params.q){const key=config.fields.some(f=>f.key==='name')?'name':kind==='customers'?'display_name':'id'; if(key!=='id') query=query.ilike(key,`%${params.q.replace(/[%_]/g,'')}%`);}
 const {data,error}=await query.order('id'); if(error) throw new Error('Không tải được danh mục.');
 let rows=data as unknown as Record<string,unknown>[];
 if(kind==='customers'&&rows.length){const privateResult=await supabase.rpc('customer_private_fields',{target_customer_ids:rows.map(row=>String(row.id))}).select("customer_id,credit_limit_vnd::text,internal_note");if(privateResult.error)throw new Error('Không tải được thông tin riêng tư khách hàng.');const privateRows=Array.isArray(privateResult.data)?privateResult.data:privateResult.data?[privateResult.data]:[];const privateById=new Map<string,{credit_limit_vnd:string|number|null;internal_note:string|null}>(privateRows.map((field:{customer_id:string;credit_limit_vnd:string|number|null;internal_note:string|null})=>[field.customer_id,{credit_limit_vnd:field.credit_limit_vnd,internal_note:field.internal_note}] as const));rows=rows.map(row=>{const privateFields=privateById.get(String(row.id));return privateFields?{...row,...privateFields}:row;});}
 const options=await loadCatalogOptions(kind,access,supabase,rows);
 return <div className="page-stack"><header className="page-heading"><div><p className="eyebrow">Quản lý · {access.branchName}</p><h1>{config.title}</h1><p className="lede">Bấm “Thêm” hoặc “Sửa” để mở biểu mẫu ngay trên trang. Xóa được khi chưa phát sinh chứng từ; đã dùng thì ngừng dùng, lịch sử chứng từ không thay đổi.</p></div></header>
  {available.length>1&&<nav className="action-cluster" aria-label="Danh mục">{available.map(([k,c])=><Link className={`button ${k===kind?'button-primary':'button-secondary'}`} aria-current={k===kind?'page':undefined} key={k} href={catalogHref(k)}>{c.title}</Link>)}</nav>}
  <form className="form-actions"><input type="hidden" name="kind" value={kind}/><label htmlFor="catalog-search">Tìm theo tên</label><input id="catalog-search" name="q" defaultValue={params.q}/><button className="button button-secondary" type="submit">Tìm</button>{(params.q||params.id)&&<Link className="code-link" href={catalogHref(kind)}>Xem tất cả</Link>}</form>
  <CatalogTable key={`${kind}:${params.id??''}`} kind={kind} rows={rows} options={options} permissions={[...access.permissions]} scopePrefix={`${access.authUserId}:${access.branchId}:CATALOG`} openId={params.id} openTab={params.tab==='units'?'units':undefined}
   openNew={kind==='sites'&&!!params.customerId&&!params.id} initial={kind==='sites'&&params.customerId?{customer_id:params.customerId}:undefined}/>
  <p className="muted">Hiển thị tối đa 200 bản ghi. Dùng tìm kiếm để thu hẹp danh sách.</p></div>;
}
