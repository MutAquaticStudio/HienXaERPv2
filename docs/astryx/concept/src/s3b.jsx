import React from 'react';
import {money} from './lib.jsx';
import {Avatar} from '@astryxdesign/core/Avatar';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {
 HomeIcon,ClipboardDocumentListIcon,PlusIcon,ChartBarIcon,BanknotesIcon,UserCircleIcon,EnvelopeIcon,ChevronLeftIcon,ChevronRightIcon,
 MagnifyingGlassIcon,MapPinIcon,TruckIcon,CheckIcon,ClockIcon,EyeIcon,ClipboardDocumentIcon,WrenchScrewdriverIcon,KeyIcon,PhoneIcon,
 ExclamationTriangleIcon,XMarkIcon,MinusIcon,ArrowPathIcon,CalendarDaysIcon,InformationCircleIcon,LockClosedIcon,PaperAirplaneIcon,
 BuildingOffice2Icon,UserGroupIcon,ArrowRightOnRectangleIcon,BuildingStorefrontIcon,UsersIcon,DocumentArrowDownIcon,CheckBadgeIcon,
 ChevronDownIcon,ShieldExclamationIcon,CubeIcon,ArrowTrendingUpIcon,MoonIcon,BellAlertIcon,SunIcon,ComputerDesktopIcon,SparklesIcon,PaintBrushIcon
} from '@heroicons/react/24/outline';
import {HomeIcon as HomeS,ClipboardDocumentListIcon as ClipS,ChartBarIcon as ChartS,BanknotesIcon as BankS,UserCircleIcon as UserS,CheckCircleIcon as CheckCircleS,TruckIcon as TruckS,PlusIcon as PlusS,ExclamationCircleIcon as ExclS} from '@heroicons/react/24/solid';

export const M=[]; const def=(id,route,tpl,note,C,w=390)=>M.push({id,route,tpl,note,C,w});

/* ---------- tokens ---------- */
const BLUE='#0B63C6',BLUE2='#0A4FA0',INK='#10223A',MUTE='#5A6B82',LINE='#E3E9F1',BG='#F2F5F9',GREEN='#12804A',AMB='#E8890C',RED='#B4291F';
const SH='0 1px 2px rgba(16,34,58,.05),0 10px 24px -12px rgba(16,34,58,.14)';
const T=(s,w=400,c=INK,x={})=>({fontSize:s,fontWeight:w,color:c,...x});
const num={fontVariantNumeric:'tabular-nums'};
const ic=(I,s=20,c)=>React.createElement(I,{width:s,height:s,strokeWidth:1.8,style:{flex:'none',color:c}});

/* ---------- atoms ---------- */
const Card=({children,style,pad=16,onDark})=><div style={{background:'#fff',border:'1px solid '+LINE,borderRadius:16,boxShadow:SH,padding:pad,...style}}>{children}</div>;
const CHIP={w:['#FFF1D6','#7A4300','#E8890C'],i:['#E6F0FB','#0A4A96','#0B63C6'],b:[BLUE,'#fff','#fff'],s:['#E5F4EC','#0D5A33','#12804A'],e:['#FDEBE9','#8A1C13','#B4291F'],g:['#ECEFF3','#46556A','#8793A5']};
const Chip=({k='g',children,dot=true,style})=>{const c=CHIP[k];return <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'3px 11px 3px 9px',borderRadius:999,background:c[0],color:c[1],fontSize:13,fontWeight:700,whiteSpace:'nowrap',...style}}>{dot&&<i style={{width:7,height:7,borderRadius:'50%',background:c[2],display:'block'}}/>}{children}</span>};
const BCOL={d:[RED,'0 8px 16px -8px rgba(180,41,31,.7)','#fff'],g:[GREEN,'0 8px 16px -8px rgba(18,128,74,.7)','#fff'],p:[BLUE,'0 8px 16px -8px rgba(11,99,198,.7)','#fff'],o:['#fff','none',BLUE],oe:['#fff','none',RED],w:['#fff','none',BLUE],q:['#E6F0FB','none','#0A4A96']};
const Btn=({k='p',children,Icon,h=54,style,right})=>{const c=BCOL[k];const bd=k==='o'?'1.5px solid '+BLUE:k==='oe'?'1.5px solid #E7B4AF':k==='w'?'1px solid '+LINE:'1px solid transparent';
 return <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,height:h,borderRadius:14,background:c[0],color:c[2],border:bd,boxShadow:c[1],fontSize:16.5,fontWeight:700,boxSizing:'border-box',...style}}>{Icon&&ic(Icon,20)}{children}{right&&ic(right,18)}</div>};
const Field=({label,value,ph,Icon,right,err,warn,hint,style,mono,disabled})=><div style={{display:'flex',flexDirection:'column',gap:6,...style}}>
 <span style={T(13.5,600,MUTE)}>{label}</span>
 <div style={{height:52,borderRadius:12,border:'1.5px solid '+(err?RED:warn?AMB:'#C7D2DF'),background:disabled?'#F2F5F9':'#fff',display:'flex',alignItems:'center',gap:10,padding:'0 14px',boxSizing:'border-box',boxShadow:err?'0 0 0 3px rgba(180,41,31,.10)':warn?'0 0 0 3px rgba(232,137,12,.16)':'inset 0 1px 2px rgba(16,34,58,.04)'}}>
  {Icon&&ic(Icon,20,'#8793A5')}
  <span style={{flex:1,fontSize:16.5,color:value?INK:'#8793A5',fontWeight:value?500:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',...(mono?num:{})}}>{value||ph}</span>{right}</div>
 {hint&&<span style={T(13,500,err?RED:MUTE)}>{hint}</span>}</div>;
const Mark=({s=32,tone='blue'})=><div style={{width:s,height:s,borderRadius:s*.3,flex:'none',background:tone==='white'?'#fff':'linear-gradient(145deg,#1B78DE,#0A4FA0)',display:'grid',placeItems:'center',color:tone==='white'?BLUE:'#fff',fontWeight:800,fontSize:s*.42,letterSpacing:'-.02em',boxShadow:tone==='white'?'0 6px 16px rgba(0,0,0,.18)':'inset 0 1px 0 rgba(255,255,255,.28),0 4px 10px -4px rgba(11,99,198,.6)'}}>HX</div>;

/* ---------- frame ---------- */
const NAV=[['home','Trang chủ',HomeIcon,HomeS],['orders','Đơn hàng',ClipboardDocumentListIcon,ClipS],['reports','Báo cáo',ChartBarIcon,ChartS],['debts','Công nợ',BanknotesIcon,BankS],['me','Tôi',UserCircleIcon,UserS]];
const TopBar=()=><div style={{height:60,flex:'none',background:'#fff',borderBottom:'1px solid '+LINE,display:'flex',alignItems:'center',gap:10,padding:'0 12px 0 16px'}}>
 <Mark/><div style={{lineHeight:1.15}}><div style={T(16.5,800,INK,{letterSpacing:'-.01em'})}>Hiền Xa</div><div style={T(13,500,MUTE)}>Cổng khách hàng</div></div><span style={{flex:1}}/>
 <div style={{position:'relative',width:44,height:44,display:'grid',placeItems:'center',color:INK}}>{ic(EnvelopeIcon,24)}<i style={{position:'absolute',top:5,right:3,minWidth:17,height:17,borderRadius:9,background:BLUE,border:'2px solid #fff',color:'#fff',fontSize:11,fontWeight:700,display:'grid',placeItems:'center',fontStyle:'normal',padding:'0 2px',boxSizing:'content-box'}}>2</i></div>
 <div style={{height:40,padding:'0 12px',borderRadius:10,border:'1px solid #C7D2DF',display:'flex',alignItems:'center',gap:6,fontSize:14,fontWeight:700,color:INK}}>{ic(ArrowRightOnRectangleIcon,18)}Đăng xuất</div></div>;
const BottomNav=({active})=><div style={{height:64,flex:'none',background:'#fff',borderTop:'1px solid '+LINE,display:'flex',boxShadow:'0 -6px 20px -14px rgba(16,34,58,.25)',position:'relative',zIndex:3}}>
 {NAV.map(([k,t,I,IS])=>{const on=k===active;
  const X=on?IS:I;return <div key={k} style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,borderTop:'3px solid '+(on?BLUE:'transparent'),color:on?'#0B5CB8':MUTE}}>
   <X width={24} height={24} strokeWidth={1.8}/><span style={T(13.5,on?800:600,on?'#0B5CB8':MUTE,{whiteSpace:'nowrap'})}>{t}</span></div>})}</div>;
const CP=({active,children,foot,noNav,noTop,fixed,gap=14,pad=16,bg=BG,style})=><div style={{width:390,height:fixed?844:undefined,minHeight:844,background:bg,display:'flex',flexDirection:'column',position:'relative',overflow:fixed?'hidden':'visible',...style}}>
 {!noTop&&<TopBar/>}
 <div className="cpc" style={{flex:1,padding:pad?`${pad}px ${pad}px 24px`:0,display:'flex',flexDirection:'column',gap,minHeight:0,overflow:fixed?'hidden':'visible'}}><style>{'.cpc>*{flex-shrink:0}'}</style>{children}</div>
 {foot&&<div style={{flex:'none',padding:'10px 16px 12px',background:'linear-gradient(to top,'+bg+' 70%,rgba(242,245,249,0))',position:'relative',zIndex:2}}>{foot}</div>}
 {!noNav&&<BottomNav active={active}/>}</div>;
const PageHead=({back,title,sub,right,chip})=><div style={{display:'flex',flexDirection:'column',gap:6}}>
 {back&&<div style={{display:'inline-flex',alignItems:'center',gap:2,height:36,marginLeft:-6,paddingRight:10,color:'#0B5CB8',fontSize:15.5,fontWeight:700,width:'fit-content'}}>{ic(ChevronLeftIcon,20)}{back}</div>}
 <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}><div style={{minWidth:0}}><h1 style={{margin:0,fontSize:24,fontWeight:800,letterSpacing:'-.02em',lineHeight:1.2,color:INK}}>{title}</h1>{(sub||chip)&&<div style={{display:'flex',alignItems:'center',gap:10,marginTop:6,flexWrap:'wrap',...T(14.5,500,MUTE)}}>{sub&&<span style={{lineHeight:1.45}}>{sub}</span>}{chip}</div>}</div>{right}</div></div>;
const Sec=({children,right})=><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 2px 0',minHeight:right?44:0}}><b style={T(17,800)}>{children}</b>{right&&<span style={T(15,700,'#0B5CB8',{minHeight:44,display:'inline-flex',alignItems:'center',padding:'0 4px'})}>{right}</span>}</div>;

/* ---------- auth frame ---------- */
const brickBg='repeating-linear-gradient(0deg,rgba(255,255,255,.055) 0 1px,transparent 1px 22px),repeating-linear-gradient(90deg,rgba(255,255,255,.04) 0 1px,transparent 1px 44px)';
const AuthFrame=({children,below,minH=844})=><div style={{width:390,minHeight:minH,background:BG,position:'relative',overflow:'hidden'}}>
 <div style={{height:214,background:'linear-gradient(160deg,#1478DC 0%,#0B63C6 45%,#0A4FA0 100%)',position:'relative'}}>
  <div style={{position:'absolute',inset:0,backgroundImage:brickBg}}/>
  <div style={{position:'absolute',right:-60,top:-70,width:240,height:240,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,255,255,.16),rgba(255,255,255,0) 68%)'}}/>
  <div style={{position:'relative',padding:'26px 20px 0',display:'flex',alignItems:'center',gap:12}}><Mark s={46} tone="white"/><div><div style={T(20,800,'#fff',{letterSpacing:'-.01em'})}>Hiền Xa</div><div style={T(14,500,'rgba(255,255,255,.85)')}>Vật liệu xây dựng · Cổng khách hàng</div></div></div></div>
 <div style={{position:'relative',margin:'-86px 16px 0',background:'#fff',borderRadius:20,border:'1px solid '+LINE,boxShadow:'0 2px 4px rgba(16,34,58,.04),0 24px 48px -20px rgba(16,34,58,.30)',padding:'22px 18px 20px'}}>{children}</div>
 {below&&<div style={{padding:'16px 24px 24px',textAlign:'center',fontSize:13.5,color:MUTE,lineHeight:1.55}}>{below}</div>}</div>;
const Eye=ic(EyeIcon,20,'#8793A5');

/* 1. register */
def('customer-register','/customer/register','Login Card + Form','Đăng ký tự phục vụ (UX-CUST-008). Số điện thoại trùng khách đang hoạt động: KHÔNG tạo khách mới, KHÔNG tự gắn; ghi yêu cầu chờ văn phòng duyệt (D78). Đây là trạng thái chờ (cam), không phải lỗi; nút đổi thành "Gửi yêu cầu chờ duyệt".',()=>
 <AuthFrame below="Không có email? Gọi cửa hàng để được tạo tài khoản bằng số điện thoại.">
  <h1 style={{margin:0,fontSize:24,fontWeight:800,letterSpacing:'-.02em'}}>Đăng ký tài khoản</h1>
  <div style={T(14.5,500,MUTE,{margin:'4px 0 14px'})}>Đặt hàng và theo dõi công nợ ngay trên điện thoại.</div>
  <div style={{display:'flex',gap:10,alignItems:'flex-start',background:'#FFF6E3',border:'1px solid #F3D9A4',borderRadius:12,padding:'12px 12px',marginBottom:16}}>
   <span style={{color:'#B26500',marginTop:1}}>{ic(ClockIcon,22)}</span>
   <div style={{fontSize:14,lineHeight:1.5,color:'#6B3F00'}}><b style={{display:'block',fontSize:15,color:'#5A3300',marginBottom:2}}>Số này cửa hàng đã có</b>Bấm "Gửi yêu cầu chờ duyệt", văn phòng sẽ kiểm tra rồi gọi lại cho anh/chị.</div></div>
  <div style={{display:'flex',flexDirection:'column',gap:14}}>
   <Field label="Họ tên hoặc tên cửa hàng" value="Nguyễn Văn Long"/>
   <Field label="Số điện thoại" value="0912 345 678" warn mono Icon={PhoneIcon}/>
   <Field label="Địa chỉ giao hàng" value="Km 12 Quốc lộ 6, Hà Đông, Hà Nội"/>
   <Field label="Email" value="long.baolong@example.vn"/>
   <Field label="Mật khẩu" value="••••••••••" right={Eye}/>
   <Field label="Nhập lại mật khẩu" value="••••••••••" right={Eye}/></div>
  <Btn k="p" style={{marginTop:20}}>Gửi yêu cầu chờ duyệt</Btn>
  <div style={{textAlign:'center',marginTop:14,fontSize:14.5,color:MUTE}}>Đã có tài khoản? <b style={{color:'#0B5CB8'}}>Đăng nhập</b></div>
 </AuthFrame>);
def('customer-register-pending','/customer/register (sau khi gửi)','Login Card + Result','Sau khi gửi: thay cả form bằng màn "Đã ghi yêu cầu" (màu chờ, không đỏ); khách được đăng xuất, mỗi lần đăng nhập lại vẫn báo như vậy tới khi văn phòng quyết (D78).',()=>
 <AuthFrame below="Cần gấp? Gọi cửa hàng để được hỗ trợ ngay.">
  <div style={{width:64,height:64,borderRadius:20,background:'#FFF1D6',color:'#B26500',display:'grid',placeItems:'center',margin:'4px auto 14px',boxShadow:'0 0 0 8px #FFF8EA'}}>{ic(ClockIcon,34)}</div>
  <h1 style={{margin:0,fontSize:24,fontWeight:800,letterSpacing:'-.02em',textAlign:'center'}}>Đã ghi yêu cầu</h1>
  <div style={T(15.5,500,MUTE,{margin:'10px 0 16px',lineHeight:1.6,textAlign:'center'})}>Số điện thoại <b style={{color:INK,...num}}>0912 345 678</b> đã có trong danh sách khách của cửa hàng. Văn phòng sẽ kiểm tra rồi gọi lại cho anh/chị. Anh/chị chưa cần đăng ký lại.</div>
  <div style={{background:'#FFF6E3',border:'1px solid #F3D9A4',borderRadius:12,padding:'11px 14px',display:'flex',alignItems:'center',gap:10,fontSize:14.5,fontWeight:700,color:'#6B3F00'}}>{ic(ClockIcon,20,'#B26500')}Trạng thái: chờ văn phòng duyệt</div>
  <Btn k="p" style={{marginTop:18}}>Về đăng nhập</Btn>
 </AuthFrame>);

/* 2. login */
const Tab=({Icon,t,on})=><div style={{flex:1,minWidth:0,height:52,borderRadius:10,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:1,background:on?'#fff':'transparent',boxShadow:on?'0 1px 3px rgba(16,34,58,.14)':'none',color:on?'#0B5CB8':MUTE,fontWeight:on?800:600,fontSize:13}}>{ic(Icon,19)}<span style={{whiteSpace:'nowrap'}}>{t}</span></div>;
def('customer-login','/customer/login','Login Card','Một thẻ duy nhất (D30): tab Vận hành / Thợ & tài xế / Khách hàng, logo công ty (D49), ô "Email hoặc số điện thoại", Đăng ký tài khoản.',()=>
 <AuthFrame below={<>Máy này nhớ cổng bạn dùng lần trước<br/>Quên tài khoản: hỏi quản lý cửa hàng</>}>
  <h1 style={{margin:0,fontSize:24,fontWeight:800,letterSpacing:'-.02em'}}>Đăng nhập</h1>
  <div style={{display:'flex',gap:4,padding:4,background:'#EDF1F6',borderRadius:13,margin:'14px 0 10px'}}><Tab Icon={BuildingOffice2Icon} t="Vận hành"/><Tab Icon={TruckIcon} t="Thợ & tài xế"/><Tab Icon={UserGroupIcon} t="Khách hàng" on/></div>
  <div style={T(14.5,500,MUTE,{marginBottom:16,lineHeight:1.45})}>Dành cho khách đặt hàng, theo dõi giao hàng và công nợ.</div>
  <div style={{display:'flex',flexDirection:'column',gap:14}}>
   <Field label="Email hoặc số điện thoại" value="0912 345 678" Icon={UserCircleIcon} mono/>
   <Field label="Mật khẩu" value="••••••••••" Icon={LockClosedIcon} right={Eye}/></div>
  <Btn k="p" style={{marginTop:20}}>Đăng nhập</Btn>
  <div style={{textAlign:'center',marginTop:14,fontSize:15,fontWeight:700,color:'#0B5CB8'}}>Quên mật khẩu?</div>
  <div style={{height:1,background:LINE,margin:'18px -18px 16px'}}/>
  <div style={{textAlign:'center',fontSize:15,color:MUTE}}>Chưa có tài khoản?</div>
  <Btn k="o" h={52} style={{marginTop:10}}>Đăng ký tài khoản</Btn>
 </AuthFrame>);

/* ---------- order data ---------- */
const ST={dg:['b','Đang giao'],cd:['w','Chờ duyệt'],dd:['i','Đã duyệt'],gi:['s','Hoàn tất'],hu:['e','Đã hủy']};
const SC=({s})=><Chip k={ST[s][0]}>{ST[s][1]}</Chip>;
const LINES=[['Xi măng PC40 Hoàng Thạch','200 bao','89.000 ₫','17.800.000 ₫'],['Cát xây','25 m³','280.000 ₫','7.000.000 ₫'],['Gạch ống 4 lỗ','8.000 viên','1.800 ₫','14.400.000 ₫'],['Đá 1×2','20 m³','320.000 ₫','6.400.000 ₫']];

/* 3. home */
const Rule=()=><div style={{height:1,background:LINE}}/>;
def('customer-home','/customer','Dashboard Cards (điện thoại)','Mã khách + tên; thẻ xanh đơn đang giao với thanh tiến độ và "Xe tới khoảng HH:mm"; Đặt lại nhanh 2 thẻ; dòng công nợ; Đơn gần đây (UX-FB18-001).',()=>
 <CP active="home" gap={16}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'2px 2px 0'}}>
   <div style={{minWidth:0}}><div style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,fontWeight:700,color:'#0A4A96',background:'#E6F0FB',padding:'3px 10px',borderRadius:8,...num}}>KH-0102</div>
    <div style={T(24,800,INK,{letterSpacing:'-.02em',margin:'6px 0 2px',lineHeight:1.2})}>Công ty XD Bảo Long</div>
    <div style={T(14.5,500,MUTE)}>Hiền Xa · Vật liệu xây dựng</div></div>
   <Avatar name="Bảo Long" size={48} shape="rounded"/></div>
  <div style={{position:'relative',overflow:'hidden',borderRadius:20,color:'#fff',padding:'18px 18px 16px',background:'linear-gradient(150deg,#1478DC 0%,#0B63C6 48%,#0A4592 100%)',boxShadow:'0 20px 36px -18px rgba(11,99,198,.75),0 2px 4px rgba(11,99,198,.2)'}}>
   <div style={{position:'absolute',inset:0,backgroundImage:brickBg}}/>
   <div style={{position:'absolute',right:-14,top:-6,opacity:.12}}><TruckS width={128} height={128}/></div>
   <div style={{position:'relative'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
     <span style={{display:'inline-flex',alignItems:'center',gap:7,background:'rgba(255,255,255,.18)',border:'1px solid rgba(255,255,255,.28)',padding:'3px 11px',borderRadius:999,fontSize:13,fontWeight:700}}><i style={{width:8,height:8,borderRadius:'50%',background:'#7CF0B0',boxShadow:'0 0 0 4px rgba(124,240,176,.28)'}}/>Đang giao</span>
     <span style={T(13.5,600,'rgba(255,255,255,.85)')}>SO-0231</span></div>
    <div style={{marginTop:12,fontSize:14,fontWeight:600,color:'rgba(255,255,255,.85)'}}>Xe tới khoảng</div>
    <div style={{fontSize:40,fontWeight:800,letterSpacing:'-.03em',lineHeight:1.05,...num}}>14:30</div>
    <div style={{display:'flex',alignItems:'center',gap:6,marginTop:8,fontSize:14.5,fontWeight:500,color:'rgba(255,255,255,.95)'}}>{ic(MapPinIcon,17)}CT Nhà xưởng Hà Đông</div>
    <div style={{marginTop:16,height:8,borderRadius:99,background:'rgba(255,255,255,.24)',position:'relative'}}><div style={{width:'70%',height:'100%',borderRadius:99,background:'#fff',boxShadow:'0 0 14px rgba(255,255,255,.7)'}}/></div>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:8,fontSize:13,fontWeight:600,color:'rgba(255,255,255,.94)'}}><span>Đã đặt</span><span>Cửa hàng duyệt</span><span style={{color:'#fff',fontWeight:800,textDecoration:'underline',textUnderlineOffset:4}}>Đang giao</span><span>Hoàn tất</span></div></div></div>
  <Btn k="g" Icon={PlusIcon}>Đặt hàng mới</Btn>
  <div style={{display:'flex',alignItems:'center',gap:10,background:'#FFF6E3',border:'1px solid #F3D9A4',borderRadius:12,padding:'10px 12px',fontSize:14.5,fontWeight:600,color:'#6B3F00'}}>{ic(ClockIcon,20,'#B26500')}<span style={{flex:1}}>1 đơn đang chờ cửa hàng duyệt</span>{ic(ChevronRightIcon,18,'#B26500')}</div>
  <div><Sec>Đặt lại nhanh</Sec>
   <div style={{display:'flex',gap:10,marginTop:10}}>
    {[['18/11 · CT Hà Đông','SO-0231','200 bao Xi măng · 25 m³ Cát'],['14/11 · CT Cầu Giấy','SO-0224','80 bao Xi măng · 6 m³ Đá 1×2']].map(([a,b,c])=><Card key={b} pad={13} style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:6}}>
     <div style={T(13,600,MUTE)}>{a}</div><div style={T(14.5,800,'#0B5CB8')}>{b}</div><div style={T(14.5,500,INK,{lineHeight:1.4,minHeight:40})}>{c}</div>
     <div style={{height:44,borderRadius:11,border:'1.5px solid '+BLUE,color:BLUE,display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontSize:15,fontWeight:700,marginTop:2}}>{ic(ArrowPathIcon,17)}Đặt lại</div></Card>)}</div></div>
  <Card pad={0}><div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px'}}>
   <div style={{width:44,height:44,borderRadius:12,background:'#E6F0FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(BanknotesIcon,24)}</div>
   <div style={{flex:1,minWidth:0}}><div style={T(13.5,600,MUTE)}>Công nợ còn lại</div><div style={T(20,800,INK,{...num,letterSpacing:'-.01em',whiteSpace:'nowrap'})}>58.900.000 ₫</div></div>
   <Chip k="e">Quá hạn</Chip>{ic(ChevronRightIcon,18,'#8793A5')}</div></Card>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:14.5,color:MUTE,padding:'0 2px'}}><span>Hôm qua anh/chị đặt 3 món</span><b style={{color:'#0B5CB8'}}>Xem báo cáo ›</b></div>
  <div><Sec right="Xem tất cả">Đơn gần đây</Sec>
   <Card pad={0} style={{marginTop:10}}>{[['SO-0233','CT Hà Đông · 19/11','cd'],['SO-0229','CT Cầu Giấy · 17/11','dd'],['SO-0224','CT Cầu Giấy · 14/11','gi']].map(([c,p,s],i)=><div key={c} style={{display:'flex',alignItems:'center',gap:10,padding:'13px 16px',borderTop:i?'1px solid '+LINE:0}}>
    <div style={{flex:1,minWidth:0}}><div style={T(15.5,800,'#0B5CB8')}>{c}</div><div style={T(13.5,500,MUTE,{marginTop:2})}>{p}</div></div><SC s={s}/>{ic(ChevronRightIcon,16,'#8793A5')}</div>)}</Card></div>
 </CP>);

/* 4. orders */
const OCard=({c,s,p,g,d,m,more})=><Card pad={0} style={{overflow:'hidden'}}>
 <div style={{padding:'14px 16px 12px'}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={T(16.5,800,'#0B5CB8',num)}>{c}</span><SC s={s}/></div>
  <div style={T(14,500,MUTE,{marginTop:6})}>{p}</div>
  <div style={T(15,500,INK,{marginTop:8,lineHeight:1.45})}>{g}{more&&<span style={{color:MUTE}}> · {more}</span>}</div></div>
 <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 16px',background:'#F8FAFC',borderTop:'1px solid '+LINE}}>
  <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13.5,fontWeight:600,color:MUTE}}>{ic(CalendarDaysIcon,16)}{d}</span><span style={T(16,800,INK,num)}>{m}</span></div></Card>;
const Pill=({on,children,count,sm})=><span style={{flex:sm?1:'none',justifyContent:'center',whiteSpace:'nowrap',height:40,padding:sm?'0 4px':'0 14px',borderRadius:999,display:'inline-flex',alignItems:'center',gap:6,fontSize:sm?14:14.5,fontWeight:on?800:600,background:on?BLUE:'#fff',color:on?'#fff':INK,border:'1.5px solid '+(on?BLUE:'#D5DDE8'),boxShadow:on?'0 6px 12px -6px rgba(11,99,198,.6)':'none'}}>{children}{count!=null&&<span style={{fontSize:13,opacity:.85}}>{count}</span>}</span>;
def('customer-orders','/customer/orders','Filterable Table (thẻ dọc)','Mỗi đơn một thẻ; cổng khách chỉ có nhãn "Đã duyệt" cho mọi đơn đã xác nhận chưa giao (D48); hai thẻ Hàng hóa / Dịch vụ.',()=>
 <CP active="orders">
  <PageHead title="Đơn hàng" sub="Đơn của Công ty XD Bảo Long"/>
  <Btn k="g" Icon={PlusIcon}>Đặt hàng mới</Btn>
  <div style={{display:'flex',padding:4,background:'#E4EAF2',borderRadius:13}}>{['Hàng hóa','Dịch vụ'].map((t,i)=><div key={t} style={{flex:1,height:44,borderRadius:10,display:'grid',placeItems:'center',fontSize:15.5,fontWeight:i?600:800,background:i?'transparent':'#fff',color:i?MUTE:'#0B5CB8',boxShadow:i?'none':'0 1px 3px rgba(16,34,58,.15)'}}>{t}</div>)}</div>
  <div style={{display:'flex',gap:8,margin:'0 -16px',padding:'0 16px',overflow:'hidden'}}><Pill on count={5}>Tất cả</Pill><Pill>Chờ duyệt</Pill><Pill>Đã duyệt</Pill><Pill>Đang giao</Pill><Pill>Đã giao</Pill></div>
  <OCard c="SO-0233" s="cd" p="CT Nhà xưởng Hà Đông · Đặt hôm nay 08:12" g="150 cây Thép phi 10 CB300" d="Muốn nhận 21/11" m="19.950.000 ₫"/>
  <OCard c="SO-0231" s="dg" p="CT Nhà xưởng Hà Đông · Đặt 18/11" g="200 bao Xi măng PC40" more="còn 3 loại" d="Giao hôm nay · ~14:30" m="45.600.000 ₫"/>
  <OCard c="SO-0229" s="dd" p="CT Văn phòng Cầu Giấy · Đặt 17/11" g="5.000 viên Gạch ống 4 lỗ" d="Dự kiến giao 22/11" m="9.000.000 ₫"/>
  <OCard c="SO-0224" s="gi" p="CT Văn phòng Cầu Giấy · Đặt 14/11" g="80 bao Xi măng PC40" more="1 loại" d="Hoàn tất 15/11" m="7.120.000 ₫"/>
 </CP>);

/* 5. order-new */
const Seg=({items,on})=><div style={{display:'inline-flex',padding:3,background:'#E8EDF4',borderRadius:13}}>{items.map(t=><span key={t} style={{height:44,minWidth:68,padding:'0 14px',borderRadius:10,display:'grid',placeItems:'center',fontSize:16,fontWeight:t===on?800:600,background:t===on?'#fff':'transparent',color:t===on?'#0B5CB8':'#3C4B63',boxShadow:t===on?'0 1px 3px rgba(16,34,58,.18)':'none'}}>{t}</span>)}</div>;
const Stepper=({n,u,h=56,bw=72})=><div style={{display:'flex',alignItems:'stretch',width:'100%'}}>
 <div style={{width:bw,height:h,borderRadius:'14px 0 0 14px',border:'1.5px solid '+BLUE,color:BLUE,display:'grid',placeItems:'center',background:'#fff'}}>{ic(MinusIcon,28)}</div>
 <div style={{flex:1,height:h,borderTop:'1.5px solid '+BLUE,borderBottom:'1.5px solid '+BLUE,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',lineHeight:1.05,background:'#F4F8FE'}}><b style={T(22,800,INK,num)}>{n}</b><span style={T(13,600,MUTE)}>{u}</span></div>
 <div style={{width:bw,height:h,borderRadius:'0 14px 14px 0',background:BLUE,color:'#fff',display:'grid',placeItems:'center'}}>{ic(PlusIcon,28)}</div></div>;
const PCard=({name,kind,price,unit,stock,units,on,n,u,conv})=><Card pad={14} style={{display:'flex',flexDirection:'column',gap:10,borderColor:on?'#9DBFEA':LINE,background:on?'#FBFDFF':'#fff'}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:10}}><div style={{minWidth:0}}><div style={T(16.5,800)}>{name}</div><div style={T(13.5,500,MUTE,{marginTop:2})}>{kind}</div></div>
  <div style={{textAlign:'right',flex:'none'}}><div style={T(18,800,BLUE,num)}>{price}</div><div style={T(13,600,MUTE)}>/ {unit}</div></div></div>
 <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><Chip k={stock?'s':'w'}>{stock?'Còn hàng':'Đặt trước'}</Chip>{units&&<Seg items={units} on={u}/>}</div>
 {conv&&<div style={T(13.5,500,MUTE)}>{conv}</div>}
 {on?<><div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between'}}><span style={T(13.5,600,MUTE)}>Thành tiền</span><b style={T(18,800,INK,num)}>{on}</b></div><Stepper n={n} u={u}/></>
  :<Btn k="o" h={52} Icon={PlusIcon}>Thêm</Btn>}</Card>;
const SumBar=({n,total,label='Xem & gửi đơn'})=><div style={{height:64,borderRadius:18,background:'linear-gradient(135deg,#1478DC,#0B63C6 55%,#0A4FA0)',color:'#fff',display:'flex',alignItems:'center',gap:10,padding:'0 10px',boxShadow:'0 14px 26px -10px rgba(11,99,198,.8),0 2px 4px rgba(11,99,198,.3)'}}>
 <div style={{minWidth:38,height:38,borderRadius:12,background:'rgba(255,255,255,.2)',display:'grid',placeItems:'center',fontSize:18,fontWeight:800,...num}}>{n}</div>
 <div style={{flex:1,minWidth:0,lineHeight:1.2}}><div style={T(12.5,600,'rgba(255,255,255,.88)',{whiteSpace:'nowrap'})}>Tạm tính theo bảng giá</div><div style={T(19,800,'#fff',{...num,whiteSpace:'nowrap'})}>{total}</div></div>
 <div style={{height:44,padding:'0 10px 0 12px',borderRadius:12,background:'#fff',color:'#0B5CB8',display:'flex',alignItems:'center',gap:2,fontSize:14.5,fontWeight:800,whiteSpace:'nowrap',flex:'none'}}>{label}{ic(ChevronRightIcon,16)}</div></div>;
const NewBody=()=><>
 <PageHead back="Trang chủ" title="Đặt hàng"/>
 <Card pad={14} style={{display:'flex',alignItems:'center',gap:12}}><div style={{width:42,height:42,borderRadius:12,background:'#E6F0FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(MapPinIcon,22)}</div>
  <div style={{flex:1,minWidth:0}}><div style={T(13,600,MUTE)}>Công trình / điểm giao</div><div style={T(16,800)}>CT Nhà xưởng Hà Đông</div><div style={T(13.5,500,MUTE,{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'})}>Km 12 QL6 · Anh Long 0912 345 678</div></div>{ic(ChevronDownIcon,20,'#8793A5')}</Card>
 <div style={{display:'flex',flexDirection:'column',gap:6}}><span style={T(13.5,600,MUTE)}>Tìm hàng</span><div style={{height:52,borderRadius:14,border:'1.5px solid #C7D2DF',background:'#fff',display:'flex',alignItems:'center',gap:10,padding:'0 14px'}}>{ic(MagnifyingGlassIcon,22,'#8793A5')}<span style={T(16.5,400,'#8793A5')}>Tìm xi măng, thép, cát…</span></div></div>
 <div style={{display:'flex',gap:8,margin:'0 -16px',padding:'0 16px',overflow:'hidden'}}><Pill on>Tất cả</Pill><Pill count={2}>Đã chọn</Pill><Pill>Xi măng</Pill><Pill>Thép</Pill><Pill>Cát đá</Pill><Pill>Gạch</Pill></div>
 <PCard name="Xi măng PC40 Hoàng Thạch" kind="Loại PCB40 · XM-0101" price="89.000 ₫" unit="bao" stock units={['bao','tấn']} u="bao" conv="1 tấn = 20 bao · giá tính theo đơn vị đang chọn" on="17.800.000 ₫" n="200"/>
 <PCard name="Cát xây" kind="Cát vàng sàng · CA-0102" price="280.000 ₫" unit="m³" stock on="7.000.000 ₫" n="25" u="m³"/>
 <PCard name="Thép phi 10 CB300" kind="Cây 11,7 m · TH-0103" price="133.000 ₫" unit="cây" units={['cây','kg']} u="cây"/>
 <PCard name="Đá 1×2" kind="Đá xanh · DA-0104" price="320.000 ₫" unit="m³"/></>;
def('customer-order-new','/customer/orders/new','Checkout Form','Thẻ Công trình, ô tìm, nút lọc Tất cả · Đã chọn · nhóm; mỗi hàng một thẻ; Thêm → − số + (bộ đếm 72 px); thanh xanh cố định trên menu dưới (UX-FB18-001).',()=>
 <CP active="orders" fixed foot={<SumBar n={2} total="24.800.000 ₫"/>}><NewBody/></CP>);

/* 6. order-review (sheet) */
const Dim=({children})=><div style={{position:'absolute',inset:0,zIndex:5,background:'rgba(11,28,50,.55)',backdropFilter:'blur(2px)',display:'flex',alignItems:'flex-end'}}>{children}</div>;
def('customer-order-review','/customer/orders/new (popup)','Dialog / Bottom Sheet','"Xem lại đơn": giao tới, giờ muốn nhận, ghi chú, bảng hàng, tạm tính; Gửi đơn / Sửa đơn. Cửa hàng duyệt rồi báo ngày giao, chưa giữ hàng cho tới khi duyệt.',()=>
 <CP active="orders" fixed><div style={{opacity:.9,display:'flex',flexDirection:'column',gap:14}}><NewBody/></div>
  <Dim><div style={{width:'100%',maxHeight:790,background:'#fff',borderRadius:'24px 24px 0 0',display:'flex',flexDirection:'column',boxShadow:'0 -20px 50px rgba(0,0,0,.25)'}}>
   <div style={{display:'grid',placeItems:'center',paddingTop:10}}><i style={{width:44,height:5,borderRadius:3,background:'#D5DDE8'}}/></div>
   <div style={{padding:'8px 18px 12px',display:'flex',alignItems:'center',justifyContent:'space-between'}}><h2 style={{margin:0,fontSize:22,fontWeight:800,letterSpacing:'-.02em'}}>Xem lại đơn</h2><div style={{width:40,height:40,borderRadius:12,background:'#EDF1F6',display:'grid',placeItems:'center'}}>{ic(XMarkIcon,22)}</div></div>
   <div style={{padding:'0 18px',display:'flex',flexDirection:'column',gap:12}}>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
     <div style={{background:BG,borderRadius:12,padding:'10px 12px',gridColumn:'1 / 3'}}><div style={T(13,600,MUTE)}>Giao tới</div><div style={T(15.5,700)}>CT Nhà xưởng Hà Đông</div><div style={T(13.5,500,MUTE)}>Km 12 QL6, Hà Đông · Anh Long</div></div>
     <div style={{background:BG,borderRadius:12,padding:'10px 12px'}}><div style={T(13,600,MUTE)}>Muốn nhận lúc</div><div style={T(15.5,700,INK,num)}>20/11 · 08:00</div></div>
     <div style={{background:BG,borderRadius:12,padding:'10px 12px'}}><div style={T(13,600,MUTE)}>Ghi chú</div><div style={T(15,600)}>Gọi trước 15 phút</div></div></div>
    <div style={{border:'1px solid '+LINE,borderRadius:14,overflow:'hidden'}}>
     {LINES.slice(0,2).map((l,i)=><div key={l[0]} style={{display:'flex',justifyContent:'space-between',gap:10,padding:'11px 14px',borderTop:i?'1px solid '+LINE:0}}>
      <div style={{minWidth:0}}><div style={T(15,700)}>{l[0]}</div><div style={T(13.5,500,MUTE,num)}>{l[1]} × {l[2]}</div></div><b style={T(15,800,INK,{...num,whiteSpace:'nowrap'})}>{l[3]}</b></div>)}</div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'0 4px'}}><span style={T(14.5,600,MUTE)}>2 dòng · Tạm tính</span><b style={T(24,800,INK,{...num,letterSpacing:'-.02em'})}>24.800.000 ₫</b></div>
    <div style={{display:'flex',gap:10,background:'#E6F0FB',borderRadius:12,padding:'11px 12px',fontSize:14,lineHeight:1.5,color:'#0A3D7A'}}>{ic(InformationCircleIcon,20,BLUE)}<span>Cửa hàng duyệt đơn rồi báo ngày giao; chưa giữ hàng cho tới khi duyệt.</span></div></div>
   <div style={{padding:'14px 18px 22px',display:'flex',flexDirection:'column',gap:10}}><Btn k="g" Icon={PaperAirplaneIcon}>Gửi đơn</Btn><Btn k="o" h={48}>Sửa đơn</Btn></div></div></Dim></CP>);

/* journey */
const Journey=({steps})=><div style={{display:'flex',flexDirection:'column'}}>{steps.map(([t,time,st,sub],i)=>{const last=i===steps.length-1;
 const col=st==='done'?GREEN:st==='now'?BLUE:st==='bad'?RED:'#D5DDE8';
 return <div key={t} style={{display:'flex',gap:12}}>
  <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:28,flex:'none'}}>
   {st==='done'?<div style={{width:28,height:28,borderRadius:'50%',background:GREEN,color:'#fff',display:'grid',placeItems:'center'}}>{ic(CheckIcon,16)}</div>
   :st==='bad'?<div style={{width:28,height:28,borderRadius:'50%',background:RED,color:'#fff',display:'grid',placeItems:'center'}}>{ic(XMarkIcon,16)}</div>
   :st==='now'?<div style={{width:28,height:28,borderRadius:'50%',background:'#fff',border:'3px solid '+BLUE,boxSizing:'border-box',display:'grid',placeItems:'center',boxShadow:'0 0 0 5px rgba(11,99,198,.15)'}}><i style={{width:10,height:10,borderRadius:'50%',background:BLUE}}/></div>
   :<div style={{width:28,height:28,borderRadius:'50%',background:'#fff',border:'2px solid #D5DDE8',boxSizing:'border-box'}}/>}
   {!last&&<div style={{flex:1,width:3,minHeight:18,margin:'3px 0',borderRadius:2,background:st==='done'?GREEN:'#E3E9F1'}}/>}</div>
  <div style={{flex:1,paddingBottom:last?0:16,paddingTop:2}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><span style={T(15.5,st==='todo'?500:700,st==='todo'?MUTE:INK)}>{t}</span><span style={T(13.5,st==='now'?800:600,st==='now'?BLUE:MUTE,num)}>{time}</span></div>{sub&&<div style={T(13.5,500,MUTE,{marginTop:2,lineHeight:1.45})}>{sub}</div>}</div></div>})}</div>;
const GoodsCard=({total=true})=><Card pad={0}><div style={{padding:'14px 16px 6px'}}><b style={T(17,800)}>Hàng hóa</b></div>
 {LINES.map((l,i)=><div key={l[0]} style={{display:'flex',justifyContent:'space-between',gap:10,padding:'10px 16px',borderTop:'1px solid '+LINE}}><div style={{minWidth:0}}><div style={T(15,600)}>{l[0]}</div><div style={T(13.5,500,MUTE,num)}>{l[1]} × {l[2]}</div></div><span style={T(15,700,INK,{...num,whiteSpace:'nowrap'})}>{l[3]}</span></div>)}
 {total&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'13px 16px',background:'#F8FAFC',borderTop:'1px solid '+LINE,borderRadius:'0 0 16px 16px'}}><span style={T(14.5,700,MUTE)}>Tổng cộng</span><b style={T(20,800,INK,num)}>45.600.000 ₫</b></div>}</Card>;

/* 7. order-detail */
def('customer-order-detail','/customer/orders/:id','Order Detail','Theo dõi đơn: chip trạng thái, thẻ lượt giao, Hành trình dọc có giờ, Hàng hóa, "Đặt lại đơn này", công nợ và thanh toán mức an toàn cho khách.',()=>
 <CP active="orders">
  <PageHead back="Đơn hàng" title="Đặt 18/11 · CT Hà Đông" sub={<span style={num}>SO-0231</span>} chip={<SC s="dg"/>}/>
  <Card pad={16}><div style={{display:'flex',alignItems:'center',gap:12}}><div style={{width:44,height:44,borderRadius:12,background:'#E6F0FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(TruckIcon,24)}</div>
   <div style={{flex:1}}><div style={T(13,600,MUTE)}>Lượt giao 1</div><div style={T(16,800)}>Đang giao hàng</div></div><div style={{textAlign:'right'}}><div style={T(13,600,MUTE)}>Dự kiến</div><div style={T(17,800,BLUE,num)}>~14:30</div></div></div>
   <div style={{marginTop:14}}><ProgressBar label="Tiến độ giao" value={72} isLabelHidden variant="accent"/></div></Card>
  <Card><b style={T(17,800)}>Hành trình đơn</b><div style={{marginTop:14}}><Journey steps={[['Đã đặt','18/11 · 16:05','done'],['Cửa hàng duyệt','18/11 · 16:40','done','Hàng đã lên xe lúc 08:10 ngày 19/11'],['Đang giao','~14:30','now','Xe đang tới công trình'],['Hoàn tất','—','todo']]}/></div></Card>
  <GoodsCard/>
  <Btn k="o" Icon={ArrowPathIcon}>Đặt lại đơn này</Btn>
  <Card><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><b style={T(17,800)}>Công nợ đơn này</b><Chip k="i">Chưa ghi nợ</Chip></div><div style={T(14.5,500,MUTE,{marginTop:8,lineHeight:1.5})}>Công nợ được ghi sau khi cửa hàng xác minh giao đủ. Hạn trả tính từ ngày xác minh.</div></Card>
  <Card pad={0}><div style={{padding:'14px 16px 8px'}}><b style={T(17,800)}>Thanh toán</b></div>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',borderTop:'1px solid '+LINE}}><div><div style={T(15,600)}>Trả trước</div><div style={T(13.5,500,MUTE)}>18/11 · Chuyển khoản</div></div><b style={T(16,800,INK,num)}>10.000.000 ₫</b></div></Card>
 </CP>);

/* 8. rejected */
def('customer-order-rejected','/customer/orders/:id (bị từ chối)','Order Detail + Notice','Đơn không được cửa hàng nhận: nhãn "Đã hủy" cùng lý do khách nhìn thấy; không giữ hàng; có Đặt lại đơn này.',()=>
 <CP active="orders">
  <PageHead back="Đơn hàng" title="Đặt 17/11 · CT Hà Đông" sub={<span style={num}>SO-0227</span>} chip={<SC s="hu"/>}/>
  <div style={{borderRadius:16,background:'#FDEFED',border:'1px solid #F0C4BF',padding:16}}>
   <div style={{display:'flex',alignItems:'center',gap:10,color:RED}}>{ic(ShieldExclamationIcon,26)}<b style={T(17,800,'#8A1C13')}>Cửa hàng không nhận đơn này</b></div>
   <div style={{marginTop:10,padding:'12px 14px',background:'#fff',borderRadius:12,border:'1px solid #F0C4BF'}}><div style={T(13,700,MUTE)}>Lý do từ cửa hàng · 17/11 · 10:12</div><div style={T(15.5,500,INK,{marginTop:4,lineHeight:1.55})}>Thép phi 16 tạm hết hàng, chưa có ngày nhập. Anh/chị có thể đặt lại với loại khác hoặc gọi cửa hàng để được tư vấn.</div></div>
   <div style={T(14,500,'#6E241D',{marginTop:10})}>Đơn chưa giữ hàng và không phát sinh công nợ.</div></div>
  <Card><b style={T(17,800)}>Hành trình đơn</b><div style={{marginTop:14}}><Journey steps={[['Đã đặt','17/11 · 09:42','done'],['Cửa hàng không nhận','17/11 · 10:12','bad','Đơn kết thúc, không giao hàng']]}/></div></Card>
  <Card pad={0}><div style={{padding:'14px 16px 6px'}}><b style={T(17,800)}>Hàng đặt</b></div>
   {[['Thép phi 16 CB300','60 cây'],['Xi măng PC40 Hoàng Thạch','40 bao']].map(([a,b])=><div key={a} style={{display:'flex',justifyContent:'space-between',padding:'11px 16px',borderTop:'1px solid '+LINE}}><span style={T(15,600)}>{a}</span><span style={T(15,700,INK,num)}>{b}</span></div>)}</Card>
  <div style={{flex:1}}/>
  <Btn k="p" Icon={ArrowPathIcon}>Đặt lại đơn này</Btn><Btn k="o" h={52} Icon={PhoneIcon}>Gọi cửa hàng</Btn>
 </CP>);

/* 9. reports (số liệu tính bằng code từ danh sách đơn bên dưới nên luôn khớp) */
const ORD=[
 {c:'SO-0233',d:'19/11',s:'cd',l:[['Thép phi 10 CB300','cây',150,133000,0]]},
 {c:'SO-0231',d:'18/11',s:'dg',l:[['Xi măng PC40 Hoàng Thạch','bao',200,89000,0],['Cát xây','m³',25,280000,0],['Gạch ống 4 lỗ','viên',8000,1800,0],['Đá 1×2','m³',20,320000,0]]},
 {c:'SO-0229',d:'17/11',s:'dd',l:[['Gạch ống 4 lỗ','viên',5000,1800,0]]},
 {c:'SO-0228',d:'17/11',s:'gi',l:[['Cát xây','m³',35,280000,35]]},
 {c:'SO-0226',d:'15/11',s:'gi',l:[['Xi măng PC40 Hoàng Thạch','bao',220,89000,220]]},
 {c:'SO-0224',d:'14/11',s:'gi',l:[['Xi măng PC40 Hoàng Thạch','bao',80,89000,80]]},
 {c:'SO-0222',d:'13/11',s:'gi',l:[['Ống nhựa PVC phi 90','cây',40,95000,40]]}];
const SERV=2500000;
const fq=n=>n.toLocaleString('vi-VN');
const AGG=(()=>{const m={};ORD.forEach(o=>o.l.forEach(([n,u,q,pr,dl])=>{const a=m[n]||(m[n]={n,u,q:0,dl:0,mn:0,os:[]});a.q+=q;a.dl+=dl;a.mn+=q*pr;a.os.push({c:o.c,d:o.d,s:o.s,q})}));return Object.values(m).sort((a,b)=>b.mn-a.mn)})();
const GOODS=AGG.reduce((t,a)=>t+a.mn,0), FULL=AGG.filter(a=>a.q===a.dl).length;
const DAYS=[['19/11','Thứ Năm'],['18/11','Thứ Tư'],['17/11','Thứ Ba'],['15/11','Chủ Nhật'],['14/11','Thứ Bảy'],['13/11','Thứ Sáu']].map(([d,w])=>{const os=ORD.filter(o=>o.d===d);const ks=new Set();let mn=0;os.forEach(o=>o.l.forEach(l=>{ks.add(l[0]);mn+=l[2]*l[3]}));return {d,w,o:os.length,k:ks.size,mn}});
const Stat=({l,v,s,c,f=1,sz=26})=><Card pad={14} style={{flex:f,minWidth:0}}><div style={T(13.5,600,MUTE)}>{l}</div><div style={T(sz,800,c||INK,{...num,margin:'4px 0 2px',letterSpacing:'-.02em',whiteSpace:'nowrap'})}>{v}</div><div style={T(13,500,MUTE,{lineHeight:1.4})}>{s}</div></Card>;
const RCard=({a,open})=>{const r0=a.q-a.dl,rk=r0===0?'ok':a.dl>0?'part':'none';const cell=(k,v,c,bg)=><div style={{background:bg||'#F6F8FB',borderRadius:10,padding:'8px 10px'}}><div style={T(13,600,MUTE)}>{k}</div><div style={T(16,800,c||INK,num)}>{v}</div><div style={T(13,500,MUTE)}>{a.u}</div></div>;
 return <Card pad={0} style={{overflow:'hidden'}}>
 <div style={{padding:'14px 16px 12px'}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'baseline'}}><b style={T(16,800)}>{a.n}</b><span style={T(15,800,INK,{...num,whiteSpace:'nowrap'})}>{money(a.mn)}</span></div>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:10}}>
   {cell('Đặt',fq(a.q))}{cell('Đã giao',fq(a.dl))}{cell('Còn lại',rk==='ok'?'0 · đủ':fq(r0),rk==='ok'?'#0D5A33':rk==='part'?'#8A4F00':'#5A6B82',rk==='ok'?'#EAF6EF':rk==='part'?'#FFF6E3':'#F3F5F8')}</div></div>
 {open?<div style={{borderTop:'1px solid '+LINE,background:'#FAFBFD'}}><div style={{padding:'10px 16px 4px',fontSize:13.5,fontWeight:800,color:'#0B5CB8'}}>Nằm trong {a.os.length} đơn</div>
  {a.os.map(o=><div key={o.c} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px'}}><div style={{flex:1}}><div style={T(14.5,800,'#0B5CB8')}>{o.c}</div><div style={T(13,500,MUTE)}>Đặt {o.d}/2026 · {fq(o.q)} {a.u}</div></div><SC s={o.s}/>{ic(ChevronRightIcon,15,'#8793A5')}</div>)}</div>
  :<div style={{borderTop:'1px solid '+LINE,padding:'11px 16px',display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:700,color:'#0B5CB8'}}><span>Nằm trong {a.os.length} đơn</span>{ic(ChevronDownIcon,16)}</div>}</Card>};
def('customer-reports-ordered','/customer/reports/ordered','Data Dashboard + Cards','Báo cáo hàng đã đặt (D98). Mọi số (đơn, loại hàng, giao đủ, tổng tiền, từng thẻ, theo ngày) được tính bằng code từ cùng một danh sách đơn nên khớp: Tổng tiền = hàng + dịch vụ; cuối danh sách là "Tổng cộng hàng hóa".',()=>
 <CP active="reports">
  <PageHead back="Đơn hàng" title="Báo cáo hàng đã đặt" sub="Hàng anh/chị đã đặt, cộng theo từng loại trong kỳ."/>
  <Card pad={14} style={{display:'flex',flexDirection:'column',gap:12}}>
   <div style={{display:'flex',gap:6}}><Pill sm>Hôm nay</Pill><Pill sm>Hôm qua</Pill><Pill sm on>7 ngày</Pill><Pill sm>Tháng này</Pill></div>
   <div style={{display:'flex',gap:10}}><Field style={{flex:1}} label="Từ ngày" value="13/11/2026" mono/><Field style={{flex:1}} label="Đến ngày" value="19/11/2026" mono/></div>
   <div style={T(13,500,MUTE)}>Kỳ 13/11/2026 – 19/11/2026 · tự áp dụng khi anh/chị chọn xong</div></Card>
  <div style={{display:'flex',gap:10}}><Stat l="Số đơn" v={ORD.length} s="2 đơn đã hủy, không tính"/><Stat l="Số loại hàng" v={AGG.length} s="gộp theo từng loại hàng"/></div>
  <div style={{display:'flex',gap:10}}><Stat f={1} l="Đã giao" v={FULL+'/'+AGG.length} s="loại đã giao đủ"/><Stat f={1.6} sz={23} l="Tổng tiền" v={money(GOODS+SERV)} c={BLUE} s={'hàng '+fq(GOODS)+' + dịch vụ '+fq(SERV)}/></div>
  <Sec>Hàng đã đặt</Sec>
  {AGG.map((a,i)=><RCard key={a.n} a={a} open={i===0}/>)}
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',background:'#E6F0FB',borderRadius:14}}><span style={T(14,700,'#0A4A96',{lineHeight:1.35})}>Tổng cộng hàng hóa<br/><span style={{fontWeight:600}}>{AGG.length} loại hàng · {ORD.length} đơn</span></span><b style={T(17,800,'#0A4A96',{...num,whiteSpace:'nowrap'})}>{money(GOODS)}</b></div>
  <Sec>Theo ngày</Sec>
  <Card pad={0}>{DAYS.slice(0,4).map((d,i)=><div key={d.d} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderTop:i?'1px solid '+LINE:0,background:i===0?'#EEF5FD':'transparent'}}><div style={{flex:1}}><div style={T(15,700)}>{d.w}, {d.d}</div><div style={T(13.5,500,MUTE)}>{d.o} đơn · {d.k} loại hàng</div></div><b style={T(15,800,INK,{...num,whiteSpace:'nowrap'})}>{money(d.mn)}</b></div>)}
   <div style={{padding:'12px 16px',borderTop:'1px solid '+LINE,fontSize:14.5,fontWeight:700,color:'#0B5CB8',display:'flex',justifyContent:'space-between'}}>Xem thêm {DAYS.length-4} ngày{ic(ChevronDownIcon,16)}</div></Card>
  <Sec>Dịch vụ</Sec>
  <Card pad={14} style={{display:'flex',alignItems:'center',gap:12}}><div style={{width:40,height:40,borderRadius:11,background:'#E6F0FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(WrenchScrewdriverIcon,22)}</div><div style={{flex:1}}><div style={T(14.5,700,INK,{whiteSpace:'nowrap'})}>Máy trộn bê tông · 1 ca</div><div style={T(13.5,500,MUTE)}>16/11/2026</div></div><b style={T(15,800,INK,{...num,whiteSpace:'nowrap'})}>{money(SERV)}</b></Card>
  <div style={{display:'flex',gap:10}}><Btn k="o" h={52} Icon={DocumentArrowDownIcon} style={{flex:1}}>Xuất Excel</Btn><Btn k="o" h={52} Icon={DocumentArrowDownIcon} style={{flex:1}}>Xuất CSV</Btn></div>
  <div style={T(13,500,MUTE,{textAlign:'center',lineHeight:1.5})}>Cập nhật đến 08:46 ngày 19/11/2026. Đơn đã hủy không tính.</div>
 </CP>);

/* 10. debts */
const DRow=({c,desc,t,tk,m,first})=><div style={{padding:'14px 16px',borderTop:first?0:'1px solid '+LINE}}>
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}><span style={T(16,800,'#0B5CB8',num)}>{c}</span><b style={T(18,800,INK,num)}>{m}</b></div>
 <div style={T(14,500,INK,{marginTop:3})}>{desc}</div>
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginTop:10}}>
  <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13.5,fontWeight:700,lineHeight:1.35,color:tk==='r'?RED:tk==='o'?'#8A4F00':'#46556A'}}>{tk==='r'&&ic(ExclamationTriangleIcon,16)}{tk==='o'&&ic(ClockIcon,16)}{t}</span>
  <span style={{height:52,minWidth:124,justifyContent:'center',borderRadius:12,border:'1.5px solid '+BLUE,color:BLUE,display:'inline-flex',alignItems:'center',fontSize:15.5,fontWeight:700,whiteSpace:'nowrap',flex:'none'}}>Thanh toán</span></div></div>;
def('customer-debts','/customer/debts','Order Detail + Collapsible List','Công nợ: thẻ Còn phải trả + thanh 3 màu Trong hạn / Sắp tới hạn (≤ 7 ngày) / Quá hạn; mỗi khoản một đơn có nút Thanh toán; Thanh toán tất cả (D42). Không còn khung chuyển khoản tối.',()=>
 <CP active="debts">
  <PageHead title="Công nợ" sub="Công ty XD Bảo Long"/>
  <Card pad={18}>
   <div style={T(14.5,600,MUTE)}>Còn phải trả</div><div style={T(36,800,INK,{...num,letterSpacing:'-.03em',margin:'2px 0 14px'})}>58.900.000 ₫</div>
   <div style={{display:'flex',gap:3,height:12}}><i style={{flex:33,background:GREEN,borderRadius:'99px 4px 4px 99px'}}/><i style={{flex:13.6,background:AMB,borderRadius:4}}/><i style={{flex:12.3,background:RED,borderRadius:'4px 99px 99px 4px'}}/></div>
   <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:14}}>
    {[[GREEN,'Trong hạn','33.000.000 ₫'],[AMB,'Sắp tới hạn (≤ 7 ngày)','13.600.000 ₫'],[RED,'Quá hạn','12.300.000 ₫']].map(([c,a,b])=><div key={a} style={{display:'flex',alignItems:'center',gap:10,fontSize:14.5}}><i style={{width:12,height:12,borderRadius:4,background:c}}/><span style={{flex:1,color:MUTE,fontWeight:500}}>{a}</span><b style={{...num,color:c===RED?RED:INK}}>{b}</b></div>)}</div>
   <Btn k="g" style={{marginTop:18}} Icon={BanknotesIcon}>Thanh toán tất cả</Btn></Card>
  <Sec>Khoản cần thanh toán</Sec>
  <Card pad={0} style={{overflow:'hidden'}}>
   <DRow first c="SO-0198" desc="Xi măng, cát · giao 01/11" tk="r" t="Quá hạn 12 ngày · hạn 07/11" m="12.300.000 ₫"/>
   <DRow c="SO-0212" desc="Gạch ống 4 lỗ · giao 10/11" tk="o" t="Còn 5 ngày · hạn 24/11" m="13.600.000 ₫"/>
   <DRow c="SO-0220" desc="Thép phi 10 · giao 18/11" t="Trong hạn · hạn 02/12" m="18.500.000 ₫"/>
   <DRow c="DV-0043" desc="Máy trộn bê tông · 1 ca" t="Trong hạn · hạn 10/12" m="2.500.000 ₫"/>
   <DRow c="Số dư đầu kỳ" desc="Công nợ chuyển từ kỳ trước" t="Trong hạn · hạn 15/12" m="12.000.000 ₫"/></Card>
  <div style={T(13,500,MUTE,{textAlign:'center',lineHeight:1.5,padding:'0 12px'})}>Mỗi mã QR trả đúng một khoản. "Thanh toán tất cả" trả toàn bộ công nợ. Tiền được ghi tự động khi ngân hàng báo về.</div>
 </CP>);

/* 11. pay-qr */
function Qr({size=240}){const n=29,cells=[];let s=20261119;const rnd=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff};
 const fin=(x,y)=>(x<8&&y<8)||(x>n-9&&y<8)||(x<8&&y>n-9);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(fin(x,y))continue;if(rnd()>.52)cells.push([x,y])}
 const F=(ox,oy)=><g key={ox+'-'+oy}><rect x={ox} y={oy} width={7} height={7} fill={INK}/><rect x={ox+1} y={oy+1} width={5} height={5} fill="#fff"/><rect x={ox+2} y={oy+2} width={3} height={3} fill={INK}/></g>;
 return <svg width={size} height={size} viewBox={`-2 -2 ${n+4} ${n+4}`} shapeRendering="crispEdges"><rect x={-2} y={-2} width={n+4} height={n+4} fill="#fff"/>{F(0,0)}{F(n-7,0)}{F(0,n-7)}{cells.map(([x,y])=><rect key={x+'_'+y} x={x} y={y} width={1} height={1} fill={INK}/>)}
  <rect x={n/2-3} y={n/2-3} width={6} height={6} rx={1.4} fill="#fff"/><rect x={n/2-2.2} y={n/2-2.2} width={4.4} height={4.4} rx={1} fill={BLUE}/></svg>}
const KVR=({k,v,copy,strong,first})=><div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderTop:first?0:'1px solid '+LINE}}><div style={{flex:1,minWidth:0}}><div style={T(13,600,MUTE)}>{k}</div><div style={T(strong?22:15.5,strong?800:700,INK,{...num,marginTop:1,letterSpacing:strong?'-.02em':0})}>{v}</div></div>
 {copy&&<span style={{height:44,width:116,justifyContent:'center',flex:'none',borderRadius:11,background:'#E6F0FB',color:'#0A4A96',display:'inline-flex',alignItems:'center',gap:6,fontSize:15,fontWeight:700,whiteSpace:'nowrap'}}>{ic(ClipboardDocumentIcon,17)}{copy}</span>}</div>;
const PayTop=({title})=><div style={{height:60,flex:'none',background:'#fff',borderBottom:'1px solid '+LINE,display:'flex',alignItems:'center',gap:10,padding:'0 12px 0 18px'}}><b style={{flex:1,fontSize:19,fontWeight:800,letterSpacing:'-.01em'}}>{title}</b><div style={{height:40,padding:'0 14px',borderRadius:10,background:'#EDF1F6',display:'flex',alignItems:'center',gap:6,fontSize:14.5,fontWeight:700}}>{ic(XMarkIcon,18)}Đóng</div></div>;
def('customer-pay-qr','/customer/debts (cửa sổ Thanh toán)','Full-screen Dialog','Cửa sổ Thanh toán D42: ảnh QR ≤ 300 px, bảng Số tiền / Nội dung + Sao chép / Ngân hàng & số TK / Chủ TK, dải vàng "Đang chờ tiền về…".',()=>
 <CP noTop noNav fixed bg="#fff" pad={0} gap={0}>
  <PayTop title="Thanh toán DV-0043"/>
  <div style={{flex:1,padding:'16px 16px 0',display:'flex',flexDirection:'column',gap:14,background:BG,overflow:'hidden'}}>
   <div style={{background:'#fff',borderRadius:22,border:'1px solid '+LINE,boxShadow:SH,padding:'14px 16px 12px',display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
    <div style={{padding:8,borderRadius:18,border:'2px solid '+LINE,background:'#fff',display:'grid'}}><Qr size={212}/></div>
    <div style={T(14.5,600,MUTE,{textAlign:'center'})}>Quét mã bằng ứng dụng ngân hàng, <b style={{color:INK}}>không sửa nội dung</b></div></div>
   <Card pad={0} style={{overflow:'hidden'}}>
    <KVR first strong k="Số tiền" v="2.500.000 ₫"/><KVR k="Nội dung" v="HX KH0102 DV0043" copy="Sao chép"/><KVR k="Ngân hàng & số TK" v={<>Vietcombank<br/>0011 0022 3344</>} copy="Sao chép"/><KVR k="Chủ tài khoản" v="CÔNG TY TNHH VLXD HIỀN XA"/></Card></div>
  <div style={{flex:'none',padding:'10px 16px 16px',background:BG,display:'flex',flexDirection:'column',gap:10}}><div style={{display:'flex',alignItems:'center',gap:12,height:52,borderRadius:14,background:'#FFF1D0',border:'1px solid #F0CF87',padding:'0 16px',color:'#6B3F00',fontSize:15.5,fontWeight:700}}>
   <span style={{width:22,height:22,borderRadius:'50%',border:'3px solid #E8890C',borderTopColor:'transparent',boxSizing:'border-box',display:'block'}}/>Đang chờ tiền về…</div>
   <Btn k="o" h={52}>Đóng</Btn></div>
 </CP>);

/* 12. pay-done */
def('customer-pay-done','/customer/debts (đã nhận tiền)','Full-screen Dialog + Success','Khi ngân hàng xác nhận: khung xanh "Đã nhận thanh toán 2.500.000 ₫" + mã phiếu thu; đóng cửa sổ thì trang công nợ tải lại.',()=>
 <CP noTop noNav fixed bg={BG} pad={0} gap={0}>
  <PayTop title="Thanh toán DV-0043"/>
  <div style={{flex:1,padding:16,display:'flex',flexDirection:'column',gap:14}}>
   <div style={{borderRadius:22,padding:'30px 20px 24px',textAlign:'center',color:'#fff',position:'relative',overflow:'hidden',background:'linear-gradient(155deg,#1A9A5E,#12804A 55%,#0C6339)',boxShadow:'0 24px 40px -20px rgba(18,128,74,.8)'}}>
    <div style={{position:'absolute',inset:0,backgroundImage:brickBg}}/>
    <div style={{position:'relative'}}><div style={{width:76,height:76,borderRadius:'50%',background:'rgba(255,255,255,.2)',margin:'0 auto',display:'grid',placeItems:'center',boxShadow:'0 0 0 10px rgba(255,255,255,.12)'}}><CheckCircleS width={52} height={52} color="#fff"/></div>
     <div style={{fontSize:15,fontWeight:600,marginTop:18,color:'rgba(255,255,255,.88)'}}>Ngân hàng đã báo tiền về</div>
     <div style={{fontSize:26,fontWeight:800,letterSpacing:'-.02em',marginTop:4,lineHeight:1.2}}>Đã nhận thanh toán<br/><span style={{fontSize:36,...num}}>2.500.000 ₫</span></div></div></div>
   <Card pad={0}><KVR first k="Phiếu thu" v="PT-0418"/><KVR k="Thanh toán cho" v="DV-0043 · Máy trộn bê tông"/><KVR k="Thời gian" v="19/11/2026 · 10:42"/><KVR k="Còn phải trả" v="56.400.000 ₫"/></Card>
   <div style={{flex:1}}/>
   <Btn k="p">Đóng và xem công nợ</Btn></div>
 </CP>);

/* 13. services */
const Opt=({Icon,t,s,on})=><div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:14,border:'1.5px solid '+(on?BLUE:LINE),background:on?'#F1F7FE':'#fff',boxShadow:on?'0 0 0 3px rgba(11,99,198,.10)':'none'}}>
 <div style={{width:42,height:42,borderRadius:12,background:on?BLUE:'#EDF1F6',color:on?'#fff':MUTE,display:'grid',placeItems:'center'}}>{ic(Icon,22)}</div><div style={{flex:1}}><div style={T(15.5,700)}>{t}</div><div style={T(13.5,500,MUTE)}>{s}</div></div>
 <span style={{width:22,height:22,borderRadius:'50%',border:on?'7px solid '+BLUE:'2px solid #C7D2DF',boxSizing:'border-box'}}/></div>;
def('customer-service-new','/customer/services/new','Checkout Form','Chọn loại dịch vụ, công trình, ngày muốn; gửi đi là "Chờ xác nhận lịch" (chưa phải lịch chắc chắn).',()=>
 <CP active="orders" foot={<Btn k="p" Icon={PaperAirplaneIcon}>Gửi yêu cầu</Btn>}>
  <PageHead back="Đơn hàng" title="Yêu cầu dịch vụ" sub="Cửa hàng xác nhận lịch rồi báo lại cho anh/chị."/>
  <div style={{display:'flex',flexDirection:'column',gap:8}}><span style={T(13.5,600,MUTE)}>Loại dịch vụ</span>
   <Opt Icon={WrenchScrewdriverIcon} t="Cẩu hàng lên tầng cao" s="Tính theo giờ" on/><Opt Icon={CubeIcon} t="Máy trộn bê tông" s="Tính theo ca"/><Opt Icon={TruckIcon} t="Vận chuyển cát" s="Tính theo chuyến"/></div>
  <Field label="Công trình" value="CT Nhà xưởng Hà Đông" Icon={MapPinIcon} right={ic(ChevronDownIcon,20,'#8793A5')}/>
  <div style={{display:'flex',gap:10}}><Field style={{flex:1}} label="Ngày muốn" value="22/11/2026" mono Icon={CalendarDaysIcon}/><Field style={{flex:1}} label="Giờ muốn" value="08:00" mono Icon={ClockIcon}/></div>
  <Field label="Ghi chú cho cửa hàng" value="Cẩu lên tầng 5, đường vào hẹp" />
 </CP>);
const SVS={wait:['w','Chờ xác nhận lịch',ClockIcon,'#FFF6E3','#F3D9A4','#6B3F00','Cửa hàng đang xem lịch. Anh/chị sẽ được báo khi lịch được xếp; yêu cầu này chưa phải lịch chắc chắn.'],
 ok:['i','Đã xếp lịch',CheckBadgeIcon,'#EAF3FD','#BBD6F4','#0A3D7A','Cửa hàng đã xếp lịch. Đã xếp lịch thì anh/chị không tự hủy, vui lòng gọi cửa hàng nếu cần đổi.'],
 no:['e','Đã từ chối',ShieldExclamationIcon,'#FDEFED','#F0C4BF','#6E241D','Lý do từ cửa hàng: Ngày 22/11 máy cẩu đã kín lịch. Anh/chị có thể gửi yêu cầu cho ngày khác.']};
const SvcDetail=({s})=>{const v=SVS[s];return <CP active="orders">
 <PageHead back="Đơn hàng" title="Cẩu hàng lên tầng cao" sub={<span style={num}>YC-0019 · Gửi 19/11/2026</span>} chip={<Chip k={v[0]}>{v[1]}</Chip>}/>
 <div style={{borderRadius:16,background:v[3],border:'1px solid '+v[4],padding:16,display:'flex',gap:12,color:v[5]}}><span style={{marginTop:1}}>{ic(v[2],26)}</span><div style={{fontSize:15,lineHeight:1.55,fontWeight:500}}>{v[6]}</div></div>
 <Card pad={0}>{[['Công trình','CT Nhà xưởng Hà Đông'],['Ngày muốn','22/11/2026 · 08:00'],[s==='ok'?'Lịch đã xếp':'Lịch hẹn',s==='ok'?'22/11/2026 · 09:30':'Chưa có'],['Ghi chú','Cẩu lên tầng 5, đường vào hẹp']].map(([a,b],i)=><div key={a} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'13px 16px',borderTop:i?'1px solid '+LINE:0}}><span style={T(14.5,500,MUTE)}>{a}</span><span style={T(15,700,s==='ok'&&i===2?BLUE:INK,{textAlign:'right',...num})}>{b}</span></div>)}</Card>
 <Card><b style={T(17,800)}>Tiến trình</b><div style={{marginTop:14}}><Journey steps={s==='no'?[['Đã gửi yêu cầu','19/11 · 09:05','done'],['Cửa hàng từ chối','19/11 · 09:40','bad']]:[['Đã gửi yêu cầu','19/11 · 09:05','done'],['Chờ xác nhận lịch','19/11 · 09:05',s==='wait'?'now':'done'],['Đã xếp lịch',s==='ok'?'19/11 · 10:20':'—',s==='ok'?'now':'todo'],['Hoàn tất','—','todo']]}/></div></Card>
 <div style={{flex:1}}/>
 {s==='wait'?<Btn k="oe" h={52}>Hủy yêu cầu</Btn>:s==='no'?<Btn k="p" Icon={ArrowPathIcon}>Gửi yêu cầu khác</Btn>:<Btn k="o" h={52} Icon={PhoneIcon}>Gọi cửa hàng</Btn>}
</CP>};
def('customer-service-detail','/customer/services/:id','Work Item Detail','Đã xếp lịch: khách không tự hủy, chỉ gọi cửa hàng.',()=><SvcDetail s="ok"/>);
def('customer-service-detail-pending','/customer/services/:id (chờ)','Work Item Detail','Chờ xác nhận lịch: còn được hủy yêu cầu.',()=><SvcDetail s="wait"/>);
def('customer-service-detail-rejected','/customer/services/:id (từ chối)','Work Item Detail','Đã từ chối kèm lý do; có thể gửi yêu cầu khác.',()=><SvcDetail s="no"/>);

/* 14. messages */
const Bub=({me,t,time,who})=><div style={{display:'flex',flexDirection:'column',alignItems:me?'flex-end':'flex-start',gap:3}}>
 <div style={{maxWidth:'80%',padding:'10px 14px',borderRadius:me?'18px 18px 4px 18px':'18px 18px 18px 4px',background:me?BLUE:'#fff',color:me?'#fff':INK,fontSize:16,lineHeight:1.45,border:me?0:'1px solid '+LINE,boxShadow:me?'0 8px 14px -8px rgba(11,99,198,.7)':SH}}>{t}</div>
 <span style={T(13,500,MUTE,{padding:'0 4px'})}>{time}</span></div>;
def('customer-messages','/customer/messages','Messaging Inbox','Chỉ nhắn với văn phòng; một cột trên điện thoại; ô nhập 16 px; không thấy tin của khách khác.',()=>
 <CP noNav fixed pad={0} gap={0} foot={null}>
  <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'#fff',borderBottom:'1px solid '+LINE}}>
   <div style={{color:'#0B5CB8',display:'flex',alignItems:'center',height:44,width:32}}>{ic(ChevronLeftIcon,24)}</div><Avatar name="Văn phòng Hiền Xa" size={44} status={<span/>}/>
   <div style={{flex:1,lineHeight:1.25}}><div style={T(16.5,800)}>Văn phòng Hiền Xa</div><div style={{...T(13.5,600,GREEN),display:'flex',alignItems:'center',gap:5}}><i style={{width:8,height:8,borderRadius:'50%',background:GREEN}}/>Đang trực · 7:30–17:30</div></div>
   <div style={{width:44,height:44,borderRadius:12,background:'#E6F0FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(PhoneIcon,22)}</div></div>
  <div style={{flex:1,padding:16,display:'flex',flexDirection:'column',gap:12,overflow:'hidden'}}>
   <div style={{alignSelf:'center',fontSize:13,fontWeight:700,color:MUTE,background:'#E4EAF2',borderRadius:999,padding:'3px 12px'}}>Hôm nay</div>
   <Bub t="Chào anh Long, đơn SO-0231 đã lên xe, dự kiến tới công trình khoảng 14:30 ạ." time="Văn phòng · 09:12"/>
   <Bub me t="Ok em. Nhớ gọi trước 15 phút giúp anh, cổng công trình hẹp." time="09:15"/>
   <Bub t="Dạ vâng, tài xế sẽ gọi anh trước khi tới. Anh cần thêm gì không ạ?" time="Văn phòng · 09:16"/>
   <Bub me t="Chiều anh đặt thêm 150 cây thép phi 10 nhé." time="09:18"/>
   <Bub t="Dạ em đã nhận đơn SO-0233, văn phòng sẽ duyệt và báo ngày giao." time="Văn phòng · 09:20"/></div>
  <div style={{padding:'10px 14px 14px',background:'#fff',borderTop:'1px solid '+LINE,display:'flex',gap:10,alignItems:'center'}}>
   <div style={{flex:1,height:52,borderRadius:26,background:'#F2F5F9',border:'1px solid '+LINE,padding:'0 18px',display:'flex',alignItems:'center',fontSize:16.5,color:'#8793A5'}}>Nhập tin nhắn…</div>
   <div style={{height:52,padding:'0 20px',borderRadius:26,background:BLUE,color:'#fff',display:'flex',alignItems:'center',gap:6,fontSize:16,fontWeight:700,boxShadow:'0 8px 14px -8px rgba(11,99,198,.7)'}}>Gửi{ic(PaperAirplaneIcon,18)}</div></div>
 </CP>);

/* 15. profile */
const Row=({Icon,t,s,right,first,danger})=><div style={{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',minHeight:56,boxSizing:'border-box',borderTop:first?0:'1px solid '+LINE}}>
 <div style={{width:38,height:38,borderRadius:11,background:danger?'#FDEBE9':'#EDF3FB',color:danger?RED:BLUE,display:'grid',placeItems:'center'}}>{ic(Icon,20)}</div><div style={{flex:1,minWidth:0}}><div style={T(15.5,700,danger?RED:INK)}>{t}</div>{s&&<div style={T(13.5,500,MUTE,{marginTop:1})}>{s}</div>}</div>{right||ic(ChevronRightIcon,17,'#8793A5')}</div>;
const Seg3=({items,on,sizes})=><div style={{display:'flex',padding:3,background:'#E8EDF4',borderRadius:13}}>{items.map((t,i)=><span key={t} style={{flex:1,height:48,borderRadius:10,display:'grid',placeItems:'center',fontSize:sizes?sizes[i]:16,fontWeight:t===on?800:600,background:t===on?'#fff':'transparent',color:t===on?'#0B5CB8':'#3C4B63',boxShadow:t===on?'0 1px 3px rgba(16,34,58,.18)':'none'}}>{t}</span>)}</div>;
def('customer-profile','/customer/profile','Settings Panels','Hồ sơ khách: công trình, người nhận hàng, đổi mật khẩu, giao diện, Đăng xuất. Vai Chủ tài khoản / Người lo tiền / Người nhận hàng quyết định thấy gì.',()=>
 <CP active="me">
  <Card pad={18} style={{display:'flex',alignItems:'center',gap:14,background:'linear-gradient(160deg,#fff,#F3F8FE)'}}>
   <Avatar name="Nguyễn Văn Long" size={64}/><div style={{minWidth:0}}><div style={T(19,800,INK,{letterSpacing:'-.01em'})}>Nguyễn Văn Long</div><div style={T(14,500,MUTE,{margin:'2px 0 6px'})}>Công ty XD Bảo Long · <span style={num}>KH-0102</span></div><Chip k="i">Chủ tài khoản</Chip></div></Card>
  <Sec right="+ Địa chỉ mới">Công trình</Sec>
  <Card pad={0}><Row first Icon={MapPinIcon} t="CT Nhà xưởng Hà Đông" s="Km 12 Quốc lộ 6, Hà Đông"/><Row Icon={MapPinIcon} t="CT Văn phòng Cầu Giấy" s="Số 18 Trần Thái Tông, Cầu Giấy"/></Card>
  <Sec right="+ Thêm">Người nhận hàng</Sec>
  <Card pad={0}><Row first Icon={UsersIcon} t="Trần Minh Đức" s="0903 111 222 · CT Hà Đông"/><Row Icon={UsersIcon} t="Lê Hồng Sơn" s="0988 765 432 · CT Cầu Giấy"/></Card>
  <Sec>Tài khoản</Sec>
  <Card pad={0}><Row first Icon={KeyIcon} t="Đổi mật khẩu"/>
   <div style={{padding:'13px 16px',borderTop:'1px solid '+LINE}}><div style={T(15.5,700,INK,{marginBottom:8})}>Giao diện</div><Seg3 items={['Sáng','Tối','Tự động']} on="Tự động"/></div>
   <div style={{padding:'13px 16px',borderTop:'1px solid '+LINE}}><div style={T(15.5,700,INK,{marginBottom:8})}>Cỡ chữ</div><Seg3 items={['Nhỏ','Vừa','Lớn']} on="Vừa" sizes={[14,16,19]}/></div></Card>
  <Btn k="oe" h={54} Icon={ArrowRightOnRectangleIcon} style={{marginTop:2}}>Đăng xuất</Btn>
 </CP>);

/* 16. change password */
def('customer-change-password','/customer/change-password','Login Card','Bắt buộc sau khi đăng nhập bằng mật khẩu tạm; mọi trang cổng dẫn tới đây tới khi đổi xong; có Đăng xuất.',()=>
 <AuthFrame minH={844} below={<span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,height:48,padding:'0 22px',borderRadius:12,border:'1px solid #C7D2DF',background:'#fff',fontWeight:700,color:INK,fontSize:15.5}}>{ic(ArrowRightOnRectangleIcon,20)}Đăng xuất</span>}>
  <div style={{width:48,height:48,borderRadius:14,background:'#FFF1D6',color:'#B26500',display:'grid',placeItems:'center',marginBottom:12}}>{ic(KeyIcon,26)}</div>
  <h1 style={{margin:0,fontSize:24,fontWeight:800,letterSpacing:'-.02em'}}>Đổi mật khẩu</h1>
  <div style={T(14.5,500,MUTE,{margin:'6px 0 16px',lineHeight:1.55})}>Anh/chị đang dùng mật khẩu tạm do cửa hàng cấp. Hãy đặt mật khẩu của riêng mình để tiếp tục.</div>
  <div style={{display:'flex',flexDirection:'column',gap:14}}><Field label="Mật khẩu mới" value="••••••••••" right={Eye}/><Field label="Nhập lại mật khẩu mới" value="••••••••••" right={Eye}/></div>
  <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:14}}>{['Từ 8 ký tự trở lên','Có cả chữ và số','Hai ô nhập giống nhau'].map(t=><div key={t} style={{display:'flex',alignItems:'center',gap:10,fontSize:14.5,fontWeight:600,color:'#3C4B63'}}><span style={{width:22,height:22,borderRadius:'50%',background:'#E6F0FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(CheckIcon,14)}</span>{t}</div>)}</div>
  <Btn k="p" style={{marginTop:20}}>Đổi mật khẩu và tiếp tục</Btn>
 </AuthFrame>);

/* 17. quotations off */
def('customer-quotations-off','/customer/quotations (đã tắt, D1)','Empty State','Báo giá tắt hẳn (D1): không có mục menu, route trả "không tìm thấy" — hiện trạng thái trống, không nút bị khóa.',()=>
 <CP active="home">
  <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',gap:12,padding:'0 18px'}}>
   <div style={{width:96,height:96,borderRadius:28,background:'linear-gradient(145deg,#EAF2FC,#DCE8F7)',display:'grid',placeItems:'center',color:BLUE,boxShadow:'inset 0 1px 0 #fff,0 14px 26px -14px rgba(11,99,198,.5)'}}>{ic(MagnifyingGlassIcon,46)}</div>
   <h1 style={{margin:'10px 0 0',fontSize:24,fontWeight:800,letterSpacing:'-.02em'}}>Không tìm thấy trang này</h1>
   <div style={T(15.5,500,MUTE,{lineHeight:1.6,maxWidth:290})}>Trang anh/chị mở không có hoặc anh/chị không có quyền xem.</div>
   <Btn k="p" style={{marginTop:14,width:'100%'}} Icon={HomeIcon}>Về trang chủ</Btn></div>
 </CP>);

/* =====================================================================
   BẢN MÁY TÍNH (1280px): thanh tiện ích trắng + menu xanh ngang (mục đang ở dính nền trang),
   nội dung 15px, bảng 14px, hai cột khi hợp lý. Cùng dữ liệu với bản điện thoại.
   ===================================================================== */
const defw=(id,route,tpl,note,C)=>def(id,route,tpl,note,C,1280);
const PMENU=[['home','Trang chủ'],['orders','Đơn hàng'],['new','Đặt hàng'],['reports','Báo cáo'],['debts','Công nợ'],['messages','Tin nhắn'],['me','Tôi']];
const PCFrame=({active,children,minH=800,bg=BG})=><div style={{width:1280,minHeight:minH,background:bg,position:'relative',display:'flex',flexDirection:'column',overflow:'hidden'}}>
 <div style={{height:56,flex:'none',background:'#fff',borderBottom:'1px solid '+LINE,display:'flex',alignItems:'center',gap:14,padding:'0 32px'}}>
  <Mark s={34}/><div style={{lineHeight:1.2}}><div style={T(17,800,INK,{letterSpacing:'-.01em'})}>Hiền Xa</div><div style={T(13,500,MUTE)}>Cổng khách hàng</div></div><span style={{flex:1}}/>
  <div style={{display:'flex',alignItems:'center',gap:10,paddingRight:8,borderRight:'1px solid '+LINE,marginRight:4,height:34}}><Avatar name="Bảo Long" size={32} shape="rounded"/><div style={{lineHeight:1.2,paddingRight:10}}><div style={T(14,700)}>Công ty XD Bảo Long</div><div style={T(13,500,MUTE,num)}>KH-0102 · Chủ tài khoản</div></div></div>
  <div style={{position:'relative',width:40,height:40,display:'grid',placeItems:'center'}}>{ic(EnvelopeIcon,24)}<i style={{position:'absolute',top:3,right:2,minWidth:17,height:17,borderRadius:9,background:BLUE,border:'2px solid #fff',color:'#fff',fontSize:11,fontWeight:700,display:'grid',placeItems:'center',fontStyle:'normal',boxSizing:'content-box'}}>2</i></div>
  <div style={{height:40,padding:'0 14px',borderRadius:10,border:'1px solid #C7D2DF',display:'flex',alignItems:'center',gap:6,fontSize:14.5,fontWeight:700}}>{ic(ArrowRightOnRectangleIcon,18)}Đăng xuất</div></div>
 <div style={{height:48,flex:'none',background:BLUE,display:'flex',alignItems:'flex-end',padding:'0 32px',gap:2}}>{PMENU.map(([k,t])=><span key={k} style={{height:40,padding:'0 18px',display:'flex',alignItems:'center',fontSize:14.5,fontWeight:700,borderRadius:'10px 10px 0 0',background:k===active?bg:'transparent',color:k===active?'#0B5CB8':'#fff'}}>{t}</span>)}</div>
 <div style={{flex:1,padding:'28px 48px 40px',display:'flex',flexDirection:'column',gap:20,position:'relative'}}>{children}</div></div>;
const PHead=({back,title,sub,right,chip})=><div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:20}}>
 <div>{back&&<div style={{display:'inline-flex',alignItems:'center',gap:2,color:'#0B5CB8',fontSize:15,fontWeight:700,marginLeft:-6,marginBottom:6}}>{ic(ChevronLeftIcon,20)}{back}</div>}
  <div style={{display:'flex',alignItems:'center',gap:12}}><h1 style={{margin:0,fontSize:26,fontWeight:800,letterSpacing:'-.02em',lineHeight:1.2}}>{title}</h1>{chip}</div>{sub&&<div style={T(15,500,MUTE,{marginTop:4})}>{sub}</div>}</div>
 {right&&<div style={{display:'flex',gap:10,alignItems:'center'}}>{right}</div>}</div>;
const PB=(k,children,Icon,extra)=><Btn k={k} h={44} Icon={Icon} style={{padding:'0 20px',fontSize:15,...extra}}>{children}</Btn>;
const Cols=({l,r,rw=360,gap=24})=><div style={{display:'flex',gap,alignItems:'flex-start'}}><div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:20}}>{l}</div><div style={{width:rw,flex:'none',display:'flex',flexDirection:'column',gap:20}}>{r}</div></div>;
const TH=({cols,heads,num:nm=[]})=><div style={{display:'grid',gridTemplateColumns:cols,gap:12,padding:'11px 20px',background:'#F1F4F8',fontSize:13.5,fontWeight:700,color:MUTE}}>{heads.map((h,i)=><span key={i} style={{textAlign:nm.includes(i)?'right':'left'}}>{h}</span>)}</div>;
const TR=({cols,cells,num:nm=[],style})=><div style={{display:'grid',gridTemplateColumns:cols,gap:12,padding:'13px 20px',borderTop:'1px solid '+LINE,fontSize:14,alignItems:'center',...style}}>{cells.map((c,i)=><span key={i} style={{textAlign:nm.includes(i)?'right':'left',minWidth:0,...(nm.includes(i)?num:{})}}>{c}</span>)}</div>;
const Arrow=ic(ChevronRightIcon,16,'#8793A5');
const Pn=({title,right,children,pad=20})=><Card pad={0} style={{borderRadius:14}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px 0'}}><b style={T(17,800)}>{title}</b>{right}</div><div style={{padding:pad}}>{children}</div></Card>;
const Hz=({steps})=><div style={{display:'flex',alignItems:'flex-start'}}>{steps.map(([t,time,st,sub],i)=>{const last=i===steps.length-1;const col=st==='done'?GREEN:st==='now'?BLUE:st==='bad'?RED:'#D5DDE8';
 return <div key={t} style={{flex:last?'none':1,display:'flex',flexDirection:'column',gap:10,minWidth:last?150:0}}>
  <div style={{display:'flex',alignItems:'center'}}>
   {st==='done'?<div style={{width:30,height:30,borderRadius:'50%',background:GREEN,color:'#fff',display:'grid',placeItems:'center',flex:'none'}}>{ic(CheckIcon,17)}</div>
   :st==='bad'?<div style={{width:30,height:30,borderRadius:'50%',background:RED,color:'#fff',display:'grid',placeItems:'center',flex:'none'}}>{ic(XMarkIcon,17)}</div>
   :st==='now'?<div style={{width:30,height:30,borderRadius:'50%',background:'#fff',border:'3px solid '+BLUE,boxSizing:'border-box',display:'grid',placeItems:'center',boxShadow:'0 0 0 5px rgba(11,99,198,.15)',flex:'none'}}><i style={{width:10,height:10,borderRadius:'50%',background:BLUE}}/></div>
   :<div style={{width:30,height:30,borderRadius:'50%',background:'#fff',border:'2px solid #D5DDE8',boxSizing:'border-box',flex:'none'}}/>}
   {!last&&<div style={{flex:1,height:3,margin:'0 8px',borderRadius:2,background:st==='done'?GREEN:'#E3E9F1'}}/>}</div>
  <div><div style={T(15,st==='todo'?500:800,st==='todo'?MUTE:INK)}>{t}</div><div style={T(13.5,st==='now'?800:600,st==='now'?BLUE:MUTE,{...num,marginTop:2})}>{time}</div>{sub&&<div style={T(13.5,500,MUTE,{marginTop:2,lineHeight:1.45,paddingRight:10})}>{sub}</div>}</div></div>})}</div>;

/* ---- home-pc ---- */
defw('customer-home-pc','/customer (máy tính)','Dashboard (2 cột)','Bản máy tính: thẻ xanh đơn đang giao rộng, Đặt lại nhanh, bảng Đơn gần đây; cột phải: công nợ, báo cáo hôm qua, liên hệ. Một nút chính xanh lá "Đặt hàng mới".',()=>
 <PCFrame active="home">
  <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between'}}><div><span style={{fontSize:13,fontWeight:700,color:'#0A4A96',background:'#E6F0FB',padding:'3px 10px',borderRadius:8,...num}}>KH-0102</span>
   <h1 style={{margin:'8px 0 2px',fontSize:28,fontWeight:800,letterSpacing:'-.02em'}}>Công ty XD Bảo Long</h1><div style={T(15,500,MUTE)}>Hiền Xa · Vật liệu xây dựng</div></div>{PB('g','Đặt hàng mới',PlusIcon)}</div>
  <Cols l={<>
   <div style={{position:'relative',overflow:'hidden',borderRadius:20,color:'#fff',padding:'24px 28px',background:'linear-gradient(150deg,#1478DC 0%,#0B63C6 48%,#0A4592 100%)',boxShadow:'0 20px 36px -18px rgba(11,99,198,.75)'}}>
    <div style={{position:'absolute',inset:0,backgroundImage:brickBg}}/><div style={{position:'absolute',right:24,top:12,opacity:.12}}><TruckS width={170} height={170}/></div>
    <div style={{position:'relative'}}><div style={{display:'flex',alignItems:'center',gap:14}}><span style={{display:'inline-flex',alignItems:'center',gap:7,background:'rgba(255,255,255,.18)',border:'1px solid rgba(255,255,255,.28)',padding:'3px 12px',borderRadius:999,fontSize:13.5,fontWeight:700}}><i style={{width:8,height:8,borderRadius:'50%',background:'#7CF0B0',boxShadow:'0 0 0 4px rgba(124,240,176,.28)'}}/>Đang giao</span><span style={T(14,600,'rgba(255,255,255,.9)')}>SO-0231 · CT Nhà xưởng Hà Đông</span></div>
     <div style={{display:'flex',alignItems:'baseline',gap:14,marginTop:14}}><span style={{fontSize:16,fontWeight:600,color:'rgba(255,255,255,.9)'}}>Xe tới khoảng</span><span style={{fontSize:52,fontWeight:800,letterSpacing:'-.03em',lineHeight:1,...num}}>14:30</span></div>
     <div style={{marginTop:20,height:8,borderRadius:99,background:'rgba(255,255,255,.24)',maxWidth:620}}><div style={{width:'70%',height:'100%',borderRadius:99,background:'#fff',boxShadow:'0 0 14px rgba(255,255,255,.7)'}}/></div>
     <div style={{display:'flex',justifyContent:'space-between',maxWidth:620,marginTop:10,fontSize:14,fontWeight:600,color:'rgba(255,255,255,.94)'}}><span>Đã đặt</span><span>Cửa hàng duyệt</span><span style={{fontWeight:800,textDecoration:'underline',textUnderlineOffset:4}}>Đang giao</span><span>Hoàn tất</span></div></div></div>
   <div><div style={{...T(17,800),marginBottom:10}}>Đặt lại nhanh</div><div style={{display:'flex',gap:14}}>
    {[['18/11 · CT Nhà xưởng Hà Đông','SO-0231','200 bao Xi măng · 25 m³ Cát · 8.000 viên Gạch'],['14/11 · CT Văn phòng Cầu Giấy','SO-0224','80 bao Xi măng · 6 m³ Đá 1×2']].map(([a,b,c])=><Card key={b} pad={16} style={{flex:1,display:'flex',alignItems:'center',gap:14,borderRadius:14}}><div style={{flex:1,minWidth:0}}><div style={T(13.5,600,MUTE)}>{a}</div><div style={T(15,800,'#0B5CB8',{margin:'2px 0'})}>{b}</div><div style={T(14.5,500,INK,{lineHeight:1.4})}>{c}</div></div><div style={{height:44,padding:'0 16px',borderRadius:11,border:'1.5px solid '+BLUE,color:BLUE,display:'flex',alignItems:'center',gap:6,fontSize:15,fontWeight:700}}>{ic(ArrowPathIcon,17)}Đặt lại</div></Card>)}</div></div>
   <Card pad={0} style={{borderRadius:14,overflow:'hidden'}}><div style={{display:'flex',justifyContent:'space-between',padding:'16px 20px 12px'}}><b style={T(17,800)}>Đơn gần đây</b><span style={T(14.5,700,'#0B5CB8')}>Xem tất cả ›</span></div>
    <TH cols="110px 1.6fr 100px 150px 130px 20px" heads={['Mã đơn','Công trình','Ngày đặt','Trạng thái','Tổng tiền','']} num={[4]}/>
    {[['SO-0233','CT Nhà xưởng Hà Đông','19/11','cd','19.950.000 ₫'],['SO-0231','CT Nhà xưởng Hà Đông','18/11','dg','45.600.000 ₫'],['SO-0229','CT Văn phòng Cầu Giấy','17/11','dd','9.000.000 ₫'],['SO-0224','CT Văn phòng Cầu Giấy','14/11','gi','7.120.000 ₫']].map(r=><TR key={r[0]} cols="110px 1.6fr 100px 150px 130px 20px" num={[4]} cells={[<b style={{color:'#0B5CB8'}}>{r[0]}</b>,r[1],r[2],<SC s={r[3]}/>,<b>{r[4]}</b>,Arrow]}/>)}</Card></>}
   r={<>
   <Card pad={20} style={{borderRadius:14}}><div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:40,height:40,borderRadius:11,background:'#E6F0FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(BanknotesIcon,22)}</div><div style={{flex:1}}><div style={T(13.5,600,MUTE)}>Công nợ còn lại</div></div><Chip k="e">Có khoản quá hạn</Chip></div>
    <div style={T(32,800,INK,{...num,letterSpacing:'-.02em',margin:'10px 0 12px'})}>58.900.000 ₫</div>
    <div style={{display:'flex',gap:3,height:10}}><i style={{flex:33,background:GREEN,borderRadius:'99px 4px 4px 99px'}}/><i style={{flex:13.6,background:AMB,borderRadius:4}}/><i style={{flex:12.3,background:RED,borderRadius:'4px 99px 99px 4px'}}/></div>
    <div style={T(13.5,500,MUTE,{marginTop:8})}>Quá hạn <b style={{color:RED}}>12.300.000 ₫</b></div>
    <div style={{marginTop:14,height:44,borderRadius:11,border:'1.5px solid '+BLUE,color:BLUE,display:'grid',placeItems:'center',fontSize:15,fontWeight:700}}>Xem công nợ</div></Card>
   <div style={{display:'flex',alignItems:'center',gap:10,background:'#FFF6E3',border:'1px solid #F3D9A4',borderRadius:12,padding:'12px 14px',fontSize:14.5,fontWeight:600,color:'#6B3F00'}}>{ic(ClockIcon,20,'#B26500')}<span style={{flex:1}}>1 đơn đang chờ cửa hàng duyệt</span>{ic(ChevronRightIcon,18,'#B26500')}</div>
   <Card pad={16} style={{borderRadius:14,display:'flex',alignItems:'center',gap:12}}><div style={{width:40,height:40,borderRadius:11,background:'#E6F0FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(ChartBarIcon,22)}</div><div style={{flex:1}}><div style={T(14.5,700)}>Hôm qua anh/chị đặt 3 món</div><div style={T(14,700,'#0B5CB8',{marginTop:2})}>Xem báo cáo ›</div></div></Card>
   <Card pad={16} style={{borderRadius:14}}><div style={T(13.5,600,MUTE)}>Cần hỗ trợ?</div><div style={{display:'flex',alignItems:'center',gap:12,marginTop:8}}><Avatar name="Văn phòng Hiền Xa" size={44}/><div style={{flex:1}}><div style={T(15,700)}>Văn phòng Hiền Xa</div><div style={{...T(13.5,600,GREEN),display:'flex',alignItems:'center',gap:5}}><i style={{width:8,height:8,borderRadius:'50%',background:GREEN}}/>Đang trực · 7:30–17:30</div></div></div><div style={{marginTop:12,height:44,borderRadius:11,background:'#E6F0FB',color:'#0A4A96',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:15,fontWeight:700}}>{ic(EnvelopeIcon,18)}Nhắn tin cho văn phòng</div></Card></>}/>
 </PCFrame>);

/* ---- orders-pc ---- */
defw('customer-orders-pc','/customer/orders (máy tính)','Filterable Table','Khung lọc trái có số đếm, bảng bên phải, mũi tên đầu dòng; cổng khách chỉ có nhãn "Đã duyệt" cho đơn đã xác nhận chưa giao (D48); hai thẻ Hàng hóa / Dịch vụ.',()=>
 <PCFrame active="orders">
  <PHead title="Đơn hàng" sub="Đơn của Công ty XD Bảo Long" right={PB('g','Đặt hàng mới',PlusIcon)}/>
  <div style={{display:'inline-flex',padding:4,background:'#E4EAF2',borderRadius:13,width:'fit-content'}}>{['Hàng hóa','Dịch vụ'].map((t,i)=><div key={t} style={{width:140,height:40,borderRadius:10,display:'grid',placeItems:'center',fontSize:15,fontWeight:i?600:800,background:i?'transparent':'#fff',color:i?MUTE:'#0B5CB8',boxShadow:i?'none':'0 1px 3px rgba(16,34,58,.15)'}}>{t}</div>)}</div>
  <div style={{display:'flex',gap:24,alignItems:'flex-start'}}>
   <div style={{width:250,flex:'none',display:'flex',flexDirection:'column',gap:14}}>
    <Card pad={14} style={{borderRadius:14}}><div style={{height:44,borderRadius:10,border:'1.5px solid #C7D2DF',display:'flex',alignItems:'center',gap:8,padding:'0 12px',color:'#8793A5',fontSize:15}}>{ic(MagnifyingGlassIcon,20)}Tìm mã đơn, công trình</div></Card>
    <Card pad={16} style={{borderRadius:14}}><div style={T(13.5,700,MUTE,{marginBottom:6})}>Trạng thái</div>
     {[['Tất cả',5],['Chờ duyệt',1],['Đã duyệt',1],['Đang giao',1],['Hoàn tất',1],['Đã hủy',1]].map(([t,n],i)=><div key={t} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 4px',fontSize:15,fontWeight:i?500:800}}><span style={{width:18,height:18,borderRadius:'50%',border:i?'1.5px solid #C7D2DF':'5.5px solid '+BLUE,boxSizing:'border-box'}}/><span style={{flex:1}}>{t}</span><span style={T(13.5,600,MUTE)}>{n}</span></div>)}</Card></div>
   <Card pad={0} style={{flex:1,borderRadius:14,overflow:'hidden'}}>
    <TH cols="24px 100px 1.5fr 1.6fr 140px 150px 130px" heads={['','Mã đơn','Công trình · ngày đặt','Hàng','Ngày giao','Trạng thái','Tổng tiền']} num={[6]}/>
    {[['SO-0233','CT Nhà xưởng Hà Đông','Đặt hôm nay 08:12','150 cây Thép phi 10 CB300','Muốn nhận 21/11','cd','19.950.000 ₫'],['SO-0231','CT Nhà xưởng Hà Đông','Đặt 18/11','200 bao Xi măng PC40 · còn 3 loại','Hôm nay · ~14:30','dg','45.600.000 ₫'],['SO-0229','CT Văn phòng Cầu Giấy','Đặt 17/11','5.000 viên Gạch ống 4 lỗ','Dự kiến 22/11','dd','9.000.000 ₫'],['SO-0224','CT Văn phòng Cầu Giấy','Đặt 14/11','80 bao Xi măng PC40','Hoàn tất 15/11','gi','7.120.000 ₫'],['SO-0217','CT Văn phòng Cầu Giấy','Đặt 08/11','60 cây Thép phi 16 CB300','—','hu','12.600.000 ₫']].map(r=><TR key={r[0]} cols="24px 100px 1.5fr 1.6fr 140px 150px 130px" num={[6]} style={{padding:'15px 20px'}} cells={[Arrow,<b style={{color:'#0B5CB8',fontSize:14.5}}>{r[0]}</b>,<div><div style={{fontWeight:600}}>{r[1]}</div><div style={T(13.5,500,MUTE)}>{r[2]}</div></div>,r[3],r[4],<SC s={r[5]}/>,<b>{r[6]}</b>]}/>)}
    <div style={{padding:'12px 20px',borderTop:'1px solid '+LINE,fontSize:13.5,color:MUTE,display:'flex',justifyContent:'space-between'}}><span>Hiển thị 1–5 · 20 dòng mỗi trang</span><span>‹ Trước · 1 · Sau ›</span></div></Card></div>
 </PCFrame>);

/* ---- order-new-pc ---- */
const PRow=({name,kind,price,unit,stock,units,u,on,n,conv})=><div style={{display:'grid',gridTemplateColumns:'1fr 96px 150px 104px 190px',gap:14,alignItems:'center',padding:'14px 20px',borderTop:'1px solid '+LINE,background:on?'#F7FAFE':'#fff'}}>
 <div><div style={T(15.5,800)}>{name}</div><div style={T(13.5,500,MUTE,{marginTop:2})}>{kind}{conv&&' · '+conv}</div></div><Chip k={stock?'s':'w'}>{stock?'Còn hàng':'Đặt trước'}</Chip>
 <div>{units?<Seg items={units} on={u}/>:<span style={T(14,500,MUTE)}>Đơn vị: {unit}</span>}</div>
 <div style={{textAlign:'right'}}><div style={T(17,800,BLUE,num)}>{price}</div><div style={T(13,600,MUTE)}>/ {unit}</div></div>
 <div>{on?<Stepper n={n} u={u||unit} h={48} bw={50}/>:<Btn k="o" h={48} Icon={PlusIcon} style={{fontSize:15}}>Thêm</Btn>}</div></div>;
defw('customer-order-new-pc','/customer/orders/new (máy tính)','Checkout Form (cột phải dính)','Danh sách hàng bên trái (tìm, lọc nhóm, đổi đơn vị, − số +); cột phải dính "Đơn của bạn": giao tới, giờ nhận, tạm tính theo bảng giá và nút Xem & gửi đơn (mở "Xem lại đơn").',()=>
 <PCFrame active="new" minH={880}>
  <PHead back="Trang chủ" title="Đặt hàng"/>
  <Cols rw={380} l={<>
   <Card pad={16} style={{borderRadius:14,display:'flex',gap:16,alignItems:'center'}}><div style={{width:44,height:44,borderRadius:12,background:'#E6F0FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(MapPinIcon,22)}</div><div style={{flex:1}}><div style={T(13,600,MUTE)}>Công trình / điểm giao</div><div style={T(16,800)}>CT Nhà xưởng Hà Đông</div><div style={T(14,500,MUTE)}>Km 12 Quốc lộ 6, Hà Đông · Anh Long 0912 345 678</div></div><span style={{height:40,padding:'0 14px',borderRadius:10,border:'1px solid #C7D2DF',display:'flex',alignItems:'center',gap:6,fontSize:14.5,fontWeight:700}}>Đổi{ic(ChevronDownIcon,16)}</span></Card>
   <Card pad={0} style={{borderRadius:14,overflow:'hidden'}}>
    <div style={{background:BLUE,padding:'14px 20px',display:'flex',gap:14,alignItems:'center'}}><div style={{flex:1,height:46,borderRadius:11,background:'#fff',display:'flex',alignItems:'center',gap:10,padding:'0 14px',fontSize:16,color:'#8793A5'}}>{ic(MagnifyingGlassIcon,22)}Tìm xi măng, thép, cát…</div>
     <div style={{display:'flex',gap:8}}>{[['Tất cả',1],['Đã chọn · 2'],['Xi măng'],['Thép'],['Cát đá']].map(([t,on])=><span key={t} style={{height:40,padding:'0 14px',borderRadius:999,display:'inline-flex',alignItems:'center',fontSize:14.5,fontWeight:700,background:on?'#fff':'rgba(255,255,255,.16)',color:on?'#0B5CB8':'#fff',border:'1px solid rgba(255,255,255,.4)',whiteSpace:'nowrap'}}>{t}</span>)}</div></div>
    <TH cols="1fr 96px 150px 104px 190px" heads={['Hàng hóa','Tình trạng','Đơn vị','Giá của bạn','Số lượng']} num={[3]}/>
    <PRow name="Xi măng PC40 Hoàng Thạch" kind="Loại PCB40 · XM-0101" conv="1 tấn = 20 bao" price="89.000 ₫" unit="bao" stock units={['bao','tấn']} u="bao" on n="200"/>
    <PRow name="Cát xây" kind="Cát vàng sàng · CA-0102" price="280.000 ₫" unit="m³" stock on n="25"/>
    <PRow name="Gạch ống 4 lỗ" kind="Gạch nung · GA-0103" price="1.800 ₫" unit="viên" stock on n="8.000"/>
    <PRow name="Đá 1×2" kind="Đá xanh · DA-0104" price="320.000 ₫" unit="m³" on n="20"/>
    <PRow name="Thép phi 10 CB300" kind="Cây 11,7 m · TH-0103" price="133.000 ₫" unit="cây" stock units={['cây','kg']} u="cây"/>
    <PRow name="Ống nhựa PVC phi 90" kind="Cây 4 m · ON-0201" price="95.000 ₫" unit="cây" stock/></Card></>}
   r={<div style={{position:'sticky',top:20,display:'flex',flexDirection:'column',gap:16}}>
    <Card pad={0} style={{borderRadius:14,overflow:'hidden',borderColor:'#BBD6F4'}}>
     <div style={{padding:'16px 20px',background:'linear-gradient(135deg,#1478DC,#0B63C6 55%,#0A4FA0)',color:'#fff',display:'flex',alignItems:'center',gap:12}}><div style={{minWidth:36,height:36,borderRadius:11,background:'rgba(255,255,255,.2)',display:'grid',placeItems:'center',fontSize:18,fontWeight:800}}>4</div><div><div style={T(13.5,600,'rgba(255,255,255,.88)')}>Đơn của anh/chị</div><div style={T(17,800,'#fff')}>4 dòng hàng</div></div></div>
     <div style={{padding:'6px 20px'}}>{LINES.map((l,i)=><div key={l[0]} style={{display:'flex',justifyContent:'space-between',gap:10,padding:'10px 0',borderTop:i?'1px solid '+LINE:0,fontSize:14}}><div style={{minWidth:0}}><div style={{fontWeight:700}}>{l[0]}</div><div style={T(13,500,MUTE,num)}>{l[1]} × {l[2]}</div></div><b style={{...num,whiteSpace:'nowrap'}}>{l[3]}</b></div>)}</div>
     <div style={{padding:'12px 20px',borderTop:'1px solid '+LINE,display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'flex',gap:10}}><div style={{flex:1,background:BG,borderRadius:10,padding:'8px 10px'}}><div style={T(13,600,MUTE)}>Muốn nhận lúc</div><div style={T(14.5,700,INK,num)}>20/11 · 08:00</div></div><div style={{flex:1,background:BG,borderRadius:10,padding:'8px 10px'}}><div style={T(13,600,MUTE)}>Ghi chú</div><div style={T(14.5,700)}>Gọi trước 15 phút</div></div></div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}><span style={T(13.5,600,MUTE,{lineHeight:1.3})}>Tạm tính<br/>theo bảng giá</span><b style={T(24,800,INK,{...num,letterSpacing:'-.02em',whiteSpace:'nowrap'})}>45.600.000 ₫</b></div>
      <Btn k="p" h={52} right={ChevronRightIcon} style={{fontSize:16}}>Xem & gửi đơn</Btn>
      <div style={T(13,500,MUTE,{lineHeight:1.5})}>Cửa hàng duyệt đơn rồi báo ngày giao; chưa giữ hàng cho tới khi duyệt.</div></div></Card></div>}/>
 </PCFrame>);

/* ---- order-detail-pc ---- */
defw('customer-order-detail-pc','/customer/orders/:id (máy tính)','Order Detail (2 cột)','Hành trình ngang có giờ, Hàng hóa dạng bảng; cột phải: lượt giao, giao tới, công nợ đơn này, thanh toán. "Đặt lại đơn này" là nút viền (không có nút xanh lá).',()=>
 <PCFrame active="orders">
  <PHead back="Đơn hàng" title="Đặt 18/11 · CT Nhà xưởng Hà Đông" chip={<SC s="dg"/>} sub={<span>Mã đơn <b style={{color:'#0B5CB8',...num}}>SO-0231</b> · Giao tới Km 12 Quốc lộ 6, Hà Đông</span>} right={PB('o','Đặt lại đơn này',ArrowPathIcon)}/>
  <Cols l={<>
   <Pn title="Hành trình đơn"><div style={{marginTop:6}}><Hz steps={[['Đã đặt','18/11 · 16:05','done'],['Cửa hàng duyệt','18/11 · 16:40','done','Hàng đã lên xe lúc 08:10 ngày 19/11'],['Đang giao','~14:30','now','Xe đang tới công trình'],['Hoàn tất','—','todo']]}/></div></Pn>
   <Card pad={0} style={{borderRadius:14,overflow:'hidden'}}><div style={{padding:'16px 20px 12px'}}><b style={T(17,800)}>Hàng hóa</b></div>
    <TH cols="1.6fr 120px 130px 150px" heads={['Hàng hóa','Số lượng','Đơn giá','Thành tiền']} num={[1,2,3]}/>
    {LINES.map(l=><TR key={l[0]} cols="1.6fr 120px 130px 150px" num={[1,2,3]} cells={[<b style={{fontWeight:600}}>{l[0]}</b>,l[1],l[2],<b>{l[3]}</b>]}/>)}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'14px 20px',background:'#F8FAFC',borderTop:'1px solid '+LINE}}><span style={T(14.5,700,MUTE)}>Tổng cộng</span><b style={T(22,800,INK,num)}>45.600.000 ₫</b></div></Card></>}
   r={<>
   <Card pad={20} style={{borderRadius:14}}><div style={{display:'flex',alignItems:'center',gap:12}}><div style={{width:44,height:44,borderRadius:12,background:'#E6F0FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(TruckIcon,24)}</div><div style={{flex:1}}><div style={T(13,600,MUTE)}>Lượt giao 1</div><div style={T(16,800)}>Đang giao hàng</div></div><div style={{textAlign:'right'}}><div style={T(13,600,MUTE)}>Dự kiến</div><div style={T(18,800,BLUE,num)}>~14:30</div></div></div><div style={{marginTop:14}}><ProgressBar label="Tiến độ giao" value={72} isLabelHidden/></div></Card>
   <Pn title="Công nợ đơn này" right={<Chip k="i">Chưa ghi nợ</Chip>}><div style={T(14.5,500,MUTE,{lineHeight:1.55})}>Công nợ được ghi sau khi cửa hàng xác minh giao đủ. Hạn trả tính từ ngày xác minh.</div></Pn>
   <Pn title="Thanh toán" pad={0}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 20px'}}><div><div style={T(15,600)}>Trả trước</div><div style={T(13.5,500,MUTE)}>18/11 · Chuyển khoản</div></div><b style={T(16,800,INK,num)}>10.000.000 ₫</b></div></Pn></>}/>
 </PCFrame>);

/* ---- reports-pc ---- */
const RTH="1.6fr 110px 110px 120px 150px 24px";
defw('customer-reports-ordered-pc','/customer/reports/ordered (máy tính)','Data Dashboard + Table','Báo cáo hàng đã đặt (D98), số liệu cùng nguồn với bản điện thoại (tính bằng code): 4 ô số hàng ngang, bảng loại hàng có mở "Nằm trong N đơn", cột phải theo ngày + dịch vụ + xuất file.',()=>
 <PCFrame active="reports" minH={900}>
  <PHead back="Đơn hàng" title="Báo cáo hàng đã đặt" sub="Hàng anh/chị đã đặt, cộng theo từng loại trong kỳ."/>
  <Card pad={16} style={{borderRadius:14,display:'flex',alignItems:'center',gap:20}}>
   <div style={{display:'flex',gap:8}}>{['Hôm nay','Hôm qua','7 ngày','Tháng này'].map(t=><Pill key={t} on={t==='7 ngày'}>{t}</Pill>)}</div>
   <div style={{display:'flex',gap:12,width:380}}><Field style={{flex:1}} label="Từ ngày" value="13/11/2026" mono/><Field style={{flex:1}} label="Đến ngày" value="19/11/2026" mono/></div>
   <div style={T(13.5,500,MUTE,{flex:1})}>Kỳ 13/11/2026 – 19/11/2026 · tự áp dụng khi anh/chị chọn xong</div></Card>
  <div style={{display:'flex',gap:16}}><Stat l="Số đơn" v={ORD.length} s="2 đơn đã hủy, không tính"/><Stat l="Số loại hàng" v={AGG.length} s="gộp theo từng loại hàng"/><Stat l="Đã giao" v={FULL+'/'+AGG.length} s="loại đã giao đủ"/><Stat f={1.4} l="Tổng tiền" v={money(GOODS+SERV)} c={BLUE} s={'hàng '+fq(GOODS)+' + dịch vụ '+fq(SERV)}/></div>
  <Cols rw={380} l={
   <Card pad={0} style={{borderRadius:14,overflow:'hidden'}}><div style={{padding:'16px 20px 12px'}}><b style={T(17,800)}>Hàng đã đặt</b></div>
    <TH cols={RTH} heads={['Hàng hóa','Đặt','Đã giao','Còn lại','Tiền','']} num={[1,2,3,4]}/>
    {AGG.map((a,i)=>{const r0=a.q-a.dl;return <div key={a.n}><TR cols={RTH} num={[1,2,3,4]} cells={[<b style={{fontWeight:700}}>{a.n}</b>,fq(a.q)+' '+a.u,fq(a.dl)+' '+a.u,r0===0?<span style={{color:'#0D5A33',fontWeight:700}}>0 · đủ</span>:<span style={{color:a.dl>0?'#8A4F00':MUTE,fontWeight:700}}>{fq(r0)+' '+a.u}</span>,money(a.mn),ic(i===0?ChevronDownIcon:ChevronRightIcon,16,'#8793A5')]}/>
     {i===0&&<div style={{background:'#FAFBFD',borderTop:'1px solid '+LINE,padding:'8px 20px 10px 36px'}}><div style={T(13.5,800,'#0B5CB8',{margin:'2px 0 6px'})}>Nằm trong {a.os.length} đơn</div>{a.os.map(o=><div key={o.c} style={{display:'grid',gridTemplateColumns:'100px 1fr 130px 24px',gap:12,alignItems:'center',padding:'6px 0',fontSize:14}}><b style={{color:'#0B5CB8'}}>{o.c}</b><span style={{color:MUTE}}>Đặt {o.d}/2026 · {fq(o.q)} {a.u}</span><SC s={o.s}/>{Arrow}</div>)}</div>}</div>})}
    <div style={{display:'flex',justifyContent:'space-between',padding:'14px 20px',background:'#E6F0FB',fontSize:14.5,fontWeight:700,color:'#0A4A96'}}><span>Tổng cộng hàng hóa · {AGG.length} loại hàng · {ORD.length} đơn</span><b style={{...num,fontSize:16}}>{money(GOODS)}</b></div></Card>}
   r={<>
   <Pn title="Theo ngày" pad={0}>{DAYS.map((d,i)=><div key={d.d} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 20px',borderTop:i?'1px solid '+LINE:0,marginTop:i?0:12,background:i===0?'#EEF5FD':'transparent'}}><div style={{flex:1}}><div style={T(14.5,700)}>{d.w}, {d.d}</div><div style={T(13.5,500,MUTE)}>{d.o} đơn · {d.k} loại hàng</div></div><b style={T(14.5,800,INK,num)}>{money(d.mn)}</b></div>)}</Pn>
   <Pn title="Dịch vụ"><div style={{display:'flex',alignItems:'center',gap:12}}><div style={{width:40,height:40,borderRadius:11,background:'#E6F0FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(WrenchScrewdriverIcon,22)}</div><div style={{flex:1}}><div style={T(14.5,700)}>Máy trộn bê tông · 1 ca</div><div style={T(13.5,500,MUTE)}>16/11/2026</div></div><b style={T(14.5,800,INK,num)}>{money(SERV)}</b></div></Pn>
   <div style={{display:'flex',gap:10}}>{PB('o','Xuất Excel',DocumentArrowDownIcon,{flex:1})}{PB('o','Xuất CSV',DocumentArrowDownIcon,{flex:1})}</div>
   <div style={T(13,500,MUTE,{lineHeight:1.5})}>Cập nhật đến 08:46 ngày 19/11/2026. Đơn đã hủy không tính.</div></>}/>
 </PCFrame>);

/* ---- pay dialog ---- */
const PayDialog=({done})=><div style={{width:760,background:'#fff',borderRadius:20,boxShadow:'0 30px 80px rgba(0,0,0,.35)',overflow:'hidden'}}>
 <div style={{display:'flex',alignItems:'center',padding:'16px 24px',borderBottom:'1px solid '+LINE}}><b style={{flex:1,fontSize:20,fontWeight:800}}>Thanh toán DV-0043</b><div style={{height:40,padding:'0 14px',borderRadius:10,background:'#EDF1F6',display:'flex',alignItems:'center',gap:6,fontSize:14.5,fontWeight:700}}>{ic(XMarkIcon,18)}Đóng</div></div>
 {done?<div style={{padding:24,display:'flex',gap:24,alignItems:'stretch'}}>
   <div style={{flex:1,borderRadius:18,padding:'28px 20px',textAlign:'center',color:'#fff',position:'relative',overflow:'hidden',background:'linear-gradient(155deg,#1A9A5E,#12804A 55%,#0C6339)'}}><div style={{position:'absolute',inset:0,backgroundImage:brickBg}}/><div style={{position:'relative'}}><div style={{width:76,height:76,borderRadius:'50%',background:'rgba(255,255,255,.2)',margin:'0 auto',display:'grid',placeItems:'center',boxShadow:'0 0 0 10px rgba(255,255,255,.12)'}}><CheckCircleS width={52} height={52} color="#fff"/></div><div style={{fontSize:15,fontWeight:600,marginTop:18,color:'rgba(255,255,255,.9)'}}>Ngân hàng đã báo tiền về</div><div style={{fontSize:22,fontWeight:800,marginTop:4}}>Đã nhận thanh toán</div><div style={{fontSize:38,fontWeight:800,letterSpacing:'-.02em',...num}}>2.500.000 ₫</div></div></div>
   <div style={{width:330}}><Card pad={0} style={{overflow:'hidden',boxShadow:'none'}}><KVR first k="Phiếu thu" v="PT-0418"/><KVR k="Thanh toán cho" v="DV-0043 · Máy trộn bê tông"/><KVR k="Thời gian" v="19/11/2026 · 10:42"/><KVR k="Còn phải trả" v="56.400.000 ₫"/></Card><div style={{marginTop:14}}><Btn k="p" h={52}>Đóng và xem công nợ</Btn></div></div></div>
 :<div style={{padding:24,display:'flex',gap:24,alignItems:'flex-start'}}>
   <div style={{width:290,flex:'none',display:'flex',flexDirection:'column',alignItems:'center',gap:10}}><div style={{padding:8,borderRadius:18,border:'2px solid '+LINE}}><Qr size={266}/></div><div style={T(14.5,600,MUTE,{textAlign:'center'})}>Quét mã bằng ứng dụng ngân hàng, <b style={{color:INK}}>không sửa nội dung</b></div></div>
   <div style={{flex:1,display:'flex',flexDirection:'column',gap:14}}><Card pad={0} style={{overflow:'hidden',boxShadow:'none'}}><KVR first strong k="Số tiền" v="2.500.000 ₫"/><KVR k="Nội dung" v="HX KH0102 DV0043" copy="Sao chép"/><KVR k="Ngân hàng & số TK" v={<>Vietcombank<br/>0011 0022 3344</>} copy="Sao chép"/><KVR k="Chủ tài khoản" v="CÔNG TY TNHH VLXD HIỀN XA"/></Card>
    <div style={{display:'flex',alignItems:'center',gap:12,height:52,borderRadius:14,background:'#FFF1D0',border:'1px solid #F0CF87',padding:'0 16px',color:'#6B3F00',fontSize:15.5,fontWeight:700}}><span style={{width:22,height:22,borderRadius:'50%',border:'3px solid #E8890C',borderTopColor:'transparent',boxSizing:'border-box'}}/>Đang chờ tiền về…</div></div></div>}</div>;
const Overlay=({children})=><div style={{position:'absolute',inset:0,zIndex:6,background:'rgba(11,28,50,.55)',backdropFilter:'blur(2px)',display:'flex',alignItems:'center',justifyContent:'center'}}>{children}</div>;
const DebtBody=()=><>
  <PHead title="Công nợ" sub="Công ty XD Bảo Long"/>
  <Cols rw={400} l={
   <Card pad={0} style={{borderRadius:14,overflow:'hidden'}}><div style={{padding:'16px 20px 12px'}}><b style={T(17,800)}>Khoản cần thanh toán</b></div>
    <TH cols="120px 1.5fr 190px 130px 130px" heads={['Mã','Nội dung','Hạn trả','Còn nợ','']} num={[3]}/>
    {[['SO-0198','Xi măng, cát · giao 01/11','Quá hạn 12 ngày · hạn 07/11','r','12.300.000 ₫'],['SO-0212','Gạch ống 4 lỗ · giao 10/11','Còn 5 ngày · hạn 24/11','o','13.600.000 ₫'],['SO-0220','Thép phi 10 · giao 18/11','Trong hạn · hạn 02/12','','18.500.000 ₫'],['DV-0043','Máy trộn bê tông · 1 ca','Trong hạn · hạn 10/12','','2.500.000 ₫'],['Số dư đầu kỳ','Công nợ chuyển từ kỳ trước','Trong hạn · hạn 15/12','','12.000.000 ₫']].map(r=><TR key={r[0]} cols="120px 1.5fr 190px 130px 130px" num={[3]} style={{padding:'12px 20px'}} cells={[<b style={{color:'#0B5CB8',fontSize:14.5}}>{r[0]}</b>,r[1],<span style={{fontWeight:700,fontSize:13.5,color:r[3]==='r'?RED:r[3]==='o'?'#8A4F00':'#46556A'}}>{r[2]}</span>,<b>{r[4]}</b>,<span style={{height:44,borderRadius:11,border:'1.5px solid '+BLUE,color:BLUE,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14.5,fontWeight:700}}>Thanh toán</span>]}/>)}</Card>}
   r={<>
   <Card pad={22} style={{borderRadius:14}}><div style={T(14.5,600,MUTE)}>Còn phải trả</div><div style={T(40,800,INK,{...num,letterSpacing:'-.03em',margin:'2px 0 14px',whiteSpace:'nowrap'})}>58.900.000 ₫</div>
    <div style={{display:'flex',gap:3,height:12}}><i style={{flex:33,background:GREEN,borderRadius:'99px 4px 4px 99px'}}/><i style={{flex:13.6,background:AMB,borderRadius:4}}/><i style={{flex:12.3,background:RED,borderRadius:'4px 99px 99px 4px'}}/></div>
    <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:14}}>{[[GREEN,'Trong hạn','33.000.000 ₫'],[AMB,'Sắp tới hạn (≤ 7 ngày)','13.600.000 ₫'],[RED,'Quá hạn','12.300.000 ₫']].map(([c,a,b])=><div key={a} style={{display:'flex',alignItems:'center',gap:10,fontSize:14.5}}><i style={{width:12,height:12,borderRadius:4,background:c}}/><span style={{flex:1,color:MUTE}}>{a}</span><b style={{...num,color:c===RED?RED:INK}}>{b}</b></div>)}</div>
    <div style={{marginTop:18}}><Btn k="g" h={52} Icon={BanknotesIcon}>Thanh toán tất cả</Btn></div></Card>
   <div style={T(13.5,500,MUTE,{lineHeight:1.55})}>Mỗi mã QR trả đúng một khoản. "Thanh toán tất cả" trả toàn bộ công nợ. Tiền được ghi tự động khi ngân hàng báo về.</div></>}/></>;
defw('customer-debts-pc','/customer/debts (máy tính)','Table + Dialog','Công nợ: bảng khoản cần thanh toán (mỗi dòng một đơn) + thẻ Còn phải trả với thanh 3 màu; bấm Thanh toán mở hộp thoại giữa màn hình có QR ngay (D42).',()=>
 <PCFrame active="debts" minH={900}><DebtBody/><Overlay><PayDialog/></Overlay></PCFrame>);
defw('customer-pay-qr-pc','/customer/debts (hộp thoại Thanh toán, máy tính)','Dialog','Hộp thoại Thanh toán giữa màn hình: QR bên trái, bảng Số tiền / Nội dung / Ngân hàng & số TK / Chủ TK bên phải, dải "Đang chờ tiền về…".',()=>
 <PCFrame active="debts" minH={760}><div style={{height:560}}/><Overlay><PayDialog/></Overlay></PCFrame>);
defw('customer-pay-done-pc','/customer/debts (đã nhận tiền, máy tính)','Dialog + Success','Khi ngân hàng báo tiền về: khung xanh "Đã nhận thanh toán 2.500.000 ₫" + mã phiếu thu.',()=>
 <PCFrame active="debts" minH={760}><div style={{height:560}}/><Overlay><PayDialog done/></Overlay></PCFrame>);

/* ---- service-pc ---- */
const SOpt=({Icon,t,s,on})=><div style={{flex:1,display:'flex',alignItems:'center',gap:12,padding:'14px 16px',borderRadius:14,border:'1.5px solid '+(on?BLUE:LINE),background:on?'#F1F7FE':'#fff',boxShadow:on?'0 0 0 3px rgba(11,99,198,.10)':'none'}}><div style={{width:44,height:44,borderRadius:12,background:on?BLUE:'#EDF1F6',color:on?'#fff':MUTE,display:'grid',placeItems:'center'}}>{ic(Icon,24)}</div><div style={{flex:1}}><div style={T(15.5,700)}>{t}</div><div style={T(13.5,500,MUTE)}>{s}</div></div><span style={{width:22,height:22,borderRadius:'50%',border:on?'7px solid '+BLUE:'2px solid #C7D2DF',boxSizing:'border-box'}}/></div>;
defw('customer-service-new-pc','/customer/services/new (máy tính)','Checkout Form','Chọn loại dịch vụ, công trình, ngày giờ muốn, ghi chú; gửi đi là "Chờ xác nhận lịch". Cột phải giải thích các bước.',()=>
 <PCFrame active="orders">
  <PHead back="Đơn hàng" title="Yêu cầu dịch vụ" sub="Cửa hàng xác nhận lịch rồi báo lại cho anh/chị."/>
  <Cols rw={360} l={<Pn title="Thông tin yêu cầu"><div style={{display:'flex',flexDirection:'column',gap:18}}>
   <div><div style={T(13.5,600,MUTE,{marginBottom:8})}>Loại dịch vụ</div><div style={{display:'flex',gap:12}}><SOpt Icon={WrenchScrewdriverIcon} t="Cẩu hàng lên tầng cao" s="Tính theo giờ" on/><SOpt Icon={CubeIcon} t="Máy trộn bê tông" s="Tính theo ca"/><SOpt Icon={TruckIcon} t="Vận chuyển cát" s="Tính theo chuyến"/></div></div>
   <Field label="Công trình" value="CT Nhà xưởng Hà Đông" Icon={MapPinIcon} right={ic(ChevronDownIcon,20,'#8793A5')}/>
   <div style={{display:'flex',gap:14}}><Field style={{flex:1}} label="Ngày muốn" value="22/11/2026" mono Icon={CalendarDaysIcon}/><Field style={{flex:1}} label="Giờ muốn" value="08:00" mono Icon={ClockIcon}/></div>
   <Field label="Ghi chú cho cửa hàng" value="Cẩu lên tầng 5, đường vào hẹp"/>
   <div style={{display:'flex',justifyContent:'flex-end'}}><div style={{width:240}}><Btn k="p" Icon={PaperAirplaneIcon}>Gửi yêu cầu</Btn></div></div></div></Pn>}
   r={<Pn title="Các bước"><Journey steps={[['Gửi yêu cầu','Bây giờ','now'],['Chờ xác nhận lịch','Cửa hàng xem lịch','todo'],['Đã xếp lịch','Cửa hàng báo lại','todo'],['Hoàn tất','—','todo']]}/><div style={T(13.5,500,MUTE,{marginTop:14,lineHeight:1.55})}>Gửi đi là "Chờ xác nhận lịch", chưa phải lịch chắc chắn.</div></Pn>}/>
 </PCFrame>);
defw('customer-service-detail-pc','/customer/services/:id (máy tính)','Work Item Detail','Đã xếp lịch: khách không tự hủy, chỉ gọi cửa hàng; tiến trình ngang.',()=>
 <PCFrame active="orders">
  <PHead back="Đơn hàng" title="Cẩu hàng lên tầng cao" chip={<Chip k="i">Đã xếp lịch</Chip>} sub={<span style={num}>YC-0019 · Gửi 19/11/2026</span>} right={PB('o','Gọi cửa hàng',PhoneIcon)}/>
  <Cols l={<>
   <div style={{borderRadius:14,background:'#EAF3FD',border:'1px solid #BBD6F4',padding:18,display:'flex',gap:12,color:'#0A3D7A',fontSize:15,lineHeight:1.55,fontWeight:500}}>{ic(CheckBadgeIcon,26)}<span>Cửa hàng đã xếp lịch. Đã xếp lịch thì anh/chị không tự hủy, vui lòng gọi cửa hàng nếu cần đổi.</span></div>
   <Pn title="Tiến trình"><Hz steps={[['Đã gửi yêu cầu','19/11 · 09:05','done'],['Chờ xác nhận lịch','19/11 · 09:05','done'],['Đã xếp lịch','19/11 · 10:20','now'],['Hoàn tất','—','todo']]}/></Pn></>}
   r={<Pn title="Chi tiết" pad={0}>{[['Công trình','CT Nhà xưởng Hà Đông'],['Ngày muốn','22/11/2026 · 08:00'],['Lịch đã xếp','22/11/2026 · 09:30'],['Ghi chú','Cẩu lên tầng 5, đường vào hẹp']].map(([a,b],i)=><div key={a} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'13px 20px',borderTop:i?'1px solid '+LINE:0,marginTop:i?0:12,fontSize:14.5}}><span style={{color:MUTE}}>{a}</span><b style={{textAlign:'right',color:i===2?BLUE:INK}}>{b}</b></div>)}</Pn>}/>
 </PCFrame>);

/* ---- profile-pc ---- */
defw('customer-profile-pc','/customer/profile (máy tính)','Settings Panels (2 cột)','Hồ sơ: công trình, người nhận hàng; cột phải: tài khoản, giao diện & màu, Đăng xuất.',()=>
 <PCFrame active="me">
  <PHead title="Hồ sơ của tôi"/>
  <Cols l={<>
   <Card pad={20} style={{borderRadius:14,display:'flex',alignItems:'center',gap:18}}><Avatar name="Nguyễn Văn Long" size={72}/><div><div style={T(22,800)}>Nguyễn Văn Long</div><div style={T(14.5,500,MUTE,{margin:'2px 0 8px'})}>Công ty XD Bảo Long · <span style={num}>KH-0102</span></div><Chip k="i">Chủ tài khoản</Chip></div></Card>
   <Pn title="Công trình" right={<span style={T(14.5,700,'#0B5CB8')}>+ Địa chỉ giao mới</span>} pad={0}><div style={{marginTop:10}}><Row first Icon={MapPinIcon} t="CT Nhà xưởng Hà Đông" s="Km 12 Quốc lộ 6, Hà Đông"/><Row Icon={MapPinIcon} t="CT Văn phòng Cầu Giấy" s="Số 18 Trần Thái Tông, Cầu Giấy"/></div></Pn>
   <Pn title="Người nhận hàng" right={<span style={T(14.5,700,'#0B5CB8')}>+ Thêm</span>} pad={0}><div style={{marginTop:10}}><Row first Icon={UsersIcon} t="Trần Minh Đức" s="0903 111 222 · CT Hà Đông"/><Row Icon={UsersIcon} t="Lê Hồng Sơn" s="0988 765 432 · CT Cầu Giấy"/></div></Pn></>}
   r={<>
   <Pn title="Tài khoản" pad={0}><div style={{marginTop:8}}><Row first Icon={KeyIcon} t="Đổi mật khẩu"/><Row Icon={PaintBrushIcon} t="Giao diện & màu" s="Tự động · Classic · Cỡ chữ Vừa"/></div></Pn>
   {PB('oe','Đăng xuất',ArrowRightOnRectangleIcon,{height:48})}</>}/>
 </PCFrame>);

/* ---- messages-pc ---- */
defw('customer-messages-pc','/customer/messages (máy tính)','Messaging Inbox (2 cột)','Hai cột như UX: khung chat bên trái (bong bóng của mình bên phải nền xanh), danh bạ bên phải; chỉ nhắn với văn phòng.',()=>
 <PCFrame active="messages" minH={820}>
  <div style={{display:'flex',height:640,background:'#fff',border:'1px solid '+LINE,borderRadius:16,overflow:'hidden',boxShadow:SH}}>
   <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
    <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 20px',borderBottom:'1px solid '+LINE}}><Avatar name="Văn phòng Hiền Xa" size={44}/><div style={{flex:1,lineHeight:1.25}}><div style={T(16.5,800)}>Văn phòng Hiền Xa</div><div style={{...T(13.5,600,GREEN),display:'flex',alignItems:'center',gap:5}}><i style={{width:8,height:8,borderRadius:'50%',background:GREEN}}/>Đang trực · 7:30–17:30</div></div>{PB('q','Gọi',PhoneIcon,{height:40})}</div>
    <div style={{flex:1,background:BG,padding:'18px 24px',display:'flex',flexDirection:'column',gap:12,overflow:'hidden'}}>
     <Bub t="Chào anh Long, đơn SO-0231 đã lên xe, dự kiến tới công trình khoảng 14:30 ạ." time="Văn phòng · 09:12"/><Bub me t="Ok em. Nhớ gọi trước 15 phút giúp anh, cổng công trình hẹp." time="09:15"/><Bub t="Dạ vâng, tài xế sẽ gọi anh trước khi tới. Anh cần thêm gì không ạ?" time="Văn phòng · 09:16"/><Bub me t="Chiều anh đặt thêm 150 cây thép phi 10 nhé." time="09:18"/><Bub t="Dạ em đã nhận đơn SO-0233, văn phòng sẽ duyệt và báo ngày giao." time="Văn phòng · 09:20"/></div>
    <div style={{padding:'12px 20px',borderTop:'1px solid '+LINE,display:'flex',gap:10,alignItems:'center'}}><div style={{flex:1,height:48,borderRadius:24,background:BG,border:'1px solid '+LINE,padding:'0 20px',display:'flex',alignItems:'center',fontSize:16,color:'#8793A5'}}>Nhập tin nhắn…</div><div style={{height:48,padding:'0 24px',borderRadius:24,background:BLUE,color:'#fff',display:'flex',alignItems:'center',gap:6,fontSize:16,fontWeight:700}}>Gửi{ic(PaperAirplaneIcon,18)}</div></div></div>
   <div style={{width:320,borderLeft:'1px solid '+LINE,display:'flex',flexDirection:'column'}}>
    <div style={{padding:'16px 20px',fontSize:18,fontWeight:800}}>Tin nhắn</div>
    {[['Văn phòng Hiền Xa','Dạ em đã nhận đơn SO-0233…','09:20',2,1],['Kế toán Hiền Xa','Công nợ tháng 11 đã gửi','Hôm qua',0]].map(([n,m,t,u,on])=><div key={n} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 20px',background:on?'#EEF5FD':'transparent'}}><Avatar name={n} size={44}/><div style={{flex:1,minWidth:0}}><div style={T(15,700)}>{n}</div><div style={T(13.5,500,MUTE,{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'})}>{m}</div></div><div style={{textAlign:'right'}}><div style={T(13,600,MUTE)}>{t}</div>{u>0&&<i style={{display:'inline-grid',placeItems:'center',minWidth:20,height:20,borderRadius:10,background:BLUE,color:'#fff',fontSize:12,fontWeight:700,fontStyle:'normal',marginTop:3}}>{u}</i>}</div></div>)}
    <div style={{flex:1}}/><div style={{padding:16,borderTop:'1px solid '+LINE}}><Field label="Tìm người" ph="Tìm người…" Icon={MagnifyingGlassIcon}/></div></div></div>
 </PCFrame>);

/* ---- auth-pc ---- */
const AuthPC=({children,w=480,h=860})=><div style={{width:1280,height:h,position:'relative',overflow:'hidden',background:BG}}>
 <div style={{height:300,background:'linear-gradient(160deg,#1478DC 0%,#0B63C6 45%,#0A4FA0 100%)',position:'relative'}}><div style={{position:'absolute',inset:0,backgroundImage:brickBg}}/><div style={{position:'absolute',right:-80,top:-100,width:420,height:420,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,255,255,.16),rgba(255,255,255,0) 68%)'}}/>
  <div style={{position:'relative',padding:'28px 48px',display:'flex',alignItems:'center',gap:14}}><Mark s={46} tone="white"/><div><div style={T(21,800,'#fff')}>Hiền Xa</div><div style={T(14.5,500,'rgba(255,255,255,.88)')}>Vật liệu xây dựng · Cổng khách hàng</div></div></div></div>
 <div style={{position:'absolute',left:'50%',top:150,width:w,marginLeft:-w/2,background:'#fff',borderRadius:22,border:'1px solid '+LINE,boxShadow:'0 2px 4px rgba(16,34,58,.04),0 30px 60px -24px rgba(16,34,58,.35)',padding:'28px 32px 26px'}}>{children}</div></div>;
defw('customer-login-pc','/customer/login (máy tính)','Login Card','Một thẻ trắng 480px giữa màn hình trên dải xanh (D30), logo công ty (D49), tab Vận hành / Thợ & tài xế / Khách hàng.',()=>
 <AuthPC h={820}>
  <h1 style={{margin:0,fontSize:26,fontWeight:800,letterSpacing:'-.02em'}}>Đăng nhập</h1>
  <div style={{display:'flex',gap:4,padding:4,background:'#EDF1F6',borderRadius:13,margin:'16px 0 10px'}}><Tab Icon={BuildingOffice2Icon} t="Vận hành"/><Tab Icon={TruckIcon} t="Thợ & tài xế"/><Tab Icon={UserGroupIcon} t="Khách hàng" on/></div>
  <div style={T(14.5,500,MUTE,{marginBottom:16})}>Dành cho khách đặt hàng, theo dõi giao hàng và công nợ.</div>
  <div style={{display:'flex',flexDirection:'column',gap:14}}><Field label="Email hoặc số điện thoại" value="0912 345 678" Icon={UserCircleIcon} mono/><Field label="Mật khẩu" value="••••••••••" Icon={LockClosedIcon} right={Eye}/></div>
  <Btn k="p" style={{marginTop:20}}>Đăng nhập</Btn><div style={{textAlign:'center',marginTop:14,fontSize:15,fontWeight:700,color:'#0B5CB8'}}>Quên mật khẩu?</div>
  <div style={{height:1,background:LINE,margin:'18px -32px 16px'}}/><div style={{textAlign:'center',fontSize:15,color:MUTE}}>Chưa có tài khoản? <b style={{color:'#0B5CB8'}}>Đăng ký tài khoản</b></div>
  <div style={T(13.5,500,MUTE,{textAlign:'center',marginTop:12})}>Máy này nhớ cổng bạn dùng lần trước · Quên tài khoản: hỏi quản lý cửa hàng</div>
 </AuthPC>);
defw('customer-register-pc','/customer/register (máy tính)','Login Card + Form','Số điện thoại trùng khách có sẵn: trạng thái chờ màu cam (không đỏ), nút "Gửi yêu cầu chờ duyệt" (D78).',()=>
 <AuthPC w={560} h={900}>
  <h1 style={{margin:0,fontSize:26,fontWeight:800,letterSpacing:'-.02em'}}>Đăng ký tài khoản</h1><div style={T(14.5,500,MUTE,{margin:'4px 0 14px'})}>Đặt hàng và theo dõi công nợ ngay trên điện thoại hoặc máy tính.</div>
  <div style={{display:'flex',gap:10,alignItems:'flex-start',background:'#FFF6E3',border:'1px solid #F3D9A4',borderRadius:12,padding:'12px 14px',marginBottom:16}}><span style={{color:'#B26500'}}>{ic(ClockIcon,22)}</span><div style={{fontSize:14.5,lineHeight:1.5,color:'#6B3F00'}}><b style={{display:'block',fontSize:15,color:'#5A3300'}}>Số này cửa hàng đã có</b>Bấm "Gửi yêu cầu chờ duyệt", văn phòng sẽ kiểm tra rồi gọi lại cho anh/chị.</div></div>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}><Field label="Họ tên hoặc tên cửa hàng" value="Nguyễn Văn Long"/><Field label="Số điện thoại" value="0912 345 678" warn mono Icon={PhoneIcon}/><Field style={{gridColumn:'1 / 3'}} label="Địa chỉ giao hàng" value="Km 12 Quốc lộ 6, Hà Đông, Hà Nội"/><Field style={{gridColumn:'1 / 3'}} label="Email" value="long.baolong@example.vn"/><Field label="Mật khẩu" value="••••••••••" right={Eye}/><Field label="Nhập lại mật khẩu" value="••••••••••" right={Eye}/></div>
  <Btn k="p" style={{marginTop:20}}>Gửi yêu cầu chờ duyệt</Btn><div style={{textAlign:'center',marginTop:14,fontSize:14.5,color:MUTE}}>Đã có tài khoản? <b style={{color:'#0B5CB8'}}>Đăng nhập</b> · Không có email? Gọi cửa hàng để được tạo tài khoản bằng số điện thoại.</div>
 </AuthPC>);

/* =====================================================================
   GIAO DIỆN trong Hồ sơ: hai nhóm độc lập — Chế độ màu (Sáng/Tối/Tự động) và Giao diện (Classic/Mới = THEME), kèm cỡ chữ.
   Lưu theo thiết bị, chọn xong áp ngay (không có nút Lưu).
   ===================================================================== */
const bx=(w,h,bg,r=0,x={})=>({width:w,height:h,background:bg,borderRadius:r,flex:'none',...x});
const MiniPhone=({v,dark})=>{const C=v==='new'
  ?{bg:dark?'#0E1626':'linear-gradient(180deg,#E8F0FC,#F7F9FD)',card:dark?'#18233A':'#fff',ink:dark?'#E8EEF8':'#10223A',mu:dark?'#6F829F':'#B9C6D8'}
  :{bg:dark?'#0F1724':'#F2F5F9',card:dark?'#17212F':'#fff',ink:dark?'#E8EEF8':'#10223A',mu:dark?'#6F829F':'#C9D3E0'};
 const nw=v==='new';
 return <div style={{width:156,height:262,borderRadius:nw?22:12,border:'1px solid '+(dark?'#2A3750':'#D5DDE8'),background:C.bg,position:'relative',overflow:'hidden',boxShadow:nw?'0 14px 26px -12px rgba(16,34,58,.35)':'none',flex:'none'}}>
  {nw?<div style={{padding:'14px 12px 0'}}><div style={{...bx(54,6,C.ink,3)}}/><div style={{...bx(88,5,C.mu,3,{marginTop:6})}}/></div>
     :<div style={{height:26,background:dark?'#17212F':'#fff',borderBottom:'1px solid '+(dark?'#2A3750':'#E3E9F1'),display:'flex',alignItems:'center',gap:6,padding:'0 8px'}}><div style={bx(12,12,'#0B63C6',3)}/><div style={bx(40,5,C.ink,3)}/></div>}
  <div style={{padding:nw?'10px 12px':'8px'}}>
   {nw?<div style={{height:74,borderRadius:18,background:'linear-gradient(145deg,#1B78DE,#0A3E8C)',padding:10,boxShadow:'0 10px 18px -8px rgba(11,99,198,.7)'}}><div style={bx(34,8,'rgba(255,255,255,.3)',99)}/><div style={bx(60,12,'#fff',4,{marginTop:8})}/><div style={bx(100,4,'rgba(255,255,255,.35)',3,{marginTop:8})}/></div>
      :<div style={{height:66,borderRadius:6,background:C.card,border:'1px solid '+(dark?'#2A3750':'#E3E9F1'),padding:8}}><div style={bx(40,5,C.mu,2)}/><div style={bx(70,9,C.ink,2,{marginTop:7})}/><div style={bx(124,24,'#0B63C6',4,{marginTop:8,height:14})}/></div>}
   {[0,1,2].map(i=>nw?<div key={i} style={{height:34,borderRadius:14,background:C.card,marginTop:8,display:'flex',alignItems:'center',gap:8,padding:'0 10px',boxShadow:'0 6px 12px -8px rgba(16,34,58,.4)'}}><div style={bx(16,16,i===1?'#E8F2FF':'#EAF6EF',8)}/><div style={{flex:1}}><div style={bx(52,4,C.ink,2)}/><div style={bx(34,3,C.mu,2,{marginTop:4})}/></div><div style={bx(24,9,i===0?'#FFE9BF':'#D9ECFF',99)}/></div>
      :<div key={i} style={{height:30,borderRadius:4,background:C.card,border:'1px solid '+(dark?'#2A3750':'#E3E9F1'),marginTop:6,display:'flex',alignItems:'center',gap:6,padding:'0 8px'}}><div style={{flex:1}}><div style={bx(50,4,C.ink,2)}/><div style={bx(32,3,C.mu,2,{marginTop:4})}/></div><div style={bx(22,8,i===0?'#FFE9BF':'#D9ECFF',3)}/></div>)}</div>
  {nw?<div style={{position:'absolute',left:14,right:14,bottom:10,height:32,borderRadius:99,background:dark?'#2A3F66':'#10223A',display:'flex',alignItems:'center',justifyContent:'space-around',padding:'0 8px',boxShadow:'0 10px 18px -6px rgba(16,34,58,.6)'}}>{[0,1,2,3].map(i=><div key={i} style={i===0?bx(34,20,'#0B63C6',99):bx(12,12,'rgba(255,255,255,.45)',4)}/>)}</div>
   :<div style={{position:'absolute',left:0,right:0,bottom:0,height:28,background:dark?'#17212F':'#fff',borderTop:'3px solid '+(dark?'#17212F':'#fff'),display:'flex',justifyContent:'space-around',alignItems:'center'}}><div style={{position:'absolute',top:-3,left:6,width:30,height:3,background:'#0B63C6'}}/>{[0,1,2,3].map(i=><div key={i} style={bx(12,12,i===0?'#0B63C6':C.mu,3)}/>)}</div>}</div>};
const OptCard=({on,children,style})=><div style={{borderRadius:16,border:on?'2px solid '+BLUE:'1.5px solid '+LINE,background:on?'#F4F9FF':'#fff',boxShadow:on?'0 0 0 4px rgba(11,99,198,.10)':SH,position:'relative',...style}}>{on&&<span style={{position:'absolute',top:10,right:10,width:24,height:24,borderRadius:'50%',background:BLUE,color:'#fff',display:'grid',placeItems:'center'}}>{ic(CheckIcon,15)}</span>}{children}</div>;
const ModeCard=({Icon,t,on,s,pc})=><OptCard on={on} style={{flex:1,padding:pc?'16px 18px':'14px 8px',minHeight:pc?0:96,display:'flex',flexDirection:pc?'row':'column',alignItems:'center',justifyContent:pc?'flex-start':'center',gap:pc?14:8,textAlign:pc?'left':'center'}}>
 <div style={{width:44,height:44,borderRadius:13,background:on?BLUE:'#EDF1F6',color:on?'#fff':MUTE,display:'grid',placeItems:'center'}}>{ic(Icon,24)}</div><div><div style={T(16,800,INK)}>{t}</div>{s&&<div style={T(13.5,500,MUTE,{marginTop:1})}>{s}</div>}</div></OptCard>;
const ThemeCard=({v,on,title,desc,tag,pc})=><OptCard on={on} style={{flex:1,minWidth:0,padding:pc?20:10,display:'flex',flexDirection:pc?'row':'column',gap:pc?20:10,alignItems:pc?'center':'stretch'}}>
 <div style={{display:'grid',placeItems:'center',padding:pc?0:'4px 0',background:v==='new'?'linear-gradient(160deg,#DCE8FA,#EEF3FB)':'#E8EDF4',borderRadius:14,flex:'none',...(pc?{padding:16}:{})}}><div style={{zoom:pc?1:.82}}><MiniPhone v={v}/></div></div>
 <div style={{minWidth:0}}><div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><b style={T(17,800)}>{title}</b>{tag&&<Chip k="g" dot={false}>{tag}</Chip>}</div><div style={T(14,500,MUTE,{marginTop:4,lineHeight:1.5})}>{desc}</div></div></OptCard>;
const SizeRow=()=><div style={{display:'flex',flexDirection:'column',gap:10}}><Seg3 items={['Nhỏ','Vừa','Lớn']} on="Vừa" sizes={[14,16,19]}/><div style={{background:BG,borderRadius:12,padding:'12px 14px',fontSize:16,lineHeight:1.5,color:INK}}>Xe tới khoảng <b style={num}>14:30</b>. Đơn SO-0231 đang giao tới CT Nhà xưởng Hà Đông.</div></div>;
const ThemeBody=()=><>
 <PageHead back="Tôi" title="Giao diện" sub="Lưu trên thiết bị này. Chọn xong áp dụng ngay."/>
 <div><Sec>Chế độ màu</Sec><div style={{display:'flex',gap:10,marginTop:10}}><ModeCard Icon={SunIcon} t="Sáng"/><ModeCard Icon={MoonIcon} t="Tối"/><ModeCard Icon={ComputerDesktopIcon} t="Tự động" on/></div><div style={T(13.5,500,MUTE,{marginTop:8})}>Tự động: theo cài đặt của điện thoại.</div></div>
 <div><Sec>Giao diện</Sec><div style={{display:'flex',gap:10,marginTop:10}}>
  <ThemeCard v="classic" on title="Classic" tag="Mặc định" desc="Giao diện hiện tại: thẻ phẳng viền mảnh, menu dưới có vạch xanh."/>
  <ThemeCard v="new" title="Mới" desc="Thẻ bo tròn có chiều sâu, menu dưới dạng thanh nổi."/></div></div>
 <div><Sec>Cỡ chữ</Sec><div style={{marginTop:10}}><Card pad={14}><SizeRow/></Card></div></div></>;
def('customer-profile-theme','/customer/profile → Giao diện','Settings Panels','Hai nhóm lựa chọn độc lập: Chế độ màu (Sáng/Tối/Tự động) và Giao diện (Classic mặc định / Mới, hai thẻ xem trước khác nhau rõ), cỡ chữ; lưu theo thiết bị, áp ngay.',()=>
 <CP active="me"><ThemeBody/></CP>,390);
const MiniWin=({v})=>{const nw=v==='new';return <div style={{width:300,height:190,borderRadius:nw?16:8,border:'1px solid #D5DDE8',overflow:'hidden',background:nw?'linear-gradient(180deg,#E8F0FC,#F7F9FD)':'#F2F5F9',position:'relative',boxShadow:nw?'0 16px 28px -14px rgba(16,34,58,.4)':'none',flex:'none'}}>
 {nw?<><div style={{position:'absolute',left:8,top:8,bottom:8,width:48,borderRadius:12,background:'#10223A',display:'flex',flexDirection:'column',alignItems:'center',gap:8,paddingTop:10}}><div style={bx(20,20,'#0B63C6',7)}/>{[0,1,2,3].map(i=><div key={i} style={i===0?bx(32,14,'#0B63C6',7):bx(14,14,'rgba(255,255,255,.4)',4)}/>)}</div>
   <div style={{position:'absolute',left:68,top:12,right:12}}><div style={bx(80,8,'#10223A',3)}/><div style={{display:'flex',gap:8,marginTop:10}}><div style={{flex:1,height:60,borderRadius:16,background:'linear-gradient(145deg,#1B78DE,#0A3E8C)',boxShadow:'0 10px 16px -8px rgba(11,99,198,.7)'}}/><div style={{width:70,height:60,borderRadius:16,background:'#fff',boxShadow:'0 6px 12px -8px rgba(16,34,58,.4)'}}/></div>{[0,1,2].map(i=><div key={i} style={{height:20,borderRadius:10,background:'#fff',marginTop:7,boxShadow:'0 4px 8px -6px rgba(16,34,58,.4)'}}/>)}</div></>
 :<><div style={{height:20,background:'#fff',borderBottom:'1px solid #E3E9F1',display:'flex',alignItems:'center',gap:6,padding:'0 8px'}}><div style={bx(10,10,'#0B63C6',3)}/><div style={bx(40,4,'#10223A',2)}/></div><div style={{height:18,background:'#0B63C6',display:'flex',alignItems:'flex-end',gap:3,padding:'0 8px'}}>{[0,1,2,3].map(i=><div key={i} style={{width:34,height:i===0?14:8,background:i===0?'#F2F5F9':'rgba(255,255,255,.35)',borderRadius:'4px 4px 0 0'}}/>)}</div>
   <div style={{padding:10,display:'flex',gap:8}}><div style={{flex:1}}><div style={{height:50,borderRadius:4,background:'#fff',border:'1px solid #E3E9F1',padding:6}}><div style={bx(50,4,'#C9D3E0',2)}/><div style={bx(80,8,'#10223A',2,{marginTop:6})}/></div>{[0,1,2].map(i=><div key={i} style={{height:16,borderRadius:3,background:'#fff',border:'1px solid #E3E9F1',marginTop:5}}/>)}</div><div style={{width:80,height:70,borderRadius:4,background:'#fff',border:'1px solid #E3E9F1'}}/></div></>}</div>};
defw('customer-profile-theme-pc','/customer/profile → Giao diện (máy tính)','Settings Panels','Bản máy tính: Chế độ màu 3 thẻ ngang, Giao diện Classic / Mới (xem trước cửa sổ máy tính khác nhau rõ), cỡ chữ; áp ngay, lưu theo thiết bị.',()=>
 <PCFrame active="me" minH={900}>
  <PHead back="Hồ sơ của tôi" title="Giao diện" sub="Lưu trên thiết bị này. Chọn xong áp dụng ngay, không cần bấm Lưu."/>
  <Cols rw={380} l={<>
   <Pn title="Chế độ màu"><div style={{display:'flex',gap:14}}><ModeCard pc Icon={SunIcon} t="Sáng" s="Nền sáng"/><ModeCard pc Icon={MoonIcon} t="Tối" s="Nền tối, đỡ chói"/><ModeCard pc on Icon={ComputerDesktopIcon} t="Tự động" s="Theo thiết bị"/></div></Pn>
   <Pn title="Giao diện"><div style={{display:'flex',gap:16}}>
    {[['classic','Classic','Mặc định','Giao diện hiện tại: thẻ phẳng viền mảnh, thanh trên trắng và menu xanh ngang.',1],['new','Mới','','Thẻ bo tròn có chiều sâu, menu bên trái màu tối, màu nhấn xanh đậm hơn.',0]].map(([v,t,tag,d,on])=><OptCard key={v} on={!!on} style={{flex:1,padding:16,display:'flex',flexDirection:'column',gap:14}}><div style={{display:'grid',placeItems:'center',padding:'18px 0',borderRadius:14,background:v==='new'?'linear-gradient(160deg,#DCE8FA,#EEF3FB)':'#E8EDF4'}}><MiniWin v={v}/></div><div><div style={{display:'flex',alignItems:'center',gap:8}}><b style={T(18,800)}>{t}</b>{tag&&<Chip k="g" dot={false}>{tag}</Chip>}</div><div style={T(14.5,500,MUTE,{marginTop:4,lineHeight:1.5})}>{d}</div></div></OptCard>)}</div></Pn></>}
   r={<>
   <Pn title="Cỡ chữ"><SizeRow/></Pn>
   <Card pad={16} style={{borderRadius:14,background:'#E6F0FB',borderColor:'#BBD6F4',display:'flex',gap:10,fontSize:14.5,lineHeight:1.55,color:'#0A3D7A'}}>{ic(InformationCircleIcon,22,BLUE)}<span>Chế độ màu và Giao diện là hai lựa chọn riêng: có thể dùng Giao diện Mới ở chế độ Tối. Nghiệp vụ, số liệu và quyền không đổi.</span></Card></>}/>
 </PCFrame>);

/* =====================================================================
   POPUP chức năng của cổng Khách (mỗi popup một màn: điện thoại = tờ trượt từ đáy, máy tính = hộp thoại giữa màn hình).
   Một nút chính mỗi popup (cao 52–56px), nút nguy hiểm tách riêng.
   ===================================================================== */
const Skel=()=><>{[0,1,2].map(i=><Card key={i} pad={16}><div style={bx(120,10,'#E3E9F1',4)}/><div style={bx('70%',14,'#EDF1F6',4,{marginTop:12})}/><div style={bx('50%',10,'#EDF1F6',4,{marginTop:10})}/></Card>)}</>;
const Foot=({p,s,d,pc})=>pc
 ?<div style={{display:'flex',alignItems:'center',gap:12,marginTop:20}}>{d&&<Btn k={d.k||'oe'} h={52} Icon={d.I} style={{padding:'0 22px',fontSize:15.5}}>{d.t}</Btn>}<span style={{flex:1}}/>{s&&<Btn k="o" h={52} style={{padding:'0 24px',fontSize:15.5}}>{s}</Btn>}{p&&<Btn k={p.k||'p'} h={52} Icon={p.I} style={{padding:'0 28px',fontSize:15.5}}>{p.t}</Btn>}</div>
 :<div style={{display:'flex',flexDirection:'column',gap:10,marginTop:16}}>{p&&<Btn k={p.k||'p'} h={54} Icon={p.I}>{p.t}</Btn>}{s&&<Btn k="o" h={52}>{s}</Btn>}{d&&<><div style={{height:1,background:LINE,margin:'8px 0 4px'}}/><Btn k={d.k||'oe'} h={52} Icon={d.I}>{d.t}</Btn></>}</div>;
const PopPhone=({title,icon,children,foot})=><CP active="home" fixed><PageHead title="Trang chủ"/><Skel/>
 <Dim><div style={{width:'100%',maxHeight:800,background:'#fff',borderRadius:'24px 24px 0 0',display:'flex',flexDirection:'column',boxShadow:'0 -20px 50px rgba(0,0,0,.25)'}}>
  <div style={{display:'grid',placeItems:'center',paddingTop:10}}><i style={{width:44,height:5,borderRadius:3,background:'#D5DDE8'}}/></div>
  <div style={{padding:'8px 18px 10px',display:'flex',alignItems:'center',gap:12}}>{icon}<h2 style={{margin:0,flex:1,fontSize:21,fontWeight:800,letterSpacing:'-.02em',lineHeight:1.25}}>{title}</h2><div style={{width:44,height:44,borderRadius:12,background:'#EDF1F6',display:'grid',placeItems:'center'}}>{ic(XMarkIcon,22)}</div></div>
  <div style={{padding:'0 18px 20px',overflow:'hidden'}}>{children}{foot}</div></div></Dim></CP>;
const PopPC=({title,icon,w=560,children,foot,close=true})=><PCFrame active="home" minH={820}><PHead title="Trang chủ"/><div style={{display:'flex',gap:20}}><div style={{flex:1}}><Skel/></div><div style={{width:360}}><Skel/></div></div>
 <Overlay><div style={{width:w,background:'#fff',borderRadius:20,boxShadow:'0 30px 80px rgba(0,0,0,.35)',overflow:'hidden'}}>
  <div style={{display:'flex',alignItems:'center',gap:12,padding:'18px 24px',borderBottom:'1px solid '+LINE}}>{icon}<b style={{flex:1,fontSize:20,fontWeight:800,letterSpacing:'-.01em'}}>{title}</b>{close&&<div style={{height:40,padding:'0 14px',borderRadius:10,background:'#EDF1F6',display:'flex',alignItems:'center',gap:6,fontSize:14.5,fontWeight:700}}>{ic(XMarkIcon,18)}Đóng</div>}</div>
  <div style={{padding:'20px 24px 24px'}}>{children}{foot}</div></div></Overlay></PCFrame>;
const Ico=(I,bg,c)=><div style={{width:44,height:44,borderRadius:13,background:bg,color:c,display:'grid',placeItems:'center',flex:'none'}}>{ic(I,24)}</div>;
const Note=({k='i',children,I})=>{const m={i:['#E6F0FB','#0A3D7A',BLUE],w:['#FFF6E3','#6B3F00','#B26500'],e:['#FDEFED','#6E241D',RED]}[k];return <div style={{display:'flex',gap:10,background:m[0],color:m[1],borderRadius:12,padding:'11px 13px',fontSize:14.5,lineHeight:1.5}}><span style={{marginTop:1}}>{ic(I||InformationCircleIcon,20,m[2])}</span><span>{children}</span></div>};
const KVl=({rows})=><div style={{border:'1px solid '+LINE,borderRadius:14,overflow:'hidden'}}>{rows.map(([a,b,x],i)=><div key={a} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:10,padding:'12px 14px',borderTop:i?'1px solid '+LINE:0,background:x==='tot'?'#F8FAFC':'#fff'}}><span style={T(14.5,x==='tot'?700:500,MUTE)}>{a}</span><b style={T(x==='tot'?19:15.5,800,x==='red'?RED:INK,num)}>{b}</b></div>)}</div>;
const both=(id,route,tpl,note,make)=>{def(id,route,tpl,note,()=>make(false),390);defw(id+'-pc',route+' (máy tính)',tpl,note,()=>make(true))};
const POP=(pc,o)=>pc?<PopPC {...o}/>:<PopPhone {...o}/>;

/* 1. D83 cập nhật giá */
both('customer-popup-update','Popup thông báo cập nhật (D83), mở một lần ở Trang chủ','Dialog','Giá đổi từng mặt hàng giá cũ → mới, "Tăng/Giảm" bằng chữ, ngày áp dụng; tin từ cửa hàng; đếm 1/3; chỉ có "Đã hiểu" (không nút mở bảng giá). Chỉ Chủ tài khoản và Kế toán thấy giá; không hiện tên nhóm giá.',pc=>POP(pc,{title:'Giá bán có thay đổi',icon:Ico(SparklesIcon,'#E6F0FB',BLUE),w:620,
 children:<><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}><span style={{...T(13.5,700,'#0A4A96'),background:'#E6F0FB',padding:'3px 10px',borderRadius:8}}>Tin từ cửa hàng · áp dụng từ 20/11/2026</span><span style={T(14,800,MUTE,num)}>1/3</span></div>
  <div style={{border:'1px solid '+LINE,borderRadius:14,overflow:'hidden'}}>{[['Xi măng PC40 Hoàng Thạch','bao','89.000 ₫','91.000 ₫','Tăng'],['Cát xây','m³','280.000 ₫','275.000 ₫','Giảm'],['Gạch ống 4 lỗ','viên','1.800 ₫','1.850 ₫','Tăng']].map(([n,u,a,b,d],i)=><div key={n} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderTop:i?'1px solid '+LINE:0}}><div style={{flex:1,minWidth:0}}><div style={T(15,700)}>{n}</div><div style={T(13.5,500,MUTE,num)}>Giá / {u}: <s>{a}</s> → <b style={{color:INK}}>{b}</b></div></div><Chip k={d==='Tăng'?'w':'s'}>{d}</Chip></div>)}</div>
  <div style={T(13.5,500,MUTE,{marginTop:10,lineHeight:1.5})}>Giá mới đã có sẵn trong màn Đặt hàng. Anh/chị chỉ cần đọc, không phải thao tác thêm.</div>
  <div style={{display:'flex',justifyContent:'center',gap:6,marginTop:12}}>{[1,0,0].map((o,i)=><i key={i} style={{width:o?22:8,height:8,borderRadius:4,background:o?BLUE:'#D5DDE8'}}/>)}</div></>,
 foot:<Foot pc={pc} p={{t:'Đã hiểu'}}/>}));

/* 2. Bật thông báo đẩy */
both('customer-popup-push','Popup Bật thông báo trên máy này','Dialog','Xin bật thông báo đẩy: báo đơn được duyệt, xe sắp tới, giá đổi. iPhone cần thêm vào Màn hình chính trước.',pc=>POP(pc,{title:'Bật thông báo trên máy này',icon:Ico(BellAlertIcon,'#E6F0FB',BLUE),w:540,
 children:<><div style={T(15.5,500,INK,{lineHeight:1.6,marginBottom:12})}>Anh/chị sẽ được báo ngay trên điện thoại khi:</div>
  {[[CheckBadgeIcon,'Đơn được cửa hàng duyệt'],[TruckIcon,'Xe sắp tới công trình'],[SparklesIcon,'Giá bán thay đổi'],[BanknotesIcon,'Đã nhận tiền thanh toán']].map(([I,t])=><div key={t} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 0',fontSize:15.5,fontWeight:600}}><span style={{width:34,height:34,borderRadius:10,background:'#EDF3FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(I,19)}</span>{t}</div>)}
  <div style={{marginTop:10}}><Note>iPhone: cần thêm Hiền Xa vào Màn hình chính trước khi bật.</Note></div></>,
 foot:<Foot pc={pc} p={{t:'Bật thông báo',I:BellAlertIcon}} s="Để sau"/>}));

/* 3. vượt hạn mức */
both('customer-popup-credit-limit','Popup khi đặt hàng: công nợ vượt hạn mức','Dialog','Đơn làm công nợ vượt hạn mức: báo bằng lời dễ hiểu, không lộ chính sách nội bộ; đơn vẫn là Chờ duyệt để cửa hàng xem xét.',pc=>POP(pc,{title:'Đơn này cần cửa hàng xem xét',icon:Ico(ExclamationTriangleIcon,'#FFF1D6','#B26500'),w:560,
 children:<><div style={T(15,500,INK,{lineHeight:1.6,marginBottom:12})}>Công nợ sau đơn này sẽ vượt mức cửa hàng cho phép. Đơn vẫn được gửi và ở trạng thái <b>Chờ duyệt</b>; cửa hàng sẽ xem xét rồi báo lại.</div>
  <KVl rows={[['Công nợ hiện tại','58.900.000 ₫'],['Đơn này (tạm tính)','45.600.000 ₫'],['Công nợ sau đơn','104.500.000 ₫','tot']]}/>
  <div style={{marginTop:12}}><Note k="w" I={ClockIcon}>Muốn đơn được duyệt nhanh, anh/chị có thể thanh toán bớt công nợ trước.</Note></div></>,
 foot:<Foot pc={pc} p={{k:'g',t:'Vẫn gửi đơn',I:PaperAirplaneIcon}} s="Sửa đơn"/>}));

/* 4. Đặt lại đơn */
both('customer-popup-reorder','Popup Đặt lại đơn này','Dialog','Đặt lại từ đơn cũ: lấy lại công trình và hàng, giá theo bảng giá hôm nay (có thể khác lần trước); đưa vào màn Đặt hàng để xem lại rồi mới gửi.',pc=>POP(pc,{title:'Đặt lại đơn SO-0224',icon:Ico(ArrowPathIcon,'#E6F0FB',BLUE),w:580,
 children:<><div style={{display:'flex',alignItems:'center',gap:10,background:BG,borderRadius:12,padding:'10px 12px',marginBottom:12}}>{ic(MapPinIcon,20,BLUE)}<div><div style={T(13,600,MUTE)}>Giao tới</div><div style={T(15,700)}>CT Văn phòng Cầu Giấy</div></div></div>
  <div style={{border:'1px solid '+LINE,borderRadius:14,overflow:'hidden'}}>{[['Xi măng PC40 Hoàng Thạch','80 bao'],['Đá 1×2','6 m³']].map(([a,b],i)=><div key={a} style={{display:'flex',justifyContent:'space-between',padding:'12px 14px',borderTop:i?'1px solid '+LINE:0}}><span style={T(15,600)}>{a}</span><b style={T(15,800,INK,num)}>{b}</b></div>)}</div>
  <div style={{marginTop:12}}><Note>Giá theo bảng giá hôm nay, có thể khác lần đặt trước. Anh/chị xem lại và sửa số lượng trước khi gửi.</Note></div></>,
 foot:<Foot pc={pc} p={{t:'Đưa vào đơn mới',I:ArrowPathIcon}} s="Không đặt lại"/>}));

/* 5. Hủy đơn (D95) */
both('customer-popup-cancel-order','Popup Hủy đơn (chỉ khi hàng chưa lên xe, D94/D95)','Dialog (nguy hiểm)','Đơn SO-0233 còn Chờ duyệt nên hủy được. Ô lý do; "Hủy đơn" đỏ tách riêng; "Giữ đơn" là lối an toàn.',pc=>POP(pc,{title:'Hủy đơn SO-0233?',icon:Ico(ShieldExclamationIcon,'#FDEBE9',RED),w:540,
 children:<><div style={T(15,500,INK,{lineHeight:1.6,marginBottom:12})}>Đơn 150 cây Thép phi 10 · 19.950.000 ₫ sẽ bị hủy. Hàng chưa lên xe nên anh/chị hủy được.</div><Field label="Lý do hủy" value="Đặt nhầm số lượng"/><div style={{marginTop:12}}><Note k="e" I={ExclamationTriangleIcon}>Hủy xong không khôi phục được; muốn lấy hàng, anh/chị cần đặt đơn mới.</Note></div></>,
 foot:<Foot pc={pc} p={{t:'Giữ đơn'}} d={{k:'d',t:'Hủy đơn'}}/>}));
both('customer-popup-cancel-blocked','Popup khi hủy đơn đã lên xe','Dialog','Đơn đã có phiếu giao chạy/đã lên xe: khách không tự hủy được, chỉ gọi cửa hàng (D94/D95).',pc=>POP(pc,{title:'Không thể hủy đơn SO-0231',icon:Ico(LockClosedIcon,'#EDF1F6',MUTE),w:520,
 children:<><div style={T(15,500,INK,{lineHeight:1.6})}>Hàng của đơn này đã lên xe nên không hủy trên ứng dụng được. Anh/chị vui lòng gọi cửa hàng để được hỗ trợ.</div></>,
 foot:<Foot pc={pc} p={{t:'Gọi cửa hàng',I:PhoneIcon}} s="Đóng"/>}));

/* 6. Hủy yêu cầu dịch vụ */
both('customer-popup-cancel-service','Popup Hủy yêu cầu dịch vụ','Dialog (nguy hiểm)','Chỉ yêu cầu còn "Chờ xác nhận lịch" mới hủy được; đã xếp lịch thì gọi cửa hàng.',pc=>POP(pc,{title:'Hủy yêu cầu YC-0019?',icon:Ico(ShieldExclamationIcon,'#FDEBE9',RED),w:520,
 children:<><div style={T(15,500,INK,{lineHeight:1.6,marginBottom:12})}>Yêu cầu <b>Cẩu hàng lên tầng cao</b> ngày 22/11/2026 đang Chờ xác nhận lịch.</div><Field label="Lý do (không bắt buộc)" ph="Ví dụ: đổi kế hoạch"/></>,
 foot:<Foot pc={pc} p={{t:'Giữ yêu cầu'}} d={{k:'d',t:'Hủy yêu cầu'}}/>}));

/* 7. Chọn công trình / thêm địa chỉ */
const SiteRow=({t,a,on})=><div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:14,border:'1.5px solid '+(on?BLUE:LINE),background:on?'#F1F7FE':'#fff',minHeight:60,boxSizing:'border-box'}}><div style={{width:40,height:40,borderRadius:11,background:on?BLUE:'#EDF1F6',color:on?'#fff':MUTE,display:'grid',placeItems:'center'}}>{ic(MapPinIcon,21)}</div><div style={{flex:1,minWidth:0}}><div style={T(15.5,700)}>{t}</div><div style={T(13.5,500,MUTE)}>{a}</div></div><span style={{width:22,height:22,borderRadius:'50%',border:on?'7px solid '+BLUE:'2px solid #C7D2DF',boxSizing:'border-box'}}/></div>;
both('customer-popup-site','Popup Chọn công trình / điểm giao','Dialog + radio list','Chọn công trình (kèm địa chỉ, người nhận) hoặc "+ Địa chỉ giao mới".',pc=>POP(pc,{title:'Chọn công trình / điểm giao',icon:Ico(MapPinIcon,'#E6F0FB',BLUE),w:560,
 children:<div style={{display:'flex',flexDirection:'column',gap:10}}><SiteRow on t="CT Nhà xưởng Hà Đông" a="Km 12 Quốc lộ 6 · Anh Long 0912 345 678"/><SiteRow t="CT Văn phòng Cầu Giấy" a="Số 18 Trần Thái Tông · Anh Đức 0903 111 222"/><div style={{height:52,borderRadius:14,border:'1.5px dashed #9DBFEA',color:'#0B5CB8',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:15.5,fontWeight:700}}>{ic(PlusIcon,20)}Địa chỉ giao mới</div></div>,
 foot:<Foot pc={pc} p={{t:'Chọn công trình này'}}/>}));
both('customer-popup-site-new','Popup Thêm địa chỉ giao mới','Dialog + Form','Tên công trình, địa chỉ, người nhận, số điện thoại; lưu xong chọn luôn cho đơn.',pc=>POP(pc,{title:'Thêm địa chỉ giao mới',icon:Ico(MapPinIcon,'#E6F0FB',BLUE),w:580,
 children:<div style={{display:'grid',gridTemplateColumns:pc?'1fr 1fr':'1fr',gap:14}}><Field style={pc?{gridColumn:'1 / 3'}:{}} label="Tên công trình" value="CT Nhà phố Thanh Xuân"/><Field style={pc?{gridColumn:'1 / 3'}:{}} label="Địa chỉ giao hàng" value="Số 42 ngõ 120 Nguyễn Trãi, Thanh Xuân"/><Field label="Người nhận" value="Trần Minh Đức"/><Field label="Số điện thoại" value="0903 111 222" mono Icon={PhoneIcon}/></div>,
 foot:<Foot pc={pc} p={{t:'Lưu địa chỉ'}} s="Hủy"/>}));

/* 8. Thêm người nhận hàng */
const RoleOpt=({t,d,on})=><div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:14,border:'1.5px solid '+(on?BLUE:LINE),background:on?'#F1F7FE':'#fff',minHeight:56,boxSizing:'border-box'}}><div style={{flex:1}}><div style={T(15.5,700)}>{t}</div><div style={T(13.5,500,MUTE,{marginTop:1,lineHeight:1.4})}>{d}</div></div><span style={{width:22,height:22,borderRadius:'50%',border:on?'7px solid '+BLUE:'2px solid #C7D2DF',boxSizing:'border-box',flex:'none'}}/></div>;
both('customer-popup-receiver','Popup Thêm người nhận hàng (vai)','Dialog + Form','Họ tên, số điện thoại, vai: Người nhận hàng (không thấy tiền) hoặc Người lo tiền (xem công nợ, thanh toán); công trình phụ trách.',pc=>POP(pc,{title:'Thêm người nhận hàng',icon:Ico(UsersIcon,'#E6F0FB',BLUE),w:600,
 children:<div style={{display:'flex',flexDirection:'column',gap:14}}><div style={{display:'grid',gridTemplateColumns:pc?'1fr 1fr':'1fr',gap:14}}><Field label="Họ tên" value="Lê Hồng Sơn"/><Field label="Số điện thoại" value="0988 765 432" mono Icon={PhoneIcon}/></div>
  <div><div style={T(13.5,600,MUTE,{marginBottom:6})}>Vai trò</div><div style={{display:'flex',flexDirection:'column',gap:8}}><RoleOpt on t="Người nhận hàng" d="Thấy đơn và giao hàng, không thấy giá và công nợ."/><RoleOpt t="Người lo tiền" d="Xem công nợ và thanh toán, không đặt hàng."/></div></div>
  <Field label="Phụ trách công trình" value="CT Văn phòng Cầu Giấy" Icon={MapPinIcon} right={ic(ChevronDownIcon,20,'#8793A5')}/></div>,
 foot:<Foot pc={pc} p={{t:'Thêm người nhận'}} s="Hủy"/>}));

/* 9. Đổi mật khẩu bắt buộc */
both('customer-popup-force-password','Popup Đổi mật khẩu bắt buộc lần đầu (mật khẩu tạm)','Dialog (không đóng được)','Đăng nhập bằng mật khẩu tạm: mọi trang dẫn tới đây cho tới khi đổi xong; không có nút đóng; có Đăng xuất.',pc=>POP(pc,{title:'Đặt mật khẩu của riêng anh/chị',icon:Ico(KeyIcon,'#FFF1D6','#B26500'),w:540,close:false,
 children:<><div style={T(14.5,500,MUTE,{marginBottom:14,lineHeight:1.55})}>Anh/chị đang dùng mật khẩu tạm do cửa hàng cấp. Cần đổi trước khi tiếp tục.</div><div style={{display:'flex',flexDirection:'column',gap:14}}><Field label="Mật khẩu mới" value="••••••••••" right={Eye}/><Field label="Nhập lại mật khẩu mới" value="••••••••••" right={Eye}/></div>
  <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:12}}>{['Từ 8 ký tự trở lên','Có cả chữ và số','Hai ô nhập giống nhau'].map(t=><div key={t} style={{display:'flex',alignItems:'center',gap:10,fontSize:14.5,fontWeight:600,color:'#3C4B63'}}><span style={{width:22,height:22,borderRadius:'50%',background:'#E6F0FB',color:BLUE,display:'grid',placeItems:'center'}}>{ic(CheckIcon,14)}</span>{t}</div>)}</div></>,
 foot:<Foot pc={pc} p={{t:'Đổi mật khẩu và tiếp tục'}} s="Đăng xuất"/>}));

/* 10. Đăng xuất */
both('customer-popup-logout','Popup Đăng xuất (xác nhận)','Dialog','Hỏi lại trước khi đăng xuất để khỏi bấm nhầm; "Ở lại" là lối an toàn.',pc=>POP(pc,{title:'Đăng xuất khỏi cổng khách?',icon:Ico(ArrowRightOnRectangleIcon,'#EDF1F6',INK),w:480,
 children:<div style={T(15,500,INK,{lineHeight:1.6})}>Anh/chị sẽ cần nhập lại số điện thoại hoặc email và mật khẩu để vào lại.</div>,
 foot:<Foot pc={pc} p={{t:'Ở lại'}} d={{t:'Đăng xuất',I:ArrowRightOnRectangleIcon}}/>}));

/* 11. Trả tiền mặt */
both('customer-popup-cash','Popup Trả tiền mặt tại cửa hàng (D45)','Dialog + Result','Sau khi chọn khoản: sinh mã YC, "Vui lòng mang số tiền và mã tới cửa hàng"; CHƯA ghi sổ cho tới khi kế toán xác nhận đã thu (D44/D45). Không có "báo chuyển khoản" (D8 đã tắt).',pc=>POP(pc,{title:'Trả tiền mặt tại cửa hàng',icon:Ico(BanknotesIcon,'#E6F0FB',BLUE),w:580,
 children:<><div style={{textAlign:'center',padding:'4px 0 14px'}}><div style={T(14.5,600,MUTE)}>Vui lòng mang</div><div style={T(34,800,INK,{...num,letterSpacing:'-.02em'})}>25.900.000 ₫</div><div style={T(15,600,INK,{marginTop:2})}>và mã <b style={{color:'#0B5CB8',...num}}>YC-0031</b> tới cửa hàng</div></div>
  <KVl rows={[['SO-0198 · quá hạn','12.300.000 ₫'],['SO-0212','13.600.000 ₫'],['Nội dung','TT KH0102 YC0031']]}/>
  <div style={{marginTop:12}}><Note k="w" I={ClockIcon}><b>Chờ kế toán xác nhận.</b> Công nợ chỉ giảm sau khi cửa hàng xác nhận đã thu tiền; trả thiếu thì phần lẻ vẫn là nợ.</Note></div></>,
 foot:<Foot pc={pc} p={{t:'Đã hiểu'}} s="Sao chép mã YC-0031"/>}));
