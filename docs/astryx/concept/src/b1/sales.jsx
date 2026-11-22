import React from 'react';
import {Chip,Btn,Btn0,Button,Banner,Icon,ProgressBar,Avatar,Stepper,Step,SegmentedControl,SegmentedControlItem,HI,
 mk,ic,cd,m,Tx,Sel,Ta,Cb,Sw,Panel,Row,Pair,Stack,Cols,Fact,FactRow,DT,Hl,Cell,Nm,Tag,Go,Ib,Wide,Band,PT,Pg,Flow,Bar,Dlg,Lock,Link,Sum,Dot,Thumb,
 MUTED,LINE,INK,BLUE,GREEN,AMBER,RED} from './kit.jsx';
import {Shell} from '../lib.jsx';

export const M=[]; const def=mk(M);
const n=x=>x.toLocaleString('vi-VN');
const LINES=[
 ['XM-PC40','Xi măng PC40 Hoàng Thạch','Bao 50 kg',200,92000,'Giá nhóm Bảo Long','860'],
 ['TH-D16','Thép cuộn phi 16 Hòa Phát','Cây 11,7 m',60,192000,'Khách + Vật tư','35'],
 ['CAT-X','Cát xây Sông Hồng','m³',20,380000,'Giá chung','64,5'],
 ['GACH-2L','Gạch đỏ 2 lỗ Tuynel','Viên',3000,1450,'Giá nhóm Bảo Long','48.200'],
 ['DA-12','Đá 1×2','m³',10,373000,'Khách + Nhóm vật tư','64'],
];
const D={fontSize:14,color:MUTED,paddingBottom:12};
const SC='#3C4C63';
const num=x=>+String(x).replace(/\./g,'').replace(',','.');
const srcTag=s=>s==='Giá chung'?<Tag k="g">{s}</Tag>:<Tag k="i">{s}</Tag>;
const Disabled=({children})=><div style={{opacity:.42,pointerEvents:'none'}}>{children}</div>;

/* ================= FORM TẠO / SỬA ĐƠN BÁN ================= */
const EDIT={code:'SO-0232',cust:'KH-0071 · Công ty Minh Phát',ct:'CT Long Biên – Nhà ở liền kề',tier:'Nhóm giá Minh Phát',contact:'Chị Phạm Thu Hương · 0977 222 333',debt:'7.200.000 / 100.000.000 ₫',debtV:7,
 lines:[['XM-PC40','Xi măng PC40 Hoàng Thạch','Bao 50 kg',40,91000,'Giá nhóm Minh Phát','860'],['CAT-X','Cát xây Sông Hồng','m³',5,380000,'Giá chung','64,5'],['GACH-2L','Gạch đỏ 2 lỗ Tuynel','Viên',1000,1360,'Khách + Vật tư','48.200']],disc:0,pre:0};
const NEW={cust:'KH-0102 · Công ty XD Bảo Long',ct:'CT Hà Đông – Nhà xưởng Lô B',tier:'Nhóm giá Bảo Long',contact:'Chị Lê Thị Ngân · 0912 345 678',debt:'45.600.000 / 200.000.000 ₫',debtV:23,lines:LINES,disc:600000,pre:10000000};
function OrderForm({edit}){
 const X=edit?EDIT:NEW;
 const rows=X.lines.map((l,i)=>{const short=num(l[3])>num(l[6]);return {bg:short?'#FFFBF0':undefined,cells:[
  <span style={{color:MUTED}}>{i+1}</span>,
  <Nm n={l[1]} sub={<>{l[0]} · {l[2]}</>} tag={<>{srcTag(l[5])}{short&&<Tag k="w">{ic('ExclamationTriangleIcon',14)}Thiếu {l[3]-num(l[6])} cây · sẽ chuyển NCC giao thẳng</Tag>}</>}/>,
  <Cell>{n(l[3])}</Cell>,<span>{n(l[4])}</span>,<b>{n(l[3]*l[4])}</b>,
  <span style={{color:short?'#B25E00':MUTED,fontWeight:short?700:500}}>{l[6]}</span>,
  <span style={{color:MUTED}}>{ic('XMarkIcon',18)}</span>]}});
 const sub=X.lines.reduce((a,l)=>a+l[3]*l[4],0);
 const total=sub-X.disc;const left=total-X.pre;
 const Btns=<><Wide k="g" icon="CheckCircleIcon">Xác nhận đơn</Wide><Wide icon="DocumentTextIcon">Lưu nháp</Wide></>;
 return <Pg group="Bán hàng" page="Đơn bán" sub={edit?'Bán hàng / Đơn bán / SO-0232 / Sửa':'Bán hàng / Đơn bán / Tạo mới'} title={edit?'Sửa đơn nháp SO-0232':'Tạo đơn bán'}
  chips={edit?<Chip k="g">Nháp · phiên bản 3</Chip>:<Chip k="g">Chưa lưu</Chip>}
  banner={edit?<Banner status="warning" title="Đơn này vừa được Nguyễn Thị Lan cập nhật lúc 09:12 (phiên bản 4)" description="Bạn đang sửa phiên bản 3 nên tạm khóa Lưu nháp và Xác nhận đơn. Hãy tải lại đơn để lấy bản mới nhất rồi sửa tiếp; chưa có gì bị ghi đè." endContent={<Ib k="p" icon="ArrowPathIcon">Tải lại đơn</Ib>} collapsible={false}/>:null}>
  <Cols left={<>
   <div className="hx-card" style={{overflow:'hidden',boxShadow:'0 1px 2px rgba(16,34,58,.04)'}}>
    <Band/>
    <DT heads={['#','Vật tư','Số lượng','Đơn giá','Thành tiền','Có thể bán','']} widths={['28px','1fr','92px','90px','112px','100px','24px']} num={[2,3,4,5]} rows={rows}
     foot={<div style={{padding:'11px 16px',borderTop:'1px solid '+LINE,display:'flex',gap:10,alignItems:'center',color:MUTED,fontSize:14,background:'#FBFCFE'}}>{ic('PlusIcon',16,{color:BLUE})}<span>Nhấn <b style={{color:INK}}>F3</b> để thêm hàng</span><span style={{flex:1}}/><span title="Giá theo thứ tự Khách + Vật tư, Khách + Nhóm vật tư, Nhóm giá, Giá chung; tính lại ở máy chủ khi lưu" style={{display:'inline-flex',alignItems:'center',gap:6}}>{ic('InformationCircleIcon',16)}Cách tính giá</span></div>}/>
   </div>
   <Panel title="Giao hàng và ghi chú"><Pair cols={3}><Tx label="Ngày giao" value={edit?'21/11/2026':'20/11/2026'}/><Sel label="Khung giờ" value="Sáng (07:00–11:00)"/><Sel label="Nguồn hàng" value="Tự phân nguồn khi xác nhận"/></Pair>
    <div style={{marginTop:14}}><Ta label="Ghi chú cho đơn" value={edit?"Giao trước 10:00, gọi chị Hương 30 phút trước khi tới.":"Xe tải dưới 5 tấn, vào cổng phụ phía Nam. Gọi chỉ huy trưởng trước 30 phút."} rows={2}/></div></Panel></>}
   right={<div style={{position:'sticky',top:16,display:'flex',flexDirection:'column',gap:16}}>
    <Panel title="Khách hàng và công trình">
     <Stack gap={12}><Sel label="Khách hàng (chọn trước)" value={X.cust}/><div style={{fontSize:14.5,display:'flex',gap:8,alignItems:'center',marginTop:-4}}>{ic('PhoneIcon',16,{color:MUTED})}<span>{X.contact}</span></div><Sel label="Công trình giao hàng" value={X.ct}/>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Tag k="i">{X.tier}</Tag><Tag k="g">Hạn thanh toán 30 ngày</Tag></div>
      <Bar l="Hạn mức nợ" r={X.debt} v={X.debtV} k="accent"/></Stack></Panel>
    <Panel title="Thanh toán" pad={0}><div style={{padding:'10px 16px 4px'}}>
     <Row l={`Tạm tính (${X.lines.length} dòng)`} v={m(sub)}/><Row l="Giảm giá" v={<Cell w={130}>{n(X.disc)}</Cell>}/>
     <Row big border l="Tổng cộng" v={m(total)} c={BLUE}/>
     <Row l="Trả trước" v={<Cell w={130}>{n(X.pre)}</Cell>}/><Row l="Còn phải thu" b v={m(left)} c={INK}/></div>
     <div style={{padding:'12px 16px 16px',display:'flex',flexDirection:'column',gap:10,borderTop:'1px solid '+LINE,marginTop:8}}>
      {edit?<Disabled>{Btns}</Disabled>:Btns}
      <div style={{fontSize:13.5,color:MUTED,lineHeight:1.45}}>{edit?'Tải lại đơn để mở khóa hai nút này.':'Lưu nháp chưa giữ hàng. Xác nhận đơn sẽ giữ hạn mức nợ và tự phân nguồn hàng; vượt hạn mức phải nhập lý do duyệt.'}</div></div></Panel>
   </div>}/></Pg>;
}
def('admin-order-new','/admin/orders/new','Checkout Form','Dải xanh tìm hàng F3 + chọn kho xem tồn; giá theo 4 cấp ưu tiên tính lại ở server; Lưu nháp khác Xác nhận đơn (giữ hạn mức, tự phân nguồn).',()=><OrderForm/>);
def('admin-order-edit','/admin/orders/:id/edit','Checkout Form','Chỉ sửa khi còn nháp; gửi kèm expectedVersion, xung đột phiên bản thì khóa Lưu nháp/Xác nhận cho tới khi Tải lại đơn.',()=><OrderForm edit/>);

/* ================= CHI TIẾT ĐƠN ================= */
def('admin-order-detail','/admin/orders/:id','Order Detail','Một chip trạng thái đơn (Đã xác nhận) khớp tiến trình; Nguồn hàng kho / NCC giao thẳng; Hủy đơn hủy luôn phiếu giao chưa chạy; In A4/K80; Gửi Zalo là nút gửi tay.',()=>{
 const ph=['PG-0118','PG-0119','PG-0118','PG-0118','PG-0118'];
 const rows=LINES.map((l,i)=>({cells:[<Nm n={l[1]} sub={<>{l[0]} · {l[2]}</>}/>,<span>{n(l[3])}</span>,
  i===1?<Tag k="w">{ic('TruckIcon',14)}NCC giao thẳng</Tag>:<Tag k="g">Kho Đại Mỗ</Tag>,cd(ph[i]),<b>{n(l[3]*l[4])}</b>]}));
 return <Pg group="Bán hàng" page="Đơn bán" sub="Bán hàng / Đơn bán / SO-0231" title="SO-0231" chips={<Chip k="i">Đã xác nhận</Chip>}
  actions={<><Ib icon="PrinterIcon">In A4</Ib><Ib icon="PrinterIcon">In K80</Ib><Ib icon="ChatBubbleLeftRightIcon">Gửi qua Zalo</Ib><span style={{color:RED,fontWeight:700,fontSize:15,padding:'8px 12px',display:'inline-flex',gap:6,alignItems:'center'}}>{ic('XCircleIcon',18)}Hủy đơn</span></>}>
  <FactRow items={[{l:'Khách hàng',v:'Công ty XD Bảo Long',sub:'KH-0102 · Nhóm giá Bảo Long',flex:1.4},{l:'Công trình giao',v:'CT Hà Đông – Nhà xưởng Lô B',sub:'12 Quang Trung, Hà Đông',flex:1.5},{l:'Ngày giao',v:'20/11/2026',sub:'Sáng 07:00–11:00'},{l:'Nhân viên bán hàng',v:'Phạm Quang Huy',sub:'Đặt tại quầy'}]}/>
  <Cols left={<>
   <Panel title="Dòng hàng" sub="5 dòng · giá đã chốt lúc xác nhận · chưa giao dòng nào" pad={0}>
    <DT heads={['Vật tư','SL đặt','Nguồn hàng','Phiếu giao','Thành tiền']} widths={['1fr','70px','150px','96px','110px']} num={[1,4]} rows={rows}/></Panel>
   <Panel title="Nguồn hàng" sub="Hệ thống tự phân khi xác nhận: đủ kho thì tạo phiếu giao, thiếu thì đặt NCC giao thẳng">
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
     <div style={{border:'1px solid '+LINE,borderRadius:10,padding:14,background:'#FBFCFE'}}><div style={{display:'flex',alignItems:'center',gap:8,fontWeight:700}}>{ic('ArchiveBoxIcon',20,{color:BLUE})}Từ kho Đại Mỗ</div><div style={{fontSize:14.5,color:MUTED,margin:'6px 0 10px'}}>4 dòng · đủ hàng có thể bán khi xác nhận</div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Tag k="i">PG-0118</Tag></div></div>
     <div style={{border:'1px solid #F3D18C',borderRadius:10,padding:14,background:'#FFFBF0'}}><div style={{display:'flex',alignItems:'center',gap:8,fontWeight:700}}>{ic('TruckIcon',20,{color:'#B25E00'})}NCC giao thẳng công trình</div><div style={{fontSize:14.5,color:MUTED,margin:'6px 0 10px'}}>Thép cuộn phi 16 · 60 cây · Thép Hòa Phát</div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Tag k="w">PO-0087 · Nhận một phần</Tag><Tag k="w">PG-0119</Tag></div></div></div></Panel>
   <Panel title="Phiếu giao liên quan" pad={0}>
    <DT heads={['Phiếu giao','Nguồn hàng','Trạng thái','Ngày giao']} widths={['110px','1fr','150px','110px']} rows={[
     [cd('PG-0118'),'Từ kho Đại Mỗ · 4 dòng',<Chip k="i">Đã phân giao</Chip>,'20/11/2026'],
     [cd('PG-0119'),'NCC giao thẳng · Thép phi 16',<Chip k="w">Chờ phân giao</Chip>,'20/11/2026']]}
     foot={<div style={{padding:'11px 16px',borderTop:'1px solid '+LINE,fontSize:14,color:MUTED,display:'flex',gap:8,alignItems:'center'}}>{ic('InformationCircleIcon',17)}Hủy đơn sẽ hủy luôn phiếu giao chưa chạy (PG-0118, PG-0119). Công nợ chỉ ghi sau khi phiếu được xác minh.</div>}/></Panel></>}
   right={<>
    <Panel title="Tiến trình đơn"><Flow steps={['Nháp','Đã xác nhận','Đang giao','Hoàn tất']} at={1}/></Panel>
    <Panel title="Thanh toán" pad={0}><div style={{padding:'10px 16px 14px'}}><Row l="Tạm tính" v={m(45600000)}/><Row l="Giảm giá" v="0 ₫"/><Row big border l="Tổng cộng" v={m(45600000)} c={BLUE}/><Row l="Trả trước" v="0 ₫"/><Row l="Còn phải thu" b v={m(45600000)} c={INK}/></div></Panel>
    <Panel title="Nhật ký đơn"><Stack gap={12}>{[['16/11 16:20','Xác nhận đơn · tự phân nguồn','Phạm Quang Huy'],['16/11 16:05','Tạo đơn nháp','Phạm Quang Huy']].map(([t,a,w],i)=><div key={i} style={{display:'flex',gap:10}}><Dot k={i?'g':'i'}/><div style={{marginTop:-4}}><div style={{fontSize:14.5,fontWeight:600}}>{a}</div><div style={{fontSize:13,color:MUTED}}>{t} · {w}</div></div></div>)}</Stack></Panel></>}/></Pg>;});

/* ================= DUYỆT ĐƠN KHÁCH ================= */
def('admin-order-approve','/admin/orders/:id (băng Chờ duyệt)','Incident Console + Banner','Đơn khách đặt ở nháp = Chờ duyệt; Duyệt = xác nhận + tự phân nguồn; Từ chối mở hộp thoại có lý do khách thấy; luôn không tự duyệt khi vượt hạn mức nợ (khóa, không đổi tại đây).',()=>{
 const rows=[['XM-PC40','Xi măng PC40 Hoàng Thạch','Bao 50 kg',80,95000,860],['CAT-X','Cát xây Sông Hồng','m³',5,380000,64.5],['DA-46','Đá 4×6','m³',7,400000,4]].map(l=>({bg:l[3]>l[5]?'#FFFBF0':undefined,cells:[<Nm n={l[1]} sub={<>{l[0]} · {l[2]}</>}/>,<span>{n(l[3])}</span>,<span>{n(l[4])}</span>,<b>{n(l[3]*l[4])}</b>,l[3]>l[5]?<Tag k="w">{ic('TruckIcon',14)}NCC giao thẳng · thiếu {l[3]-l[5]} m³</Tag>:<Tag k="i">{ic('CheckIcon',14)}Từ kho Đại Mỗ · đủ hàng</Tag>]}));
 return <div style={{position:'relative',width:1280,overflow:'hidden'}}>
 <Pg group="Bán hàng" page="Đơn bán" sub="Bán hàng / Đơn bán / SO-0230" title="SO-0230" chips={<Chip k="w">Khách đặt · Chờ duyệt</Chip>}
  banner={<Banner status="warning" title="Đơn khách tự đặt từ cổng khách, đang chờ văn phòng duyệt" description="Anh Tuấn · Cầu Giấy đặt lúc 08:42 hôm nay. Duyệt sẽ xác nhận đơn và tự phân nguồn hàng; từ chối sẽ hủy đơn và gửi lý do cho khách."
   endContent={<div style={{display:'flex',gap:8}}><Ib k="d">Từ chối</Ib><Btn0 k="g">{ic('CheckCircleIcon',18)}Duyệt đơn</Btn0></div>} collapsible={false}/>}>
  <Cols rw={380} left={<>
   <FactRow items={[{l:'Khách hàng',v:'Anh Tuấn · Cầu Giấy',sub:'KH-0099 · Giá chung · 0903 111 222',flex:1.5},{l:'Công trình',v:'Nhà phố 38 Trần Đăng Ninh',flex:1.4},{l:'Ngày giao mong muốn',v:'20/11/2026'}]}/>
   <Panel title="Dòng hàng khách đặt" sub="Giá theo bảng giá chung · dự kiến nguồn hàng nếu duyệt" pad={0}>
    <DT heads={['Vật tư','Số lượng','Đơn giá','Thành tiền','Nguồn dự kiến']} widths={['1fr','52px','76px','96px','232px']} num={[1,2,3]} rows={rows}
     foot={<Sum><span style={{color:MUTED}}>Tổng cộng</span><b style={{fontSize:19}} className="hx-num">12.300.000 ₫</b></Sum>}/></Panel>
   <Panel title="Kiểm tra trước khi duyệt">
    <Stack gap={12}>{[['s','Hạn mức nợ còn đủ','Hạn mức 50.000.000 ₫ · đang nợ 0 ₫ · sau đơn này còn 37.700.000 ₫'],['s','Giá khớp bảng giá hiện hành','Tính lại ở máy chủ, không lệch so với giá khách thấy'],['w','1 dòng thiếu kho','Đá 4×6 chỉ còn 4 m³ có thể bán: duyệt sẽ tạo đơn mua NCC giao thẳng cho phần này']].map(([k,t,d],i)=><div key={i} style={{display:'flex',gap:12}}>
     <span style={{width:26,height:26,borderRadius:'50%',background:k==='s'?'#E6F0FB':'#FFF1D6',color:k==='s'?BLUE:'#B25E00',display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{ic(k==='s'?'CheckIcon':'ExclamationTriangleIcon',15)}</span>
     <div><div style={{fontWeight:700,fontSize:15}}>{t}</div><div style={{fontSize:14,color:MUTED,marginTop:2}}>{d}</div></div></div>)}</Stack></Panel></>}
   right={<>
    <Panel title="Tiến trình đơn"><Flow steps={['Khách đặt','Chờ duyệt','Đã xác nhận','Hoàn tất']} at={1}/></Panel>
    <Panel title="Quy tắc tự duyệt" sub="Cấu hình ở Cài đặt, không đổi tại màn này" right={<Link>Mở Cài đặt</Link>}>
     <Stack gap={12}>{[['Tự duyệt đơn an toàn','Đang bật · đủ hàng, giá đúng bảng giá, trong hạn mức nợ',false],['Không tự duyệt khi vượt hạn mức nợ','Luôn bật · đơn vượt hạn mức luôn chờ nhân viên duyệt kèm lý do',true]].map(([t,d,lock])=><div key={t} style={{display:'flex',gap:10}}><span style={{color:lock?MUTED:BLUE,marginTop:2}}>{ic(lock?'LockClosedIcon':'CheckCircleIcon',20)}</span><div><div style={{fontWeight:700,fontSize:15}}>{t}</div><div style={{fontSize:14,color:MUTED,marginTop:2}}>{d}</div></div></div>)}</Stack></Panel></>}/></Pg>
 <div style={{position:'absolute',inset:0,background:'rgba(16,34,58,.5)',display:'flex',justifyContent:'center',alignItems:'flex-start',paddingTop:200}}>
  <Dlg w={480} title="Từ chối đơn SO-0230" sub="Khách sẽ thấy lý do này trong cổng khách." foot={<><Ib>Không từ chối</Ib><Ib k="d">Từ chối đơn</Ib></>}>
   <Ta label="Lý do từ chối (bắt buộc)" value="Mặt hàng đá 4×6 hiện hết, dự kiến có hàng ngày 22/11. Anh vui lòng đặt lại hoặc gọi văn phòng để đổi sang đá 1×2." rows={4}/>
   <div style={{fontSize:14,color:MUTED,marginTop:8}}>Từ chối sẽ hủy đơn nháp, không giữ hàng và không giữ hạn mức.</div></Dlg></div></div>;});

/* ================= NHẬP TỪ EXCEL ================= */
def('admin-order-import','/admin/orders/import','Vertical Wizard','Ba bước Tải file mẫu · Điền đơn · Tải lên và kiểm tra; chỉ tạo đơn sẵn sàng; lỗi báo theo dòng Excel; Xác nhận luôn nếu đủ quyền.',()=>
 <Pg group="Bán hàng" page="Đơn bán" sub="Bán hàng / Đơn bán / Nhập từ Excel" title="Nhập đơn bán từ Excel">
  <Cols rw={360} left={<div className="hx-card" style={{padding:'22px 26px 26px',boxShadow:'0 1px 2px rgba(16,34,58,.04)'}}>
   <Stepper activeStep={2} orientation="vertical" label="Các bước nhập đơn">
    <Step step={0} label="Tải file mẫu"><div style={D}>Mẫu có sẵn cột khách, công trình, vật tư, số lượng, ngày giao.</div></Step>
    <Step step={1} label="Điền đơn"><div style={D}>Mỗi dòng là một dòng hàng; các dòng cùng mã đơn tạm sẽ gộp thành một đơn.</div></Step>
    <Step step={2} label="Tải lên và kiểm tra">
     <div style={{display:'flex',flexDirection:'column',gap:14,marginTop:2}}><div style={D}>Hệ thống kiểm tra từng dòng trước khi tạo, chưa ghi gì vào sổ.</div>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',border:'1.5px dashed #9DB8DA',borderRadius:12,background:'#F4F8FD'}}>{ic('DocumentArrowUpIcon',30,{color:BLUE})}<div style={{flex:1}}><div style={{fontWeight:700}}>don-ban-thang-11.xlsx</div><div style={{fontSize:13.5,color:MUTED}}>18 dòng Excel · gộp thành 17 đơn · kiểm tra lúc 09:41</div></div><Ib icon="ArrowUpTrayIcon">Chọn file khác</Ib></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
       {[['15','Đơn sẵn sàng (1 có cảnh báo)','#E6F0FB','#0A4A96'],['2','Đơn có lỗi, bỏ qua','#FDEBE9','#8A1C13'],['16','Dòng Excel sẽ được tạo','#F2F5F9','#3C4C63']].map(([v,l,bg,c])=><div key={l} style={{background:bg,color:c,borderRadius:10,padding:'10px 14px'}}><div style={{fontSize:26,fontWeight:800,lineHeight:1.1}}>{v}</div><div style={{fontSize:13.5,fontWeight:600}}>{l}</div></div>)}</div>
      <div className="hx-card" style={{overflow:'hidden'}}><DT heads={['Dòng Excel','Cột','Vấn đề']} widths={['86px','130px','1fr']} rows={[
       [<b>Dòng 9</b>,'Vật tư',<span style={{color:'#8A1C13'}}>Không tìm thấy mã “XM-PC30”</span>],
       [<b>Dòng 14</b>,'Khách hàng',<span style={{color:'#8A1C13'}}>Số điện thoại 0903 555 *** chưa có trong danh sách khách</span>],
       [<b>Dòng 17</b>,'Ngày giao',<span style={{color:'#7A4300'}}>Ngày giao là Chủ nhật, vẫn tạo đơn</span>]]}/></div>
      <Cb value={true} label="Xác nhận luôn các đơn sẵn sàng (cần quyền xác nhận đơn)"/>
      <div style={{display:'flex',gap:10,alignItems:'center'}}><Go icon="CheckCircleIcon">Tạo 15 đơn sẵn sàng</Go><Ib k="gh">Hủy</Ib></div></div>
    </Step></Stepper></div>}
   right={<>
    <Panel title="Cách hoạt động"><Stack gap={12}>{[['CheckCircleIcon','Chỉ tạo các đơn sẵn sàng','Đơn có lỗi bị bỏ qua, không đơn nào bị tạo nửa chừng.'],['DocumentTextIcon','Lỗi báo theo dòng Excel','Sửa đúng dòng báo rồi tải lại cả file.'],['ShieldCheckIcon','Xác nhận luôn là tùy chọn','Chỉ hiện khi bạn có quyền xác nhận đơn; không chọn thì lưu nháp.']].map(([i,t,d])=><div key={t} style={{display:'flex',gap:12}}><span style={{color:BLUE,marginTop:2}}>{ic(i,22)}</span><div><div style={{fontWeight:700,fontSize:15}}>{t}</div><div style={{fontSize:14,color:MUTED}}>{d}</div></div></div>)}</Stack></Panel>
    <Panel title="Xem trước đơn sẵn sàng" sub="5 trên 15 đơn" pad={0}><DT heads={['Khách','Dòng','Tổng']} widths={['1fr','44px','100px']} num={[1,2]} rows={[['Công ty XD Bảo Long','4','28.400.000'],['Anh Nam · Từ Liêm','1','3.100.000'],['Cô Hoa · Hà Đông','2','8.750.000'],['Minh Phát','3','52.000.000'],['Anh Tuấn · Cầu Giấy','1','12.300.000']]}/></Panel></>}/></Pg>);

/* ================= KHÁCH 360 ================= */
function Customer360(){
 const ctRows=[['CT Hà Đông – Nhà xưởng Lô B','12 Quang Trung, Hà Đông','Mặc định',3,true],['CT Văn Quán – Chung cư mini','Ngõ 5 Văn Quán, Hà Đông','',1],['CT Thanh Oai – Kho lạnh','KCN Thanh Oai, Hà Nội','',0]];
 const acc=[['Chủ tài khoản','Lê Thị Ngân','Giám đốc · 0912 345 678','Hoạt động','s','Hôm nay 07:55'],['Người lo tiền','Trần Văn Kiên','Kế toán · 0912 777 410','Hoạt động','s','18/11/2026'],['Người nhận hàng','Nguyễn Văn Dũng','Chỉ huy CT Hà Đông · 0912 000 111','Chờ đổi mật khẩu','w','Chưa đăng nhập']];
 return <Pg group="Bán hàng" page="Khách hàng" sub="Bán hàng / Khách hàng / KH-0102" title="Công ty XD Bảo Long" chips={<><Chip k="s">Đang hoạt động</Chip><Tag k="i">Nhóm giá Bảo Long</Tag></>}
  actions={<><Ib icon="PencilSquareIcon">Quản lý</Ib><Go icon="PlusIcon">Tạo đơn bán</Go></>}>
  <Cols left={<>
   <Panel title="Hồ sơ" right={<Lock>Tiền chỉ hiện với vai trò được xem</Lock>}>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'18px 24px'}}>
     <Fact l="Mã khách" v={cd('KH-0102')}/><Fact l="Điện thoại" v="0912 345 678"/><Fact l="Email" v="ketoan@baolong.example"/>
     <Fact l="Mã số thuế" v="0109 876 543"/><Fact l="Loại khách" v="Nhà thầu xây dựng"/><Fact l="Nhân viên bán hàng" v="Phạm Quang Huy"/>
     <Fact l="Địa chỉ đăng ký" v="Số 8 Trần Phú, Hà Đông, Hà Nội" style={{gridColumn:'1 / 4'}}/></div></Panel>
   <Panel title="Công trình" sub="3 địa chỉ giao hàng" right={<Ib icon="PlusIcon">Thêm công trình</Ib>} pad={0}>
    {ctRows.map((r,i)=><div key={i} style={{borderTop:i?'1px solid '+LINE:'0'}}>
     <div style={{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',background:r[4]?'#F4F8FD':'#fff'}}>{ic(r[4]?'ChevronDownIcon':'ChevronRightIcon',18,{color:BLUE})}
      <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{r[0]}</div><div style={{fontSize:13.5,color:MUTED}}>{r[1]}</div></div>{r[2]&&<Tag k="i">{r[2]}</Tag>}<span style={{fontSize:13.5,color:MUTED,width:100,textAlign:'right'}}>{r[3]} đơn đang mở</span></div>
     {r[4]&&<div style={{padding:'4px 16px 16px 46px',background:'#F4F8FD',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:18}}>
      <Fact l="Người liên hệ tại công trình" v="Nguyễn Văn Dũng" sub="Chỉ huy trưởng · 0912 000 111"/><Fact l="Ghi chú giao hàng" v="Xe dưới 5 tấn vào cổng phụ" sub="Gọi trước 30 phút"/>
      <div><div style={{fontSize:13,color:MUTED,fontWeight:600,marginBottom:6}}>Đơn gần đây</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><Tag k="i">SO-0231 · Đã xác nhận</Tag><Tag k="g">SO-0219 · Hoàn tất</Tag></div></div></div>}</div>)}</Panel>
   <Panel title="Tài khoản cổng khách" sub="Mỗi vai trò dùng một tài khoản riêng trong cổng khách" right={<Ib icon="KeyIcon">Tạo tài khoản cổng</Ib>} pad={0}>
    <DT heads={['Vai trò','Người dùng','Trạng thái','Đăng nhập cuối','']} widths={['124px','1fr','160px','120px','140px']} rows={acc.map(a=>[<b>{a[0]}</b>,<Nm n={a[1]} sub={a[2]}/>,<Chip k={a[4]}>{a[3]}</Chip>,<span style={{color:MUTED}}>{a[5]}</span>,<Link>Đặt lại mật khẩu</Link>])}/></Panel></>}
   right={<>
    <Panel title="Hạn mức và công nợ">
     <Stack gap={14}><div><div style={{fontSize:13,color:MUTED,fontWeight:600}}>Còn nợ</div><div className="hx-num" style={{fontSize:30,fontWeight:800,textAlign:'left',lineHeight:1.2}}>45.600.000 ₫</div></div>
      <Bar l="Đã dùng hạn mức" r="23%" v={23}/><div style={{display:'flex',justifyContent:'space-between',fontSize:14,color:MUTED}}><span>Hạn mức nợ</span><b style={{color:INK}}>200.000.000 ₫</b></div>
      <div style={{borderTop:'1px solid '+LINE,paddingTop:12}}><Row l="Trong hạn" v={m(45600000)} b/><Row l="Quá hạn" v="0 ₫"/><Row l="Hạn gần nhất" v="25/12/2026"/></div></Stack></Panel>
    <Panel title="Chính sách bán"><Stack gap={14}><Fact l="Nhóm giá" v="Nhóm giá Bảo Long" sub="Ưu tiên: Khách + Vật tư, Khách + Nhóm vật tư, Nhóm giá, Giá chung"/><Fact l="Hạn thanh toán" v="30 ngày kể từ ngày giao"/></Stack></Panel></>}/></Pg>;
}
def('admin-customer-360','/admin/customers/:id','Collapsible Table + Two-column Form','Hồ sơ, công trình (nhiều địa chỉ, mở rộng được), tài khoản cổng 3 vai, nhóm giá, hạn mức nợ, công nợ theo tuổi; tiền chỉ hiện với vai trò được xem.',()=><Customer360/>);

/* ================= QUẢN LÝ KHÁCH ================= */
def('admin-customer-manage','/admin/customers/manage','Two-column Form','Tạo và sửa khách (customers.manage); tạo tài khoản cổng hàng loạt bằng số điện thoại; đăng ký trùng số điện thoại chờ văn phòng duyệt.',()=>
 <Pg group="Bán hàng" page="Khách hàng" sub="Bán hàng / Khách hàng / Quản lý" title="Sửa khách hàng KH-0102" actions={<><Ib>Hủy</Ib><Btn k="p">Lưu khách hàng</Btn></>}>
  <Cols rw={400} left={<>
   <Panel title="Thông tin khách"><Pair gap={16}><Tx label="Tên khách hàng" value="Công ty XD Bảo Long"/><Tx label="Mã khách" value="KH-0102" isDisabled/><Tx label="Điện thoại" value="0912 345 678" type="tel"/><Tx label="Email" value="ketoan@baolong.example"/><Tx label="Mã số thuế" value="0109 876 543"/><Sel label="Loại khách" value="Nhà thầu xây dựng"/><div style={{gridColumn:'1 / 3'}}><Tx label="Địa chỉ đăng ký" value="Số 8 Trần Phú, Hà Đông, Hà Nội"/></div></Pair></Panel>
   <Panel title="Công trình giao hàng" right={<Ib icon="PlusIcon">Thêm công trình</Ib>} pad={0}>
    <DT heads={['Tên công trình','Địa chỉ giao','Mặc định','']} widths={['1fr','1.2fr','90px','28px']} ctr={[2]} rows={[
     [<b>CT Hà Đông – Nhà xưởng Lô B</b>,'12 Quang Trung, Hà Đông',<Tag k="i">Mặc định</Tag>,<span title="Công trình mặc định không xóa được">{ic('LockClosedIcon',17,{color:MUTED})}</span>],
     [<b>CT Văn Quán – Chung cư mini</b>,'Ngõ 5 Văn Quán, Hà Đông','',ic('TrashIcon',18,{color:MUTED})],
     [<b>CT Thanh Oai – Kho lạnh</b>,'KCN Thanh Oai, Hà Nội','',ic('TrashIcon',18,{color:MUTED})]]}/></Panel>
   <Panel title="Bán hàng và công nợ"><Pair cols={2} gap={16}><Sel label="Nhóm giá" value="Nhóm giá Bảo Long"/><Sel label="Nhân viên bán hàng" value="Phạm Quang Huy"/><div><div className="hx-label" style={{marginBottom:6}}>Hạn mức nợ (₫)</div><Cell>200.000.000</Cell></div><div><div className="hx-label" style={{marginBottom:6}}>Hạn thanh toán (ngày)</div><Cell>30</Cell></div></Pair></Panel></>}
   right={<>
    <Panel title="Tạo tài khoản cổng hàng loạt" sub="Mỗi số điện thoại là một tài khoản cổng khách">
     <Stack gap={12}><SegmentedControl label="Vai trò" value="n" onChange={()=>{}}><SegmentedControlItem value="o" label="Chủ tài khoản"/><SegmentedControlItem value="p" label="Người lo tiền"/><SegmentedControlItem value="n" label="Người nhận hàng"/></SegmentedControl>
      <Ta label="Danh sách số điện thoại (mỗi dòng một số)" value={'0912 000 444\n0912 000 555\n0912 000 666'} rows={4}/>
      <Btn>Tạo 3 tài khoản</Btn><div style={{fontSize:13.5,color:MUTED}}>Mật khẩu tạm hiện một lần sau khi tạo; người dùng bắt buộc đổi ở lần đăng nhập đầu.</div></Stack></Panel>
    <Panel title="Đăng ký trùng số điện thoại" sub="Chờ văn phòng duyệt · 1" tone="warn">
     <div style={{display:'flex',gap:12}}>{ic('ExclamationTriangleIcon',22,{color:'#B25E00',marginTop:2})}<div><div style={{fontWeight:700}}>0912 000 111</div><div style={{fontSize:14,color:MUTED,margin:'2px 0 10px'}}>Đăng ký từ cổng khách lúc 08:12, trùng với tài khoản của Nguyễn Văn Dũng.</div><div style={{display:'flex',gap:8}}><Btn>Duyệt và gộp</Btn><Btn k="d">Từ chối</Btn></div></div></div></Panel></>}/></Pg>);

/* ================= HỘP THOẠI TÀI KHOẢN CỔNG ================= */
def('admin-customer-portal-account','Popup trong /admin/customers/:id','Dialog Wizard','Tạo tài khoản/đặt lại mật khẩu: hiện tên đăng nhập và mật khẩu tạm đúng một lần kèm Chép nội dung; mật khẩu tạm bắt đổi lần đầu.',()=>
 <div style={{position:'relative',width:1280,overflow:'hidden',height:1180}}>
  <Customer360/>
  <div style={{position:'absolute',inset:0,background:'rgba(16,34,58,.52)',display:'flex',justifyContent:'center',alignItems:'flex-start',paddingTop:96}}>
   <Dlg w={560} title="Đã tạo tài khoản cổng khách" sub="Người nhận hàng · Nguyễn Văn Dũng" icon={<span style={{width:40,height:40,borderRadius:12,background:'#E6F0FB',color:BLUE,display:'flex',alignItems:'center',justifyContent:'center'}}>{ic('KeyIcon',22)}</span>}
    foot={<><Ib icon="ClipboardDocumentIcon">Chép nội dung gửi khách</Ib><Btn k="p">Xong</Btn></>}>
    <Stack gap={14}>
     <Banner status="warning" title="Mật khẩu tạm chỉ hiện một lần" description="Hãy chép gửi cho khách ngay. Đóng hộp thoại này sẽ không xem lại được; khi cần chỉ có thể đặt lại mật khẩu." collapsible={false}/>
     <div style={{border:'1px solid '+LINE,borderRadius:12,overflow:'hidden'}}>
      {[['Tên đăng nhập','0912 000 111',false],['Mật khẩu tạm','Kx7-pQ29-mWz4',true]].map(([l,v,big],i)=><div key={l} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderTop:i?'1px solid '+LINE:'0',background:big?'#F4F8FD':'#fff'}}>
       <span style={{width:130,fontSize:14,color:MUTED,fontWeight:600}}>{l}</span><span style={{flex:1,fontFamily:'ui-monospace,Menlo,monospace',fontSize:big?22:17,fontWeight:700,letterSpacing:big?1:0}}>{v}</span><Ib icon="ClipboardDocumentIcon">Chép</Ib></div>)}</div>
     <Pair gap={12}><Sel label="Vai trò trong cổng" value="Người nhận hàng"/><Sel label="Công trình được xem" value="CT Hà Đông – Nhà xưởng Lô B"/></Pair>
     <div style={{display:'flex',gap:8,fontSize:14,color:MUTED}}>{ic('InformationCircleIcon',18)}Lần đăng nhập đầu, khách bắt buộc đổi mật khẩu mới.</div></Stack></Dlg></div></div>);
