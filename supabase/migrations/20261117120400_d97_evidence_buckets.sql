-- D97 (security review T-3): the internal evidence buckets take only what the app stores there, at most 10 MB a file, like
-- portal-evidence. delivery-proofs: the delivery page's "Minh chứng giao hàng" accepts any picture or a PDF from a phone
-- (JPEG, PNG, WebP, HEIC/HEIF). inventory-evidence: purchase documents (JPEG, PNG, PDF; WebP for phone pictures).
-- Objects already stored are not touched. Without the storage schema (a bare database) nothing happens.
begin;

do $buckets$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']::text[]
    where id = 'delivery-proofs';
    update storage.buckets set file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
    where id = 'inventory-evidence';
  end if;
end
$buckets$;

commit;
