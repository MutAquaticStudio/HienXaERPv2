import React from 'react';
import {Chip,Btn,Btn0,Button,Banner,Icon,Stepper,Step,SegmentedControl,SegmentedControlItem,HI,
 mk,ic,cd,m,Tx,Sel,Ta,Cb,Sw,Panel,Row,Pair,Stack,Cols,Fact,FactRow,DT,Hl,Cell,Nm,Tag,Go,Ib,Wide,Band,PT,Pg,Flow,Bar,Dlg,Lock,Link,Sum,Dot,Thumb,
 MUTED,LINE,INK,BLUE,GREEN,AMBER,RED} from './kit.jsx';
import {ListPage} from '../lib.jsx';

export const M=[]; const def=mk(M);
const n=x=>x.toLocaleString('vi-VN');

/* ============ FORM ĐƠN MUA ============ */
function PoForm({edit}){
 const L=edit?[
  ['XM-PC40','Xi măng PC40 Hoàng Thạch','Bao 50 kg',1000,78000,'Giá mua gợi ý 78.000 · 12/11',null],
  ['XM-PC30','Xi măng PC30 Hoàng Thạch','Bao 50 kg',500,72000,'Giá mua gợi ý 72.000 · 12/11',null]]
 :[['TH-D12','Thép cuộn phi 12 Hòa Phát','Cây 11,7 m',30,95400,'Giá mua gợi ý 95.400 · 15/11','SO-0232 · dòng 1'],
  ['TH-D16','Thép cuộn phi 16 Hòa Phát','Cây 11,7 m',100,168000,'Giá mua gợi ý 168.000 · 15/11',null]];
 const tot=L.reduce((a,l)=>a+l[3]*l[4],0);
 const rows=L.map((l,i)=>[<span style={{color:MUTED}}>{i+1}</span>,<Nm n={l[1]} sub={<>{l[0]} · {l[2]}</>} tag={<Tag k="i">{l[5]}</Tag>}/>,<Cell>{n(l[3])}</Cell>,<Cell>{n(l[4])}</Cell>,<b>{n(l[3]*l[4])}</b>,
  l[6]?<div><Tag k="w">{ic('TruckIcon',14)}Giao thẳng</Tag><div style={{fontSize:13,color:'#0B5CB8',fontWeight:600,marginTop:3}}>{l[6]}</div></div>:<Tag k="g">Về kho Đại Mỗ</Tag>,<span style={{color:MUTED}}>{ic('XMarkIcon',18)}</span>]);
 return <Pg group="Mua hàng" page="Đơn mua" sub={edit?'Mua hàng / Đơn mua / PO-0089 / Sửa':'Mua hàng / Đơn mua / Tạo mới'} title={edit?'Sửa đơn mua PO-0089':'Tạo đơn mua'} chips={<Chip k="g">{edit?'Nháp · phiên bản 2':'Chưa lưu'}</Chip>}
  banner={edit?<Banner status="info" title="Chỉ sửa được khi chưa nhận hàng" description="Đơn này chưa có phiếu nhận. Khi lưu, hệ thống gửi kèm phiên bản 2; nếu người khác đã sửa trước, bạn sẽ được báo để tải lại." collapsible={false}/>:null}>
  <Cols left={<>
   <div className="hx-card" style={{overflow:'hidden'}}>
    <Band ph="Tìm vật tư của nhà cung cấp (F3) · mã, tên" wh="Kho Đại Mỗ"/>
    <DT heads={['#','Vật tư','Số lượng','Giá mua','Thành tiền','Nguồn nhận','']} widths={['28px','1fr','92px','96px','112px','116px','24px']} num={[2,3,4]} rows={rows}
     foot={<div style={{padding:'11px 16px',borderTop:'1px solid '+LINE,display:'flex',gap:10,alignItems:'center',color:MUTED,fontSize:13.5,background:'#FBFCFE'}}>{ic('LinkIcon',16,{color:BLUE})}<span>Giá mua gợi ý lấy từ bảng giá mua của nhà cung cấp. {edit?'Bấm tên dòng để liên kết với dòng đơn bán khi NCC giao thẳng công trình.':'Mỗi dòng đơn bán chỉ liên kết với một đơn mua; dòng đã có đơn mua sẽ báo trùng.'}</span></div>}/></div>
   <Panel title="Giao nhận và điều khoản"><Pair cols={3}><Tx label="Ngày dự kiến giao" value="21/11/2026"/><Sel label="Nhận hàng về" value="Kho Đại Mỗ"/><Sel label="Thanh toán" value="Công nợ 15 ngày"/></Pair>
    <div style={{marginTop:14}}><Ta label="Ghi chú cho nhà cung cấp" value="Giao trong giờ hành chính. Dòng thép phi 12 giao thẳng công trình của khách (đơn SO-0232), gọi chị Hương 0977 222 333 trước khi tới." rows={2}/></div></Panel></>}
   right={<div style={{position:'sticky',top:16,display:'flex',flexDirection:'column',gap:16}}>
    <Panel title="Nhà cung cấp"><Stack gap={12}><Sel label="Nhà cung cấp" value={edit?'NCC-004 · Xi măng Hoàng Thạch':'NCC-012 · Thép Hòa Phát'}/>
     <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Tag k="i">Có bảng giá mua</Tag><Tag k="g">Công nợ hiện tại 98.100.000 ₫</Tag></div></Stack></Panel>
    <Panel title="Giá trị đơn mua" pad={0}><div style={{padding:'10px 16px 14px'}}><Row l={`Tạm tính (${L.length} dòng)`} v={m(tot)}/><Row big border l="Tổng đơn mua" v={m(tot)} c={BLUE}/><Row l="Ghi nhận công nợ phải trả" v="Khi nhận hàng"/></div>
     <div style={{padding:'12px 16px 16px',display:'flex',flexDirection:'column',gap:10,borderTop:'1px solid '+LINE}}><Wide k="g" icon="CheckCircleIcon">Xác nhận đặt hàng</Wide><Wide icon="DocumentTextIcon">Lưu nháp</Wide>
      <div style={{fontSize:13,color:MUTED,lineHeight:1.45}}>Chưa ghi tồn kho hay công nợ. Hai khoản này chỉ ghi khi nhận hàng.</div></div></Panel></div>}/></Pg>;
}
def('admin-po-new','/admin/purchase-orders/new','Checkout Form','Chọn NCC, giá mua gợi ý từ bảng giá mua; dòng có thể liên kết đơn bán (NCC giao thẳng công trình); Lưu nháp khác Xác nhận đặt hàng.',()=><PoForm/>);
def('admin-po-edit','/admin/purchase-orders/:id/edit','Checkout Form','Chỉ sửa khi chưa nhận hàng; gửi kèm expectedVersion, xung đột phiên bản báo rõ.',()=><PoForm edit/>);

/* ============ CHI TIẾT ĐƠN MUA ============ */
def('admin-po-detail','/admin/purchase-orders/:id','Order Detail','Nhận hàng ghi tồn và công nợ phải trả theo phần nhận; NCC giao thẳng thì Ghi nhận đã giao đồng bộ đơn mua và đơn bán; Gửi NCC qua Zalo là nút gửi tay.',()=>{
 const rows=[
  [<Nm n="Thép cuộn phi 16 Hòa Phát" sub="TH-D16 · Cây 11,7 m" tag={<Tag k="g">Về kho Đại Mỗ</Tag>}/>,'540',<Bar v={300} max={540} l={<span style={{fontSize:13}}>Nhận một phần</span>} r="300/540"/>,'168.000','90.720.000'],
  [<Nm n="Thép cuộn phi 16 Hòa Phát" sub="TH-D16 · Cây 11,7 m" tag={<Tag k="w">{ic('TruckIcon',14)}Giao thẳng SO-0231</Tag>}/>,'60',<Bar v={0} max={60} l={<span style={{fontSize:13}}>Chờ NCC giao</span>} r="0/60"/>,'168.000','10.080.000'],
  [<Nm n="Thép cuộn phi 12 Hòa Phát" sub="TH-D12 · Cây 11,7 m" tag={<Tag k="g">Về kho Đại Mỗ</Tag>}/>,'500',<Bar v={500} max={500} k="success" l={<span style={{fontSize:13}}>Đã nhận đủ</span>} r="500/500"/>,'95.400','47.700.000']];
 return <Pg group="Mua hàng" page="Đơn mua" sub="Mua hàng / Đơn mua / PO-0087" title="PO-0087" chips={<Chip k="w">Nhận một phần</Chip>}
  actions={<><Ib icon="ChatBubbleLeftRightIcon">Gửi NCC qua Zalo</Ib><Ib icon="PrinterIcon">In A4</Ib><Ib k="p" icon="ArchiveBoxArrowDownIcon">Nhận hàng</Ib></>}>
  <FactRow items={[{l:'Nhà cung cấp',v:'Thép Hòa Phát',sub:'NCC-012 · Công nợ 15 ngày',flex:1.3},{l:'Ngày đặt',v:'17/11/2026',sub:'Người đặt: Đỗ Thu Hà'},{l:'Dự kiến giao hết',v:'20/11/2026',sub:'Dòng giao thẳng: 20/11'},{l:'Nhận hàng về',v:'Kho Đại Mỗ',sub:'và giao thẳng 60 cây'}]}/>
  <Cols left={<>
   <Panel title="Dòng hàng đặt" sub="3 dòng · nhận hàng tới đâu ghi tồn và công nợ tới đó" pad={0}>
    <DT heads={['Vật tư','SL đặt','Đã nhận','Giá mua','Thành tiền']} widths={['1fr','60px','170px','80px','108px']} num={[1,3,4]} rows={rows}
     foot={<div style={{padding:'11px 16px',borderTop:'1px solid '+LINE,fontSize:14,color:MUTED}}>Tổng đơn mua 148.500.000 ₫ · công nợ chỉ ghi theo phần đã nhận</div>}/></Panel>
   <Panel tone="warn" title="NCC giao thẳng công trình" sub="Dòng liên kết với đơn bán SO-0231" right={<Ib icon="CheckCircleIcon">Ghi nhận đã giao</Ib>}>
    <div style={{display:'flex',gap:18,alignItems:'center'}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:15.5}}>60 cây Thép cuộn phi 16 · giao đến CT Hà Đông – Nhà xưởng Lô B</div><div style={{fontSize:14,color:MUTED,marginTop:3}}>Khi NCC giao xong, bấm <b style={{color:INK}}>Ghi nhận đã giao</b>: đơn mua và đơn bán SO-0231 cùng được cập nhật một lần, hàng không đi qua kho.</div></div>
     <Tag k="w">Phiếu giao PG-0119 · Chờ phân giao</Tag></div></Panel>
   <Panel title="Lịch sử nhận hàng" pad={0}><DT heads={['Phiếu nhận','Ngày','Vật tư','Số lượng','Giá trị']} widths={['100px','100px','1fr','90px','112px']} num={[3,4]} rows={[[cd('NH-0211'),'18/11/2026','Thép phi 12 · Kho Đại Mỗ','500','47.700.000'],[cd('NH-0212'),'19/11/2026','Thép phi 16 · Kho Đại Mỗ','300','50.400.000']]}/></Panel></>}
   right={<>
    <Panel title="Tiến trình đơn mua"><Flow steps={['Nháp','Đã đặt','Nhận một phần','Đã nhận đủ']} at={2}/></Panel>
    <Panel title="Công nợ phải trả của đơn" pad={0}><div style={{padding:'10px 16px 14px'}}><Row l="Đã ghi theo phần nhận" v={m(98100000)} b/><Row l="Chưa nhận, chưa ghi nợ" v={m(50400000)}/><Row big border l="Tổng đơn mua" v={m(148500000)} c={BLUE}/></div></Panel>
    <Panel title="Gửi nhà cung cấp qua Zalo" sub="Chỉ gửi khi bạn bấm, không tự gửi">
     <div style={{background:'#F2F5F9',borderRadius:10,padding:'12px 14px',fontSize:14,lineHeight:1.5,color:INK}}>Chào anh, Hiền Xa gửi đơn mua PO-0087 gồm 3 dòng thép, dự kiến giao 20/11. Dòng phi 16 (60 cây) giao thẳng công trình Hà Đông.</div>
     <div style={{marginTop:12}}><Ib icon="ChatBubbleLeftRightIcon">Mở Zalo để gửi</Ib></div></Panel></>}/></Pg>;});

/* ============ NHÀ CUNG CẤP ============ */
def('admin-supplier-detail','/admin/suppliers/:id','Collapsible Table + Two-column Form','Hồ sơ, công nợ phải trả, bảng giá mua của NCC theo nhóm vật tư (mở rộng được); tạo/sửa cần purchasing.manage.',()=>{
 const grp=(t,c,open,rows)=><div style={{borderTop:'1px solid '+LINE}}><div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:open?'#F4F8FD':'#fff'}}>{ic(open?'ChevronDownIcon':'ChevronRightIcon',18,{color:BLUE})}<b style={{flex:1,fontSize:15}}>{t}</b><span style={{color:MUTED,fontSize:13.5}}>{c}</span></div>
  {open&&<DT heads={['Vật tư','ĐVT','Giá mua','Hiệu lực từ']} widths={['1fr','90px','110px','110px']} num={[2]} rows={rows}/>}</div>;
 return <Pg group="Mua hàng" page="Nhà cung cấp" sub="Mua hàng / Nhà cung cấp / NCC-012" title="Thép Hòa Phát" chips={<Chip k="s">Đang hợp tác</Chip>} actions={<><Ib icon="PencilSquareIcon">Quản lý</Ib><Go icon="PlusIcon">Đặt hàng mới</Go></>}>
  <Cols left={<>
   <Panel title="Hồ sơ"><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'18px 24px'}}><Fact l="Mã NCC" v={cd('NCC-012')}/><Fact l="Người liên hệ" v="Anh Vũ Hoàng Long" sub="0968 321 456"/><Fact l="Email" v="ban-hang@hp-demo.example"/><Fact l="Mã số thuế" v="0105 432 109"/><Fact l="Thanh toán" v="Công nợ 15 ngày"/><Fact l="Giao hàng" v="Giao về kho hoặc giao thẳng công trình"/></div></Panel>
   <Panel title="Bảng giá mua" sub="Giá hiện hành theo nhóm vật tư" right={<Ib icon="ArrowTopRightOnSquareIcon">So sánh giá mua</Ib>} pad={0}>
    {grp('Thép cuộn','5 vật tư',true,[['Thép cuộn phi 10','Cây 11,7 m','69.500','15/11/2026'],['Thép cuộn phi 12','Cây 11,7 m','95.400','15/11/2026'],['Thép cuộn phi 14','Cây 11,7 m','128.000','15/11/2026'],['Thép cuộn phi 16','Cây 11,7 m','168.000','15/11/2026'],['Thép cuộn phi 18','Cây 11,7 m','212.000','15/11/2026']])}
    {grp('Thép hình','6 vật tư',false)}{grp('Thép buộc, phụ kiện','3 vật tư',false)}</Panel>
   <Panel title="Đơn mua gần đây" pad={0}><DT heads={['Mã','Ngày đặt','Trạng thái','Tổng tiền']} widths={['110px','120px','1fr','130px']} num={[3]} rows={[[cd('PO-0087'),'17/11/2026',<Chip k="w">Nhận một phần</Chip>,'148.500.000'],[cd('PO-0079'),'08/11/2026',<Chip k="s">Đã nhận đủ</Chip>,'92.300.000'],[cd('PO-0071'),'01/11/2026',<Chip k="s">Đã nhận đủ</Chip>,'61.800.000']]}/></Panel></>}
   right={<>
    <Panel title="Công nợ phải trả"><Stack gap={14}><div><div style={{fontSize:13,color:MUTED,fontWeight:600}}>Còn phải trả</div><div className="hx-num" style={{fontSize:30,fontWeight:800,textAlign:'left',lineHeight:1.2}}>98.100.000 ₫</div></div>
     <div style={{borderTop:'1px solid '+LINE,paddingTop:10}}><Row l="Trong hạn" v={m(98100000)}/><Row l="Quá hạn" v="0 ₫"/><Row l="Hạn gần nhất" v="02/12/2026"/></div></Stack></Panel>
    <Panel title="Gán vật tư cho NCC"><div style={{fontSize:14.5}}>13 vật tư được gán · <b style={{color:'#B25E00'}}>2 vật tư chưa có giá mua</b></div><div style={{marginTop:12}}><Ib>Mở bảng giá mua</Ib></div></Panel></>}/></Pg>;});

def('admin-supplier-manage','/admin/suppliers/manage','Two-column Form','Tạo và sửa nhà cung cấp (purchasing.manage); gán vật tư cho NCC để đưa vào bảng giá mua.',()=>
 <Pg group="Mua hàng" page="Nhà cung cấp" sub="Mua hàng / Nhà cung cấp / Quản lý" title="Sửa nhà cung cấp NCC-012" actions={<><Ib>Hủy</Ib><Btn k="p">Lưu nhà cung cấp</Btn></>}>
  <Cols rw={400} left={<>
   <Panel title="Thông tin nhà cung cấp"><Pair gap={16}><Tx label="Tên nhà cung cấp" value="Thép Hòa Phát"/><Tx label="Mã NCC" value="NCC-012" isDisabled/><Tx label="Người liên hệ" value="Anh Vũ Hoàng Long"/><Tx label="Điện thoại" value="0968 321 456" type="tel"/><Tx label="Email" value="ban-hang@hp-demo.example"/><Tx label="Mã số thuế" value="0105 432 109"/><div style={{gridColumn:'1 / 3'}}><Tx label="Địa chỉ" value="KCN Quang Minh, Mê Linh, Hà Nội"/></div></Pair></Panel>
   <Panel title="Điều khoản mua hàng"><Pair gap={16}><Sel label="Thanh toán" value="Công nợ 15 ngày"/><Sel label="Hình thức giao" value="Giao về kho hoặc giao thẳng công trình"/></Pair><div style={{marginTop:14}}><Ta label="Ghi chú nội bộ" value="Đặt trước 16:00 thì giao trong ngày. Đơn trên 100 triệu gọi xác nhận lại." rows={2}/></div></Panel></>}
   right={<Panel title="Vật tư NCC này cung cấp" sub="13 vật tư · tích để gán vào bảng giá mua" right={<Tag k="w">2 chưa có giá</Tag>}>
    <Stack gap={4}>{[['Thép cuộn phi 10',true],['Thép cuộn phi 12',true],['Thép cuộn phi 14',true],['Thép cuộn phi 16',true],['Thép cuộn phi 20',true],['Thép hộp 40×80',false],['Thép buộc 1 ly',false]].map(([t,v])=><div key={t} style={{padding:'4px 0',borderBottom:'1px solid '+LINE}}><Cb value={v} label={t}/></div>)}</Stack></Panel>}/></Pg>);

/* ============ GIÁ MUA (SO SÁNH) ============ */
def('admin-supplier-pricing','/admin/suppliers/pricing','Comparison Table','So sánh giá mua theo từng NCC (ô giá là ô nhập), đánh dấu NCC rẻ nhất, lọc Chỉ dòng chưa có giá; sửa tay thì ghi lịch sử, không xóa bản cũ.',()=>{
 const P=(v,best)=>v?<Cell k={best?'b':undefined}>{n(v)}</Cell>:<div style={{display:'flex',justifyContent:'flex-end'}}><span style={{border:'1.5px dashed #F3B64F',background:'#FFF8E8',color:'#7A4300',fontWeight:600,fontSize:14,padding:'6px 10px',borderRadius:8}}>Chưa có giá</span></div>;
 const D=[['Thép cuộn phi 10',69500,68000,69000],['Thép cuộn phi 12',95400,96200,94800],['Thép cuộn phi 14',128000,126500,null],['Thép cuộn phi 16',168000,170500,169000],['Thép cuộn phi 18',212000,209500,211000],['Thép cuộn phi 20',null,258000,255500],['Thép buộc 1 ly (cuộn)',26800,null,26500]];
 const rows=D.map(r=>{const v=r.slice(1).filter(Boolean);const mn=Math.min(...v);const bi=r.slice(1).indexOf(mn);const nm=['Thép Hòa Phát','Thép Việt Đức','Thép Pomina'][bi];
  return [<Nm n={r[0]} sub="Cây 11,7 m"/>,P(r[1],r[1]===mn),P(r[2],r[2]===mn),P(r[3],r[3]===mn),<div style={{textAlign:'right',color:'#0A4A96'}}><div style={{fontWeight:700,display:'flex',justifyContent:'flex-end',gap:6,alignItems:'center'}}>{ic('CheckIcon',15)}{nm}</div><div style={{fontSize:13.5,color:MUTED}}>{n(mn)} ₫</div></div>]});
 return <Pg group="Mua hàng" page="Nhà cung cấp" sub="Mua hàng / Nhà cung cấp / Giá mua" title="Giá mua theo nhà cung cấp" actions={<><Ib icon="ClockIcon">Lịch sử giá mua</Ib><span style={{opacity:.42}}><Btn k="p">Lưu bảng giá</Btn></span></>}>
  <div style={{display:'flex',gap:14,alignItems:'flex-end',marginBottom:16}}>
   <div style={{width:300}}><Tx label="Tìm vật tư" value="" placeholder="Mã hoặc tên vật tư"/></div><div style={{width:240}}><Sel label="Nhóm vật tư" value="Thép cuộn"/></div>
   <div style={{flex:1}}/><div style={{background:'#fff',border:'1px solid '+LINE,borderRadius:10,padding:'8px 14px'}}><Sw value={false} label="Chỉ dòng chưa có giá"/></div></div>
  <div className="hx-card" style={{overflow:'hidden'}}>
   <DT heads={['Vật tư','Thép Hòa Phát','Thép Việt Đức','Thép Pomina','NCC rẻ nhất']} widths={['1.2fr','150px','150px','150px','190px']} num={[1,2,3,4]} rows={rows}
    foot={<Sum><span style={{color:MUTED}}>7 vật tư · <b style={{color:'#B25E00'}}>3 ô chưa có giá</b> · bấm vào ô giá để sửa; Lưu bảng giá sáng khi có thay đổi</span><span style={{display:'flex',gap:14,color:MUTED,fontSize:14}}><span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:14,height:14,borderRadius:4,background:'#E6F0FB',border:'1.5px solid '+BLUE}}/>NCC rẻ nhất</span><span style={{display:'flex',alignItems:'center',gap:6}}><Dot k="w"/>Chưa có giá</span></span></Sum>}/></div>
 </Pg>;});

/* ============ TRẢ HÀNG NCC ============ */
def('admin-purchase-return-new','/admin/purchases/returns/new','Form Wizard','Hai bước: chọn đơn mua đã nhận và lý do, rồi chọn dòng và số lượng trả; xử lý tồn kho và công nợ phải trả đúng nguồn, bắt buộc có lý do.',()=>
 <Pg group="Mua hàng" page="Trả hàng NCC" sub="Mua hàng / Trả hàng NCC / Tạo mới" title="Tạo phiếu trả hàng nhà cung cấp" actions={<><Ib icon="ArrowLeftIcon">Quay lại bước 1</Ib><Btn k="p">Tạo phiếu trả hàng</Btn></>}>
  <div className="hx-card" style={{padding:'18px 28px',marginBottom:16}}><Stepper activeStep={1} label="Các bước tạo phiếu trả"><Step step={0} label="Đơn mua và lý do"/><Step step={1} label="Chọn hàng trả"/></Stepper></div>
  <Cols rw={380} left={<>
   <FactRow items={[{l:'Đơn mua đã nhận',v:'PO-0086',sub:'Nhận ngày 12/11/2026',flex:.8},{l:'Nhà cung cấp',v:'Cát Sông Hồng',sub:'NCC-021',flex:1},{l:'Lý do trả hàng',v:'Hàng không đạt chất lượng',sub:'Cát lẫn nhiều sét, khách phản ánh',flex:1.4}]}/>
   <Panel title="Chọn dòng và số lượng trả" sub="Chỉ trả được tối đa số đã nhận trừ phần đã trả trước đó" pad={0}>
    <DT heads={['Vật tư','Đã nhận','Đã trả trước','Trả lần này','Giá mua','Giá trị trả']} widths={['1fr','74px','90px','110px','84px','110px']} num={[1,2,3,4,5]} rows={[
     {bg:'#F4F8FD',cells:[<Nm n="Cát xây Sông Hồng" sub="CAT-X · m³ · về Kho Đại Mỗ"/>,'60','0',<Cell hint="m³">5</Cell>,'340.000',<b>1.700.000</b>]},
     [<Nm n="Cát đen san lấp" sub="CAT-D · m³ · về Kho Đại Mỗ"/>,'15','0',<Cell hint="m³">0</Cell>,'260.000','0'],
     {total:true,cells:['Tổng giá trị trả','','','','',<span style={{fontSize:16}}>1.700.000 ₫</span>]}]}/></Panel>
   <Panel title="Ghi chú cho nhà cung cấp"><Ta label="Nội dung" value="Trả 5 m³ cát xây lẫn sét theo biên bản kiểm hàng ngày 12/11, trừ vào công nợ." rows={2}/></Panel></>}
   right={<Panel title="Ảnh hưởng khi tạo phiếu" sub="Ghi sổ một lần, không sửa sau khi tạo">
    <Stack gap={16}>{[['ArchiveBoxIcon','Tồn kho','Kho Đại Mỗ · Cát xây Sông Hồng','−5 m³','từ 86,5 xuống 81,5 m³'],['BanknotesIcon','Công nợ phải trả','Cát Sông Hồng','−1.700.000 ₫','từ 24.300.000 xuống 22.600.000 ₫']].map(([i,t,s,v,d])=><div key={t} style={{display:'flex',gap:12}}><span style={{width:36,height:36,borderRadius:10,background:'#E6F0FB',color:BLUE,display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{ic(i,20)}</span>
     <div style={{flex:1}}><div style={{fontWeight:700}}>{t}</div><div style={{fontSize:13.5,color:MUTED}}>{s}</div><div style={{fontWeight:800,fontSize:18,color:RED,marginTop:2}}>{v}</div><div style={{fontSize:13.5,color:MUTED}}>{d}</div></div></div>)}</Stack></Panel>}/></Pg>);

def('admin-purchase-return-detail','/admin/purchases/returns/:id','Order Detail','Phiếu trả gắn với đơn mua đã nhận; đã ghi giảm tồn kho và công nợ phải trả; có lý do, không sửa sau khi ghi sổ.',()=>
 <Pg group="Mua hàng" page="Trả hàng NCC" sub="Mua hàng / Trả hàng NCC / TH-0012" title="TH-0012" chips={<Chip k="s">Đã ghi sổ</Chip>} actions={<><Ib icon="PrinterIcon">In A4</Ib><Ib icon="ArrowTopRightOnSquareIcon">Mở đơn mua PO-0086</Ib></>}>
  <FactRow items={[{l:'Nhà cung cấp',v:'Cát Sông Hồng',sub:'NCC-021',flex:1},{l:'Đơn mua gốc',v:cd('PO-0086'),sub:'Nhận ngày 12/11/2026'},{l:'Ngày trả',v:'13/11/2026',sub:'Người tạo: Đỗ Thu Hà'},{l:'Lý do',v:'Hàng không đạt chất lượng',flex:1.3}]}/>
  <Cols left={<>
   <Panel title="Hàng đã trả" pad={0}><DT heads={['Vật tư','SL trả','Giá mua','Giá trị trả','Kho']} widths={['1fr','80px','90px','120px','130px']} num={[1,2,3]} rows={[[<Nm n="Cát xây Sông Hồng" sub="CAT-X · m³"/>,'5','340.000','1.700.000',<Tag k="g">Kho Đại Mỗ</Tag>],{total:true,cells:['Tổng giá trị trả','','','1.700.000 ₫','']}]}/></Panel>
   <Panel title="Ghi chú"><div style={{fontSize:15,lineHeight:1.55}}>Trả 5 m³ cát xây lẫn sét theo biên bản kiểm hàng ngày 12/11, trừ vào công nợ.</div></Panel></>}
   right={<>
    <Panel title="Đã ghi sổ"><Stack gap={16}>{[['ArchiveBoxIcon','Tồn kho Kho Đại Mỗ','−5 m³ Cát xây Sông Hồng'],['BanknotesIcon','Công nợ phải trả Cát Sông Hồng','−1.700.000 ₫']].map(([i,t,v])=><div key={t} style={{display:'flex',gap:12}}><span style={{width:36,height:36,borderRadius:10,background:'#E5F4EC',color:GREEN,display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{ic(i,20)}</span><div><div style={{fontWeight:700}}>{t}</div><div style={{fontSize:15,color:INK}}>{v}</div></div></div>)}</Stack></Panel>
    <Panel title="Nhật ký"><Stack gap={12}>{[['13/11 10:02','Ghi sổ phiếu trả hàng'],['13/11 09:58','Tạo phiếu trả hàng']].map(([t,a],i)=><div key={t} style={{display:'flex',gap:10}}><Dot k={i?'g':'s'}/><div style={{marginTop:-4}}><div style={{fontWeight:600,fontSize:14.5}}>{a}</div><div style={{fontSize:13,color:MUTED}}>{t} · Đỗ Thu Hà</div></div></div>)}</Stack></Panel></>}/></Pg>);

/* ============ ĐỐI CHIẾU HÓA ĐƠN ============ */
def('admin-matching-list','/admin/invoices/matching','Searchable Table','Danh sách hóa đơn mua cần đối chiếu với đơn mua đã nhận: Khớp, Có chênh lệch, Chờ duyệt, Đã duyệt.',()=>
 <ListPage group="Mua hàng" page="Hóa đơn mua" title="Đối chiếu hóa đơn mua" sub="Mua hàng / Hóa đơn mua / Đối chiếu" actions={<Ib icon="ArrowDownTrayIcon">Xuất Excel</Ib>} search="Tìm số hóa đơn, nhà cung cấp, mã đơn mua"
  filters={[['Tất cả',27],['Khớp',14],['Có chênh lệch',6],['Chờ duyệt',3],['Đã duyệt',4]]}
  cols={[{h:''},{h:'Hóa đơn'},{h:'Nhà cung cấp'},{h:'Đơn mua'},{h:'Trạng thái'},{h:'Chênh lệch',num:1}]} widths={['28px','130px','1.4fr','110px','150px','130px']}
  rows={[['›',cd('HĐ 0001234'),'Gạch Đồng Tâm',cd('PO-0085'),<Chip k="w">Có chênh lệch</Chip>,<b style={{color:'#B25E00'}}>+500.000 ₫</b>],['›',cd('HĐ 0000871'),'Thép Hòa Phát',cd('PO-0079'),<Chip k="i">Chờ duyệt</Chip>,<b style={{color:'#B25E00'}}>−120.000 ₫</b>],['›',cd('HĐ 0004410'),'Xi măng Hoàng Thạch',cd('PO-0081'),<Chip k="s">Khớp</Chip>,'0 ₫'],['›',cd('HĐ 0000866'),'Gạch Tuynel Thanh Xuân',cd('PO-0076'),<Chip k="s">Đã duyệt</Chip>,'0 ₫'],['›',cd('HĐ 0002201'),'Đá Hòa Bình',cd('PO-0074'),<Chip k="s">Khớp</Chip>,'0 ₫']]}/>);

def('admin-matching-detail','/admin/invoices/matching/:id','Vertical Wizard','Đối chiếu hóa đơn NCC với đơn mua đã nhận: ô lệch nền vàng, dòng tổng; chỉ gắn minh chứng, không tự sửa số tiền.',()=>{
 const Y=(a,b,w)=>w?<Hl>{a}</Hl>:a;
 const rows=[
  [<Nm n="Gạch ống 4 lỗ Đồng Tâm" sub="GACH-4L · Viên"/>,'20.000',<Hl>20.200</Hl>,'1.500','1.500','30.000.000',<Hl>30.300.000</Hl>,<Hl>+300.000</Hl>],
  [<Nm n="Gạch block bê tông" sub="GACH-BL · Viên"/>,'5.000','5.000','1.740',<Hl>1.780</Hl>,'8.700.000',<Hl>8.900.000</Hl>,<Hl>+200.000</Hl>],
  {total:true,cells:['Tổng cộng','25.000','25.200','','','38.700.000','39.200.000',<Hl>+500.000</Hl>]}];
 return <Pg group="Mua hàng" page="Hóa đơn mua" sub="Mua hàng / Hóa đơn mua / Đối chiếu / HĐ 0001234" title="Đối chiếu HĐ 0001234" chips={<Chip k="w">Có chênh lệch</Chip>} actions={<><Ib icon="PhotoIcon">Gắn minh chứng</Ib><Btn k="p">Gửi duyệt chênh lệch</Btn></>}>
  <FactRow items={[{l:'Nhà cung cấp',v:'Gạch Đồng Tâm',sub:'NCC-017'},{l:'Hóa đơn',v:'HĐ 0001234',sub:'Ngày 13/11/2026'},{l:'Đơn mua đã nhận',v:cd('PO-0085'),sub:'Nhận ngày 12/11/2026'},{l:'Chênh lệch hóa đơn − đơn mua',v:<span style={{color:'#B25E00'}}>+500.000 ₫</span>,sub:'2 dòng lệch'}]}/>
  <div className="hx-card" style={{overflow:'hidden',marginBottom:16}}>
   <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',borderBottom:'1px solid '+LINE}}>{[['Đơn mua PO-0085 · nhận thực tế','#F7F9FC'],['Hóa đơn HĐ 0001234 · NCC xuất','#FFF8E8']].map(([t,bg],i)=><div key={t} style={{padding:'10px 16px',fontWeight:700,fontSize:14,background:bg,borderLeft:i?'1px solid '+LINE:0}}>{t}</div>)}</div>
   <DT heads={['Vật tư','SL nhận','SL hóa đơn','Giá đơn mua','Giá hóa đơn','Thành tiền đơn','Thành tiền HĐ','Chênh lệch']} widths={['1.3fr','80px','100px','110px','110px','120px','120px','110px']} num={[1,2,3,4,5,6,7]} rows={rows}/></div>
  <Cols rw={420} left={<Panel title="Cách xử lý chênh lệch"><Stack gap={12}>{[['1','Kiểm tra với NCC','Dòng Gạch ống hóa đơn nhiều hơn thực nhận 200 viên; dòng Gạch block lệch giá 40 ₫/viên.'],['2','Gắn minh chứng','Ảnh hóa đơn, biên bản nhận hàng hoặc tin nhắn xác nhận của NCC.'],['3','Gửi duyệt','Người có quyền duyệt chênh lệch xem và quyết định; công nợ phải trả vẫn theo đơn mua cho tới khi duyệt.']].map(([k,t,d])=><div key={k} style={{display:'flex',gap:12}}><span style={{width:26,height:26,borderRadius:'50%',background:'#E6F0FB',color:'#0A4A96',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flex:'none'}}>{k}</span><div><div style={{fontWeight:700,fontSize:15}}>{t}</div><div style={{fontSize:14,color:MUTED}}>{d}</div></div></div>)}</Stack></Panel>}
   right={<Panel title="Minh chứng" sub="Chỉ gắn kèm, không tự sửa số tiền"><Thumb label="Ảnh hóa đơn HĐ 0001234 (1 tệp)" h={150}/><div style={{marginTop:12,fontSize:13.5,color:MUTED,display:'flex',gap:8}}>{ic('LockClosedIcon',16)}Số tiền trong đơn mua không bị thay đổi bởi đối chiếu.</div></Panel>}/></Pg>;});
