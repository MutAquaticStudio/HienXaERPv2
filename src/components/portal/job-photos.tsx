"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/components/portal/portal.module.css";
import { shrinkImage } from "./shrink-image";

type Photo = { key: string; id?: string; preview: string; state: "uploading" | "ready" | "failed" };
export const MAX_JOB_PHOTOS = 5;

/**
 * Photos a worker takes for a job: shrunk on the phone, uploaded one by one as the job's evidence, kept when the network
 * drops. Used for the loaded truck ("Đã lấy hàng lên xe") and for the delivered goods ("Đã giao").
 */
export function useJobPhotos(workItemId: string, savedPhotoIds: string[], onUploadFailed: () => void) {
  const camera = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>(() => savedPhotoIds.slice(0, MAX_JOB_PHOTOS)
    .map((id) => ({ key: id, id, preview: `/api/evidence/${id}/download`, state: "ready" })));
  const ready = photos.filter((photo) => photo.state === "ready" && photo.id).map((photo) => photo.id!);
  const uploading = photos.some((photo) => photo.state === "uploading");

  // Local previews are released when the form goes away.
  const shown = useRef(photos);
  useEffect(() => { shown.current = photos; }, [photos]);
  useEffect(() => () => { for (const photo of shown.current) if (photo.preview.startsWith("blob:")) URL.revokeObjectURL(photo.preview); }, []);

  async function addPhotos(files: FileList | null) {
    const chosen = [...(files ?? [])].slice(0, MAX_JOB_PHOTOS - photos.length);
    if (camera.current) camera.current.value = "";
    for (const original of chosen) {
      const key = crypto.randomUUID();
      const file = await shrinkImage(original);
      setPhotos((all) => [...all, { key, preview: URL.createObjectURL(file), state: "uploading" }]);
      const form = new FormData();
      form.set("file", file);
      form.set("context", "WORK_RESULT");
      form.set("workItemId", workItemId);
      form.set("operationId", key);
      try {
        const response = await fetch("/api/portal/evidence/upload", { method: "POST", body: form });
        const body = await response.json() as { evidenceId?: string; error?: string };
        if (!response.ok || !body.evidenceId) throw new Error(body.error);
        setPhotos((all) => all.map((photo) => photo.key === key ? { ...photo, id: body.evidenceId, state: "ready" } : photo));
      } catch {
        setPhotos((all) => all.map((photo) => photo.key === key ? { ...photo, state: "failed" } : photo));
        onUploadFailed();
      }
    }
  }

  function removePhoto(key: string) {
    setPhotos((all) => all.filter((photo) => {
      if (photo.key === key && photo.preview.startsWith("blob:")) URL.revokeObjectURL(photo.preview);
      return photo.key !== key;
    }));
  }

  return { camera, photos, ready, uploading, addPhotos, removePhoto, openCamera: () => camera.current?.click() };
}

/** The hidden camera input and the thumbnails with "Xóa" / "+ Chụp thêm". */
export function JobPhotoGrid({ photos: state, label, disabled, alwaysShow = false }: {
  photos: ReturnType<typeof useJobPhotos>; label: string; disabled: boolean; alwaysShow?: boolean;
}) {
  const { camera, photos, addPhotos, removePhoto, openCamera } = state;
  return <>
    <input ref={camera} type="file" accept="image/*" capture="environment" multiple hidden aria-label={`Chụp ${label.toLowerCase()}`}
      onChange={(event) => { void addPhotos(event.target.files); }} />
    {(photos.length > 0 || alwaysShow) && <div className={styles.photoGrid} aria-label={label}>
      {photos.map((photo, index) => <figure key={photo.key} className={styles.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview or the private evidence route */}
        <img src={photo.preview} alt={`Ảnh ${index + 1}`} />
        <figcaption>{photo.state === "uploading" ? "Đang tải..." : photo.state === "failed" ? "Lỗi tải" : "Đã tải"}</figcaption>
        <button type="button" className={styles.buttonSecondary} onClick={() => removePhoto(photo.key)} disabled={disabled}>Xóa</button>
      </figure>)}
      {photos.length < MAX_JOB_PHOTOS && <button type="button" className={styles.buttonSecondary} onClick={openCamera} disabled={disabled}>
        {photos.length ? "+ Chụp thêm" : "Chụp ảnh"}</button>}
    </div>}
  </>;
}
