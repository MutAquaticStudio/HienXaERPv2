"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { NumberEntry } from "@/components/documents/editor/number-entry";
import { Dialog } from "@/components/ui/dialog";
import { formatVnd, vnd } from "@/lib/core/money";
import { decimalForEditing, normalizeDecimalInput } from "@/lib/core/vn-number";
import { catalogChoiceLabel } from "@/modules/catalog/presentation";
import { loadVariantGroupAction, saveVariantGroupAction, type VariantGroupData, type VariantGroupResult, type VariantUnit } from "@/modules/catalog/variant-actions";
import {
  inferVariantCodePrefix, MATERIAL_CODE_PATTERN, MAX_VARIANT_ATTRIBUTES, MAX_VARIANTS, parseVariantValues, validVariantValue, variantCode, variantCodePrefix, variantCombos,
  variantName, type VariantAttributes,
} from "@/modules/catalog/variants";
import { ROUNDING_STEPS, type RoundingStep } from "@/modules/pricing/bulk-adjust";
import { conversionSentences, ratioFromDirection, splitPriceByUnits, type RatioDirection, type UnitRatio } from "@/modules/pricing/unit-split";
import { MoneyInput } from "@/components/ui/money-input";

type UnitRow = { key: number; uomId: string; ratio: string; direction: RatioDirection; fixed?: { numerator: string; denominator: string }; type: VariantUnit["type"]; sourceNote: string };
type MemberEdit = { values: string[]; detach: boolean };
type NewOverride = { code?: string; name?: string; price?: string; excluded?: boolean };
const UNIT_TYPES = ["PACKAGING", "EXACT", "ESTIMATED", "MEASURED"] as const;

/** 1 unit = numerator/denominator base units: as loaded, or from what was typed ("1 tấn = 20 bao" or "1 bao = 50 kg"). */
const rowRatio = (unit: UnitRow) => { if (unit.fixed) return unit.fixed; const typed = normalizeDecimalInput(unit.ratio); return typed ? ratioFromDirection(typed, unit.direction) : null; };
/**
 * Identifies a row by its values in attribute order, not by attribute name: while two attributes are still unnamed or share a
 * name, keying by name made different rows collide, so one price box filled the others and focus jumped between rows.
 */
const valuesKey = (values: string[]) => JSON.stringify(values.map((value) => (value ?? "").trim().toLocaleLowerCase("vi")));
const toObject = (names: string[], values: string[]): VariantAttributes => Object.fromEntries(names.map((name, index) => [name.trim(), (values[index] ?? "").trim()]));

/**
 * "Hàng cùng loại" (D11): one product such as Xi măng Bút Sơn with an attribute (Mác: PCB30, PCB40…). Every variant is a
 * full material with its own code, stock and price; new variants share the base unit, material group and selling units
 * typed here (each variant can change its own units later). Saved in one command.
 */
export function VariantGroupEditor({ groupId, onSaved }: { groupId: string | null; onSaved: (result: VariantGroupResult) => void }) {
  const [data, setData] = useState<VariantGroupData | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadVariantGroupAction(groupId).then((loaded) => { if (live) setData(loaded); }, () => { if (live) setData(null); });
    return () => { live = false; };
  }, [groupId]);
  if (data === undefined) return <p className="muted">Đang tải...</p>;
  if (data === null) return <p className="form-message" role="alert">Không tải được hàng cùng loại hoặc bạn không có quyền sửa danh mục vật tư.</p>;
  return <VariantGroupForm data={data} onSaved={onSaved} />;
}

function VariantGroupForm({ data, onSaved }: { data: VariantGroupData; onSaved: (result: VariantGroupResult) => void }) {
  const editing = !!data.group;
  const [groupId] = useState(() => data.group?.id ?? crypto.randomUUID());
  const [operationId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(data.group?.name ?? "");
  const [active, setActive] = useState(data.group?.active ?? true);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>(data.group?.attributeNames ?? [""]);
  const [typedValues, setTypedValues] = useState<string[]>(data.group?.attributeNames.map(() => "") ?? [""]);
  const [materialGroupId, setMaterialGroupId] = useState(data.template?.groupId ?? "");
  const [baseUomId, setBaseUomId] = useState(data.template?.baseUomId ?? "");
  const [specification, setSpecification] = useState(data.template?.specification ?? "");
  const [sale, setSale] = useState(data.template?.saleEnabled ?? true);
  const [purchase, setPurchase] = useState(data.template?.purchaseEnabled ?? true);
  const [units, setUnits] = useState<UnitRow[]>(() => (data.template?.units ?? []).map((unit, index) => ({
    key: index + 1, uomId: unit.uomId, type: unit.type, sourceNote: unit.sourceNote, direction: "UNIT_TO_BASE" as const,
    ...(new Decimal(unit.denominator).eq(1) ? { ratio: new Decimal(unit.numerator).toFixed() } : { ratio: "", fixed: { numerator: unit.numerator, denominator: unit.denominator } }),
  })));
  const [nextUnitKey, setNextUnitKey] = useState(100);
  const [members, setMembers] = useState<Record<string, MemberEdit>>(() => Object.fromEntries(data.members.map((member) => [member.id,
    { values: (data.group?.attributeNames ?? []).map((attribute) => member.attributes[attribute] ?? ""), detach: false }])));
  const [attached, setAttached] = useState<{ id: string; values: string[] }[]>([]);
  const [overrides, setOverrides] = useState<Record<string, NewOverride>>({});
  const [priceUomId, setPriceUomId] = useState(data.template?.baseUomId ?? "");
  const [split, setSplit] = useState(true);
  // Split prices are saved as typed, so they are not rounded unless the user asks for it.
  const [step, setStep] = useState<RoundingStep>(1);
  const [effectiveDate, setEffectiveDate] = useState(data.today);
  const [result, setResult] = useState<VariantGroupResult | null>(null);
  const [pending, startTransition] = useTransition();

  const symbol = (uomId: string) => data.options.uoms.find((unit) => unit.id === uomId)?.symbol ?? "Đơn vị";
  const base = baseUomId ? symbol(baseUomId) : "đơn vị cơ sở";
  const codePrefix = prefix ?? (data.group ? inferVariantCodePrefix(name, data.group.attributeNames, data.members) : variantCodePrefix(name));
  const typedLists = useMemo(() => typedValues.map(parseVariantValues), [typedValues]);
  const memberKeys = useMemo(() => new Set([
    ...data.members.filter((member) => !members[member.id]?.detach).map((member) => valuesKey(members[member.id]?.values ?? [])),
    ...attached.map((item) => valuesKey(item.values)),
  ]), [data.members, members, attached]);
  const newRows = useMemo(() => {
    const existing = names.map((_, index) => data.members.map((member) => members[member.id]?.values[index] ?? "").filter(Boolean));
    const lists = names.map((_, index) => [...new Map([...existing[index], ...typedLists[index]].map((value) => [value.toLocaleLowerCase("vi"), value])).values()]);
    return variantCombos(names.map((_, index) => String(index)), lists)
      .map((combo) => names.map((_, index) => combo[String(index)]))
      // When editing, only combinations with a newly typed value are proposed.
      .filter((values) => !editing || values.some((value, index) => typedLists[index].some((typed) => typed.toLocaleLowerCase("vi") === value.toLocaleLowerCase("vi"))))
      .map((values) => ({ key: valuesKey(values), values }))
      .filter((row) => !memberKeys.has(row.key));
  }, [names, typedLists, data.members, members, memberKeys, editing]);

  const sellingUnits: UnitRatio[] = [
    ...(baseUomId ? [{ uomId: baseUomId, numerator: "1", denominator: "1" }] : []),
    ...units.flatMap((unit) => { const ratio = rowRatio(unit); return unit.uomId && ratio ? [{ uomId: unit.uomId, ...ratio }] : []; }),
  ];
  const priceFrom = sellingUnits.find((unit) => unit.uomId === priceUomId) ?? sellingUnits[0];
  const created = newRows.filter((row) => !overrides[row.key]?.excluded).map((row) => {
    const attributes = toObject(names, row.values);
    const override = overrides[row.key] ?? {};
    const price = override.price && /^[1-9]\d*$/.test(override.price) ? override.price : "";
    const prices = !price || !priceFrom ? [] : split
      ? [...splitPriceByUnits(priceFrom, BigInt(price), sellingUnits, step)].map(([uomId, value]) => ({ uomId, priceVnd: value.toString() }))
      : [{ uomId: priceFrom.uomId, priceVnd: price }];
    return { ...row, attributes, code: (override.code ?? variantCode(codePrefix, names, attributes)).toUpperCase(), name: override.name ?? variantName(name, names, attributes), price, prices };
  });

  const originalNames = data.group?.attributeNames ?? [];
  const renamed = editing && names.some((attribute, index) => attribute.trim() !== originalNames[index]);
  type MemberChange = { materialId: string; detach: true } | { materialId: string; attributes: VariantAttributes };
  const memberChanges = data.members.flatMap((member): MemberChange[] => {
    const edit = members[member.id];
    if (!edit) return [];
    if (edit.detach) return [{ materialId: member.id, detach: true as const }];
    const changed = renamed || originalNames.some((attribute, index) => (member.attributes[attribute] ?? "") !== (edit.values[index] ?? "").trim());
    return changed ? [{ materialId: member.id, attributes: toObject(names, edit.values) }] : [];
  });
  const problems = [
    name.trim().length < 2 && "Nhập tên hàng chung (ít nhất 2 ký tự).",
    names.some((attribute) => !attribute.trim() || attribute.trim().length > 40) && "Đặt tên cho từng thuộc tính (tối đa 40 ký tự).",
    new Set(names.map((attribute) => attribute.trim().toLocaleLowerCase("vi"))).size !== names.length && "Hai thuộc tính trùng tên.",
    (created.length > 0 || !editing) && (!materialGroupId || !baseUomId) && "Chọn nhóm vật tư và đơn vị cơ sở.",
    (created.length > 0 || !editing) && !sale && !purchase && "Loại mới cần được bán hoặc được mua.",
    units.some((unit) => !unit.uomId || !rowRatio(unit) || (["ESTIMATED", "MEASURED"].includes(unit.type) && unit.sourceNote.trim().length < 3)) && "Kiểm tra đơn vị bán: chọn đơn vị, số lớn hơn 0 và chia hết (1 tấn = 20 bao được, 1 tấn = 3 bao không chia hết); đơn vị ước lượng/đo thực tế cần ghi nguồn.",
    [...Object.values(members).filter((edit) => !edit.detach).map((edit) => edit.values), ...attached.map((item) => item.values)].some((values) => values.some((value) => !validVariantValue(value)))
      && "Mỗi loại cần đủ giá trị thuộc tính (tối đa 40 ký tự).",
    created.some((row) => !MATERIAL_CODE_PATTERN.test(row.code)) && "Mã loại: 2–32 ký tự gồm chữ không dấu, số, _ hoặc -.",
    new Set(created.map((row) => row.code)).size !== created.length && "Hai loại mới trùng mã.",
    created.some((row) => row.name.trim().length < 2) && "Tên loại cần ít nhất 2 ký tự.",
    created.length + memberChanges.length + attached.length > MAX_VARIANTS && `Mỗi lần lưu tối đa ${MAX_VARIANTS} loại.`,
    !editing && created.length + attached.length === 0 && "Nhập giá trị thuộc tính để tạo các loại (vd PCB30, PCB40).",
  ].filter(Boolean) as string[];
  const changes = created.length + memberChanges.length + attached.length + Number(editing && (name.trim() !== data.group!.name || active !== data.group!.active || renamed));
  const ready = !problems.length && changes > 0;
  const usedUnits = new Set([baseUomId, ...units.map((unit) => unit.uomId)]);
  const hasPrices = created.some((row) => row.prices.length);

  function save() {
    if (pending || !ready) return;
    startTransition(async () => {
      try {
        const saved = await saveVariantGroupAction({
          operationId, groupId, effectiveDate,
          group: { name: name.trim(), attributeNames: names.map((attribute) => attribute.trim()), active },
          expected: data.group ? { name: data.group.name, attribute_names: data.group.attributeNames, active: data.group.active } : null,
          template: materialGroupId && baseUomId ? { groupId: materialGroupId, baseUomId, specification: specification.trim(), saleEnabled: sale, purchaseEnabled: purchase,
            units: units.map((unit) => ({ uomId: unit.uomId, ...rowRatio(unit)!, type: unit.type, sourceNote: unit.sourceNote.trim() })) } : null,
          variants: [...memberChanges, ...attached.map((item) => ({ materialId: item.id, attributes: toObject(names, item.values) })),
            ...created.map((row) => ({ attributes: row.attributes, code: row.code, name: row.name.trim(), prices: row.prices }))],
        });
        setResult(saved);
        if (saved.success) onSaved(saved);
      } catch {
        setResult({ success: false, outcomeUnknown: true, message: "Chưa xác định được kết quả lưu. Bấm lưu lại đúng thao tác này để kiểm tra; hệ thống không lưu trùng." });
      }
    });
  }

  const setOverride = (key: string, change: NewOverride) => setOverrides((all) => ({ ...all, [key]: { ...all[key], ...change } }));
  const attachable = data.options.attachable.filter((option) => !attached.some((item) => item.id === option.id));
  return <div className="variant-editor material-units">
    <section className="form-grid" aria-label="Hàng chung">
      <div className="field"><label htmlFor="variant-name">Tên hàng chung *</label>
        <input id="variant-name" value={name} maxLength={160} placeholder="vd Xi măng Bút Sơn" onChange={(event) => setName(event.target.value)} disabled={pending} /></div>
      <div className="field"><label htmlFor="variant-prefix">Mã gốc (gợi ý mã các loại)</label>
        <input id="variant-prefix" className="input-code" value={codePrefix} maxLength={12} placeholder="vd XMBS" onChange={(event) => setPrefix(event.target.value.toUpperCase())} disabled={pending} /></div>
      {(!editing || !data.template) && <>
        <div className="field"><label htmlFor="variant-material-group">Nhóm vật tư *</label>
          <select id="variant-material-group" value={materialGroupId} onChange={(event) => setMaterialGroupId(event.target.value)} disabled={pending}>
            <option value="">Chọn nhóm...</option>{data.options.materialGroups.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>
        <div className="field"><label htmlFor="variant-base-unit">Đơn vị cơ sở (tồn kho) *</label>
          <select id="variant-base-unit" value={baseUomId} onChange={(event) => { setBaseUomId(event.target.value); setPriceUomId(event.target.value); }} disabled={pending}>
            <option value="">Chọn đơn vị...</option>{data.options.uoms.map((option) => <option key={option.id} value={option.id}>{option.symbol} · {option.name}</option>)}</select></div>
        <div className="field"><label htmlFor="variant-spec">Quy cách chung</label><input id="variant-spec" value={specification} maxLength={500} onChange={(event) => setSpecification(event.target.value)} disabled={pending} /></div>
        <div className="field"><span className="field-label">Cho phép</span><div className="check-row">
          <label><input type="checkbox" checked={sale} onChange={(event) => setSale(event.target.checked)} disabled={pending} /> Bán</label>
          <label><input type="checkbox" checked={purchase} onChange={(event) => setPurchase(event.target.checked)} disabled={pending} /> Mua</label></div></div>
      </>}
      {editing && <div className="field"><label htmlFor="variant-active"><input id="variant-active" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={pending} /> Đang dùng nhóm này</label></div>}
    </section>
    {editing && data.template && <p className="muted">Loại mới dùng đơn vị cơ sở <strong>{base}</strong> và nhóm vật tư như các loại hiện có.</p>}

    <section aria-labelledby="variant-attributes-title">
      <h3 id="variant-attributes-title">Thuộc tính</h3>
      <div className="variant-attributes">{names.map((attribute, index) => <div className="variant-attribute" key={index}>
        <label>Tên thuộc tính {index + 1}<input value={attribute} maxLength={40} placeholder={index === 0 ? "vd Mác, Phi, Màu" : "vd Màu"} disabled={pending}
          onChange={(event) => setNames((all) => all.map((item, at) => at === index ? event.target.value : item))} /></label>
        <label>{editing ? "Thêm giá trị" : "Giá trị"}<input value={typedValues[index] ?? ""} placeholder="vd PCB30, PCB40 (cách nhau dấu phẩy)" disabled={pending}
          onChange={(event) => setTypedValues((all) => all.map((item, at) => at === index ? event.target.value : item))} /></label>
        {!editing && names.length > 1 && <button type="button" className="button button-secondary button-compact" disabled={pending} aria-label={`Bỏ thuộc tính ${index + 1}`}
          onClick={() => { setNames((all) => all.filter((_, at) => at !== index)); setTypedValues((all) => all.filter((_, at) => at !== index)); }}>Bỏ</button>}
      </div>)}</div>
      {!editing && names.length < MAX_VARIANT_ATTRIBUTES && <button type="button" className="button button-secondary" disabled={pending}
        onClick={() => { setNames((all) => [...all, ""]); setTypedValues((all) => [...all, ""]); }}>+ Thêm thuộc tính</button>}
    </section>

    <section aria-labelledby="variant-units-title">
      <h3 id="variant-units-title">Đơn vị bán cho loại mới</h3>
      <p className="muted">Tồn kho mỗi loại tính theo {base}. Các đơn vị dưới đây được tạo cho mọi loại mới; từng loại sửa riêng được sau trong “Đơn vị tính & giá”.</p>
      {units.length > 0 && <div className="table-wrap"><table>
        <thead><tr><th scope="col">Đơn vị</th><th scope="col">Quy đổi</th><th scope="col">Loại quy đổi</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>{units.map((unit, index) => {
          const update = (change: Partial<UnitRow>) => setUnits((all) => all.map((row) => row.key === unit.key ? { ...row, ...change } : row));
          const ratio = rowRatio(unit);
          const unitSymbol = unit.uomId ? symbol(unit.uomId) : "đơn vị bán";
          const sentence = ratio ? conversionSentences(unitSymbol, base, ratio.numerator, ratio.denominator) : null;
          // The typed sentence read the other way round: "1 tấn = 20 bao" → "1 bao = 0,05 tấn".
          const otherWay = sentence && [sentence.main, sentence.other].find((text) => text.startsWith(`1 ${unit.direction === "BASE_TO_UNIT" ? unitSymbol : base} =`));
          return <tr key={unit.key}>
            <td data-label="Đơn vị"><select aria-label={`Đơn vị bán ${index + 1}`} value={unit.uomId} onChange={(event) => update({ uomId: event.target.value })} disabled={pending || !!unit.fixed}>
              <option value="">Chọn đơn vị...</option>
              {data.options.uoms.filter((option) => option.id === unit.uomId || !usedUnits.has(option.id)).map((option) => <option key={option.id} value={option.id}>{option.symbol} · {option.name}</option>)}</select></td>
            <td data-label="Quy đổi">{unit.fixed && sentence ? <><strong>{sentence.main}</strong><small className="table-subline">{sentence.other}</small></>
              : <><span className="unit-ratio">
                <select aria-label={`Cách nhập quy đổi đơn vị bán ${index + 1}`} value={unit.direction} onChange={(event) => update({ direction: event.target.value as RatioDirection })} disabled={pending}>
                  <option value="BASE_TO_UNIT">1 {base} =</option><option value="UNIT_TO_BASE">1 {unitSymbol} =</option></select>
                <NumberEntry aria-label={`Số quy đổi đơn vị bán ${index + 1}`} inputMode="decimal" value={unit.ratio} normalize={normalizeDecimalInput} display={decimalForEditing}
                  placeholder={unit.direction === "BASE_TO_UNIT" ? "vd 20" : "vd 50"} aria-invalid={!!unit.ratio && !ratio} onValue={(value) => update({ ratio: value })} disabled={pending} />
                <span>{unit.direction === "BASE_TO_UNIT" ? unitSymbol : base}</span></span>
                {otherWay && <small className="table-subline">Tức là {otherWay}</small>}
                {!!unit.ratio && !ratio && <small className="field-error" role="alert">1 {unitSymbol} phải ra số {base} chính xác (vd 1 tấn = 20 bao được, 1 tấn = 3 bao không chia hết).</small>}</>}</td>
            <td data-label="Loại quy đổi"><select aria-label={`Loại quy đổi đơn vị bán ${index + 1}`} value={unit.type} onChange={(event) => update({ type: event.target.value as UnitRow["type"] })} disabled={pending}>
              {UNIT_TYPES.map((type) => <option key={type} value={type}>{catalogChoiceLabel(type)}</option>)}</select>
              {(unit.type === "ESTIMATED" || unit.type === "MEASURED") && <input aria-label={`Nguồn quy đổi đơn vị bán ${index + 1}`} value={unit.sourceNote} maxLength={500}
                placeholder="vd barem nhà máy" onChange={(event) => update({ sourceNote: event.target.value })} disabled={pending} />}</td>
            <td className="table-actions"><button type="button" className="button button-secondary button-compact" disabled={pending} aria-label={`Bỏ đơn vị bán ${index + 1}`}
              onClick={() => setUnits((all) => all.filter((row) => row.key !== unit.key))}>Bỏ</button></td>
          </tr>;
        })}</tbody>
      </table></div>}
      <button type="button" className="button button-secondary" disabled={pending || units.length >= 20 || !baseUomId}
        onClick={() => { setUnits((all) => [...all, { key: nextUnitKey, uomId: "", ratio: "", direction: "BASE_TO_UNIT", type: "PACKAGING", sourceNote: "" }]); setNextUnitKey((key) => key + 1); }}>+ Thêm đơn vị bán</button>
    </section>

    <section aria-labelledby="variant-rows-title">
      <h3 id="variant-rows-title">Các loại ({data.members.length + attached.length + created.length})</h3>
      {data.can.prices && created.length > 0 && sellingUnits.length > 0 && <fieldset className="material-units-split">
        <legend>Giá bán loại mới</legend>
        <label>Nhập giá theo<select value={priceFrom?.uomId ?? ""} onChange={(event) => setPriceUomId(event.target.value)} disabled={pending}>
          {sellingUnits.map((unit) => <option key={unit.uomId} value={unit.uomId}>1 {symbol(unit.uomId)}</option>)}</select></label>
        {sellingUnits.length > 1 && <label className="check-inline"><input type="checkbox" checked={split} onChange={(event) => setSplit(event.target.checked)} disabled={pending} /> Tự chia giá cho các đơn vị khác</label>}
        {split && sellingUnits.length > 1 && <label>Làm tròn<select value={step} onChange={(event) => setStep(Number(event.target.value) as RoundingStep)} disabled={pending}>
          {ROUNDING_STEPS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
      </fieldset>}
      <div className="table-wrap"><table>
        <thead><tr>{names.map((attribute, index) => <th scope="col" key={index}>{attribute.trim() || `Thuộc tính ${index + 1}`}</th>)}<th scope="col">Mã</th><th scope="col">Tên vật tư</th>
          {data.can.prices && created.length > 0 && <th scope="col" className="numeric">Giá bán{priceFrom ? ` / ${symbol(priceFrom.uomId)}` : ""}</th>}<th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>
          {data.members.map((member) => {
            const edit = members[member.id];
            return <tr key={member.id} className={edit.detach ? "row-stopped" : undefined}>
              {names.map((attribute, index) => <td key={index} data-label={attribute || `Thuộc tính ${index + 1}`}>
                <input aria-label={`${attribute || "Thuộc tính"} của ${member.code}`} value={edit.values[index] ?? ""} maxLength={40} disabled={pending || edit.detach}
                  onChange={(event) => setMembers((all) => ({ ...all, [member.id]: { ...edit, values: edit.values.map((value, at) => at === index ? event.target.value : value) } }))} /></td>)}
              <td className="mono" data-label="Mã">{member.code}</td>
              <td data-label="Tên vật tư">{member.name}{!member.active && <small className="table-subline">Ngừng dùng</small>}</td>
              {data.can.prices && created.length > 0 && <td className="numeric" data-label="Giá bán"><span className="muted">Giá hiện có</span></td>}
              <td className="table-actions"><button type="button" className="button button-secondary button-compact" disabled={pending}
                aria-label={`${edit.detach ? "Giữ" : "Bỏ khỏi hàng"} ${member.code}`}
                onClick={() => setMembers((all) => ({ ...all, [member.id]: { ...edit, detach: !edit.detach } }))}>{edit.detach ? "Giữ lại" : "Bỏ khỏi hàng"}</button></td>
            </tr>;
          })}
          {attached.map((item) => {
            const option = data.options.attachable.find((row) => row.id === item.id);
            return <tr key={item.id} className="row-new">
              {names.map((attribute, index) => <td key={index} data-label={attribute || `Thuộc tính ${index + 1}`}>
                <input aria-label={`${attribute || "Thuộc tính"} của ${option?.code ?? "vật tư"}`} value={item.values[index] ?? ""} maxLength={40} disabled={pending}
                  onChange={(event) => setAttached((all) => all.map((row) => row.id === item.id ? { ...row, values: row.values.map((value, at) => at === index ? event.target.value : value) } : row))} /></td>)}
              <td className="mono" data-label="Mã">{option?.code}</td><td data-label="Tên vật tư">{option?.name}<small className="table-subline">Vật tư có sẵn</small></td>
              {data.can.prices && created.length > 0 && <td className="numeric" data-label="Giá bán"><span className="muted">Giá hiện có</span></td>}
              <td className="table-actions"><button type="button" className="button button-secondary button-compact" disabled={pending} aria-label={`Bỏ ${option?.code ?? "vật tư"}`}
                onClick={() => setAttached((all) => all.filter((row) => row.id !== item.id))}>Bỏ</button></td>
            </tr>;
          })}
          {created.map((row) => <tr key={row.key} className="row-new">
            {row.values.map((value, index) => <td key={index} data-label={names[index] || `Thuộc tính ${index + 1}`}><strong>{value}</strong></td>)}
            <td data-label="Mã"><input aria-label={`Mã loại ${row.values.join(" ")}`} className="input-code" value={row.code} maxLength={32} disabled={pending}
              onChange={(event) => setOverride(row.key, { code: event.target.value.toUpperCase() })} /></td>
            <td data-label="Tên vật tư"><input aria-label={`Tên loại ${row.values.join(" ")}`} value={row.name} maxLength={160} disabled={pending}
              onChange={(event) => setOverride(row.key, { name: event.target.value })} /></td>
            {data.can.prices && <td className="numeric" data-label="Giá bán"><MoneyInput aria-label={`Giá bán loại ${row.values.join(" ")}`} value={row.price}
              placeholder="Để trống: đặt sau" onValue={(price) => setOverride(row.key, { price })} disabled={pending} />
              {row.prices.length > 1 && <small className="table-subline">{row.prices.filter((price) => price.uomId !== priceFrom?.uomId).map((price) => `${symbol(price.uomId)} ${formatVnd(vnd(price.priceVnd))}`).join(" · ")}</small>}</td>}
            <td className="table-actions"><button type="button" className="button button-secondary button-compact" disabled={pending} aria-label={`Không tạo loại ${row.values.join(" ")}`}
              onClick={() => setOverride(row.key, { excluded: true })}>Bỏ</button></td>
          </tr>)}
        </tbody>
      </table></div>
      {Object.values(overrides).some((item) => item.excluded) && <button type="button" className="link-button" disabled={pending}
        onClick={() => setOverrides((all) => Object.fromEntries(Object.entries(all).map(([key, item]) => [key, { ...item, excluded: false }])))}>Hiện lại các loại đã bỏ</button>}
      {attachable.length > 0 && <label className="variant-attach">Thêm vật tư có sẵn vào hàng này
        <select value="" disabled={pending} onChange={(event) => { const id = event.target.value; if (id) setAttached((all) => [...all, { id, values: names.map(() => "") }]); }}>
          <option value="">Chọn vật tư...</option>{attachable.map((option) => <option key={option.id} value={option.id}>{option.code} · {option.name}</option>)}</select></label>}
    </section>

    {hasPrices && <div className="form-grid">
      <div className="field"><label htmlFor="variant-date">Giá áp dụng từ ngày *</label>
        <input id="variant-date" type="date" min={data.today} value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} disabled={pending} /></div>
    </div>}
    {problems.length > 0 && changes > 0 && <ul className="form-message variant-problems" role="status">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
    {result && !result.success && <p className="form-message" role="alert">{result.message}</p>}
    <div className="form-actions"><button type="button" className="button button-primary" disabled={pending || !ready} onClick={save}>
      {pending ? "Đang lưu..." : result?.outcomeUnknown ? "Lưu lại đúng thao tác" : editing ? `Lưu hàng cùng loại${changes ? ` (${changes} thay đổi)` : ""}` : `Tạo ${created.length + attached.length} loại`}</button></div>
  </div>;
}

/** Button that opens the variant group editor in a popup (create when no `groupId`). */
export function VariantGroupButton({ label, groupId = null, className = "button button-secondary" }: { label: string; groupId?: string | null; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState("");
  return <>
    <button type="button" className={className} onClick={() => { setSaved(""); setOpen(true); }}>{label}</button>
    {saved && <p className="form-message success catalog-saved" role="status">{saved}</p>}
    {open && <Dialog size="lg" eyebrow={groupId ? "Sửa" : "Thêm mới"} title={groupId ? "Hàng cùng loại" : "Thêm hàng cùng loại"} onClose={() => setOpen(false)} initialFocusId="variant-name"
      description="Mỗi loại là một vật tư riêng: mã, tồn kho và giá riêng; dùng chung tên hàng, thuộc tính và đơn vị.">
      <VariantGroupEditor groupId={groupId} onSaved={(result) => { setSaved(result.message); setOpen(false); router.refresh(); }} />
    </Dialog>}
  </>;
}
