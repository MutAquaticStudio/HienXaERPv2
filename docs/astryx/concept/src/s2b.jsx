import React from 'react';
import {Button} from '@astryxdesign/core/Button';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Switch} from '@astryxdesign/core/Switch';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Stepper,Step} from '@astryxdesign/core/Stepper';
import {TabList,Tab} from '@astryxdesign/core/TabList';
import {SegmentedControl,SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import * as H from '@heroicons/react/24/outline';
import {Shell,Title,KV,Chip,Btn,DetailPage,SettingsPage,ListPage,money} from './lib.jsx';
import {M as M1} from './s1.jsx';

export const M=[]; const def=(id,route,tpl,note,C,w=1280)=>M.push({id,route,tpl,note,C,w});

/* ---------- bộ dựng cục bộ B2 ---------- */
const NO=()=>{};
const ic=(C,s=20,c)=><C width={s} height={s} style={{flex:'none',color:c}}/>;
const cd=t=><b className="hx-code">{t}</b>;
const pct=(a,b)=>{const v=(a/b-1)*100;return (v>=0?'+':'−')+Math.abs(v).toFixed(1).replace('.',',')+'%';};
const G='#12804A',R='#B4291F',B='#0B63C6',O='#E8890C',INK='#10223A',MUT='#5A6B82',LINE='#E3E9F1';
const Tone={g:{bg:'#E5F4EC',fg:'#0D5A33',bar:G},s:{bg:'#E5F4EC',fg:'#0D5A33',bar:G},r:{bg:'#FDEBE9',fg:'#8A1C13',bar:R},o:{bg:'#FFF1D6',fg:'#7A4300',bar:O},b:{bg:'#E6F0FB',fg:'#0A4A96',bar:B},n:{bg:'#ECEFF3',fg:'#46556A',bar:'#8493A8'}};
const sum=a=>a.reduce((x,y)=>x+y,0);
const vn=n=>n.toLocaleString('vi-VN');
const Seg=({items,value,size='md'})=><SegmentedControl label="Chọn" value={value} onChange={NO} size={size}>{items.map(t=><SegmentedControlItem key={t} value={t} label={t}/>)}</SegmentedControl>;
const Delta=({text,good=true})=><span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:13,fontWeight:700,padding:'2px 8px',borderRadius:999,background:good?Tone.g.bg:Tone.r.bg,color:good?Tone.g.fg:Tone.r.fg}}>{text}</span>;
const Stat=({icon,l,v,c,delta,good,sub,tone='b'})=><div className="hx-card" style={{flex:1,padding:'16px 18px',display:'flex',flexDirection:'column',gap:6,minWidth:0}}>
 <div style={{display:'flex',alignItems:'center',gap:8,color:MUT,fontSize:13.5,fontWeight:600}}><span style={{width:30,height:30,borderRadius:9,background:Tone[tone].bg,color:Tone[tone].fg,display:'flex',alignItems:'center',justifyContent:'center'}}>{icon}</span>{l}</div>
 <div style={{fontSize:25,fontWeight:800,color:c||INK,fontVariantNumeric:'tabular-nums',letterSpacing:'-.01em'}}>{v}</div>
 {(delta||sub)&&<div style={{display:'flex',alignItems:'center',gap:8,fontSize:13.5,color:MUT,flexWrap:'wrap'}}>{delta&&<Delta text={delta} good={good}/>}{sub}</div>}</div>;
const Tbl=({heads,widths,num=[],rows,total,pad='12px 16px'})=>{const t=widths.join(' ');const cell=(v,i)=><span key={i} className={num.includes(i)?'hx-num':''} style={{minWidth:0}}>{v}</span>;
 return <div><div className="hx-th" style={{gridTemplateColumns:t}}>{heads.map(cell)}</div>
 {rows.map((r,ri)=><div key={ri} className="hx-tr" style={{gridTemplateColumns:t,padding:pad,background:r.bg}}>{(r.cells||r).map(cell)}</div>)}
 {total&&<div className="hx-tr" style={{gridTemplateColumns:t,padding:pad,fontWeight:800,background:'#F1F4F8',borderTop:'2px solid #C7D2DF'}}>{total.map(cell)}</div>}</div>;};
const Sec=({icon,title,right,children,pad=true,style,tone})=><div className="hx-card" style={{overflow:'hidden',...style}}>
 <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 16px',borderBottom:`1px solid ${LINE}`,background:tone?Tone[tone].bg:'#fff'}}>{icon&&<span style={{color:tone?Tone[tone].fg:B,display:'flex'}}>{icon}</span>}<b style={{fontSize:17,flex:1}}>{title}</b>{right}</div>
 <div style={{padding:pad?16:0}}>{children}</div></div>;
/* khung ảnh bằng chứng: ô xám trung tính, có tên + giờ chụp */
const Photo=({cap})=><div style={{flex:1,borderRadius:10,overflow:'hidden',border:`1px solid ${LINE}`,background:'#fff'}}><div style={{height:96,background:'#EEF1F5',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,color:'#8493A8'}}>{ic(H.PhotoIcon,30)}<span style={{fontSize:13}}>Ảnh minh họa</span></div><div style={{padding:'8px 12px',fontSize:13.5,color:INK,fontWeight:600}}>{cap}</div></div>;
const Who=({n,sub,size=36})=><div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}><Avatar name={n} size={size}/><div style={{minWidth:0,lineHeight:1.3}}><div style={{fontWeight:600,fontSize:14.5}}>{n}</div>{sub&&<div style={{fontSize:13,color:MUT}}>{sub}</div>}</div></div>;
const Dot=({c,t})=><span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13.5,color:INK}}><span style={{width:10,height:10,borderRadius:'50%',background:c,boxShadow:`0 0 0 3px ${c}33`}}/>{t}</span>;
const Pill=({k='n',children})=><span className="hx-chip" style={{background:Tone[k].bg,color:Tone[k].fg}}>{children}</span>;
const In=({l,v,w,ph,num,pre,hint,post})=><div style={{display:'flex',flexDirection:'column',gap:6,width:w,flex:w?'none':1,minWidth:0}}><span className="hx-label">{l}</span><div className={'hx-in'+(ph?' ph':'')} style={{display:'flex',alignItems:'center',gap:8,justifyContent:num?'flex-end':'flex-start',textAlign:num?'right':'left',fontVariantNumeric:'tabular-nums'}}>{pre}<span style={{flex:num?'none':1}}>{v||ph}</span>{post}</div>{hint&&<span style={{fontSize:13.5,color:MUT}}>{hint}</span>}</div>;
/* thông báo nội tuyến chữ ≥14px */
const NT={b:{bg:'#E6F0FB',bd:'#B9D4F2',fg:'#0A4A96',I:H.InformationCircleIcon},o:{bg:'#FFF4DC',bd:'#F3D79B',fg:'#7A4300',I:H.ExclamationTriangleIcon},s:{bg:'#E5F4EC',bd:'#B5DCC5',fg:'#0D5A33',I:H.CheckCircleIcon},n:{bg:'#F1F4F8',bd:LINE,fg:'#46556A',I:H.InformationCircleIcon}};
const Note=({k='b',title,children,end})=>{const t=NT[k];return <div style={{display:'flex',gap:12,alignItems:'flex-start',padding:'12px 16px',borderRadius:12,background:t.bg,border:`1px solid ${t.bd}`}}><span style={{color:t.fg,marginTop:1}}>{ic(t.I,22)}</span><div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:15,color:t.fg}}>{title}</div>{children&&<div style={{fontSize:14.5,marginTop:2,color:INK,lineHeight:1.45}}>{children}</div>}</div>{end}</div>;};
const Check=({on,children})=><div style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:14.5}}><span style={{width:20,height:20,borderRadius:6,border:on?`2px solid ${B}`:'2px solid #C7D2DF',background:on?B:'#fff',display:'flex',alignItems:'center',justifyContent:'center',flex:'none',marginTop:1}}>{on&&<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.5l2.6 2.5L10 3.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span><span>{children}</span></div>;
const MoneyBox=({l,v,c=INK,hint})=><div style={{display:'flex',flexDirection:'column',gap:6}}><span className="hx-label">{l}</span><div style={{border:`2px solid ${B}`,borderRadius:10,padding:'10px 14px',fontSize:26,fontWeight:800,color:c,textAlign:'right',fontVariantNumeric:'tabular-nums',background:'#fff',boxShadow:'0 0 0 4px #DCEAF9'}}>{v}</div>{hint&&<span style={{fontSize:13.5,color:MUT}}>{hint}</span>}</div>;

/* biểu đồ cột Thu / Chi + đường */
function Chart({labels,a,b,line,w=720,h=250,ca=G,cb=R,cl=B,max,vals}){
 const pl=46,pr=12,pt=22,pb=32,iw=w-pl-pr,ih=h-pt-pb,mx=max||Math.ceil(Math.max(...a,...(b||[0]))/20)*20,y=v=>pt+ih-(v/mx)*ih,gw=iw/labels.length,bw=b?15:28;
 const ticks=[0,1,2,3,4].map(i=>mx/4*i);
 return <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{display:'block'}} role="img" aria-label="Biểu đồ">
  {ticks.map(t=><g key={t}><line x1={pl} x2={w-pr} y1={y(t)} y2={y(t)} stroke={t===0?'#C7D2DF':'#E3E9F1'} strokeDasharray={t===0?'0':'3 4'}/><text x={pl-8} y={y(t)+4} textAnchor="end" fontSize="13" fill={MUT}>{Math.round(t)}</text></g>)}
  {labels.map((l,i)=>{const cx=pl+gw*(i+.5);return <g key={i}>
   <rect x={b?cx-bw-1.5:cx-bw/2} y={y(a[i])} width={bw} height={ih+pt-y(a[i])} rx="3" fill={ca}/>
   {vals&&<text x={cx} y={y(a[i])-6} textAnchor="middle" fontSize="13" fontWeight="700" fill={INK}>{a[i].toFixed(1).replace('.',',')}</text>}
   {b&&<rect x={cx+1.5} y={y(b[i])} width={bw} height={ih+pt-y(b[i])} rx="3" fill={cb}/>}
   <text x={cx} y={h-10} textAnchor="middle" fontSize="13" fill={MUT}>{l}</text></g>})}
  {line&&<><polyline fill="none" stroke={cl} strokeWidth="2.5" strokeLinejoin="round" points={line.map((v,i)=>`${pl+gw*(i+.5)},${y(v)}`).join(' ')}/>{line.map((v,i)=><circle key={i} cx={pl+gw*(i+.5)} cy={y(v)} r="4.5" fill="#fff" stroke={cl} strokeWidth="2.5"/>)}</>}
 </svg>;}
const Legend=({items})=><div style={{display:'flex',gap:16,fontSize:13.5,color:MUT,flexWrap:'wrap'}}>{items.map(([c,t,line])=><span key={t} style={{display:'inline-flex',alignItems:'center',gap:6}}>{line?<span style={{width:16,height:0,borderTop:`3px solid ${c}`,borderRadius:2}}/>:<span style={{width:12,height:12,borderRadius:3,background:c}}/>}{t}</span>)}</div>;

/* ================= 1. TỔNG QUAN ================= */
const DAYS7=['14/11','15/11','16/11','17/11','18/11','19/11','20/11'];
const THU=[52,61,48,70,66,38,84],CHI=[31,44,36,41,52,22,47];
const LAI=THU.map((v,i)=>v-CHI[i]);
const tri=n=>money(n*1000000);
def('admin-dashboard','/admin','Analytics Dashboard + Incident Console','Cần xử lý hôm nay đặt trước số liệu; thu xanh lá, chi đỏ so với kỳ trước; nợ quá hạn 48,8 tr khớp Phải thu; chỉ đọc theo quyền dashboard.read.',()=>{
 const todo=[[H.UserGroupIcon,'o','Duyệt 2 đơn khách đặt','SO-0230 Anh Tuấn · 12.300.000 ₫ và 1 đơn khác'],[H.ClipboardDocumentCheckIcon,'b','Xác minh 2 phiếu giao','PG-0112, PG-0113 · xác minh xong mới ghi nợ'],[H.BanknotesIcon,'r','Nợ quá hạn 48.800.000 ₫','Anh Nam 18 ngày · Cô Hoa 9 ngày'],[H.ArrowPathIcon,'n','Lệnh cần kiểm tra lại','1 lệnh chưa rõ kết quả, xem ở Vận hành']];
 return <Shell group="Tổng quan" page="Tổng quan">
 <Title sub="Thứ Sáu, 20/11/2026 · Chi nhánh Hà Đông" right={<Seg items={['Hôm nay','7 ngày','Tháng này']} value="7 ngày"/>}>Tổng quan 7 ngày qua</Title>
 <div style={{marginBottom:16}}><Sec title="Cần xử lý hôm nay" icon={ic(H.ExclamationTriangleIcon,20)} tone="o" right={<span style={{fontSize:14,color:'#7A4300'}}>Không có phiếu giao kẹt</span>} pad={false}>
  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)'}}>{todo.map(([I,t,a,b],i)=><div key={i} style={{padding:'16px 18px',borderLeft:i?`1px solid ${LINE}`:0,display:'flex',flexDirection:'column',gap:10}}>
   <div style={{display:'flex',gap:12,alignItems:'center'}}><span style={{width:40,height:40,borderRadius:11,background:Tone[t].bg,color:Tone[t].fg,display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{ic(I,22)}</span><div style={{fontWeight:700,fontSize:15.5,lineHeight:1.3,color:t==='r'?R:INK}}>{a}</div></div>
   <div style={{fontSize:13.5,color:MUT,minHeight:38}}>{b}</div><div><Button variant="secondary" size="sm" label="Mở"/></div></div>)}</div></Sec></div>
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div style={{flex:1,minWidth:0}}><Sec title="Thu / Chi / Lợi nhuận" right={<Legend items={[[G,'Tổng thu'],[R,'Tổng chi'],[B,'Lợi nhuận',1]]}/>} pad={false}>
   <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',borderBottom:`1px solid ${LINE}`}}>{[['Tổng thu',tri(sum(THU)),G,pct(sum(THU),372)],['Tổng chi',tri(sum(CHI)),R,pct(sum(CHI),281)],['Lợi nhuận',tri(sum(LAI)),INK,pct(sum(LAI),91)]].map(([l,v,c,d],i)=><div key={l} style={{padding:'16px 20px',borderLeft:i?`1px solid ${LINE}`:0}}><div className="hx-label">{l}</div><div style={{fontSize:26,fontWeight:800,color:c,fontVariantNumeric:'tabular-nums',margin:'2px 0 6px'}}>{v}</div><div style={{display:'flex',gap:8,alignItems:'center',fontSize:13.5,color:MUT}}><Delta text={d}/>so với 7 ngày trước</div></div>)}</div>
   <div style={{padding:'12px 16px 16px'}}><div style={{fontSize:13.5,color:MUT,marginBottom:4}}>Đơn vị: triệu đồng · 14/11 đến 20/11/2026</div><Chart labels={DAYS7} a={THU} b={CHI} line={LAI} w={780} h={290}/></div></Sec></div>
  <div style={{width:380,display:'flex',flexDirection:'column',gap:16}}>
   <Sec title="Nợ quá hạn" right={<Pill k="r">2 khách</Pill>} pad={false}>
    {[['Anh Nam · Nam Từ Liêm','18 ngày','30.400.000 ₫'],['Cô Hoa · Hà Đông','9 ngày','18.400.000 ₫']].map(([n,d,v],i)=><div key={n} style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',borderTop:i?`1px solid ${LINE}`:0}}><div style={{flex:1}}><div style={{fontWeight:700}}>{n}</div><div style={{fontSize:13.5,color:MUT}}>Quá hạn {d}</div></div><b style={{color:R,fontVariantNumeric:'tabular-nums'}}>{v}</b></div>)}
    <div style={{display:'flex',justifyContent:'space-between',padding:'12px 16px',background:'#F1F4F8',borderTop:'2px solid #C7D2DF',fontWeight:800}}><span>Tổng quá hạn</span><span style={{color:R}}>48.800.000 ₫</span></div></Sec>
   <Sec title="Đơn và phiếu đang chạy" pad>
    <div style={{display:'flex',flexDirection:'column',gap:14,fontSize:14.5}}>
     {[['Đơn đã xác nhận, chờ giao','12',34],['Phiếu đang giao','5',14],['Phiếu chờ xác minh','2',6]].map(([l,n,p])=><div key={l}><div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span>{l}</span><b>{n}</b></div><ProgressBar label={l} isLabelHidden value={p*2.5} variant={l.includes('giao')&&!l.includes('chờ')?'accent':l.includes('xác minh')?'warning':'neutral'}/></div>)}</div></Sec></div></div></Shell>;});

/* ================= 2. BÁO CÁO ================= */
const RD=[['14/11',12,48200000,41000000],['15/11',15,61500000,52300000],['16/11',9,36800000,36800000],['17/11',17,70400000,55100000],['18/11',14,66200000,49000000],['19/11',6,24300000,24300000],['20/11',18,84100000,59200000]];
const RGROUPS=[[H.ClipboardDocumentCheckIcon,'Cuối ngày',3],[H.ChartBarIcon,'Bán hàng',5],[H.CubeIcon,'Hàng hóa',4],[H.UserGroupIcon,'Khách hàng',3],[H.BuildingStorefrontIcon,'Nhà cung cấp',3],[H.TruckIcon,'Giao hàng',3],[H.BanknotesIcon,'Tài chính',4],[H.TableCellsIcon,'Tài chính chi tiết',3]];
def('admin-reports','/admin/reports','Data Dashboard + Searchable Table','Một khung báo cáo chung (D57): chọn kỳ nhanh, thẻ so kỳ trước, bảng căn phải có dòng Tổng cộng, Xuất Excel và CSV đúng số.',()=>{
 const rev=sum(RD.map(r=>r[2])),od=sum(RD.map(r=>r[1])),paid=sum(RD.map(r=>r[3])),debt=rev-paid;
 return <Shell group="Tổng quan" page="Báo cáo">
 <Title sub="Tổng quan / Báo cáo" right={<><Button variant="secondary" label="Xuất CSV" icon={ic(H.DocumentArrowDownIcon,18)}/><Button variant="secondary" label="Xuất Excel" icon={ic(H.TableCellsIcon,18)}/></>}>Báo cáo</Title>
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div className="hx-side" style={{width:252}}><div className="hx-card" style={{padding:8}}>
   {RGROUPS.map(([I,t,n])=>{const on=t==='Bán hàng';return <div key={t}>
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:8,background:on?'#E6F0FB':'transparent',color:on?'#0A4A96':INK,fontWeight:on?700:500,fontSize:14.5}}>{ic(I,19,on?B:MUT)}<span style={{flex:1}}>{t}</span><span style={{fontSize:13.5,color:MUT}}>{n}</span></div>
    {on&&<div style={{padding:'2px 0 6px 40px',display:'flex',flexDirection:'column'}}>{['Theo ngày','Theo khách','Theo nhân viên','Đơn hủy và trả hàng','Theo nguồn hàng'].map((s,j)=><span key={s} style={{padding:'7px 10px',fontSize:14,fontWeight:j===0?700:500,color:j===0?B:INK,borderLeft:`2px solid ${j===0?B:LINE}`}}>{s}</span>)}</div>}</div>;})}
  </div></div>
  <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:16}}>
   <div className="hx-card" style={{padding:'14px 16px',display:'flex',alignItems:'flex-end',gap:12,flexWrap:'nowrap'}}>
    <div style={{display:'flex',flexDirection:'column',gap:6}}><span className="hx-label">Chọn nhanh kỳ</span><Seg items={['Hôm nay','Hôm qua','7 ngày','Tháng này','Tháng trước']} value="7 ngày"/></div>
    <span style={{flex:1}}/>
    <div style={{width:130}}><In l="Từ ngày" v="14/11/2026"/></div><div style={{width:130}}><In l="Đến ngày" v="20/11/2026"/></div>
    <Button variant="primary" size="lg" label="Xem báo cáo" width={150}/></div>
   <div style={{display:'flex',gap:16}}>
    <Stat tone="b" icon={ic(H.BanknotesIcon,18)} l="Doanh thu" v={money(rev)} delta={pct(rev,358900000)} good sub="so với kỳ trước"/>
    <Stat tone="b" icon={ic(H.DocumentTextIcon,18)} l="Số đơn" v={od} delta={pct(od,84)} good sub="so với kỳ trước"/>
    <Stat tone="b" icon={ic(H.ReceiptPercentIcon,18)} l="Giá trị TB mỗi đơn" v={money(Math.round(rev/od))} delta={pct(rev/od,358900000/84)} good sub="so với kỳ trước"/>
    <Stat tone="b" icon={ic(H.ClockIcon,18)} l="Chưa thu của đơn trong kỳ" v={money(debt)} delta={pct(debt,61000000)} good={false} sub="so với kỳ trước"/></div>
   <Sec title="Doanh thu theo ngày" right={<Legend items={[[B,'Doanh thu (triệu ₫)']]}/>}><Chart labels={RD.map(r=>r[0])} a={RD.map(r=>r[2]/1e6)} w={900} h={230} ca={B} max={100} vals/></Sec>
   <div className="hx-card" style={{overflow:'hidden'}}><Tbl heads={['Ngày','Số đơn','Doanh thu','Đã thu','Chưa thu','Tỷ lệ thu']} widths={['1.1fr','.8fr','1.4fr','1.4fr','1.4fr','1fr']} num={[1,2,3,4,5]}
    rows={RD.map(r=>[r[0]+'/2026',r[1],money(r[2]),money(r[3]),<span style={{fontWeight:r[2]-r[3]?700:400}}>{money(r[2]-r[3])}</span>,Math.round(r[3]/r[2]*100)+'%'])}
    total={['Tổng cộng',od,money(rev),money(paid),money(debt),Math.round(paid/rev*100)+'%']}/></div>
   <div style={{fontSize:13.5,color:MUT}}>Số liệu tính theo phiếu giao đã xác minh trong kỳ · Tổng phải thu hiện tại của mọi khách (101.600.000 ₫) xem ở Công nợ · Xuất Excel và CSV giữ đúng số, không làm tròn.</div>
  </div></div></Shell>;});

/* ================= 3. ĐIỀU PHỐI ================= */
const DCard=({code,who,items,meta,tone='n',action,warn,asg,hot})=><div className="hx-card" style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:8,borderLeft:`4px solid ${Tone[tone].bar}`,boxShadow:'0 1px 2px rgba(16,34,58,.05)'}}>
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>{cd(code)}<span style={{fontSize:13.5,color:hot?'#7A4300':MUT,fontWeight:hot?700:400,whiteSpace:'nowrap'}}>{meta}</span></div>
 <div style={{fontWeight:600,fontSize:14.5}}>{who}</div><div style={{fontSize:13.5,color:MUT,display:'flex',gap:6,alignItems:'flex-start'}}>{ic(H.CubeIcon,16)}<span>{items}</span></div>
 {asg&&<div style={{display:'flex',flexDirection:'column',gap:6,fontSize:13.5,paddingTop:2}}><Who n={asg[0]} size={36}/><span style={{alignSelf:'flex-start',background:'#F1F4F8',borderRadius:6,padding:'2px 8px',color:MUT,fontWeight:600,display:'inline-flex',gap:5,alignItems:'center'}}>{ic(H.TruckIcon,15)}{asg[1]}</span></div>}
 {warn}{action}</div>;
const KCol=({title,n,tone,children,hint,more})=><div style={{flex:1,minWidth:0,background:'#E9EEF5',borderRadius:14,padding:12,display:'flex',flexDirection:'column',gap:10}}>
 <div style={{display:'flex',alignItems:'center',gap:8,padding:'2px 4px'}}><span style={{width:10,height:10,borderRadius:'50%',background:Tone[tone].bar}}/><b style={{fontSize:15.5,flex:1}}>{title}</b><span style={{background:'#fff',borderRadius:999,padding:'1px 10px',fontWeight:700,fontSize:13.5}}>{n}</span></div>{hint&&<div style={{fontSize:13.5,color:MUT,padding:'0 4px'}}>{hint}</div>}{children}{more&&<div style={{textAlign:'center',fontSize:13.5,color:B,fontWeight:700,padding:'4px 0'}}>{more}</div>}</div>;
const Gan=<Button variant="secondary" size="sm" label="Gán nhanh" width="100%"/>;
def('admin-dispatch','/admin/dispatch','Kanban Board + Incident Console','Bốn cột Chờ phân giao đến Chờ xác minh; chỉ một nút chính Gán nhanh (kiểm tra trùng lịch); chưa xác minh thì chưa ghi công nợ; thấy vị trí thợ trong ca.',()=><Shell group="Giao hàng" page="Điều phối">
 <Title sub="Giao hàng / Điều phối" right={<><Button variant="secondary" label="Tài nguyên" icon={ic(H.TruckIcon,18)}/><Button variant="primary" label="Gán nhanh" icon={ic(H.BoltIcon,18)}/></>}>Điều phối</Title>
 <div style={{marginBottom:16}}><Note k="o" title="Ô tô mất tín hiệu vị trí 18 phút" end={<Button variant="secondary" size="sm" label="Xem lộ trình"/>}>Thợ Phạm Đức Anh đang làm PG-0116. Vị trí cuối lúc 10:06, hãy gọi xác nhận trước khi gán thêm việc.</Note></div>
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div style={{flex:1,minWidth:0,display:'flex',gap:12}}>
   <KCol title="Chờ phân giao" n={3} tone="o">
    <DCard code="PG-0120" who="Anh Tuấn · Cầu Giấy" items="15 bao xi măng PCB40" meta="Hẹn 12:00" hot tone="o" warn={<div style={{fontSize:13.5,color:'#7A4300',background:'#FFF1D6',borderRadius:8,padding:'6px 8px',fontWeight:600}}>Còn 1 giờ 36 phút</div>} action={Gan}/>
    <DCard code="PG-0121" who="Chú Bảy · Hoài Đức" items="5 m³ cát vàng" meta="Hẹn 15:30" tone="n" warn={<div style={{fontSize:13.5,color:'#7A4300',background:'#FFF1D6',borderRadius:8,padding:'6px 8px',fontWeight:600}}>Thiếu 3 m³ tại Kho Đại Mỗ</div>} action={Gan}/>
    <DCard code="PG-0123" who="Anh Hùng · Gia Lâm" items="30 cây thép phi 10" meta="Hẹn 21/11" tone="n" action={Gan}/></KCol>
   <KCol title="Đã phân giao" n={2} tone="b">
    <DCard code="PG-0118" who="Công ty XD Bảo Long" items="Xi măng, cát, gạch (3 dòng)" meta="Hẹn 14:30" tone="b" asg={['Trần Văn Minh','Xe cn nhỏ']}/>
    <DCard code="PG-0119" who="Chị Lan · Thanh Xuân" items="2 m³ đá 1x2" meta="Hẹn 16:00" tone="b" asg={['Ngô Văn Sơn','Xe cn to']}/></KCol>
   <KCol title="Đang giao" n={5} tone="b" more="Xem thêm 3 phiếu">
    <DCard code="PG-0116" who="Anh Nam · Nam Từ Liêm" items="Ô tô · 12 bao xi măng" meta="Đang chạy" tone="b" asg={['Phạm Đức Anh','Ô tô']} warn={<div style={{fontSize:13.5,color:'#46556A',background:'#ECEFF3',borderRadius:8,padding:'6px 8px',fontWeight:600}}>Mất tín hiệu 18 phút</div>}/>
    <DCard code="PG-0117" who="Anh Dũng · Hoàng Mai" items="3 m³ đá 1x2" meta="Tới nơi 10:20" tone="b" asg={['Lê Quang Huy','Xe điện']}/></KCol>
   <KCol title="Chờ xác minh" n={2} tone="n" hint="Chưa xác minh thì chưa ghi công nợ.">
    <DCard code="PG-0112" who="Công ty Minh Phát · Long Biên" items="Gạch, xi măng, cát (3 dòng)" meta="Xong 10:25" tone="n" action={<Button variant="secondary" size="sm" label="Mở để xác minh" width="100%"/>}/>
    <DCard code="PG-0113" who="Anh Phúc · Thanh Trì" items="10 bao xi măng" meta="Xong 09:40" tone="n" action={<Button variant="secondary" size="sm" label="Mở để xác minh" width="100%"/>}/></KCol></div>
  <div style={{width:262,flex:'none',display:'flex',flexDirection:'column',gap:16}}>
   <Sec title="Thợ trong ca" icon={ic(H.MapPinIcon,20)} pad={false}>
    {[['Trần Văn Minh','Phân giao PG-0118','Đang chia sẻ vị trí',G],['Lê Quang Huy','Đang giao PG-0117','Đang chia sẻ vị trí',G],['Phạm Đức Anh','Đang làm PG-0116','Mất tín hiệu 18 phút','#8493A8'],['Ngô Văn Sơn','Phân giao PG-0119','Đang chia sẻ vị trí',G]].map(([n,s,p,c],i)=><div key={n} style={{padding:'12px 16px',borderTop:i?`1px solid ${LINE}`:'0'}}><Who n={n} sub={s}/><div style={{marginTop:6,marginLeft:46}}><Dot c={c} t={p}/></div></div>)}</Sec>
   <Sec title="Chế độ điều phối" pad><div style={{fontSize:14,color:MUT,display:'flex',flexDirection:'column',gap:10}}><span><Pill k="b">Tự điều phối</Pill></span><span>Gán nhanh gồm người, xe và khung giờ, hoặc đơn vị vận chuyển ngoài; hệ thống kiểm tra trùng lịch trước khi lưu.</span><span>Thợ chính được điều phối khi không có người trực.</span></div></Sec></div></div></Shell>);

/* ================= 4. TÀI NGUYÊN ĐIỀU PHỐI ================= */
const On=({v=true})=><Switch label="Hoạt động" isLabelHidden value={v} onChange={NO}/>;
def('admin-dispatch-resources','/admin/dispatch/resources','Settings Panels','Xe chỉ cần tên, không cần biển số (D54); tài xế mặc định; chỉ người có quyền roles.manage được sửa.',()=><Shell group="Giao hàng" page="Điều phối">
 <Title sub="Giao hàng / Điều phối / Tài nguyên" right={<Button variant="primary" label="Thêm xe" icon={ic(H.PlusIcon,18)}/>}>Tài nguyên điều phối</Title>
 <div style={{marginBottom:16}}><Note title="Chỉ người có quyền Quản lý vai trò mới sửa được trang này">Điều phối viên chỉ chọn xe và tài xế khi gán phiếu giao.</Note></div>
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div style={{flex:1}} className="hx-card"><div style={{padding:'14px 16px',borderBottom:`1px solid ${LINE}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}><b style={{fontSize:17}}>Xe vận chuyển</b><span style={{fontSize:13.5,color:MUT}}>4 xe · Chi nhánh Hà Đông</span></div>
   <Tbl heads={['Tên xe','Tải trọng','Tài xế mặc định','Đang bận','Hoạt động']} widths={['1.2fr','.8fr','1.8fr','1.5fr','100px']} num={[1]}
    rows={[[<b>Xe cn nhỏ</b>,'1,5 tấn',<Who n="Trần Văn Minh"/>,<Pill k="b">Phân giao PG-0118</Pill>,<On/>],
     [<b>Xe điện</b>,'0,5 tấn',<Who n="Lê Quang Huy"/>,<Pill k="b">Đang giao PG-0117</Pill>,<On/>],
     [<b>Xe cn to</b>,'5 tấn',<Who n="Ngô Văn Sơn"/>,<Pill k="b">Phân giao PG-0119</Pill>,<On/>],
     [<b>Ô tô</b>,'8 tấn',<Who n="Phạm Đức Anh"/>,<Pill k="b">Đang giao PG-0116</Pill>,<On/>]]} pad="12px 16px"/>
   <div style={{padding:'14px 16px',borderTop:`1px solid ${LINE}`,background:'#F6F9FC',fontSize:14,color:MUT}}>Xe tắt hoạt động sẽ không hiện trong ô chọn xe khi Gán nhanh; phiếu đã gán vẫn giữ nguyên.</div></div>
  <div style={{width:340,display:'flex',flexDirection:'column',gap:16}}>
   <Sec title="Thêm hoặc sửa xe" pad><div style={{display:'flex',flexDirection:'column',gap:14}}>
    <In l="Tên xe (bắt buộc)" v="Xe điện 2" hint="Chỉ cần tên gọi, không cần biển số."/>
    <In l="Tải trọng (tấn)" v="3" num/>
    <In l="Tài xế mặc định" v="Chọn người" ph post={ic(H.ChevronRightIcon,16,MUT)}/><div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Button variant="ghost" label="Hủy"/><Button variant="secondary" label="Lưu xe"/></div></div></Sec>
   <Sec title="Gợi ý khi gán" pad><div style={{fontSize:14.5,color:MUT}}>Ô chọn xe hiện <b style={{color:INK}}>“Xe điện · chở 0,5 tấn · Rảnh”</b> hoặc <b style={{color:INK}}>“Đang giao PG-0117 đến 10:30”</b>.</div></Sec></div></div></Shell>);

/* ================= 5. PHIẾU GIAO ================= */
const DLIN=[['Gạch ống 4 lỗ','viên',3000,2950,1250],['Xi măng PCB40 (50 kg)','bao',40,40,95000],['Cát vàng','m³',2,2,600000]];
const recv=DLIN.reduce((s,r)=>s+r[3]*r[4],0);
const DeliverySteps=({n=3})=><div className="hx-card" style={{padding:'14px 24px 10px'}}><Stepper activeStep={n} label="Trạng thái phiếu giao">{['Chờ phân giao','Đã phân giao','Đang giao','Chờ xác minh','Đã xác minh'].map((l,i)=><Step key={l} step={i} label={l} description={n===0?(i===0?'Tạo 07:50':'—'):['08:00','08:05','08:15','10:25','—'][i]}/>)}</Stepper></div>;
const DeliveryBody=({pre})=>{const code=pre?'PG-0120':'PG-0112';
 const lines=pre?[['Xi măng PCB40 (50 kg)','bao',15,0,95000]]:DLIN;
 const tot=pre?15*95000:recv;
 return <DetailPage group="Giao hàng" page="Phiếu giao" sub={'Giao hàng / Phiếu giao / '+code} title={'Phiếu giao '+code} chips={pre?<Chip k="w">Chờ phân giao</Chip>:<Chip k="w">Chờ xác minh</Chip>}
 actions={pre?<><Button variant="secondary" label="Tách phiếu" icon={ic(H.ScissorsIcon,18)}/><Button variant="destructive" label="Hủy phiếu"/></>:<Button variant="secondary" label="In phiếu giao" icon={ic(H.PrinterIcon,18)}/>}
 left={<>
  <DeliverySteps n={pre?0:3}/>
  <Sec title="Nguồn hàng và giao nhận" icon={ic(H.HomeModernIcon,20)} right={<Pill k="b">Từ kho Đại Mỗ</Pill>}>
   <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px 32px'}}>
    <KV rows={[['Đơn bán',cd(pre?'SO-0230':'SO-0228')],['Khách hàng',pre?'Anh Tuấn · Cầu Giấy':'Công ty Minh Phát · Long Biên'],['Công trình',pre?'Số 7 phố Trần Thái Tông, Cầu Giấy':'Khu CT Thanh Xuân']]}/>
    <KV rows={[['Người giao',pre?<span style={{color:MUT}}>Chưa phân giao</span>:<Who n="Lê Quang Huy" size={36}/>],['Xe',pre?'Chưa chọn':'Xe điện · chở 0,5 tấn'],['Khung giờ',pre?'Hẹn 12:00, 20/11':'08:00 – 11:00, 20/11']]}/></div></Sec>
  <Sec title="Dòng giao" pad={false} right={<span style={{fontSize:13.5,color:MUT}}>Dòng giao chỉ thêm, không sửa số đã ghi</span>}>
   <Tbl heads={['Hàng','ĐVT','Cần giao','Khách nhận','Đơn giá','Thành tiền']} widths={['1.7fr','.55fr','.9fr','1fr','1fr','1.2fr']} num={[2,3,4,5]}
    rows={lines.map(r=>[<b>{r[0]}</b>,r[1],vn(r[2]),pre?'—':<b>{vn(r[3])}</b>,money(r[4]),money((pre?r[2]:r[3])*r[4])])}
    total={['Tổng cộng','','','','',money(tot)]}/>
   {!pre&&<div style={{padding:'12px 16px',borderTop:`1px solid ${LINE}`,fontSize:14,color:MUT,display:'flex',gap:8,alignItems:'center'}}>{ic(H.ExclamationTriangleIcon,18,R)}<span><b style={{color:R}}>Hao hụt khi giao: 50 viên gạch (62.500 ₫)</b> không tính vào công nợ khách, xử lý riêng ở hồ sơ hao hụt.</span></div>}</Sec>
  {!pre&&<Sec title="Mốc giao nhận" icon={ic(H.MapPinIcon,20)}>
   <div style={{display:'flex',gap:12}}>{[['Lên hàng','08:15 · Thủ kho Hải'],['Tới nơi','10:20 · GPS đúng công trình'],['Số lượng nhận','10:24 · khách xác nhận']].map(([t,s])=><div key={t} style={{flex:1,display:'flex',gap:10,padding:12,borderRadius:10,background:'#F6F9FC',border:`1px solid ${LINE}`}}><span style={{color:G}}>{ic(H.CheckCircleIcon,24)}</span><div><b>{t}</b><div style={{fontSize:13.5,color:MUT}}>{s}</div></div></div>)}</div></Sec>}
  {!pre&&<Sec title="Ảnh bằng chứng" icon={ic(H.CameraIcon,20)} right={<span style={{fontSize:13.5,color:MUT}}>3 ảnh · đơn bán, phiếu giao, đơn mua đều xem được</span>}><div style={{display:'flex',gap:12}}><Photo cap="Hàng trên xe · 08:14"/><Photo cap="Dỡ tại công trình · 10:22"/><Photo cap="Khách ký nhận · 10:24"/></div></Sec>}</>}
 right={pre?<Note title="Chưa lấy hàng lên xe">Phiếu còn hủy hoặc tách được. Giữ chỗ tồn: 15 bao xi măng PCB40.</Note>:<>
  <div className="hx-card" style={{padding:16,borderTop:`4px solid ${G}`}}>
   <div className="hx-label">Ghi công nợ phải thu khi xác minh</div>
   <div style={{fontSize:28,fontWeight:800,color:G,margin:'4px 0',fontVariantNumeric:'tabular-nums'}}>{money(recv)}</div>
   <div style={{fontSize:14,color:MUT,marginBottom:12}}>Theo số lượng khách nhận. Chưa xác minh thì chưa ghi nợ.</div>
   <Btn k="g">Xác minh và ghi công nợ</Btn></div>
  <Sec title="Hồ sơ xử lý" pad={false}>
   {[[H.TruckIcon,'Hàng còn trên xe','Không có','n'],[H.ArrowUturnLeftIcon,'Khách trả hàng','Không có','n'],[H.ExclamationTriangleIcon,'Hao hụt khi giao','50 viên gạch · không tính vào nợ khách','o']].map(([I,t,s,k],i)=><div key={t} style={{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',borderTop:i?`1px solid ${LINE}`:0}}><span style={{width:34,height:34,borderRadius:10,background:Tone[k].bg,color:Tone[k].fg,display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{ic(I,19)}</span><div style={{flex:1}}><div style={{fontWeight:600}}>{t}</div><div style={{fontSize:13.5,color:MUT}}>{s}</div></div>{ic(H.ChevronRightIcon,18,MUT)}</div>)}</Sec>
  <Note title="Sổ nợ chỉ ghi một lần">Xác minh lặp lại cùng lệnh không ghi hai lần.</Note></>}/>;};
def('admin-delivery-detail','/admin/deliveries/:id','Order Detail + Work Item Detail','Phiếu Chờ xác minh không còn Tách/Hủy; dòng giao có đơn giá, thành tiền; xác minh mới ghi công nợ phải thu; hồ sơ Hàng còn trên xe, Khách trả hàng, Hao hụt khi giao.',()=><DeliveryBody/>);

/* ================= 6. TÁCH PHIẾU ================= */
const SP=[['Xi măng PCB40 (50 kg)','bao',40,[12,8]],['Cát vàng','m³',6,[2,1]],['Gạch ống 4 lỗ','viên',3000,[1000,500]]];
const Num=({v})=><div className="hx-in hx-num" style={{padding:'8px 12px',background:'#fff',fontWeight:500}}>{vn(v)}</div>;
const SPW='1.6fr .55fr .75fr 1.1fr .9fr .9fr 1.4fr';
def('admin-delivery-split','/admin/deliveries/:id/split','Form Wizard','Chỉ phiếu Chờ phân giao hoặc đã phân giao việc chưa bắt đầu; tách 2–5 phiếu, tổng mỗi dòng đúng, Phiếu 1 giữ phần còn lại tự tính, mỗi phiếu mới có ngày và giờ giao (D46).',()=><Shell group="Giao hàng" page="Phiếu giao">
 <Title sub="Giao hàng / Phiếu giao / PG-0118 / Tách phiếu" right={<><Button variant="secondary" label="Quay lại phiếu"/><Button variant="primary" label="Tách thành 3 phiếu" icon={ic(H.ScissorsIcon,18)}/></>}>Tách phiếu giao PG-0118</Title>
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:16}}>
   <Note title="Tách là một giao dịch">Hoặc tất cả phiếu mới được tạo, hoặc không có gì thay đổi. Phiếu 1 tự giữ phần còn lại để tổng mỗi dòng luôn đúng.</Note>
   <Sec title="Chia số lượng cho từng phiếu" pad={false} right={<Button variant="secondary" size="sm" label="Thêm phiếu (tối đa 5)" icon={ic(H.PlusIcon,16)}/>}>
    <div className="hx-th" style={{gridTemplateColumns:SPW}}><span>Hàng</span><span>ĐVT</span><span className="hx-num">Tổng</span><span className="hx-num">Phiếu 1 · phần còn lại</span><span className="hx-num">Phiếu 2</span><span className="hx-num">Phiếu 3</span><span className="hx-num">Kiểm tra</span></div>
    {SP.map(([n,u,t,ex])=>{const p1=t-sum(ex);return <div key={n} className="hx-tr" style={{gridTemplateColumns:SPW,padding:'12px 16px'}}><b>{n}</b><span>{u}</span><span className="hx-num"><b>{vn(t)}</b></span><span className="hx-num" style={{fontWeight:800,fontSize:16}}>{vn(p1)}<div style={{fontSize:13,fontWeight:500,color:MUT}}>tự tính</div></span><Num v={ex[0]}/><Num v={ex[1]}/><span className="hx-num"><Pill k="s">Đủ {vn(t)} {u}</Pill></span></div>;})}
    <div style={{padding:'12px 16px',borderTop:`2px solid #C7D2DF`,background:'#F1F4F8',display:'flex',justifyContent:'space-between',fontWeight:700}}><span>Cả 3 dòng đều khớp tổng</span><span style={{color:G,display:'flex',alignItems:'center',gap:6}}>{ic(H.CheckCircleIcon,20)} Sẵn sàng tách</span></div></Sec>
   <Sec title="Ngày và giờ giao của từng phiếu" pad>
    <div style={{display:'flex',gap:14}}>{[['Phiếu 1','Giữ mã PG-0118','20/11/2026','14:30 – 17:00'],['Phiếu 2','Mã mới PG-0124','21/11/2026','08:00 – 11:00'],['Phiếu 3','Mã mới PG-0125','21/11/2026','14:00 – 16:00']].map(([a,b,d,g],i)=><div key={a} style={{flex:1,borderRadius:12,border:`1px solid ${LINE}`,padding:14,background:i===0?'#F3F8FE':'#fff',display:'flex',flexDirection:'column',gap:10}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><b style={{fontSize:16}}>{a}</b>{i===0&&<Pill k="b">Giữ phần còn lại</Pill>}</div><div style={{fontSize:14,color:B,fontWeight:700}}>{b}</div><In l="Ngày giao" v={d} pre={ic(H.CalendarDaysIcon,18,MUT)}/><In l="Khung giờ" v={g}/></div>)}</div></Sec></div>
  <div style={{width:340,display:'flex',flexDirection:'column',gap:16}}>
   <Sec title="Phiếu gốc" pad><KV rows={[['Mã phiếu',cd('PG-0118')],['Đơn bán',cd('SO-0231')],['Khách','Công ty XD Bảo Long'],['Trạng thái',<Chip k="i">Đã phân giao</Chip>],['Công việc','Chưa bắt đầu']]}/></Sec>
   <Sec title="Điều kiện tách" pad><div style={{display:'flex',flexDirection:'column',gap:10,fontSize:14.5}}>{['Phiếu ở Chờ phân giao hoặc Đã phân giao','Việc giao chưa bắt đầu','Từ 2 đến 5 phiếu sau khi tách','Không dòng nào âm hoặc dư'].map(t=><div key={t} style={{display:'flex',gap:8}}><span style={{color:G}}>{ic(H.CheckCircleIcon,20)}</span>{t}</div>)}</div></Sec></div></div></Shell>);

/* ================= 7. HỦY PHIẾU ================= */
def('admin-delivery-cancel','/admin/deliveries/:id/cancel','Dialog Wizard','Hủy phiếu có lý do khi chưa lấy hàng lên xe; giải phóng giữ chỗ tồn; hộp thoại phủ đúng phiếu PG-0120 ở nền mờ.',()=><div style={{position:'relative',width:1280,minHeight:820,overflow:'hidden'}}>
 <div style={{filter:'blur(1.5px)'}}><DeliveryBody pre/></div>
 <div style={{position:'absolute',inset:0,background:'rgba(16,34,58,.52)',display:'flex',justifyContent:'center',paddingTop:100}}>
  <div className="hx-card" style={{width:580,height:'fit-content',boxShadow:'0 24px 64px rgba(16,34,58,.35)',overflow:'hidden'}}>
   <div style={{padding:'18px 22px',display:'flex',gap:12,alignItems:'center',borderBottom:`1px solid ${LINE}`}}><span style={{width:40,height:40,borderRadius:12,background:Tone.r.bg,color:R,display:'flex',alignItems:'center',justifyContent:'center'}}>{ic(H.NoSymbolIcon,22)}</span><div style={{flex:1}}><b style={{fontSize:19}}>Hủy phiếu giao PG-0120?</b><div style={{fontSize:14,color:MUT}}>Anh Tuấn · Cầu Giấy · SO-0230 · 15 bao xi măng PCB40</div></div>{ic(H.XMarkIcon,22,MUT)}</div>
   <div style={{padding:22,display:'flex',flexDirection:'column',gap:14}}>
    <Note k="o" title="Chỉ hủy được khi chưa lấy hàng lên xe">Hủy sẽ giải phóng phần tồn đã giữ: 15 bao xi măng PCB40 trở lại Có thể bán.</Note>
    <div><div className="hx-label" style={{marginBottom:8}}>Lý do hủy (bắt buộc)</div><div style={{display:'flex',flexDirection:'column',gap:8}}>{[['Khách đổi lịch hoặc hủy đơn',1],['Nhập sai số lượng hoặc địa chỉ',0],['Tách lại thành phiếu khác',0],['Lý do khác',0]].map(([t,on])=><div key={t} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,border:`1.5px solid ${on?B:LINE}`,background:on?'#F3F8FE':'#fff',fontWeight:on?700:500}}><span style={{width:18,height:18,borderRadius:'50%',border:on?`6px solid ${B}`:'1.5px solid #C7D2DF',boxSizing:'border-box'}}/>{t}</div>)}</div></div>
    <In l="Ghi chú thêm" v="Khách báo dời sang cuối tuần, sẽ đặt lại sau."/></div>
   <div style={{padding:'14px 22px',background:'#F6F9FC',borderTop:`1px solid ${LINE}`,display:'flex',justifyContent:'flex-end',gap:10}}><Button variant="secondary" label="Giữ phiếu"/><Button variant="destructive" label="Hủy phiếu giao"/></div></div></div></div>);

/* ================= 8. LỘ TRÌNH ================= */
const MapMock=()=><svg viewBox="0 0 780 500" width="100%" style={{display:'block',borderRadius:12,background:'#EDEFE6'}} role="img" aria-label="Bản đồ giả lập">
 <rect width="780" height="500" fill="#EDEFE6"/>
 {[[100,10,90,40],[100,70,40,50],[210,10,60,50],[210,70,100,50],[290,160,60,40],[360,160,100,40],[500,10,70,50],[500,70,80,50],[590,10,90,110],[700,10,70,110],[100,160,90,50],[100,220,90,60],[210,160,60,60],[210,230,60,50],[290,210,170,60],[500,160,80,50],[500,220,80,50],[590,160,90,50],[700,160,70,50],[590,220,90,50],[700,220,70,50],[100,320,90,40],[210,320,60,40],[290,320,60,40],[360,320,100,30],[500,320,80,40],[590,320,90,40],[700,320,70,40]].map(([x,y,w,h],i)=><rect key={i} x={x} y={y} width={w} height={h} rx="4" fill={i%5===0?'#E3E6DA':'#E7E9E0'}/>)}
 <path d="M-10 400 C140 350 200 440 330 400 S560 320 790 370 L790 440 C560 400 470 470 330 470 S140 420 -10 460Z" fill="#CBE0F1"/>
 {[[310,170,420,230],[600,125,640,155]].map(([x,y,w,h],i)=><rect key={i} x={x} y={y} width={w-x} height={h-y} rx="16" fill="#D6E8CB"/>)}
 {[[0,140,780,140],[0,300,780,300],[200,0,200,500],[480,0,480,500],[690,0,690,500],[90,0,90,500]].map(([a,b,c,d],i)=><line key={i} x1={a} y1={b} x2={c} y2={d} stroke="#fff" strokeWidth={i<2?14:9}/>)}
 {[[0,60,300,140],[480,300,780,200],[200,300,90,500],[690,140,780,60]].map(([a,b,c,d],i)=><line key={i} x1={a} y1={b} x2={c} y2={d} stroke="#fff" strokeWidth="5"/>)}
 <path d="M0 80 L780 230" stroke="#F8E0A8" strokeWidth="14" fill="none"/>
 <text x="214" y="30" fontSize="13" fill="#5A6B82">Đường Quang Trung</text><text x="214" y="326" fontSize="13" fill="#5A6B82">Đường Lê Trọng Tấn</text><text x="500" y="468" fontSize="13" fill="#4C7FA8">Sông Nhuệ</text><text x="322" y="196" fontSize="13" fill="#5E8A4E">Công viên</text>
 <polyline points="90,300 200,300 200,140 480,140 480,300 690,300" fill="none" stroke="#fff" strokeWidth="11" strokeLinejoin="round"/>
 <polyline points="90,300 200,300 200,140 480,140 480,300 690,300" fill="none" stroke={B} strokeWidth="5" strokeLinejoin="round"/>
 {[[90,300,'K'],[200,140,'1'],[480,140,'2'],[480,300,'3'],[690,300,'4']].map(([x,y,t],i)=><g key={i}><circle cx={x} cy={y} r="15" fill={i===0?INK:B} stroke="#fff" strokeWidth="3"/><text x={x} y={y+5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff">{t}</text></g>)}
 {[[330,140,G,'Xe điện'],[150,300,G,'Xe cn nhỏ'],[580,300,'#8493A8','Ô tô']].map(([x,y,c,t],i)=><g key={i}><circle cx={x} cy={y} r="17" fill={c} opacity=".22"/><circle cx={x} cy={y} r="9" fill={c} stroke="#fff" strokeWidth="3"/><rect x={x+14} y={y-34} width={t.length*8+16} height="24" rx="8" fill="#fff" stroke="#E3E9F1"/><text x={x+22} y={y-17} fontSize="13" fontWeight="700" fill="#10223A">{t}</text></g>)}
 <g><rect x="728" y="14" width="38" height="76" rx="8" fill="#fff" stroke="#D5DCE6"/><line x1="728" y1="52" x2="766" y2="52" stroke="#D5DCE6"/><text x="747" y="40" textAnchor="middle" fontSize="20" fill={INK}>+</text><text x="747" y="78" textAnchor="middle" fontSize="22" fill={INK}>−</text></g>
 <g><line x1="20" y1="480" x2="100" y2="480" stroke={INK} strokeWidth="2"/><text x="108" y="485" fontSize="13" fill={INK}>500 m</text></g>
 <text x="770" y="490" textAnchor="end" fontSize="13" fill="#5A6B82">© OpenStreetMap</text>
</svg>;
def('admin-routes','/admin/routes','Searchable Table + bản đồ','Chỉ gợi ý thứ tự điểm giao (OSRM công cộng), tắt được; chấm xanh đang chia sẻ, xám mất tín hiệu; mỗi điểm có mã phiếu để mở.',()=><Shell group="Giao hàng" page="Lộ trình">
 <Title sub="Giao hàng / Lộ trình · Cập nhật 10:24" right={<Switch label="Gợi ý thứ tự điểm giao" value onChange={NO} labelPosition="start"/>}>Lộ trình</Title>
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:12}}>
   <div className="hx-card" style={{padding:10}}><MapMock/></div>
   <div style={{display:'flex',gap:20,fontSize:13.5,color:MUT,alignItems:'center',flexWrap:'wrap'}}><Dot c={G} t="Đang chia sẻ vị trí"/><Dot c="#8493A8" t="Mất tín hiệu"/><span style={{display:'inline-flex',gap:6,alignItems:'center'}}><span style={{width:22,height:4,background:B,borderRadius:2}}/>Thứ tự gợi ý</span><span>Chỉ là gợi ý, điều phối viên quyết định.</span></div></div>
  <div style={{width:360,display:'flex',flexDirection:'column',gap:16}}>
   <div className="hx-card" style={{padding:12}}><div className="hx-in ph" style={{display:'flex',gap:8,alignItems:'center'}}>{ic(H.MagnifyingGlassIcon,18)}Tìm xe hoặc thợ</div></div>
   <Sec title="Xe đang trong ca" pad={false} right={<Pill k="n">3 xe</Pill>}>
    {[['Xe điện','Lê Quang Huy','PG-0117 · tới nơi 10:20',G,'Cập nhật 10:23'],['Xe cn nhỏ','Trần Văn Minh','PG-0118 · đã phân giao, chờ xuất phát',G,'Cập nhật 10:24'],['Ô tô','Phạm Đức Anh','PG-0116 · đang chạy','#8493A8','Mất tín hiệu từ 10:06']].map(([x,n,s,c,u],i)=><div key={x} style={{display:'flex',gap:12,padding:'14px 16px',borderTop:i?`1px solid ${LINE}`:0,alignItems:'center',background:i===0?'#F3F8FE':'#fff'}}><span style={{width:12,height:12,borderRadius:'50%',background:c,boxShadow:`0 0 0 4px ${c}33`,flex:'none'}}/><div style={{flex:1,minWidth:0}}><b>{x}</b><div style={{fontSize:13.5,color:MUT}}>{n} · {s}</div><div style={{fontSize:13.5,color:c===G?'#0D5A33':MUT}}>{u}</div></div>{ic(H.ChevronRightIcon,18,MUT)}</div>)}</Sec>
   <Sec title="Thứ tự điểm giao gợi ý" pad>
    <div style={{display:'flex',flexDirection:'column',gap:12}}>{[['1','PG-0117','Anh Dũng · Hoàng Mai','2,4 km · 9 phút'],['2','PG-0116','Anh Nam · Nam Từ Liêm','5,1 km · 17 phút'],['3','PG-0118','Công ty XD Bảo Long','8,8 km · 29 phút'],['4','PG-0119','Chị Lan · Thanh Xuân','12,3 km · 41 phút']].map(([n,c,t,s])=><div key={n} style={{display:'flex',gap:12,alignItems:'center'}}><span style={{width:30,height:30,borderRadius:'50%',background:B,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,flex:'none'}}>{n}</span><div style={{flex:1}}><b style={{fontSize:14.5}}>{t}</b><div style={{fontSize:13.5,color:MUT}}>{s}</div></div>{cd(c)}</div>)}</div></Sec></div></div></Shell>);

/* ================= 9. CHI TIẾT PHẢI THU ================= */
const AR=[['SO-0194','03/10/2026','02/11/2026',18400000,18400000],['SO-0198','03/10/2026','02/11/2026',12000000,12000000]];
const arTotal=sum(AR.map(r=>r[3]));const COLLECT=31000000;
def('admin-receivable-detail','/admin/receivables/:id','Order Detail + Collapsible Table','Thu tiền: ô số tiền tự phân bổ khoản cũ nhất trước, Tự phân bổ lại khi sửa tay, phần dư phải tích ghi tiền ứng trước; Tiền mặt hoặc QR; mỗi lần thu có operationId.',()=><DetailPage group="Tài chính" page="Công nợ" sub="Tài chính / Công nợ / Phải thu / KH-0066" title="Anh Nam · Nam Từ Liêm" chips={<Chip k="e">Quá hạn 18 ngày</Chip>}
 actions={<Button variant="secondary" label="In đối chiếu công nợ" icon={ic(H.PrinterIcon,18)}/>}
 left={<>
  <div style={{display:'flex',gap:16}}>
   <Stat tone="b" icon={ic(H.BanknotesIcon,18)} l="Tổng còn nợ" v={money(arTotal)} sub="2 khoản đang mở"/>
   <Stat tone="r" icon={ic(H.ExclamationTriangleIcon,18)} l="Đã quá hạn" v={money(arTotal)} c={R} sub="Hạn 02/11/2026 · 18 ngày"/>
   <div className="hx-card" style={{flex:1,padding:'16px 18px',display:'flex',flexDirection:'column',gap:10}}><div className="hx-label">Hạn mức nợ: 50.000.000 ₫</div><div style={{fontSize:22,fontWeight:800}}>61% <span style={{fontSize:14,fontWeight:500,color:MUT}}>đã dùng</span></div><ProgressBar label="Đã dùng hạn mức" isLabelHidden value={61} variant="accent"/></div></div>
  <Sec title="Các khoản đang nợ" pad={false} right={<span style={{fontSize:13.5,color:MUT}}>Thu tiền phân bổ vào khoản cũ nhất trước</span>}>
   <Tbl heads={['Chứng từ','Ngày giao','Hạn trả','Còn nợ','Phân bổ lần này']} widths={['1.2fr','1fr','1.5fr','1.2fr','1.4fr']} num={[3,4]}
    rows={AR.map(r=>[cd(r[0]),r[1],<span style={{display:'flex',flexDirection:'column'}}><span>{r[2]}</span><span style={{fontSize:13.5,fontWeight:700,color:R}}>Quá hạn 18 ngày</span></span>,money(r[3]),<div className="hx-in hx-num" style={{padding:'8px 12px',borderColor:B,fontWeight:700}}>{money(r[4])}</div>])}
    total={['Tổng cộng','','',money(arTotal),money(arTotal)]}/></Sec>
  <Sec title="Lịch sử thu" pad={false}><Tbl heads={['Phiếu thu','Ngày','Hình thức','Phân bổ vào','Số tiền']} widths={['1.2fr','1fr','1.5fr','1.4fr','1.2fr']} num={[4]}
    rows={[[cd('PT-0201'),'25/10/2026',<Pill k="n">Tiền mặt</Pill>,'SO-0185','10.000.000 ₫'],[cd('PT-0196'),'12/10/2026',<Pill k="b">Chuyển khoản QR</Pill>,'SO-0178','20.000.000 ₫']]}/></Sec></>}
 right={<>
  <Sec title="Thu tiền" icon={ic(H.BanknotesIcon,20)} tone="g" pad><div style={{display:'flex',flexDirection:'column',gap:14}}>
   <MoneyBox l="Số tiền thu" v={money(COLLECT)} hint="Tự điền vào các khoản, cũ nhất trước."/>
   <div><Button variant="secondary" label="Tự phân bổ lại" icon={ic(H.ArrowPathIcon,18)}/></div>
   <div><div className="hx-label" style={{marginBottom:6}}>Hình thức thu</div><Seg items={['Tiền mặt','Chuyển khoản QR']} value="Tiền mặt"/></div>
   <In l="Thu vào quỹ" v="Quỹ tiền mặt · Hà Đông"/><In l="Ngày thu" v="20/11/2026" pre={ic(H.CalendarDaysIcon,18,MUT)}/>
   <div style={{borderTop:`1px solid ${LINE}`,paddingTop:12,display:'flex',flexDirection:'column',gap:8,fontSize:14.5}}>
    <div style={{display:'flex',justifyContent:'space-between'}}><span>Phân bổ vào 2 khoản</span><b>{money(arTotal)}</b></div>
    <div style={{display:'flex',justifyContent:'space-between',color:B}}><span>Phần dư chưa phân bổ</span><b>{money(COLLECT-arTotal)}</b></div>
    <div style={{padding:'10px 12px',borderRadius:10,border:`1.5px solid ${B}`,background:'#F3F8FE'}}><Check on>Ghi phần dư <b>{money(COLLECT-arTotal)}</b> là tiền ứng trước của khách <span style={{color:MUT}}>(bắt buộc tích khi có phần dư)</span></Check></div></div>
   <Btn k="g">{'Ghi phiếu thu '+money(COLLECT)}</Btn>
   <div style={{fontSize:13.5,color:MUT}}>Mỗi lần thu có mã lệnh riêng: bấm hai lần không ghi hai lần.</div></div></Sec>
  <Note title="Thanh toán QR của khách">Khi khách trả bằng QR, ngân hàng báo về (SePay) và hệ thống tự ghi phiếu thu.</Note></>}/>);

/* ================= 10. CHI TIẾT PHẢI TRẢ ================= */
const AP=[['PN-0199','PO-0087','05/11/2026','05/12/2026',60000000],['PN-0203','PO-0087','14/11/2026','14/12/2026',38100000]];
const apTotal=sum(AP.map(r=>r[4]));
def('admin-payable-detail','/admin/payables/:id','Order Detail + Collapsible Table','Khoản phải trả chỉ tính phần đơn mua đã nhận hàng (98,1 tr); chi trả có lý do và chứng từ; không sửa số đã ghi, chỉ đảo giao dịch có lý do.',()=><DetailPage group="Tài chính" page="Công nợ" sub="Tài chính / Công nợ / Phải trả / Thép Hòa Phát" title="Thép Hòa Phát" chips={<Chip k="w">Còn phải trả</Chip>}
 actions={<Button variant="secondary" label="Xem đơn mua PO-0087" icon={ic(H.DocumentTextIcon,18)}/>}
 left={<>
  <div style={{display:'flex',gap:16}}>
   <Stat tone="b" icon={ic(H.BanknotesIcon,18)} l="Tổng phải trả" v={money(apTotal)} sub="2 phiếu nhập đã nhận hàng"/>
   <Stat tone="n" icon={ic(H.ClockIcon,18)} l="Chưa nhận · chưa tính nợ" v="50.400.000 ₫" c={MUT} sub="Phần còn lại của PO-0087"/></div>
  <Sec title="Các khoản phải trả" pad={false} right={<Pill k="o">Nhận một phần</Pill>}><Tbl heads={['Phiếu nhập','Đơn mua','Ngày nhận','Hạn trả','Còn phải trả']} widths={['1.1fr','1fr','1.2fr','1.2fr','1.3fr']} num={[4]}
   rows={AP.map(r=>[cd(r[0]),cd(r[1]),r[2],r[3],money(r[4])])} total={['Tổng cộng','','','',money(apTotal)]}/></Sec>
  <Sec title="Lịch sử chi" pad={false} right={<span style={{fontSize:13.5,color:MUT}}>Chỉ thêm, sai thì đảo giao dịch có lý do</span>}><Tbl heads={['Phiếu chi','Ngày','Hình thức','Lý do / ghi chú','Số tiền']} widths={['1.1fr','1fr','1.1fr','2fr','1.2fr']} num={[4]}
   rows={[{bg:'#F7F9FC',cells:[<span style={{color:MUT,textDecoration:'line-through'}}>PC-0087</span>,'02/11/2026',<Pill k="r">Đã đảo</Pill>,<span style={{color:MUT}}>Đảo bởi PC-0088: chi nhầm nhà cung cấp</span>,<span style={{color:MUT,textDecoration:'line-through'}}>5.000.000 ₫</span>]}]}/>
   <div style={{padding:'12px 16px',borderTop:`1px solid ${LINE}`,fontSize:13.5,color:MUT}}>Chưa có khoản chi hiệu lực cho các phiếu nhập này.</div></Sec></>}
 right={<Sec title="Chi trả nhà cung cấp" icon={ic(H.WalletIcon,20)} tone="g" pad><div style={{display:'flex',flexDirection:'column',gap:14}}>
   <MoneyBox l="Số tiền chi" v="60.000.000 ₫" hint="Mặc định là số còn phải trả của khoản cũ nhất (PN-0199)."/>
   <div><div className="hx-label" style={{marginBottom:6}}>Phương thức</div><Seg items={['Tiền mặt','Chuyển khoản']} value="Chuyển khoản"/></div>
   <In l="Chi từ quỹ" v="Quỹ Ngân hàng"/><In l="Ngày chi" v="20/11/2026" pre={ic(H.CalendarDaysIcon,18,MUT)}/>
   <In l="Số tham chiếu chứng từ" v="UNC-1120-014"/><In l="Lý do chi (bắt buộc)" v="Trả phiếu nhập PN-0199"/>
   <div style={{border:`1.5px dashed #C7D2DF`,borderRadius:10,padding:14,textAlign:'center',color:MUT,fontSize:14,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>{ic(H.PhotoIcon,26)}Đính kèm ảnh chứng từ chuyển khoản</div>
   <Btn k="g">Ghi phiếu chi</Btn></div></Sec>}/>);

/* ================= 11. SỔ QUỸ ================= */
const CBR=[['20/11 10:42','PT-0215','Anh Dũng · SO-0226 · QR (SePay)',30760000,0],['20/11 09:15','PC-0098','Trả NCC Xi măng Hoàng Thạch · PN-0190',0,18400000],['19/11 16:30','PT-0214','Cô Hoa · SO-0229 · trả trước',8750000,0],['19/11 14:05','PC-0097','Phí vận chuyển ô tô',0,1500000],['18/11 16:40','PT-0213','Công ty XD Bảo Long · chuyển khoản (SePay)',30000000,0]];
let _b=412900000;const CB=CBR.map(r=>{const o={r,b:_b};_b=_b-r[3]+r[4];return o;});
const PageBtns=()=><div style={{display:'flex',alignItems:'center',gap:8}}><Button variant="secondary" size="sm" label="Trước" isDisabled/><span style={{fontSize:13.5,color:MUT}}>Trang 1 / 7</span><Button variant="secondary" size="sm" label="Sau"/></div>;
def('admin-cashbook','/admin/cashbook','Filterable Table + Data Dashboard','Tổng thu xanh lá, Tổng chi đỏ theo kỳ là chính, số dư theo quỹ là phụ; giao dịch ngân hàng chờ xử lý (SePay); thông tin chuyển khoản hiện cho khách; sổ chỉ thêm, sai thì đảo.',()=><Shell group="Tài chính" page="Sổ quỹ">
 <Title sub="Tài chính / Sổ quỹ" right={<><Button variant="secondary" label="Lập phiếu chi" icon={ic(H.WalletIcon,18)}/><Btn k="g">+ Lập phiếu thu</Btn></>}>Sổ quỹ</Title>
 <div style={{display:'flex',gap:16,marginBottom:16}}>
  <Stat tone="g" icon={ic(H.ArrowTrendingUpIcon,18)} l="Tổng thu · 7 ngày" v="186.400.000 ₫" c={G} delta="+8,2%" good sub="so với kỳ trước · 23 phiếu"/>
  <Stat tone="r" icon={ic(H.ArrowTrendingDownIcon,18)} l="Tổng chi · 7 ngày" v="74.250.000 ₫" c={R} delta="−3,1%" good sub="so với kỳ trước · 11 phiếu"/>
  <div className="hx-card" style={{flex:1.2,padding:'14px 18px',display:'flex',flexDirection:'column',gap:8}}><div className="hx-label">Số dư theo quỹ</div>
   {[['Quỹ tiền mặt','128.450.000 ₫',0],['Quỹ Ngân hàng','412.900.000 ₫',1]].map(([t,v,on])=><div key={t} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',borderRadius:8,background:on?'#E6F0FB':'#F6F9FC',border:on?`1.5px solid ${B}`:`1px solid ${LINE}`,fontSize:14.5}}><span style={{fontWeight:on?700:500}}>{t}{on?' · đang xem':''}</span><b style={{fontVariantNumeric:'tabular-nums'}}>{v}</b></div>)}</div></div>
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:16}}>
   <Sec title="Giao dịch ngân hàng chờ xử lý" tone="o" icon={ic(H.InboxArrowDownIcon,20)} right={<Pill k="o">2 giao dịch</Pill>} pad={false}>
    <Tbl heads={['Thời gian','Nội dung chuyển khoản','Số tiền','Lý do đang chờ','']} widths={['1.2fr','1.7fr','1.1fr','1.9fr','90px']} num={[2]}
     rows={[[<span>19/11 09:12<div style={{fontSize:13.5,color:MUT}}>NH Minh họa · FT26323012</div></span>,'NGUYEN VAN A TT SO0231',<b style={{color:G}}>12.000.000 ₫</b>,'Tên người chuyển không khớp khách của đơn',<Button variant="secondary" size="sm" label="Xử lý"/>],[<span>19/11 07:55<div style={{fontSize:13.5,color:MUT}}>NH Minh họa · FT26323004</div></span>,'CTY MINH PHAT TT SO0228',<b style={{color:G}}>50.000.000 ₫</b>,'Số tiền lớn hơn số còn nợ',<Button variant="secondary" size="sm" label="Xử lý"/>]]} pad="12px 16px"/></Sec>
   <Sec title="Sổ giao dịch · Quỹ Ngân hàng" pad={false} right={<Seg items={['Hôm nay','7 ngày','Tháng này']} value="7 ngày"/>}>
    <Tbl heads={['Thời gian','Chứng từ','Nội dung','Thu','Chi','Số dư']} widths={['1fr','.9fr','2.2fr','1.1fr','1.1fr','1.2fr']} num={[3,4,5]}
     rows={CB.map(({r,b})=>[r[0],cd(r[1]),r[2],r[3]?<b style={{color:G}}>{money(r[3])}</b>:'',r[4]?<b style={{color:R}}>{money(r[4])}</b>:'',money(b)])}/>
    <div style={{padding:'12px 16px',borderTop:`1px solid ${LINE}`,fontSize:13.5,color:MUT,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span>Hiển thị 5 / 34 giao dịch · sổ chỉ thêm, sai thì đảo giao dịch có lý do</span><PageBtns/></div></Sec></div>
  <div style={{width:340,display:'flex',flexDirection:'column',gap:16}}>
   <Sec title="Thông tin chuyển khoản" icon={ic(H.QrCodeIcon,20)} pad>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}><Pill k="b">Đang hiện cho khách</Pill><Pill k="b">Tự ghi tiền về (SePay)</Pill></div>
    <KV rows={[['Ngân hàng','Ngân hàng TMCP Minh Họa'],['Số tài khoản',<b style={{fontSize:17,letterSpacing:'.02em'}}>0123 456 789</b>],['Chủ tài khoản','CÔNG TY TNHH VẬT LIỆU HIỀN XA']]}/>
    <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:16}}><Button variant="secondary" label="Sửa thông tin chuyển khoản" width="100%"/><Button variant="secondary" label="Cài đặt tự ghi tiền về" width="100%"/></div></Sec>
   <Note title="Khách chọn thanh toán bằng QR">Nội dung chuyển khoản mang mã đơn để tự khớp; khớp sai thì giữ ở hàng chờ, không tự ghi.</Note></div></div></Shell>);

/* ================= 12. HÓA ĐƠN BÁN ================= */
const IV=[['Thép phi 10 (cây 11,7 m)','cây',100,215000],['Xi măng PCB40 (50 kg)','bao',60,95000],['Đá 1x2','m³',4,890000]];
const ivTotal=IV.reduce((s,r)=>s+r[2]*r[3],0);
def('admin-invoice-detail','/admin/invoices/:id','Filterable Table + Order Detail','Chỉ xem và in; số tiền lấy từ phiếu giao đã xác minh, không nhập lại.',()=><DetailPage group="Tài chính" page="Công nợ" sub="Tài chính / Hóa đơn bán / HD-0087" title="Hóa đơn bán HD-0087" chips={<Chip k="s">Đã giao · đã xác minh</Chip>}
 actions={<><Button variant="secondary" label="In K80" icon={ic(H.PrinterIcon,18)}/><Button variant="primary" label="In A4" icon={ic(H.PrinterIcon,18)}/></>}
 left={<div className="hx-card" style={{padding:'32px 36px',display:'flex',flexDirection:'column',gap:20,boxShadow:'0 8px 30px rgba(16,34,58,.08)'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{fontSize:22,fontWeight:800,color:B}}>Hiền Xa</div><div style={{fontSize:14,color:MUT}}>Vật liệu xây dựng · Chi nhánh Hà Đông</div></div><div style={{textAlign:'right'}}><div style={{fontSize:20,fontWeight:800,letterSpacing:'.04em'}}>HÓA ĐƠN BÁN</div><div style={{color:MUT,fontSize:14}}>Số {cd('HD-0087')} · Ngày 19/11/2026</div></div></div>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24,padding:'14px 0',borderTop:`1px solid ${LINE}`,borderBottom:`1px solid ${LINE}`}}><KV rows={[['Khách hàng','Anh Dũng · Hoàng Mai'],['Công trình','Số 22 ngõ 118, Hoàng Mai']]}/><KV rows={[['Đơn bán',cd('SO-0226')],['Phiếu giao',cd('PG-0110')]]}/></div>
  <Tbl heads={['Mặt hàng','ĐVT','Số lượng','Đơn giá','Thành tiền']} widths={['2.2fr','.6fr','1fr','1.2fr','1.4fr']} num={[2,3,4]} rows={IV.map(r=>[<b>{r[0]}</b>,r[1],vn(r[2]),money(r[3]),money(r[2]*r[3])])} total={['Tổng cộng','','','',money(ivTotal)]}/>
  <div style={{fontSize:13.5,color:MUT}}>Số lượng và thành tiền lấy từ phiếu giao đã xác minh lúc 19/11/2026 16:20.</div></div>}
 right={<>
  <Sec title="Tình trạng thanh toán" pad><div style={{fontSize:26,fontWeight:800,fontVariantNumeric:'tabular-nums'}}>{money(ivTotal)}</div><div style={{margin:'6px 0 12px',display:'flex',gap:8}}><Pill k="s">Đã thu đủ</Pill></div><ProgressBar label="Đã thu" isLabelHidden value={100} variant="success"/><div style={{fontSize:13.5,color:MUT,marginTop:8}}>Phiếu thu PT-0215 · 20/11/2026 · QR (SePay)</div></Sec>
  <Sec title="Chứng từ liên quan" pad={false}>{[[H.DocumentTextIcon,'Đơn bán SO-0226','Hoàn tất'],[H.TruckIcon,'Phiếu giao PG-0110','Đã xác minh'],[H.BanknotesIcon,'Phiếu thu PT-0215','QR (SePay)']].map(([I,t,s],i)=><div key={t} style={{display:'flex',gap:12,alignItems:'center',padding:'12px 16px',borderTop:i?`1px solid ${LINE}`:0}}>{ic(I,20,B)}<div style={{flex:1}}><b>{t}</b><div style={{fontSize:13.5,color:MUT}}>{s}</div></div>{ic(H.ChevronRightIcon,18,MUT)}</div>)}</Sec>
  <Note title="Chỉ xem và in">Muốn đổi số tiền, hãy xử lý ở phiếu giao; hóa đơn không nhập lại.</Note></>}/>);

/* ================= 13. CHI TIẾT KỲ LƯƠNG (D35, D70, D76) ================= */
const mk=(name,role,fixed,tn,tamt,tlab,wamt,wlab,comm=0,adj=0,note='')=>({name,role,fixed,tn,tamt,tlab,wamt,wlab,comm,adj,note});
const PR=[mk('Trần Văn Minh','Thợ chính',8000000,12,600000,'Xe cn nhỏ',600000,'Cẩu hàng · 5 việc'),mk('Lê Quang Huy','Tài xế',0,21,1680000,'Xe cn to',0,''),mk('Phạm Đức Anh','Thợ',0,0,0,'',2750000,'Hàng đã giao + 3 việc'),mk('Nguyễn Thị Lan','Kế toán',10000000,0,0,'',0,''),mk('Đỗ Văn Hải','Bán hàng',6000000,0,0,'',0,'',3480000,-200000,'Trừ tạm ứng 10/11'),mk('7 nhân sự khác','Xem từng người',102070000,63,3010000,'Điện · cn nhỏ · cn to',1080000,'Hàng đã giao + việc',3730000)];
const prT=r=>r.fixed+r.tamt+r.wamt+r.comm+r.adj;const prSum=sum(PR.map(prT));
const TRIPS=[['Xe điện',29,40000],['Xe cn nhỏ',41,50000],['Xe cn to',26,80000],['Ô tô',6,0]];
const tripAmt=sum(TRIPS.map(t=>t[1]*t[2])); // 5.290.000, khớp tổng tiền chuyến ở bảng lương
const PayLine=({t,s,v})=><div style={{display:'flex',justifyContent:'space-between',gap:12,padding:'7px 0',fontSize:14.5,borderTop:`1px solid ${LINE}`}}><span>{t}{s&&<span style={{color:MUT,fontSize:13.5}}> · {s}</span>}</span><b style={{fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{v}</b></div>;
def('admin-payroll-detail','/admin/payroll/:id','Order Detail + Collapsible Table','Phiếu lương: tiền chuyến theo xe (D70), khoản theo đơn giá công việc (D76) và mục Chưa có đơn giá, chưa tính tiền; chốt kỳ mới ghi sổ, kỳ đã chốt không sửa.',()=><Shell group="Nhân công" page="Bảng lương">
 <Title sub="Nhân công / Bảng lương / Kỳ 11/2026" right={<><Button variant="secondary" label="Thu nhập khác" icon={ic(H.Cog6ToothIcon,18)}/><Button variant="secondary" label="Tính lương tháng" icon={ic(H.ArrowPathIcon,18)}/><Button variant="primary" label="Chốt kỳ lương"/></>}>Bảng lương tháng 11/2026 <Chip k="w">Đang tính</Chip></Title>
 <div style={{display:'flex',gap:16,marginBottom:16}}>
  <Stat tone="b" icon={ic(H.WalletIcon,18)} l="Tổng quỹ lương tạm tính" v={money(prSum)} sub="12 nhân sự"/>
  <Stat tone="b" icon={ic(H.TruckIcon,18)} l="Tiền chuyến theo xe" v={money(sum(PR.map(r=>r.tamt)))} sub={sum(PR.map(r=>r.tn))+' chuyến có đơn giá'}/>
  <Stat tone="b" icon={ic(H.WrenchScrewdriverIcon,18)} l="Theo đơn giá công việc" v={money(sum(PR.map(r=>r.wamt)))} sub="hàng đã giao và việc dịch vụ"/>
  <Stat tone="b" icon={ic(H.ReceiptPercentIcon,18)} l="Hoa hồng theo bậc" v={money(sum(PR.map(r=>r.comm)))} sub="% doanh thu"/></div>
 <div className="hx-card" style={{overflow:'hidden'}}>
  <Tbl heads={['Nhân sự','Lương cố định','Tiền chuyến theo xe','Theo đơn giá công việc','Hoa hồng','Điều chỉnh','Tổng phải trả']} widths={['1.8fr','1.1fr','1.3fr','1.4fr','1fr','1.1fr','1.2fr']} num={[1,2,3,4,5,6]}
   rows={PR.map((r,i)=>({bg:i===0||i===2?'#F3F8FE':undefined,cells:[i===5?<div style={{display:'flex',alignItems:'center',gap:10}}><span style={{width:36,height:36,borderRadius:'50%',background:'#ECEFF3',color:MUT,display:'flex',alignItems:'center',justifyContent:'center'}}>{ic(H.UserGroupIcon,20)}</span><div><b>{r.name}</b><div style={{fontSize:13,color:MUT}}>{r.role}</div></div></div>:<Who n={r.name} sub={r.role}/>,r.fixed?money(r.fixed):<span style={{color:MUT}}>0 ₫</span>,r.tamt?<span>{money(r.tamt)}<div style={{fontSize:13,color:MUT}}>{r.tn} chuyến · {r.tlab}</div></span>:'—',r.wamt?<span>{money(r.wamt)}<div style={{fontSize:13,color:MUT}}>{r.wlab}</div></span>:'—',r.comm?<span style={{color:G,fontWeight:700}}>{money(r.comm)}</span>:'—',r.adj?<span style={{color:R,fontWeight:700}}>{money(r.adj)}<div style={{fontSize:13,fontWeight:500,color:MUT}}>{r.note}</div></span>:'—',<b>{money(prT(r))}</b>]}))}
   total={['Tổng cộng',money(sum(PR.map(r=>r.fixed))),money(sum(PR.map(r=>r.tamt))),money(sum(PR.map(r=>r.wamt))),money(sum(PR.map(r=>r.comm))),money(sum(PR.map(r=>r.adj))),money(prSum)]} pad="12px 16px"/></div>
 <div style={{display:'flex',gap:16,marginTop:16,alignItems:'flex-start'}}>
  <div className="hx-card" style={{flex:1,padding:'14px 18px'}}><b style={{color:B,fontSize:16}}>Phiếu lương Trần Văn Minh</b>
   <PayLine t="Lương cố định" v="8.000.000 ₫"/><PayLine t="Tiền chuyến" s="Xe cn nhỏ · 12 chuyến × 50.000 ₫" v="600.000 ₫"/><PayLine t="Theo đơn giá công việc" s="Cẩu hàng · 5 việc × 120.000 ₫" v="600.000 ₫"/>
   <div style={{display:'flex',justifyContent:'space-between',padding:'9px 0 0',borderTop:'2px solid #C7D2DF',fontWeight:800,fontSize:15.5}}><span>Cộng</span><span>{money(prT(PR[0]))}</span></div></div>
  <div className="hx-card" style={{flex:1.15,padding:'14px 18px'}}><b style={{color:B,fontSize:16}}>Phiếu lương Phạm Đức Anh · theo đơn giá công việc</b>
   <PayLine t="Xi măng PCB40" s="600 bao × 1.500 ₫" v="900.000 ₫"/><PayLine t="Gạch ống 4 lỗ" s="8.000 viên × 100 ₫" v="800.000 ₫"/><PayLine t="Cát vàng" s="12 m³ × 25.000 ₫" v="300.000 ₫"/><PayLine t="Thép phi 10" s="150 cây × 1.000 ₫" v="150.000 ₫"/><PayLine t="Máy trộn bê tông" s="3 việc · 15% × 4.000.000 ₫" v="600.000 ₫"/>
   <div style={{display:'flex',justifyContent:'space-between',padding:'9px 0 0',borderTop:'2px solid #C7D2DF',fontWeight:800,fontSize:15.5}}><span>Cộng</span><span>{money(prT(PR[2]))}</span></div></div>
  <div style={{width:330,display:'flex',flexDirection:'column',gap:12}}>
   <Note k="o" title="Chưa có đơn giá, chưa tính tiền">Các mục dưới đây không bị đoán số. Bổ sung đơn giá rồi bấm Tính lương tháng để tính lại.</Note>
   <div className="hx-card" style={{padding:'6px 16px 12px'}}>{[['Thép phi 16','12 cây đã giao'],['Vận chuyển cát','2 việc dịch vụ'],['Ô tô','6 chuyến, xe chưa có đơn giá chuyến']].map(([t,s],i)=><div key={t} style={{padding:'9px 0',borderTop:i?`1px solid ${LINE}`:0}}><b style={{fontSize:14.5}}>{t}</b><div style={{fontSize:13.5,color:MUT}}>{s}</div></div>)}
    <Button variant="secondary" size="sm" label="Bổ sung đơn giá" width="100%"/></div></div></div>
 <div style={{fontSize:13.5,color:MUT,marginTop:10}}>Tiền chuyến đếm theo xe thực tế đã chở (phiếu giao đã xác minh trong kỳ). Người trả theo hàng đã giao không nhận thêm tiền chuyến cho cùng chuyến. Chỉ vai trò được xem lương mới thấy số tiền; chi trả hiện sau khi chốt kỳ.</div></Shell>);

/* ================= 13b. THU NHẬP KHÁC · QUY TẮC LƯƠNG ================= */
const PayTabs=({v})=><div style={{marginBottom:16}}><TabList value={v} onChange={NO} hasDivider><Tab value="payroll" label="Bảng lương"/><Tab value="rules" label="Thu nhập khác"/><Tab value="rates" label="Đơn giá công việc"/></TabList></div>;
const VEH=[['Xe điện',40000,29,'Xe điện chở hàng nhẹ'],['Xe cn nhỏ',50000,41,'Xe công nông nhỏ'],['Xe cn to',80000,26,'Xe công nông to'],['Ô tô',0,6,'Xe ô tô tải']];
const IncomeBody=()=><Shell group="Nhân công" page="Bảng lương">
 <Title sub="Nhân công / Bảng lương / Thu nhập khác" right={<Button variant="primary" label="Thêm khoản thu nhập" icon={ic(H.PlusIcon,18)}/>}>Thu nhập khác</Title>
 <PayTabs v="rules"/>
 <div style={{display:'flex',flexDirection:'column',gap:16}}>
  <Sec title="Đơn giá chuyến theo xe" icon={ic(H.TruckIcon,20)} right={<span style={{fontSize:13.5,color:MUT}}>Mỗi phiếu giao đã xác minh là 1 chuyến, trả theo xe thực tế đã chở</span>} pad={false}>
   <Tbl heads={['Xe','Loại xe','Đơn giá mỗi chuyến','Chuyến kỳ 11/2026','Thành tiền','']} widths={['1.1fr','1.5fr','1.3fr','1.1fr','1.2fr','150px']} num={[2,3,4]}
    rows={VEH.map(([x,d,n,t])=>({bg:d?undefined:'#FFF8E8',cells:[<b>{x}</b>,t,d?<div className="hx-in hx-num" style={{padding:'7px 12px',fontWeight:700}}>{money(d)} / chuyến</div>:<span style={{color:'#7A4300',fontWeight:700}}>Chưa có đơn giá</span>,n,d?money(n*d):<span style={{color:'#7A4300'}}>Chưa tính tiền</span>,d?<Button variant="secondary" size="sm" label="Sửa đơn giá"/>:<Button variant="secondary" size="sm" label="Nhập đơn giá"/>]}))}
    total={['Tổng cộng','','',sum(VEH.filter(v=>v[1]).map(v=>v[2]))+' chuyến tính tiền',money(tripAmt),'']}/>
   <div style={{padding:'12px 16px',borderTop:`1px solid ${LINE}`,fontSize:14,color:MUT}}>Xe không có đơn giá riêng và không có khoản chung thì <b style={{color:INK}}>không có tiền chuyến</b>. Đơn giá áp dụng cho mọi nhân viên đi xe đó; thợ chỉ trả theo chuyến đặt Thiết lập lương Cố định, 0 ₫.</div></Sec>
  <Sec title="Các khoản thu nhập khác" icon={ic(H.ReceiptPercentIcon,20)} right={<span style={{fontSize:13.5,color:MUT}}>Chi nhánh Hà Đông · không đụng kỳ đã chốt</span>} pad={false}>
   <Tbl heads={['Tên khoản','Loại','Cách tính','Áp dụng cho','Hiệu lực','Trạng thái']} widths={['1.6fr','.8fr','1.7fr','1.4fr','1fr','1fr']}
    rows={[
     [<b>Theo đơn giá công việc</b>,<Pill k="b">Thưởng</Pill>,<span>Theo đơn giá công việc<div style={{fontSize:13,color:MUT}}>Không nhập số tiền, lấy từ tab Đơn giá công việc</div></span>,'Mọi nhân viên có thiết lập lương','Từ 14/11/2026',<Pill k="s">Đang áp dụng</Pill>],
     [<b>Tiền chuyến theo xe</b>,<Pill k="b">Thưởng</Pill>,<span>Theo chuyến · 3 khoản<div style={{fontSize:13,color:MUT}}>40.000 / 50.000 / 80.000 ₫ mỗi chuyến, xem thẻ trên</div></span>,'Mọi nhân viên (theo xe)','Từ 09/11/2026',<Pill k="s">Đang áp dụng</Pill>],
     [<b>Thưởng doanh thu</b>,<Pill k="b">Thưởng</Pill>,<span>% doanh thu theo bậc<div style={{fontSize:13,color:MUT}}>Bậc 1 đến 400 tr: 1% · bậc 2 trên 400 tr: 1,5%</div></span>,'Nhân viên bán hàng (4 người)','Từ 01/10/2026',<Pill k="s">Đang áp dụng</Pill>],
     [<b>Phụ cấp xăng xe</b>,<Pill k="n">Phụ cấp</Pill>,<span>Cố định<div style={{fontSize:13,color:MUT}}>500.000 ₫ mỗi tháng</div></span>,'Trần Văn Minh','Từ 01/12/2026',<Pill k="o">Chờ hiệu lực</Pill>],
     [<b>Trừ quỹ đồng phục</b>,<Pill k="r">Giảm trừ</Pill>,<span>Cố định<div style={{fontSize:13,color:MUT}}>100.000 ₫ mỗi tháng</div></span>,'Mọi nhân viên','Từ 01/12/2026',<Pill k="o">Chờ hiệu lực</Pill>],
     [<b>Mỗi việc dịch vụ đã xác minh</b>,<Pill k="b">Thưởng</Pill>,<span>Theo việc<div style={{fontSize:13,color:MUT}}>120.000 ₫ mỗi việc</div></span>,'Mọi nhân viên','09/10 đến 13/11/2026',<Pill k="n">Đã ngừng</Pill>]]} pad="13px 16px"/>
   <div style={{padding:'12px 16px',borderTop:`1px solid ${LINE}`,fontSize:14,color:MUT}}>Khoản “Mỗi việc dịch vụ đã xác minh” đã ngừng vì việc dịch vụ nay tính theo đơn giá công việc, tránh trả hai lần cho cùng việc.</div></Sec></div></Shell>;
def('admin-payroll-income-rules','/admin/payroll/income','Settings Panels + Searchable Table','Bảng lương → Thu nhập khác (D35, D70): thẻ Đơn giá chuyến theo xe (mỗi xe một dòng; xe không có đơn giá và không có khoản chung thì không có tiền chuyến) và danh sách khoản thu nhập có cách tính, người áp dụng, hiệu lực.',()=><IncomeBody/>);

/* ================= 13c. FORM KHOẢN THU NHẬP ================= */
const Method=({on,dis,t,d,tag})=><div style={{display:'flex',gap:12,alignItems:'flex-start',padding:'12px 14px',borderRadius:12,border:`1.5px solid ${on?B:LINE}`,background:on?'#F3F8FE':dis?'#F6F8FA':'#fff',opacity:dis?.75:1}}><span style={{width:18,height:18,borderRadius:'50%',border:on?`6px solid ${B}`:'1.5px solid #C7D2DF',boxSizing:'border-box',marginTop:3,flex:'none'}}/><div style={{flex:1}}><div style={{display:'flex',gap:8,alignItems:'center',fontWeight:700,fontSize:15}}>{t}{tag}</div><div style={{fontSize:13.5,color:MUT,marginTop:2}}>{d}</div></div></div>;
def('admin-payroll-component-form','/admin/payroll/income (hộp thoại)','Dialog Wizard','Tạo/sửa khoản thu nhập: Theo chuyến có ô Áp dụng cho xe (áp dụng mọi nhân viên, mỗi xe một đơn giá); Theo đơn giá công việc không nhập số tiền và chỉ một khoản đang áp dụng mỗi chi nhánh.',()=><div style={{position:'relative',width:1280,height:1020,overflow:'hidden'}}>
 <div style={{filter:'blur(1.5px)'}}><IncomeBody/></div>
 <div style={{position:'absolute',inset:0,background:'rgba(16,34,58,.50)',display:'flex',justifyContent:'center',paddingTop:36}}>
  <div className="hx-card" style={{width:760,height:'fit-content',boxShadow:'0 24px 64px rgba(16,34,58,.35)',overflow:'hidden'}}>
   <div style={{padding:'16px 22px',display:'flex',gap:12,alignItems:'center',borderBottom:`1px solid ${LINE}`}}><span style={{width:40,height:40,borderRadius:12,background:Tone.b.bg,color:B,display:'flex',alignItems:'center',justifyContent:'center'}}>{ic(H.ReceiptPercentIcon,22)}</span><div style={{flex:1}}><b style={{fontSize:19}}>Thêm khoản thu nhập</b><div style={{fontSize:14,color:MUT}}>Chi nhánh Hà Đông · có hiệu lực từ ngày chọn, không đổi kỳ đã chốt</div></div>{ic(H.XMarkIcon,22,MUT)}</div>
   <div style={{padding:22,display:'flex',flexDirection:'column',gap:16}}>
    <div style={{display:'flex',gap:14}}><In l="Tên khoản" v="Tiền chuyến · Xe cn to"/><div style={{flex:'none'}}><div className="hx-label" style={{marginBottom:6}}>Loại khoản</div><Seg items={['Phụ cấp','Thưởng','Giảm trừ']} value="Thưởng"/></div></div>
    <div><div className="hx-label" style={{marginBottom:8}}>Cách tính</div>
     <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <Method t="Cố định" d="Một số tiền mỗi tháng"/>
      <Method t="% doanh thu theo bậc" d="Mỗi bậc một tỷ lệ cố định"/>
      <Method on t="Theo chuyến" d="Mỗi phiếu giao đã xác minh là 1 chuyến"/>
      <Method dis t="Theo đơn giá công việc" tag={<Pill k="n">Đã có 1 khoản</Pill>} d="Chỉ một khoản đang áp dụng mỗi chi nhánh; không nhập số tiền"/></div></div>
    <div style={{padding:16,borderRadius:12,background:'#F6F9FC',border:`1px solid ${LINE}`,display:'flex',flexDirection:'column',gap:14}}>
     <div style={{display:'flex',gap:14}}><In l="Áp dụng cho xe" v="Xe cn to" post={ic(H.ChevronRightIcon,16,MUT)} hint="Để trống: khoản chung cho mọi xe chưa có đơn giá riêng."/><In l="Số tiền mỗi chuyến (₫)" v="80.000" num hint="Mỗi xe chỉ một đơn giá đang áp dụng."/></div>
     <div style={{display:'flex',gap:14}}><div style={{flex:1}}><div className="hx-label" style={{marginBottom:6}}>Áp dụng cho nhân viên</div><div className="hx-in" style={{background:'#EEF1F5',color:MUT,display:'flex',alignItems:'center',gap:8}}>{ic(H.LockClosedIcon,18)}Mọi nhân viên</div><div style={{fontSize:13.5,color:MUT,marginTop:6}}>Theo chuyến có gắn xe luôn áp dụng cho mọi nhân viên.</div></div><In l="Hiệu lực từ ngày" v="21/11/2026" pre={ic(H.CalendarDaysIcon,18,MUT)}/></div></div>
    <Note k="o" title="Xe không có đơn giá thì không có tiền chuyến">Chuyến của xe chưa có đơn giá riêng và chưa có khoản chung sẽ không được tính tiền. Khoản này chỉ chọn Thưởng hoặc Phụ cấp, không dùng Giảm trừ với Theo đơn giá công việc.</Note></div>
   <div style={{padding:'14px 22px',background:'#F6F9FC',borderTop:`1px solid ${LINE}`,display:'flex',justifyContent:'flex-end',gap:10}}><Button variant="ghost" label="Hủy"/><Button variant="primary" label="Lưu khoản thu nhập"/></div></div></div></div>,1280);

/* ================= 13d. ĐƠN GIÁ CÔNG VIỆC (D76) ================= */
const NoRate=<span style={{color:'#7A4300',fontWeight:700}}>Chưa có đơn giá, chưa tính tiền</span>;
const RowAct=({no})=><div style={{display:'flex',gap:6,justifyContent:'flex-end'}}><Button variant="secondary" size="sm" label={no?'Thêm':'Sửa'}/>{!no&&<Button variant="ghost" size="sm" label="Ngừng"/>}</div>;
def('admin-payroll-work-rates','/admin/payroll/work-rates','Settings Panels + Searchable Table','Tab Đơn giá công việc (D76): đơn giá vận chuyển theo đơn vị đã bán và đơn giá dịch vụ (tiền mỗi đơn vị hoặc % số tiền tính khách); hàng chưa có đơn giá không bị đoán; không hiện cho khách.',()=><Shell group="Nhân công" page="Bảng lương">
 <Title sub="Nhân công / Bảng lương / Đơn giá công việc" right={<Button variant="primary" label="Thêm đơn giá" icon={ic(H.PlusIcon,18)}/>}>Đơn giá công việc</Title>
 <PayTabs v="rates"/>
 <div style={{display:'flex',flexDirection:'column',gap:16}}>
  <Note title="Đây là tiền công trả thợ, không hiện cho khách" end={<Pill k="s">Đang bật cho Hà Đông</Pill>}>Cách tính “Theo đơn giá công việc” lấy số lượng đã nhận trên phiếu giao đã xác minh và khối lượng việc dịch vụ đã xác minh nhân với đơn giá dưới đây. Hàng hoặc dịch vụ chưa có đơn giá thì chưa tính tiền.</Note>
  <Sec title="Đơn giá vận chuyển" icon={ic(H.TruckIcon,20)} right={<span style={{fontSize:13.5,color:MUT}}>Tiền thợ nhận cho mỗi đơn vị, đúng đơn vị đơn đã bán</span>} pad={false}>
   <Tbl heads={['Vật tư','Đơn vị bán','Tiền mỗi đơn vị',<span style={{paddingLeft:24}}>Hiệu lực</span>,'Trạng thái','']} widths={['1.8fr','.9fr','1.4fr','1.1fr','1.4fr','150px']} num={[2]}
    rows={[['Xi măng PCB40 (50 kg)','bao','1.500 ₫','Từ 14/11/2026',<Pill k="s">Đang áp dụng</Pill>,false],['Gạch ống 4 lỗ','viên','100 ₫','Từ 14/11/2026',<Pill k="s">Đang áp dụng</Pill>,false],['Cát vàng','m³','25.000 ₫','Từ 14/11/2026',<Pill k="s">Đang áp dụng</Pill>,false],['Thép phi 10','cây','1.000 ₫','Từ 14/11/2026',<Pill k="s">Đang áp dụng</Pill>,false],['Đá 1x2','m³','—','—',NoRate,true],['Thép phi 16','cây','—','—',NoRate,true]].map(([a,b,c,d,e,no])=>({bg:no?'#FFF8E8':undefined,cells:[<b>{a}</b>,b,c,<span style={{paddingLeft:24}}>{d}</span>,e,<RowAct no={no}/>]}))} pad="12px 16px"/>
   <div style={{padding:'12px 16px',borderTop:`1px solid ${LINE}`,fontSize:14,color:MUT}}>Đơn vị phải là đơn vị gốc của vật tư hoặc đơn vị có quy đổi sang đơn vị gốc (ví dụ bao, viên, kg, cây, khối).</div></Sec>
  <Sec title="Đơn giá dịch vụ" icon={ic(H.WrenchScrewdriverIcon,20)} right={<span style={{fontSize:13.5,color:MUT}}>Mỗi loại một cách tính: tiền mỗi đơn vị hoặc % số tiền tính khách (1–100)</span>} pad={false}>
   <Tbl heads={['Loại dịch vụ','Cách tính','Mức',<span style={{paddingLeft:24}}>Hiệu lực</span>,'Trạng thái','']} widths={['1.8fr','1.5fr','1.3fr','1.1fr','1.4fr','150px']} num={[2]}
    rows={[['Cẩu hàng','Tiền mỗi đơn vị (việc)','120.000 ₫ / việc','Từ 14/11/2026',<Pill k="s">Đang áp dụng</Pill>,false],['Máy trộn bê tông','% số tiền tính khách','15%','Từ 14/11/2026',<Pill k="s">Đang áp dụng</Pill>,false],['Vận chuyển cát','—','—','—',NoRate,true]].map(([a,b,c,d,e,no])=>({bg:no?'#FFF8E8':undefined,cells:[<b>{a}</b>,b,c,<span style={{paddingLeft:24}}>{d}</span>,e,<RowAct no={no}/>]}))} pad="12px 16px"/>
   <div style={{padding:'12px 16px',borderTop:`1px solid ${LINE}`,fontSize:14,color:MUT}}>Ngừng một đơn giá không đổi các phiếu lương đã chốt; mục chưa có đơn giá sẽ hiện trên phiếu lương để bổ sung rồi tính lại.</div></Sec></div></Shell>);

/* ================= 14. CHI TIẾT VIỆC DỊCH VỤ ================= */
const SvcSteps=({n})=><div className="hx-card" style={{padding:'14px 24px 10px'}}><Stepper activeStep={n} label="Trạng thái việc dịch vụ">{['Đã lên lịch','Đang thực hiện','Chờ xác minh','Đã xác minh','Hoàn tất'].map((l,i)=><Step key={l} step={i} label={l} description={['18/11 17:00','19/11 08:30','19/11 10:15','—','—'][i]}/>)}</Stepper></div>;
def('admin-service-job-detail','/admin/service-jobs/:id','Work Item Detail + Project Status','DV-0043 Chờ xác minh: không còn Hủy việc hay Đổi người; xác minh việc mới tính phí vào công nợ và tiền việc vào bảng lương.',()=><DetailPage group="Bán hàng" page="Dịch vụ" sub="Bán hàng / Dịch vụ / DV-0043" title="Việc dịch vụ DV-0043" chips={<Chip k="w">Chờ xác minh</Chip>}
 actions={<Button variant="secondary" label="In phiếu việc" icon={ic(H.PrinterIcon,18)}/>}
 left={<><SvcSteps n={2}/>
  <Sec title="Thông tin việc" icon={ic(H.WrenchScrewdriverIcon,20)} pad><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px 32px'}}>
   <KV rows={[['Dịch vụ','Vận chuyển cát'],['Khách hàng','Cô Hoa · Hà Đông'],['Công trình','Số 18 ngõ 25, Hà Đông']]}/>
   <KV rows={[['Ngày hẹn','19/11/2026 · 08:30'],['Người làm',<Who n="Trần Văn Minh" sub="Thợ chính" size={36}/>],['Phí dịch vụ',<b>1.200.000 ₫</b>]]}/></div></Sec>
  <Sec title="Các bước thực hiện" pad><div style={{display:'flex',flexDirection:'column',gap:12}}>{[['Đến công trình, kiểm tra mặt bằng','08:25'],['Chở 6 m³ cát tới công trình','09:40'],['Dỡ hàng và chụp ảnh nghiệm thu','10:12']].map(([t,h])=><div key={t} style={{display:'flex',gap:12,alignItems:'center'}}><span style={{color:G}}>{ic(H.CheckCircleIcon,22)}</span><span style={{flex:1}}>{t}</span><span style={{color:MUT,fontSize:13.5}}>{h}</span></div>)}</div></Sec>
  <Sec title="Ảnh bằng chứng" icon={ic(H.CameraIcon,20)} pad><div style={{display:'flex',gap:12}}><Photo cap="Trước khi dỡ · 08:28"/><Photo cap="Cát đã dỡ · 09:41"/><Photo cap="Nghiệm thu · 10:12"/></div></Sec></>}
 right={<>
  <div className="hx-card" style={{padding:16,borderTop:`4px solid ${G}`}}><div className="hx-label">Khi xác minh việc</div><div style={{margin:'6px 0 12px',fontSize:14.5}}>Ghi nhận phí <b>1.200.000 ₫</b> vào công nợ khách và <b>tiền việc 120.000 ₫</b> cho Trần Văn Minh vào bảng lương.</div><Btn k="g">Xác minh việc</Btn></div>
  <Sec title="Liên quan" pad={false}>{[['Khách Cô Hoa · Hà Đông','KH-0087'],['Đơn bán đi kèm','SO-0229']].map(([t,s],i)=><div key={t} style={{display:'flex',gap:12,padding:'12px 16px',borderTop:i?`1px solid ${LINE}`:0,alignItems:'center'}}><div style={{flex:1}}><b>{t}</b><div style={{fontSize:13.5,color:MUT}}>{s}</div></div>{ic(H.ChevronRightIcon,18,MUT)}</div>)}</Sec></>}/>);

/* ================= 15. YÊU CẦU DỊCH VỤ ================= */
def('admin-service-request-detail','/admin/service-jobs/requests/:id','Inbox Table + Work Item Detail','Chờ xác nhận lịch, Đã xếp lịch, Đã từ chối, Khách đã hủy; xếp lịch tạo việc dịch vụ và báo khách; từ chối phải có lý do.',()=><DetailPage group="Bán hàng" page="Dịch vụ" sub="Bán hàng / Dịch vụ / Yêu cầu / YC-0018" title="Yêu cầu dịch vụ YC-0018" chips={<Chip k="w">Chờ xác nhận lịch</Chip>}
 actions={<Button variant="secondary" label="Gọi khách" icon={ic(H.PhoneIcon,18)}/>}
 left={<>
  <Sec title="Khách yêu cầu" icon={ic(H.UserIcon,20)} right={<Pill k="b">Từ cổng khách</Pill>} pad><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px 32px'}}>
   <KV rows={[['Khách hàng','Cô Hoa · Hà Đông'],['Điện thoại','0988 765 432'],['Dịch vụ','Máy trộn bê tông']]}/>
   <KV rows={[['Công trình','Số 18 ngõ 25, Hà Đông'],['Khách muốn','21/11/2026 · buổi sáng'],['Gửi lúc','19/11/2026 16:40']]}/></div>
   <div style={{marginTop:14,padding:14,borderRadius:10,background:'#F6F9FC',border:`1px solid ${LINE}`,fontSize:15}}>“Cần máy trộn bê tông một buổi sáng để đổ sàn tầng 2, đường vào ngõ hẹp.”</div></Sec>
  <Sec title="Ảnh khách gửi" icon={ic(H.PhotoIcon,20)} pad><div style={{display:'flex',gap:12}}><Photo cap="Ngõ vào công trình"/><Photo cap="Mặt tiền nhà"/></div></Sec>
  <Sec title="Trạng thái yêu cầu" pad><div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}><Pill k="o">Chờ xác nhận lịch</Pill><span style={{color:MUT}}>›</span><Pill k="b">Đã xếp lịch</Pill><span style={{color:MUT}}>hoặc</span><Pill k="r">Đã từ chối</Pill><span style={{color:MUT}}>hoặc</span><Pill k="n">Khách đã hủy</Pill></div></Sec></>}
 right={<>
  <Sec title="Xếp lịch" icon={ic(H.CalendarDaysIcon,20)} pad tone="b"><div style={{display:'flex',flexDirection:'column',gap:14}}>
   <In l="Ngày thực hiện" v="21/11/2026" pre={ic(H.CalendarDaysIcon,18,MUT)}/><div style={{display:'flex',gap:10}}><In l="Từ giờ" v="08:00"/><In l="Đến giờ" v="10:00"/></div>
   <In l="Người thực hiện" v="Trần Văn Minh · Thợ chính"/><In l="Phí dịch vụ" v="1.200.000 ₫" num/>
   <Note k="s" title="Không trùng lịch">Trần Văn Minh rảnh 21/11 từ 08:00 đến 10:00.</Note>
   <Button variant="primary" label="Xếp lịch và báo khách" width="100%"/></div></Sec>
  <Sec title="Từ chối yêu cầu" pad><div style={{display:'flex',flexDirection:'column',gap:12}}><In l="Lý do từ chối (khách sẽ thấy)" v="Nhập lý do" ph/><Button variant="destructive" label="Từ chối yêu cầu" width="100%"/></div></Sec></>}/>);

/* ================= 16–19. CÀI ĐẶT ================= */
const SITEMS=['Chi nhánh','Giá và hạn mức','Tự động hóa','Trợ lý AI','Phân quyền'];
const SW=({t,d,on=true,risk,disabled,msg})=><div style={{padding:'16px 0',borderTop:`1px solid ${LINE}`,display:'flex',gap:16,alignItems:'center'}}>
 <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15.5}}>{t}</div><div style={{fontSize:14,color:MUT,marginTop:3,maxWidth:520}}>{d}</div></div>{risk&&<Pill k="o">Cài đặt rủi ro</Pill>}
 <Switch label={t} isLabelHidden value={on} onChange={NO} isDisabled={disabled} disabledMessage={msg}/></div>;
def('admin-settings-branches','/admin/settings/branches','Settings Panels','Thông tin chi nhánh, kho, chế độ điều phối; tắt hoặc bật chi nhánh phải có lý do.',()=><SettingsPage group="Hệ thống" page="Cài đặt" sub="Hệ thống / Cài đặt" title="Chi nhánh" items={SITEMS} active={0}>
 <Sec title="Danh sách chi nhánh" pad={false} right={<Button variant="secondary" size="sm" label="Thêm chi nhánh" icon={ic(H.PlusIcon,16)}/>}>
  <Tbl heads={['Chi nhánh','Kho','Chế độ điều phối','Trạng thái','Hoạt động']} widths={['1.6fr','1.6fr','1.3fr','1.2fr','90px']}
   rows={[[<span><b>Hà Đông</b><div style={{fontSize:13.5,color:MUT}}>Chi nhánh đang chọn</div></span>,'Kho Đại Mỗ · Kho Hà Đông',<Pill k="b">Tự điều phối</Pill>,<Pill k="s">Đang hoạt động</Pill>,<On/>],
    [<b>Nam Từ Liêm</b>,'Kho Mỹ Đình',<Pill k="n">Điều phối thủ công</Pill>,<Pill k="s">Đang hoạt động</Pill>,<On/>],
    [<span><b>Cầu Giấy</b><div style={{fontSize:13.5,color:MUT}}>Tạm ngưng · cải tạo mặt bằng</div></span>,'Kho Dịch Vọng',<Pill k="n">Điều phối thủ công</Pill>,<Pill k="n">Ngừng hoạt động</Pill>,<On v={false}/>]]} pad="14px 16px"/></Sec>
 <Sec title="Sửa chi nhánh Hà Đông" pad><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
  <In l="Tên chi nhánh" v="Hà Đông"/><In l="Điện thoại" v="024 3999 0000"/>
  <div style={{gridColumn:'1 / -1'}}><In l="Địa chỉ" v="Số 120 đường Quang Trung, Hà Đông, Hà Nội"/></div>
  <div style={{gridColumn:'1 / -1'}}><div className="hx-label" style={{marginBottom:6}}>Chế độ điều phối</div><Seg items={['Tự điều phối','Điều phối thủ công']} value="Tự điều phối"/><div style={{fontSize:14,color:MUT,marginTop:6}}>Tự điều phối: hệ thống gợi ý người và xe theo lịch; điều phối viên vẫn quyết định.</div></div></div>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:18,paddingTop:16,borderTop:`1px solid ${LINE}`}}><span style={{fontSize:14,color:MUT}}>Tắt hoặc bật chi nhánh cần ghi lý do; thay đổi vào nhật ký kiểm toán.</span><Button variant="primary" label="Lưu thay đổi"/></div></Sec></SettingsPage>);

def('admin-settings-pricing','/admin/settings/pricing','Settings Panels','Cấu hình giá chung, hạn mức nợ mặc định, hạn thanh toán; đổi có ngày hiệu lực từ hôm nay, không đổi đơn đã xác nhận; lý do nằm ngay dưới các ô sửa.',()=><SettingsPage group="Hệ thống" page="Cài đặt" sub="Hệ thống / Cài đặt" title="Giá và hạn mức" items={SITEMS} active={1}>
 <Note k="o" title="Thay đổi chỉ áp dụng từ ngày hiệu lực">Đơn đã xác nhận giữ nguyên giá. Cần chọn ngày hiệu lực và ghi lý do trước khi lưu.</Note>
 <Sec title="Hạn mức và hạn thanh toán mặc định" pad><div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
  <In l="Hạn mức nợ mặc định (₫)" v="50.000.000" num hint="Áp cho khách chưa đặt riêng."/>
  <In l="Hạn thanh toán (ngày)" v="30" num hint="Tính từ ngày phiếu giao được xác minh."/>
  <In l="Ngày hiệu lực" v="20/11/2026" pre={ic(H.CalendarDaysIcon,18,MUT)} hint="Từ hôm nay trở đi."/></div>
  <div style={{display:'flex',gap:16,alignItems:'flex-end',marginTop:16,paddingTop:16,borderTop:`1px solid ${LINE}`}}><In l="Lý do thay đổi (bắt buộc)" v="Điều chỉnh hạn mức theo chính sách tháng 11"/><Button variant="primary" label="Lưu thay đổi"/></div></Sec>
 <Sec title="Bảng giá bán" pad={false} right={<Button variant="secondary" size="sm" label="Mở bảng giá hàng loạt"/>}>
  <Tbl heads={['Nhóm giá','Loại','Số vật tư có giá','Khách đang dùng','Cập nhật']} widths={['1.8fr','1.4fr','1.2fr','1.1fr','1.1fr']} num={[2,3]}
   rows={[[<b>Giá chung</b>,<Pill k="b">Mặc định</Pill>,'214','186','18/11/2026'],[<b>Nhóm giá Bảo Long</b>,<Pill k="n">Theo nhóm khách</Pill>,'48','1','10/11/2026'],[<b>Nhóm giá Minh Phát</b>,<Pill k="n">Theo nhóm khách</Pill>,'36','1','02/11/2026'],[<b>Nhóm giá Cô Hoa</b>,<Pill k="n">Theo nhóm khách</Pill>,'12','1','25/10/2026']]}/></Sec></SettingsPage>);

def('admin-settings-automation','/admin/settings/automation','Settings Panels','Bật tắt tự duyệt đơn khách (D79, D88) và các tự động khác; không tự duyệt khi vượt hạn mức nợ; mỗi lần đổi ghi nhật ký.',()=><SettingsPage group="Hệ thống" page="Cài đặt" sub="Hệ thống / Cài đặt" title="Tự động hóa" items={SITEMS} active={2}>
 <Note title="Mỗi lần đổi được ghi vào nhật ký kiểm toán">Chỉ người có quyền Quản lý vai trò được đổi. Hệ thống không bao giờ tự duyệt đơn khi vượt hạn mức nợ.</Note>
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}><div style={{flex:1,display:'flex',flexDirection:'column',gap:16,minWidth:0}}>
  <Sec title="Đơn khách đặt" icon={ic(H.UserGroupIcon,20)} pad><div style={{marginTop:-16}}><SW risk t="Tự duyệt đơn khách khi an toàn" d="Đơn kênh cổng khách trong hạn mức nợ được xác nhận và tự phân nguồn hàng. Tắt thì mọi đơn chờ nhân viên duyệt."/>
   <div style={{padding:'14px 0',borderTop:`1px solid ${LINE}`,display:'flex',gap:12,alignItems:'center',color:MUT,fontSize:14.5}}>{ic(H.LockClosedIcon,20)}<span>Không tự duyệt khi vượt hạn mức nợ <b style={{color:INK}}>(luôn bật, không tắt được)</b></span></div></div></Sec>
  <Sec title="Giao hàng và thợ" icon={ic(H.TruckIcon,20)} pad><div style={{marginTop:-16}}><SW t="Thợ tự nhận việc khi không có người trực" d="Thợ chính hoặc thợ được nhận việc chờ phân giao trong ca."/><SW t="Chia sẻ vị trí của thợ khi có việc" d="Chỉ chia sẻ trong ca và khi đang có việc; hiện ở Lộ trình."/><SW t="Gợi ý thứ tự điểm giao" d="Dùng dịch vụ bản đồ công cộng, chỉ để gợi ý; điều phối viên quyết định."/></div></Sec>
  <Sec title="Tiền và thông báo" icon={ic(H.BanknotesIcon,20)} pad><div style={{marginTop:-16}}><SW risk t="Tự ghi tiền về khi ngân hàng báo (SePay)" d="Khớp mã đơn và số tiền thì tự lập phiếu thu; không khớp thì giữ ở Giao dịch ngân hàng chờ xử lý."/><SW t="Gửi tin Zalo tự động cho khách" d="Luôn tắt: Gửi qua Zalo là nút gửi tay, không tự gửi." on={false} disabled msg="Gửi Zalo luôn do nhân viên bấm tay"/></div></Sec></div>
  <div style={{width:320,display:'flex',flexDirection:'column',gap:16}}><Sec title="Thay đổi gần đây" pad={false}>
   {[['Bật “Tự duyệt đơn khách khi an toàn”','Nguyễn Thị Lan · 12/11 09:20'],['Tắt “Chia sẻ vị trí” rồi bật lại','Chủ cửa hàng · 05/11 17:02'],['Bật “Tự ghi tiền về (SePay)”','Chủ cửa hàng · 30/10 14:41']].map(([t,s],i)=><div key={t} style={{padding:'12px 16px',borderTop:i?`1px solid ${LINE}`:0}}><div style={{fontWeight:600,fontSize:14.5}}>{t}</div><div style={{fontSize:13.5,color:MUT}}>{s}</div></div>)}</Sec></div></div></SettingsPage>);

def('admin-settings-ai','/admin/settings/ai','Settings Panels + Form','Khóa API nằm trong Vault và không bao giờ hiện lại (D50); chọn mô hình, giới hạn chi phí hằng tháng; AI chỉ đọc.',()=><SettingsPage group="Hệ thống" page="Cài đặt" sub="Hệ thống / Cài đặt" title="Trợ lý AI" items={SITEMS} active={3}>
 <Sec title="Khóa API" icon={ic(H.KeyIcon,20)} right={<Pill k="s">Đã lưu an toàn</Pill>} pad>
  <div style={{display:'flex',gap:14,alignItems:'center',padding:14,borderRadius:12,background:'#F6F9FC',border:`1px solid ${LINE}`}}><span style={{width:44,height:44,borderRadius:12,background:'#E5F4EC',color:G,display:'flex',alignItems:'center',justifyContent:'center'}}>{ic(H.LockClosedIcon,24)}</span><div style={{flex:1}}><div style={{fontWeight:700}}>Khóa đang được giữ trong Vault</div><div style={{fontSize:14,color:MUT}}>Lưu lúc 12/11/2026 · Khóa không bao giờ hiện lại sau khi lưu, kể cả với chủ cửa hàng.</div></div><Button variant="ghost" label="Xóa khóa"/></div>
  <div style={{marginTop:16,display:'flex',gap:12,alignItems:'flex-end'}}><div style={{flex:1}}><TextInput label="Thay bằng khóa mới" type="password" value="" onChange={NO} placeholder="Dán khóa mới vào đây"/></div><Button variant="primary" label="Lưu khóa mới"/></div><div style={{fontSize:14,color:MUT,marginTop:8}}>Khóa cũ bị thay thế ngay khi lưu.</div></Sec>
 <Sec title="Mô hình và giới hạn" icon={ic(H.CpuChipIcon,20)} pad><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
  <In l="Mô hình" v="Claude Sonnet · cân bằng chất lượng và chi phí" post={ic(H.ChevronRightIcon,16,MUT)}/><In l="Giới hạn chi phí mỗi tháng (₫)" v="3.000.000" num/></div>
  <div style={{marginTop:18}}><div style={{display:'flex',justifyContent:'space-between',fontSize:14.5,marginBottom:6}}><span>Chi phí AI tháng này</span><b>1.240.000 ₫ / 3.000.000 ₫</b></div><ProgressBar label="Chi phí AI tháng này" isLabelHidden value={41} variant="accent"/></div>
  <div style={{marginTop:6}}><SW t="Bật Trợ lý AI cho chi nhánh này" d="Tắt thì mục Trợ lý AI ẩn khỏi menu Hệ thống."/></div></Sec>
 <Note title="Trợ lý chỉ đọc">AI chỉ đọc dữ liệu trong quyền của người đang hỏi và không tự ghi sổ. Đề xuất của AI luôn chờ người duyệt.</Note></SettingsPage>);

/* ================= 20. TRỢ LÝ AI ================= */
const Bub=({me,children})=><div style={{display:'flex',gap:12,justifyContent:me?'flex-end':'flex-start'}}>{!me&&<span style={{width:36,height:36,borderRadius:12,background:'linear-gradient(135deg,#0B63C6,#5B9BE6)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{ic(H.SparklesIcon,20)}</span>}<div style={{maxWidth:640,padding:'12px 16px',borderRadius:me?'16px 16px 4px 16px':'16px 16px 16px 4px',background:me?B:'#fff',color:me?'#fff':INK,border:me?0:`1px solid ${LINE}`,fontSize:15,lineHeight:1.55}}>{children}</div></div>;
const Src=({children})=><div style={{display:'inline-flex',alignItems:'center',gap:6,marginTop:10,padding:'4px 10px',borderRadius:999,background:'#E6F0FB',color:'#0A4A96',fontSize:13.5,fontWeight:600}}>{ic(H.DocumentTextIcon,15)}{children}</div>;
def('admin-ai','/admin/ai','AI Chat Conversation','Chỉ đọc dữ liệu trong quyền người dùng, không tự ghi sổ; mỗi câu trả lời nêu nguồn số liệu (D50 đến D66); đề xuất chỉ là bản nháp chờ người xem.',()=><Shell group="Hệ thống" page="Trợ lý AI">
 <Title sub="Hệ thống / Trợ lý AI" right={<Pill k="b">Chỉ đọc · không ghi sổ</Pill>}>Trợ lý AI</Title>
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div className="hx-card" style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',height:700,overflow:'hidden'}}>
   <div style={{flex:1,padding:24,display:'flex',flexDirection:'column',gap:18,background:'#F7F9FC',overflow:'hidden'}}>
    <Bub me>Khách nào đang nợ quá hạn nhiều nhất?</Bub>
    <Bub>Theo công nợ phải thu đến sáng nay, 2 khách đang quá hạn, tổng 48.800.000 ₫:
     <div style={{margin:'10px 0 0',border:`1px solid ${LINE}`,borderRadius:10,overflow:'hidden',background:'#fff'}}><Tbl heads={['Khách hàng','Quá hạn','Số ngày']} widths={['2fr','1.3fr','.9fr']} num={[1,2]} rows={[[<b>Anh Nam · Nam Từ Liêm</b>,<b style={{color:R}}>30.400.000 ₫</b>,'18'],[<b>Cô Hoa · Hà Đông</b>,<b style={{color:R}}>18.400.000 ₫</b>,'9']]} total={['Tổng quá hạn','48.800.000 ₫','']} pad="10px 14px"/></div>
     <Src>Nguồn: Phải thu · cập nhật 20/11/2026 10:30 · chỉ đọc</Src></Bub>
    <Bub me>Soạn giúp tôi lời nhắc nợ cho anh Nam</Bub>
    <Bub>Tôi chỉ đọc dữ liệu, không tự ghi sổ hay gửi tin. Tôi đã soạn sẵn một bản nháp ở mục Đề xuất để bạn xem, sửa và tự gửi qua Zalo.
     <div style={{marginTop:12,display:'flex',gap:8,flexWrap:'wrap'}}><Button variant="secondary" size="sm" label="Mở khách Anh Nam" icon={ic(H.ArrowUpRightIcon,16)}/><Button variant="secondary" size="sm" label="Xem bản nháp"/></div></Bub></div>
   <div style={{padding:16,borderTop:`1px solid ${LINE}`,background:'#fff'}}>
    <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>{['Doanh thu 7 ngày so tuần trước','Hàng nào sắp hết tồn?','Phiếu giao nào đang chờ xác minh?'].map(t=><span key={t} style={{padding:'6px 12px',borderRadius:999,border:`1px solid ${LINE}`,fontSize:13.5,color:INK,background:'#F6F9FC'}}>{t}</span>)}</div>
    <div style={{display:'flex',gap:10}}><div className="hx-in ph" style={{flex:1}}>Hỏi về đơn hàng, công nợ, tồn kho…</div><Button variant="primary" label="Gửi" icon={ic(H.PaperAirplaneIcon,18)}/></div></div></div>
  <div style={{width:340,display:'flex',flexDirection:'column',gap:16}}>
   <Sec title="Chi phí AI tháng này" pad><div style={{fontSize:26,fontWeight:800,fontVariantNumeric:'tabular-nums'}}>1.240.000 ₫</div><div style={{fontSize:13.5,color:MUT,margin:'2px 0 10px'}}>Giới hạn 3.000.000 ₫ · còn 1.760.000 ₫</div><ProgressBar label="Chi phí AI" isLabelHidden value={41} variant="accent"/></Sec>
   <Sec title="Đề xuất chờ duyệt" right={<Pill k="o">1</Pill>} pad={false}><div style={{padding:16}}><div style={{fontWeight:700}}>Bản nháp nhắc nợ Anh Nam</div><div style={{fontSize:13.5,color:MUT,margin:'2px 0 12px'}}>Chỉ là bản nháp Zalo, chưa gửi. Bạn xem rồi tự gửi; không ghi sổ.</div><div style={{display:'flex',gap:8}}><Button variant="secondary" size="sm" label="Xem nội dung"/><Button variant="ghost" size="sm" label="Bỏ qua"/></div></div></Sec>
   <Sec title="Quyền của trợ lý" pad><div style={{display:'flex',flexDirection:'column',gap:8,fontSize:14.5}}>{['Chỉ thấy dữ liệu bạn được phép xem','Không tự ghi sổ, không đổi trạng thái','Nêu nguồn số liệu ở mỗi câu trả lời'].map(t=><div key={t} style={{display:'flex',gap:8}}><span style={{color:B}}>{ic(H.ShieldCheckIcon,19)}</span>{t}</div>)}</div></Sec></div></div></Shell>);

/* ================= 21. CẬP NHẬT (THÔNG BÁO) ================= */
def('admin-notification-updates','/admin/notifications/updates','Inbox Table + Content Page','Mục Cập nhật hiển thị ghi chú phiên bản bằng tiếng Việt; thông báo việc cần xử lý nằm ở tab bên cạnh.',()=><Shell group="Hệ thống" page="Thông báo">
 <Title sub="Hệ thống / Thông báo" right={<Button variant="secondary" label="Đánh dấu đã đọc tất cả" icon={ic(H.CheckCircleIcon,18)}/>}>Thông báo</Title>
 <div style={{marginBottom:16}}><TabList value="updates" onChange={NO} hasDivider><Tab value="todo" label="Việc cần xử lý" endContent={<Pill k="o">4</Pill>}/><Tab value="updates" label="Cập nhật" endContent={<Pill k="b">Mới</Pill>}/></TabList></div>
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div style={{flex:1,display:'flex',flexDirection:'column',gap:16,minWidth:0}}>
   {[['Phiên bản 2.14','18/11/2026',true,[['b','Mới','Điều phối hiện vị trí thợ đang chia sẻ trong ca, thợ mất tín hiệu hiện màu xám.'],['b','Mới','Tách phiếu giao thành 2 đến 5 phiếu; tổng mỗi dòng luôn đúng.'],['g','Cải thiện','Báo cáo có thanh chọn nhanh kỳ và xuất Excel đúng số, không làm tròn số lượng.']]],
     ['Phiên bản 2.13','09/11/2026',false,[['b','Mới','Sổ quỹ có mục Giao dịch ngân hàng chờ xử lý khi SePay báo tiền chưa khớp.'],['g','Cải thiện','Thu tiền tự phân bổ vào khoản cũ nhất trước; phần dư ghi tiền ứng trước.'],['o','Sửa lỗi','Sửa lỗi lệch số dư quỹ khi đảo phiếu chi trong cùng ngày.']]],
     ['Phiên bản 2.12','27/10/2026',false,[['g','Cải thiện','Bảng lương tính tiền chuyến và tiền việc từ phiếu đã xác minh.'],['o','Sửa lỗi','Ảnh bằng chứng hiện đúng trên đơn bán và phiếu giao.']]]].map(([v,d,nw,items])=><div key={v} className="hx-card" style={{padding:'20px 22px',borderLeft:nw?`4px solid ${B}`:undefined}}>
     <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}><b style={{fontSize:19}}>{v}</b>{nw&&<Pill k="b">Mới</Pill>}<span style={{flex:1}}/><span style={{color:MUT,fontSize:14}}>{d}</span></div>
     <div style={{display:'flex',flexDirection:'column',gap:10}}>{items.map(([k,t,x])=><div key={x} style={{display:'flex',gap:12,alignItems:'flex-start'}}><span style={{width:100,flex:'none',display:'flex',paddingTop:1}}><Pill k={k}>{t}</Pill></span><span style={{fontSize:15,lineHeight:1.5}}>{x}</span></div>)}</div></div>)}</div>
  <div style={{width:300,display:'flex',flexDirection:'column',gap:16}}>
   <Sec title="Bạn đang dùng" pad><div style={{fontSize:26,fontWeight:800,color:B}}>2.14</div><div style={{fontSize:14,color:MUT,marginTop:2}}>Cập nhật lúc 18/11/2026 21:05</div><div style={{marginTop:12}}><Pill k="n">Đã là bản mới nhất</Pill></div></Sec>
   <Note title="Cần hỗ trợ?">Nhắn cho quản trị viên khi thấy số liệu chưa khớp; không tự sửa số đã ghi sổ.</Note></div></div></Shell>);

/* ================= 22. COMMAND PALETTE ================= */
const PalRow=({I,t,s,r,on})=><div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:10,background:on?'#E6F0FB':'transparent',margin:'0 8px'}}><span style={{width:34,height:34,borderRadius:9,background:on?'#fff':'#F1F4F8',color:on?B:MUT,display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{ic(I,19)}</span><div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:15,color:on?'#0A4A96':INK}}>{t}</div><div style={{fontSize:13.5,color:MUT}}>{s}</div></div>{r}{on&&<span style={{fontSize:13,color:MUT,border:`1px solid ${LINE}`,borderRadius:6,padding:'1px 7px',background:'#fff'}}>Enter</span>}</div>;
const PalHead=({children})=><div style={{padding:'10px 22px 4px',fontSize:13.5,fontWeight:700,color:MUT}}>{children}</div>;
def('admin-command-palette','Ctrl K trên mọi trang /admin','Command Palette','Ctrl K mở tìm nhanh; chỉ mục đủ quyền mới hiện; phủ trên trang đang mở (mờ đi); nhãn trạng thái đơn đúng bộ admin.',()=><div style={{position:'relative',width:1280,height:760,overflow:'hidden'}}>
 <div style={{filter:'blur(1.5px)',height:760,overflow:'hidden'}}><ListPage group="Bán hàng" page="Đơn bán" title="Đơn bán" sub="Bán hàng / Đơn bán" actions={<Btn k="g">+ Tạo đơn bán</Btn>} filters={[['Tất cả',186],['Nháp',3],['Đã xác nhận',12],['Đang giao',5],['Hoàn tất',160],['Đã hủy',6]]} cols={[{h:''},{h:'Mã đơn'},{h:'Khách hàng'},{h:'Trạng thái'},{h:'Tổng tiền',num:1}]} widths={['28px','110px','1.6fr','190px','140px']}
  rows={[['›',cd('SO-0231'),'Công ty XD Bảo Long',<Chip k="i">Đã xác nhận</Chip>,'45.600.000 ₫'],['›',cd('SO-0230'),'Anh Tuấn · Cầu Giấy',<Chip k="w">Khách đặt · Chờ duyệt</Chip>,'12.300.000 ₫'],['›',cd('SO-0229'),'Cô Hoa · Hà Đông',<Chip k="i">Đang giao</Chip>,'8.750.000 ₫'],['›',cd('SO-0228'),'Công ty Minh Phát',<Chip k="s">Hoàn tất</Chip>,'92.400.000 ₫']]}/></div>
 <div style={{position:'absolute',inset:0,background:'rgba(16,34,58,.45)',display:'flex',justifyContent:'center',paddingTop:96}}>
  <div className="hx-card" style={{width:680,height:'fit-content',boxShadow:'0 28px 80px rgba(16,34,58,.40)',overflow:'hidden',borderRadius:16}}>
   <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 22px',borderBottom:`1px solid ${LINE}`}}>{ic(H.MagnifyingGlassIcon,24,B)}<span style={{flex:1,fontSize:20,fontWeight:500}}>so-02<span style={{display:'inline-block',width:2,height:22,background:B,marginLeft:2,verticalAlign:'middle'}}/></span><span style={{fontSize:13,color:MUT,border:`1px solid ${LINE}`,borderRadius:6,padding:'2px 8px'}}>Esc</span></div>
   <div style={{padding:'6px 0 10px'}}>
    <PalHead>Chứng từ</PalHead>
    <PalRow on I={H.DocumentTextIcon} t="SO-0231 · Công ty XD Bảo Long" s="Đơn bán · giao 20/11/2026" r={<Chip k="i">Đã xác nhận</Chip>}/>
    <PalRow I={H.DocumentTextIcon} t="SO-0230 · Anh Tuấn · Cầu Giấy" s="Đơn bán · giao 20/11/2026" r={<Chip k="w">Khách đặt · Chờ duyệt</Chip>}/>
    <PalRow I={H.DocumentTextIcon} t="SO-0229 · Cô Hoa · Hà Đông" s="Đơn bán · giao 19/11/2026" r={<Chip k="i">Đang giao</Chip>}/>
    <PalHead>Màn hình</PalHead>
    <PalRow I={H.TableCellsIcon} t="Đơn bán" s="Bán hàng / Đơn bán"/>
    <PalRow I={H.PlusIcon} t="Tạo đơn bán" s="Bán hàng / Đơn bán / Tạo mới"/></div>
   <div style={{display:'flex',alignItems:'center',gap:18,padding:'12px 22px',background:'#F6F9FC',borderTop:`1px solid ${LINE}`,fontSize:13.5,color:MUT}}><span>↑↓ chọn</span><span>Enter mở</span><span>Esc đóng</span><span style={{flex:1}}/><span style={{display:'inline-flex',gap:6,alignItems:'center'}}>{ic(H.LockClosedIcon,16)}Chỉ hiện mục bạn được phép xem</span></div></div></div></div>);

/* ================================================================
   BỔ SUNG: Công nợ (DebtTabs), mẫu in, Zalo, soạn thông báo, popup chức năng
   ================================================================ */
const BG=id=>(M.find(m=>m.id===id)||M1.find(m=>m.id===id)||{C:()=>null}).C;
const DebtTabs=({v})=><div style={{marginBottom:16}}><TabList value={v} onChange={NO} hasDivider><Tab value="ar" label="Phải thu" endContent={<Pill k="n">101.600.000 ₫</Pill>}/><Tab value="ap" label="Phải trả" endContent={<Pill k="n">198.800.000 ₫</Pill>}/></TabList></div>;
def('admin-debts','/admin/debts','Tabs + Filterable Table','Công nợ gộp Phải thu và Phải trả bằng DebtTabs; chỉ đọc tổng hợp, bấm mở sang chi tiết từng bên.',()=><Shell group="Tài chính" page="Công nợ">
 <Title sub="Tài chính / Công nợ" right={<Button variant="secondary" label="Xuất Excel" icon={ic(H.TableCellsIcon,18)}/>}>Công nợ</Title>
 <DebtTabs v="ar"/>
 <div style={{display:'flex',gap:16,marginBottom:16}}>
  <Stat tone="b" icon={ic(H.BanknotesIcon,18)} l="Tổng phải thu" v="101.600.000 ₫" sub="4 khách còn nợ"/>
  <Stat tone="r" icon={ic(H.ExclamationTriangleIcon,18)} l="Đã quá hạn" v="48.800.000 ₫" c={R} sub="2 khách · lâu nhất 18 ngày"/>
  <Stat tone="b" icon={ic(H.WalletIcon,18)} l="Tổng phải trả" v="198.800.000 ₫" sub="3 nhà cung cấp"/></div>
 <Sec title="Phải thu theo khách" pad={false} right={<span style={{fontSize:13.5,color:MUT}}>Sắp xếp theo quá hạn lâu nhất</span>}>
  <Tbl heads={['Khách hàng','Hạn trả gần nhất','Tuổi nợ','Còn nợ','']} widths={['2fr','1.3fr','1.3fr','1.3fr','90px']} num={[3]}
   rows={[['Anh Nam · Nam Từ Liêm','02/11/2026',<Pill k="r">Quá hạn 18 ngày</Pill>,<b>30.400.000 ₫</b>,<Button variant="secondary" size="sm" label="Mở"/>],['Cô Hoa · Hà Đông','11/11/2026',<Pill k="r">Quá hạn 9 ngày</Pill>,<b>18.400.000 ₫</b>,<Button variant="secondary" size="sm" label="Mở"/>],['Công ty Minh Phát','22/11/2026',<Pill k="o">Còn 2 ngày</Pill>,<b>7.200.000 ₫</b>,<Button variant="secondary" size="sm" label="Mở"/>],['Công ty XD Bảo Long','25/12/2026',<Pill k="b">Trong hạn</Pill>,<b>45.600.000 ₫</b>,<Button variant="secondary" size="sm" label="Mở"/>]]}
   total={['Tổng phải thu','','','101.600.000 ₫','']}/></Sec></Shell>);

/* ---------- mẫu in / PDF ---------- */
const Paper=({w=794,title,sub,meta,children,sign=[]})=><div style={{width:w+80,background:'#DDE3EC',padding:40}}><div style={{width:w,background:'#fff',boxShadow:'0 6px 24px rgba(16,34,58,.18)',padding:'44px 52px',color:INK,display:'flex',flexDirection:'column',gap:18,boxSizing:'border-box',minHeight:w===794?1050:undefined}}>
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',borderBottom:`2px solid ${INK}`,paddingBottom:14}}><div><div style={{fontSize:22,fontWeight:800}}>HIỀN XA</div><div style={{fontSize:13.5,color:MUT}}>Vật liệu xây dựng · Chi nhánh Hà Đông<br/>Số 120 Quang Trung, Hà Đông, Hà Nội · 024 3999 0000</div></div><div style={{textAlign:'right'}}><div style={{fontSize:21,fontWeight:800,letterSpacing:'.03em'}}>{title}</div><div style={{fontSize:14,color:MUT}}>{sub}</div></div></div>
 {meta&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 28px',fontSize:14.5}}>{meta.map(([k,v])=><div key={k} style={{display:'flex',gap:8}}><span style={{color:MUT,width:110,flex:'none'}}>{k}</span><b style={{fontWeight:600}}>{v}</b></div>)}</div>}
 {children}
 {sign.length>0&&<div style={{display:'flex',justifyContent:'space-around',marginTop:'auto',paddingTop:36,textAlign:'center',fontSize:14.5}}>{sign.map(t=><div key={t} style={{width:160}}><b>{t}</b><div style={{fontSize:13,color:MUT}}>(Ký, ghi rõ họ tên)</div><div style={{height:56}}/></div>)}</div>}
 <div style={{fontSize:13,color:MUT,textAlign:'center',marginTop:6}}>Cảm ơn quý khách · In lúc 20/11/2026 10:30</div></div></div>;
const OL=[['Xi măng PCB40 (50 kg)','bao',200,95000],['Thép phi 10 (cây 11,7 m)','cây',100,215000],['Cát vàng','m³',6,600000],['Gạch ống 4 lỗ','viên',1200,1250]];
const olT=sum(OL.map(r=>r[2]*r[3]));
const OrderTbl=()=><Tbl heads={['Mặt hàng','ĐVT','Số lượng','Đơn giá','Thành tiền']} widths={['2.4fr','.6fr','1fr','1.2fr','1.4fr']} num={[2,3,4]} rows={OL.map(r=>[<b>{r[0]}</b>,r[1],vn(r[2]),money(r[3]),money(r[2]*r[3])])} total={['Tổng cộng','','','',money(olT)]} pad="10px 12px"/>;
def('admin-print-order-a4','In A4 · Đơn bán','Print Template','In A4 đơn bán SO-0231: thông tin cửa hàng, khách, bảng hàng căn phải, tổng cộng và chỗ ký; không in giá vốn.',()=><Paper title="ĐƠN BÁN HÀNG" sub="Số SO-0231 · Ngày 19/11/2026" meta={[['Khách hàng','Công ty XD Bảo Long'],['Ngày giao','20/11/2026'],['Công trình','CT Hà Đông · tòa B'],['Nhân viên bán','Đỗ Văn Hải'],['Điện thoại','0912 345 678'],['Trạng thái','Đã xác nhận']]} sign={['Người lập','Khách hàng']}><OrderTbl/><div style={{fontSize:15}}>Còn phải thu: <b>{money(olT)}</b> · Hạn thanh toán 25/12/2026</div></Paper>,874);
def('admin-print-order-k80','In K80 · Đơn bán','Print Template','In K80 (khổ 80 mm) đơn bán SO-0231: một cột, chữ lớn, tên hàng xuống dòng, tổng cộng nổi bật.',()=><div style={{width:420,background:'#DDE3EC',padding:30}}><div style={{width:302,background:'#fff',boxShadow:'0 6px 24px rgba(16,34,58,.18)',padding:'20px 18px',fontSize:14,color:INK,margin:'0 auto',fontFamily:'inherit'}}>
 <div style={{textAlign:'center'}}><b style={{fontSize:20}}>HIỀN XA</b><div style={{fontSize:13,color:MUT}}>VLXD · Chi nhánh Hà Đông<br/>024 3999 0000</div></div>
 <div style={{textAlign:'center',fontWeight:800,margin:'12px 0 6px',fontSize:16}}>ĐƠN BÁN SO-0231</div><div style={{fontSize:13.5,color:MUT,textAlign:'center'}}>19/11/2026 · Công ty XD Bảo Long</div>
 <div style={{borderTop:'1px dashed #8493A8',margin:'10px 0'}}/>
 {OL.map(r=><div key={r[0]} style={{marginBottom:8}}><div style={{fontWeight:700}}>{r[0]}</div><div style={{display:'flex',justifyContent:'space-between',fontVariantNumeric:'tabular-nums'}}><span>{vn(r[2])} {r[1]} × {vn(r[3])}</span><b>{vn(r[2]*r[3])}</b></div></div>)}
 <div style={{borderTop:'1px dashed #8493A8',margin:'10px 0'}}/>
 <div style={{display:'flex',justifyContent:'space-between',fontSize:17,fontWeight:800}}><span>TỔNG</span><span>{money(olT)}</span></div>
 <div style={{textAlign:'center',fontSize:13,color:MUT,marginTop:14}}>Cảm ơn quý khách!</div></div></div>,480);
const DLP=[['Gạch ống 4 lỗ','viên',3000,2950],['Xi măng PCB40 (50 kg)','bao',40,40],['Cát vàng','m³',2,2]];
def('admin-print-delivery','In A4 · Phiếu giao','Print Template','In phiếu giao PG-0112 theo đơn: số cần giao, ô Khách nhận để điền tay, chỗ ký người giao và người nhận; không in giá.',()=><Paper title="PHIẾU GIAO HÀNG" sub="Số PG-0112 · Đơn SO-0228" meta={[['Khách hàng','Công ty Minh Phát · Long Biên'],['Giao tại','Khu CT Thanh Xuân'],['Xuất từ kho','Kho Đại Mỗ'],['Người giao','Lê Quang Huy · Xe điện'],['Khung giờ','08:00 – 11:00, 20/11/2026'],['Điện thoại','0977 222 333']]} sign={['Thủ kho','Người giao','Người nhận']}>
 <Tbl heads={['Mặt hàng','ĐVT','Cần giao','Khách nhận']} widths={['2.6fr','.7fr','1fr','1.2fr']} num={[2,3]} rows={DLP.map(r=>[<b>{r[0]}</b>,r[1],vn(r[2]),<span style={{display:'inline-block',minWidth:90,borderBottom:'1px dotted #8493A8'}}>&nbsp;</span>])} pad="12px 12px"/>
 <div style={{fontSize:14,color:MUT}}>Ghi chú: kiểm đếm tại chỗ, báo ngay nếu thiếu hoặc hư hỏng.</div></Paper>,874);
def('admin-print-receipt','In · Phiếu thu','Print Template','In phiếu thu PT-0216: số tiền bằng số và bằng chữ, phân bổ vào từng khoản, phần dư ghi tiền ứng trước.',()=><Paper title="PHIẾU THU" sub="Số PT-0216 · 20/11/2026" meta={[['Người nộp','Anh Nam · Nam Từ Liêm'],['Hình thức','Tiền mặt'],['Quỹ','Quỹ tiền mặt · Hà Đông'],['Lập bởi','Nguyễn Thị Lan']]} sign={['Người nộp tiền','Người lập phiếu','Thủ quỹ']}>
 <div style={{padding:16,border:`2px solid ${INK}`,borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:15}}>Số tiền thu</span><b style={{fontSize:26,fontVariantNumeric:'tabular-nums'}}>31.000.000 ₫</b></div>
 <div style={{fontSize:14.5}}>Bằng chữ: <i>Ba mươi mốt triệu đồng chẵn.</i></div>
 <Tbl heads={['Phân bổ vào','Hạn trả','Số tiền']} widths={['2fr','1.2fr','1.2fr']} num={[2]} rows={[[cd('SO-0194'),'02/11/2026','18.400.000 ₫'],[cd('SO-0198'),'02/11/2026','12.000.000 ₫'],['Tiền ứng trước của khách','—','600.000 ₫']]} total={['Tổng cộng','','31.000.000 ₫']} pad="10px 12px"/></Paper>,874);
const ST=[['01/10','Dư đầu kỳ','',30000000,0],['03/10','SO-0194 · Đơn bán',null,18400000,0],['03/10','SO-0198 · Đơn bán',null,12000000,0],['12/10','PT-0196 · Thu QR',null,0,20000000],['25/10','PT-0201 · Thu tiền mặt',null,0,10000000]];
let _d=0;const STR=ST.map(r=>{_d=_d+r[3]-r[4];return [r[0],r[1],r[3]?vn(r[3]):'',r[4]?vn(r[4]):'',vn(_d)];});
def('admin-print-statement','In A4 · Sao kê công nợ khách','Print Template','In sao kê công nợ Anh Nam 01/10–20/11/2026: dư đầu kỳ, phát sinh, đã thu, dư nợ cuối kỳ 30.400.000 ₫ khớp Phải thu; khoản quá hạn nêu rõ.',()=><Paper title="SAO KÊ CÔNG NỢ" sub="Kỳ 01/10/2026 – 20/11/2026" meta={[['Khách hàng','Anh Nam · Nam Từ Liêm'],['Mã khách','KH-0066'],['Hạn mức nợ','50.000.000 ₫'],['Quá hạn','30.400.000 ₫ (18 ngày)']]} sign={['Cửa hàng','Khách hàng xác nhận']}>
 <Tbl heads={['Ngày','Chứng từ','Phát sinh nợ','Đã thu','Dư nợ']} widths={['.8fr','2fr','1.2fr','1.2fr','1.2fr']} num={[2,3,4]} rows={STR} total={['Cuối kỳ','','60.400.000','30.000.000','30.400.000 ₫']} pad="10px 12px"/>
 <div style={{fontSize:14,color:MUT}}>Số dư cuối kỳ bằng tổng các khoản đang nợ: SO-0194 18.400.000 ₫ + SO-0198 12.000.000 ₫, cùng hạn 02/11/2026.</div></Paper>,874);
const PL=[['Thép phi 10 (cây 11,7 m)','cây',500,189000],['Thép phi 16 (cây 11,7 m)','cây',300,180000]];
def('admin-print-purchase','In A4 · Đơn mua','Print Template','In đơn mua PO-0087 gửi nhà cung cấp: hàng đặt, đơn giá mua, tổng 148.500.000 ₫; không in giá bán.',()=><Paper title="ĐƠN MUA HÀNG" sub="Số PO-0087 · 05/11/2026" meta={[['Nhà cung cấp','Thép Hòa Phát'],['Giao về','Kho Đại Mỗ'],['Ngày cần hàng','10/11/2026'],['Người lập','Nguyễn Thị Lan']]} sign={['Người lập','Nhà cung cấp xác nhận']}>
 <Tbl heads={['Mặt hàng','ĐVT','Số lượng','Đơn giá mua','Thành tiền']} widths={['2.4fr','.6fr','1fr','1.2fr','1.4fr']} num={[2,3,4]} rows={PL.map(r=>[<b>{r[0]}</b>,r[1],vn(r[2]),money(r[3]),money(r[2]*r[3])])} total={['Tổng cộng','','','',money(sum(PL.map(r=>r[2]*r[3])))]} pad="10px 12px"/></Paper>,874);

/* ---------- Zalo OA (D47) ---------- */
const SITEMS2=[...SITEMS,'Zalo OA'];
def('admin-settings-zalo','/admin/settings/zalo','Settings Panels + Form','Kết nối Zalo OA (D47): App ID nhập ở đây, Secret Key giữ trong Vault, token tự làm mới; 4 sự kiện gửi tin một chiều cho khách; chỉ roles.manage.',()=><SettingsPage group="Hệ thống" page="Cài đặt" sub="Hệ thống / Cài đặt" title="Zalo OA" items={SITEMS2} active={5}>
 <Sec title="Trạng thái kết nối" icon={ic(H.SignalIcon,20)} right={<Pill k="b">Đã kết nối</Pill>} pad>
  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>{[['Official Account','Hiền Xa Vật liệu'],['Token còn hiệu lực','18 giờ (tự làm mới khi còn dưới 6 giờ)'],['Lần làm mới gần nhất','20/11/2026 04:10']].map(([k,v])=><div key={k}><div className="hx-label">{k}</div><div style={{fontWeight:700,fontSize:15.5,marginTop:2}}>{v}</div></div>)}</div>
  <div style={{display:'flex',gap:12,marginTop:16,paddingTop:16,borderTop:`1px solid ${LINE}`,alignItems:'center'}}><span style={{flex:1,fontSize:14,color:MUT}}>Token và Secret Key nằm trong Vault, không bao giờ hiện lại. Nếu Zalo từ chối làm mới, trang này báo “Cần kết nối lại”.</span><Button variant="primary" label="Kết nối lại Zalo OA"/></div></Sec>
 <Sec title="Thông tin ứng dụng" icon={ic(H.KeyIcon,20)} pad><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
  <In l="App ID" v="1234567890123456789"/>
  <div><div className="hx-label" style={{marginBottom:6}}>Secret Key</div><div className="hx-in" style={{display:'flex',alignItems:'center',gap:8,background:'#F6F8FA',color:MUT}}>{ic(H.LockClosedIcon,18)}Đã lưu trong Vault, không hiện lại</div></div>
  <In l="Địa chỉ webhook (dán vào Zalo App)" v="https://erp.hienxa.vn/api/zalo/webhook" post={<Button variant="secondary" size="sm" label="Sao chép"/>}/>
  <In l="Địa chỉ OAuth callback" v="https://erp.hienxa.vn/api/zalo/oauth" post={<Button variant="secondary" size="sm" label="Sao chép"/>}/></div></Sec>
 <Sec title="4 sự kiện gửi cho khách" icon={ic(H.PaperAirplaneIcon,20)} pad={false} right={<span style={{fontSize:13.5,color:MUT}}>Gửi tới SĐT chính của khách · khách tắt được ở hồ sơ</span>}>
  <Tbl heads={['Sự kiện','Thời điểm gửi','Mẫu tin','Hôm nay','Bật']} widths={['1.6fr','2fr','1.2fr','.8fr','80px']} num={[3]}
   rows={[['Đơn được xác nhận','Khi đơn bán chuyển Đã xác nhận',<Pill k="b">Đã duyệt</Pill>,'12',<On/>],['Đã giao hàng','Khi xác minh phiếu giao (không gửi khi giao thất bại)',<Pill k="b">Đã duyệt</Pill>,'9',<On/>],['Đã nhận tiền','Mọi phiếu thu khách, tiền mặt hay chuyển khoản',<Pill k="b">Đã duyệt</Pill>,'7',<On/>],['Nhắc công nợ','Mỗi ngày 08:30 cho khoản đến hạn hoặc quá hạn',<Pill k="o">Chờ Zalo duyệt</Pill>,'10',<On/>]]} pad="13px 16px"/></Sec>
 <Sec title="Hàng đợi gần đây" pad={false}><Tbl heads={['Thời gian','Khách','Sự kiện','Kết quả']} widths={['1fr','1.6fr','1.4fr','2.2fr']}
  rows={[['10:42','Anh Dũng · Hoàng Mai','Đã nhận tiền',<Pill k="b">Đã gửi</Pill>],['09:15','Cô Hoa · Hà Đông','Nhắc công nợ',<Pill k="b">Đã gửi</Pill>],['08:30','Anh Nam · Nam Từ Liêm','Nhắc công nợ',<Pill k="n">Bỏ: số điện thoại không dùng Zalo</Pill>],['08:30','Công ty Minh Phát','Nhắc công nợ',<Pill k="o">Chờ: mẫu tin chưa được Zalo duyệt</Pill>]]} pad="11px 16px"/></Sec></SettingsPage>);

/* ---------- soạn thông báo (D83) ---------- */
const TA=({l,v,h=110,count})=><div style={{display:'flex',flexDirection:'column',gap:6}}><div style={{display:'flex',justifyContent:'space-between'}}><span className="hx-label">{l}</span>{count&&<span style={{fontSize:13.5,color:MUT}}>{count}</span>}</div><div className="hx-in" style={{minHeight:h,lineHeight:1.5}}>{v}</div></div>;
const ComposeBody=()=><Shell group="Hệ thống" page="Thông báo">
 <Title sub="Hệ thống / Thông báo / Soạn thông báo" right={<Button variant="primary" label="Gửi thông báo" icon={ic(H.PaperAirplaneIcon,18)}/>}>Soạn thông báo cập nhật</Title>
 <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
  <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:16}}>
   <Sec title="Gửi tới" pad><div style={{display:'flex',gap:12}}>{[['Khách hàng','187 khách có tài khoản cổng',1],['Thợ','6 người',0],['Nhân viên văn phòng','12 người',1]].map(([t,s,on])=><div key={t} style={{flex:1,padding:'12px 14px',borderRadius:12,border:`1.5px solid ${on?B:LINE}`,background:on?'#F3F8FE':'#fff'}}><Check on={!!on}><b>{t}</b></Check><div style={{fontSize:13.5,color:MUT,marginLeft:30}}>{s}</div></div>)}</div></Sec>
   <Sec title="Nội dung" pad><div style={{display:'flex',flexDirection:'column',gap:14}}>
    <div><div className="hx-label" style={{marginBottom:6}}>Nhãn</div><Seg items={['Cập nhật','Quan trọng','Bảo trì']} value="Cập nhật"/></div>
    <In l="Tiêu đề" v="Cổng khách có thêm mục Đặt lại đơn nhanh"/><div style={{fontSize:13.5,color:MUT,marginTop:-8,textAlign:'right'}}>40 / 80 ký tự</div>
    <TA l="Nội dung" v="Từ hôm nay bạn có thể đặt lại một đơn cũ chỉ với một lần bấm ở trang chủ cổng khách. Giá được tính theo bảng giá hiện hành của bạn." count="143 / 600 ký tự"/>
    <Check on>Hiện dạng cửa sổ một lần ở trang chủ và gửi thông báo đẩy</Check></div></Sec>
   <Sec title="Đã gửi gần đây" pad={false}><Tbl heads={['Gửi lúc','Tiêu đề','Gửi tới','Nhãn']} widths={['1.1fr','2.6fr','1.5fr','1fr']} rows={[['18/11 21:05','Điều phối hiện vị trí thợ trong ca','Nhân viên',<Pill k="b">Cập nhật</Pill>],['09/11 08:00','Giá bán thay đổi từ 10/11','Khách (tự động)',<Pill k="o">Giá</Pill>],['27/10 17:30','Bảo trì hệ thống tối nay','Khách, Thợ, Nhân viên',<Pill k="r">Bảo trì</Pill>]]} pad="11px 16px"/></Sec></div>
  <div style={{width:320,display:'flex',flexDirection:'column',gap:16}}><Sec title="Xem trước trên điện thoại" pad><div style={{borderRadius:18,border:`1px solid ${LINE}`,background:'#F2F5F9',padding:14}}><div style={{background:'#fff',borderRadius:14,padding:16,boxShadow:'0 8px 24px rgba(16,34,58,.12)'}}><Pill k="b">Cập nhật</Pill><div style={{fontWeight:800,fontSize:17,margin:'8px 0 4px'}}>Cổng khách có thêm mục Đặt lại đơn nhanh</div><div style={{fontSize:14.5,color:MUT,lineHeight:1.5}}>Từ hôm nay bạn có thể đặt lại một đơn cũ chỉ với một lần bấm…</div><div style={{marginTop:12,padding:'12px',borderRadius:10,background:B,color:'#fff',textAlign:'center',fontWeight:700}}>Đã hiểu</div></div></div></Sec>
   <Note title="Giá bán tự báo">Khi lưu bảng giá mới, hệ thống tự gửi riêng cho từng khách; không cần soạn ở đây.</Note></div></div></Shell>;
def('admin-notification-compose','/admin/notifications/compose','Form + Preview','Soạn thông báo cập nhật (D83): gửi tới Khách/Thợ/Nhân viên, nhãn, tiêu đề tối đa 80 ký tự, nội dung tối đa 600; hỏi lại trước khi gửi; có Đã gửi gần đây.',()=><ComposeBody/>);

/* ================= POPUP CHỨC NĂNG (UX-200) ================= */
const PopWrap=({Bg,w=580,top=70,icon,tone='b',title,sub,children,primary,ptone,second='Hủy',danger,dangerOnly,minH=860})=><div style={{position:'relative',width:1280,minHeight:minH,overflow:'hidden'}}>
 <div style={{filter:'blur(1.5px)'}}><Bg/></div>
 <div style={{position:'absolute',inset:0,background:'rgba(16,34,58,.50)',display:'flex',justifyContent:'center',paddingTop:top}}>
  <div className="hx-card" style={{width:w,height:'fit-content',boxShadow:'0 24px 64px rgba(16,34,58,.35)',overflow:'hidden'}}>
   <div style={{padding:'16px 22px',display:'flex',gap:12,alignItems:'center',borderBottom:`1px solid ${LINE}`}}><span style={{width:40,height:40,borderRadius:12,background:Tone[tone].bg,color:Tone[tone].fg,display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{ic(icon,22)}</span><div style={{flex:1,minWidth:0}}><b style={{fontSize:19}}>{title}</b>{sub&&<div style={{fontSize:14,color:MUT}}>{sub}</div>}</div>{ic(H.XMarkIcon,22,MUT)}</div>
   <div style={{padding:22,display:'flex',flexDirection:'column',gap:14}}>{children}</div>
   <div style={{padding:'14px 22px',background:'#F6F9FC',borderTop:`1px solid ${LINE}`,display:'flex',alignItems:'center',gap:10}}>
    {danger&&<Button variant="destructive" label={danger}/>}<span style={{flex:1}}/>
    <Button variant="ghost" label={second}/>
    {dangerOnly?<Button variant="destructive" label={dangerOnly}/>:ptone==='g'?<Btn k="g">{primary}</Btn>:<Button variant="primary" label={primary}/>}</div></div></div></div>;
const pop=(id,note,bg,cfg)=>def('admin-popup-'+id,'(hộp thoại)','Dialog Wizard',note,()=>{const Bg=BG(bg);return <PopWrap Bg={Bg} {...cfg}/>;});
const Row2=({children})=><div style={{display:'flex',gap:14}}>{children}</div>;
const Eff=({children,k='b',t='Hậu quả'})=><Note k={k} title={t}>{children}</Note>;
const Sel=({l,v,hint})=><In l={l} v={v} post={ic(H.ChevronRightIcon,16,MUT)} hint={hint}/>;

pop('gan-nhanh','Gán nhanh: người + xe + khung giờ hoặc đơn vị vận chuyển ngoài; kiểm tra trùng lịch trước khi lưu.','admin-dispatch',{icon:H.BoltIcon,title:'Gán nhanh PG-0120',sub:'Anh Tuấn · Cầu Giấy · 15 bao xi măng PCB40',primary:'Gán và báo thợ',children:<>
 <Seg items={['Nhân viên và xe','Đơn vị vận chuyển ngoài']} value="Nhân viên và xe"/>
 <Sel l="Người giao" v="Trần Văn Minh · Thợ chính"/><Sel l="Xe" v="Xe cn nhỏ · chở 1,5 tấn · Rảnh"/>
 <Row2><In l="Ngày giao" v="20/11/2026" pre={ic(H.CalendarDaysIcon,18,MUT)}/><In l="Từ giờ" v="12:00"/><In l="Đến giờ" v="14:00"/></Row2>
 <Note k="s" title="Không trùng lịch">Trần Văn Minh và Xe cn nhỏ rảnh từ 12:00 đến 14:00.</Note></>});
pop('thu-tien','Thu tiền: số tiền tự phân bổ khoản cũ nhất trước, phần dư phải tích tiền ứng trước.','admin-receivable-detail',{icon:H.BanknotesIcon,tone:'g',title:'Thu tiền của Anh Nam',sub:'KH-0066 · còn nợ 30.400.000 ₫',w:620,primary:'Ghi phiếu thu 31.000.000 ₫',ptone:'g',children:<>
 <MoneyBox l="Số tiền thu" v="31.000.000 ₫"/><Seg items={['Tiền mặt','Chuyển khoản QR']} value="Tiền mặt"/>
 <div style={{border:`1px solid ${LINE}`,borderRadius:10,overflow:'hidden'}}><Tbl heads={['Khoản','Còn nợ','Phân bổ']} widths={['1.2fr','1fr','1fr']} num={[1,2]} rows={[[cd('SO-0194'),'18.400.000 ₫',<b>18.400.000 ₫</b>],[cd('SO-0198'),'12.000.000 ₫',<b>12.000.000 ₫</b>]]} total={['Tổng','30.400.000 ₫','30.400.000 ₫']} pad="9px 14px"/></div>
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><Button variant="secondary" size="sm" label="Tự phân bổ lại" icon={ic(H.ArrowPathIcon,16)}/><span style={{color:B,fontWeight:700}}>Phần dư 600.000 ₫</span></div>
 <Check on>Ghi phần dư 600.000 ₫ là tiền ứng trước của khách</Check></>});
pop('chi-tien','Chi tiền cho nhà cung cấp: có lý do và chứng từ; ghi Sổ quỹ.','admin-payable-detail',{icon:H.WalletIcon,tone:'g',title:'Chi trả Thép Hòa Phát',sub:'Còn phải trả 98.100.000 ₫',primary:'Ghi phiếu chi 60.000.000 ₫',ptone:'g',children:<>
 <MoneyBox l="Số tiền chi" v="60.000.000 ₫" hint="Mặc định là khoản cũ nhất (PN-0199)."/><Seg items={['Tiền mặt','Chuyển khoản']} value="Chuyển khoản"/>
 <Row2><Sel l="Chi từ quỹ" v="Quỹ Ngân hàng"/><In l="Ngày chi" v="20/11/2026"/></Row2><In l="Số tham chiếu chứng từ" v="UNC-1120-014"/><In l="Lý do chi (bắt buộc)" v="Trả phiếu nhập PN-0199"/>
 <Eff>Giảm công nợ phải trả 60.000.000 ₫ và giảm số dư Quỹ Ngân hàng cùng số tiền.</Eff></>});
pop('chuyen-khoan','Sửa thông tin chuyển khoản hiện cho khách ở cổng (D39); tên chủ tài khoản tự viết hoa.','admin-cashbook',{icon:H.QrCodeIcon,title:'Sửa thông tin chuyển khoản',sub:'Quỹ Ngân hàng',primary:'Lưu thông tin',children:<>
 <In l="Ngân hàng" v="Ngân hàng TMCP Minh Họa"/><In l="Số tài khoản" v="0123 456 789"/><In l="Chủ tài khoản" v="CÔNG TY TNHH VẬT LIỆU HIỀN XA" hint="Tự viết hoa khi lưu."/>
 <Check on>Hiện cho khách ở cổng khách hàng</Check><Eff>Khách thấy số tài khoản này khi thanh toán công nợ bằng QR.</Eff></>});
pop('sepay','Tự ghi tiền về SePay (D42): bật/tắt, tiền tố nội dung; khớp thì tự lập phiếu thu.','admin-cashbook',{icon:H.BoltIcon,title:'Tự ghi tiền về (SePay)',sub:'Quỹ Ngân hàng',primary:'Lưu cài đặt',children:<>
 <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><b>Bật tự ghi tiền về</b><On/></div>
 <In l="Tiền tố nội dung (không bắt buộc)" v="SEVQR" hint="Ghi chú: ngân hàng dùng tiền tố SEVQR hoặc TKP; để trống nếu không dùng."/>
 <Eff>Giao dịch khớp mã đơn và số tiền sẽ tự lập phiếu thu; không khớp thì giữ ở “Giao dịch ngân hàng chờ xử lý”.</Eff></>});
pop('xu-ly-ngan-hang','Xử lý giao dịch ngân hàng chờ: chọn khách rồi Ghi phiếu thu, hoặc Bỏ qua không ghi sổ.','admin-cashbook',{icon:H.InboxArrowDownIcon,tone:'o',title:'Xử lý giao dịch chờ',sub:'19/11 09:12 · NH Minh họa · FT26323012',primary:'Ghi phiếu thu',ptone:'g',danger:'Bỏ qua, không ghi sổ',children:<>
 <div style={{padding:14,borderRadius:10,background:'#F6F9FC',border:`1px solid ${LINE}`,display:'flex',justifyContent:'space-between'}}><div><div className="hx-label">Nội dung chuyển khoản</div><b>NGUYEN VAN A TT SO0231</b></div><b style={{color:G,fontSize:20}}>12.000.000 ₫</b></div>
 <Note k="o" title="Lý do đang chờ">Tên người chuyển không khớp khách của đơn.</Note>
 <Sel l="Chọn khách nhận tiền" v="Công ty XD Bảo Long · nợ 45.600.000 ₫"/><Check on>Phân bổ vào khoản cũ nhất trước</Check>
 <Eff>Ghi phiếu thu vào Quỹ Ngân hàng và giảm công nợ khách 12.000.000 ₫. “Bỏ qua” giữ giao dịch ngoài sổ.</Eff></>});
pop('tao-phieu-chi','Tạo phiếu chi: danh mục, quỹ, số tiền, ảnh chứng từ; cần duyệt theo quyền.','admin-cashbook',{icon:H.WalletIcon,tone:'g',title:'Tạo phiếu chi',primary:'Lưu phiếu chi',ptone:'g',children:<>
 <Row2><Sel l="Danh mục" v="Nhiên liệu"/><Sel l="Chi từ quỹ" v="Quỹ tiền mặt"/></Row2><Row2><In l="Số tiền" v="1.200.000 ₫" num/><In l="Ngày chi" v="20/11/2026"/></Row2><In l="Diễn giải" v="Đổ dầu xe cn to"/>
 <div style={{border:'1.5px dashed #C7D2DF',borderRadius:10,padding:14,textAlign:'center',color:MUT,fontSize:14}}>{ic(H.PhotoIcon,26)}<div>Đính kèm ảnh chứng từ</div></div>
 <Eff>Phiếu chờ duyệt; khi được duyệt mới ghi Sổ quỹ và giảm số dư quỹ.</Eff></>});
pop('xac-minh-phieu','Xác minh phiếu giao: mới ghi công nợ phải thu theo số lượng khách nhận.','admin-delivery-detail',{icon:H.ClipboardDocumentCheckIcon,tone:'g',title:'Xác minh phiếu giao PG-0112',sub:'Công ty Minh Phát · Long Biên',w:620,primary:'Xác minh và ghi công nợ',ptone:'g',children:<>
 <div style={{border:`1px solid ${LINE}`,borderRadius:10,overflow:'hidden'}}><Tbl heads={['Hàng','Khách nhận','Thành tiền']} widths={['1.8fr','1fr','1.2fr']} num={[1,2]} rows={DLIN.map(r=>[r[0],vn(r[3])+' '+r[1],money(r[3]*r[4])])} total={['Tổng ghi nợ','',money(recv)]} pad="9px 14px"/></div>
 <Eff>Ghi công nợ phải thu {money(recv)} của Công ty Minh Phát và chốt tồn kho phiếu. Sau khi xác minh không sửa được, chỉ đảo có lý do.</Eff></>});
pop('delivery-leftover','Hồ sơ Hàng còn trên xe: tồn trên xe tách riêng khỏi tồn kho.','admin-delivery-detail',{icon:H.TruckIcon,title:'Hàng còn trên xe',sub:'PG-0112 · Xe điện',primary:'Ghi nhận hàng còn trên xe',children:<>
 <Row2><Sel l="Hàng" v="Gạch ống 4 lỗ"/><In l="Số lượng còn (viên)" v="50" num/></Row2>
 <div><div className="hx-label" style={{marginBottom:6}}>Xử lý</div><Seg items={['Giữ trên xe cho chuyến sau','Trả về kho']} value="Giữ trên xe cho chuyến sau"/></div><In l="Ghi chú" v="Khách nhận thiếu 50 viên so với phiếu"/>
 <Eff>Số lượng này tách riêng thành “Hàng trên xe”, không cộng vào Có thể bán cho tới khi nhập lại kho.</Eff></>});
pop('delivery-return','Hồ sơ Khách trả hàng khi giao: nhập lại kho, giảm công nợ.','admin-delivery-detail',{icon:H.ArrowUturnLeftIcon,title:'Khách trả hàng',sub:'PG-0112 · Công ty Minh Phát',primary:'Ghi nhận trả hàng',children:<>
 <Row2><Sel l="Hàng" v="Cát vàng"/><In l="Số lượng trả (m³)" v="0,5" num/></Row2><Sel l="Nhập về kho" v="Kho Đại Mỗ"/><In l="Lý do (bắt buộc)" v="Khách đặt dư, trả lại tại công trình"/>
 <Eff>Tăng tồn Kho Đại Mỗ 0,5 m³ và giảm công nợ khách 300.000 ₫ khi phiếu được xác minh.</Eff></>});
pop('delivery-shrink','Hồ sơ Hao hụt khi giao: chi phí hao hụt, không tính vào nợ khách.','admin-delivery-detail',{icon:H.ExclamationTriangleIcon,tone:'o',title:'Hao hụt khi giao',sub:'PG-0112 · cần giao 3.000, khách nhận 2.950',primary:'Ghi hao hụt',children:<>
 <Row2><Sel l="Hàng" v="Gạch ống 4 lỗ"/><In l="Số lượng hao hụt (viên)" v="50" num/></Row2><Sel l="Nguyên nhân" v="Vỡ khi vận chuyển"/><In l="Ghi chú" v="Xe điện đi đường xấu"/>
 <Eff k="o">Ghi chi phí hao hụt 62.500 ₫ vào kho; khách không bị tính số này và công nợ chỉ ghi theo số lượng nhận.</Eff></>});
pop('dao-giao-dich','Đảo giao dịch: số đã ghi không sửa, chỉ tạo giao dịch đảo có lý do (UX-200).','admin-cashbook',{icon:H.ArrowUturnLeftIcon,tone:'r',title:'Đảo giao dịch PC-0097?',sub:'19/11 14:05 · Phí vận chuyển ô tô · chi 1.500.000 ₫',dangerOnly:'Đảo giao dịch',second:'Giữ nguyên',children:<>
 <In l="Lý do đảo (bắt buộc)" v="Ghi nhầm quỹ, chi từ quỹ ngân hàng"/>
 <Eff k="o" t="Hậu quả rõ ràng">Tạo một giao dịch đảo ngược +1.500.000 ₫ ở Quỹ Ngân hàng. Giao dịch gốc vẫn hiện, bị gạch. Không thể hoàn tác thao tác này.</Eff></>});
pop('tinh-luong','Tính lương tháng: chọn tháng, tính lại bản tạm; không đụng kỳ đã chốt.','admin-payroll-detail',{icon:H.ArrowPathIcon,title:'Tính lương tháng',sub:'Chi nhánh Hà Đông',primary:'Tính lương tháng',children:<>
 <Sel l="Tháng" v="Tháng 11/2026"/><Check on>Tiền chuyến theo xe</Check><Check on>Theo đơn giá công việc</Check><Check on>Hoa hồng theo bậc</Check>
 <Note k="o" title="3 mục chưa có đơn giá, chưa tính tiền">Thép phi 16, Vận chuyển cát và xe Ô tô. Bổ sung đơn giá rồi tính lại.</Note><Eff>Thay bản tạm hiện tại bằng số mới; kỳ đã chốt giữ nguyên.</Eff></>});
pop('chi-tra-luong','Chi trả phiếu lương sau khi chốt kỳ: ghi Sổ quỹ.','admin-payroll-detail',{icon:H.WalletIcon,tone:'g',title:'Chi trả phiếu lương',sub:'Trần Văn Minh · tháng 10/2026 · còn phải trả 9.200.000 ₫',primary:'Chi trả 9.200.000 ₫',ptone:'g',children:<>
 <Sel l="Chi từ quỹ" v="Quỹ tiền mặt · Hà Đông"/><Row2><In l="Số tiền" v="9.200.000 ₫" num/><In l="Ngày chi" v="20/11/2026"/></Row2><Seg items={['Tiền mặt','Chuyển khoản']} value="Tiền mặt"/><In l="Tham chiếu" v="Lương T10 Minh"/>
 <Eff>Ghi phiếu chi vào Sổ quỹ và đánh dấu phiếu lương đã trả đủ.</Eff></>});
pop('chot-cong','Chốt kỳ chấm công: sau chốt không sửa công, muốn sửa phải mở lại có lý do.','admin-attendance',{icon:H.CalendarDaysIcon,title:'Chốt kỳ chấm công 11/2026?',sub:'12 nhân sự',primary:'Chốt kỳ chấm công',children:<>
 <Note k="o" title="2 ca chưa có giờ ra">Trần Văn Minh (18/11) và Ngô Văn Sơn (19/11). Nên sửa công trước khi chốt.</Note><Eff>Sau khi chốt, công tháng 11 không sửa trực tiếp; cần mở lại kỳ và ghi lý do.</Eff></>});
pop('sua-cong','Sửa công: cần lý do, giờ cũ giữ trong lịch sử.','admin-attendance',{icon:H.ClockIcon,title:'Sửa công',sub:'Trần Văn Minh · 18/11/2026',primary:'Lưu công',children:<>
 <Row2><In l="Giờ vào" v="07:58"/><In l="Giờ ra" v="17:05"/></Row2><In l="Lý do sửa (bắt buộc)" v="Quên bấm Ra ca, xác nhận qua điện thoại"/>
 <Eff>Giờ ra cũ (trống) được giữ trong lịch sử sửa công, ai sửa và lúc nào đều ghi nhật ký.</Eff></>});
pop('them-nhan-su','Thêm nhân sự: hồ sơ, vai trò, thiết lập lương, tài khoản cổng thợ.','admin-workforce',{icon:H.UserGroupIcon,title:'Thêm nhân sự',primary:'Thêm nhân sự',children:<>
 <Row2><In l="Họ tên" v="Vũ Văn Bình"/><In l="Số điện thoại" v="0905 123 456"/></Row2><Row2><Sel l="Vai trò" v="Thợ"/><Sel l="Thiết lập lương" v="Cố định 0 ₫ (trả theo chuyến, việc)"/></Row2>
 <Check on>Tạo tài khoản cổng thợ</Check><Eff>Mật khẩu tạm hiện một lần sau khi lưu; người này chỉ thấy việc của mình.</Eff></>});
pop('ngung-nhan-vien','Ngừng nhân viên: danh sách hậu quả rõ, không xóa lịch sử.','admin-workforce',{icon:H.NoSymbolIcon,tone:'r',title:'Ngừng làm việc: Phạm Đức Anh?',sub:'Thợ · tài khoản cổng thợ đang hoạt động',dangerOnly:'Ngừng nhân viên',second:'Giữ lại',children:<>
 <In l="Ngày nghỉ" v="20/11/2026"/><In l="Lý do (bắt buộc)" v="Nghỉ việc theo nguyện vọng"/>
 <Eff k="o" t="Hậu quả">Khóa đăng nhập cổng thợ ngay; 1 việc đang gán trở về Chờ phân giao; lương và chấm công cũ giữ nguyên. Chỉ xóa được người chưa có chứng từ nào.</Eff></>});
pop('vai-tro','Thêm vai trò: chọn quyền theo nhóm; không tự cấp quyền cao hơn mình.','admin-access',{icon:H.ShieldCheckIcon,title:'Thêm vai trò',primary:'Lưu vai trò',children:<>
 <In l="Tên vai trò" v="Điều phối viên"/><div className="hx-label">Quyền</div>
 <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>{[['Xem đơn bán',1],['Xem phiếu giao',1],['Điều phối giao hàng',1],['Xem công nợ',0],['Quản lý vật tư',0],['Xem sổ quỹ',0]].map(([t,on])=><Check key={t} on={!!on}>{t}</Check>)}</div>
 <Eff>Chỉ cấp được quyền bạn đang có; vai trò mới ghi vào nhật ký kiểm toán.</Eff></>});
pop('nguoi-dung','Thêm người dùng: vai trò, chi nhánh được vào, mật khẩu tạm một lần.','admin-access',{icon:H.UserIcon,title:'Thêm người dùng',primary:'Thêm người dùng',children:<>
 <Row2><In l="Họ tên" v="Nguyễn Minh Khôi"/><In l="Email" v="khoi@hienxa.vn"/></Row2><Row2><Sel l="Vai trò" v="Điều phối viên"/><Sel l="Chi nhánh" v="Hà Đông"/></Row2>
 <Eff>Hệ thống tạo mật khẩu tạm hiện một lần; người dùng phải đổi khi đăng nhập lần đầu.</Eff></>});
pop('service-schedule','Xếp lịch yêu cầu dịch vụ: tạo việc dịch vụ và báo khách.','admin-service-request-detail',{icon:H.CalendarDaysIcon,title:'Xếp lịch YC-0018',sub:'Cô Hoa · Máy trộn bê tông',primary:'Xếp lịch và báo khách',children:<>
 <Row2><In l="Ngày" v="21/11/2026"/><In l="Từ giờ" v="08:00"/><In l="Đến giờ" v="10:00"/></Row2><Sel l="Người thực hiện" v="Trần Văn Minh · Thợ chính"/><In l="Phí dịch vụ" v="1.200.000 ₫" num/>
 <Note k="s" title="Không trùng lịch">Trần Văn Minh rảnh 21/11 08:00–10:00.</Note><Eff>Tạo việc DV mới ở trạng thái Đã lên lịch và gửi thông báo cho khách.</Eff></>});
pop('service-reject','Từ chối yêu cầu dịch vụ: bắt buộc có lý do, khách thấy lý do.','admin-service-request-detail',{icon:H.NoSymbolIcon,tone:'r',title:'Từ chối yêu cầu YC-0018?',dangerOnly:'Từ chối yêu cầu',second:'Quay lại',children:<>
 <In l="Lý do (khách sẽ thấy)" v="Ngõ hẹp, máy trộn không vào được; xin gọi lại để đổi phương án."/><Eff k="o">Yêu cầu chuyển sang Đã từ chối và khách nhận thông báo kèm lý do. Khách có thể gửi yêu cầu mới.</Eff></>});
pop('loai-dich-vu','Thêm loại dịch vụ: tên, đơn vị tính, giá khách; đơn giá trả thợ nằm ở Đơn giá công việc.','admin-service-types',{icon:H.WrenchScrewdriverIcon,title:'Thêm loại dịch vụ',primary:'Thêm loại dịch vụ',children:<>
 <In l="Tên loại dịch vụ" v="Khoan cắt bê tông"/><Row2><Sel l="Đơn vị tính" v="Mét"/><In l="Giá tính khách (₫ mỗi đơn vị)" v="150.000" num/></Row2>
 <Eff>Loại mới hiện ở cổng khách. Chưa có đơn giá công việc thì phiếu lương ghi “Chưa có đơn giá, chưa tính tiền”.</Eff></>});
pop('xac-nhan-xoa','Xác nhận xóa chung: nêu rõ hậu quả, nút nguy hiểm tách khỏi nút an toàn (UX-200).','admin-catalog',{icon:H.TrashIcon||H.NoSymbolIcon,tone:'r',title:'Xóa nhóm vật tư “Sơn”?',dangerOnly:'Xóa nhóm vật tư',second:'Giữ lại',w:520,children:<>
 <Eff k="o" t="Hậu quả">Nhóm chưa có vật tư nào nên xóa được. Thao tác không hoàn tác; nhóm đã dùng thì chỉ ngừng được, không xóa.</Eff></>});
pop('xac-nhan-ngung','Xác nhận ngừng áp dụng chung (đơn giá, khoản thu nhập, xe...).','admin-payroll-work-rates',{icon:H.NoSymbolIcon,tone:'o',title:'Ngừng đơn giá “Cẩu hàng”?',dangerOnly:'Ngừng đơn giá',second:'Giữ lại',w:520,children:<>
 <Eff k="o" t="Hậu quả">Từ hôm nay việc cẩu hàng chưa có đơn giá, nên chưa tính tiền cho thợ. Phiếu lương đã chốt giữ nguyên.</Eff></>});
pop('notification-confirm','Hỏi lại trước khi gửi thông báo cập nhật (D83): nêu số người nhận.','admin-notification-compose',{icon:H.PaperAirplaneIcon,title:'Gửi cho 199 người?',sub:'187 khách và 12 nhân viên văn phòng',primary:'Gửi thông báo',w:520,children:<>
 <div style={{padding:14,borderRadius:10,background:'#F6F9FC',border:`1px solid ${LINE}`}}><Pill k="b">Cập nhật</Pill><div style={{fontWeight:700,margin:'6px 0 2px'}}>Cổng khách có thêm mục Đặt lại đơn nhanh</div><div style={{fontSize:14,color:MUT}}>143 / 600 ký tự</div></div>
 <Eff k="o">Thông báo gửi ngay, hiện một lần ở trang chủ kèm thông báo đẩy. Không thu hồi được.</Eff></>});
