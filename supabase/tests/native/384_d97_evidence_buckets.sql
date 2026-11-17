-- D97 (T-3): the internal evidence buckets are limited to 10 MB a file and to the picture / PDF types the app stores.
do $test$
begin
  assert (select file_size_limit = 10485760 and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
    from storage.buckets where id = 'delivery-proofs'), 'delivery-proofs limited';
  assert (select file_size_limit = 10485760 and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    from storage.buckets where id = 'inventory-evidence'), 'inventory-evidence limited';
  assert not exists (select 1 from storage.buckets where id in ('delivery-proofs', 'inventory-evidence', 'portal-evidence')
    and (public or file_size_limit is null or allowed_mime_types is null)), 'every evidence bucket is private and limited';
end
$test$;
