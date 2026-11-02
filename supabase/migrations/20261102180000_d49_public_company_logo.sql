-- Owner decision D49 (02/11/2026): the sign-in screens show the company logo set in Cài đặt → Thông tin doanh nghiệp
-- instead of the "HX" monogram. Before signing in nobody has a session, so anon may read only the three logo columns of
-- the single company_profile row (the logo already appears on every PDF handed to customers). Name, tax code, address,
-- phone, email and bank details stay readable by signed-in users only; anon gets no table-wide privilege and no writes.
begin;

grant select (logo_mime, logo_base64, logo_sha256) on public.company_profile to anon;
create policy company_profile_logo_public on public.company_profile for select to anon using (true);

commit;
