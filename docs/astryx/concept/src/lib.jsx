import React from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Table} from '@astryxdesign/core/Table';
import {Banner} from '@astryxdesign/core/Banner';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {TextInput} from '@astryxdesign/core/TextInput';
import * as H from '@heroicons/react/24/outline';

/* Biểu tượng dùng chung: <Ic n="Truck"/> hoặc <Ic n="Truck" s/> (16px) / l (24px). Tên theo heroicons (không có hậu tố Icon). */
export const Ic=({n,s,l,style})=>{const C=H[n+'Icon']||H.QuestionMarkCircleIcon;return <C className={'hx-ico'+(s?' s':l?' l':'')} style={style} aria-hidden="true"/>};
export {H as heroicons};

export const MENU=['Tổng quan','Bán hàng','Mua hàng','Kho hàng','Giao hàng','Tài chính','Nhân công','Hệ thống'];
export const MENU_ICON={'Tổng quan':'Squares2X2','Bán hàng':'ShoppingCart','Mua hàng':'ShoppingBag','Kho hàng':'ArchiveBox','Giao hàng':'Truck','Tài chính':'Banknotes','Nhân công':'UserGroup','Hệ thống':'Cog6Tooth'};
export const SUB={
 'Tổng quan':['Tổng quan','Báo cáo'],
 'Bán hàng':['Đơn bán','Khách hàng','Dịch vụ'],
 'Mua hàng':['Đơn mua','Nhà cung cấp','Trả hàng NCC','Hóa đơn mua'],
 'Kho hàng':['Vật tư','Giá bán','Tồn kho','Chuyển kho','Kiểm kho'],
 'Giao hàng':['Điều phối','Phiếu giao','Lộ trình'],
 'Tài chính':['Công nợ','Sổ quỹ','Chi phí','Thông báo thanh toán'],
 'Nhân công':['Chấm công','Bảng lương','Nhân sự'],
 'Hệ thống':['Cài đặt','Phân quyền','Nhật ký','Trợ lý AI']};
export const money=n=>n.toLocaleString('vi-VN')+' ₫';

/* ---------- Avatar chữ cái (màu cố định theo tên) ---------- */
const AVC=[['#E3EEFB','#0A4A96'],['#E3F4EA','#0D5A33'],['#FFF0D6','#7A4300'],['#F0E8FB','#5B2A9A'],['#E0F3F5','#0B5560'],['#FCE8EE','#8A1F45'],['#ECEFF3','#34445A']];
const HON=/^(anh|chị|cô|chú|bác|ông|bà|công|ty|cty|cửa|hàng|xd|tnhh)$/i;
export const initials=(name='')=>{const w=name.split(/\s+/).filter(Boolean);const k=w.filter(x=>!HON.test(x));const u=k.length?k:w;if(u.length===1)return u[0][0].toUpperCase();return (u[0][0]+u[u.length-1][0]).toUpperCase()};
export const Av=({name,size=36})=>{size=Math.max(size,32);let h=0;for(const c of name)h=(h*31+c.charCodeAt(0))>>>0;const [bg,fg]=AVC[h%AVC.length];return <span className="hx-av" style={{width:size,height:size,background:bg,color:fg,fontSize:Math.max(13,Math.round(size*.38))}} aria-hidden="true">{initials(name)}</span>};
/* "Tên · phụ" → avatar + tên + dòng phụ. */
export const Person=({name,sub,size=36})=>{let n=name,s=sub;if(typeof name==='string'&&s===undefined&&name.includes(' · ')){const i=name.indexOf(' · ');n=name.slice(0,i);s=name.slice(i+3)}return <div className="hx-person"><Av name={String(n)} size={size}/><div><b>{n}</b>{s&&<small>{s}</small>}</div></div>};

/* ---------- Khung ---------- */
export function Shell({group,page,children,w=1280}){
 return <div style={{width:w,minHeight:'100%'}}>
  <div className="hx-util"><div className="hx-logo"><i>HX</i>Hiền Xa</div>
   <div className="hx-branch"><Ic n="BuildingStorefront"/>Chi nhánh Hà Đông<Ic n="ChevronDown" s/></div><span style={{flex:1}}/>
   <div className="hx-gsearch"><Ic n="MagnifyingGlass"/><span>Tìm nhanh đơn, khách, vật tư</span><kbd className="hx-kbd">Ctrl K</kbd></div>
   <div className="hx-iconbtn" aria-label="Thông báo"><Ic n="Bell"/><i/></div>
   <div className="hx-user"><Avatar name="Chủ cửa hàng" size={32} tooltip={false}/><div><b>Chủ cửa hàng</b><small>Hà Đông</small></div><Ic n="ChevronDown" s/></div></div>
  <nav className="hx-menu">{MENU.map(m=><span key={m} className={m===group?'on':''} aria-current={m===group?'page':undefined}><Ic n={MENU_ICON[m]}/>{m}</span>)}</nav>
  <div className="hx-page">{children}</div></div>;}
export const Chip0=({k='g',children})=><span className={'hx-chip '+k}>{children}</span>;
export const Chip=Chip0;
/* Nhãn phẳng (không chấm) cho phân loại: <Tag>Nhóm giá</Tag> */
export const Tag=({children})=><span className="hx-chip t">{children}</span>;
export const Btn0=({k,children,icon})=><span className={'hx-btn '+(k||'')}>{icon&&<Ic n={icon}/>}{children}</span>;
const ICO=[[/^\+\s*/,'Plus'],[/excel/i,'ArrowDownTray'],[/^xuất/i,'ArrowUpTray'],[/^nhận/i,'ArrowDownTray'],[/^in\b/i,'Printer'],[/^giá/i,'Tag'],[/tính lương/i,'Calculator'],[/xử lý|kiểm tra/i,'ArrowRight'],[/ghi nhận|chi tiền|thu tiền/i,'Banknotes'],[/sửa/i,'PencilSquare'],[/^xóa/i,'Trash'],[/lưu/i,'DocumentCheck']];
const autoIcon=t=>{for(const [r,n] of ICO)if(r.test(t))return n};
/* Btn: k='p' xanh chính, 'g' xanh lá (tiền/hoàn tất), 'd' đỏ, mặc định phụ. icon="Tên" ép biểu tượng; icon={false} tắt; sm = nhỏ. */
export const Btn=({k,children,icon,sm})=>{const t=String(children).replace(/^\+\s*/,'');const n=icon===false?null:icon||autoIcon(String(children));
 return <span className={'hx-btn '+(k||'')+(sm?' sm':'')} role="button">{n&&<Ic n={n}/>}{t}</span>};

/* ---------- Tiêu đề trang + breadcrumb ---------- */
export const Crumbs=({sub})=>{if(!sub)return null;const p=String(sub).split(' / ');return <div className="hx-crumbs"><Ic n="Home"/>{p.map((x,i)=><React.Fragment key={i}><Ic n="ChevronRight"/>{i===p.length-1?<b>{x}</b>:<span>{x}</span>}</React.Fragment>)}</div>};
export const Title=({children,right,sub})=><div className="hx-head"><div><Crumbs sub={sub}/><h1 className="hx-title">{children}</h1></div><div className="hx-acts">{right}</div></div>;

/* ---------- Trạng thái trống ---------- */
export const Empty=({icon='InboxStack',title,children,action})=><div className="hx-empty"><div className="ic"><Ic n={icon}/></div><b>{title}</b>{children&&<p>{children}</p>}{action&&<div style={{marginTop:12}}>{action}</div>}</div>;

/* ---------- Lọc trái: chấm màu theo trạng thái ---------- */
const DOT=[[/nháp|phiếu tạm|ngừng|đã hủy|bỏ qua|chưa dùng|từ chối|khách đã hủy|tạm khóa|đã lên lịch/i,'#8493A8'],[/quá hạn|chênh lệch|lỗi|hết hàng/i,'#B4291F'],[/chờ|sắp|đang kiểm|đang tính|một phần|cần|có công nợ|trễ/i,'#E8890C'],[/đã xác minh/i,'#0E8A9A'],[/hoàn|đã nhận|đã ghi|đã chi|khớp|hoạt động|đang dùng|đang bán|đang hợp tác|đã cân|đã cấp/i,'#12804A'],[/trong hạn|đang|đã xác nhận|đã phân|đã đặt|đã xếp|đã chốt/i,'#0B63C6']];
const dotColor=t=>{for(const [r,c] of DOT)if(r.test(t))return c;return null};

// khung trái lọc + bảng. Mới (tùy chọn): open=chỉ số dòng mở xem nhanh + quick=nội dung; selected; stats=[Kpi props]; extra=thẻ phụ khung trái; empty; total; toolbar; sort; filterTitle. Cột {av:1} = avatar + "Tên · phụ".
export function ListPage({group,page,title,sub,actions,filters,search,cols,rows,widths,quick,open,selected,stats,extra,empty,total,toolbar,sort='Mới nhất',filterTitle='Trạng thái'}){
 const g=widths||cols.map(()=>'1fr');const tpl=g.join(' ');
 const cell=(v,i,ri)=>{const c=cols[i]||{};
  if(v==='›'||v==='⌄')return <button className="hx-exp" aria-label="Xem nhanh" aria-expanded={open===ri}><Ic n={open===ri?'ChevronDown':'ChevronRight'}/></button>;
  if(c.av&&typeof v==='string')return <Person name={v}/>;
  if(c.key)return <b>{v}</b>;
  return v};
 const n=total??(filters[0]?filters[0][1]:rows.length);
 if(rows.length===0&&empty)return <Shell group={group} page={page}><Title sub={sub} right={actions}>{title}</Title><div className="hx-card" style={{boxShadow:'var(--sh-2)'}}>{empty}</div></Shell>;
 return <Shell group={group} page={page}><Title sub={sub} right={actions}>{title}</Title>
 {stats&&<div style={{display:'flex',gap:16,marginBottom:16}}>{stats.map((s,i)=><Kpi key={i} {...s}/>)}</div>}
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div className="hx-side"><div className="hx-card hx-pad"><div className="hx-label" style={{marginBottom:6}}>Tìm kiếm</div><div className="hx-in ph"><Ic n="MagnifyingGlass"/><span>{search||'Tìm mã, tên'}</span></div></div>
   <div className="hx-card hx-pad"><div className="hx-label" style={{marginBottom:8}}>{filterTitle}</div>
    {filters.map(([t,c],i)=>{const d=i>0&&(dotColor(t)||'#C7D2DF');return <div key={t} className={'hx-radio'+(i===0?' on':'')} role="radio" aria-checked={i===0}><i/>{d&&<b className="hx-dot" style={{background:d}}/>}<span>{t}</span><em>{c}</em></div>})}</div>{extra}</div>
  <div className="hx-card" style={{flex:1,overflow:'hidden',minWidth:0,boxShadow:'var(--sh-2)'}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0 16px',height:48,borderBottom:'1px solid var(--hx-line)',fontSize:14}}>{toolbar||<><span className="hx-muted"><b style={{color:'var(--hx-ink)'}}>{n}</b> kết quả · {filters[0]?filters[0][0]:''}</span><span className="hx-muted" style={{display:'flex',alignItems:'center',gap:6}}>Sắp xếp: <b style={{color:'var(--hx-ink)'}}>{sort}</b><Ic n="ChevronUpDown" s/></span></>}</div>
   <div className="hx-th" style={{gridTemplateColumns:tpl}}>{cols.map((c,i)=><span key={i} className={c.num?'hx-num':''}>{c.h}</span>)}</div>
   {rows.length===0?(empty||<Empty icon="InboxStack" title="Chưa có dữ liệu">Khi có dữ liệu mới, danh sách sẽ hiện ở đây.</Empty>):rows.map((r,ri)=><div key={ri} className={'hx-row'+(selected===ri?' sel':'')+(open===ri?' open':'')}>
    <div className="hx-tr" style={{gridTemplateColumns:tpl}}>{r.map((v,i)=><span key={i} className={cols[i]&&cols[i].num?'hx-num':''}>{cell(v,i,ri)}</span>)}</div>
    {open===ri&&quick&&<div className="hx-quick">{quick}</div>}</div>)}
   {rows.length>0&&<div className="hx-foot"><span>{n<=20||rows.length>=n?`Hiển thị ${rows.length} trên ${rows.length}`:`Hiển thị 1–${rows.length} trên ${n} · 20 dòng mỗi trang`}</span>{n>20&&<div className="hx-pager"><span className="nav"><Ic n="ChevronLeft"/>Trước</span><span className="on">1</span>{Array.from({length:Math.min(Math.ceil(n/20),4)-1},(_,i)=><span key={i}>{i+2}</span>)}<span className="nav">Sau<Ic n="ChevronRight"/></span></div>}</div>}
  </div></div></Shell>;}
/* Một cột trong khung xem nhanh: <QCol t="Hàng hóa">…</QCol> */
export const QCol=({t,children})=><div><h4>{t}</h4>{children}</div>;

/* ---------- Thành phần chung ---------- */
export const Card2=({title,children,right,pad=true,style,icon})=><div className="hx-card" style={{boxShadow:'var(--sh-2)',...style}}>{title&&<div className={'hx-ch'+(pad?'':' bd')}><div className="l">{icon&&<Ic n={icon}/>}<b className="hx-sec">{title}</b></div>{right}</div>}<div style={{padding:pad?(title?'0 16px 16px':16):0}}>{children}</div></div>;
export const KV=({rows})=><div style={{display:'grid',gridTemplateColumns:'150px 1fr',rowGap:12,fontSize:14.5}}>{rows.map(([k,v],i)=><React.Fragment key={i}><span className="hx-muted">{k}</span><span style={{fontWeight:500}}>{v}</span></React.Fragment>)}</div>;
export const Grid=({cols,heads,rows,widths,num=[]})=>{const t=widths||cols.map(()=>'1fr');const tpl=t.join(' ');return <div>
 <div className="hx-th" style={{gridTemplateColumns:tpl}}>{heads.map((h,i)=><span key={i} className={num.includes(i)?'hx-num':''}>{h}</span>)}</div>
 {rows.map((r,ri)=><div key={ri} className="hx-row"><div className={'hx-tr'+(r.total?' tot':'')} style={{gridTemplateColumns:tpl}}>{(r.cells||r).map((v,i)=><span key={i} className={num.includes(i)?'hx-num':''}>{v}</span>)}</div></div>)}</div>};
export const Field=({label,value,ph,w,icon,err,foc,hint})=><div style={{display:'flex',flexDirection:'column',gap:6,width:w}}><span className="hx-label">{label}</span><div className={'hx-in'+(ph&&!value?' ph':'')+(err?' err':'')+(foc?' foc':'')}>{icon&&<Ic n={icon}/>}{value||ph||' '}</div>{(err||hint)&&<span style={{fontSize:13,color:err?'var(--hx-red)':'var(--hx-ink-2)'}}>{err||hint}</span>}</div>;
/* Kpi: icon="Tên heroicon", tone 'b'|'g'|'o'|'r'|'n' (mặc định xanh), c = màu chữ số, d = chú thích */
const TONE={b:['#0B63C6','#E8F1FC'],g:['#12804A','#E6F5EC'],o:['#E8890C','#FFF3DC'],r:['#B4291F','#FDECEA'],n:['#5A6B82','#EEF1F5']};
export const Kpi=({l,v,c,d,icon,tone='b',lead})=>{const [a,bg]=TONE[tone]||TONE.b;return <div className={'hx-card hx-kpi'+(lead?' lead':'')} style={{'--kc':a,'--kb':bg,flex:lead?1.5:1}}><div className="top"><div className="hx-label">{l}</div>{icon&&<div className="tile" style={{background:bg,color:a}}><Ic n={icon}/></div>}</div><div className="v" style={{color:c||(lead?a:'var(--hx-ink)')}}>{v}</div>{d&&<div className="d">{d}</div>}</div>};
/* Tab dính nền trang: <Tabs items={['Tổng quan',['Dòng hàng',4],'Lịch sử']} active={0}/> */
export const Tabs=({items,active=0})=><div className="hx-tabs" role="tablist">{items.map((it,i)=>{const [t,n]=Array.isArray(it)?it:[it];return <span key={t} className={i===active?'on':''} role="tab" aria-selected={i===active}>{t}{n!=null&&<em>{n}</em>}</span>})}</div>;
export function DetailPage({group,page,sub,title,chips,actions,left,right,banner,tabs}){
 return <Shell group={group} page={page}><Title sub={sub} right={actions}>{title} {chips}</Title>
 {banner}{tabs}
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}><div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:16}}>{left}</div><div style={{width:340,flex:'none',display:'flex',flexDirection:'column',gap:16}}>{right}</div></div></Shell>;}
export function FormPage({group,page,sub,title,band,heads,rows,widths,num,side,actions,top}){
 return <Shell group={group} page={page}><Title sub={sub} right={actions}>{title}</Title>
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:16}}>{top}
   <div className="hx-card" style={{overflow:'hidden',boxShadow:'var(--sh-2)'}}><div style={{background:'linear-gradient(180deg,#1272DB,#0B63C6)',padding:'12px 16px',display:'flex',gap:12,alignItems:'center',boxShadow:'inset 0 1px 0 rgba(255,255,255,.18)'}}><div className="hx-in ph" style={{flex:1,minHeight:42,borderColor:'transparent'}}><Ic n="MagnifyingGlass"/><span style={{flex:1}}>{band||'Tìm hàng (F3) · mã, tên, thương hiệu'}</span><kbd className="hx-kbd">F3</kbd></div><span className="hx-btn" style={{height:42}}><Ic n="BuildingStorefront"/>Kho Đại Mỗ<Ic n="ChevronDown" s/></span></div>
    <Grid cols={heads} heads={heads} rows={rows} widths={widths} num={num}/></div></div>
  <div style={{width:340,flex:'none',display:'flex',flexDirection:'column',gap:16}}>{side}</div></div></Shell>;}
export function SettingsPage({group,page,sub,title,items,active,children}){
 return <Shell group={group} page={page}><Title sub={sub}>{title}</Title><div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div className="hx-side hx-card hx-pad" style={{gap:2,padding:8}}>{items.map((t,i)=><div key={t} className={'hx-radio'+(i===active?' on':'')} style={{margin:0,padding:'10px 12px',fontWeight:i===active?700:500}}><span>{t}</span></div>)}</div>
  <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:16}}>{children}</div></div></Shell>;}
export const Sw=({t,on,d})=><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20,padding:'14px 0',borderTop:'1px solid var(--hx-line)'}}><div><div style={{fontWeight:600}}>{t}</div>{d&&<div className="hx-sub" style={{fontSize:13.5}}>{d}</div>}</div><span style={{width:44,height:24,borderRadius:99,background:on?'linear-gradient(180deg,#1A78E0,#0B63C6)':'#C7D2DF',position:'relative',flex:'none',boxShadow:'inset 0 1px 2px rgba(16,34,58,.2)'}}><span style={{position:'absolute',top:2,[on?'right':'left']:2,width:20,height:20,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 3px rgba(16,34,58,.3)'}}/></span></div>;
export const Bars=({data,h=160})=><div style={{display:'flex',alignItems:'flex-end',gap:14,height:h,padding:'8px 4px'}}>{data.map(([a,b,l],i)=><div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:6}}><div style={{display:'flex',gap:4,alignItems:'flex-end',height:h-30}}><span style={{width:16,height:a,background:'linear-gradient(180deg,#169A5A,#12804A)',borderRadius:'4px 4px 2px 2px'}}/><span style={{width:16,height:b,background:'linear-gradient(180deg,#CC3A2E,#B4291F)',borderRadius:'4px 4px 2px 2px'}}/></div><span style={{fontSize:13,color:'var(--hx-ink-2)'}}>{l}</span></div>)}</div>;
const PI={'⌂':'Home','▤':'ClipboardDocumentList','₫':'Banknotes','☺':'UserCircle','✉':'Envelope','☰':'Bars3','⚑':'Flag','✓':'CheckCircle','⚙':'Cog6Tooth','☎':'Phone','⌕':'MagnifyingGlass'};
const pic=ic=>typeof ic==='string'&&PI[ic]?<Ic n={PI[ic]}/>:ic;
export function Phone({title,back,children,foot,nav,active=0,navItems}){
 const items=navItems||[['⌂','Trang chủ'],['▤','Đơn hàng'],['₫','Công nợ'],['☺','Tôi']];
 return <div style={{width:390,height:844,background:'var(--hx-bg)',display:'flex',flexDirection:'column',position:'relative',overflow:'hidden'}}>
  <div style={{background:'#fff',borderBottom:'1px solid var(--hx-line)',padding:'12px 16px',display:'flex',alignItems:'center',gap:12,boxShadow:'0 1px 3px rgba(16,34,58,.04)',minHeight:60}}>{back&&<span style={{display:'flex',color:'var(--hx-blue-t)'}}><Ic n="ChevronLeft" l/></span>}<b style={{fontSize:19,flex:1,letterSpacing:'-.01em'}}>{title}</b><span className="hx-iconbtn" style={{width:36,height:36}}><Ic n="Envelope"/></span><span style={{fontSize:13.5,fontWeight:600,border:'1px solid var(--hx-line-2)',borderRadius:10,padding:'6px 12px',background:'#fff'}}>Đăng xuất</span></div>
  <div style={{flex:1,overflow:'hidden',padding:16,display:'flex',flexDirection:'column',gap:12}}>{children}</div>
  {foot&&<div style={{padding:'10px 16px',background:'linear-gradient(180deg,rgba(242,245,249,0),var(--hx-bg) 30%)'}}>{foot}</div>}
  <div className="hx-phone-nav">{items.map(([ic,t],i)=><div key={t} className={i===active?'on':''} aria-current={i===active?'page':undefined}>{pic(ic)}{t}</div>)}</div></div>;}
export const BigBtn=({k='g',children})=><div style={{textAlign:'center',padding:'0 12px',height:54,display:'flex',alignItems:'center',justifyContent:'center',gap:8,borderRadius:14,background:k==='g'?'linear-gradient(180deg,#169A5A,#12804A)':k==='p'?'linear-gradient(180deg,#1A78E0,#0B63C6)':'#fff',border:k==='o'?'1.5px solid var(--hx-blue)':'0',color:k==='o'?'var(--hx-blue-t)':'#fff',fontWeight:700,fontSize:17,boxShadow:k==='o'?'var(--sh-1)':k==='g'?'0 6px 16px rgba(18,128,74,.28),inset 0 1px 0 rgba(255,255,255,.25)':'0 6px 16px rgba(11,99,198,.28),inset 0 1px 0 rgba(255,255,255,.22)'}}>{children}</div>;
export const Pc=({children,style})=><div className="hx-card hx-pad" style={{boxShadow:'var(--sh-2)',...style}}>{children}</div>;
export function Steps({n,labels}){return <div style={{display:'flex',alignItems:'center'}}>{labels.map((l,i)=><React.Fragment key={l}><div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,flex:'none',width:64}} aria-current={i===n?'step':undefined}><span style={{width:30,height:30,borderRadius:'50%',background:i<n?'#12804A':i===n?'#0B63C6':'#E3E9F1',color:i<=n?'#fff':'#5A6B82',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:14,boxShadow:i===n?'0 0 0 4px #DCEAF9':'none'}}>{i<n?<Ic n="Check" s style={{strokeWidth:3}}/>:i+1}</span><span style={{fontSize:13,fontWeight:600,textAlign:'center',color:i<=n?'var(--hx-ink)':'var(--hx-ink-2)'}}>{l}</span></div>{i<labels.length-1&&<span style={{flex:1,height:3,borderRadius:2,background:i<n?'#12804A':'#E3E9F1',marginBottom:20}}/>}</React.Fragment>)}</div>}
export function Auth({title,sub,children,w=420}){return <div style={{width:w+240,height:640,background:'radial-gradient(900px 400px at 20% 0%,#D5E7FB,transparent),linear-gradient(160deg,#E6F0FB,#F2F5F9)',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="hx-card" style={{width:w,padding:32,boxShadow:'var(--sh-3)',borderRadius:16}}><div style={{textAlign:'center'}}><div className="hx-logo" style={{justifyContent:'center',fontSize:26}}><i style={{width:44,height:44,borderRadius:12,fontSize:17}}>HX</i>Hiền Xa</div><div className="hx-muted" style={{margin:'8px 0 22px',fontSize:14.5}}>{title}</div></div><div style={{display:'flex',flexDirection:'column',gap:14}}>{children}</div>{sub&&<div style={{textAlign:'center',fontSize:13.5,color:'var(--hx-blue-t)',marginTop:16,fontWeight:600}}>{sub}</div>}</div></div>;}
