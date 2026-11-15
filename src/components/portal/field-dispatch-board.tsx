"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Lock, Phone, Truck, X } from "lucide-react";

import styles from "@/components/portal/portal.module.css";
import fd from "@/components/portal/field-dispatch.module.css";
import { businessInputValue, parseBusinessDateTime } from "@/lib/core/business-time";
import { fieldDispatchAction, fieldDispatchOptionsAction } from "@/modules/portal/field-dispatch-actions";
import {
  fieldTime,
  freshLabel,
  givenStateLabel,
  givenTone,
  isShort,
  lateText,
  rankWorkers,
  suggestionReason,
  vehicleChoices,
  type FieldDispatchBoard,
  type FieldDispatchCommand,
  type FieldDispatchDeclined,
  type FieldDispatchGiven,
  type FieldDispatchPair,
  type FieldDispatchResult,
  type FieldDispatchWaiting,
  type FieldDispatchWaitingDelivery,
  type FieldDispatchWorker,
} from "@/modules/portal/field-dispatch";
import { telHref } from "@/modules/portal/presentation";

type Target = { mode: "ASSIGN"; job: FieldDispatchWaiting } | { mode: "REASSIGN"; row: FieldDispatchGiven };
type Options = { status: "loading" } | { status: "error"; message: string }
  | { status: "ready"; pairs: FieldDispatchPair[]; declined: FieldDispatchDeclined[]; candidates: { employee_id: string; start_at: string }[] };

const quantity = (value: string) => Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 6 });
const UNKNOWN = "Chưa giao được. Kiểm tra kết nối rồi bấm lại; hệ thống không ghi hai lần.";

function headline(job: FieldDispatchWaiting) {
  return job.kind === "SERVICE_JOB" ? job.title : job.site_name ?? job.customer_name ?? job.number;
}

function serviceText(job: Extract<FieldDispatchWaiting, { kind: "SERVICE_JOB" }>) {
  const hours = job.duration_minutes >= 60 ? `khoảng ${lateText(job.duration_minutes)}` : `${job.duration_minutes} phút`;
  return [job.quantity && job.unit ? `${quantity(job.quantity)} ${job.unit}` : null, hours, job.description].filter(Boolean).join(" · ");
}

/**
 * D85 "Điều phối" (concept "Điều phối của thợ chính"): what waits for a person ("Chờ người", refused first) with one tap for the
 * suggestion or "Chọn người khác", and today's jobs by worker ("Đã giao hôm nay") with "Đổi người" until loading / start.
 */
export function FieldDispatchBoardView({ board }: { board: FieldDispatchBoard }) {
  const router = useRouter();
  const [tab, setTab] = useState<"waiting" | "given">("waiting");
  const [banner, setBanner] = useState("");
  const [alert, setAlert] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState<{ value: Target; from: HTMLElement | null } | null>(null);
  const operations = useRef(new Map<string, string>());
  const today = board.now;
  const workers = useMemo(() => new Map(board.workers.map((worker) => [worker.id, worker])), [board.workers]);
  const vehicles = useMemo(() => new Map(board.vehicles.map((vehicle) => [vehicle.id, vehicle])), [board.vehicles]);
  const waiting = useMemo(() => [...board.waiting].sort((left, right) => {
    const refused = (job: FieldDispatchWaiting) => job.kind === "DELIVERY" && (job.declined?.length ?? 0) > 0 ? 0 : 1;
    return refused(left) - refused(right) || (left.requested_at ?? "").localeCompare(right.requested_at ?? "") || left.number.localeCompare(right.number);
  }), [board.waiting]);
  const declinedCount = waiting.filter((job) => job.kind === "DELIVERY" && (job.declined?.length ?? 0) > 0).length;
  const shortCount = board.given.filter(isShort).length;
  const nameOf = (id: string | undefined) => (id && workers.get(id)?.name) || "người khác";
  const dateLabel = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(today));

  /** Sends one choice; the same choice retried (after an unclear outcome) keeps its operation id. */
  async function send(command: Omit<FieldDispatchCommand, "operationId">): Promise<FieldDispatchResult> {
    const key = JSON.stringify(command);
    let operationId = operations.current.get(key);
    if (!operationId) { operationId = crypto.randomUUID(); operations.current.set(key, operationId); }
    try {
      return await fieldDispatchAction({ ...command, operationId });
    } catch {
      return { ok: false, unknown: true, message: UNKNOWN };
    }
  }

  function done(text: string) {
    setAlert("");
    setBanner(text);
    setTarget(null);
    router.refresh();
  }

  function givenText(number: string, employeeId: string, vehicleId: string | null | undefined, startAt: string | undefined, previous?: string) {
    const name = nameOf(employeeId);
    const slot = [vehicleId ? vehicles.get(vehicleId)?.code : null, startAt ? fieldTime(startAt, today) : null].filter(Boolean).join(" · ");
    if (previous) {
      return `Đã chuyển ${number} từ ${previous === board.me ? "bạn" : nameOf(previous)} sang ${employeeId === board.me ? "bạn" : name}.`
        + (employeeId === board.me ? "" : ` Đã báo “Việc mới” cho ${name};`) + ` ${previous === board.me ? "Bạn" : nameOf(previous)} không còn thấy việc này.`;
    }
    return employeeId === board.me ? `Bạn đã nhận ${number}${slot ? ` · ${slot}` : ""}. Việc hiện ở Hôm nay.`
      : `Đã giao ${number} cho ${name}${slot ? ` · ${slot}` : ""}. Đã báo “Việc mới” cho ${name}.`;
  }

  async function quick(job: FieldDispatchWaitingDelivery) {
    const pair = job.suggestion;
    if (!pair || busy) return;
    setBusy(job.id);
    setAlert("");
    const result = await send({ kind: "DELIVERY", mode: "ASSIGN", targetId: job.id, employeeId: pair.employee_id, vehicleId: pair.vehicle_id,
      chosenStart: null, version: job.version });
    setBusy(null);
    if (result.ok) { done(givenText(job.number, pair.employee_id, pair.vehicle_id, result.startAt ?? pair.start_at)); return; }
    setBanner("");
    setAlert(result.message);
    if (result.reload) router.refresh();
  }

  const open = (value: Target, from: HTMLElement) => { setAlert(""); setTarget({ value, from }); };

  // Groups for "Đã giao hôm nay": one per worker, by their first job of the day.
  const groups = useMemo(() => {
    const byWorker = new Map<string, FieldDispatchGiven[]>();
    for (const row of board.given) byWorker.set(row.employee_id, [...(byWorker.get(row.employee_id) ?? []), row]);
    return [...byWorker.entries()].map(([id, rows]) => ({ id, rows: rows.sort((a, b) => a.start_at.localeCompare(b.start_at)) }))
      .sort((left, right) => left.rows[0].start_at.localeCompare(right.rows[0].start_at));
  }, [board.given]);

  return (
    <div className={styles.page}>
      <header className={fd.head}>
        <p>{dateLabel.charAt(0).toLocaleUpperCase("vi-VN") + dateLabel.slice(1)} · cả chi nhánh</p>
        <h1>Điều phối</h1>
        <p>Giao việc cho thợ trong chi nhánh. Văn phòng thấy mọi việc bạn giao và vẫn đổi được.</p>
      </header>
      {banner && <p className={fd.banner} role="status"><Check aria-hidden size={18} /><span>{banner}</span></p>}
      {alert && <p className={fd.alert} role="alert">{alert}</p>}
      {(declinedCount > 0 || shortCount > 0) && <div className={fd.attention}>
        <AlertTriangle aria-hidden size={18} /><span>Cần chú ý:</span>
        {declinedCount > 0 && <button type="button" className={fd.attentionButton} onClick={() => setTab("waiting")}>{declinedCount} thợ từ chối</button>}
        {shortCount > 0 && <button type="button" className={fd.attentionButton} onClick={() => setTab("given")}>{shortCount} giao thiếu</button>}
      </div>}

      <div role="tablist" aria-label="Danh sách điều phối" className={fd.tabs}>
        <button type="button" role="tab" id="fd-tab-waiting" aria-controls="fd-waiting" aria-selected={tab === "waiting"} className={fd.tab}
          onClick={() => setTab("waiting")}>Chờ người · {waiting.length}</button>
        <button type="button" role="tab" id="fd-tab-given" aria-controls="fd-given" aria-selected={tab === "given"} className={fd.tab}
          onClick={() => setTab("given")}>Đã giao hôm nay · {board.given.length}</button>
      </div>

      {tab === "waiting" ? <section id="fd-waiting" role="tabpanel" aria-labelledby="fd-tab-waiting" className={fd.list}>
        <p className={fd.hint}>Xếp theo giờ hẹn. Ai bấm trước được việc: bạn, văn phòng hoặc thợ tự nhận ở “Nhận việc”.</p>
        {waiting.map((job) => {
          const declined = job.kind === "DELIVERY" ? job.declined ?? [] : [];
          const suggestion = job.kind === "DELIVERY" ? job.suggestion ?? null : null;
          const suggestedVehicle = suggestion ? vehicles.get(suggestion.vehicle_id) : undefined;
          return <article key={job.id} className={fd.job} data-declined={declined.length ? "" : undefined} aria-label={`${job.number} · ${headline(job)}`}>
            <div className={fd.jobTop}>
              <span className={`${fd.badge} ${declined.length ? fd.badgeDanger : ""}`}>
                {declined.length ? "Thợ từ chối · chờ người khác" : job.kind === "SERVICE_JOB" ? "Việc dịch vụ chờ người" : "Phiếu giao chờ người"}</span>
              <strong>{job.requested_at ? `Hẹn ${fieldTime(job.requested_at, today)}` : "Chưa hẹn giờ"}</strong>
            </div>
            <h2>{headline(job)}</h2>
            <p className={fd.meta}>{job.number} · {job.kind === "SERVICE_JOB" ? job.site_name ?? job.address ?? "Địa điểm sẽ cập nhật" : job.address ?? "Địa điểm sẽ cập nhật"}</p>
            {job.kind === "DELIVERY" && job.lines.length > 0 && <ul className={fd.lines} aria-label="Hàng cần giao">
              {job.lines.map((line, index) => <li key={index}><span>{line.material_name}</span><strong>{quantity(line.quantity)} {line.unit}</strong></li>)}
            </ul>}
            {job.kind === "SERVICE_JOB" && <p>{serviceText(job)}</p>}
            {declined.map((item) => <p key={item.employee_id} className={fd.declined}>
              <strong>{item.name} từ chối lúc {fieldTime(item.at, today)}:</strong> “{item.reason}”</p>)}
            {suggestion && suggestedVehicle && <div className={fd.suggest}>
              <Truck aria-hidden size={20} />
              <span><strong>Gợi ý: {nameOf(suggestion.employee_id)} · {suggestedVehicle.code} · đi {fieldTime(suggestion.start_at, today)}</strong>
                <small>{suggestionReason(suggestion, suggestedVehicle.code)}</small></span>
            </div>}
            <div className={fd.actions} data-two={suggestion ? "" : undefined}>
              {suggestion && job.kind === "DELIVERY" && <button type="button" className={styles.button} disabled={busy !== null} onClick={() => quick(job)}>
                {busy === job.id ? "Đang giao..." : `Giao cho ${suggestion.employee_id === board.me ? "bạn" : nameOf(suggestion.employee_id)}`}</button>}
              <button type="button" className={suggestion ? styles.buttonSecondary : styles.button} disabled={busy !== null}
                onClick={(event) => open({ mode: "ASSIGN", job }, event.currentTarget)}>
                {declined.length ? "Giao người khác" : suggestion ? "Chọn người khác" : "Chọn người"}</button>
            </div>
          </article>;
        })}
        {waiting.length === 0 && <div className={fd.empty}><strong>Không còn việc chờ người</strong><span>Việc mới từ văn phòng sẽ hiện ở đây.</span></div>}
      </section> : <section id="fd-given" role="tabpanel" aria-labelledby="fd-tab-given" className={fd.list}>
        <p className={fd.hint}>Đổi người được tới khi thợ bấm “Đã lấy hàng lên xe” (việc dịch vụ: tới khi bắt đầu).</p>
        {groups.map(({ id, rows }) => {
          const worker = workers.get(id);
          const name = worker ? worker.name + (worker.me ? " (bạn)" : "") : nameOf(id);
          return <article key={id} className={fd.group} aria-label={name}>
            <header className={fd.groupHead}>
              <span className={fd.initial} aria-hidden="true">{(worker?.name ?? "?").trim().split(/\s+/).at(-1)?.charAt(0).toLocaleUpperCase("vi-VN")}</span>
              <span><strong>{name}</strong>
                <small>{worker?.clocked_in_at ? `Đã vào ca ${fieldTime(worker.clocked_in_at, today)}` : "Chưa vào ca"}{worker?.free_from ? ` · rảnh từ ${fieldTime(worker.free_from, today)}` : ""}</small></span>
              <span>{rows.length} việc</span>
            </header>
            <ul className={fd.rows}>
              {rows.map((row) => {
                const tone = givenTone(row);
                const fresh = freshLabel(row);
                const vehicle = row.vehicle_id ? vehicles.get(row.vehicle_id)?.code : null;
                return <li key={row.kind + row.id}>
                  <strong>{fieldTime(row.start_at, today)}</strong>
                  <span className={fd.rowMain}>
                    <span>{row.kind === "SERVICE_JOB" && row.title ? `${row.title} · ${row.site_name ?? ""}` : row.site_name ?? row.number}</span>
                    <small>{row.number}{vehicle ? ` · ${vehicle}` : ""}</small>
                    <span className={fd.chips}>
                      <span className={fd.chip} data-tone={tone}>{givenStateLabel(row)}</span>
                      {fresh && <span className={`${fd.chip} ${row.field?.by_me ? fd.fresh : ""}`}>{fresh}</span>}
                    </span>
                    {isShort(row) && <small className={fd.detail}>{row.shortfall ? `Khách nhận ${row.shortfall}. ` : ""}Văn phòng xử lý phần còn lại.</small>}
                  </span>
                  <span className={fd.rowAction}>
                    {row.can_change && <button type="button" className={fd.change} onClick={(event) => open({ mode: "REASSIGN", row }, event.currentTarget)}
                      aria-label={`Đổi người ${row.number}`}>Đổi người</button>}
                    {tone === "locked" && <span className={fd.locked}><Lock aria-hidden size={14} />Đã bắt đầu</span>}
                    {isShort(row) && row.receiver_phone && <a className={fd.call} href={telHref(row.receiver_phone)} aria-label={`Gọi người nhận ${row.number}`}>
                      <Phone aria-hidden size={15} />Gọi</a>}
                  </span>
                </li>;
              })}
            </ul>
          </article>;
        })}
        {groups.length === 0 && <div className={fd.empty}><strong>Hôm nay chưa giao việc nào</strong><span>Việc bạn và văn phòng giao trong ngày sẽ hiện ở đây, theo từng thợ.</span></div>}
      </section>}

      {target && <AssignSheet key={target.value.mode === "ASSIGN" ? target.value.job.id : target.value.row.id} target={target.value} board={board}
        returnFocusTo={target.from} onClose={() => setTarget(null)} send={send} nameOf={nameOf}
        onDone={(employeeId, vehicleId, startAt) => {
          const value = target.value;
          done(value.mode === "ASSIGN" ? givenText(value.job.number, employeeId, vehicleId, startAt)
            : givenText(value.row.number, employeeId, vehicleId, startAt, value.row.employee_id));
        }} onStale={() => router.refresh()} />}
    </div>
  );
}

function AssignSheet({ target, board, returnFocusTo, onClose, onDone, onStale, send, nameOf }: {
  target: Target;
  board: FieldDispatchBoard;
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
  onDone: (employeeId: string, vehicleId: string | null, startAt: string | undefined) => void;
  onStale: () => void;
  send: (command: Omit<FieldDispatchCommand, "operationId">) => Promise<FieldDispatchResult>;
  nameOf: (id: string | undefined) => string;
}) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const today = board.now;
  const reassign = target.mode === "REASSIGN" ? target.row : null;
  const kind = target.mode === "ASSIGN" ? target.job.kind : target.row.kind;
  const isDelivery = kind === "DELIVERY";
  // Who could take it and when: loaded when the sheet opens (the board only carries the office's suggestion).
  const [options, setOptions] = useState<Options>({ status: "loading" });
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [timeMode, setTimeMode] = useState<"system" | "custom">("system");
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");
  const [freeAt, setFreeAt] = useState<string | null>(null);

  const optionsKind = target.mode === "ASSIGN" ? target.job.kind : target.row.kind;
  const optionsId = target.mode === "ASSIGN" ? target.job.id : target.row.kind === "DELIVERY" ? target.row.id : target.row.work_item_id ?? target.row.id;
  useEffect(() => {
    let live = true;
    fieldDispatchOptionsAction(optionsKind, optionsId)
      .then((result) => {
        if (!live) return;
        setOptions(result.ok ? { status: "ready", pairs: result.pairs ?? [], declined: result.declined ?? [], candidates: result.candidates ?? [] }
          : { status: "error", message: result.message });
      })
      .catch(() => { if (live) setOptions({ status: "error", message: "Chưa tải được danh sách thợ. Kiểm tra kết nối rồi mở lại." }); });
    return () => { live = false; };
  }, [optionsKind, optionsId]);

  // Focus inside, Escape closes, Tab stays in the sheet, the page behind does not scroll; focus goes back on close.
  useEffect(() => {
    const node = panel.current;
    node?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; returnFocusTo?.focus(); };
  }, [returnFocusTo]);

  // The job as the worker list and truck list read it.
  const job: FieldDispatchWaiting | null = useMemo(() => {
    if (options.status !== "ready") return null;
    if (target.mode === "ASSIGN") {
      return target.job.kind === "DELIVERY" ? { ...target.job, pairs: options.pairs, declined: options.declined.length ? options.declined : target.job.declined }
        : { ...target.job, candidates: options.candidates };
    }
    const row = target.row;
    return row.kind === "DELIVERY"
      ? { kind: "DELIVERY", id: row.id, number: row.number, version: row.version, lines: [], pairs: options.pairs, declined: options.declined, suggestion: null }
      : { kind: "SERVICE_JOB", id: row.work_item_id ?? row.id, number: row.number, version: row.version, requested_at: row.start_at,
        duration_minutes: 0, title: row.title ?? row.number, candidates: options.candidates };
  }, [target, options]);

  const choices = useMemo(() => job ? rankWorkers(job, board, { currentEmployeeId: reassign?.employee_id ?? null, today }) : [], [job, board, reassign, today]);
  const firstFree = choices.find((choice) => !choice.blocked)?.worker.id ?? null;
  const selectedWorkerId = workerId && choices.some((choice) => choice.worker.id === workerId && !choice.blocked) ? workerId : firstFree;
  const selected = choices.find((choice) => choice.worker.id === selectedWorkerId) ?? null;
  const trucks = useMemo(() => job?.kind === "DELIVERY" && selectedWorkerId ? vehicleChoices(job, selectedWorkerId, board.vehicles) : [], [job, selectedWorkerId, board.vehicles]);
  const defaultTruck = trucks.find((truck) => truck.suggested) ?? trucks.find((truck) => truck.vehicle.id === reassign?.vehicle_id) ?? trucks[0];
  const truck = trucks.find((item) => item.vehicle.id === vehicleId) ?? defaultTruck;
  const systemStart = isDelivery ? truck?.pair.start_at ?? null : selected?.startAt ?? null;
  const chosenIso = timeMode === "custom" && custom ? parseBusinessDateTime(custom) : null;
  const startAt = timeMode === "custom" ? chosenIso : systemStart;
  const requested = target.mode === "ASSIGN" ? target.job.requested_at : target.row.start_at;
  const picked = selected?.worker ?? null;
  const self = picked?.id === board.me;
  const pickedName = picked ? (self ? "bạn" : picked.name) : "";
  const vehicleCode = truck?.vehicle.code;

  const title = reassign ? `Đổi người · ${reassign.number}`
    : `${target.mode === "ASSIGN" && target.job.kind === "DELIVERY" && target.job.declined?.length ? "Giao lại" : "Giao"} ${target.mode === "ASSIGN" ? target.job.number : ""}`;
  const sub = target.mode === "ASSIGN"
    ? [target.job.kind === "SERVICE_JOB" ? `${target.job.title} · ${target.job.site_name ?? ""}` : target.job.site_name ?? target.job.customer_name ?? "",
      target.job.requested_at ? `hẹn ${fieldTime(target.job.requested_at, today)}` : null].filter(Boolean).join(" · ")
    : [target.row.kind === "SERVICE_JOB" && target.row.title ? `${target.row.title} · ${target.row.site_name ?? ""}` : target.row.site_name ?? "", `hẹn ${fieldTime(target.row.start_at, today)}`].join(" · ");

  const confirmLabel = !picked || !startAt ? "Chọn người" + (isDelivery ? " và xe" : "")
    : `${reassign ? `Chuyển cho ${pickedName}` : self ? "Tự nhận" : `Giao cho ${pickedName}`}${vehicleCode ? ` · ${vehicleCode} · đi ${fieldTime(startAt, today)}` : ` · lúc ${fieldTime(startAt, today)}`}`;
  const confirmNote = !picked ? "" : self ? "Việc hiện ngay ở Hôm nay của bạn. Văn phòng thấy bạn đã nhận."
    : `${picked.name} được báo “Việc mới” trên điện thoại${reassign ? `; ${nameOf(reassign.employee_id)} không còn thấy việc này.` : ". Văn phòng thấy việc bạn giao."}`
      + (picked.clocked_in_at ? "" : ` ${picked.name} chưa vào ca: vào ca là thấy việc ở Hôm nay.`);

  async function confirm() {
    if (!picked || !startAt || status === "busy" || (isDelivery && !truck)) return;
    if (timeMode === "custom" && !chosenIso) { setStatus("error"); setMessage("Chọn ngày giờ hợp lệ."); return; }
    setStatus("busy");
    setMessage("");
    setFreeAt(null);
    const result = await send({
      kind, mode: target.mode, targetId: target.mode === "ASSIGN" ? target.job.id : target.row.kind === "DELIVERY" ? target.row.id : target.row.work_item_id ?? target.row.id,
      employeeId: picked.id, vehicleId: isDelivery ? truck?.vehicle.id ?? null : null, chosenStart: timeMode === "custom" ? chosenIso : null,
      version: target.mode === "ASSIGN" ? target.job.version : target.row.version,
    });
    if (result.ok) { onDone(picked.id, isDelivery ? truck?.vehicle.id ?? null : null, result.startAt ?? startAt); return; }
    setStatus("error");
    setMessage(result.message);
    setFreeAt(result.nextFreeAt ?? null);
    if (result.reload) onStale();
  }

  const workerLine = (choice: (typeof choices)[number]) => choice.blocked ?? [
    choice.worker.clocked_in_at ? `Đã vào ca ${fieldTime(choice.worker.clocked_in_at, today)}` : "Chưa vào ca",
    `${choice.jobsToday} việc hôm nay`, choice.startAt ? `rảnh ${fieldTime(choice.startAt, today)}` : null].filter(Boolean).join(" · ");

  return <section ref={panel} className={fd.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <header className={fd.sheetHead}>
      <button type="button" className={fd.close} aria-label="Đóng" onClick={onClose}><X aria-hidden size={22} /></button>
      <div><h2 id={titleId}>{title}</h2><small>{sub}</small></div>
    </header>
    <div className={fd.sheetBody}>
      {reassign && <div className={fd.list}>
        <div className={fd.current}>
          <small>ĐANG GIAO CHO</small>
          <strong>{reassign.employee_id === board.me ? "Bạn" : nameOf(reassign.employee_id)}
            {reassign.vehicle_id ? ` · ${board.vehicles.find((vehicle) => vehicle.id === reassign.vehicle_id)?.code ?? ""}` : ""} · {fieldTime(reassign.start_at, today)}</strong>
          <span className={fd.chip}>{givenStateLabel(reassign)}</span>
        </div>
        <p className={fd.lockNote}><Lock aria-hidden size={16} /><span>{reassign.kind === "DELIVERY"
          ? "Chỉ đổi được trước khi thợ bấm “Đã lấy hàng lên xe”. Sau đó cần văn phòng xử lý." : "Chỉ đổi được trước khi thợ bắt đầu việc. Sau đó cần văn phòng xử lý."}</span></p>
      </div>}
      {target.mode === "ASSIGN" && <div className={fd.list}>
        {target.job.kind === "DELIVERY" && target.job.lines.length > 0 && <ul className={`${fd.lines} ${fd.box}`} aria-label="Hàng cần giao">
          {target.job.lines.map((line, index) => <li key={index}><span>{line.material_name}</span><strong>{quantity(line.quantity)} {line.unit}</strong></li>)}</ul>}
        {target.job.kind === "SERVICE_JOB" && <p className={fd.box}>{serviceText(target.job)}</p>}
        <p className={fd.hint}>{target.job.address ?? target.job.site_name ?? ""}</p>
        {target.job.kind === "DELIVERY" && (target.job.declined ?? []).map((item) => <p key={item.employee_id} className={fd.declined}>
          {item.name} đã từ chối lúc {fieldTime(item.at, today)}: “{item.reason}”. {item.name} không được chọn lại cho phiếu này.</p>)}
      </div>}

      {options.status === "loading" && <p className={fd.hint} role="status">Đang tải danh sách thợ...</p>}
      {options.status === "error" && <p className={fd.alert} role="alert">{options.message}</p>}

      {job && <fieldset className={fd.pickSet}>
        <legend>{reassign ? "1. Chọn người mới" : isDelivery ? "1. Chọn người giao" : "1. Chọn người làm"}</legend>
        <p className={fd.hint}>Thợ trong chi nhánh. Xếp: gợi ý, đang trong ca, rảnh sớm, ít việc.</p>
        {choices.map((choice) => <label key={choice.worker.id} className={fd.pick}>
          <input type="radio" name="fd-worker" value={choice.worker.id} checked={choice.worker.id === selectedWorkerId} disabled={Boolean(choice.blocked) || status === "busy"}
            onChange={() => { setWorkerId(choice.worker.id); setVehicleId(null); setFreeAt(null); setMessage(""); setStatus("idle"); }} />
          <span>
            <span><strong>{workerLabel(choice.worker)}</strong>
              {choice.suggested && <span className={fd.tagSuggest}>Gợi ý</span>}
              {!choice.worker.clocked_in_at && !choice.blocked && <span className={fd.tagShift}>Chưa vào ca</span>}</span>
            <small>{workerLine(choice)}</small>
          </span>
        </label>)}
        {choices.length === 0 && <p className={fd.hint}>Chi nhánh chưa có thợ nhận việc.</p>}
      </fieldset>}

      {job && isDelivery && selected && !selected.blocked && <fieldset className={fd.pickSet}>
        <legend>2. Chọn xe</legend>
        <p className={fd.hint}>Giờ đi do hệ thống tính như gợi ý điều phối: lúc người và xe cùng rảnh.</p>
        {trucks.map((item) => {
          const late = requested ? Math.round((new Date(item.pair.start_at).getTime() - new Date(requested).getTime()) / 60000) : 0;
          return <label key={item.vehicle.id} className={fd.pick}>
            <input type="radio" name="fd-vehicle" value={item.vehicle.id} checked={item.vehicle.id === truck?.vehicle.id} disabled={status === "busy"}
              onChange={() => { setVehicleId(item.vehicle.id); setFreeAt(null); setMessage(""); setStatus("idle"); }} />
            <span>
              <span><strong>{item.vehicle.code}</strong>{item.suggested && <span className={fd.tagSuggest}>Gợi ý</span>}</span>
              <small data-late={late > 0 ? "" : undefined}>Rảnh lúc {fieldTime(item.pair.start_at, today)}
                {item.vehicle.plate_number && item.vehicle.plate_number !== item.vehicle.code ? ` · ${item.vehicle.plate_number}` : ""}
                {late > 0 ? ` · trễ ${lateText(late)} so với hẹn` : ""}</small>
            </span>
          </label>;
        })}
      </fieldset>}

      {job && selected && !selected.blocked && (!isDelivery || truck) && <fieldset className={fd.pickSet}>
        <legend>{isDelivery ? "3. Giờ đi" : "2. Giờ làm"}</legend>
        <label className={fd.pick}>
          <input type="radio" name="fd-time" value="system" checked={timeMode === "system"} disabled={status === "busy"} onChange={() => { setTimeMode("system"); setFreeAt(null); }} />
          <span><strong>Giờ hệ thống tính: {fieldTime(systemStart, today)}</strong>
            <small>{isDelivery ? "Lúc người và xe cùng rảnh, như gợi ý điều phối." : "Giờ hẹn, hoặc lúc người này rảnh nếu đang bận."}</small></span>
        </label>
        <label className={fd.pick}>
          <input type="radio" name="fd-time" value="custom" checked={timeMode === "custom"} disabled={status === "busy"}
            onChange={() => { setTimeMode("custom"); if (!custom && systemStart) setCustom(businessInputValue(systemStart)); }} />
          <span><strong>Chọn giờ khác</strong><small>Hệ thống kiểm tra lại {isDelivery ? "người và xe" : "người"} còn rảnh lúc bạn chọn.</small></span>
        </label>
        {timeMode === "custom" && <div className={fd.timeField}>
          <label htmlFor={`${titleId}-time`}>{isDelivery ? "Giờ đi" : "Giờ bắt đầu"}</label>
          <input id={`${titleId}-time`} type="datetime-local" step={300} value={custom} disabled={status === "busy"}
            onChange={(event) => { setCustom(event.target.value); setFreeAt(null); setMessage(""); setStatus("idle"); }} />
        </div>}
      </fieldset>}
    </div>
    <footer className={fd.sheetFoot}>
      {message && <p className={fd.alert} role="alert">{message}</p>}
      {freeAt && <button type="button" className={fd.useFree} onClick={() => { setTimeMode("custom"); setCustom(businessInputValue(freeAt)); setFreeAt(null); setMessage(""); setStatus("idle"); }}>
        Chọn {fieldTime(freeAt, today)}</button>}
      <button type="button" className={`${styles.button} ${fd.confirm}`} disabled={!picked || !startAt || status === "busy" || (isDelivery && !truck)} onClick={confirm}>
        {status === "busy" ? "Đang giao..." : confirmLabel}</button>
      {confirmNote && <p>{confirmNote}</p>}
    </footer>
  </section>;
}

function workerLabel(worker: FieldDispatchWorker) {
  return worker.me ? `${worker.name} (bạn)` : worker.name;
}
