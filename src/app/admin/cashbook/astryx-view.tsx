import Link from "next/link";
import type { ReactNode } from "react";
import { AxPageHead, AxStatus } from "@/components/astryx/ax-kit";
import { AxCard, AxEmpty, AxGrid, AxKpi, AxTabLinks } from "@/components/astryx/fin-kit";
import { ListPager } from "@/components/ui/list-pager";

export type AxCashPayment = { id: string; payment_number: string; direction: string; counterparty_name: string; account_code: string; amountText: string; dateText: string; reversalOf: boolean; reversed: boolean; reconciliationLabel: string; differenceText: string; actions: ReactNode };
export type AxCashWaiting = { id: string; code: string; customerId: string; customerName: string; customerCode: string; createdText: string; amountText: string; receivedText: string; confirm: ReactNode };
export type AxBankLine = { id: string; dateText: string; gateway: string; content: string; requestCode: string | null; amountText: string; reason: string; resolve: ReactNode };
export type AxNonCash = { id: string; number: string; dateText: string; category: string; description: string; amountText: string };
export type AxBankInfo = { name: string; bank_name: string | null; number: string | null; holder: string | null; shown: boolean; feed: boolean };

/**
 * Sổ quỹ kiểu Astryx: tổng thu (xanh lá) / tổng chi (đỏ) theo kỳ là chính, số dư là phụ; tab theo quỹ; chuyển khoản và SePay;
 * chờ thu tiền mặt; giao dịch ngân hàng chờ xử lý; giao dịch đã ghi sổ. Mọi hộp thoại có server action (tạo tài khoản, sửa chuyển khoản,
 * SePay, xử lý tiền về, đối soát, đảo giao dịch) là thành phần của Classic, truyền vào dưới dạng `ReactNode`.
 */
export function AstryxCashbookView({ notice, headerActions, totals, tabs, bank, bankDialogs, cashWaiting, bankLines, presets, filter, payments, paymentCount, pager, exportButton, nonCash, nonCashTotal, filtered }: {
  notice: ReactNode; headerActions: ReactNode;
  totals: { opening: string; openingNote: string; receipts: string; disbursements: string; closing: string; closingNote: string; net: string; unmatched: number; accounts: number; advances: number };
  tabs: { href: string; label: string; active: boolean }[]; bank: AxBankInfo | null; bankDialogs: ReactNode;
  cashWaiting: AxCashWaiting[]; bankLines: AxBankLine[];
  presets: { href: string; label: string; active: boolean }[];
  filter: { from: string; to: string; account: string; direction: string; accounts: { id: string; label: string }[] };
  payments: AxCashPayment[]; paymentCount: number; pager: { page: number; total?: number; hasNext: boolean; params: Record<string, string | undefined> }; exportButton: ReactNode;
  nonCash: AxNonCash[]; nonCashTotal: string; filtered: boolean;
}) {
  return <>
    <AxPageHead crumbs={["Tài chính", "Sổ quỹ"]} title="Sổ quỹ" actions={headerActions} />
    {notice}
    <div className="fk-kpis" aria-label="Quỹ trong kỳ">
      <AxKpi lead tone="g" label="Tổng thu trong kỳ" value={totals.receipts} note={`${paymentCount} giao dịch trong kỳ`} />
      <AxKpi lead tone="r" label="Tổng chi trong kỳ" value={totals.disbursements} />
      <AxKpi tone="n" label="Quỹ đầu kỳ" value={totals.opening} note={totals.openingNote} />
      <AxKpi tone="b" label="Tồn quỹ cuối kỳ" value={totals.closing} note={totals.closingNote} />
    </div>
    <div className="fk-kpis">
      <AxKpi tone="n" label="Dòng tiền ròng" value={totals.net} note="Toàn bộ tài khoản đến nay" />
      <AxKpi tone="o" label="Chưa đối soát" value={totals.unmatched} />
      <AxKpi tone="n" label="Tài khoản" value={totals.accounts} />
      <AxKpi tone="n" label="Khoản khách ứng trước" value={totals.advances} />
    </div>
    <AxTabLinks label="Quỹ" items={tabs} />
    {bank && <AxCard title="Thông tin chuyển khoản" label="Thông tin chuyển khoản" style={{ marginBottom: 16 }} right={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{bankDialogs}</div>}>
      <p style={{ margin: 0, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {bank.number ? <><b>{bank.bank_name}</b> · <span>{bank.number}</span> · {bank.holder}</> : <span className="hx-muted">Chưa nhập số tài khoản.</span>}
        {bank.shown && <AxStatus tone="success">Hiện cho khách</AxStatus>}{bank.feed && <AxStatus tone="info">Tự ghi tiền về (SePay)</AxStatus>}</p></AxCard>}
    {cashWaiting.length > 0 && <AxCard title="Chờ thu tiền mặt" id="cash-requests" label="Chờ thu tiền mặt" flush style={{ marginBottom: 16 }} right={<span className="hx-muted">{cashWaiting.length} yêu cầu</span>}>
      <p className="hx-muted" style={{ margin: 0, padding: "12px 16px" }}>Khách chọn trả tiền mặt tại cửa hàng. Đếm tiền, đối chiếu mã khách đưa, rồi bấm “Xác nhận đã thu” — lúc đó mới ghi phiếu thu và trừ công nợ.</p>
      <AxGrid label="Chờ thu tiền mặt" template="110px minmax(0,1.4fr) 110px 140px 140px 200px" num={[3, 4]} heads={["Mã", "Khách hàng", "Tạo lúc", "Cần thu", "Đã nhận", "Thao tác"]}
        rows={cashWaiting.map((row) => ({ key: row.id, cells: [<b key="c" className="hx-code">{row.code}</b>,
          <span key="k"><Link className="hx-code" href={`/admin/customers/${row.customerId}?tab=debts`}>{row.customerName}</Link><small className="hx-sub" style={{ display: "block" }}>{row.customerCode}</small></span>,
          row.createdText, row.amountText, row.receivedText, row.confirm] }))} /></AxCard>}
    {bankLines.length > 0 && <AxCard title="Giao dịch ngân hàng chờ xử lý" id="bank" label="Giao dịch ngân hàng chờ xử lý" flush style={{ marginBottom: 16 }} right={<span className="hx-muted">{bankLines.length} khoản</span>}>
      <p className="hx-muted" style={{ margin: 0, padding: "12px 16px" }}>Tiền đã vào tài khoản nhưng chưa nhận ra khách. Chọn khách để ghi phiếu thu (trừ nợ cũ nhất trước), hoặc bỏ qua nếu không phải tiền khách trả.</p>
      <AxGrid label="Giao dịch ngân hàng chờ xử lý" template="150px minmax(0,1.6fr) 150px minmax(0,1.4fr) 120px" num={[2]} minWidth={900} heads={["Thời gian", "Nội dung chuyển khoản", "Số tiền", "Lý do chờ", "Thao tác"]}
        rows={bankLines.map((line) => ({ key: line.id, cells: [
          <span key="t">{line.dateText}<small className="hx-sub" style={{ display: "block" }}>{line.gateway}</small></span>,
          <span key="c">{line.content}{line.requestCode && <small className="hx-sub" style={{ display: "block" }}>Yêu cầu thanh toán {line.requestCode}</small>}</span>,
          <b key="a" className="fk-pos">+{line.amountText}</b>, line.reason, line.resolve] }))} /></AxCard>}
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div className="hx-side">
        <div className="hx-card hx-pad"><div className="hx-label" style={{ marginBottom: 8 }}>Chọn nhanh kỳ</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{presets.map((preset) => <Link key={preset.label} href={preset.href} className={`hx-btn sm${preset.active ? " p" : ""}`} aria-current={preset.active ? "true" : undefined}>{preset.label}</Link>)}</div></div>
        <form method="get" action="/admin/cashbook" className="hx-card hx-pad" aria-label="Bộ lọc sổ quỹ" style={{ display: "grid", gap: 12 }}>
          <label className="hx-label">Từ ngày<input className="hx-in" type="date" name="from" defaultValue={filter.from} style={{ width: "100%" }} /></label>
          <label className="hx-label">Đến ngày<input className="hx-in" type="date" name="to" defaultValue={filter.to} style={{ width: "100%" }} /></label>
          <label className="hx-label">Tài khoản<select className="hx-in" name="account" defaultValue={filter.account} style={{ width: "100%" }}><option value="">Tất cả tài khoản</option>{filter.accounts.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
          <label className="hx-label">Loại<select className="hx-in" name="direction" defaultValue={filter.direction} style={{ width: "100%" }}><option value="">Thu và chi</option><option value="RECEIPT">Phiếu thu</option><option value="DISBURSEMENT">Phiếu chi</option></select></label>
          <button type="submit" className="hx-btn p">Lọc</button>
          {filtered && <Link href="/admin/cashbook" style={{ color: "var(--hx-blue-t)", fontWeight: 600 }}>Xóa lọc</Link>}
        </form>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 16 }}>
        <AxCard title="Giao dịch đã ghi sổ" label="Giao dịch thu chi đã ghi sổ" flush right={<div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="hx-muted">{paymentCount} giao dịch trong kỳ</span>{exportButton}</div>}>
          {payments.length === 0 ? <AxEmpty title={filtered ? "Không có giao dịch phù hợp bộ lọc." : "Chưa có giao dịch tiền trong kỳ này."} />
            : <AxGrid label="Giao dịch thu chi đã ghi sổ" template="150px minmax(0,1.3fr) 110px 120px 150px 150px minmax(190px,1fr)" num={[4]} minWidth={1000} heads={["Phiếu", "Đối tác", "Tài khoản", "Loại", "Số tiền", "Đối soát", "Thao tác"]}
              rows={payments.map((item) => ({ key: item.id, muted: item.reversed, cells: [
                <span key="n"><b className="hx-code">{item.payment_number}</b><small className="hx-sub" style={{ display: "block" }}>{item.dateText}</small></span>,
                item.counterparty_name, item.account_code,
                <AxStatus key="k" tone={item.reversed ? "error" : item.direction === "RECEIPT" ? "success" : "info"}>{item.reversalOf ? "Đảo giao dịch" : item.direction === "RECEIPT" ? "Thu" : "Chi"}</AxStatus>,
                <b key="a" className={item.direction === "RECEIPT" ? "fk-pos" : undefined}>{item.direction === "RECEIPT" ? "+" : "−"}{item.amountText}</b>,
                <span key="d"><b>{item.reconciliationLabel}</b><small className="hx-sub" style={{ display: "block" }}>Lệch {item.differenceText}</small></span>,
                <span key="x" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Link className="hx-code" href={`/api/payments/${item.id}/voucher/pdf`}>In {item.direction === "RECEIPT" ? "phiếu thu" : "phiếu chi"}</Link>
                  <Link className="hx-code" href={`/api/payments/${item.id}/voucher/pdf?kho=k80`} aria-label={`In ${item.direction === "RECEIPT" ? "phiếu thu" : "phiếu chi"} khổ K80`}>K80</Link>{item.actions}</span>] }))} />}
          <div style={{ padding: "0 16px" }}><ListPager page={pager.page} total={pager.total} hasNext={pager.hasNext} params={pager.params} /></div>
        </AxCard>
        {nonCash.length > 0 && <AxCard title="Chi phí không dùng tiền trong kỳ (hao hụt kho)" label="Chi phí không dùng tiền" flush right={<span className="hx-muted">Tổng {nonCashTotal}</span>}>
          <p className="hx-muted" style={{ margin: 0, padding: "12px 16px" }}>Ghi vào chi phí và trừ lợi nhuận; không tính vào số dư quỹ.</p>
          <AxGrid label="Chi phí không dùng tiền" template="150px minmax(0,1.6fr) 150px" num={[2]} heads={["Mã", "Loại chi / ghi chú", "Số tiền"]}
            rows={nonCash.map((item) => ({ key: item.id, cells: [<span key="n"><Link className="hx-code" href={`/admin/expenses?focus=${item.id}`}>{item.number}</Link><small className="hx-sub" style={{ display: "block" }}>{item.dateText}</small></span>,
              <span key="c">{item.category}<small className="hx-sub" style={{ display: "block" }}>{item.description}</small></span>, item.amountText] }))} /></AxCard>}
      </div>
    </div>
  </>;
}

