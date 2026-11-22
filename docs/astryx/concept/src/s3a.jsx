import React from 'react';
import {Shell} from './lib.jsx';
import {
 HomeIcon,BriefcaseIcon,BanknotesIcon,UserIcon,PhoneIcon,MapPinIcon,EnvelopeIcon,ArrowRightOnRectangleIcon,ClockIcon,CameraIcon,CheckIcon,
 TruckIcon,ChevronRightIcon,ChevronLeftIcon,KeyIcon,SunIcon,MoonIcon,EyeIcon,ExclamationTriangleIcon,PlusIcon,XMarkIcon,ArrowDownTrayIcon,
 PaperAirplaneIcon,InboxArrowDownIcon,MagnifyingGlassIcon,ComputerDesktopIcon,
 ArrowPathIcon,DevicePhoneMobileIcon,ArrowTurnUpRightIcon,LinkIcon,ShieldCheckIcon,LockClosedIcon,CheckCircleIcon,
 BuildingStorefrontIcon,UsersIcon,
} from '@heroicons/react/24/outline';
import {
 HomeIcon as HomeS,BriefcaseIcon as BriefS,BanknotesIcon as BankS,UserIcon as UserS,CheckIcon as CheckS,MapPinIcon as PinS,
} from '@heroicons/react/24/solid';

export const M=[]; const def=(id,route,tpl,note,C,w=1280)=>M.push({id,route,tpl,note,C,w});

/* ───────── Hệ màu cổng (biến --portal-*, bản sáng + bản tối D84) ───────── */
const CSS=`
.wp{--bg:#F2F5F9;--card:#fff;--card2:#F6F8FB;--bd:#E3E9F1;--bd2:#C7D2DF;--tx:#10223A;--sub:#5A6B82;--ac:#0B63C6;--act:#0B5CB8;--acbg:#E6F0FB;
 --ok:#12804A;--okt:#0D5A33;--okbg:#E5F4EC;--wn:#E8890C;--wnt:#7A4300;--wnbg:#FFF1D6;--er:#B4291F;--erbg:#FDEBE9;--top:#0B63C6;--ph:#8493A8;
 --sh:0 1px 2px rgba(16,34,58,.05),0 10px 22px -12px rgba(16,34,58,.16);
 font-family:"Be Vietnam Pro",system-ui,sans-serif;color:var(--tx);font-size:15px;line-height:1.35;-webkit-font-smoothing:antialiased}
.wp.dark .w-seg div{color:var(--sub)}
.wp.dark{--bg:#0A121F;--card:#121E31;--card2:#182640;--bd:#233450;--bd2:#34486A;--tx:#E9EFF8;--sub:#9DB0C9;--act:#7DB4F5;--acbg:#14284A;
 --okt:#6FD6A2;--okbg:#0F2E20;--wnt:#F5B95C;--wnbg:#3A2A0E;--er:#E5584C;--erbg:#3A1714;--top:#0D3F7E;--ph:#7487A3;
 --sh:0 1px 0 rgba(255,255,255,.035),0 12px 26px -14px rgba(0,0,0,.7)}
.wp *{box-sizing:border-box}
.wp h1,.wp h2,.wp h3,.wp p{margin:0}
.wp h1,.wp h2,.wp h3{color:var(--tx)}
.w-hero h2{color:#fff}
.w-top{height:58px;background:var(--top);display:flex;align-items:center;gap:6px;padding:0 12px 0 16px;color:#fff;flex:none;position:relative}
.w-top:after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:rgba(255,255,255,.14)}
.w-mark{width:32px;height:32px;border-radius:9px;background:#fff;color:#0B63C6;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;letter-spacing:-.3px;box-shadow:0 2px 6px rgba(0,0,0,.18);margin-right:4px;flex:none}
.wp.dark .w-mark{background:#E9EFF8}
.w-ttl{flex:1;min-width:0;font-weight:700;font-size:18.5px;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.w-ttl small{display:block;font-weight:500;font-size:12.5px;opacity:.9;letter-spacing:0;margin-top:-1px;overflow:hidden;text-overflow:ellipsis}
.w-ib{width:38px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;position:relative;color:#fff;flex:none}
.w-ib svg{width:23px;height:23px}
.w-dot{position:absolute;top:6px;right:4px;width:12px;height:12px;border-radius:50%;background:#35D07F;border:2px solid var(--top);box-shadow:0 0 0 3px rgba(53,208,127,.28)}
.w-dot.o{background:#F5A524;box-shadow:0 0 0 3px rgba(245,165,36,.3)}
.w-cnt{position:absolute;top:3px;right:0;min-width:18px;height:18px;border-radius:9px;background:#E8890C;color:#1C1100;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 5px;border:2px solid var(--top)}
.w-out{height:40px;padding:0 9px;border-radius:10px;border:1px solid rgba(255,255,255,.4);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;gap:4px;flex:none;margin-left:2px}
.w-out svg{width:16px;height:16px}
.w-main{flex:1;padding:16px 16px 22px;display:flex;flex-direction:column;gap:14px}
.w-foot{padding:12px 16px 12px;background:var(--bg);border-top:1px solid var(--bd);box-shadow:0 -10px 20px -14px rgba(16,34,58,.25);display:flex;flex-direction:column;gap:6px}
.w-nav{height:64px;background:var(--card);border-top:1px solid var(--bd);display:flex;flex:none}
.w-nav div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:12.5px;font-weight:600;color:var(--sub);position:relative}
.w-nav div svg{width:24px;height:24px}
.w-nav div.on{color:var(--act)}
.w-nav div.on:before{content:"";position:absolute;top:-1px;left:22%;right:22%;height:3px;border-radius:0 0 4px 4px;background:var(--ac)}
.w-nav i{position:absolute;top:8px;left:calc(50% + 7px);width:9px;height:9px;border-radius:50%;background:var(--wn);border:2px solid var(--card)}
.w-card{background:var(--card);border:1px solid var(--bd);border-radius:16px;box-shadow:var(--sh)}
.w-pad{padding:16px}
.w-h2{font-size:17px;font-weight:700;letter-spacing:-.15px}
.w-sub{color:var(--sub);font-size:14px}
.w-lbl{font-size:13px;font-weight:600;color:var(--sub)}
.w-chip{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border-radius:999px;font-size:13.5px;font-weight:700;white-space:nowrap}
.w-chip.i{background:var(--acbg);color:var(--act)}.w-chip.s{background:var(--okbg);color:var(--okt)}.w-chip.w{background:var(--wnbg);color:var(--wnt)}
.w-chip.e{background:var(--erbg);color:var(--er)}.w-chip.g{background:var(--card2);color:var(--sub);border:1px solid var(--bd)}
.w-btn{height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:16.5px;padding:0 16px;border:1.5px solid transparent;white-space:nowrap}
.w-btn svg{width:22px;height:22px;flex:none}
.w-btn.lg{height:56px;font-size:17.5px;border-radius:16px}
.w-btn.p{background:var(--ac);color:#fff;box-shadow:0 6px 14px -6px rgba(11,99,198,.65)}
.w-btn.g{background:var(--ok);color:#fff;box-shadow:0 8px 16px -8px rgba(18,128,74,.75)}
.w-btn.o{background:var(--card);color:var(--act);border-color:var(--bd2)}
.w-btn.d{background:var(--card);color:var(--er);border-color:color-mix(in srgb,var(--er) 40%,var(--bd))}
.w-btn.off{background:var(--card2);color:var(--sub);border-color:var(--bd2);box-shadow:none}
.w-btn.sm{height:44px;font-size:15px;border-radius:12px;padding:0 14px}
.w-av{border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex:none;background:linear-gradient(145deg,#2F7FD8,#0B4F9E)}
.w-in{height:52px;border-radius:12px;border:1.5px solid var(--bd2);background:var(--card);padding:0 14px;font-size:16px;display:flex;align-items:center;color:var(--tx)}
.w-in.ph{color:var(--ph)}
.w-in.foc{border-color:var(--ac);box-shadow:0 0 0 4px color-mix(in srgb,var(--ac) 18%,transparent)}
.w-hero{border-radius:20px;padding:18px;color:#fff;position:relative;overflow:hidden;
 background:radial-gradient(120% 90% at 100% 0%,rgba(255,255,255,.2),transparent 55%),linear-gradient(155deg,#1273DE 0%,#0B63C6 48%,#0A4A98 100%);box-shadow:0 18px 30px -16px rgba(11,99,198,.8),0 2px 4px rgba(11,99,198,.25)}
.wp.dark .w-hero{background:radial-gradient(120% 90% at 100% 0%,rgba(125,180,245,.22),transparent 55%),linear-gradient(155deg,#10529F 0%,#0C3F82 55%,#0A2D5E 100%);box-shadow:0 18px 30px -16px rgba(0,0,0,.8),inset 0 0 0 1px rgba(125,180,245,.18)}
.w-hero:after{content:"";position:absolute;right:-30px;bottom:-40px;width:150px;height:150px;border-radius:50%;border:1px solid rgba(255,255,255,.12);box-shadow:0 0 0 22px rgba(255,255,255,.04),0 0 0 46px rgba(255,255,255,.025);pointer-events:none}
.w-hbtn{height:52px;border-radius:13px;border:1.5px solid rgba(255,255,255,.38);background:rgba(255,255,255,.12);color:#fff;font-weight:700;font-size:15.5px;display:flex;align-items:center;justify-content:center;gap:5px;flex:1;position:relative;z-index:1;white-space:nowrap}
.w-hbtn svg{width:20px;height:20px}
.w-hbtn.w{background:#fff;color:#0A4A98;border-color:#fff;flex:none;height:56px;font-size:17px;box-shadow:0 6px 14px -6px rgba(0,0,0,.4)}
.w-tl{display:flex;gap:10px}
.w-tl .t{width:46px;flex:none;text-align:right;font-weight:700;font-size:14.5px;font-variant-numeric:tabular-nums;padding-top:14px}
.w-tl .r{width:14px;flex:none;position:relative}
.w-tl .r:before{content:"";position:absolute;left:6px;top:0;bottom:-12px;width:2px;background:var(--bd)}
.w-tl .r i{position:absolute;left:1px;top:18px;width:12px;height:12px;border-radius:50%;background:var(--card);border:3px solid var(--ac)}
.w-tl:last-child .r:before{bottom:calc(100% - 24px)}
.w-seg{display:flex;background:var(--card2);border:1px solid var(--bd);border-radius:14px;padding:4px;gap:4px}
.w-seg div{flex:1;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:6px;font-weight:700;font-size:15px;color:#3C4B63;text-align:center;line-height:1.15;padding:0 6px}
.w-seg div.on{background:var(--card);color:var(--act);box-shadow:0 1px 3px rgba(16,34,58,.14),0 0 0 1px var(--bd)}
.w-seg div.on.ok{color:var(--okt)}
.w-row{display:flex;align-items:center;gap:12px;padding:14px 16px;min-height:60px}
.w-row+.w-row{border-top:1px solid var(--bd)}
.w-ico{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none;background:var(--acbg);color:var(--act)}
.w-ico svg{width:22px;height:22px}
.w-ico.s{background:var(--okbg);color:var(--okt)}.w-ico.w{background:var(--wnbg);color:var(--wnt)}.w-ico.e{background:var(--erbg);color:var(--er)}.w-ico.g{background:var(--card2);color:var(--sub)}
.w-num{font-variant-numeric:tabular-nums}
.w-ph{background:linear-gradient(135deg,#C9B79C,#9C8A72);border-radius:12px;position:relative;overflow:hidden}
.sk{background:linear-gradient(100deg,#E7ECF3 28%,#F4F7FB 48%,#E7ECF3 68%);border-radius:7px}
.sk.d{background:linear-gradient(100deg,#DDE6F2 28%,#EEF3FA 48%,#DDE6F2 68%)}

.w-btn.dr{background:var(--er);color:#fff;box-shadow:0 8px 16px -8px rgba(180,41,31,.7)}
.w-btn.dg{background:transparent;color:var(--er);border-color:color-mix(in srgb,var(--er) 45%,var(--bd))}
.w-seg.big div{height:52px;font-size:15.5px;white-space:nowrap;gap:5px;padding:0 4px}
/* ── Giao diện "Mới" (theme): nền nhẹ, thẻ bo lớn không viền, nút tròn, menu dưới dạng thanh nổi ── */
.wp.nw{--bg:#EDF1F7;--bd:#E4EAF3;--sh:0 1px 1px rgba(16,34,58,.03),0 16px 32px -18px rgba(16,34,58,.28)}
.wp.nw.dark{--bg:#070E1A;--card:#0F1A2D;--card2:#15233B;--bd:#1A2B47}
.wp.nw .w-top{background:var(--bg);color:var(--tx);height:66px}
.wp.nw .w-top:after{display:none}
.wp.nw .w-ttl{font-size:22px;font-weight:800;letter-spacing:-.5px}
.wp.nw .w-ib{color:var(--tx);background:var(--card);border-radius:50%;width:42px;height:42px;box-shadow:var(--sh)}
.wp.nw .w-dot{border-color:var(--card)}.wp.nw .w-cnt{border-color:var(--card)}
.wp.nw .w-out{color:var(--tx);border-color:var(--bd2);border-radius:999px;background:var(--card)}
.wp.nw .w-card{border-color:transparent;border-radius:24px}
.wp.nw .w-btn{border-radius:999px}.wp.nw .w-btn.lg{border-radius:999px}
.wp.nw .w-hbtn{border-radius:999px}
.wp.nw .w-chip{border-radius:10px}
.wp.nw .w-ico{border-radius:50%}
.wp.nw .w-seg{border-radius:999px}.wp.nw .w-seg div{border-radius:999px}
.wp.nw .w-hero{border-radius:30px;padding:22px;background:radial-gradient(90% 70% at 100% 0%,rgba(66,153,245,.45),transparent 60%),linear-gradient(165deg,#12335F,#0A1D38 75%);box-shadow:0 26px 40px -22px rgba(10,29,56,.85)}
.wp.nw .w-hero h2{font-size:25px}
.wp.nw .w-hero:after{border-color:rgba(255,255,255,.08)}
.wp.nw .w-foot{background:var(--bg);border-top:0;box-shadow:none}
.wp.nw .w-nav{margin:0 14px 14px;border-radius:26px;background:#10223A;border:0;height:68px;padding:6px;box-shadow:0 18px 30px -14px rgba(10,29,56,.7)}
.wp.nw.dark .w-nav{background:#1B2D4B}
.wp.nw .w-nav div{color:#AFC0D8;border-radius:20px}
.wp.nw .w-nav div.on{background:#0B63C6;color:#fff}
.wp.nw .w-nav div.on:before{display:none}
.wp.nw .w-nav i{border-color:#10223A}
.wp.nw .w-tl .r:before{background:var(--bd2)}
.pg{font-family:"Be Vietnam Pro",system-ui,sans-serif;color:#10223A;font-size:15px;line-height:1.4;-webkit-font-smoothing:antialiased}
.pg *{box-sizing:border-box}.pg h1,.pg h2,.pg p{margin:0}
`;
const Css=()=><style>{CSS}</style>;
const I=(C,s=22,style)=>{const X=C;return <X width={s} height={s} style={style}/>};

/* ───────── Thành phần cục bộ ───────── */
const Av=({t,s=44,c,style})=><span className="w-av" style={{width:s,height:s,fontSize:s*.4,background:c,...style}}>{t}</span>;
const Ch=({k='g',children,style})=><span className={'w-chip '+k} style={style}>{children}</span>;
const Logo=({s=40,r})=><svg width={s} height={s} viewBox="0 0 40 40" aria-hidden><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2A86E6"/><stop offset="1" stopColor="#0A4A98"/></linearGradient></defs>
 <rect width="40" height="40" rx={r??11} fill="url(#lg)"/><path d="M8 19.5 20 9l12 10.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
 <g fill="#fff"><rect x="11" y="21" width="8" height="4.4" rx="1"/><rect x="21" y="21" width="8" height="4.4" rx="1" opacity=".85"/><rect x="11" y="26.6" width="4.2" height="4.4" rx="1" opacity=".85"/><rect x="16.9" y="26.6" width="8" height="4.4" rx="1"/><rect x="26.6" y="26.6" width="2.4" height="4.4" rx="1" opacity=".7"/></g></svg>;

const NAV=[[HomeIcon,HomeS,'Hôm nay'],[BriefcaseIcon,BriefS,'Việc'],[BanknotesIcon,BankS,'Thu nhập'],[UserIcon,UserS,'Tôi']];
function WPhone({title,sub,back,children,foot,active=0,dark,theme,brand,pin='on',unread=0,nav=true,navDot,overlay}){
 return <div className={'wp'+(dark?' dark':'')+(theme==='new'?' nw':'')} style={{width:390,minHeight:844,background:'var(--bg)',display:'flex',flexDirection:'column',position:'relative'}}><Css/>
  <div className="w-top">
   {back?<span className="w-ib" style={{marginLeft:-8,width:36}}>{I(ChevronLeftIcon,26)}</span>:brand?<span style={{display:'flex',marginRight:4,padding:3,borderRadius:11,background:'#fff',boxShadow:'0 2px 6px rgba(0,0,0,.2)'}}><Logo s={28} r={8}/></span>:null}
   <div className="w-ttl">{title}{sub&&<small>{sub}</small>}</div>
   {pin&&<span className="w-ib">{I(MapPinIcon)}<i className={'w-dot'+(pin==='warn'?' o':'')}/></span>}
   <span className="w-ib">{I(EnvelopeIcon)}{unread>0&&<b className="w-cnt">{unread}</b>}</span>
   <span className="w-out">{I(ArrowRightOnRectangleIcon)}Đăng xuất</span>
  </div>
  <div className="w-main">{children}</div>
  {foot&&<div className="w-foot">{foot}</div>}
  {nav&&<div className="w-nav">{NAV.map(([O,S,t],i)=><div key={t} className={i===active?'on':''}>{i===active?I(S,24):I(O,24)}{t}{navDot===i&&<i/>}</div>)}</div>}
  {overlay}
 </div>;}

/* 4 bước giao hàng: vòng tròn số */
const L4=['Nhận việc','Lấy hàng','Đang giao','Đã giao'];
function Steps4({n=2,hero,labels=L4}){
 const col=hero?{done:'#fff',doneT:'#0A4A98',cur:'#fff',curT:'#0A4A98',off:'rgba(255,255,255,.14)',offT:'rgba(255,255,255,.8)',line:'rgba(255,255,255,.28)',lineOn:'#fff',lab:'rgba(255,255,255,.9)',labOn:'#fff',ring:'rgba(255,255,255,.3)'}
  :{done:'var(--ok)',doneT:'#fff',cur:'var(--ac)',curT:'#fff',off:'var(--card2)',offT:'var(--sub)',line:'var(--bd)',lineOn:'var(--ok)',lab:'var(--sub)',labOn:'var(--tx)',ring:'color-mix(in srgb,var(--ac) 26%,transparent)'};
 return <div style={{display:'flex',alignItems:'flex-start',position:'relative',zIndex:1}}>{labels.map((l,i)=><React.Fragment key={l}>
  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,width:68,flex:'none'}}>
   <span style={{width:34,height:34,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:15,
    background:i<n?col.done:i===n?col.cur:col.off,color:i<n?col.doneT:i===n?col.curT:col.offT,border:i>n?(hero?'1.5px solid rgba(255,255,255,.4)':'1.5px solid var(--bd2)'):'none',
    boxShadow:i===n?`0 0 0 5px ${col.ring}`:'none'}}>{i<n?I(CheckS,18):i+1}</span>
   <span style={{fontSize:13,fontWeight:i<=n?700:500,color:i<=n?col.labOn:col.lab,textAlign:'center',lineHeight:1.15}}>{l}</span></div>
  {i<labels.length-1&&<span style={{flex:1,height:3,borderRadius:2,background:i<n?col.lineOn:col.line,marginTop:15,marginLeft:-8,marginRight:-8}}/>}</React.Fragment>)}</div>;}

const Mono=({children,style})=><b style={{color:'var(--act)',fontVariantNumeric:'tabular-nums',...style}}>{children}</b>;
const Note=({children,style})=><p style={{textAlign:'center',color:'var(--sub)',fontSize:13.5,lineHeight:1.5,...style}}>{children}</p>;

/* ═════════ 1. work-login ═════════ */
function LoginCard({tab=1,mobile,w}){
 const user=['quanly.lan','dung.tho','khach.baolong'][tab];
 const tabs=[[ComputerDesktopIcon,'Vận hành'],[TruckIcon,'Thợ & tài xế'],[UserIcon,'Khách hàng']];
 const hint=['Dành cho nhân viên văn phòng, bán hàng, kho và kế toán.','Dành cho thợ, tài xế và nhân viên giao hàng. Dùng tên đăng nhập cửa hàng cấp.','Dành cho khách mua hàng. Xem đơn, công nợ và đặt hàng.'][tab];
 return <div className="w-card" style={{width:w,padding:mobile?20:32,borderRadius:20,boxShadow:'0 24px 48px -20px rgba(10,40,90,.35),0 2px 6px rgba(10,40,90,.08)'}}>
  <h1 style={{fontSize:mobile?25:27,fontWeight:800,letterSpacing:-.4}}>Đăng nhập</h1>
  <div style={{display:'flex',gap:6,margin:'16px 0 10px',background:'var(--card2)',border:'1px solid var(--bd)',borderRadius:14,padding:4}} role="tablist">
   {tabs.map(([T,t],i)=><div key={t} style={{flex:1,height:mobile?52:46,borderRadius:10,display:'flex',flexDirection:mobile?'column':'row',alignItems:'center',justifyContent:'center',gap:mobile?2:7,fontSize:mobile?13:14.5,fontWeight:700,
    background:i===tab?'var(--card)':'transparent',color:i===tab?'var(--act)':'var(--sub)',boxShadow:i===tab?'0 1px 3px rgba(16,34,58,.14),0 0 0 1px var(--bd)':'none'}}>{I(T,20)}{t}</div>)}</div>
  <p className="w-sub" style={{fontSize:14,marginBottom:16}}>{hint}</p>
  <div style={{display:'flex',flexDirection:'column',gap:14}}>
   <div style={{display:'flex',flexDirection:'column',gap:6}}><span className="w-lbl">Tên đăng nhập</span><div className="w-in foc">{user}</div></div>
   <div style={{display:'flex',flexDirection:'column',gap:6}}><span className="w-lbl">Mật khẩu</span><div className="w-in" style={{justifyContent:'space-between'}}><span style={{letterSpacing:3}}>••••••••••</span><span style={{color:'var(--sub)',display:'flex'}}>{I(EyeIcon,22)}</span></div></div>
   <div className="w-btn p lg" style={{marginTop:4}}>Đăng nhập</div>
   <div style={{textAlign:'center',color:'var(--act)',fontWeight:600,fontSize:15,padding:'4px 0'}}>Quên mật khẩu?</div></div>
  {tab===2&&<div style={{textAlign:'center',color:'var(--act)',fontWeight:600,fontSize:15,marginTop:4}}>Đăng ký tài khoản</div>}
 </div>;}

def('work-login','/work/login','Login (mobile)','Thẻ chồng lên dải xanh, lề 16, tab 3 cổng cao 52 với biểu tượng trên chữ, ô nhập 16px, nút 56px (D30).',()=>
 <div className="wp" style={{width:390,minHeight:844,background:'var(--bg)',position:'relative'}}><Css/>
  <div style={{height:250,background:'linear-gradient(165deg,#1273DE,#0B63C6 55%,#0A4A98)',padding:'44px 16px 0',position:'relative',overflow:'hidden'}}>
   <div style={{position:'absolute',right:-50,top:-30,width:220,height:220,borderRadius:'50%',boxShadow:'0 0 0 26px rgba(255,255,255,.05),0 0 0 56px rgba(255,255,255,.035)'}}/>
   <div style={{display:'flex',alignItems:'center',gap:12,color:'#fff',position:'relative'}}><Logo s={44} r={12}/><div><div style={{fontWeight:800,fontSize:19,letterSpacing:-.2}}>Hiền Xa ERP</div><div style={{fontSize:13.5,opacity:.85}}>Vật liệu xây dựng · Hệ thống nội bộ</div></div></div></div>
  <div style={{padding:'0 16px 28px',marginTop:-112,position:'relative'}}><LoginCard tab={1} mobile/>
   <Note style={{marginTop:18}}>Máy này nhớ cổng bạn dùng lần trước.<br/>Quên tài khoản: hỏi quản lý cửa hàng.</Note></div></div>,390);

/* ═════════ 2. work-change-password ═════════ */
const Pw=({l,v,foc})=><div style={{display:'flex',flexDirection:'column',gap:6}}><span className="w-lbl">{l}</span><div className={'w-in'+(foc?' foc':'')} style={{justifyContent:'space-between'}}><span style={{letterSpacing:3}}>{v}</span><span style={{color:'var(--sub)',display:'flex'}}>{I(EyeIcon,22)}</span></div></div>;
const Rule=({ok,t})=><div style={{display:'flex',alignItems:'center',gap:10,fontSize:14.5,color:ok?'var(--okt)':'var(--sub)',fontWeight:ok?600:500}}>
 <span style={{width:22,height:22,borderRadius:'50%',background:ok?'var(--ok)':'var(--card2)',border:ok?'none':'1.5px solid var(--bd2)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>{ok&&I(CheckS,13)}</span>{t}</div>;
def('work-change-password','/work/change-password','Form (mobile)','Đổi mật khẩu: ba ô có nhãn, hiện/ẩn, kiểm tra quy tắc ngay khi gõ; một nút chính.',()=>
 <WPhone title="Đổi mật khẩu" back active={3} unread={2} foot={<div className="w-btn p lg">Đổi mật khẩu</div>}>
  <div className="w-card w-pad" style={{display:'flex',gap:12,alignItems:'flex-start',background:'var(--acbg)',borderColor:'transparent',boxShadow:'none'}}>
   <span className="w-ico" style={{background:'var(--card)'}}>{I(ShieldCheckIcon)}</span>
   <div><b style={{fontSize:15.5}}>Đặt mật khẩu của riêng bạn</b><p className="w-sub" style={{marginTop:2,color:'var(--tx)',opacity:.78}}>Mật khẩu hiện tại do cửa hàng cấp. Sau khi đổi, chỉ bạn biết mật khẩu này.</p></div></div>
  <div className="w-card w-pad" style={{display:'flex',flexDirection:'column',gap:16}}>
   <Pw l="Mật khẩu hiện tại" v="••••••••"/><Pw l="Mật khẩu mới" v="•••••••••••" foc/><Pw l="Nhập lại mật khẩu mới" v="••••"/>
   <div style={{display:'flex',flexDirection:'column',gap:9,paddingTop:2}}><Rule ok t="Có ít nhất 8 ký tự"/><Rule ok t="Có cả chữ và số"/><Rule t="Hai lần nhập giống nhau"/></div></div>
 </WPhone>,390);

/* ═════════ 3. work-home ═════════ */
const Job=({time,title,sub,who,chip,k})=><div className="w-tl"><div className="t">{time}</div><div className="r"><i style={k?{borderColor:k}:undefined}/></div>
 <div className="w-card" style={{flex:1,padding:'12px 14px',marginBottom:12,minWidth:0}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'flex-start'}}><b style={{fontSize:15.5,lineHeight:1.3}}>{title}</b>{chip}</div>
  <div className="w-sub" style={{marginTop:3}}>{sub}</div>{who&&<div style={{marginTop:6,display:'flex',alignItems:'center',gap:6,fontSize:13.5,color:'var(--sub)'}}>{I(MapPinIcon,16)}{who}</div>}</div></div>;
const HHd=()=>(
  <div style={{display:'flex',alignItems:'center',gap:12,padding:'2px 2px 0'}}>
   <div style={{flex:1}}><div style={{display:'flex',alignItems:'center',gap:7,color:'var(--wnt)',fontWeight:600,fontSize:14}}>{I(SunIcon,19)}Thứ Năm · 19/11/2026</div><h1 style={{fontSize:25,fontWeight:800,letterSpacing:-.5,marginTop:2}}>Chào buổi sáng, Dũng</h1></div><Av t="D" s={48}/></div>
);
const HShift=()=>(
  <div className="w-card" style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px'}}>
   <span className="w-ico">{I(ClockIcon)}</span>
   <div style={{flex:1,minWidth:0}}><b style={{fontSize:15.5}}>Ca sáng · 07:30 – 16:30</b><div style={{fontSize:13.5,color:'var(--okt)',fontWeight:600,display:'flex',alignItems:'center',gap:4,marginTop:1}}>{I(CheckS,14)}Vào ca 07:28 · đúng giờ</div></div>
   <div className="w-btn o sm" style={{height:48}}>Ra ca</div></div>
);
const HHero=()=>(
  <div className="w-hero">
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',position:'relative',zIndex:1}}>
    <span style={{display:'inline-flex',alignItems:'center',gap:7,background:'rgba(255,255,255,.18)',borderRadius:999,height:26,padding:'0 11px',fontSize:13,fontWeight:700}}><i style={{width:8,height:8,borderRadius:'50%',background:'#5BE49B',boxShadow:'0 0 0 3px rgba(91,228,155,.3)'}}/>Đang giao</span>
    <span style={{fontSize:13.5,fontWeight:600,opacity:.92}}>PG-0412 · hẹn 09:30</span></div>
   <h2 style={{fontSize:22,fontWeight:800,letterSpacing:-.4,margin:'12px 0 4px',position:'relative',zIndex:1}}>Công ty XD Bảo Long</h2>
   <div style={{display:'flex',gap:7,fontSize:14.5,opacity:.95,position:'relative',zIndex:1,lineHeight:1.35}}><span style={{marginTop:1}}>{I(MapPinIcon,18)}</span>Số 12 ngõ 85 Đại Mỗ, Nam Từ Liêm, Hà Nội</div>
   <div style={{fontSize:14,opacity:.85,margin:'3px 0 16px 25px',position:'relative',zIndex:1}}>60 bao xi măng (3.000 kg) · 8,5 m³ cát</div>
   <Steps4 n={2} hero/>
   <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:18}}><div className="w-hbtn w">Mở việc{I(ChevronRightIcon,20)}</div><div style={{display:'flex',gap:10}}><div className="w-hbtn">{I(PhoneIcon)}Gọi</div><div className="w-hbtn">{I(ArrowTurnUpRightIcon)}Chỉ đường</div></div></div></div>
);
const HHint=()=>(
  <div className="w-card" style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'var(--acbg)',borderColor:'transparent',boxShadow:'none'}}>
   <span className="w-ico" style={{background:'var(--card)'}}>{I(InboxArrowDownIcon)}</span><b style={{flex:1,fontSize:15,color:'var(--act)'}}>Có 2 việc mới có thể nhận</b><span style={{color:'var(--act)',display:'flex'}}>{I(ChevronRightIcon,20)}</span></div>
);
const HNext=()=>(
  <div style={{marginTop:6}}><h2 className="w-h2" style={{marginBottom:12}}>Tiếp theo hôm nay</h2>
   <div><Job time="13:30" title="Giao thép phi 10 · Hà Đông" sub="20 cây (≈ 247 kg) · Công ty Minh Phát" who="Ngõ 3 Quang Trung, Hà Đông" chip={<Ch k="g">Chờ bắt đầu</Ch>}/>
    <Job time="15:45" title="Cẩu hàng lên tầng 5" sub="Dịch vụ · khoảng 2 giờ · Anh Tuấn" who="Cầu Giấy" chip={<Ch k="w">Dịch vụ</Ch>} k="#E8890C"/></div></div>
);
const HSoon=()=>(
  <div><h2 className="w-h2" style={{marginBottom:12}}>Sắp tới</h2>
   <div><Job time="20/11" title="Giao xi măng · Nam Từ Liêm" sub="08:00 · 100 bao (5.000 kg) · Cô Hoa"/><Job time="21/11" title="Giao cát xây · Đại Mỗ" sub="09:30 · 8,5 m³ · Công ty XD Bảo Long"/></div></div>
);
function Home({dark,theme}){
 return <WPhone brand title="Hiền Xa" dark={dark} theme={theme} active={0} unread={2} navDot={1}>
  <HHd/><HShift/><HHero/><HHint/><HNext/><HSoon/>
 </WPhone>;}
def('work-home','/work','Home (mobile)','Hôm nay: lời chào, thẻ ca, thẻ xanh việc đang làm 4 bước + Gọi/Chỉ đường/Mở việc, Tiếp theo hôm nay (dòng thời gian), Sắp tới.',()=><Home/>,390);
def('work-home-dark','/work (nền tối)','Home dark (mobile)','D84: bản tối của đúng giao diện hiện tại; mọi màu qua biến --portal-*, tương phản AA, trạng thái luôn có chữ.',()=><Home dark/>,390);

/* ═════════ 4. work-job-detail ═════════ */
const Cargo=({n,q,ok=true,u})=><div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderTop:'1px solid var(--bd)'}}>
 <span className={'w-ico '+(ok?'s':'w')} style={{width:36,height:36}}>{ok?I(CheckIcon,20):I(TruckIcon,20)}</span>
 <div style={{flex:1,minWidth:0}}><b style={{fontSize:15.5}}>{n}</b><div style={{fontSize:13.5,color:ok?'var(--okt)':'var(--wnt)',fontWeight:600}}>{ok?'Đã lên xe':'Chưa lấy lên xe'}</div></div>
 <div style={{textAlign:'right',fontWeight:800,fontSize:16,color:'var(--tx)',fontVariantNumeric:'tabular-nums',lineHeight:1.25}}>{q}{u&&<div style={{fontWeight:500,fontSize:13,color:'var(--sub)'}}>{u}</div>}</div></div>;
def('work-job-detail','/work/jobs/[id]','Detail (mobile)','Quay lại + Loại · mã + tên khách + chip; 4 bước vòng tròn số; địa điểm; Hàng trên xe; thao tác dính đáy.',()=>
 <WPhone back title="Chi tiết việc" active={1} unread={2} foot={<div style={{display:'flex',flexDirection:'column',gap:14}}><div className="w-btn g lg">{I(CameraIcon,24)}Đã giao · chụp ảnh</div><div className="w-btn o">Giao thiếu / Không giao được</div></div>}>
  <div style={{padding:'0 2px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span className="w-lbl">Giao hàng · <Mono>PG-0412</Mono></span><Ch k="i">Đang giao</Ch></div>
   <h1 style={{fontSize:24,fontWeight:800,letterSpacing:-.5,marginTop:4}}>Công ty XD Bảo Long</h1></div>
  <div className="w-card w-pad" style={{paddingTop:18}}><Steps4 n={2}/></div>
  <div className="w-card w-pad">
   <h2 className="w-h2" style={{marginBottom:12}}>Địa điểm giao</h2>
   <div style={{display:'flex',gap:12}}><span className="w-ico">{I(MapPinIcon)}</span><div style={{flex:1}}><b style={{fontSize:16,lineHeight:1.3}}>Số 12 ngõ 85 Đại Mỗ, Nam Từ Liêm, Hà Nội</b>
    <div className="w-sub" style={{marginTop:3}}>Hẹn <b style={{color:'var(--tx)'}}>09:30</b> hôm nay · cách khoảng 4,2 km</div></div></div>
   <div style={{margin:'14px 0',padding:'11px 13px',borderRadius:12,background:'var(--wnbg)',color:'var(--wnt)',fontSize:14.5,lineHeight:1.4}}><b>Lối vào:</b> cổng sắt xanh, bấm chuông số 2. Xe tải vào được tới sân.</div>
   <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0 14px'}}><Av t="B" s={40} c="linear-gradient(145deg,#6B7F99,#3D4F68)"/><div style={{flex:1}}><b>Anh Bảo</b><div className="w-sub" style={{fontSize:14}}>Người nhận · <span className="w-num">0912 345 678</span></div></div></div>
   <div style={{display:'flex',gap:10}}><div className="w-btn o" style={{flex:1,padding:'0 8px'}}>{I(PhoneIcon,20)}Gọi</div><div className="w-btn o" style={{flex:1,padding:'0 8px'}}>{I(ArrowTurnUpRightIcon,20)}Chỉ đường</div></div></div>
  <div className="w-card w-pad" style={{paddingBottom:6}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}><h2 className="w-h2">Hàng trên xe</h2><span className="w-sub" style={{fontSize:13.5}}>3 dòng · xe 29C-123.45</span></div>
   <Cargo n="Xi măng PC40 Hoàng Thạch" q="60 bao" u="3.000 kg"/><Cargo n="Cát xây" q="8,5 m³"/><Cargo n="Thép phi 10 CB300" q="20 cây" u="≈ 247 kg"/></div>
 </WPhone>,390);

/* ═════════ 5. work-job-delivered ═════════ */
const Toggle=({full=true})=><div className="w-seg"><div className={full?'on ok':''}>{full&&I(CheckS,18)}Giao đủ</div><div className={!full?'on':''}>{!full&&I(ExclamationTriangleIcon,18)}Giao thiếu</div></div>;
const Photo=({i,state='ok'})=><div className="w-ph" style={{aspectRatio:'1',background:i===0?'linear-gradient(135deg,#D3C2A6,#9A8870)':'linear-gradient(135deg,#B9C4D0,#7B8BA0)'}}>
 <svg viewBox="0 0 100 100" width="100%" height="100%" style={{position:'absolute',inset:0,opacity:.55}}><g fill="rgba(255,255,255,.55)"><rect x="12" y="54" width="34" height="18" rx="5"/><rect x="50" y="54" width="34" height="18" rx="5"/><rect x="26" y="34" width="34" height="18" rx="5"/><rect x="64" y="34" width="24" height="18" rx="5"/></g></svg>
 {state==='ok'&&<><span style={{position:'absolute',left:6,bottom:6,background:'rgba(18,128,74,.95)',color:'#fff',borderRadius:8,fontSize:13.5,fontWeight:700,padding:'3px 8px'}}>Đã tải</span>
  <span style={{position:'absolute',right:4,top:4,width:40,height:40,borderRadius:'50%',background:'rgba(16,34,58,.78)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>{I(XMarkIcon,20)}</span></>}
 {state==='err'&&<div style={{position:'absolute',inset:0,background:'rgba(120,24,16,.82)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,color:'#fff',fontWeight:700,fontSize:14,textAlign:'center'}}>{I(ExclamationTriangleIcon,24)}Lỗi tải<span style={{background:'#fff',color:'#8A1C13',borderRadius:8,padding:'5px 12px',fontSize:14,marginTop:2}}>Thử lại</span></div>}
 {state==='up'&&<div style={{position:'absolute',inset:0,background:'rgba(16,34,58,.5)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,color:'#fff',fontWeight:700,fontSize:14}}>Đang tải
  <span style={{width:'66%',height:5,borderRadius:3,background:'rgba(255,255,255,.35)'}}><span style={{display:'block',width:'62%',height:'100%',borderRadius:3,background:'#fff'}}/></span></div>}</div>;
const AddPhoto=({big})=><div style={{aspectRatio:big?undefined:'1',height:big?150:undefined,border:'2px dashed var(--bd2)',borderRadius:12,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,color:'var(--act)',fontWeight:700,fontSize:14,textAlign:'center',background:'var(--card2)'}}>
 {big?<span className="w-ico" style={{width:52,height:52,borderRadius:16}}>{I(CameraIcon,28)}</span>:I(PlusIcon,24)}{big?'Chụp ảnh giao hàng':'Chụp thêm'}</div>;
const RecvNote=()=><div className="w-card w-pad" style={{display:'flex',flexDirection:'column',gap:14}}>
  <div style={{display:'flex',flexDirection:'column',gap:6}}><span className="w-lbl">Người nhận</span><div className="w-in" style={{justifyContent:'space-between'}}>Anh Bảo<span className="w-chip g" style={{height:22,fontSize:12.5}}>Điền sẵn từ phiếu</span></div></div>
  <div style={{display:'flex',flexDirection:'column',gap:6}}><span className="w-lbl">Ghi chú (không bắt buộc)</span><div className="w-in ph">Ví dụ: hàng để ở sân, đã kiểm đủ</div></div></div>;
const Lines=()=><div className="w-card w-pad" style={{paddingBottom:6}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}><h2 className="w-h2">Hàng đã giao</h2><span className="w-sub" style={{fontSize:13.5}}>Theo phiếu · đủ</span></div>
  {[['Xi măng PC40 Hoàng Thạch','60 bao'],['Cát xây','8,5 m³'],['Thép phi 10 CB300','20 cây']].map(([a,b],i)=><div key={a} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 0',borderTop:i?'1px solid var(--bd)':'none',marginTop:i?0:8}}>
   <span style={{color:'var(--ok)',display:'flex'}}>{I(CheckCircleIcon,22)}</span><span style={{flex:1,fontSize:15.5}}>{a}</span><b style={{color:'var(--tx)',fontSize:16.5,fontVariantNumeric:'tabular-nums'}}>{b}</b></div>)}</div>;
def('work-job-delivered','/work/jobs/[id]/delivered','Wizard step (mobile)','Giao đủ / Giao thiếu 2 nút gạt; từng dòng hàng số lượng xanh; ảnh, người nhận, nút lớn "Đã giao · chụp ảnh".',()=>
 <WPhone back title="Báo đã giao" active={1} unread={2} foot={<div className="w-btn g lg">{I(CameraIcon,24)}Đã giao · chụp ảnh</div>}>
  <Toggle/><Lines/>
  <div className="w-card w-pad"><div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:12}}><h2 className="w-h2">Ảnh giao hàng</h2><span className="w-sub" style={{fontSize:13.5}}>Chưa có ảnh · cần ít nhất 1</span></div>
   <div style={{display:'flex',gap:12,alignItems:'center'}}><span className="w-ico" style={{width:48,height:48,borderRadius:14}}>{I(CameraIcon,26)}</span><p className="w-sub" style={{fontSize:14,lineHeight:1.45}}>Bấm <b style={{color:'var(--tx)'}}>Đã giao · chụp ảnh</b> bên dưới để chụp hàng đã dỡ và nơi giao. Mất mạng vẫn giữ ảnh đã chụp.</p></div></div>
  <RecvNote/>
 </WPhone>,390);
def('work-job-delivered-photos','/work/jobs/[id]/delivered (ảnh đang tải)','Wizard step (mobile)','Ảnh còn đang tải: nút xác nhận khóa "Đang tải ảnh (1/2)…" để không gửi thiếu bằng chứng.',()=>
 <WPhone back title="Báo đã giao" active={1} unread={2} foot={<div className="w-btn lg off">{I(ArrowPathIcon,24)}Đang tải ảnh (1/2)…</div>}>
  <Toggle/><Lines/>
  <div className="w-card w-pad"><div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:12}}><h2 className="w-h2">Ảnh giao hàng</h2><span className="w-sub" style={{fontSize:13.5}}>1 đã tải · 1 đang tải</span></div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}><Photo i={0}/><Photo i={1} state="up"/><AddPhoto/></div></div>
  <RecvNote/>
 </WPhone>,390);

const PhotoSec=({tiles,count})=><div className="w-card w-pad"><div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:12}}><h2 className="w-h2">Ảnh giao hàng</h2><span className="w-sub" style={{fontSize:13.5}}>{count}</span></div><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>{tiles}</div></div>;
def('work-job-delivered-error','/work/jobs/[id]/delivered (ảnh lỗi)','Wizard step (mobile)','Có ảnh lỗi tải: ô đỏ "Lỗi tải · Thử lại", nút xác nhận khóa cho tới khi tải xong hoặc xóa ảnh lỗi.',()=>
 <WPhone back title="Báo đã giao" active={1} unread={2} foot={<div className="w-btn lg off">Có 1 ảnh chưa tải được</div>}>
  <Toggle/><Lines/><PhotoSec count="1 đã tải · 1 lỗi" tiles={<><Photo i={0}/><Photo i={1} state="err"/><AddPhoto/></>}/><RecvNote/>
 </WPhone>,390);
def('work-job-delivered-ready','/work/jobs/[id]/delivered (đủ ảnh)','Wizard step (mobile)','Cả hai ảnh đã tải: nút thành "Xác nhận đã giao (2 ảnh)" (xanh lá, hoàn tất).',()=>
 <WPhone back title="Báo đã giao" active={1} unread={2} foot={<div className="w-btn g lg">{I(CheckIcon,24)}Xác nhận đã giao (2 ảnh)</div>}>
  <Toggle/><Lines/><PhotoSec count="2 / 5 ảnh" tiles={<><Photo i={0}/><Photo i={1}/><AddPhoto/></>}/><RecvNote/>
 </WPhone>,390);
const Qty=({n,u,v,max})=><div style={{padding:'12px 0',borderTop:'1px solid var(--bd)'}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><b style={{fontSize:15.5}}>{n}</b><span className="w-sub">Theo phiếu: {max}</span></div>
 <div style={{display:'flex',alignItems:'center',gap:10}}><span className="w-btn o" style={{width:72,padding:0,fontSize:24}}>−</span><div className="w-in w-num" style={{flex:1,justifyContent:'center',fontWeight:800,fontSize:20}}>{v}</div><span className="w-btn o" style={{width:72,padding:0,fontSize:24}}>+</span></div></div>;
def('work-job-short','/work/jobs/[id]/delivered (giao thiếu)','Wizard step (mobile)','Giao thiếu: số lượng từng dòng (−/+ 72px, theo đơn vị bán), lý do bắt buộc; vẫn cần ảnh. Không giao được thì cần lý do.',()=>
 <WPhone back title="Báo đã giao" active={1} unread={2} foot={<div className="w-btn p lg">{I(CameraIcon,24)}Chụp ảnh và báo giao thiếu</div>}>
  <Toggle full={false}/>
  <div className="w-card w-pad" style={{paddingBottom:4}}><h2 className="w-h2" style={{marginBottom:2}}>Số lượng đã giao</h2><p className="w-sub" style={{fontSize:13.5,marginBottom:6}}>Nhập đúng số hàng thực tế đã dỡ xuống.</p>
   <Qty n="Xi măng PC40 (bao)" v="50" max="60 bao"/><Qty n="Cát xây (m³)" v="8,5" max="8,5 m³"/><Qty n="Thép phi 10 CB300 (cây)" v="20" max="20 cây"/></div>
  <div className="w-card w-pad" style={{display:'flex',flexDirection:'column',gap:6}}><span className="w-lbl">Lý do / ghi chú (bắt buộc khi giao thiếu)</span><div className="w-in foc" style={{height:84,alignItems:'flex-start',paddingTop:14}}>Xe hết chỗ, 10 bao giao bổ sung chiều nay</div></div>
 </WPhone>,390);

/* ═════════ 6. work-dispatch ═════════ */
const Wait=({time,title,sub,sug,why,refused,primary})=><div className="w-card w-pad" style={{display:'flex',flexDirection:'column',gap:12,borderLeft:refused?'4px solid var(--er)':undefined}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:8}}><div><div className="w-lbl"><Mono>{time}</Mono></div><b style={{fontSize:17,lineHeight:1.3}}>{title}</b></div>{refused?<Ch k="e">Bị từ chối</Ch>:<Ch k="w">Chờ người</Ch>}</div>
 <div className="w-sub" style={{marginTop:-6}}>{sub}</div>
 {refused&&<div style={{background:'var(--erbg)',color:'var(--er)',borderRadius:10,padding:'9px 12px',fontSize:14,fontWeight:600}}>Anh Nam đã từ chối: bận việc nhà. Cần chọn người khác.</div>}
 {sug&&<div style={{display:'flex',alignItems:'center',gap:12,background:'var(--card2)',borderRadius:12,padding:'10px 12px'}}><Av t={sug[4]} s={40}/><div style={{flex:1}}><b>Gợi ý: {sug}</b><div className="w-sub" style={{fontSize:13.5}}>{why}</div></div></div>}
 <div style={{display:'flex',gap:8}}>{sug&&<div className={'w-btn '+(primary?'p':'o')} style={{flex:1,padding:'0 8px',fontSize:15.5,minWidth:0}}>Giao cho {sug.split(' ').slice(-1)}</div>}<div className="w-btn o" style={{flex:1,padding:'0 8px',fontSize:15.5,minWidth:0}}>Chọn người khác</div></div></div>;
def('work-dispatch','/work/dispatch','Dispatch board (mobile)','D85 Điều phối của thợ chính: một cột; Chờ người (việc bị từ chối lên đầu) với gợi ý một chạm; Đã giao hôm nay + Đổi người.',()=>
 <WPhone brand title="Điều phối" active={1} unread={2}>
  <div className="w-seg"><div className="on" style={{fontSize:14.5}}>Chờ người · 3</div><div style={{fontSize:14.5}}>Đã phân giao · 5</div></div>
    <Wait refused time="PG-0415 · 10:30" title="Giao xi măng · Cầu Giấy" sub="100 bao (5.000 kg) · Anh Tuấn · 6,1 km" sug="Anh Hải" why="Rảnh từ 10:00 · xe 29C-456.78" primary/>
  <Wait time="PG-0417 · 13:00" title="Giao gạch ống · Hà Đông" sub="2.000 viên · Cô Hoa · 3,8 km" sug="Anh Quân" why="Ít việc nhất hôm nay (2 chuyến)"/>
  <Wait time="DV-0046 · 15:00" title="Cẩu hàng lên tầng 3" sub="Dịch vụ · khoảng 1,5 giờ · Minh Phát"/>
  <h2 className="w-h2" style={{marginTop:4}}>Đã phân giao hôm nay</h2>
  <div className="w-card">{[['H','Anh Hải','PG-0409 · Cầu Giấy','Đang giao','i'],['Q','Anh Quân','PG-0411 · Hà Đông','Đã phân giao','g'],['D','Anh Dũng','PG-0412 · Nam Từ Liêm','Đang giao','i'],['H','Anh Hải','PG-0405 · Đại Mỗ','Chờ xác minh','w']].map(([a,n,c,s,k])=>
   <div key={c} className="w-row"><Av t={a} s={40}/><div style={{flex:1,minWidth:0}}><b>{n}</b><div className="w-sub" style={{fontSize:13.5}}>{c}</div></div><div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}><Ch k={k}>{s}</Ch>{s==='Đã phân giao'&&<span style={{fontWeight:700,color:'var(--act)',fontSize:14}}>Đổi người</span>}</div></div>)}</div>
 </WPhone>,390);

/* ═════════ 7. work-pool ═════════ */
const Pool=({time,title,sub,pay,km,fresh,first,tag='Giao hàng'})=><div className="w-card w-pad" style={{display:'flex',flexDirection:'column',gap:12}}>
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div style={{display:'flex',gap:8,alignItems:'center'}}><Ch k={tag==='Dịch vụ'?'w':'i'}>{tag}</Ch>{fresh&&<span style={{fontSize:13,color:'var(--okt)',fontWeight:700}}>Mới đăng</span>}</div><b className="w-num" style={{fontSize:16}}>{time}</b></div>
 <div><b style={{fontSize:18,lineHeight:1.3}}>{title}</b><div className="w-sub" style={{marginTop:3}}>{sub}</div></div>
 <div style={{display:'flex',gap:16,color:'var(--sub)',fontSize:14,alignItems:'center'}}><span style={{display:'flex',gap:5,alignItems:'center'}}>{I(MapPinIcon,18)}{km}</span><span style={{display:'flex',gap:5,alignItems:'center',color:'var(--okt)',fontWeight:700}}>{I(BanknotesIcon,18)}{pay}</span></div>
 <div className={'w-btn '+(first?'p':'o')}>Nhận việc này</div></div>;
def('work-pool','/work/pool','Cards (mobile)','Việc chờ nhận: lọc chip, thẻ có giờ, lượng, khoảng cách, tiền chuyến; một nút "Nhận việc này" 52px.',()=>
 <WPhone title="Việc chờ nhận" active={1} unread={2}>
  <div style={{display:'flex',gap:8}}>{[['Tất cả · 3',1],['Giao hàng · 2'],['Dịch vụ · 1']].map(([t,on])=><span key={t} style={{height:40,padding:'0 15px',display:'flex',alignItems:'center',borderRadius:999,fontWeight:700,fontSize:14.5,background:on?'var(--ac)':'var(--card)',color:on?'#fff':'var(--sub)',border:on?'none':'1px solid var(--bd2)'}}>{t}</span>)}</div>
  <Pool first fresh time="Hôm nay · 11:00" title="Giao cát xây · Đại Mỗ" sub="8,5 m³ · Công ty XD Bảo Long" km="3,2 km từ kho" pay="50.000 ₫ / chuyến"/>
  <Pool time="Hôm nay · 14:30" title="Giao xi măng · Từ Liêm" sub="60 bao (3.000 kg) · Anh Tuấn" km="7,4 km từ kho" pay="50.000 ₫ / chuyến"/>
  <Pool tag="Dịch vụ" time="Ngày mai · 08:00" title="Máy trộn bê tông · Cầu Giấy" sub="Khoảng 4 giờ · Cô Hoa" km="9,0 km từ kho" pay="120.000 ₫ / việc"/>
  <Note>Chạm vào thẻ để xem chi tiết trước khi nhận.<br/>Có việc mới, máy sẽ báo ngay.</Note>
 </WPhone>,390);

/* ═════════ 8. work-tracking ═════════ */
const Pulse=({c='#12804A',bg='#E5F4EC',icon})=><div style={{width:132,height:132,borderRadius:'50%',background:`radial-gradient(circle,${bg} 0 46%,transparent 47%)`,boxShadow:`0 0 0 14px ${c}1f,0 0 0 30px ${c}12`,display:'flex',alignItems:'center',justifyContent:'center',margin:'30px auto 36px',position:'relative'}}>
 <span style={{width:76,height:76,borderRadius:'50%',background:c,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 10px 22px -8px ${c}`}}>{icon}</span></div>;
const States=({cur})=>[['Chưa vào ca','Vị trí chưa được gửi. Vào ca là tự bắt đầu.','g',ClockIcon],['Đang chia sẻ','Gửi vị trí trong ca để điều phối biết xe đang ở đâu.','s',MapPinIcon],['Chưa cho phép vị trí','Cần bật quyền vị trí cho app (xem cách bật).','w',ExclamationTriangleIcon]].map(([t,d,k,Ic],i)=>
 <div key={t} className="w-row" style={i===cur?{background:'var(--card2)'}:undefined}><span className={'w-ico '+k}>{I(Ic)}</span><div style={{flex:1}}><b style={{fontSize:15.5}}>{t}</b><div className="w-sub" style={{fontSize:13.5,lineHeight:1.4}}>{d}</div></div>{i===cur&&<Ch k={k}>Hiện tại</Ch>}</div>);
def('work-tracking','/work/tracking','Status page (mobile)','Vị trí: chỉ hiện trạng thái (Chưa vào ca / Đang chia sẻ / Chưa cho phép / Máy không hỗ trợ); không có nút bấm khi đang lái.',()=>
 <WPhone back title="Vị trí" active={3} unread={2}>
  <div className="w-card w-pad" style={{textAlign:'center',paddingBottom:24}}>
   <Pulse c="#0B63C6" bg="#E6F0FB" icon={I(PinS,38)}/><Ch k="i" style={{height:28,fontSize:14.5,padding:'0 14px'}}>Đang chia sẻ</Ch>
   <h1 style={{fontSize:23,fontWeight:800,letterSpacing:-.4,margin:'12px 0 6px'}}>Vị trí của bạn đang được gửi</h1>
   <p className="w-sub" style={{fontSize:15,lineHeight:1.5}}>Cập nhật lần cuối lúc <b style={{color:'var(--tx)'}}>09:42</b>. Không cần bấm gì khi đang lái.</p></div>
  <div className="w-card">
   <div className="w-row"><span className="w-ico">{I(ClockIcon)}</span><div style={{flex:1}}><b>Ca sáng · 07:30 – 16:30</b><div className="w-sub" style={{fontSize:13.5}}>Còn lại 6 giờ 48 phút</div></div></div>
   <div className="w-row"><span className="w-ico g">{I(ShieldCheckIcon)}</span><div style={{flex:1}}><b>Hết ca là tự dừng</b><div className="w-sub" style={{fontSize:13.5}}>Ngoài ca, vị trí của bạn không được gửi.</div></div></div></div>
 </WPhone>,390);
def('work-tracking-denied','/work/tracking (chưa cho phép)','Status page (mobile)','Chưa cho phép vị trí: chấm cam trên thanh trên + cách bật 3 bước, nút "Kiểm tra lại".',()=>
 <WPhone back title="Vị trí" active={3} unread={2} pin="warn" foot={<div className="w-btn p lg">{I(ArrowPathIcon,22)}Kiểm tra lại</div>}>
  <div className="w-card w-pad" style={{textAlign:'center',paddingBottom:24}}>
   <Pulse c="#E8890C" bg="#FFF1D6" icon={I(ExclamationTriangleIcon,38)}/><Ch k="w" style={{height:28,fontSize:14.5,padding:'0 14px'}}>Chưa cho phép vị trí</Ch>
   <h1 style={{fontSize:23,fontWeight:800,letterSpacing:-.4,margin:'12px 0 6px'}}>App chưa được dùng vị trí</h1>
   <p className="w-sub" style={{fontSize:15,lineHeight:1.5}}>Điều phối chưa thấy xe của bạn. Bật quyền vị trí theo 3 bước dưới đây.</p></div>
  <div className="w-card w-pad"><h2 className="w-h2" style={{marginBottom:14}}>Cách bật</h2><div style={{display:'flex',flexDirection:'column',gap:16}}>
   {[['Mở Cài đặt của điện thoại','Tìm mục Ứng dụng, chọn Hiền Xa (hoặc trình duyệt bạn đang dùng).'],['Chọn Quyền → Vị trí','Đặt là "Cho phép khi dùng ứng dụng".'],['Quay lại đây và bấm Kiểm tra lại','Chấm cam trên thanh trên sẽ chuyển xanh.']].map(([a,b],i)=>
   <div key={a} style={{display:'flex',gap:12}}><span style={{width:30,height:30,borderRadius:'50%',background:'var(--acbg)',color:'var(--act)',fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{i+1}</span><div><b style={{fontSize:15.5}}>{a}</b><div className="w-sub" style={{fontSize:14,marginTop:2}}>{b}</div></div></div>)}</div></div>
 </WPhone>,390);

/* ═════════ 9. work-attendance ═════════ */
const Day=({d,w,io,h,chip,k,dim})=><div className="w-row" style={{opacity:dim?.7:1}}><div style={{width:46,height:50,borderRadius:12,background:'var(--card2)',border:'1px solid var(--bd)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flex:'none'}}><span style={{fontSize:12.5,color:'var(--sub)',fontWeight:600,lineHeight:1}}>{w}</span><b style={{fontSize:17,lineHeight:1.2}}>{d}</b></div>
 <div style={{flex:1}}><b className="w-num" style={{fontSize:15.5}}>{io}</b><div className="w-sub" style={{fontSize:13.5}}>{h}</div></div><Ch k={k}>{chip}</Ch></div>;
def('work-attendance','/work/attendance','Timesheet (mobile)','Chấm công: ca hôm nay, tổng kết tháng, lịch sử theo ngày với trạng thái chữ + màu.',()=>
 <WPhone title="Chấm công" active={3} unread={2}>
  <div className="w-card w-pad" style={{display:'flex',flexDirection:'column',gap:14}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div className="w-lbl">Hôm nay · Ca sáng</div><div className="w-num" style={{fontSize:30,fontWeight:800,letterSpacing:-.8,marginTop:2}}>07:28 <span style={{fontWeight:600,color:'var(--sub)',fontSize:17}}>vào ca</span></div></div><span className="w-ico s" style={{width:48,height:48,borderRadius:14}}>{I(ClockIcon,26)}</span></div>
   <div style={{display:'flex',gap:8,alignItems:'center',fontSize:14.5,color:'var(--okt)',fontWeight:600}}>{I(CheckS,16)}Đúng giờ · đã làm 2 giờ 14 phút</div>
   <div className="w-btn p lg">Ra ca</div></div>
  <div style={{display:'flex',gap:10}}>{[['Ngày công','14 / 17','var(--tx)'],['Vào trễ','1 lần','var(--wnt)'],['Nghỉ','1 ngày','var(--sub)']].map(([a,b,c])=>
   <div key={a} className="w-card" style={{flex:1,padding:'12px 10px',textAlign:'center'}}><div className="w-lbl">{a}</div><div style={{fontSize:20,fontWeight:800,color:c,marginTop:3}} className="w-num">{b}</div></div>)}</div>
  <h2 className="w-h2" style={{marginTop:4}}>Những ngày gần đây</h2>
  <div className="w-card"><Day w="T4" d="18" io="07:42 – 16:35" h="Vào trễ 12 phút" chip="Vào trễ" k="w"/><Day w="T3" d="17" io="07:25 – 16:40" h="9 giờ 15 phút" chip="Đủ công" k="s"/><Day w="T2" d="16" io="07:29 – 16:31" h="9 giờ 02 phút" chip="Đủ công" k="s"/><Day w="CN" d="15" io="Nghỉ" h="Không xếp ca" chip="Nghỉ" k="g" dim/><Day w="T7" d="14" io="07:30 – 12:00" h="Về sớm 4 giờ 30 phút" chip="Về sớm" k="w"/></div>
 </WPhone>,390);

/* ═════════ 10. work-earnings ═════════ */
const WD=({w,d,k})=>{const m={ok:['var(--ok)','#fff','none'],late:['var(--wnbg)','var(--wnt)','none'],now:['var(--ac)','#fff','none'],plan:['transparent','var(--sub)','2px dashed var(--bd2)'],off:['var(--card2)','var(--ph)','none']}[k];
 return <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:6}}><span style={{fontSize:13,fontWeight:700,color:k==='now'?'var(--act)':'var(--sub)'}}>{w}</span>
  <span style={{width:'100%',height:46,borderRadius:12,background:m[0],color:m[1],border:m[2],display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:15,
   boxShadow:k==='now'?'0 0 0 4px color-mix(in srgb,var(--ac) 25%,transparent)':'none',textDecoration:k==='late'?'underline':k==='off'?'line-through':'none',textUnderlineOffset:4}}>{k==='ok'?I(CheckS,20):d}</span></div>;};
def('work-earnings','/work/earnings','Earnings (mobile)','Thẻ tối Dự kiến nhận + 3 ô; Chấm công tuần T2–CN (xanh/vàng gạch chân/xanh dương/viền đứt/xám gạch ngang); Phiếu lương đã chốt; Các khoản tháng này.',()=>
 <WPhone title="Thu nhập" active={2} unread={2}>
  <div style={{padding:'0 2px'}}><div className="w-lbl">Tháng 11/2026 · tạm tính</div><h1 style={{fontSize:25,fontWeight:800,letterSpacing:-.5,marginTop:2}}>Thu nhập của tôi</h1></div>
  <div style={{borderRadius:20,padding:'20px 18px 18px',color:'#fff',position:'relative',overflow:'hidden',background:'radial-gradient(110% 80% at 100% 0%,rgba(73,150,235,.32),transparent 60%),linear-gradient(160deg,#16294A,#0B1A33 70%)',boxShadow:'0 20px 34px -18px rgba(8,22,48,.9)',border:'1px solid rgba(125,180,245,.16)'}}>
   <div style={{fontSize:14,fontWeight:600,opacity:.78}}>Dự kiến nhận</div>
   <div className="w-num" style={{fontSize:38,fontWeight:800,letterSpacing:-1.2,margin:'4px 0 2px'}}>12.480.000 <span style={{fontSize:24,opacity:.8}}>₫</span></div>
   <div style={{fontSize:13.5,opacity:.7}}>Tính đến 19/11 · khoản chờ xác minh chưa gồm</div>
   <div style={{display:'flex',marginTop:18,paddingTop:14,borderTop:'1px solid rgba(255,255,255,.14)'}}>{[['Lương ngày công','8.400.000'],['38 chuyến','1.900.000'],['Thưởng / khác','2.180.000']].map(([a,b],i)=>
    <div key={a} style={{flex:1,paddingLeft:i?12:0,borderLeft:i?'1px solid rgba(255,255,255,.14)':'none'}}><div style={{fontSize:12.5,opacity:.7,lineHeight:1.25,minHeight:32}}>{a}</div><b className="w-num" style={{fontSize:15.5}}>{b}</b></div>)}</div></div>
  <div className="w-card w-pad"><div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}><h2 className="w-h2">Chấm công tuần này</h2><b className="w-num" style={{color:'var(--okt)'}}>3 / 5 ngày</b></div>
   <div style={{display:'flex',gap:6}}><WD w="T2" k="ok"/><WD w="T3" k="ok"/><WD w="T4" d="18" k="late"/><WD w="T5" d="19" k="now"/><WD w="T6" d="20" k="plan"/><WD w="T7" d="21" k="plan"/><WD w="CN" d="22" k="off"/></div>
   <div style={{marginTop:14,padding:'9px 12px',borderRadius:10,background:'var(--wnbg)',color:'var(--wnt)',fontSize:14,fontWeight:600}}>Thứ Tư 18/11: vào trễ 12 phút</div>
   <div className="w-sub" style={{fontSize:13,marginTop:10,lineHeight:1.5}}>✓ đủ công · gạch chân: trễ / về sớm · viền đứt: ca đã xếp · gạch ngang: nghỉ</div></div>
  <div><h2 className="w-h2" style={{margin:'4px 0 10px'}}>Phiếu lương đã chốt</h2><div className="w-card">
   {[['Kỳ 10/2026','11.350.000 ₫','Đã chi trả','s'],['Kỳ 09/2026','Còn 2.000.000 ₫ chưa chi','Chờ chi trả','w']].map(([a,b,c,k])=><div key={a} className="w-row"><span className="w-ico g">{I(BanknotesIcon)}</span><div style={{flex:1,minWidth:0}}><b style={{whiteSpace:'nowrap'}}>{a}</b><div className="w-num" style={{fontSize:13.5,marginTop:1,color:'var(--sub)'}}>{b}</div></div><div style={{display:'flex',alignItems:'center',gap:4}}><Ch k={k}>{c}</Ch><span style={{color:'var(--sub)',display:'flex'}}>{I(ChevronRightIcon,18)}</span></div></div>)}</div></div>
  <div><h2 className="w-h2" style={{margin:'4px 0 10px'}}>Các khoản tháng này</h2><div className="w-card">
   {[['19/11','Tiền chuyến · PG-0412','+ 50.000 ₫'],['18/11','Tiền chuyến · PG-0409','+ 50.000 ₫'],['17/11','Dịch vụ · DV-0044','+ 120.000 ₫'],['15/11','Thưởng chuyên cần','+ 500.000 ₫']].map(([d,t,v])=>
    <div key={t} className="w-row" style={{minHeight:54}}><span className="w-sub w-num" style={{width:44,fontWeight:600}}>{d}</span><span style={{flex:1}}>{t}</span><b className="w-num" style={{color:'var(--okt)'}}>{v}</b></div>)}</div></div>
 </WPhone>,390);

/* ═════════ 11. work-messages ═════════ */
const Con=({a,c,n,m,t,u})=><div className="w-row" style={{minHeight:68}}><span className="w-av" style={{width:48,height:48,fontSize:19,background:c}}>{a}</span><div style={{flex:1,minWidth:0}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><b style={{fontSize:15.5}}>{n}</b><span className="w-sub" style={{fontSize:13}}>{t}</span></div>
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><span className="w-sub" style={{fontSize:14,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:u?'var(--tx)':undefined,fontWeight:u?600:400}}>{m}</span>{u&&<span style={{minWidth:22,height:22,borderRadius:11,background:'var(--ac)',color:'#fff',fontSize:12.5,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 6px'}}>{u}</span>}</div></div></div>;
def('work-messages','/work/messages','Inbox (mobile)','Điện thoại một cột: danh bạ (ảnh chữ cái, tin cuối, giờ, chấm số chưa đọc); ô "Tìm người…" ở dưới cùng.',()=>
 <WPhone title="Tin nhắn" active={3} unread={2}>
  <div className="w-in" style={{borderRadius:26,gap:10,color:'var(--ph)'}}>{I(MagnifyingGlassIcon,22)}Tìm người…</div>
  <div className="w-card">
   <Con a="L" c="linear-gradient(145deg,#B05CC8,#7A2FA0)" n="Cô Lan · Quản lý" m="Mai giao sớm giúp chị nhé, khách hẹn 7 giờ" t="10:42" u={2}/>
   <Con a="K" c="linear-gradient(145deg,#2F9E6B,#126B45)" n="Kho Đại Mỗ" m="Đã bàn giao hàng lên xe PG-0412" t="09:05"/>
   <Con a="H" c="linear-gradient(145deg,#E58A2D,#B45F0B)" n="Anh Hải · Thợ chính" m="Em đang tới chỗ cô Hoa" t="08:51"/>
   <Con a="Đ" c="linear-gradient(145deg,#2F7FD8,#0B4F9E)" n="Điều phối" m="PG-0415 đã giao cho Anh Hải" t="Hôm qua"/>
   <Con a="Q" c="linear-gradient(145deg,#6B7F99,#3D4F68)" n="Anh Quân · Tài xế" m="Ok anh" t="17/11"/></div>
 </WPhone>,390);
const Bub=({me,children,t})=><div style={{alignSelf:me?'flex-end':'flex-start',maxWidth:'78%'}}><div style={{padding:'10px 14px',borderRadius:me?'18px 18px 4px 18px':'18px 18px 18px 4px',background:me?'var(--ac)':'var(--card)',color:me?'#fff':'var(--tx)',border:me?'none':'1px solid var(--bd)',fontSize:16,lineHeight:1.4,boxShadow:me?'0 6px 12px -8px rgba(11,99,198,.7)':'var(--sh)'}}>{children}</div><div className="w-sub" style={{fontSize:13,marginTop:3,textAlign:me?'right':'left'}}>{t}</div></div>;
def('work-messages-chat','/work/messages (khung chat)','Chat (mobile)','Khung chat Messenger: bong bóng của mình bên phải nền xanh, người kia bên trái; ô nhập bo tròn + Gửi.',()=>
 <WPhone back title="Cô Lan" active={3} foot={<div style={{display:'flex',gap:8}}><div className="w-in" style={{flex:1,borderRadius:26,color:'var(--ph)'}}>Nhập tin nhắn…</div><div className="w-btn p" style={{width:52,padding:0,borderRadius:26}}>{I(PaperAirplaneIcon,22)}</div></div>}>
  <div style={{display:'flex',flexDirection:'column',gap:14,flex:1}}><div style={{textAlign:'center',fontSize:13,color:'var(--sub)',fontWeight:600}}>Hôm nay</div>
   <Bub t="09:10">Dũng ơi, chuyến cát của Bảo Long xong chưa em?</Bub><Bub me t="09:12">Dạ em đang trên đường, 9 giờ 30 tới ạ.</Bub><Bub t="10:42">Mai giao sớm giúp chị nhé, khách hẹn 7 giờ.</Bub><Bub me t="10:44">Dạ em báo lại chị nha.</Bub></div>
 </WPhone>,390);

/* ═════════ 12. work-profile ═════════ */
const Menu=({Ic,t,right,k})=><div className="w-row"><span className={'w-ico '+(k||'')}>{I(Ic)}</span><b style={{flex:1,fontSize:16,fontWeight:600}}>{t}</b>{right}<span style={{color:'var(--sub)',display:'flex'}}>{I(ChevronRightIcon,20)}</span></div>;
const Seg3=({a,on})=><div className="w-seg" style={{marginTop:8}}>{a.map(([t,Ic],i)=><div key={t} className={i===on?'on':''} style={{fontSize:14.5}}>{Ic&&I(Ic,18)}{t}</div>)}</div>;
def('work-profile','/work/profile','Profile (mobile)','Tôi: Chấm công, Chia sẻ vị trí, Tin nhắn, Đổi mật khẩu, Giao diện (Sáng/Tối/Theo thiết bị + Cỡ chữ, D84), Đăng xuất.',()=>
 <WPhone title="Tôi" active={3} unread={2}>
  <div className="w-card" style={{padding:'20px 16px',display:'flex',alignItems:'center',gap:16}}>
   <span style={{padding:4,borderRadius:'50%',background:'conic-gradient(#12804A,#0B63C6,#12804A)',display:'flex'}}><Av t="D" s={64} style={{border:'3px solid var(--card)',boxSizing:'content-box'}}/></span>
   <div style={{flex:1}}><h1 style={{fontSize:21,fontWeight:800,letterSpacing:-.3}}>Nguyễn Văn Dũng</h1><div className="w-sub" style={{marginTop:2}}>Thợ chính · Chi nhánh Hà Đông</div><div style={{marginTop:7}}><Ch k="i">Đang trong ca · từ 07:28</Ch></div></div></div>
  <div className="w-card"><Menu Ic={ClockIcon} t="Chấm công"/><Menu Ic={MapPinIcon} t="Chia sẻ vị trí" k="s" right={<Ch k="s">Đang chia sẻ</Ch>}/><Menu Ic={EnvelopeIcon} t="Tin nhắn" right={<span style={{minWidth:24,height:24,borderRadius:12,background:'var(--ac)',color:'#fff',fontSize:13,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>2</span>}/><Menu Ic={KeyIcon} t="Đổi mật khẩu" k="g"/></div>
  <div className="w-card"><Menu Ic={SunIcon} t="Giao diện" right={<span className="w-sub" style={{fontSize:13.5}}>Sáng · Classic · Vừa</span>}/></div>
  <div className="w-btn d">{I(ArrowRightOnRectangleIcon)}Đăng xuất</div>
  <Note style={{fontSize:13}}>Hiền Xa ERP · phiên bản 2026.11</Note>
 </WPhone>,390);

/* ═════════ Trang công khai ═════════ */
function Frame({w,h,children,top=96,band=300,cw=480,nologo}){
 return <div className="pg" style={{width:w,minHeight:h,background:'#F2F5F9',position:'relative',overflow:'hidden'}}><Css/>
  <div style={{height:band,background:'linear-gradient(165deg,#1273DE 0%,#0B63C6 55%,#0A4A98 100%)',position:'absolute',left:0,right:0,top:0,overflow:'hidden'}}>
   <div style={{position:'absolute',right:'8%',top:-80,width:340,height:340,borderRadius:'50%',boxShadow:'0 0 0 40px rgba(255,255,255,.045),0 0 0 90px rgba(255,255,255,.03)'}}/>
   <div style={{position:'absolute',left:'-4%',bottom:-120,width:300,height:300,borderRadius:'50%',boxShadow:'0 0 0 36px rgba(255,255,255,.04)'}}/></div>
  <div style={{position:'relative',height:64,display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{display:'flex',alignItems:'center',gap:10,color:'#fff'}}>{!nologo&&<Logo s={32} r={9}/>}<b style={{fontSize:16.5,letterSpacing:-.1}}>Hiền Xa ERP</b><span style={{opacity:.6}}>·</span><span style={{fontSize:14,opacity:.9}}>Hệ thống nội bộ</span></div></div>
  <div className="wp" style={{position:'relative',width:Math.min(cw,w-32),margin:`${top-64}px auto 0`,paddingBottom:40,background:'none'}}>{children}</div></div>;}
const SoftCard=({children,pad=32})=><div className="w-card" style={{padding:pad,borderRadius:20,boxShadow:'0 24px 48px -20px rgba(10,40,90,.35),0 2px 6px rgba(10,40,90,.08)'}}>{children}</div>;
const Fld=({l,v,ph,foc,right})=><div style={{display:'flex',flexDirection:'column',gap:6}}><span className="w-lbl">{l}</span><div className={'w-in'+(ph?' ph':'')+(foc?' foc':'')} style={{justifyContent:'space-between'}}><span>{v||ph}</span>{right}</div></div>;

def('public-login','/login','Login','Thẻ đơn 480px giữa màn trên dải xanh, logo công ty thay chữ HX (D49), tab Vận hành / Thợ & tài xế / Khách hàng, không khối giới thiệu (D30).',()=>
 <Frame w={1280} h={760} top={120} nologo>
  <div style={{display:'flex',justifyContent:'center',marginBottom:-34,position:'relative',zIndex:2}}><div style={{padding:6,borderRadius:26,background:'#fff',boxShadow:'0 10px 24px -10px rgba(10,40,90,.5)'}}><Logo s={64} r={20}/></div></div>
  <div style={{paddingTop:34}}><LoginCard tab={0} w={480}/></div>
  <Note style={{marginTop:20}}>Máy này nhớ cổng bạn dùng lần trước.<br/>Quên tài khoản: hỏi quản lý cửa hàng.</Note></Frame>,1280);

def('public-recovery','/recovery','Auth form','Khôi phục mật khẩu: một ô, một nút; thông báo không tiết lộ tài khoản có tồn tại; quay lại đăng nhập.',()=>
 <Frame w={640} h={660} top={112}><SoftCard>
  <span className="w-ico" style={{width:52,height:52,borderRadius:16,marginBottom:16}}>{I(LockClosedIcon,28)}</span>
  <h1 style={{fontSize:25,fontWeight:800,letterSpacing:-.4}}>Khôi phục mật khẩu</h1>
  <p className="w-sub" style={{fontSize:15,margin:'6px 0 20px',lineHeight:1.5}}>Nhập tên đăng nhập hoặc email của tài khoản. Nếu có tài khoản, chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu.</p>
  <div style={{display:'flex',flexDirection:'column',gap:16}}><Fld l="Tên đăng nhập hoặc email" v="dung.tho" foc/><div className="w-btn p lg">Gửi hướng dẫn</div></div>
  <div style={{margin:'18px 0 0',padding:'12px 14px',borderRadius:12,background:'var(--acbg)',fontSize:14,lineHeight:1.5,color:'var(--tx)'}}><b>Không có email?</b> Hỏi quản lý cửa hàng để được đặt lại mật khẩu cho bạn.</div>
  <div style={{textAlign:'center',marginTop:18,color:'var(--act)',fontWeight:700,fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>{I(ChevronLeftIcon,18)}Về màn đăng nhập</div>
 </SoftCard></Frame>,640);

const Br=({n,a,d,on})=><div style={{display:'flex',alignItems:'center',gap:14,padding:'14px 16px',borderRadius:14,border:on?'2px solid var(--ac)':'1.5px solid var(--bd2)',background:on?'var(--acbg)':'var(--card)',boxShadow:on?'0 0 0 4px color-mix(in srgb,var(--ac) 14%,transparent)':'none'}}>
 <span className="w-ico" style={{width:46,height:46,borderRadius:14,background:on?'var(--ac)':'var(--card2)',color:on?'#fff':'var(--sub)'}}>{I(BuildingStorefrontIcon,24)}</span>
 <div style={{flex:1}}><b style={{fontSize:16.5}}>{n}</b><div className="w-sub" style={{fontSize:14}}>{a}</div><div className="w-sub" style={{fontSize:13.5}}>{d}</div></div>
 <span style={{width:24,height:24,borderRadius:'50%',border:on?'7px solid var(--ac)':'2px solid var(--bd2)',background:'#fff',flex:'none'}}/></div>;
def('public-select-branch','/select-branch','Auth chooser','Chọn chi nhánh làm việc: danh sách thẻ chọn một, ghi nhớ trên máy; chỉ hiện khi tài khoản có từ 2 chi nhánh.',()=>
 <Frame w={640} h={720} top={112}><SoftCard>
  <h1 style={{fontSize:25,fontWeight:800,letterSpacing:-.4}}>Chọn chi nhánh</h1>
  <p className="w-sub" style={{fontSize:15,margin:'6px 0 20px',lineHeight:1.5}}>Xin chào <b style={{color:'var(--tx)'}}>Cô Lan</b>. Bạn làm việc ở nhiều chi nhánh, hãy chọn nơi bạn muốn vào lúc này.</p>
  <div style={{display:'flex',flexDirection:'column',gap:12}}><Br on n="Chi nhánh Hà Đông" a="Số 5 Quang Trung, Hà Đông" d="Kho Hà Đông · Kho Đại Mỗ"/><Br n="Chi nhánh Cầu Giấy" a="Số 88 Trần Thái Tông, Cầu Giấy" d="Kho Cầu Giấy"/></div>
  <div style={{display:'flex',alignItems:'center',gap:10,margin:'18px 0',fontSize:15}}><span style={{width:22,height:22,borderRadius:7,background:'var(--ac)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>{I(CheckS,14)}</span>Nhớ lựa chọn trên máy này</div>
  <div className="w-btn p lg">Vào Chi nhánh Hà Đông</div></SoftCard></Frame>,640);

/* tai-ve (điện thoại) */
const Stp=({i,t,d,fig})=><div style={{display:'flex',gap:12,alignItems:'flex-start'}}><span style={{width:30,height:30,borderRadius:'50%',background:'var(--acbg)',color:'var(--act)',fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{i}</span><div style={{flex:1}}><b style={{fontSize:15.5}}>{t}</b>{d&&<div className="w-sub" style={{fontSize:14,marginTop:2,lineHeight:1.45}}>{d}</div>}{fig}</div></div>;
def('public-tai-ve','/tai-ve','Install guide (mobile)','Trang công khai gửi qua Zalo: nhận ra máy Android / iPhone và chỉ hiện các bước đúng máy; chép link; nền sáng.',()=>
 <div className="pg wp" style={{width:390,minHeight:900,background:'#F2F5F9',position:'relative',overflow:'hidden'}}><Css/>
  <div style={{height:200,background:'linear-gradient(165deg,#1273DE,#0B63C6 55%,#0A4A98)',position:'absolute',left:0,right:0,top:0}}><div style={{position:'absolute',right:-60,top:-40,width:240,height:240,borderRadius:'50%',boxShadow:'0 0 0 28px rgba(255,255,255,.05),0 0 0 60px rgba(255,255,255,.03)'}}/></div>
  <div style={{position:'relative',height:56,display:'flex',alignItems:'center',justifyContent:'center',gap:10,color:'#fff'}}><Logo s={28} r={8}/><b style={{fontSize:16}}>Hiền Xa ERP</b><span style={{opacity:.6}}>·</span><span style={{fontSize:13.5,opacity:.9}}>Tải app cho điện thoại</span></div>
  <div style={{position:'relative',padding:'8px 16px 32px',display:'flex',flexDirection:'column',gap:14}}>
   <div className="w-card" style={{padding:20,borderRadius:20,boxShadow:'0 24px 48px -20px rgba(10,40,90,.35)'}}>
    <div style={{display:'flex',gap:14,alignItems:'center'}}><Logo s={64} r={18}/><div><h1 style={{fontSize:22,fontWeight:800,letterSpacing:-.4}}>Cài app Hiền Xa</h1><p className="w-sub" style={{fontSize:14,marginTop:2,lineHeight:1.4}}>Cài lên màn hình chính, mở nhanh như app thường.</p></div></div>
    <div style={{marginTop:16,padding:'10px 12px',borderRadius:12,background:'var(--acbg)',fontSize:14,lineHeight:1.45,color:'var(--tx)'}}>Một app cho <b>thợ, tài xế, khách hàng và nhân viên</b>. Mở lên, chọn đúng cổng của bạn rồi đăng nhập.</div></div>
   <div className="w-card w-pad" style={{display:'flex',flexDirection:'column',gap:16}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><h2 style={{fontSize:18,fontWeight:700}}>Điện thoại Android</h2><Ch k="s">Máy của bạn</Ch></div>
    <div className="w-btn p lg">{I(ArrowDownTrayIcon,24)}Tải app Android</div>
    <Stp i={1} t="Mở file vừa tải" d="Thanh thông báo hoặc mục Tải xuống của điện thoại."/>
    <Stp i={2} t="Cho phép cài từ nguồn này" d='Nếu máy hỏi, bấm "Cài đặt" rồi bật "Cho phép từ nguồn này".'/>
    <Stp i={3} t="Mở app Hiền Xa" d="Biểu tượng nằm ở màn hình chính. Mở lên là vào đăng nhập." fig={<div style={{marginTop:10,display:'inline-flex',alignItems:'center',gap:10,padding:'8px 14px 8px 8px',borderRadius:16,background:'var(--card2)',border:'1px solid var(--bd)'}}><Logo s={40} r={12}/><b style={{fontSize:14}}>Hiền Xa</b></div>}/></div>
   <div className="w-card" style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',minHeight:60}}><span className="w-ico g">{I(DevicePhoneMobileIcon)}</span><b style={{flex:1,fontSize:15.5}}>Xem cách cài cho iPhone</b><span style={{color:'var(--sub)',display:'flex',transform:'rotate(90deg)'}}>{I(ChevronRightIcon,20)}</span></div>
   <div className="w-btn o" style={{gap:10}}>{I(LinkIcon)}Chép link để gửi qua Zalo</div>
   <div style={{textAlign:'center',color:'var(--act)',fontWeight:700,fontSize:15,padding:'6px 0'}}>← Về màn đăng nhập</div></div></div>,390);

/* not-found / error */
const Crate=({err})=><svg width="200" height="140" viewBox="0 0 200 140" aria-hidden style={{display:'block',margin:'0 auto'}}><ellipse cx="100" cy="124" rx="70" ry="7" fill="#10223A" opacity=".08"/>
 {err?<g><path d="M52 98a26 26 0 0 1 4-51 36 36 0 0 1 69-6 30 30 0 0 1 21 57z" fill="#FFF1D6" stroke="#E8890C" strokeWidth="3" strokeLinejoin="round"/>
   <path d="M100 56v22" stroke="#7A4300" strokeWidth="5" strokeLinecap="round"/><circle cx="100" cy="90" r="3.6" fill="#7A4300"/><path d="M58 112h84" stroke="#E8890C" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" opacity=".7"/></g>
  :<g><g fill="#CFE2F8" stroke="#0B63C6" strokeWidth="2.5" strokeLinejoin="round"><rect x="38" y="86" width="124" height="14" rx="3"/><rect x="38" y="104" width="124" height="14" rx="3"/><rect x="48" y="100" width="16" height="4"/><rect x="92" y="100" width="16" height="4"/><rect x="136" y="100" width="16" height="4"/></g>
   <circle cx="100" cy="48" r="26" fill="#E6F0FB" stroke="#0B63C6" strokeWidth="2.5"/><path d="M91 43a9 9 0 1 1 13 8c-3 2-4 4-4 8" fill="none" stroke="#0B63C6" strokeWidth="4" strokeLinecap="round"/><circle cx="100" cy="68" r="0.1" stroke="#0B63C6" strokeWidth="6" strokeLinecap="round"/></g>}</svg>;
const Center=({children,h=520})=><div className="pg wp" style={{width:640,height:h,background:'#F2F5F9',display:'flex',alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden'}}><Css/>
 <div style={{position:'absolute',left:-80,top:-80,width:280,height:280,borderRadius:'50%',boxShadow:'0 0 0 30px rgba(11,99,198,.05),0 0 0 70px rgba(11,99,198,.03)'}}/>
 <div style={{textAlign:'center',maxWidth:440,position:'relative'}}>{children}</div></div>;
def('public-not-found','/404','Empty state','Không tìm thấy trang: giải thích ngắn, một lối về trang chủ; không hiện mã kỹ thuật.',()=>
 <Center><Crate/><div style={{fontSize:13.5,fontWeight:700,color:'var(--act)',letterSpacing:.4,margin:'8px 0 4px'}}>Không tìm thấy</div>
  <h1 style={{fontSize:28,fontWeight:800,letterSpacing:-.6}}>Trang này không còn ở đây</h1>
  <p className="w-sub" style={{fontSize:15.5,lineHeight:1.55,margin:'10px 0 24px'}}>Đường dẫn có thể đã đổi, hoặc bạn chưa được xem trang này. Thử quay lại hoặc về trang chủ.</p>
  <div style={{display:'flex',gap:10,justifyContent:'center'}}><div className="w-btn o" style={{width:150}}>Quay lại</div><div className="w-btn p" style={{width:190}}>Về trang chủ</div></div><p className="w-sub" style={{fontSize:13.5,marginTop:18}}>Thợ & tài xế về mục Hôm nay · khách hàng về Trang chủ.</p></Center>,640);
def('public-error','/error','Error state','Có lỗi: cho biết dữ liệu không mất, nút "Thử lại" rõ, lối về trang chủ; không hiện stack hay mã lỗi.',()=>
 <Center h={560}><Crate err/><div style={{fontSize:13.5,fontWeight:700,color:'var(--wnt)',letterSpacing:.4,margin:'8px 0 4px'}}>Chưa tải được</div>
  <h1 style={{fontSize:28,fontWeight:800,letterSpacing:-.6}}>Có trục trặc nhỏ</h1>
  <p className="w-sub" style={{fontSize:15.5,lineHeight:1.55,margin:'10px 0 20px'}}>Trang chưa mở được lúc này. Dữ liệu của bạn vẫn an toàn, chưa có gì bị ghi hai lần.</p>
  <div style={{display:'flex',gap:10,justifyContent:'center'}}><div className="w-btn p" style={{width:170}}>{I(ArrowPathIcon)}Thử lại</div><div className="w-btn o" style={{width:190}}>Về trang chủ</div></div>
  <p className="w-sub" style={{fontSize:13.5,marginTop:20}}>Nếu vẫn lỗi, báo quản lý cửa hàng.</p></Center>,640);

const Sk=({w,h=14,style,d})=><div className={'sk'+(d?' d':'')} style={{width:w,height:h,...style}}/>;
def('public-loading','/loading','Skeleton','Thanh tiến trình 3px màu chính trên cùng (~62%, ánh xanh); skeleton đúng dạng màn Danh sách: khung lọc trái + bảng 8 dòng, độ dài thanh khác nhau.',()=>
 <div role="status" aria-label="Đang tải" style={{position:'relative',width:1280}}><Css/><span style={{position:'absolute',width:1,height:1,overflow:'hidden',clip:'rect(0 0 0 0)'}}>Đang tải…</span>
  <div style={{position:'absolute',left:0,top:0,height:3,width:'62%',zIndex:9,background:'linear-gradient(90deg,#0B63C6,#4A9BF0)',borderRadius:'0 3px 3px 0',boxShadow:'0 0 10px 1px rgba(11,99,198,.6),0 0 3px #4A9BF0'}}/>
  <Shell group="Bán hàng" page="Đơn bán">
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}><div><Sk w={120} h={13} style={{marginBottom:10}}/><Sk w={210} h={28}/></div><div style={{display:'flex',gap:8}}><Sk w={120} h={40} style={{borderRadius:8}}/><Sk w={140} h={40} style={{borderRadius:8}}/></div></div>
   <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
    <div style={{width:240,display:'flex',flexDirection:'column',gap:14,flex:'none'}}>
     <div className="hx-card hx-pad"><Sk w="100%" h={40} style={{borderRadius:8}}/></div>
     <div className="hx-card hx-pad" style={{display:'flex',flexDirection:'column',gap:16}}><Sk w={70} h={12}/>{[130,100,150,90,120,110].map((w,i)=><div key={i} style={{display:'flex',gap:10,alignItems:'center'}}><Sk w={16} h={16} style={{borderRadius:'50%'}}/><Sk w={w} h={14}/><span style={{flex:1}}/><Sk w={22} h={12}/></div>)}</div></div>
    <div className="hx-card" style={{flex:1,overflow:'hidden'}}>
     <div style={{padding:'12px 16px',background:'#F1F4F8',display:'grid',gridTemplateColumns:'110px 1.6fr 1fr 150px 1fr',gap:20}}>{[60,140,90,80,70].map((w,i)=><Sk key={i} w={w} h={12} d/>)}</div>
     {[[80,210,100,110,90],[80,170,100,90,100],[80,250,100,120,80],[80,190,100,100,110],[80,230,100,90,90],[80,160,100,110,100],[80,220,100,100,80],[80,180,100,120,110]].map((r,i)=><div key={i} style={{padding:'17px 16px',borderTop:'1px solid #E3E9F1',display:'grid',gridTemplateColumns:'110px 1.6fr 1fr 150px 1fr',gap:20,alignItems:'center',opacity:1-i*.06}}>
      {r.map((w,j)=><Sk key={j} w={w*(j===1?.62:.6)} h={j===3?24:14} style={j===3?{borderRadius:99}:undefined}/>)}</div>)}</div></div>
  </Shell></div>,1280);


/* ═════════ Giao diện (theme) ═════════ */
const MiniPhone=({v})=>{const nw=v==='new';
 return <div style={{width:118,height:204,borderRadius:20,border:'4px solid #1B2B44',background:nw?'#EDF1F7':'#F2F5F9',overflow:'hidden',display:'flex',flexDirection:'column',flex:'none',boxShadow:'0 8px 16px -8px rgba(16,34,58,.4)'}}>
  {nw?<div style={{height:28,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 8px'}}><span style={{width:36,height:7,borderRadius:4,background:'#10223A'}}/><span style={{display:'flex',gap:3}}><i style={{width:11,height:11,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 2px rgba(0,0,0,.2)'}}/><i style={{width:11,height:11,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 2px rgba(0,0,0,.2)'}}/></span></div>
   :<div style={{height:22,background:'#0B63C6',display:'flex',alignItems:'center',padding:'0 8px',gap:4}}><i style={{width:9,height:9,borderRadius:3,background:'#fff'}}/><span style={{width:30,height:5,borderRadius:3,background:'rgba(255,255,255,.85)'}}/></div>}
  <div style={{flex:1,padding:7,display:'flex',flexDirection:'column',gap:6}}>
   <div style={{height:54,borderRadius:nw?14:7,padding:7,background:nw?'linear-gradient(165deg,#12335F,#0A1D38)':'linear-gradient(155deg,#1273DE,#0A4A98)',display:'flex',flexDirection:'column',gap:4}}>
    <span style={{width:'55%',height:6,borderRadius:3,background:'#fff'}}/><span style={{width:'80%',height:4,borderRadius:2,background:'rgba(255,255,255,.55)'}}/>
    <span style={{display:'flex',gap:3,marginTop:'auto'}}>{[0,1,2,3].map(i=><i key={i} style={{flex:1,height:5,borderRadius:3,background:i<2?'#fff':'rgba(255,255,255,.3)'}}/>)}</span></div>
   {[0,1].map(i=><div key={i} style={{height:30,borderRadius:nw?12:6,background:'#fff',border:nw?'0':'1px solid #D5DDE8',boxShadow:nw?'0 4px 8px -4px rgba(16,34,58,.25)':'none',padding:6,display:'flex',flexDirection:'column',gap:4}}><span style={{width:'60%',height:5,borderRadius:3,background:'#10223A',opacity:.8}}/><span style={{width:'85%',height:4,borderRadius:2,background:'#B5C0D0'}}/></div>)}
   <span style={{height:12,borderRadius:nw?99:6,background:nw?'#0B63C6':'#12804A'}}/></div>
  {nw?<div style={{height:26,margin:'0 7px 7px',borderRadius:13,background:'#10223A',display:'flex',alignItems:'center',justifyContent:'space-around',padding:'0 4px'}}><i style={{width:26,height:18,borderRadius:9,background:'#0B63C6'}}/>{[0,1,2].map(i=><i key={i} style={{width:10,height:10,borderRadius:4,background:'#AFC0D8'}}/>)}</div>
   :<div style={{height:24,background:'#fff',borderTop:'1px solid #D5DDE8',display:'flex',justifyContent:'space-around',alignItems:'center',position:'relative'}}><i style={{position:'absolute',top:-1,left:6,width:22,height:3,background:'#0B63C6'}}/>{[0,1,2,3].map(i=><i key={i} style={{width:10,height:10,borderRadius:3,background:i?'#B5C0D0':'#0B63C6'}}/>)}</div>}
 </div>;};
const ThemeCard=({v,on,t,chip,ck,d})=><div style={{display:'flex',gap:16,padding:14,borderRadius:20,border:on?'2px solid var(--ac)':'1.5px solid var(--bd2)',background:on?'var(--acbg)':'var(--card)',boxShadow:on?'0 0 0 4px color-mix(in srgb,var(--ac) 14%,transparent)':'none'}}>
 <MiniPhone v={v}/>
 <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:8}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><b style={{fontSize:19,letterSpacing:-.2}}>{t}</b><span style={{width:26,height:26,borderRadius:'50%',flex:'none',border:on?'8px solid var(--ac)':'2px solid var(--bd2)',background:'#fff'}}/></div>
  <div><Ch k={ck}>{chip}</Ch></div>
  <p className="w-sub" style={{fontSize:14.5,lineHeight:1.5,color:'var(--tx)',opacity:.85}}>{d}</p>
  <div style={{marginTop:'auto',fontWeight:700,fontSize:14,color:on?'var(--okt)':'var(--sub)',display:'flex',alignItems:'center',gap:5}}>{on?<>{I(CheckS,15)}Đang dùng</>:'Chạm để dùng'}</div></div></div>;
function ThemeScreen({dark,theme}){const nw=theme==='new';
 return <WPhone back title="Giao diện" dark={dark} theme={theme} active={3} unread={2}>
  <div className="w-card" style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',background:'var(--okbg)',borderColor:'transparent',boxShadow:'none',color:'var(--okt)',fontWeight:600,fontSize:14.5}}>{I(CheckCircleIcon,22)}Chọn xong là áp dụng ngay. Chỉ lưu trên điện thoại này.</div>
  <div className="w-card w-pad"><h2 className="w-h2">Chế độ màu</h2><p className="w-sub" style={{fontSize:13.5,margin:'2px 0 10px'}}>Sáng, tối hoặc theo cài đặt của điện thoại.</p>
   <div className="w-seg big">{[['Sáng',SunIcon],['Tối',MoonIcon],['Tự động',DevicePhoneMobileIcon]].map(([t,Ic],i)=><div key={t} className={i===(dark?1:0)?'on':''}>{I(Ic,19)}{t}</div>)}</div></div>
  <div className="w-card w-pad"><h2 className="w-h2">Kiểu giao diện</h2><p className="w-sub" style={{fontSize:13.5,margin:'2px 0 12px'}}>Đổi cách trình bày, không đổi chức năng.</p>
   <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <ThemeCard v="classic" on={!nw} t="Classic" chip="Mặc định" ck="g" d="Thanh trên xanh, thẻ viền mảnh, menu dưới phẳng. Giao diện quen thuộc đang dùng."/>
    <ThemeCard v="new" on={nw} t="Mới" chip="Mới" ck="i" d="Nền nhẹ, thẻ bo tròn lớn không viền, nút tròn và thanh menu nổi. Gọn mắt, dễ chạm."/></div></div>
  <div className="w-card w-pad"><h2 className="w-h2">Cỡ chữ</h2>
   <div className="w-seg big" style={{marginTop:10,alignItems:'center'}}>{[['Nhỏ',14],['Vừa',17],['Lớn',21]].map(([t,f],i)=><div key={t} className={i===1?'on':''} style={{fontSize:f}}>{t}</div>)}</div></div>
  <div className="w-btn o">Đặt lại về mặc định</div>
 </WPhone>;}
def('work-profile-theme','/work/profile/appearance','Settings (mobile)','Giao diện: Chế độ màu Sáng/Tối/Tự động (D84), Kiểu giao diện Classic (mặc định) / Mới với hai thẻ xem trước khác rõ, Cỡ chữ; áp ngay, lưu theo thiết bị; nút 52px.',()=><ThemeScreen/>,390);
def('work-profile-theme-new','/work/profile/appearance (đã chọn Mới + Tối)','Settings (mobile)','Sau khi chọn Mới + Tối: chính màn này đã đổi theo ngay.',()=><ThemeScreen dark theme="new"/>,390);
def('work-home-new','/work (giao diện Mới)','Home (mobile)','Hôm nay ở giao diện Mới: thanh trên nhẹ, thẻ bo lớn, nút tròn, menu nổi.',()=><Home theme="new"/>,390);

/* ═════════ Bản máy tính / máy tính bảng (UX-800: 768/1024/1440) ═════════ */
const PNAV=[[HomeIcon,'Hôm nay'],[BriefcaseIcon,'Việc'],[MapPinIcon,'Điều phối',3],[BanknotesIcon,'Thu nhập'],[UserIcon,'Tôi']];
function PcShell({active,title,sub,children}){
 return <div className="wp" style={{width:1280,minHeight:800,display:'flex',background:'var(--bg)'}}><Css/>
  <aside style={{width:256,flex:'none',background:'var(--card)',borderRight:'1px solid var(--bd)',padding:'20px 16px',display:'flex',flexDirection:'column',gap:6}}>
   <div style={{display:'flex',alignItems:'center',gap:12,padding:'4px 8px 18px'}}><Logo s={42} r={12}/><div><b style={{fontSize:19,letterSpacing:-.3}}>Hiền Xa</b><div className="w-sub" style={{fontSize:13}}>Cổng thợ & tài xế</div></div></div>
   {PNAV.map(([Ic,t,n],i)=><div key={t} style={{display:'flex',alignItems:'center',gap:12,height:52,padding:'0 14px',borderRadius:12,fontWeight:i===active?800:600,fontSize:16,background:i===active?'var(--acbg)':'transparent',color:i===active?'var(--act)':'var(--tx)',position:'relative'}}>
    {i===active&&<i style={{position:'absolute',left:-16,top:12,bottom:12,width:4,borderRadius:'0 4px 4px 0',background:'var(--ac)'}}/>}{I(Ic,23)}<span style={{flex:1}}>{t}</span>{n&&<span className="w-chip w" style={{height:24}}>{n}</span>}</div>)}
   <div style={{marginTop:'auto',display:'flex',alignItems:'center',gap:12,padding:12,borderRadius:14,background:'var(--card2)',border:'1px solid var(--bd)'}}><Av t="D" s={44}/><div style={{minWidth:0}}><b style={{fontSize:15}}>Nguyễn Văn Dũng</b><div className="w-sub" style={{fontSize:13}}>Thợ chính · Hà Đông</div></div></div>
  </aside>
  <div style={{flex:1,minWidth:0}}>
   <div style={{height:76,display:'flex',alignItems:'center',gap:12,padding:'0 32px',background:'var(--card)',borderBottom:'1px solid var(--bd)'}}>
    <div style={{flex:1}}><h1 style={{fontSize:25,fontWeight:800,letterSpacing:-.5}}>{title}</h1><div className="w-sub" style={{fontSize:13.5}}>{sub}</div></div>
    <Ch k="i" style={{height:32,fontSize:14,padding:'0 12px'}}><i style={{width:8,height:8,borderRadius:'50%',background:'#35D07F'}}/>Đang chia sẻ vị trí</Ch>
    <span className="w-btn o sm" style={{gap:8}}>{I(EnvelopeIcon,20)}Tin nhắn<b className="w-chip w" style={{height:22,padding:'0 7px'}}>2</b></span>
    <span className="w-btn o sm" style={{gap:8}}>{I(ArrowRightOnRectangleIcon,20)}Đăng xuất</span></div>
   <div style={{padding:'28px 32px 36px'}}>{children}</div></div></div>;}
def('work-home-pc','/work (máy tính / máy tính bảng ≥ 800px)','Responsive shell (desktop)','UX-800: menu dọc bên trái thay menu dưới; Hôm nay hai cột (việc đang làm | Tiếp theo, Sắp tới); hai nút Tin nhắn + Đăng xuất nền trắng viền xám (UX-FB18-001).',()=>
 <PcShell active={0} title="Hôm nay" sub="Thứ Năm · 19/11/2026">
  <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 400px',gap:28,alignItems:'start'}}>
   <div style={{display:'flex',flexDirection:'column',gap:14}}><HHd/><HShift/><HHero/></div>
   <div style={{display:'flex',flexDirection:'column',gap:14}}><HHint/><HNext/><HSoon/></div></div>
 </PcShell>,1280);
def('work-dispatch-pc','/work/dispatch (máy tính bảng / máy tính)','Dispatch board (desktop)','D85 trên màn rộng: Chờ người dạng lưới hai cột, Đã phân giao hôm nay ở cột phải; cùng trạng thái và nút như điện thoại.',()=>
 <PcShell active={2} title="Điều phối" sub="Thợ chính · Chi nhánh Hà Đông · 19/11/2026">
  <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 400px',gap:28,alignItems:'start'}}>
   <div><div className="w-seg" style={{width:380,marginBottom:16}}><div className="on" style={{fontSize:15}}>Chờ người · 3</div><div style={{fontSize:15}}>Đã phân giao · 5</div></div>
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
     <Wait refused time="PG-0415 · 10:30" title="Giao xi măng · Cầu Giấy" sub="100 bao (5.000 kg) · Anh Tuấn · 6,1 km" sug="Anh Hải" why="Rảnh từ 10:00 · xe 29C-456.78" primary/>
     <Wait time="PG-0417 · 13:00" title="Giao gạch ống · Hà Đông" sub="2.000 viên · Cô Hoa · 3,8 km" sug="Anh Quân" why="Ít việc nhất hôm nay"/>
     <Wait time="DV-0046 · 15:00" title="Cẩu hàng lên tầng 3" sub="Dịch vụ · khoảng 1,5 giờ · Minh Phát"/></div></div>
   <div><h2 className="w-h2" style={{marginBottom:12}}>Đã phân giao hôm nay</h2><div className="w-card">{[['H','Anh Hải','PG-0409 · Cầu Giấy','Đang giao','i'],['Q','Anh Quân','PG-0411 · Hà Đông','Đã phân giao','g'],['D','Anh Dũng','PG-0412 · Nam Từ Liêm','Đang giao','i'],['H','Anh Hải','PG-0405 · Đại Mỗ','Chờ xác minh','w']].map(([a,n,c,st,k])=>
    <div key={c} className="w-row"><Av t={a} s={40}/><div style={{flex:1,minWidth:0}}><b>{n}</b><div className="w-sub" style={{fontSize:13.5}}>{c}</div></div><div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}><Ch k={k}>{st}</Ch>{st==='Đã phân giao'&&<span style={{fontWeight:700,color:'var(--act)',fontSize:14}}>Đổi người</span>}</div></div>)}</div></div></div>
 </PcShell>,1280);

/* ═════════ Trang xác nhận email / đặt lại mật khẩu (công khai) ═════════ */
const Status=({k='s',Ic,title,children,btn,link,w})=>{const c={s:['#12804A','#E5F4EC'],w:['#E8890C','#FFF1D6'],i:['#0B63C6','#E6F0FB']}[k];
 return <Frame w={640} h={640} top={112}><SoftCard><div style={{textAlign:'center'}}>
  <span style={{width:84,height:84,borderRadius:'50%',background:c[1],boxShadow:`0 0 0 10px ${c[0]}14`,display:'inline-flex',alignItems:'center',justifyContent:'center',color:c[0],margin:'6px 0 20px'}}>{I(Ic,42)}</span>
  <h1 style={{fontSize:25,fontWeight:800,letterSpacing:-.4}}>{title}</h1>
  <p className="w-sub" style={{fontSize:15.5,lineHeight:1.55,margin:'8px 0 24px'}}>{children}</p>
  <div className="w-btn p lg">{btn}</div>{link&&<div style={{marginTop:16,color:'var(--act)',fontWeight:700,fontSize:15}}>{link}</div>}</div></SoftCard></Frame>;};
def('public-recovery-confirm','/auth/reset (liên kết trong email)','Auth form','Đặt mật khẩu mới sau khi bấm liên kết trong email: hai ô, quy tắc kiểm ngay khi gõ, một nút.',()=>
 <Frame w={640} h={700} top={112}><div className="wp"><SoftCard>
  <span className="w-ico" style={{width:52,height:52,borderRadius:16,marginBottom:16}}>{I(KeyIcon,28)}</span>
  <h1 style={{fontSize:25,fontWeight:800,letterSpacing:-.4}}>Đặt mật khẩu mới</h1>
  <p className="w-sub" style={{fontSize:15,margin:'6px 0 20px',lineHeight:1.5}}>Chọn mật khẩu mới cho tài khoản <b style={{color:'var(--tx)'}}>dung.tho</b>.</p>
  <div style={{display:'flex',flexDirection:'column',gap:16}}><Pw l="Mật khẩu mới" v="•••••••••••" foc/><Pw l="Nhập lại mật khẩu mới" v="••••"/>
   <div style={{display:'flex',flexDirection:'column',gap:9}}><Rule ok t="Có ít nhất 8 ký tự"/><Rule ok t="Có cả chữ và số"/><Rule t="Hai lần nhập giống nhau"/></div><div className="w-btn p lg">Đổi mật khẩu</div></div></SoftCard></div></Frame>,640);
def('public-recovery-confirm-done','/auth/reset (thành công)','Auth result','Đã đổi mật khẩu: xác nhận ngắn, nút về đăng nhập.',()=><div className="wp"><Status k="s" Ic={CheckCircleIcon} title="Đã đổi mật khẩu" btn="Về màn đăng nhập">Bạn có thể đăng nhập bằng mật khẩu mới. Các máy khác đang đăng nhập sẽ được đăng xuất.</Status></div>,640);
def('public-recovery-confirm-expired','/auth/reset (liên kết hết hạn)','Auth result','Liên kết đã dùng hoặc hết hạn: giải thích một câu, nút xin liên kết mới, không lộ tài khoản.',()=><div className="wp"><Status k="w" Ic={ClockIcon} title="Liên kết đã hết hạn" btn="Gửi liên kết mới" link="Về màn đăng nhập">Liên kết đặt lại mật khẩu chỉ dùng được một lần và trong thời gian ngắn. Hãy xin liên kết mới.</Status></div>,640);
def('public-auth-confirm','/auth/confirm (xác nhận email)','Auth result','Xác nhận email: đã xác nhận thành công, nút vào đăng nhập.',()=><div className="wp"><Status k="i" Ic={EnvelopeIcon} title="Đã xác nhận email" btn="Đăng nhập">Email của bạn đã được xác nhận. Nếu bạn là khách mới, văn phòng sẽ gọi lại để kích hoạt tài khoản.</Status></div>,640);
def('public-auth-confirm-expired','/auth/confirm (liên kết hết hạn)','Auth result','Liên kết xác nhận email hết hạn: nút gửi lại email xác nhận.',()=><div className="wp"><Status k="w" Ic={ClockIcon} title="Liên kết xác nhận đã hết hạn" btn="Gửi lại email xác nhận" link="Về màn đăng nhập">Liên kết này đã dùng hoặc quá hạn. Bấm nút dưới để nhận email xác nhận mới.</Status></div>,640);

/* ═════════ Popup (tấm trượt dưới) của cổng Thợ ═════════ */
function Sheet({Ic,k='i',title,children,primary,pk='p',secondary,danger,counter,handleOnly}){
 return <div style={{position:'absolute',inset:0,zIndex:20,display:'flex',alignItems:'flex-end',background:'rgba(8,16,30,.58)'}}>
  <div style={{width:'100%',background:'var(--card)',borderRadius:'26px 26px 0 0',padding:'10px 20px 24px',boxShadow:'0 -20px 50px -10px rgba(0,0,0,.45)'}}>
   <div style={{width:44,height:5,borderRadius:3,background:'var(--bd2)',margin:'0 auto 16px'}}/>
   {counter&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><Ch k="i">{counter[0]}</Ch><span style={{display:'flex',gap:6,alignItems:'center'}}>{[0,1,2].map(i=><i key={i} style={{width:i===counter[1]?22:8,height:8,borderRadius:4,background:i===counter[1]?'var(--ac)':'var(--bd2)'}}/>)}</span></div>}
   <div style={{display:'flex',gap:14,alignItems:'center',marginBottom:12}}>{Ic&&<span className={'w-ico '+(k==='i'?'':k)} style={{width:52,height:52,borderRadius:16}}>{I(Ic,28)}</span>}<h2 style={{fontSize:21,fontWeight:800,letterSpacing:-.4,lineHeight:1.2}}>{title}</h2></div>
   <div style={{display:'flex',flexDirection:'column',gap:12,fontSize:15.5,lineHeight:1.5}}>{children}</div>
   <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:20}}>{primary&&<div className={'w-btn lg '+pk}>{primary}</div>}{secondary&&<div className="w-btn o">{secondary}</div>}
    {danger&&<div className="w-btn dg" style={{marginTop:10}}>{danger}</div>}</div></div></div>;}
const Fact=({a,b,c})=><div style={{display:'flex',justifyContent:'space-between',gap:12,padding:'10px 0',borderTop:'1px solid var(--bd)'}}><span className="w-sub">{a}</span><b style={{textAlign:'right',color:c||'var(--tx)'}}>{b}</b></div>;
const Hint=({k='w',children})=>{const m={w:['--wnbg','--wnt'],e:['--erbg','--er'],ac:['--acbg','--act'],s:['--okbg','--okt']}[k];return <div style={{padding:'11px 13px',borderRadius:12,background:`var(${m[0]})`,color:`var(${m[1]})`,fontSize:14.5,lineHeight:1.45,fontWeight:600}}>{children}</div>};
const TA=({v,ph,h=84})=><div className={'w-in'+(v?' foc':' ph')} style={{height:h,alignItems:'flex-start',paddingTop:14,fontSize:16}}>{v||ph}</div>;
const BgHome=()=><><HHd/><HShift/><HHero/></>;
const BgPool=()=><><Pool first time="Hôm nay · 11:00" title="Giao cát xây · Đại Mỗ" sub="8,5 m³ · Công ty XD Bảo Long" km="3,2 km từ kho" pay="50.000 ₫ / chuyến"/><Pool time="Hôm nay · 14:30" title="Giao xi măng · Từ Liêm" sub="60 bao (3.000 kg)" km="7,4 km" pay="50.000 ₫ / chuyến"/></>;
const BgDetail=()=><><div className="w-card w-pad" style={{paddingTop:18}}><Steps4 n={2}/></div><div className="w-card w-pad"><h2 className="w-h2">Địa điểm giao</h2><p style={{marginTop:8}}>Số 12 ngõ 85 Đại Mỗ, Nam Từ Liêm</p></div><div className="w-card w-pad" style={{height:240}}><h2 className="w-h2">Hàng trên xe</h2></div></>;
const BgDeliv=()=><><Toggle/><Lines/><PhotoSec count="2 / 5 ảnh" tiles={<><Photo i={0}/><Photo i={1}/><AddPhoto/></>}/><RecvNote/></>;
const BgDisp=()=><><Wait refused time="PG-0415 · 10:30" title="Giao xi măng · Cầu Giấy" sub="100 bao (5.000 kg) · Anh Tuấn" sug="Anh Hải" why="Rảnh từ 10:00" primary/><Wait time="PG-0417 · 13:00" title="Giao gạch ống · Hà Đông" sub="2.000 viên · Cô Hoa" sug="Anh Quân" why="Ít việc nhất"/></>;
const Pop=(id,route,note,bg,sheet,{title='Hôm nay',active=0,back,nav=true}={})=>def(id,route,'Bottom sheet (mobile)',note,()=><WPhone back={back} title={title} active={active} unread={2} overlay={sheet}>{bg}</WPhone>,390);
const Wk=(n)=>({k:'i'});
Pop('work-popup-update','/work (D83 Thông báo cập nhật)','D83: hiện một lần ở Hôm nay, tấm trượt dưới, đếm 1/3, bấm "Đã hiểu" để sang tin sau.',<BgHome/>,
 <Sheet Ic={BanknotesIcon} counter={['Đơn giá công mới',0]} title="Văn phòng đổi 2 đơn giá công" primary="Đã hiểu">
  <p className="w-sub">Cập nhật lúc 08:30 hôm nay · áp dụng từ 20/11</p>
  <div><Fact a="Tiền chuyến theo xe" b="40.000 → 50.000 ₫"/><Fact a="Cẩu hàng" b="Mới · 450.000 ₫ / giờ"/><Fact a="Vận chuyển cát" b="Ngừng áp dụng" c="var(--sub)"/></div>
  <p className="w-sub" style={{fontSize:13.5}}>Còn 2 thông báo nữa.</p></Sheet>);
Pop('work-popup-push','/work (bật thông báo đẩy)','Xin bật thông báo đẩy trên máy để nhận việc mới kể cả khi tắt màn hình (D86); không ép, có "Để sau".',<BgHome/>,
 <Sheet Ic={EnvelopeIcon} title="Bật thông báo trên máy này" primary="Bật thông báo" secondary="Để sau">
  <p>Hiền Xa sẽ báo ngay khi có <b>việc mới</b>, <b>đổi người</b> hoặc <b>tin từ cửa hàng</b>, kể cả khi bạn tắt màn hình.</p><Hint k="ac">Điện thoại sẽ hỏi thêm một lần. Bạn chọn "Cho phép".</Hint></Sheet>);
Pop('work-popup-clock-in','/work (Vào ca)','Vào ca: xác nhận ca và giờ; nhắc vị trí chỉ gửi trong ca.',<BgHome/>,
 <Sheet Ic={ClockIcon} title="Vào ca sáng?" primary="Vào ca" secondary="Chưa phải bây giờ">
  <div><Fact a="Ca" b="07:30 – 16:30"/><Fact a="Bây giờ" b="07:28 · đúng giờ" c="var(--okt)"/></div><p className="w-sub">Vị trí của bạn được gửi cho điều phối trong ca và tự dừng khi ra ca.</p></Sheet>);
Pop('work-popup-clock-out','/work (Ra ca)','Ra ca: cảnh báo còn việc đang giao chưa xong; nút chính vẫn là hành động đang hỏi.',<BgHome/>,
 <Sheet Ic={ClockIcon} k="w" title="Ra ca bây giờ?" primary="Ra ca" secondary="Tiếp tục làm">
  <div><Fact a="Vào ca" b="07:28"/><Fact a="Đã làm" b="8 giờ 02 phút"/></div><Hint>Bạn còn 1 việc đang giao (PG-0412). Giao xong rồi ra ca để văn phòng tính đủ chuyến.</Hint></Sheet>);
Pop('work-popup-location','/work (hỏi quyền vị trí)','Hỏi trước khi trình duyệt/Android hiện hộp quyền: nói rõ để làm gì, chỉ trong ca.',<BgHome/>,
 <Sheet Ic={MapPinIcon} title="Cho phép dùng vị trí" primary="Cho phép vị trí" secondary="Không bây giờ">
  <p>Điều phối cần biết xe đang ở đâu để báo khách <b>giờ tới</b> và chia việc gần bạn.</p>
  <div><Fact a="Khi nào gửi" b="Chỉ trong ca"/><Fact a="Ngoài ca" b="Không gửi"/><Fact a="Bạn cần bấm gì khi lái" b="Không" /></div></Sheet>);
Pop('work-popup-claim','/work/pool (Nhận việc)','Nhận việc từ bể: xác nhận trước khi nhận để không nhận nhầm khi cuộn bằng ngón cái.',<BgPool/>,
 <Sheet Ic={InboxArrowDownIcon} title="Nhận việc này?" primary="Nhận việc" secondary="Xem lại">
  <div><Fact a="Việc" b="Giao cát xây · Đại Mỗ"/><Fact a="Giờ hẹn" b="Hôm nay · 11:00"/><Fact a="Hàng" b="8,5 m³"/><Fact a="Tiền chuyến" b="50.000 ₫" c="var(--okt)"/></div><p className="w-sub">Nhận rồi, việc nằm trong mục Hôm nay của bạn.</p></Sheet>,{title:'Việc chờ nhận',active:1});
Pop('work-popup-reassign','/work/dispatch (Đổi người, thợ chính D85)','Chọn người khác cho một việc đã phân hoặc đang chờ; chỉ đổi được đến khi xuất kho/bắt đầu.',<BgDisp/>,
 <Sheet Ic={UsersIcon} title="Đổi người cho PG-0411" primary="Đổi sang Anh Hải" secondary="Đóng">
  <div style={{display:'flex',flexDirection:'column',gap:8}}>{[['Anh Hải','Rảnh từ 10:00 · xe 29C-456.78',1],['Anh Quân','Người hiện tại',0],['Anh Nam','Đang giao PG-0409 (bận)',0,1]].map(([n,d,on,off])=><div key={n} style={{display:'flex',alignItems:'center',gap:12,minHeight:60,padding:'8px 12px',borderRadius:14,border:on?'2px solid var(--ac)':'1.5px solid var(--bd2)',background:on?'var(--acbg)':'var(--card)',opacity:off?.55:1}}><Av t={n[4]} s={38}/><div style={{flex:1}}><b>{n}</b><div className="w-sub" style={{fontSize:13.5}}>{d}</div></div><span style={{width:24,height:24,borderRadius:'50%',border:on?'7px solid var(--ac)':'2px solid var(--bd2)',background:'#fff'}}/></div>)}</div></Sheet>,{title:'Điều phối',active:1});
Pop('work-popup-short','/work/jobs/[id]/delivered (Giao thiếu)','Giao thiếu kèm lý do bắt buộc; vẫn cần ảnh.',<BgDeliv/>,
 <Sheet Ic={ExclamationTriangleIcon} k="w" title="Báo giao thiếu" primary="Chụp ảnh và gửi" secondary="Quay lại">
  <div><Fact a="Xi măng PC40" b="50 / 60 bao" c="var(--wnt)"/><Fact a="Cát xây" b="8,5 / 8,5 m³"/><Fact a="Thép phi 10" b="20 / 20 cây"/></div>
  <span className="w-lbl">Lý do (bắt buộc)</span><TA v="Xe hết chỗ, 10 bao giao bổ sung chiều nay"/></Sheet>,{back:1,title:'Báo đã giao',active:1});
Pop('work-popup-undeliverable','/work/jobs/[id]/delivered (Không giao được)','Không giao được cần lý do; chọn nhanh lý do thường gặp rồi ghi thêm. Nút gửi màu đỏ vì là kết quả xấu.',<BgDeliv/>,
 <Sheet Ic={XMarkIcon} k="e" title="Không giao được" primary="Gửi báo không giao được" pk="dr" secondary="Quay lại">
  <span className="w-lbl">Lý do (bắt buộc)</span>
  <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{[['Khách vắng',1],['Không vào được công trình'],['Sai địa chỉ'],['Khác']].map(([t,on])=><span key={t} style={{height:44,padding:'0 14px',display:'inline-flex',alignItems:'center',borderRadius:999,fontWeight:700,fontSize:15,background:on?'var(--ac)':'var(--card)',color:on?'#fff':'var(--tx)',border:on?'none':'1.5px solid var(--bd2)'}}>{t}</span>)}</div>
  <TA v="" ph="Ghi thêm (không bắt buộc)" h={72}/></Sheet>,{back:1,title:'Báo đã giao',active:1});
Pop('work-popup-decline','/work/jobs/[id] (Từ chối việc)','Từ chối trước khi hàng bàn giao; điều phối nhận lại việc kèm ghi chú. Nút chính là "Giữ việc", nút từ chối tách riêng.',<BgDetail/>,
 <Sheet Ic={ExclamationTriangleIcon} k="w" title="Từ chối việc này?" primary="Giữ việc" danger="Từ chối việc">
  <p>Điều phối sẽ nhận lại việc <b>PG-0415</b> và chọn người khác.</p><span className="w-lbl">Ghi chú (không bắt buộc)</span><TA v="" ph="Ví dụ: xe đang hỏng" h={72}/></Sheet>,{back:1,title:'Chi tiết việc',active:1});
Pop('work-popup-photo','/work/jobs/[id]/delivered (Xóa / chụp lại ảnh)','Ảnh đã tải: chụp lại là hành động chính, xóa tách riêng, "Giữ ảnh" để thoát.',<BgDeliv/>,
 <Sheet title="Ảnh số 2" primary={<>{I(CameraIcon,24)}Chụp lại</>} secondary="Giữ ảnh" danger="Xóa ảnh này">
  <div className="w-ph" style={{height:150,background:'linear-gradient(135deg,#B9C4D0,#7B8BA0)'}}><svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{opacity:.55}}><g fill="rgba(255,255,255,.55)"><rect x="12" y="54" width="34" height="18" rx="5"/><rect x="50" y="54" width="34" height="18" rx="5"/><rect x="26" y="34" width="34" height="18" rx="5"/></g></svg></div>
  <p className="w-sub">Ảnh đã tải xong. Xóa rồi thì phải chụp ảnh khác nếu cần.</p></Sheet>,{back:1,title:'Báo đã giao',active:1});
Pop('work-popup-confirm-delivered','/work/jobs/[id]/delivered (Xác nhận đã giao)','Xác nhận cuối: tóm tắt hàng, số ảnh, người nhận; nút xanh lá vì là hoàn tất.',<BgDeliv/>,
 <Sheet Ic={CheckCircleIcon} k="s" title="Xác nhận đã giao?" primary={<>{I(CheckIcon,24)}Xác nhận đã giao (2 ảnh)</>} pk="g" secondary="Xem lại">
  <div><Fact a="Hàng" b="3 dòng · giao đủ"/><Fact a="Người nhận" b="Anh Bảo"/><Fact a="Ảnh" b="2 ảnh đã tải"/></div><p className="w-sub">Gửi xong, văn phòng sẽ xác minh. Bấm lại khi mất mạng không ghi hai lần.</p></Sheet>,{back:1,title:'Báo đã giao',active:1});
Pop('work-popup-unknown','/work/jobs/[id]/delivered (Chưa rõ kết quả)','UX-850: mất kết nối khi gửi là "Chưa rõ kết quả", không báo thất bại; ảnh giữ nguyên; nút kiểm tra lại không tạo lệnh mới.',<BgDeliv/>,
 <Sheet Ic={ClockIcon} k="w" title="Chưa rõ kết quả" primary={<>{I(ArrowPathIcon,24)}Kiểm tra kết quả</>} secondary="Đóng, kiểm tra sau">
  <p>Mất kết nối lúc gửi nên <b>chưa biết văn phòng đã nhận báo giao chưa</b>.</p><Hint>Ảnh bạn đã chụp vẫn được giữ. Bấm Kiểm tra kết quả: hệ thống không ghi hai lần.</Hint></Sheet>,{back:1,title:'Báo đã giao',active:1});
Pop('work-popup-password-done','/work/change-password (thành công)','Đổi mật khẩu xong: xác nhận ngắn, về Hôm nay.',<><Pw l="Mật khẩu mới" v="•••••••••••"/></>,
 <Sheet Ic={CheckCircleIcon} k="s" title="Đã đổi mật khẩu" primary="Về Hôm nay"><p>Lần sau hãy đăng nhập bằng mật khẩu mới. Các máy khác sẽ được đăng xuất.</p></Sheet>,{back:1,title:'Đổi mật khẩu',active:3});
Pop('work-popup-logout','/work/profile (Đăng xuất)','Đăng xuất có xác nhận; nút chính là ở lại, đăng xuất tách riêng; cảnh báo khi đang trong ca.',<><div className="w-card w-pad"><b>Nguyễn Văn Dũng</b></div><div className="w-card" style={{height:260}}/></>,
 <Sheet Ic={ArrowRightOnRectangleIcon} k="e" title="Đăng xuất?" primary="Ở lại" danger="Đăng xuất">
  <Hint>Bạn đang trong ca. Đăng xuất không ra ca, nhưng vị trí sẽ ngừng gửi và bạn không nhận thông báo việc mới.</Hint></Sheet>,{title:'Tôi',active:3});
