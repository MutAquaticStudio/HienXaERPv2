import React from 'react';
import {Shell,Title,Chip,Btn,Btn0,money} from '../lib.jsx';
import {Button} from '@astryxdesign/core/Button';
import {Banner} from '@astryxdesign/core/Banner';
import {TextInput} from '@astryxdesign/core/TextInput';
import {TextArea} from '@astryxdesign/core/TextArea';
import {Selector} from '@astryxdesign/core/Selector';
import {Icon} from '@astryxdesign/core/Icon';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Stepper,Step} from '@astryxdesign/core/Stepper';
import {Switch} from '@astryxdesign/core/Switch';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {SegmentedControl,SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import * as HI from '@heroicons/react/24/outline';
export {Shell,Title,Chip,Btn,Btn0,money,Button,Banner,TextInput,TextArea,Selector,Icon,ProgressBar,Avatar,Stepper,Step,Switch,CheckboxInput,SegmentedControl,SegmentedControlItem,HI};

export const noop=()=>{};
export const M2=[];
export const mk=(M)=>(id,route,tpl,note,C,w=1280)=>M.push({id,route,tpl,note,C,w});
export const ic=(C,s=18,st)=>{const X=HI[C];return X?<X width={s} height={s} style={{flex:'none',...st}} aria-hidden="true"/>:null};
export const cd=t=><b className="hx-code">{t}</b>;
export const m=n=>money(n);
export const MUTED='#5A6B82',LINE='#E3E9F1',INK='#10223A',BLUE='#0B63C6',GREEN='#12804A',AMBER='#E8890C',RED='#B4291F';

/* ===== ô nhập (Astryx thật, chỉ trình bày) ===== */
export const Tx=({value,...p})=><TextInput value={value??''} onChange={noop} width="100%" {...p}/>;
export const Sel=({value,options,...p})=><Selector value={value} options={options||[value]} onChange={noop} width="100%" {...p}/>;
export const Ta=({value,rows=3,...p})=><TextArea value={value??''} rows={rows} onChange={noop} {...p}/>;
export const Cb=({value=false,label,...p})=><CheckboxInput value={value} label={label} onChange={noop} {...p}/>;
export const Sw=({value,label,description,...p})=><div><Switch value={value} label={label} onChange={noop} {...p}/>{description&&<div style={{fontSize:14,color:MUTED,margin:'2px 0 0 52px',lineHeight:1.4}}>{description}</div>}</div>;

/* ===== khối nền ===== */
export const Panel=({title,sub,right,children,pad=16,style,tone,id})=>
 <div className="hx-card" style={{overflow:'hidden',boxShadow:'0 1px 2px rgba(16,34,58,.04)',...(tone==='warn'?{borderColor:'#F3D18C'}:{}),...style}}>
  {title&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'13px 16px',borderBottom:'1px solid '+LINE,background:tone==='warn'?'#FFF8E8':'#FBFCFE'}}>
   <div style={{minWidth:0}}><div style={{fontSize:17,fontWeight:700,lineHeight:1.3}}>{title}</div>{sub&&<div style={{fontSize:13,color:MUTED,marginTop:2}}>{sub}</div>}</div>{right&&<div style={{display:'flex',gap:8,alignItems:'center',flex:'none'}}>{right}</div>}</div>}
  <div style={{padding:pad}}>{children}</div></div>;

export const Row=({l,v,b,c,big,border})=><div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12,padding:big?'10px 0 4px':'7px 0',borderTop:border?'1px solid '+LINE:'0'}}>
 <span style={{color:big?INK:MUTED,fontSize:big?15:14.5,fontWeight:big?700:500}}>{l}</span><span className="hx-num" style={{fontWeight:b||big?700:500,fontSize:big?24:15,color:c||INK}}>{v}</span></div>;

export const Pair=({children,cols=2,gap=14})=><div style={{display:'grid',gridTemplateColumns:`repeat(${cols},1fr)`,gap}}>{children}</div>;
export const Stack=({children,gap=16,style})=><div style={{display:'flex',flexDirection:'column',gap,...style}}>{children}</div>;
export const Cols=({left,right,rw=340,gap=20})=><div style={{display:'flex',gap,alignItems:'flex-start'}}><div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:16}}>{left}</div><div style={{width:rw,flex:'none',display:'flex',flexDirection:'column',gap:16}}>{right}</div></div>;

/* thông tin ngắn: nhãn nhỏ trên, giá trị dưới */
export const Fact=({l,v,sub,style})=><div style={style}><div style={{fontSize:13,color:MUTED,fontWeight:600}}>{l}</div><div style={{fontSize:15.5,fontWeight:600,marginTop:3}}>{v}</div>{sub&&<div style={{fontSize:13,color:MUTED,marginTop:1}}>{sub}</div>}</div>;
export const FactRow=({items})=><div style={{display:'flex',gap:0,background:'#fff',border:'1px solid '+LINE,borderRadius:12,marginBottom:16,overflow:'hidden'}}>{items.map((it,i)=><div key={i} style={{flex:it.flex||1,padding:'13px 18px',borderLeft:i?'1px solid '+LINE:'0'}}><Fact {...it}/></div>)}</div>;

/* ===== bảng dòng (dùng cùng lớp hx-th / hx-tr với lib để thừa hưởng giao diện chung) ===== */
export const DT=({heads,widths,num=[],ctr=[],rows,foot,pad})=>{const tpl=widths.join(' ');return <div>
 <div className="hx-th" style={{gridTemplateColumns:tpl,...(pad?{paddingLeft:pad,paddingRight:pad}:{})}}>{heads.map((h,i)=><span key={i} className={num.includes(i)?'hx-num':''} style={ctr.includes(i)?{textAlign:'center'}:null}>{h}</span>)}</div>
 {rows.map((r,i)=>{const cells=r.cells||r;return <div key={i} className="hx-tr" style={{gridTemplateColumns:tpl,fontWeight:r.total?700:400,background:r.total?'#F7F9FC':r.bg,...(r.total?{borderTop:'2px solid #C7D2DF'}:null),...(pad?{paddingLeft:pad,paddingRight:pad}:{}),...(r.style||{})}}>{cells.map((v,j)=><span key={j} className={num.includes(j)?'hx-num':''} style={{minWidth:0,...(ctr.includes(j)?{textAlign:'center'}:null)}}>{v}</span>)}</div>})}
 {foot}</div>};
/* ô lệch / ô nổi nền vàng */
export const Hl=({children,k='w'})=><span style={{display:'block',background:k==='w'?'#FFF1CC':k==='e'?'#FDEBE9':k==='s'?'#E5F4EC':'#E6F0FB',color:k==='w'?'#6B3A00':k==='e'?'#8A1C13':k==='s'?'#0D5A33':'#0A4A96',fontWeight:700,margin:'-8px -6px',padding:'8px 8px',borderRadius:6,textAlign:'right'}}>{children}</span>;
/* ô nhập nhỏ trong bảng */
export const Cell=({children,w,hint,k})=><span className="hx-in" style={{display:'inline-flex',justifyContent:'flex-end',padding:'6px 10px',fontSize:14.5,fontWeight:600,width:w||'100%',boxSizing:'border-box',background:k==='e'?'#FDEBE9':k==='w'?'#FFF8E8':k==='b'?'#E6F0FB':'#fff',borderColor:k==='e'?'#E9B8B3':k==='w'?'#F3D18C':k==='b'?'#0B63C6':'#C7D2DF',color:k==='b'?'#0A4A96':undefined,fontVariantNumeric:'tabular-nums'}}>{children}{hint&&<span style={{color:MUTED,fontWeight:500,marginLeft:6}}>{hint}</span>}</span>;
export const Nm=({n,sub,tag})=><div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:14.5,lineHeight:1.35}}>{n}</div>{(sub||tag)&&<div style={{fontSize:13,color:MUTED,marginTop:2,display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>{sub}{tag}</div>}</div>;
export const Tag=({children,k='i'})=>{const c={i:['#E6F0FB','#0A4A96'],s:['#E5F4EC','#0D5A33'],w:['#FFF1D6','#7A4300'],g:['#ECEFF3','#46556A'],e:['#FDEBE9','#8A1C13']}[k];return <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'1px 8px',borderRadius:6,fontSize:13,fontWeight:600,background:c[0],color:c[1],whiteSpace:'nowrap'}}>{children}</span>};
export const Go=({children,icon,full})=><span style={full?{display:'block'}:null}><Btn0 k="g">{icon&&ic(icon,18)}{children}</Btn0></span>;
export const Ib=({children,icon,k})=><Button variant={k==='p'?'primary':k==='d'?'destructive':k==='gh'?'ghost':'secondary'} label={children} icon={icon?<Icon icon={HI[icon]}/>:undefined}/>;
export const Full=({children})=><div style={{display:'flex',flexDirection:'column'}}><style>{`.fullb>*{width:100%}`}</style>{children}</div>;

/* nút rộng hết khung (cột phải) */
export const Wide=({k,icon,children})=>k==='g'
 ?<div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'13px 16px',borderRadius:10,background:GREEN,color:'#fff',fontWeight:700,fontSize:16,boxShadow:'0 2px 6px rgba(18,128,74,.28)'}}>{icon&&ic(icon,20)}{children}</div>
 :k==='p'?<div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'13px 16px',borderRadius:10,background:BLUE,color:'#fff',fontWeight:700,fontSize:16}}>{icon&&ic(icon,20)}{children}</div>
 :<div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'11px 16px',borderRadius:10,background:'#fff',border:'1px solid #C7D2DF',fontWeight:700,fontSize:15,color:INK}}>{icon&&ic(icon,18)}{children}</div>;

/* dải tìm hàng xanh trên bảng dòng hàng */
export const Band=({ph='Tìm hàng (F3) · mã, tên, thương hiệu',wh='Kho Đại Mỗ',right})=><div style={{background:'linear-gradient(180deg,#0B63C6,#0A58B0)',padding:'12px 14px',display:'flex',gap:10,alignItems:'center'}}>
 <div style={{flex:1,background:'#fff',borderRadius:8,padding:'9px 12px',display:'flex',alignItems:'center',gap:8,color:'#6A7B92',fontSize:15}}>{ic('MagnifyingGlassIcon',18,{color:BLUE})}<span style={{flex:1}}>{ph}</span><span style={{border:'1px solid #C7D2DF',borderRadius:5,padding:'0 6px',fontSize:13,fontWeight:700,color:MUTED,background:'#F2F5F9'}}>F3</span></div>
 {wh&&<div style={{background:'rgba(255,255,255,.14)',border:'1px solid rgba(255,255,255,.45)',borderRadius:8,padding:'9px 12px',display:'flex',alignItems:'center',gap:8,color:'#fff',fontWeight:600,fontSize:14.5}}>{ic('ArchiveBoxIcon',18)}<span style={{opacity:.85,fontWeight:500}}>Xem tồn tại</span> {wh} {ic('ChevronDownIcon',16)}</div>}{right}</div>;

/* tiêu đề trang + chip trạng thái bên cạnh */
export const PT=({sub,title,chips,actions})=><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:16,gap:16}}>
 <div><div style={{fontSize:13.5,color:MUTED,marginBottom:4}}>{sub}</div><div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}><h1 className="hx-title">{title}</h1>{chips}</div></div><div style={{display:'flex',gap:8,alignItems:'center'}}>{actions}</div></div>;

export const Fix=()=><style>{`.astryx-banner-description,.astryx-banner-description *{font-size:14px!important;line-height:1.45!important}.astryx-switch-label,.astryx-checkbox-label{font-size:15px!important;font-weight:600!important;color:#10223A}.astryx-step-label{font-size:15px!important;font-weight:700!important}`}</style>;
export const Pg=({group,page,sub,title,chips,actions,children,banner,w=1280})=><Shell group={group} page={page} w={w}><Fix/><PT sub={sub} title={title} chips={chips} actions={actions}/>{banner&&<div style={{marginBottom:16,display:'flex',flexDirection:'column',gap:10}}>{banner}</div>}{children}</Shell>;

/* tiến trình ngang kiểu "phiếu" cho trạng thái nghiệp vụ */
export const Flow=({steps,at})=><div style={{display:'flex',alignItems:'flex-start'}}>{steps.map((s,i)=>{const [t,d]=Array.isArray(s)?s:[s];const done=i<at,cur=i===at;return <div key={t} style={{flex:1,minWidth:0,position:'relative',display:'flex',flexDirection:'column',alignItems:'center',gap:6,textAlign:'center'}}>
  {i<steps.length-1&&<span style={{position:'absolute',top:14,left:'calc(50% + 20px)',width:'calc(100% - 40px)',height:2,background:done?GREEN:'#E3E9F1'}}/>}
  <span style={{width:30,height:30,borderRadius:'50%',background:done?GREEN:cur?BLUE:'#E3E9F1',color:done||cur?'#fff':MUTED,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:14,boxShadow:cur?'0 0 0 4px #DCEAF9':'none',position:'relative'}}>{done?ic('CheckIcon',16,{strokeWidth:3}):i+1}</span>
  <span style={{fontSize:13,fontWeight:cur?700:600,color:done||cur?INK:MUTED,lineHeight:1.25,padding:'0 2px'}}>{t}</span>{d&&<span style={{fontSize:13,color:MUTED,marginTop:-3}}>{d}</span>}</div>})}</div>;

/* thanh tiến trình nhỏ có nhãn */
export const Bar=({v,max=100,k='accent',l,r})=><div><div style={{display:'flex',justifyContent:'space-between',fontSize:14,color:'#3C4C63',marginBottom:5}}><span>{l}</span><span style={{fontWeight:600,color:INK}}>{r}</span></div><ProgressBar label={String(l||'tiến độ')} isLabelHidden value={v} max={max} variant={k}/></div>;

/* cửa sổ hộp thoại tĩnh */
export const Dlg=({title,sub,children,foot,w=520,icon})=><div style={{width:w,background:'#fff',borderRadius:16,boxShadow:'0 24px 60px rgba(16,34,58,.28), 0 0 0 1px rgba(16,34,58,.06)',overflow:'hidden'}}>
 <div style={{padding:'18px 22px 14px',display:'flex',gap:12,alignItems:'flex-start'}}>{icon}<div style={{flex:1}}><div style={{fontSize:19,fontWeight:700}}>{title}</div>{sub&&<div style={{fontSize:14,color:MUTED,marginTop:3}}>{sub}</div>}</div>{ic('XMarkIcon',22,{color:MUTED})}</div>
 <div style={{padding:'4px 22px 20px'}}>{children}</div>{foot&&<div style={{padding:'14px 22px',background:'#F7F9FC',borderTop:'1px solid '+LINE,display:'flex',justifyContent:'flex-end',gap:8}}>{foot}</div>}</div>;

export const Thumb=({label,h=150,w})=><div style={{height:h,width:w,borderRadius:10,background:'repeating-linear-gradient(135deg,#F2F5F9 0 10px,#E9EEF5 10px 20px)',border:'1px dashed #C7D2DF',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,color:MUTED,fontSize:13.5}}>{ic('PhotoIcon',30)}<span>{label}</span></div>;
export const Lock=({children})=><span style={{display:'inline-flex',alignItems:'center',gap:6,color:MUTED,fontSize:13.5}}>{ic('LockClosedIcon',15)}{children}</span>;
export const Link=({children})=><span style={{color:'#0B5CB8',fontWeight:600}}>{children}</span>;
export const Sum=({children})=><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',background:'#F7F9FC',borderTop:'1px solid '+LINE,fontSize:14.5}}>{children}</div>;
export const Dot=({k='g'})=><span style={{width:9,height:9,borderRadius:'50%',background:{g:'#9AA7B8',s:GREEN,w:AMBER,e:RED,i:BLUE}[k],display:'inline-block'}}/>;
