"use client";

import Decimal from "decimal.js";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NumberEntry } from "@/components/documents/editor/number-entry";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { decimalForEditing, normalizeDecimalInput, normalizeVndInput, vndForEditing } from "@/lib/core/vn-number";
import { catalogChoiceLabel } from "@/modules/catalog/presentation";
import { loadMaterialUnitsAction, saveMaterialUnitsAction, type MaterialUnitsData, type MaterialUnitsResult } from "@/modules/catalog/material-units-actions";
import { ROUNDING_STEPS, type RoundingStep } from "@/modules/pricing/bulk-adjust";
import { splitPriceByUnits, unitCostVnd, type UnitRatio } from "@/modules/pricing/unit-split";

type NewUnit = { key: number; uomId: string; ratio: string; type: "EXACT" | "PACKAGING" | "ESTIMATED" | "MEASURED"; sourceNote: string };
const NEW_TYPES = ["PACKAGING", "EXACT", "ESTIMATED", "MEASURED"] as const;
const money = (value: string | bigint) => formatVnd(vnd(value.toString()));

/**
 * KiotViet-style "Đơn vị tính" of one material (D7): the base unit plus selling units (1 bao = 50 kg…), each with its
 * own general price. Stock stays one number in the base unit. "Chia giá" suggests the other prices from one unit's
 * price by the ratios (D11); every price is still saved as its own VND amount. Everything is saved in one command.
 */
export function MaterialUnitsEditor({ materialId }: { materialId: string }) {
  const router = useRouter();
  const [data, setData] = useState<MaterialUnitsData | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [stopped, setStopped] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<NewUnit[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [splitFrom, setSplitFrom] = useState("");
  const [step, setStep] = useState<RoundingStep>(1000);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reason, setReason] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<MaterialUnitsResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    loadMaterialUnitsAction(materialId).then((loaded) => {
      if (!live) return;
      setData(loaded); setStopped(new Set()); setAdded([]); setPrices({});
      if (loaded) { setEffectiveDate(loaded.today); setSplitFrom(loaded.material.baseUomId); }
    }, () => { if (live) setLoadError("Không tải được đơn vị tính. Đóng và mở lại sau."); });
    return () => { live = false; };
  }, [materialId, reload]);

  const sellingUnits = useMemo<UnitRatio[]>(() => !data ? [] : [
    ...data.units.filter((unit) => !unit.conversionId || !stopped.has(unit.conversionId)).map((unit) => ({ uomId: unit.uomId, numerator: unit.numerator, denominator: unit.denominator })),
    ...added.filter((unit) => unit.uomId && normalizeDecimalInput(unit.ratio)).map((unit) => ({ uomId: unit.uomId, numerator: normalizeDecimalInput(unit.ratio)!, denominator: "1" })),
  ], [data, stopped, added]);

  if (loadError) return <p className="form-message" role="alert">{loadError}</p>;
  if (data === undefined) return <>{result?.success && <p className="form-message success" role="status">{result.message}</p>}<p className="muted">Đang tải đơn vị tính...</p></>;
  if (data === null) return <p className="form-message" role="alert">Không tìm thấy vật tư hoặc bạn không có quyền xem.</p>;
  const loaded = data;
  const base = loaded.material.baseSymbol;
  const symbolOf = (uomId: string) => loaded.uomOptions.find((unit) => unit.id === uomId)?.symbol ?? loaded.units.find((unit) => unit.uomId === uomId)?.symbol ?? "Đơn vị";
  const inUse = new Set([loaded.material.baseUomId, ...loaded.units.filter((unit) => unit.conversionId && !stopped.has(unit.conversionId)).map((unit) => unit.uomId), ...added.map((unit) => unit.uomId)]);
  const priceTyped = (uomId: string) => prices[uomId] ?? "";
  const priceChanges = sellingUnits.flatMap((unit) => {
    const typed = priceTyped(unit.uomId);
    const current = loaded.prices[unit.uomId]?.currentVnd ?? null;
    if (!/^[1-9]\d*$/.test(typed) || (current !== null && BigInt(typed) === BigInt(current))) return [];
    const target = loaded.prices[unit.uomId]?.target ?? null;
    return [{ uomId: unit.uomId, priceVnd: typed, ...(target ? { supersedesId: target.ruleId, expectedVersion: target.version } : {}) }];
  });
  const addUnits = added.filter((unit) => unit.uomId).map((unit) => ({ uomId: unit.uomId, ratio: normalizeDecimalInput(unit.ratio) ?? unit.ratio, type: unit.type, sourceNote: unit.sourceNote.trim() }));
  const changes = addUnits.length + stopped.size + priceChanges.length;

  function suggestPrices() {
    const from = sellingUnits.find((unit) => unit.uomId === splitFrom);
    const typed = priceTyped(splitFrom) || loaded.prices[splitFrom]?.currentVnd || "";
    if (!from || !/^[1-9]\d*$/.test(typed)) { setResult({ success: false, message: "Nhập giá cho đơn vị dùng để chia trước." }); return; }
    const suggested = splitPriceByUnits(from, BigInt(typed), sellingUnits, step);
    setPrices((current) => ({ ...current, ...Object.fromEntries([...suggested].map(([uomId, value]) => [uomId, value.toString()])) }));
    setResult({ success: true, message: `Đã gợi ý giá theo tỉ lệ từ giá 1 ${symbolOf(splitFrom)}. Kiểm tra và sửa nếu cần trước khi lưu.` });
  }

  function save() {
    if (pending || !changes || reason.trim().length < 3) return;
    startTransition(async () => {
      try {
        const saved = await saveMaterialUnitsAction({ operationId, materialId, reason: reason.trim(), effectiveDate,
          addUnits, stopConversionIds: [...stopped], prices: priceChanges });
        setResult(saved);
        // Show the saved state only once it is read back; the typed rows must not linger as if still unsaved.
        if (saved.success) { setOperationId(crypto.randomUUID()); setReason(""); setData(undefined); setReload((value) => value + 1); router.refresh(); }
      } catch {
        setResult({ success: false, outcomeUnknown: true, message: "Chưa xác định được kết quả lưu. Bấm lưu lại đúng thao tác này để kiểm tra; hệ thống không lưu trùng." });
      }
    });
  }

  const editPrice = loaded.can.prices;
  const editUnits = loaded.can.units;
  const unknown = result?.outcomeUnknown;
  return <div className="material-units">
    <p className="muted">Đơn vị cơ sở: <strong>{base}</strong>. Tồn kho luôn tính theo {base}; bán theo đơn vị khác sẽ quy về {base} khi trừ kho. Chứng từ đã lập giữ nguyên quy đổi lúc lập.</p>
    <div className="table-wrap"><table>
      <thead><tr><th scope="col">Đơn vị</th><th scope="col">1 đơn vị =</th><th scope="col">Loại quy đổi</th>
        {loaded.can.readPrices && <th scope="col" className="numeric">Giá bán chung</th>}{loaded.costPerBaseVnd && <th scope="col" className="numeric">Giá vốn ≈</th>}
        {editUnits && <th scope="col"><span className="sr-only">Thao tác</span></th>}</tr></thead>
      <tbody>
        {loaded.units.map((unit) => {
          const isStopped = !!unit.conversionId && stopped.has(unit.conversionId);
          const current = loaded.prices[unit.uomId]?.currentVnd ?? null;
          return <tr key={unit.conversionId ?? "base"} className={isStopped ? "row-stopped" : undefined}>
            <td data-label="Đơn vị"><strong>{unit.symbol}</strong>{!unit.conversionId && <small className="table-subline">Đơn vị cơ sở</small>}</td>
            <td data-label="1 đơn vị =">{formatQuantity(unit.numerator)}{new Decimal(unit.denominator).eq(1) ? "" : ` / ${formatQuantity(unit.denominator)}`} {base}
              {unit.sourceNote && <small className="table-subline">{unit.sourceNote}</small>}</td>
            <td data-label="Loại quy đổi">{unit.conversionId ? catalogChoiceLabel(unit.type) : "—"}</td>
            {loaded.can.readPrices && <td className="numeric" data-label="Giá bán chung">
              {editPrice && !isStopped
                ? <NumberEntry aria-label={`Giá bán 1 ${unit.symbol}`} inputMode="numeric" value={priceTyped(unit.uomId)} normalize={normalizeVndInput} display={vndForEditing}
                  placeholder={current ? money(current) : "Chưa có giá"} onValue={(value) => setPrices((all) => ({ ...all, [unit.uomId]: value }))} disabled={pending} />
                : current ? money(current) : <span className="muted">Chưa có giá</span>}
              {editPrice && current && priceTyped(unit.uomId) && <small className="table-subline">Hiện tại {money(current)}</small>}
            </td>}
            {loaded.costPerBaseVnd && <td className="numeric mono" data-label="Giá vốn ≈">{money(unitCostVnd(loaded.costPerBaseVnd, unit))}</td>}
            {editUnits && <td className="table-actions">{unit.conversionId && <button type="button" className="button button-secondary button-compact" disabled={pending}
              aria-label={`${isStopped ? "Giữ lại" : "Ngừng"} đơn vị ${unit.symbol}`}
              onClick={() => setStopped((current) => { const next = new Set(current); if (next.has(unit.conversionId!)) next.delete(unit.conversionId!); else next.add(unit.conversionId!); return next; })}>
              {isStopped ? "Giữ lại" : "Ngừng"}</button>}</td>}
          </tr>;
        })}
        {added.map((unit, index) => {
          const update = (change: Partial<NewUnit>) => setAdded((all) => all.map((row) => row.key === unit.key ? { ...row, ...change } : row));
          const ratioValid = !unit.ratio || !!normalizeDecimalInput(unit.ratio);
          const needsNote = unit.type === "ESTIMATED" || unit.type === "MEASURED";
          return <tr key={`new-${unit.key}`} className="row-new">
            <td data-label="Đơn vị"><select aria-label={`Đơn vị mới ${index + 1}`} value={unit.uomId} onChange={(event) => update({ uomId: event.target.value })} disabled={pending}>
              <option value="">Chọn đơn vị...</option>
              {loaded.uomOptions.filter((option) => option.id === unit.uomId || !inUse.has(option.id)).map((option) => <option key={option.id} value={option.id}>{option.symbol} · {option.name}</option>)}
            </select></td>
            <td data-label="1 đơn vị ="><span className="unit-ratio"><NumberEntry aria-label={`Số ${base} trong 1 đơn vị mới ${index + 1}`} inputMode="decimal" value={unit.ratio} normalize={normalizeDecimalInput} display={decimalForEditing}
              placeholder="vd 50" aria-invalid={!ratioValid} onValue={(ratio) => update({ ratio })} disabled={pending} /><span>{base}</span></span>
              {!ratioValid && <small className="field-error" role="alert">Số lớn hơn 0, tối đa 6 chữ số thập phân.</small>}</td>
            <td data-label="Loại quy đổi"><select aria-label={`Loại quy đổi đơn vị mới ${index + 1}`} value={unit.type} onChange={(event) => update({ type: event.target.value as NewUnit["type"] })} disabled={pending}>
              {NEW_TYPES.map((type) => <option key={type} value={type}>{catalogChoiceLabel(type)}</option>)}</select>
              {needsNote && <input aria-label={`Nguồn quy đổi đơn vị mới ${index + 1}`} value={unit.sourceNote} maxLength={500} placeholder="vd xe bé ≈ 3 m³ theo thỏa thuận"
                onChange={(event) => update({ sourceNote: event.target.value })} disabled={pending} />}</td>
            {loaded.can.readPrices && <td className="numeric" data-label="Giá bán chung">{editPrice && unit.uomId
              ? <NumberEntry aria-label={`Giá bán 1 ${symbolOf(unit.uomId)}`} inputMode="numeric" value={priceTyped(unit.uomId)} normalize={normalizeVndInput} display={vndForEditing} placeholder="Giá bán"
                onValue={(value) => setPrices((all) => ({ ...all, [unit.uomId]: value }))} disabled={pending} /> : <span className="muted">—</span>}</td>}
            {loaded.costPerBaseVnd && <td className="numeric mono" data-label="Giá vốn ≈">{unit.uomId && normalizeDecimalInput(unit.ratio) ? money(unitCostVnd(loaded.costPerBaseVnd, { uomId: unit.uomId, numerator: normalizeDecimalInput(unit.ratio)!, denominator: "1" })) : "—"}</td>}
            <td className="table-actions"><button type="button" className="button button-secondary button-compact" disabled={pending} aria-label={`Bỏ đơn vị mới ${index + 1}`}
              onClick={() => setAdded((all) => all.filter((row) => row.key !== unit.key))}>Bỏ</button></td>
          </tr>;
        })}
      </tbody>
    </table></div>
    {editUnits && <button type="button" className="button button-secondary" disabled={pending || added.length >= 20}
      onClick={() => { setAdded((all) => [...all, { key: nextKey, uomId: "", ratio: "", type: "PACKAGING", sourceNote: "" }]); setNextKey((key) => key + 1); }}>+ Thêm đơn vị bán</button>}

    {editPrice && sellingUnits.length > 1 && <fieldset className="material-units-split">
      <legend>Chia giá theo quy đổi</legend>
      <label>Từ giá 1<select value={splitFrom} onChange={(event) => setSplitFrom(event.target.value)} disabled={pending}>
        {sellingUnits.map((unit) => <option key={unit.uomId} value={unit.uomId}>{symbolOf(unit.uomId)}</option>)}</select></label>
      <label>Làm tròn<select value={step} onChange={(event) => setStep(Number(event.target.value) as RoundingStep)} disabled={pending}>
        {ROUNDING_STEPS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <button type="button" className="button button-secondary" onClick={suggestPrices} disabled={pending}>Tính giá các đơn vị khác</button>
    </fieldset>}

    {(editUnits || editPrice) && <div className="form-grid">
      {editPrice && priceChanges.length > 0 && <div className="field"><label htmlFor={`units-date-${materialId}`}>Giá áp dụng từ ngày *</label>
        <input id={`units-date-${materialId}`} type="date" min={loaded.today} value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} disabled={pending} /></div>}
      <div className="field"><label htmlFor={`units-reason-${materialId}`}>Lý do thay đổi *</label>
        <input id={`units-reason-${materialId}`} value={reason} maxLength={500} minLength={3} onChange={(event) => setReason(event.target.value)} disabled={pending} placeholder="vd Thêm bán theo bao và tấn" /></div>
    </div>}
    {result && <p className={`form-message${result.success ? " success" : ""}`} role="status">{result.message}</p>}
    {(editUnits || editPrice) && <div className="form-actions">
      <button type="button" className="button button-primary" disabled={pending || !changes || reason.trim().length < 3} onClick={save}>
        {pending ? "Đang lưu..." : unknown ? "Lưu lại đúng thao tác" : `Lưu đơn vị & giá${changes ? ` (${changes} thay đổi)` : ""}`}</button>
    </div>}
  </div>;
}
