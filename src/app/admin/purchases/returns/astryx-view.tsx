import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxPageHead, AxStatus } from "@/components/astryx/ax-kit";
import { AxFormFrame, AxLegacy, AxPanel, AxDetails, AxTable } from "@/components/astryx/buystock-kit";
import { ListPager } from "@/components/ui/list-pager";

export type AxReturnRow = { id: string; number: string; date: string; supplier: string; material: string; direct: boolean; quantity: string; value: string | null; done: boolean };

/** Danh sách trả hàng nhập kiểu Astryx; form "trả hàng NCC giao thẳng nhiều bước" là thành phần Classic hiện có (`directForm`). */
export function AstryxReturnsView({ rows, canCreate, returned, directForm, hasNext, page }: { rows: AxReturnRow[]; canCreate: boolean; returned: boolean; directForm: ReactNode; hasNext: boolean; page: number }) {
  return <>
    <AxPageHead crumbs={["Mua hàng", "Trả hàng NCC"]} title="Trả hàng nhập" actions={<><AxButtonLink href="/admin/purchase-orders">Đơn mua</AxButtonLink>{canCreate && <AxButtonLink href="/admin/purchases/returns/new" kind="primary">+ Trả hàng nhập</AxButtonLink>}</>} />
    <p className="hx-muted" style={{ margin: "-8px 0 16px" }}>Trả lại nhà cung cấp hàng đã nhập kho: chọn phiếu nhập, nhập số lượng trả, bấm Hoàn thành.</p>
    {returned && <p className="form-message success" role="status">Đã trả hàng nhập: hàng đã xuất khỏi kho và công nợ nhà cung cấp đã giảm.</p>}
    <AxTable label="Danh sách phiếu trả hàng nhập" heads={["Mã phiếu trả", "Thời gian", "Nhà cung cấp", "Hàng hóa", { label: "SL trả (đv gốc)", num: true }, { label: "Giá trị", num: true }, "Trạng thái"]}
      empty={rows.length === 0 ? <p>Chưa có phiếu trả hàng nhập.</p> : undefined}>
      {rows.map((row) => <tr key={row.id}><td><Link className="hx-code" href={`/admin/purchases/returns/${row.id}`}>{row.number}</Link></td><td>{row.date}</td><td>{row.supplier}</td>
        <td>{row.material}{row.direct && <small className="bs-sub">NCC giao thẳng</small>}</td><td className="hx-num">{row.quantity}</td><td className="hx-num">{row.value ?? "—"}</td>
        <td><AxStatus tone={row.done ? "success" : "warning"}>{row.done ? "Hoàn thành" : "Đang xử lý"}</AxStatus></td></tr>)}
    </AxTable>
    <ListPager page={page} hasNext={hasNext} params={{}} />
    {directForm && <AxLegacy title="Trả hàng NCC giao thẳng đã nhận lại từ khách (nhiều bước)">{directForm}</AxLegacy>}
  </>;
}

const HEADING = { crumbs: ["Mua hàng", "Trả hàng NCC", "Tạo phiếu"], title: "Tạo phiếu trả hàng nhập", lede: "Chọn phiếu nhập, nhập số lượng trả theo đơn vị đã mua rồi bấm Hoàn thành. Hàng xuất khỏi kho và công nợ nhà cung cấp giảm ngay." };

/** Bước 1 của phiếu trả: chọn phiếu nhập hàng (tìm theo NCC, mã phiếu, đơn mua, hàng). */
export function AstryxReturnPicker({ q, receipts }: { q: string; receipts: { id: string; number: string; po: string; date: string; supplier: string; items: string }[] }) {
  return <AxFormFrame {...HEADING}>
    <AxPanel title="Chọn phiếu nhập hàng" right={<form action="/admin/purchases/returns/new" className="bs-inline" role="search"><input className="hx-in" name="q" defaultValue={q} placeholder="Tìm NCC, mã phiếu nhập, đơn mua, hàng" aria-label="Tìm phiếu nhập" /><button className="hx-btn" type="submit">Tìm</button></form>} pad={false}>
      <div className="bs-scroll"><table className="bs-table" aria-label="Phiếu nhập còn hàng để trả"><thead><tr><th scope="col">Phiếu nhập</th><th scope="col">Ngày nhập</th><th scope="col">Nhà cung cấp</th><th scope="col">Hàng hóa</th><th scope="col"><span className="sr-only">Chọn</span></th></tr></thead>
        <tbody>{receipts.map((row) => <tr key={row.id}><td><Link className="hx-code" href={`/admin/purchases/returns/new?receipt=${row.id}`}>{row.number}</Link><small className="bs-sub">{row.po}</small></td><td>{row.date}</td><td>{row.supplier}</td><td>{row.items}</td>
          <td><Link className="hx-btn sm" href={`/admin/purchases/returns/new?receipt=${row.id}`}>Chọn</Link></td></tr>)}</tbody></table></div>
      {receipts.length === 0 && <div className="hx-empty" role="status"><p>Không có phiếu nhập còn hàng để trả.</p></div>}
    </AxPanel>
  </AxFormFrame>;
}

/** Bước 2: thông tin phiếu nhập đã chọn; form hoàn thành trả hàng (Classic) đặt trong `form`. */
export function AstryxReturnForm({ supplier, receipt, date, po, form }: { supplier: string; receipt: string; date: string; po: string; form: ReactNode }) {
  return <AxFormFrame {...HEADING}>
    <AxPanel title="Phiếu nhập đã chọn" right={<Link className="hx-btn sm" href="/admin/purchases/returns/new">Chọn phiếu nhập khác</Link>}>
      <AxDetails items={[{ label: "Nhà cung cấp", value: <b>{supplier}</b> }, { label: "Phiếu nhập", value: `${receipt} · ${date}` }, { label: "Đơn mua", value: po }]} /></AxPanel>
    {form}
  </AxFormFrame>;
}
