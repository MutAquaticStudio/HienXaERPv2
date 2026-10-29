"use client";

/** Saves a CSV already built on the server (a small table such as a payroll) as a file, without another request. */
export function CsvDownloadButton({ csv, filename, label = "Xuất file Excel (CSV)" }: { csv: string; filename: string; label?: string }) {
  function save() {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return <button type="button" className="button button-secondary" onClick={save}>{label}</button>;
}
