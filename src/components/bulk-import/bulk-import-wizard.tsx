"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { createBrowserSupabase } from "@/lib/supabase/browser";
import { formatVnd, vnd } from "@/lib/core/money";
import { createBulkImportDocumentDraftAction, loadBulkImportRunAction, previewBulkImportAction, saveBulkImportReviewAction } from "@/modules/bulk-import/actions";
import styles from "./bulk-import.module.css";

type Kind = "SO" | "PO";
type PreviewRow = { rowNumber: number; hidden: boolean; cells: string[] };
type PreviewSheet = { index: number; name: string; hidden: boolean; rows: PreviewRow[] };
type Workbook = { totalRows: number; hiddenRows: number; worksheets: PreviewSheet[] };
type FileInfo = { runId: string; fileId: string; fileName: string; byteSize: number; workbook: Workbook };
type Mapping = { grouping: "" | "SINGLE" | "BY_SOURCE_REFERENCE" | "BY_GROUP_COLUMN"; sourceReferenceColumn: string; groupColumn: string;
  entityCodeColumn: string; siteOrWarehouseCodeColumn: string; materialCodeColumn: string; uomCodeColumn: string; quantityColumn: string;
  sourcePriceColumn: string; expectedAtColumn: string; termsColumn: string; worksheetName: string; headerRow: string;
  sourceNamespace: string; sourcePeriod: string; singleReference: string; includeHiddenRows: boolean };
type ImportLine = { rowNumber: number; materialCode: string; uomCode: string; quantity: string; sourcePrice: string;
  manualPriceVnd: string; manualReason: string; manualCostVnd: string; manualCostReason: string;
  material?: { id: string; code: string; name: string }; uom?: { id: string; code: string; name: string } };
type ImportGroup = { groupKey: string; documentId: string | null; operationId: string; sourceReference: string; entityCode: string; siteOrWarehouseCode: string;
  expectedAt: string; terms: string; state: string; duplicateOfDocumentId: string | null; resultEntityId?: string | null; issues: { code: string; message: string; rowNumber?: number; field?: string }[];
  lines: ImportLine[]; candidatePayload: Record<string, unknown> | null; totalVnd: string | null; pricePreview: { lineTotalVnd?: string; unitPriceVnd?: string; unitCostVnd?: string; sourcePriceVnd?: string }[] };
type ActionResult = { success: boolean; message: string; groups?: ImportGroup[]; hiddenRowsSkipped?: number };
type RunFile = { file_id: string; file_name: string; byte_size: number; upload_state: string; checksum_sha256?: string | null; mapping?: Record<string, unknown>;
  review_overrides?: Record<string, unknown>[]; documents?: Record<string, unknown>[] };
type Run = { run_id: string; branch_id: string; document_kind: string; state: string; files?: RunFile[] };
type UploadResponse = { error?: string; token?: string; bucket?: string; objectPath?: string; contentType?: string; alreadyVerified?: boolean };

const blankMapping: Mapping = { grouping: "", sourceReferenceColumn: "", groupColumn: "", entityCodeColumn: "", siteOrWarehouseCodeColumn: "",
  materialCodeColumn: "", uomCodeColumn: "", quantityColumn: "", sourcePriceColumn: "", expectedAtColumn: "", termsColumn: "",
  worksheetName: "", headerRow: "1", sourceNamespace: "", sourcePeriod: "", singleReference: "", includeHiddenRows: false };
const labels: Record<string, string> = { sourceReferenceColumn: "Mã chứng từ nguồn", groupColumn: "Nhóm đơn", entityCodeColumn: "Mã khách hàng", siteOrWarehouseCodeColumn: "Mã công trình",
  materialCodeColumn: "Mã vật tư", uomCodeColumn: "Mã đơn vị tính", quantityColumn: "Số lượng", sourcePriceColumn: "Giá từ tệp (tham khảo)",
  expectedAtColumn: "Ngày dự kiến", termsColumn: "Ghi chú / điều khoản" };
const statusLabel: Record<string, string> = { READY: "Sẵn sàng xem lại", NEEDS_REVIEW: "Cần đối chiếu", INVALID: "Có lỗi cần sửa", DUPLICATE: "Trùng mã nguồn", CREATED: "Đã tạo bản nháp", FAILED: "Chưa tạo được" };

function normalizeMapping(value: Record<string, unknown> | undefined, workbook: Workbook): Mapping {
  const stored = value ?? {};
  const indexKeys = ["sourceReferenceColumn", "groupColumn", "entityCodeColumn", "siteOrWarehouseCodeColumn", "materialCodeColumn", "uomCodeColumn", "quantityColumn", "sourcePriceColumn", "expectedAtColumn", "termsColumn"] as const;
  const mapping = { ...blankMapping, ...stored } as unknown as Mapping;
  for (const key of indexKeys) mapping[key] = stored[key] == null ? "" : String(stored[key]);
  mapping.headerRow = String(stored.headerRow ?? 1);
  mapping.worksheetName = typeof stored.worksheetName === "string" ? stored.worksheetName : workbook.worksheets.find((sheet) => !sheet.hidden)?.name ?? "";
  mapping.grouping = ["SINGLE", "BY_SOURCE_REFERENCE", "BY_GROUP_COLUMN"].includes(String(stored.grouping)) ? stored.grouping as Mapping["grouping"] : "";
  mapping.sourceNamespace = String(stored.sourceNamespace ?? "");
  mapping.sourcePeriod = String(stored.sourcePeriod ?? "");
  mapping.singleReference = String(stored.singleReference ?? "");
  mapping.includeHiddenRows = stored.includeHiddenRows === true;
  return mapping;
}

function mappingPayload(mapping: Mapping) {
  const numeric = (value: string) => value === "" ? null : Number(value);
  return { grouping: mapping.grouping, sourceReferenceColumn: numeric(mapping.sourceReferenceColumn), groupColumn: numeric(mapping.groupColumn),
    entityCodeColumn: numeric(mapping.entityCodeColumn), siteOrWarehouseCodeColumn: numeric(mapping.siteOrWarehouseCodeColumn),
    materialCodeColumn: numeric(mapping.materialCodeColumn), uomCodeColumn: numeric(mapping.uomCodeColumn), quantityColumn: numeric(mapping.quantityColumn),
    sourcePriceColumn: numeric(mapping.sourcePriceColumn), expectedAtColumn: numeric(mapping.expectedAtColumn), termsColumn: numeric(mapping.termsColumn),
    worksheetName: mapping.worksheetName, headerRow: Number(mapping.headerRow), sourceNamespace: mapping.sourceNamespace, sourcePeriod: mapping.sourcePeriod,
    singleReference: mapping.singleReference, includeHiddenRows: mapping.includeHiddenRows };
}

function restoredStates(groups: ImportGroup[], runFile: RunFile | undefined): ImportGroup[] {
  if (!runFile) return groups;
  return groups.map((group) => {
    const saved = runFile.documents?.find((document) => document.group_key === group.groupKey);
    if (!saved) return group;
    const state = String(saved.state);
    const created = state === "CREATED";
    return { ...group, documentId: String(saved.document_id), operationId: String(saved.operation_id), state,
      duplicateOfDocumentId: typeof saved.duplicate_of_document_id === "string" ? saved.duplicate_of_document_id : null,
      resultEntityId: typeof saved.result_entity_id === "string" ? saved.result_entity_id : null,
      ...(created ? { candidatePayload: (saved.candidate_payload as Record<string, unknown> | null) ?? group.candidatePayload,
        totalVnd: null, pricePreview: [], issues: [] } : {}) };
  });
}

function overridesFor(groups: ImportGroup[]) {
  return groups.map((group) => ({ groupKey: group.groupKey, entityCode: group.entityCode, siteOrWarehouseCode: group.siteOrWarehouseCode,
    expectedAt: group.expectedAt, terms: group.terms, lines: group.lines.map((line) => ({ rowNumber: line.rowNumber, materialCode: line.materialCode,
      uomCode: line.uomCode, quantity: line.quantity, manualPriceVnd: line.manualPriceVnd, manualReason: line.manualReason,
      manualCostVnd: line.manualCostVnd, manualCostReason: line.manualCostReason })) }));
}

export function BulkImportWizard({ kind, branchId, canManagePrice }: { kind: Kind; branchId: string; canManagePrice: boolean }) {
  const [file, setFile] = useState<FileInfo | null>(null);
  const [mapping, setMapping] = useState<Mapping>(blankMapping);
  const [groups, setGroups] = useState<ImportGroup[]>([]);
  const [runFiles, setRunFiles] = useState<RunFile[]>([]);
  const [runState, setRunState] = useState("UPLOADING");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [hiddenRowsSkipped, setHiddenRowsSkipped] = useState(0);
  const [repeat, setRepeat] = useState<Record<string, { enabled: boolean; reason: string }>>({});
  const [busy, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const runIdRef = useRef("");
  const fileIdRef = useRef("");
  const uploadingRef = useRef(false);
  const lastUploadRef = useRef<{ fileId: string; fileName: string; byteSize: number; checksum: string | null } | null>(null);

  const selectedSheet = file?.workbook.worksheets.find((sheet) => sheet.name === mapping.worksheetName) ?? file?.workbook.worksheets.find((sheet) => !sheet.hidden);
  const headerRow = Number(mapping.headerRow);
  const header = selectedSheet?.rows.find((row) => row.rowNumber === headerRow);
  const headers = header?.cells.map((value, index) => ({ index, value: value.trim() || `Cột ${index + 1}` })) ?? [];
  const headerRows = selectedSheet?.rows.slice(0, 20).map((row) => row.rowNumber) ?? [];

  const rebuildReview = useCallback(async (runId: string, fileId: string, restoredMapping: Mapping, runFile?: RunFile) => {
    if (!restoredMapping.grouping) return;
    const review = await previewBulkImportAction({ kind, runId, fileId, mapping: mappingPayload(restoredMapping), overrides: runFile?.review_overrides ?? [] });
    if (!review.success || !review.groups) { setError(review.message ?? "Không thể khôi phục phần rà soát."); return; }
    setGroups(restoredStates(review.groups, runFile));
    setError("");
    if (typeof review.hiddenRowsSkipped === "number") setHiddenRowsSkipped(review.hiddenRowsSkipped);
  }, [kind]);

  useEffect(() => {
    const urlRun = new URLSearchParams(window.location.search).get("run");
    const storedRun = sessionStorage.getItem(`hx-bulk-import:${branchId}:${kind}`);
    const runId = urlRun || storedRun;
    if (!runId) return;
    runIdRef.current = runId;
    void (async () => {
      const result = await loadBulkImportRunAction(kind, runId);
      if (!result.success || !result.run) { setError(result.message ?? "Không thể khôi phục lần nhập."); return; }
      const run = result.run as Run;
      setRunState(run.state);
      setRunFiles(run.files ?? []);
      const lastFile = run.files?.at(-1);
      if (!lastFile) return;
      fileIdRef.current = lastFile.file_id;
      lastUploadRef.current = { fileId: lastFile.file_id, fileName: lastFile.file_name, byteSize: Number(lastFile.byte_size), checksum: lastFile.checksum_sha256 ?? null };
      const verified = await fetch("/api/admin/bulk-import", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "verify", kind, runId, fileId: lastFile.file_id }) });
      const parsed = await verified.json().catch(() => null) as { error?: string; workbook?: Workbook } | null;
      if (!verified.ok || !parsed?.workbook) { setError(parsed?.error ?? "Không thể mở lại lần nhập."); return; }
      setFile({ runId, fileId: lastFile.file_id, fileName: lastFile.file_name, byteSize: lastFile.byte_size, workbook: parsed.workbook });
      const restoredMapping = normalizeMapping(lastFile.mapping, parsed.workbook);
      setMapping(restoredMapping);
      await rebuildReview(runId, lastFile.file_id, restoredMapping, lastFile);
    })();
  }, [branchId, kind, rebuildReview]);

  function updateMapping(key: keyof Mapping, value: string | boolean) { setMapping((current) => ({ ...current, [key]: value })); }
  function chooseFile(selection: FileList | null) {
    setError(""); setNotice(""); setGroups([]); setFile(null);
    if (!selection?.length || uploadingRef.current) return;
    const selectedFiles = Array.from(selection);
    uploadingRef.current = true; setUploading(true);
    void (async () => { try { for (const current of selectedFiles) {
      if (current.name !== lastUploadRef.current?.fileName || current.size !== lastUploadRef.current?.byteSize) { fileIdRef.current = ""; lastUploadRef.current = null; }
      await upload(current);
    } } finally { uploadingRef.current = false; setUploading(false); } })();
  }

  async function upload(selected: File) {
    setGroups([]); setFile(null);
    if (!selected.name.toLowerCase().endsWith(".xlsx") || selected.size < 1 || selected.size > 10 * 1024 * 1024) {
      setError("Chọn tệp Excel .xlsx có dữ liệu, tối đa 10 MB."); return;
    }
    try {
      const digest = await crypto.subtle.digest("SHA-256", await selected.arrayBuffer());
      const checksum = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
      const runId = runIdRef.current || crypto.randomUUID();
      let fileId = fileIdRef.current || crypto.randomUUID();
      if (lastUploadRef.current?.fileId === fileId && lastUploadRef.current.checksum && lastUploadRef.current.checksum !== checksum) fileId = crypto.randomUUID();
      runIdRef.current = runId; fileIdRef.current = fileId; lastUploadRef.current = { fileId, fileName: selected.name, byteSize: selected.size, checksum };
      sessionStorage.setItem(`hx-bulk-import:${branchId}:${kind}`, runId);
      window.history.replaceState(null, "", `${window.location.pathname}?run=${runId}`);
      setNotice("Đang tải và kiểm tra tệp…"); setError("");
      const prepare = await fetch("/api/admin/bulk-import", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "prepare", kind, runId }) });
      const prepared = await prepare.json().catch(() => null) as { error?: string } | null;
      if (!prepare.ok) throw new Error(prepared?.error ?? "Không thể mở lần nhập.");
      const registeredResponse = await fetch("/api/admin/bulk-import", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "register", kind, runId, fileId, fileName: selected.name, byteSize: selected.size }) });
      const registered = await registeredResponse.json().catch(() => null) as UploadResponse | null;
      if (!registeredResponse.ok || (!registered?.alreadyVerified && (!registered?.token || !registered.objectPath || !registered.bucket))) throw new Error(registered?.error ?? "Không thể chuẩn bị tải tệp.");
      if (!registered.alreadyVerified) {
        const { error: uploadError } = await createBrowserSupabase().storage.from(registered.bucket!).uploadToSignedUrl(registered.objectPath!, registered.token!, selected, { contentType: registered.contentType });
        if (uploadError) {
          // If the upload response was lost after storage accepted the bytes, verify that exact object before retrying.
          const verifiedExisting = await verify(runId, fileId);
          if (!verifiedExisting) throw new Error("Tệp chưa tải đủ. Hãy chọn lại đúng tệp này để thử lại.");
          return;
        }
      }
      await verify(runId, fileId);
    } catch (reason) {
      setNotice(""); setError(reason instanceof Error ? reason.message : "Không thể tải tệp.");
    }
  }

  async function verify(runId: string, fileId: string): Promise<Workbook | null> {
    const response = await fetch("/api/admin/bulk-import", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: "verify", kind, runId, fileId }) });
    const result = await response.json().catch(() => null) as { error?: string; workbook?: Workbook } | null;
    if (!response.ok || !result?.workbook) { setNotice(""); setError(result?.error ?? "Không thể xác minh tệp."); return null; }
    setFile({ runId, fileId, fileName: "Tệp Excel đã tải", byteSize: 0, workbook: result.workbook });
    setMapping((current) => ({ ...current, worksheetName: result.workbook!.worksheets.find((sheet) => !sheet.hidden)?.name ?? "" }));
    setNotice("Tệp đã được xác minh. Chọn cách chia nhóm đơn và ghép các cột trước khi xem giá."); setError("");
    const loaded = await loadBulkImportRunAction(kind, runId);
    if (loaded.success && loaded.run) { const run = loaded.run as Run; setRunFiles(run.files ?? []); setRunState(run.state); }
    return result.workbook;
  }

  async function openRunFile(runFile: RunFile) {
    const runId = runIdRef.current;
    fileIdRef.current = runFile.file_id;
    lastUploadRef.current = { fileId: runFile.file_id, fileName: runFile.file_name, byteSize: Number(runFile.byte_size), checksum: runFile.checksum_sha256 ?? null };
    const workbook = await verify(runId, runFile.file_id);
    if (workbook) {
      setFile((current) => current ? { ...current, fileName: runFile.file_name, byteSize: Number(runFile.byte_size) } : current);
      const restoredMapping = normalizeMapping(runFile.mapping, workbook);
      setMapping(restoredMapping);
      const loaded = await loadBulkImportRunAction(kind, runId);
      if (loaded.success && loaded.run) {
        const updatedRun = loaded.run as Run;
        setRunState(updatedRun.state);
        setRunFiles(updatedRun.files ?? []);
        await rebuildReview(runId, runFile.file_id, restoredMapping, updatedRun.files?.find((item) => item.file_id === runFile.file_id));
      }
    }
  }

  function makeInput() {
    if (!file || !mapping.grouping) return null;
    return { kind, runId: file.runId, fileId: file.fileId, mapping: mappingPayload({ ...mapping, headerRow: String(headerRow) }), overrides: overridesFor(groups) };
  }

  function runPreview(persist: boolean) {
    const input = makeInput();
    if (!input) { setError("Chọn rõ cách chia nhóm đơn trước khi tiếp tục."); return; }
    setError(""); setNotice(persist ? "Đang lưu kết quả đối chiếu…" : "Đang đối chiếu danh mục và tính giá…");
    startTransition(async () => {
      const result = (persist ? await saveBulkImportReviewAction(input) : await previewBulkImportAction(input)) as ActionResult;
      setNotice(result.message ?? "");
      if (result.groups) setGroups(persist ? result.groups : result.groups.map((group) => group.state === "CREATED"
        ? group : { ...group, documentId: null, state: group.state === "DUPLICATE" ? "NEEDS_REVIEW" : group.state }));
      if (persist && file) { const loaded = await loadBulkImportRunAction(kind, file.runId); if (loaded.success && loaded.run) { const run = loaded.run as Run; setRunFiles(run.files ?? []); setRunState(run.state); } }
      if (typeof result.hiddenRowsSkipped === "number") setHiddenRowsSkipped(result.hiddenRowsSkipped);
      if (!result.success) setError(result.message);
    });
  }

  function updateGroup(groupKey: string, field: "entityCode" | "siteOrWarehouseCode" | "expectedAt" | "terms", value: string) {
    setGroups((current) => current.map((group) => group.groupKey === groupKey && group.state !== "CREATED"
      ? { ...group, [field]: value, state: "NEEDS_REVIEW", candidatePayload: null, totalVnd: null, pricePreview: [] } : group));
  }
  function updateLine(groupKey: string, rowNumber: number, field: "materialCode" | "uomCode" | "quantity" | "manualPriceVnd" | "manualReason" | "manualCostVnd" | "manualCostReason", value: string) {
    setGroups((current) => current.map((group) => group.groupKey === groupKey && group.state !== "CREATED"
      ? { ...group, state: "NEEDS_REVIEW", candidatePayload: null, totalVnd: null, pricePreview: [],
        lines: group.lines.map((line) => line.rowNumber === rowNumber ? { ...line, [field]: value } : line) } : group));
  }

  function createDraft(group: ImportGroup) {
    if (!group.documentId) return;
    const confirmation = repeat[group.groupKey];
    startTransition(async () => {
      const result = await createBulkImportDocumentDraftAction({ kind, runId: file!.runId, fileId: file!.fileId, documentId: group.documentId,
        repeatOf: confirmation?.enabled ? group.duplicateOfDocumentId : null, repeatReason: confirmation?.enabled ? confirmation.reason : "" }) as { success: boolean; message: string; result?: { result_id?: string; result_entity_id?: string; status?: string } };
      setNotice(result.message); setError(result.success ? "" : result.message);
      const refreshed = await loadBulkImportRunAction(kind, file!.runId);
      if (refreshed.success && refreshed.run) {
        const updatedRun = refreshed.run as Run;
        setRunState(updatedRun.state);
        const refreshedFile = updatedRun.files?.find((candidate) => candidate.file_id === file!.fileId);
        setRunFiles(updatedRun.files ?? []);
        await rebuildReview(file!.runId, file!.fileId, mapping, refreshedFile);
      }
    });
  }

  const title = kind === "SO" ? "Nhập đơn bán từ Excel" : "Nhập đơn mua từ Excel";
  const entityLabel = kind === "SO" ? "Mã khách hàng" : "Mã nhà cung cấp";
  const locationLabel = kind === "SO" ? "Mã công trình" : "Mã kho nhận";
  const documentLink = kind === "SO" ? "/admin/orders" : "/admin/purchase-orders";

  return <div className={styles.shell}>
    <header className="page-heading"><div><p className="eyebrow">{kind === "SO" ? "Bán hàng" : "Cung ứng"}</p><h1>{title}</h1>
      <p className="lede">Đọc Excel, đối chiếu danh mục và tạo từng chứng từ ở trạng thái nháp. Không xác nhận đơn, nhập kho hay ghi công nợ.</p></div>
      <Link className="button button-secondary" href={documentLink}>Về danh sách</Link>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <section className={`card card-pad ${styles.card}`}>
      <div className={styles.toolbar}><div><h2>1. Chọn tệp Excel</h2><p className={styles.small}>Tối đa 10 MB, 1.000 dòng mỗi trang tính. PDF sẽ được hỗ trợ ở giai đoạn sau.</p></div>
        <button className="button button-secondary" type="button" disabled={uploading || busy} onClick={() => { runIdRef.current = ""; fileIdRef.current = ""; lastUploadRef.current = null; setFile(null); setGroups([]); setRunFiles([]); setRunState("UPLOADING"); setMapping(blankMapping); sessionStorage.removeItem(`hx-bulk-import:${branchId}:${kind}`); window.history.replaceState(null, "", window.location.pathname); }}>Bắt đầu lần nhập mới</button></div>
      {runState === "COMPLETE" && <p className={styles.notice}>Lượt nhập này đã hoàn tất. Bắt đầu lượt mới nếu cần thêm tệp.</p>}
      {runFiles.length > 0 && <div className={styles.fileList} aria-label="Tệp trong lần nhập"><strong>{runFiles.length} tệp trong lần nhập này</strong>{runFiles.map((runFile) => <div className={styles.toolbar} key={runFile.file_id}><span>{runFile.file_name} · {(runFile.documents ?? []).length} chứng từ</span><button className="button button-secondary" type="button" disabled={busy || uploading || file?.fileId === runFile.file_id} onClick={() => void openRunFile(runFile)}>Mở tệp</button></div>)}</div>}
      <div className={styles.grid}>
        <div className={`${styles.field} ${styles.full}`}><label htmlFor="bulk-file">Một hoặc nhiều tệp .xlsx</label><input id="bulk-file" type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy || uploading || runState === "COMPLETE" || runState === "EXPIRED"} onChange={(event) => chooseFile(event.target.files)} />
          <span className={styles.small}>Tệp được giữ riêng trong thời gian tối đa 30 ngày để phục hồi lần nhập.</span></div>
      </div>
      {file && <div className={styles.filePreview} aria-label="Xem trước dữ liệu tệp"><table className={styles.table}><thead><tr><th>Dòng</th>{(selectedSheet?.rows.find((row) => row.rowNumber === Number(mapping.headerRow))?.cells ?? []).map((cell, index) => <th key={index}>{cell?.trim() || `Cột ${index + 1}`}</th>)}</tr></thead>
        <tbody>{selectedSheet?.rows.slice(0, 12).filter((row) => row.rowNumber !== Number(mapping.headerRow)).map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}{row.hidden ? " · ẩn" : ""}</td>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>}
    </section>

    {file && <section className={`card card-pad ${styles.card}`}>
      <h2>2. Chọn cách chia và ghép cột</h2>
      <p className={styles.small}>Toàn bộ tệp không tự động được coi là một đơn. Chọn rõ nhóm nguồn; cùng một mã nguồn trong nhiều nhóm sẽ được cảnh báo trùng.</p>
      <div className={styles.grid}>
        <div className={styles.field}><label htmlFor="bulk-sheet">Trang tính</label><select id="bulk-sheet" value={mapping.worksheetName} onChange={(event) => updateMapping("worksheetName", event.target.value)}>{file.workbook.worksheets.map((sheet) => <option key={sheet.name} value={sheet.name} disabled={sheet.hidden}>{sheet.name}{sheet.hidden ? " (ẩn)" : ""}</option>)}</select></div>
        <div className={styles.field}><label htmlFor="bulk-header">Dòng tiêu đề</label><select id="bulk-header" value={mapping.headerRow} onChange={(event) => updateMapping("headerRow", event.target.value)}>{headerRows.map((row) => <option key={row} value={row}>{row}</option>)}</select></div>
        <div className={styles.field}><label htmlFor="bulk-grouping">Cách chia chứng từ</label><select id="bulk-grouping" value={mapping.grouping} onChange={(event) => updateMapping("grouping", event.target.value as Mapping["grouping"])}><option value="">Chọn cách chia…</option><option value="SINGLE">Một chứng từ cho các dòng đã chọn</option><option value="BY_SOURCE_REFERENCE">Nhóm theo mã chứng từ nguồn</option><option value="BY_GROUP_COLUMN">Nhóm theo cột do tôi xác nhận</option></select></div>
        <div className={styles.field}><label htmlFor="bulk-source-name">Nguồn chứng từ</label><input id="bulk-source-name" value={mapping.sourceNamespace} maxLength={120} placeholder="Ví dụ: Bảng đặt hàng tháng" onChange={(event) => updateMapping("sourceNamespace", event.target.value)} /></div>
        <div className={styles.field}><label htmlFor="bulk-source-period">Kỳ / ngày nguồn</label><input id="bulk-source-period" value={mapping.sourcePeriod} maxLength={40} placeholder="Ví dụ: 10/2026" onChange={(event) => updateMapping("sourcePeriod", event.target.value)} /></div>
        {mapping.grouping === "SINGLE" && <div className={styles.field}><label htmlFor="bulk-single-ref">Mã chứng từ nguồn</label><input id="bulk-single-ref" value={mapping.singleReference} maxLength={160} onChange={(event) => updateMapping("singleReference", event.target.value)} /></div>}
        {mapping.grouping !== "SINGLE" && <div className={styles.field}><label htmlFor="bulk-ref-col">Cột mã chứng từ nguồn</label><select id="bulk-ref-col" value={mapping.sourceReferenceColumn} onChange={(event) => updateMapping("sourceReferenceColumn", event.target.value)}><option value="">Chọn cột…</option>{headers.map((item) => <option key={item.index} value={item.index}>{item.value}</option>)}</select></div>}
        {mapping.grouping === "BY_GROUP_COLUMN" && <div className={styles.field}><label htmlFor="bulk-group-col">Cột nhóm đơn</label><select id="bulk-group-col" value={mapping.groupColumn} onChange={(event) => updateMapping("groupColumn", event.target.value)}><option value="">Chọn cột…</option>{headers.map((item) => <option key={item.index} value={item.index}>{item.value}</option>)}</select></div>}
        {(["entityCodeColumn", "siteOrWarehouseCodeColumn", "materialCodeColumn", "uomCodeColumn", "quantityColumn", "sourcePriceColumn", "expectedAtColumn", "termsColumn"] as const).map((key) => <div className={styles.field} key={key}>
          <label htmlFor={`bulk-${key}`}>{key === "entityCodeColumn" ? entityLabel : key === "siteOrWarehouseCodeColumn" ? locationLabel : labels[key]}{["entityCodeColumn", "siteOrWarehouseCodeColumn", "materialCodeColumn", "uomCodeColumn", "quantityColumn"].includes(key) ? " *" : " (tùy chọn)"}</label>
          <select id={`bulk-${key}`} value={mapping[key]} onChange={(event) => updateMapping(key, event.target.value)}><option value="">{key === "siteOrWarehouseCodeColumn" && kind === "PO" ? "Chọn cột kho nhận…" : "Chọn cột…"}</option>{headers.map((item) => <option key={item.index} value={item.index}>{item.value}</option>)}</select>
        </div>)}
        <label className={`${styles.field} ${styles.full}`}><span><input type="checkbox" checked={mapping.includeHiddenRows} onChange={(event) => updateMapping("includeHiddenRows", event.target.checked)} /> Bao gồm các dòng đang ẩn sau khi đã kiểm tra</span>
          <span className={styles.small}>Tệp có {file.workbook.hiddenRows} dòng ẩn; mặc định bỏ qua để tránh nhập nhầm dữ liệu không hiển thị.</span></label>
      </div>
      <div className={styles.actions}><button className="button button-primary" type="button" disabled={busy || uploading || !mapping.grouping || !mapping.sourceNamespace.trim() || !mapping.sourcePeriod.trim() || !mapping.entityCodeColumn || !mapping.siteOrWarehouseCodeColumn || !mapping.materialCodeColumn || !mapping.uomCodeColumn || !mapping.quantityColumn} onClick={() => runPreview(false)}>Đối chiếu và xem giá</button></div>
    </section>}

    {groups.length > 0 && file && <section className={`card card-pad ${styles.card}`}>
      <div className={styles.toolbar}><div><h2>3. Rà soát từng chứng từ</h2><p className={styles.small}>Giá trong tệp chỉ để đối chiếu. Giá lưu lấy từ quy tắc ERP hoặc cơ chế duyệt giá hiện hành.</p></div>
        <button className="button button-secondary" type="button" disabled={busy || uploading || runState === "COMPLETE" || groups.every((group) => group.state === "CREATED")} onClick={() => runPreview(true)}>Lưu kết quả rà soát</button></div>
      {hiddenRowsSkipped > 0 && <p className={styles.notice}>Đã bỏ qua {hiddenRowsSkipped} dòng ẩn. Có thể bật lựa chọn “Bao gồm các dòng đang ẩn” để đối chiếu lại.</p>}
      <div className={styles.groups}>{groups.map((group) => {
        const confirmation = repeat[group.groupKey] ?? { enabled: false, reason: "" };
        const saved = Boolean(group.documentId);
        return <article className={styles.group} key={group.groupKey}>
          <div className={styles.groupHead}><div><strong>Chứng từ nguồn: {group.sourceReference || "Chưa có mã"}</strong><p className={styles.small}>{group.lines.length} dòng · {group.documentId ? `Mã rà soát ${group.documentId.slice(0, 8)}` : "Chưa lưu trạng thái"}</p></div><span className={styles.badge}>{statusLabel[group.state] ?? group.state}</span></div>
          <div className={styles.groupBody}>
            {group.candidatePayload && <dl className={styles.grid}><div><dt>{entityLabel}</dt><dd>{group.entityCode || "Đã đối chiếu"}</dd></div><div><dt>{locationLabel}</dt><dd>{group.siteOrWarehouseCode || "Đã đối chiếu"}</dd></div><div><dt>Tổng theo ERP</dt><dd className="mono">{group.totalVnd ? formatVnd(vnd(group.totalVnd)) : "Đã lưu trong bản nháp nguồn"}</dd></div></dl>}
            {(group.state !== "CREATED" && group.state !== "DUPLICATE") && <div className={styles.grid}>
              <div className={styles.field}><label>{entityLabel} (mã ERP)</label><input value={group.entityCode} onChange={(event) => updateGroup(group.groupKey, "entityCode", event.target.value)} /></div>
              <div className={styles.field}><label>{locationLabel} (mã ERP)</label><input value={group.siteOrWarehouseCode} onChange={(event) => updateGroup(group.groupKey, "siteOrWarehouseCode", event.target.value)} /></div>
              <div className={styles.field}><label>Ngày dự kiến (tùy chọn)</label><input value={group.expectedAt} placeholder="dd/mm/yyyy" onChange={(event) => updateGroup(group.groupKey, "expectedAt", event.target.value)} /></div>
              <div className={styles.field}><label>Điều khoản / ghi chú (tùy chọn)</label><input value={group.terms} maxLength={1000} onChange={(event) => updateGroup(group.groupKey, "terms", event.target.value)} /></div>
            </div>}
            {group.issues.length > 0 && <ul>{group.issues.map((entry, index) => <li key={`${entry.code}-${index}`}><span>{entry.rowNumber ? `Dòng ${entry.rowNumber}: ` : ""}{entry.message}</span></li>)}</ul>}
            {group.lines.length > 0 && <div className={styles.filePreview}><div className={styles.lineGrid} aria-hidden="true"><span>Mã vật tư</span><span>Đơn vị</span><span>Số lượng</span><span>Giá trong tệp</span></div>
              {group.lines.map((line) => <div className={styles.lineBlock} key={line.rowNumber}><div className={styles.lineGrid}><label>Dòng {line.rowNumber}<input aria-label={`Mã vật tư dòng ${line.rowNumber}`} value={line.materialCode} disabled={group.state === "CREATED"} onChange={(event) => updateLine(group.groupKey, line.rowNumber, "materialCode", event.target.value)} /></label>
                <label><span>Mã đơn vị</span><input aria-label={`Mã đơn vị dòng ${line.rowNumber}`} value={line.uomCode} disabled={group.state === "CREATED"} onChange={(event) => updateLine(group.groupKey, line.rowNumber, "uomCode", event.target.value)} /></label>
                <label><span>Số lượng</span><input aria-label={`Số lượng dòng ${line.rowNumber}`} inputMode="decimal" value={line.quantity} disabled={group.state === "CREATED"} onChange={(event) => updateLine(group.groupKey, line.rowNumber, "quantity", event.target.value)} /></label>
                <label><span>Giá tham khảo</span><input aria-label={`Giá từ tệp dòng ${line.rowNumber}`} value={line.sourcePrice} readOnly /></label></div>
                {canManagePrice && group.state !== "CREATED" && <details className={styles.priceOverride}><summary>Giá {kind === "SO" ? "bán" : "mua"} thủ công (tùy chọn)</summary>
                  <div className={styles.grid}><div className={styles.field}><label htmlFor={`bulk-price-${group.groupKey}-${line.rowNumber}`}>Giá {kind === "SO" ? "bán cuối" : "mua cuối"} (VND/đơn vị)</label>
                    <input id={`bulk-price-${group.groupKey}-${line.rowNumber}`} inputMode="numeric" value={kind === "SO" ? line.manualPriceVnd : line.manualCostVnd} disabled={group.state === "CREATED"}
                      onChange={(event) => updateLine(group.groupKey, line.rowNumber, kind === "SO" ? "manualPriceVnd" : "manualCostVnd", event.target.value)} /></div>
                    <div className={styles.field}><label htmlFor={`bulk-reason-${group.groupKey}-${line.rowNumber}`}>Lý do ngoại lệ (nếu cần)</label>
                      <input id={`bulk-reason-${group.groupKey}-${line.rowNumber}`} maxLength={500} value={kind === "SO" ? line.manualReason : line.manualCostReason} disabled={group.state === "CREATED"}
                        onChange={(event) => updateLine(group.groupKey, line.rowNumber, kind === "SO" ? "manualReason" : "manualCostReason", event.target.value)} /></div></div>
                  <p className={styles.small}>Giá trong tệp không tự áp dụng. Giá cao hơn giá ERP cần lý do; máy chủ vẫn kiểm tra quyền và quy tắc hiện hành.</p>
                </details>}</div>)}</div>}
            {group.pricePreview.length > 0 && <p className={styles.small}>Giá ERP từng dòng: {group.pricePreview.map((line) => formatVnd(vnd(String(line.unitPriceVnd ?? line.unitCostVnd ?? "0")))).join(" · ")}</p>}
            {saved && group.state === "DUPLICATE" && <div className={styles.field}><label><input type="checkbox" checked={confirmation.enabled} onChange={(event) => setRepeat((current) => ({ ...current, [group.groupKey]: { ...confirmation, enabled: event.target.checked } }))} /> Tôi xác nhận đây là chứng từ mới, chủ đích trùng mã nguồn</label>
              {confirmation.enabled && <><label>Lý do nhập lại (bắt buộc)</label><input value={confirmation.reason} maxLength={500} onChange={(event) => setRepeat((current) => ({ ...current, [group.groupKey]: { ...confirmation, reason: event.target.value } }))} /></>}</div>}
            {saved && (group.state === "READY" || group.state === "DUPLICATE" || group.state === "CREATED") && <div className={styles.actions}>
              {group.state !== "CREATED" ? <button className="button button-primary" type="button" disabled={busy || uploading || (group.state === "DUPLICATE" && confirmation.enabled && confirmation.reason.trim().length < 3)} onClick={() => createDraft(group)}>{kind === "SO" ? "Tạo đơn bán nháp" : "Tạo đơn mua nháp"}</button> : <Link className="button button-secondary" href={`${documentLink}/${group.resultEntityId ?? ""}`}>Mở chứng từ nháp</Link>}
            </div>}
          </div>
        </article>;
      })}</div>
      <p className={styles.small}>Mỗi chứng từ được lưu riêng. Nếu phản hồi bị gián đoạn, mở lại cùng đường dẫn để tra cứu trạng thái trước khi thử lại.</p>
    </section>}
  </div>;
}
