import React,{useState,useMemo,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import './hx.css';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {M} from './screens.jsx';
const grp=i=>i.startsWith('work-')?'Cổng Thợ':i.startsWith('customer-')?'Cổng Khách':i.startsWith('public-')?'Đăng nhập và công khai':i.includes('-popup-')?'Quản trị · Popup':i.includes('-print-')?'Quản trị · Mẫu in':'Quản trị';
const GROUPS=['Quản trị','Quản trị · Popup','Quản trị · Mẫu in','Cổng Thợ','Cổng Khách','Đăng nhập và công khai'];
const S={ui:'"Be Vietnam Pro",system-ui,sans-serif'};
function App(){
 const [id,setId]=useState(()=>location.hash.slice(1)||M[0].id);
 const [q,setQ]=useState('');const [fit,setFit]=useState(true);
 useEffect(()=>{location.hash=id},[id]);
 const cur=M.find(m=>m.id===id)||M[0];const C=cur.C;
 const list=useMemo(()=>M.filter(m=>(m.id+' '+m.route+' '+(m.tpl||'')).toLowerCase().includes(q.toLowerCase())),[q]);
 const [vw,setVw]=useState(innerWidth);useEffect(()=>{const f=()=>setVw(innerWidth);addEventListener('resize',f);return()=>removeEventListener('resize',f)},[]);
 const avail=vw-300-48;const scale=fit&&cur.w>avail?avail/cur.w:1;
 const idx=M.findIndex(m=>m.id===cur.id);
 return <div style={{display:'flex',height:'100vh',fontFamily:S.ui,background:'#E9EDF3'}}>
  <aside style={{width:300,background:'#fff',borderRight:'1px solid #D5DCE6',display:'flex',flexDirection:'column',flex:'none'}}>
   <div style={{padding:'14px 14px 8px'}}><b style={{fontSize:16}}>Concept Astryx · Hiền Xa</b><div style={{fontSize:13,color:'#5A6B82'}}>{M.length} màn hình · chỉ là concept, dữ liệu hư cấu</div>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm màn, route, mẫu…" style={{marginTop:8,width:'100%',boxSizing:'border-box',padding:'8px 10px',border:'1px solid #C7D2DF',borderRadius:8,fontSize:14,fontFamily:S.ui}}/></div>
   <div style={{overflow:'auto',flex:1,padding:'0 8px 16px'}}>
    {GROUPS.map(g=>{const items=list.filter(m=>grp(m.id)===g);if(!items.length)return null;return <div key={g}><div style={{fontSize:12.5,fontWeight:700,color:'#5A6B82',padding:'12px 6px 4px',textTransform:'uppercase',letterSpacing:'.04em'}}>{g} · {items.length}</div>
     {items.map(m=><div key={m.id} onClick={()=>setId(m.id)} style={{padding:'6px 8px',borderRadius:6,fontSize:13.5,cursor:'pointer',background:m.id===cur.id?'#E6F0FB':'transparent',color:m.id===cur.id?'#0A4A96':'#10223A',fontWeight:m.id===cur.id?700:500}}>{m.id}</div>)}</div>})}
   </div></aside>
  <main style={{flex:1,overflow:'auto',padding:24}}>
   <div style={{maxWidth:Math.max(cur.w*scale,520),margin:'0 auto 14px'}}>
    <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><code style={{background:'#fff',border:'1px solid #D5DCE6',borderRadius:6,padding:'2px 8px',fontSize:13}}>{cur.route}</code><span style={{fontSize:13.5,fontWeight:700,color:'#5A6B82'}}>Mẫu Astryx: {cur.tpl}</span><span style={{flex:1}}/>
     <button onClick={()=>setId(M[Math.max(0,idx-1)].id)} style={btn}>‹ Trước</button><button onClick={()=>setId(M[Math.min(M.length-1,idx+1)].id)} style={btn}>Sau ›</button>
     <label style={{fontSize:13.5}}><input type="checkbox" checked={fit} onChange={e=>setFit(e.target.checked)}/> Vừa khung</label></div>
    <div style={{fontSize:14,lineHeight:1.5,color:'#26374E',marginTop:6}}>{cur.note}</div></div>
   <div style={{width:cur.w*scale,margin:'0 auto',overflow:'hidden',boxShadow:'0 8px 30px rgba(16,34,58,.15)',borderRadius:8,background:'#F2F5F9'}}>
    <div style={{width:cur.w,transform:`scale(${scale})`,transformOrigin:'top left',height:'auto'}}>
     <Theme theme={neutralTheme}><div key={cur.id}><C/></div></Theme></div></div>
  </main></div>;}
const btn={border:'1px solid #C7D2DF',background:'#fff',borderRadius:8,padding:'5px 10px',fontSize:13.5,cursor:'pointer',fontFamily:S.ui};
createRoot(document.getElementById('root')).render(<App/>);
