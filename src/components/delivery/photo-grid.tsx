"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";

export type EvidencePhoto = { id: string; mimeType: string; caption?: string };
const href = (id: string) => `/api/evidence/${encodeURIComponent(id)}/download`;

/** Thumbnails of delivery photos; one tap shows the photo large. Files are read through the permission-checked route. */
export function PhotoGrid({ photos, label = "Ảnh giao hàng" }: { photos: EvidencePhoto[]; label?: string }) {
  const [open, setOpen] = useState<EvidencePhoto | null>(null);
  return <>
    <ul className="photo-grid" aria-label={label}>
      {photos.map((photo, index) => <li key={photo.id}>
        {photo.mimeType.startsWith("image/")
          ? <button type="button" className="photo-thumb" onClick={() => setOpen(photo)} aria-label={`Xem ảnh ${index + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- private evidence streamed by the app, not a static asset */}
            <img src={href(photo.id)} alt="" loading="lazy" /></button>
          : <a className="photo-thumb photo-file" href={href(photo.id)} target="_blank" rel="noopener noreferrer">Tệp PDF {index + 1}</a>}
        {photo.caption && <small className="muted">{photo.caption}</small>}
      </li>)}
    </ul>
    {open && <Dialog size="lg" eyebrow={label} title={`Ảnh ${photos.indexOf(open) + 1} / ${photos.length}`} onClose={() => setOpen(null)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- private evidence streamed by the app */}
      <img className="photo-large" src={href(open.id)} alt={`Ảnh ${photos.indexOf(open) + 1}`} />
      <p><a className="code-link" href={href(open.id)} target="_blank" rel="noopener noreferrer">Mở ảnh gốc</a></p>
    </Dialog>}
  </>;
}
