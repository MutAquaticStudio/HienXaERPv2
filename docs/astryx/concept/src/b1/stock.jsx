import React from 'react';
import {Chip,Btn,Banner,Stepper,Step,SegmentedControl,SegmentedControlItem,Button,Icon,HI,
 mk,ic,cd,m,Tx,Sel,Ta,Cb,Sw,Panel,Row,Pair,Stack,Cols,Fact,FactRow,DT,Hl,Cell,Nm,Tag,Go,Ib,Wide,Band,PT,Pg,Flow,Bar,Lock,Sum,Dot,Thumb,
 MUTED,LINE,INK,BLUE,GREEN,AMBER,RED} from './kit.jsx';
import {SettingsPage} from '../lib.jsx';

export const M=[]; const def=mk(M);
const n=x=>x.toLocaleString('vi-VN');
const Two=({a,b,note})=><div style={{display:'flex',alignItems:'center',gap:0,border:'1px solid '+LINE,borderRadius:12,overflow:'hidden'}}>
 <div style={{flex:1,padding:'12px 16px'}}><div style={{fontSize:13,color:MUTED,fontWeight:600}}>{a[0]}</div><div style={{fontSize:20,fontWeight:800,marginTop:2}}>{a[1]}</div></div>
 <span style={{width:44,height:44,borderRadius:'50%',background:'#E6F0FB',color:BLUE,display:'flex',alignItems:'center',justifyContent:'center',flex:'none',margin:'0 -22px',zIndex:1,border:'3px solid #fff'}}>{ic('ArrowsRightLeftIcon',20)}</span>
 <div style={{flex:1,padding:'12px 16px 12px 36px',background:'#F7F9FC',borderLeft:'1px solid '+LINE}}><div style={{fontSize:13,color:MUTED,fontWeight:600}}>{b[0]}</div><div style={{fontSize:20,fontWeight:800,marginTop:2}}>{b[1]}</div></div></div>;

/* ============ CHI TIẾT VẬT TƯ ============ */
def('admin-product-detail','/admin/products/:id','Product Detail','Biến thể, quy đổi đơn vị hai chiều không tự làm tròn, tồn theo kho (Tồn kho · Chờ xuất giao · Đã hứa · Có thể bán), giá chung và giá nhóm giá; giá vốn chỉ khi có quyền.',()=>
 <Pg group="Kho hàng" page="Vật tư" sub="Kho hàng / Vật tư / VT-0101" title="Xi măng PC40 Hoàng Thạch" chips={<Chip k="s">Đang bán</Chip>} actions={<Ib icon="PencilSquareIcon">Quản lý vật tư</Ib>}>
  <FactRow items={[{l:'Mã vật tư',v:cd('VT-0101')},{l:'Nhóm vật tư',v:'Xi măng',sub:'Vật liệu thô'},{l:'Thương hiệu',v:'Hoàng Thạch'},{l:'Đơn vị cơ sở',v:'Bao 50 kg',sub:'Có 1 đơn vị bán thêm: Tấn'}]}/>
  <Cols left={<>
   <Panel title="Biến thể" sub="2 biến thể · mỗi biến thể có tồn và giá riêng" pad={0}>
    <DT heads={['Biến thể','Mã','Giá chung','Có thể bán','Trạng thái']} widths={['1fr','130px','110px','110px','120px']} num={[2,3]} rows={[
     {bg:'#F4F8FD',cells:[<Nm n="Hoàng Thạch PC40 · bao 50 kg" sub="Đơn vị cơ sở: Bao"/>,cd('XM-PC40'),'95.000','1.540',<Chip k="s">Đang bán</Chip>]},
     [<Nm n="Hoàng Thạch PC40 · xá rời" sub="Đơn vị cơ sở: Tấn"/>,cd('XM-PC40-X'),'1.850.000','0',<Chip>Ngừng bán</Chip>]]}/></Panel>
   <Panel title="Quy đổi đơn vị" sub="Hai chiều, giữ nguyên số lẻ tới 6 chữ số thập phân, không tự làm tròn" right={<Tag k="i">Biến thể bao 50 kg</Tag>}>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}><Two a={['1 Tấn','= 20 Bao']} b={['1 Bao','= 0,05 Tấn']}/><Two a={['1 Bao','= 50 Kg']} b={['1 Kg','= 0,02 Bao']}/></div></Panel>
   <Panel title="Tồn theo kho" sub="Tính theo đơn vị cơ sở (Bao 50 kg)" pad={0}>
    <DT heads={['Kho','Tồn kho','Chờ xuất giao','Đã hứa cho đơn','Có thể bán']} widths={['1fr','100px','120px','130px','110px']} num={[1,2,3,4]} rows={[
     [<b>Kho Đại Mỗ</b>,'1.240','200','180',<b>860</b>],[<b>Kho Hà Đông</b>,'800','120','0',<b>680</b>],
     {total:true,cells:['Cộng toàn chi nhánh','2.040','320','180',<span style={{fontSize:16}}>1.540</span>]}]}
     foot={<div style={{padding:'11px 16px',borderTop:'1px solid '+LINE,fontSize:13.5,color:MUTED,display:'flex',gap:8,alignItems:'center'}}>{ic('InformationCircleIcon',17)}Có thể bán = Tồn kho − Chờ xuất giao − Đã hứa cho đơn. Hàng đang trên xe được tách riêng, không tính vào tồn kho.</div>}/></Panel></>}
   right={<>
    <Panel title="Giá bán" pad={0}><div style={{padding:'12px 16px 6px'}}><Row l="Giá chung" v={<span style={{fontSize:20,fontWeight:800}}>95.000 ₫</span>}/></div>
     <div style={{padding:'4px 16px 12px',borderTop:'1px solid '+LINE}}><div style={{fontSize:13,color:MUTED,fontWeight:600,margin:'8px 0 2px'}}>Giá theo nhóm giá</div><Row l="Nhóm giá Bảo Long" v="92.000 ₫"/><Row l="Nhóm giá Cô Hoa" v="93.500 ₫"/><Row l="Nhóm giá Minh Phát" v="91.000 ₫"/></div>
     <div style={{padding:'12px 16px',borderTop:'1px solid '+LINE,background:'#F7F9FC'}}><Lock>Giá vốn chỉ hiện với người có quyền xem giá vốn</Lock></div></Panel>
    <Panel title="Hiệu lực giá"><Stack gap={10}><Fact l="Giá chung có hiệu lực từ" v="15/11/2026"/><Fact l="Thay đổi gần nhất" v="Phạm Quang Huy · lý do: Nhà máy tăng giá xuất xưởng"/></Stack></Panel></>}/></Pg>);

/* ============ QUẢN LÝ VẬT TƯ ============ */
def('admin-product-manage','/admin/products/manage','Two-column Form','Tạo và sửa vật tư; đơn vị bán và quy đổi hai chiều; xóa chỉ khi chưa phát sinh chứng từ (SPEC-CAT-003).',()=>
 <Pg group="Kho hàng" page="Vật tư" sub="Kho hàng / Vật tư / Quản lý" title="Sửa vật tư VT-0101" actions={<><Ib>Hủy</Ib><Btn k="p">Lưu vật tư</Btn></>}>
  <Cols rw={380} left={<>
   <Panel title="Thông tin chung"><Pair gap={16}><Tx label="Tên vật tư" value="Xi măng PC40 Hoàng Thạch"/><Tx label="Mã vật tư" value="VT-0101" isDisabled/><Sel label="Nhóm vật tư" value="Xi măng"/><Tx label="Thương hiệu" value="Hoàng Thạch"/><div style={{gridColumn:'1 / 3'}}><Ta label="Mô tả" value="Xi măng PC40 đóng bao 50 kg, dùng cho đổ bê tông, xây trát." rows={2}/></div></Pair></Panel>
   <Panel title="Đơn vị bán và quy đổi" sub="Số lượng giữ nguyên tới 6 chữ số thập phân, hệ thống không tự làm tròn" right={<Ib icon="PlusIcon">Thêm đơn vị</Ib>}>
    <Stack gap={14}>
     <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}><Tx label="Đơn vị cơ sở" value="Bao 50 kg"/><div/></div>
     <div style={{border:'1px solid '+LINE,borderRadius:12,padding:14,background:'#FBFCFE'}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 140px 1fr',gap:14,alignItems:'end'}}><Tx label="Đơn vị bán thêm" value="Tấn"/><Tx label="Bằng bao nhiêu Bao" value="20"/><div style={{paddingBottom:10,color:MUTED,fontSize:14.5}}>= 1 Tấn gồm 20 Bao</div></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12}}><div style={{background:'#E6F0FB',borderRadius:8,padding:'8px 12px',fontSize:14.5}}>1 Tấn = <b>20 Bao</b></div><div style={{background:'#E6F0FB',borderRadius:8,padding:'8px 12px',fontSize:14.5}}>1 Bao = <b>0,05 Tấn</b></div></div></div></Stack></Panel>
   <Panel title="Biến thể" right={<Ib icon="PlusIcon">Thêm biến thể</Ib>} pad={0}><DT heads={['Tên biến thể','Mã','Đơn vị cơ sở','Đang bán']} widths={['1fr','130px','120px','90px']} ctr={[3]} rows={[[<b>Hoàng Thạch PC40 · bao 50 kg</b>,'XM-PC40','Bao',<Tag k="i">Bán</Tag>],[<b>Hoàng Thạch PC40 · xá rời</b>,'XM-PC40-X','Tấn',<Tag k="g">Ngừng</Tag>]]}/></Panel></>}
   right={<>
    <Panel title="Hình ảnh"><Thumb label="Kéo thả hoặc chọn ảnh" h={150}/></Panel>
    <Panel title="Trạng thái bán"><Sw value={true} label="Đang bán" description="Tắt để ẩn khỏi ô tìm hàng khi tạo đơn"/></Panel>
    <Panel title="Xóa vật tư" tone="warn"><div style={{fontSize:14.5,lineHeight:1.5}}>Không thể xóa vì vật tư này đã có <b>38 chứng từ</b> (đơn bán, đơn mua, tồn kho). Bạn có thể chuyển sang <b>Ngừng bán</b>.</div><div style={{marginTop:12,opacity:.55}}><Ib k="d" icon="TrashIcon">Xóa vật tư</Ib></div></Panel></>}/></Pg>);

/* ============ BẢNG GIÁ HÀNG LOẠT ============ */
def('admin-product-pricing','/admin/products/pricing','Searchable Table + Comparison Table','Bảng giá hàng loạt giá chung (DEFAULT) và giá nhóm giá; tối đa 500 dòng, một lý do, ngày hiệu lực từ hôm nay; một dòng sai thì không dòng nào được lưu; giá vốn chỉ khi có quyền.',()=>{
 const D=[['Xi măng PC40 Hoàng Thạch','Bao',84500,92000,'93.000'],['Xi măng PC30 Hoàng Thạch','Bao',78000,86000,null],['Thép cuộn phi 12 Hòa Phát','Cây',95400,108000,'110.000'],['Thép cuộn phi 16 Hòa Phát','Cây',168000,192000,'195.000'],['Cát xây Sông Hồng','m³',340000,380000,'385.000'],['Gạch đỏ 2 lỗ Tuynel','Viên',1180,1450,'0'],['Đá 1×2','m³',350000,373000,'380.000']];
 const rows=D.map((r,i)=>{const bad=r[4]==='0',same=!r[4];const dif=!bad&&!same?((+r[4].replace(/\./g,'')-r[3])/r[3]*100):0;return {bg:bad?'#FFF6F5':undefined,cells:[
  <Nm n={r[0]}/>,r[1],<span style={{color:MUTED}}>{n(r[2])}</span>,n(r[3]),
  same?<span style={{color:MUTED,textAlign:'right',display:'block'}}>Không đổi</span>:<Cell k={bad?'e':undefined}>{r[4]}</Cell>,
  bad?<span style={{color:'#8A1C13',fontWeight:700,fontSize:13.5,display:'block',textAlign:'right'}}>Giá phải lớn hơn 0</span>:same?<span style={{color:MUTED,display:'block',textAlign:'right'}}>—</span>:<b style={{color:'#0A4A96',display:'block',textAlign:'right'}}>+{dif.toFixed(1).replace('.',',')}%</b>]}});
 return <Pg group="Kho hàng" page="Giá bán" sub="Kho hàng / Giá bán / Bảng giá hàng loạt" title="Bảng giá hàng loạt" actions={<><Ib icon="ArrowUpTrayIcon">Nhập từ Excel</Ib><span title="Sửa dòng lỗi trước khi lưu" style={{opacity:.42}}><Btn k="p">Lưu bảng giá</Btn></span></>}
  banner={<div style={{display:'flex',gap:12,alignItems:'flex-start',background:'#FDF1F0',border:'1px solid #F0CFCB',borderLeft:'5px solid '+RED,borderRadius:10,padding:'12px 16px'}}>{ic('ExclamationCircleIcon',22,{color:RED,marginTop:1})}<div><div style={{fontWeight:700,fontSize:15.5,color:'#8A1C13'}}>Chưa lưu được: dòng 6 (Gạch đỏ 2 lỗ Tuynel) có giá mới không hợp lệ</div><div style={{fontSize:14.5,color:INK,marginTop:2}}>Một dòng sai thì không dòng nào được lưu. Sửa giá về lớn hơn 0 hoặc bỏ dòng này khỏi bảng rồi lưu lại.</div></div></div>}>
  <div className="hx-card" style={{padding:16,marginBottom:16}}>
   <div style={{display:'grid',gridTemplateColumns:'260px 1fr 220px',gap:18,alignItems:'start'}}>
    <div><div className="hx-label" style={{marginBottom:6}}>Loại giá</div><div style={{display:'flex',border:'1.5px solid '+BLUE,borderRadius:10,overflow:'hidden'}}>{[['Giá chung',false],['Giá nhóm giá',true]].map(([t,on])=><span key={t} style={{flex:1,textAlign:'center',padding:'9px 10px',fontWeight:700,fontSize:14.5,background:on?BLUE:'#fff',color:on?'#fff':'#0A4A96'}}>{t}</span>)}</div><div style={{marginTop:12}}><Sel label="Nhóm giá" value="Nhóm giá Bảo Long"/></div></div>
    <Ta label="Lý do thay đổi (một lý do cho cả bảng)" value="Nhà máy xi măng, thép tăng giá xuất xưởng từ 15/11; điều chỉnh bảng giá nhóm Bảo Long." rows={2}/>
    <div><Tx label="Ngày hiệu lực (từ hôm nay)" value="20/11/2026"/><div style={{marginTop:12,fontSize:13.5,color:MUTED}}>Giá cũ giữ trong lịch sử, đơn cũ không đổi.</div></div></div></div>
  <div className="hx-card" style={{overflow:'hidden'}}>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid '+LINE,background:'#FBFCFE'}}><b style={{fontSize:17}}>Nhóm giá Bảo Long</b><span style={{fontSize:14,color:MUTED}}><b style={{color:INK}}>6</b> dòng đổi giá · <b style={{color:'#8A1C13'}}>1 dòng lỗi</b> · tối đa 500 dòng mỗi lần lưu</span></div>
   <DT heads={['Vật tư','ĐVT',<span style={{display:'inline-flex',alignItems:'center',gap:5}}>{ic('LockClosedIcon',14)}Giá vốn</span>,'Giá hiện tại (₫)','Giá mới (₫)','Chênh lệch']} widths={['1.4fr','60px','110px','130px','140px','150px']} num={[2,3,4,5]} rows={rows}
    foot={<Sum><span style={{color:MUTED}}>Giá vốn chỉ hiện với người có quyền xem giá vốn</span><span style={{fontSize:13.5,color:MUTED}}>Hiển thị 7 trên 7 dòng đã chọn</span></Sum>}/></div></Pg>;});

/* ============ DANH SÁCH KHO ============ */
def('admin-warehouses','/admin/inventory/warehouses','Settings Panels','Kho theo chi nhánh; chỉ roles.manage; bật/tắt kho; chỉ MỘT kho mặc định (chọn bằng nút chọn) cho bán và nhận hàng mua.',()=>{
 const W=(nm,code,addr,on,def2,cnt,off)=><Panel title={nm} sub={code+' · '+addr} right={<>{def2&&<Tag k="i">Kho mặc định</Tag>}<Ib k="gh" icon="PencilSquareIcon">Sửa</Ib></>} style={off?{opacity:.75}:null}>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:20,marginBottom:6}}><Fact l="Vật tư đang có tồn" v={cnt}/><Fact l="Thủ kho" v={off?'—':'Hoàng Minh Quân'}/><Fact l="Giờ nhận hàng" v="07:00 – 17:30"/></div>
  <div style={{padding:'12px 0 0'}}><Sw value={on} label="Đang hoạt động" description="Tắt khi kho ngừng dùng; tồn còn lại phải chuyển đi trước"/></div></Panel>;
 const Radio=({t,on,dis})=><div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',opacity:dis?.5:1}}><span style={{width:20,height:20,borderRadius:'50%',border:on?'6px solid '+BLUE:'2px solid #9AA7B8',boxSizing:'border-box',flex:'none'}}/><span style={{fontSize:15.5,fontWeight:on?700:500}}>{t}</span>{dis&&<span style={{fontSize:14,color:MUTED}}>Kho đã ngừng hoạt động</span>}</div>;
 return <SettingsPage group="Kho hàng" page="Tồn kho" sub="Kho hàng / Tồn kho / Danh sách kho" title="Danh sách kho" items={['Chi nhánh Hà Đông','Chi nhánh Cầu Giấy','Chi nhánh Nam Từ Liêm']} active={0}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div style={{color:MUTED,fontSize:14.5}}>3 kho thuộc Chi nhánh Hà Đông · chỉ người có quyền quản lý vai trò mới sửa được</div><Btn k="p">+ Thêm kho</Btn></div>
  <Panel title="Kho mặc định" sub="Một kho duy nhất, dùng khi tạo đơn bán và nhận hàng mua"><Radio t="Kho Đại Mỗ" on/><Radio t="Kho Hà Đông"/><Radio t="Kho Văn Quán (cũ)" dis/></Panel>
  {W('Kho Đại Mỗ','KHO-DM','Số 15 Đại Mỗ, Nam Từ Liêm, Hà Nội',true,true,'142 vật tư')}
  {W('Kho Hà Đông','KHO-HD','Số 120 Quang Trung, Hà Đông, Hà Nội',true,false,'96 vật tư')}
  {W('Kho Văn Quán (cũ)','KHO-VQ','Ngõ 5 Văn Quán, Hà Đông, Hà Nội',false,false,'0 vật tư',true)}</SettingsPage>;});

/* ============ CHUYỂN KHO ============ */
def('admin-transfer-new','/admin/inventory/transfers/new','Form Wizard','Ba bước Kho và lý do · Chọn hàng · Xác nhận xuất; chỉ bước 3 mới ghi sổ giảm tồn kho đi đúng một lần (idempotent theo operationId).',()=>
 <Pg group="Kho hàng" page="Chuyển kho" sub="Kho hàng / Chuyển kho / Tạo mới" title="Tạo phiếu chuyển kho" actions={<Ib icon="ArrowLeftIcon">Quay lại bước 1</Ib>}>
  <div className="hx-card" style={{padding:'18px 28px',marginBottom:16}}><Stepper activeStep={1} label="Các bước chuyển kho"><Step step={0} label="Kho và lý do"/><Step step={1} label="Chọn hàng"/><Step step={2} label="Xác nhận xuất"/></Stepper></div>
  <Cols rw={360} left={<>
   <div className="hx-card" style={{overflow:'hidden'}}><Band ph="Tìm vật tư trong Kho Đại Mỗ (F3)" wh="Kho Đại Mỗ"/>
    <DT heads={['#','Vật tư','Có thể bán','Số lượng chuyển']} widths={['28px','1fr','100px','130px']} num={[2,3]} rows={[
     [<span style={{color:MUTED}}>1</span>,<Nm n="Xi măng PC40 Hoàng Thạch" sub="XM-PC40 · Bao 50 kg"/>,'860',<Cell hint="Bao">200</Cell>],
     [<span style={{color:MUTED}}>2</span>,<Nm n="Thép cuộn phi 12 Hòa Phát" sub="TH-D12 · Cây 11,7 m"/>,'420',<Cell hint="Cây">100</Cell>],
     [<span style={{color:MUTED}}>3</span>,<Nm n="Cát xây Sông Hồng" sub="CAT-X · m³"/>,'64,5',<Cell hint="m³">10</Cell>]]}
     foot={<Sum><span style={{color:MUTED}}>3 dòng · không chuyển quá số có thể bán tại kho đi</span><b>Chưa trừ tồn cho tới bước Xác nhận xuất</b></Sum>}/></div>
   <Panel title="Ghi chú"><Ta label="Ghi chú cho thủ kho nhận" value="Chuyển bổ sung hàng cho công trình Hà Đông, giao trước 10:00 ngày 20/11." rows={2}/></Panel></>}
   right={<div style={{position:'sticky',top:16}}><Panel title="Tóm tắt phiếu chuyển"><Stack gap={16}><Two a={['Kho đi','Đại Mỗ']} b={['Kho đến','Hà Đông']}/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}><Fact l="Ngày chuyển" v="20/11/2026"/><Fact l="Số dòng" v="3 vật tư"/></div>
    <Fact l="Lý do" v="Bổ sung tồn cho kho Hà Đông"/>
    <div style={{background:'#F2F5F9',borderRadius:10,padding:'12px 14px',fontSize:14.5,color:INK,lineHeight:1.5}}>Chỉ khi xuất chuyển kho ở bước 3, tồn Kho Đại Mỗ mới giảm và hàng ở trạng thái đang chuyển. Tồn Kho Hà Đông chỉ tăng khi thủ kho bấm <b>Nhận chuyển kho</b>.</div>
    <Wide k="p" icon="ArrowRightIcon">Tiếp tục: Xác nhận xuất</Wide></Stack></Panel></div>}/></Pg>);

def('admin-transfer-detail','/admin/inventory/transfers/:id','Order Detail','Xuất chuyển kho → Nhận chuyển kho → Hao hụt chuyển kho đã duyệt; mỗi bước ghi sổ tồn đúng một lần theo từng vật tư, bấm lại không ghi đúp.',()=>{
 const E=(t,b,k,it,q,c)=>[t,<b>{b}</b>,k,it,<span style={{color:c,fontWeight:700}}>{q}</span>];
 return <Pg group="Kho hàng" page="Chuyển kho" sub="Kho hàng / Chuyển kho / CK-0031" title="CK-0031" chips={<Chip k="i">Đang chuyển</Chip>} actions={<><Ib icon="PrinterIcon">In phiếu</Ib><Ib icon="ExclamationTriangleIcon">Báo hao hụt</Ib><Ib k="p" icon="ArchiveBoxArrowDownIcon">Nhận chuyển kho</Ib></>}>
  <FactRow items={[{l:'Kho đi',v:'Kho Đại Mỗ',sub:'Xuất ngày 19/11/2026 14:20'},{l:'Kho đến',v:'Kho Hà Đông',sub:'Thủ kho: Hoàng Minh Quân'},{l:'Người xuất',v:'Lý Văn Tâm'},{l:'Lý do',v:'Bổ sung tồn cho kho Hà Đông',flex:1.4}]}/>
  <Cols left={<>
   <Panel title="Hàng chuyển" sub="Nhập số đã nhận thực tế khi nhận chuyển kho" pad={0}>
    <DT heads={['Vật tư','Đã xuất','Đã nhận','Hao hụt','Ghi chú']} widths={['1fr','80px','80px','90px','190px']} num={[1,2,3]} rows={[
     [<Nm n="Xi măng PC40 Hoàng Thạch" sub="Bao 50 kg"/>,'200','200','0',<Tag k="g">Nhận đủ</Tag>],
     [<Nm n="Thép cuộn phi 12 Hòa Phát" sub="Cây 11,7 m"/>,'100','98',<Hl>2</Hl>,<Tag k="w">Hao hụt chờ duyệt</Tag>],
     [<Nm n="Cát xây Sông Hồng" sub="m³"/>,'10','—','—',<Tag k="g">Chưa nhận</Tag>]]}/></Panel>
   <Panel title="Sổ ghi tồn" sub="Mỗi vật tư một dòng; mỗi bước ghi đúng một lần, bấm lại không bị ghi đúp" pad={0}>
    <DT heads={['Thời điểm','Bước','Kho','Vật tư','Số lượng']} widths={['110px','150px','110px','1fr','110px']} num={[4]} rows={[
     E('19/11 14:20','Xuất chuyển kho','Kho Đại Mỗ','Xi măng PC40 Hoàng Thạch','−200 Bao',RED),
     E('19/11 14:20','Xuất chuyển kho','Kho Đại Mỗ','Thép cuộn phi 12 Hòa Phát','−100 Cây',RED),
     E('19/11 14:20','Xuất chuyển kho','Kho Đại Mỗ','Cát xây Sông Hồng','−10 m³',RED),
     E('19/11 16:05','Nhận chuyển kho','Kho Hà Đông','Xi măng PC40 Hoàng Thạch','+200 Bao',BLUE),
     E('19/11 16:05','Nhận chuyển kho','Kho Hà Đông','Thép cuộn phi 12 Hòa Phát','+98 Cây',BLUE)]}/></Panel></>}
   right={<>
    <Panel title="Tiến trình"><Flow steps={['Xuất chuyển kho','Nhận chuyển kho','Hao hụt đã duyệt']} at={1}/></Panel>
    <Banner status="warning" title="Hao hụt 2 Cây thép phi 12" description="Cần người có quyền duyệt hao hụt chuyển kho trước khi đóng phiếu." collapsible={false}/>
    <Panel title="Nhật ký"><Stack gap={12}>{[['19/11 16:05','Nhận một phần tại Kho Hà Đông','Hoàng Minh Quân'],['19/11 14:20','Xuất chuyển kho','Lý Văn Tâm'],['19/11 14:12','Tạo phiếu chuyển kho','Lý Văn Tâm']].map(([t,a,w],i)=><div key={t} style={{display:'flex',gap:10}}><Dot k={i?'g':'i'}/><div style={{marginTop:-4}}><div style={{fontWeight:600,fontSize:14.5}}>{a}</div><div style={{fontSize:13,color:MUTED}}>{t} · {w}</div></div></div>)}</Stack></Panel></>}/></Pg>;});

/* ============ KIỂM KHO ============ */
const pn=x=>+String(x).replace(/\./g,'').replace(',','.');
const fq=x=>x.toLocaleString('vi-VN',{maximumFractionDigits:6});
def('admin-stock-count-detail','/admin/stock-counts/:id','Filterable Table + Inline Wizard','Đang kiểm → Đã cân bằng kho (duyệt thì mới điều chỉnh tồn) | Đã hủy; mọi dòng lệch bắt buộc có lý do (ô nhập); chỉ cân bằng khi đã đếm đủ và đủ lý do; không làm tròn số lẻ.',()=>{
 const R=[['Xi măng PC40 Hoàng Thạch','Bao','1.240','1.236','Rách bao khi dỡ hàng'],['Xi măng PC30 Hoàng Thạch','Bao','420','420',''],['Thép cuộn phi 12 Hòa Phát','Cây','420','420',''],['Cát xây Sông Hồng','m³','86,5','88',''],['Gạch đỏ 2 lỗ Tuynel','Viên','48.200','48.200',''],['Đá 1×2','m³','64','62','Hao hụt khi xúc lên xe'],['Thép cuộn phi 16 Hòa Phát','Cây','35','',''],['Gạch men 60×60','Hộp','210','','']];
 const Rs=({v,miss,off})=><span className="hx-in" style={{display:'block',padding:'6px 10px',fontSize:14.5,background:miss?'#FDEBE9':off?'#F7F9FC':'#fff',borderColor:miss?'#E9B8B3':'#C7D2DF',color:miss?'#8A1C13':off?'#8493A8':INK,fontWeight:miss?600:400}}>{v}</span>;
 const rows=R.map(r=>{const done=r[3]!=='';const d=done?pn(r[3])-pn(r[2]):0;const miss=done&&d!==0&&r[4]==='';return {bg:miss?'#FFFBF0':undefined,cells:[
  <Nm n={r[0]} sub={r[1]}/>,r[2],done?<Cell>{r[3]}</Cell>:<Cell k="w"> </Cell>,
  done?(d===0?<span style={{color:MUTED,display:'block',textAlign:'right'}}>0</span>:<b style={{color:d<0?RED:BLUE,display:'block',textAlign:'right'}}>{d>0?'+':'−'}{fq(Math.abs(d))}</b>):<span style={{color:MUTED,display:'block',textAlign:'right'}}>Chưa đếm</span>,
  d!==0?<Rs v={miss?'Cần nhập lý do':r[4]} miss={miss}/>:<Rs v={done?'Không lệch':'Chưa đếm'} off/>]}});
 return <Pg group="Kho hàng" page="Kiểm kho" sub="Kho hàng / Kiểm kho / KK-0012" title="KK-0012" chips={<><Chip k="i">Đang kiểm</Chip><span style={{fontSize:14.5,color:MUTED}}>Kho Đại Mỗ · bắt đầu 19/11/2026</span></>} actions={<><Button variant="secondary" label="Thêm thao tác (Hủy phiếu kiểm)" isIconOnly icon={<Icon icon={HI.EllipsisHorizontalIcon}/>}/><Ib>Lưu tạm</Ib><span title="Đếm đủ và nhập lý do cho mọi dòng lệch trước khi cân bằng" style={{opacity:.42}}><Btn k="p">Cân bằng kho</Btn></span></>}
  banner={<Banner status="warning" title="1 dòng lệch chưa có lý do, 2 vật tư chưa đếm" description="Chênh lệch bắt buộc có lý do. Chỉ khi bấm Cân bằng kho (có duyệt) tồn kho mới được điều chỉnh; trước đó tồn sổ sách giữ nguyên." collapsible={false}/>}>
  <Cols rw={340} left={<div className="hx-card" style={{overflow:'hidden'}}>
   <div style={{padding:'13px 16px',borderBottom:'1px solid '+LINE,display:'flex',alignItems:'center',justifyContent:'space-between',background:'#FBFCFE'}}><b style={{fontSize:17}}>Số đếm thực tế</b><span style={{fontSize:14,color:MUTED}}>Tồn sổ sách chốt lúc bắt đầu kiểm</span></div>
   <DT heads={['Vật tư','Tồn sổ sách','Đếm thực tế','Chênh lệch','Lý do chênh lệch']} widths={['1.2fr','96px','110px','96px','190px']} num={[1,2,3]} rows={rows}/></div>}
   right={<>
    <Panel title="Tiến trình kiểm kho"><Flow steps={['Đang kiểm','Đã cân bằng kho']} at={0}/></Panel>
    <Panel title="Tổng hợp"><Stack gap={14}><Bar l="Đã đếm" r="6 / 8 vật tư" v={75} k="accent"/><div style={{borderTop:'1px solid '+LINE,paddingTop:10}}><Row l="Dòng lệch thiếu" v={<span style={{color:RED}}>2 dòng</span>} b/><Row l="Dòng lệch thừa" v={<span style={{color:'#0A4A96'}}>1 dòng</span>} b/><Row l="Dòng khớp" v="3 dòng"/></div></Stack></Panel>
    <Panel title="Khi cân bằng kho"><div style={{fontSize:14.5,lineHeight:1.55,color:INK}}>Hệ thống tạo điều chỉnh tồn theo từng dòng lệch, ghi kèm lý do và người duyệt. Vật tư chưa đếm được giữ nguyên tồn sổ sách. Hủy phiếu kiểm nằm trong nút “⋯” ở góc trên.</div></Panel></>}/></Pg>;});
