-- Nhập sổ bán hàng hằng ngày vào ERP (Owner 14/11/2026: "7h30 sáng mỗi ngày vào sheet 11.26 nhập đơn mới, tạo phiếu giao và kiểm kho
-- như hôm nay"). Chạy đúng các lệnh nghiệp vụ (RPC) như lần nhập tay 14/11, dưới tài khoản chủ doanh nghiệp; không sửa bảng trực tiếp.
--
-- Cách dùng (xem README.md cùng thư mục): gửi NGUYÊN file này + MỘT dòng gọi ở cuối, trong cùng một lần chạy SQL:
--   select pg_temp.hx_nhap_so('11.26', $rows$[["348","14/11/2026","0912…","Tên khách",…], …]$rows$::jsonb, true);   -- chạy khô
--   select pg_temp.hx_nhap_so('11.26', $rows$[…]$rows$::jsonb, false);                                              -- chạy thật
-- `rows` là các dòng của tab sổ (mỗi dòng là mảng ô dạng chữ, đúng thứ tự cột A..R như Google Sheets trả về).
-- Chạy khô: làm hết rồi tự hủy, báo lại bằng lỗi "DRY OK {...}". Chạy thật: trả về báo cáo JSON và ghi một dòng nhật ký (audit).
--
-- Quy tắc (đã chốt với Owner 14/11/2026):
--  * Chỉ nhập dòng có ngày TRƯỚC hôm nay (giờ Việt Nam); dòng đã nhập (đơn hoặc việc dịch vụ có dấu "Sổ <tab> dòng <TT> ·") bỏ qua.
--  * Dòng thu tiền ("Thanh toán công nợ", "Điều chỉnh V", vật tư trống) không nhập (phiếu thu công nợ Owner cho bỏ qua).
--  * Vật tư kho → 1 đơn bán + phiếu giao + giao xong + xác nhận; người giao trống → "Owner Hiền Xa"; xe theo ĐVT (mặc định Xe cn nhỏ).
--  * Người giao "VĂN AN" → Văn An giao thẳng: đơn mua + đơn bán liên kết, giá mua 85% giá bán, không cần ảnh.
--  * Dịch vụ → việc dịch vụ theo loại cùng tên + đơn vị tính, giao đúng người, xác nhận, công nợ hạn 14 ngày.
--  * Khách: theo tên (duy nhất) → theo SĐT (duy nhất) → không có thì tạo khách mới (KH###, hạn nợ 14 ngày) + công trình CT1.
--  * Kho thiếu hàng để giao → 1 phiếu kiểm kho bù đúng phần thiếu, giá vốn 85% giá bán trung bình của các dòng đó, duyệt luôn.
--  * Dòng không chắc chắn (không rõ người giao, chưa có loại dịch vụ, khách trùng tên…) → GIỮ LẠI, báo cho Owner, không đoán.
--  * Ngày của chứng từ đặt theo ngày sổ bằng file dong-bo-ngay.sql (chạy sau file này).

create or replace function pg_temp.hx_so_num(s text) returns numeric language sql immutable as $f$
  select case when t = '' then null
    when t ~ '^[0-9]+/[0-9]+$' and split_part(t, '/', 2)::numeric > 0 then round(split_part(t, '/', 1)::numeric / split_part(t, '/', 2)::numeric, 6)
    when replace(replace(t, '.', ''), ',', '.') ~ '^-?[0-9]+(\.[0-9]+)?$' then replace(replace(t, '.', ''), ',', '.')::numeric end
  from (select regexp_replace(coalesce(s, ''), '[[:space:]₫]', '', 'g') as t) z
$f$;

create or replace function pg_temp.hx_nhap_so(tab text, raw jsonb, dry boolean, until date default null) returns jsonb language plpgsql as $fn$
declare
  owner constant uuid := '1a5a03c5-df68-4c95-af31-4f254c87216a';
  -- Tên vật tư trên sổ → mã vật tư ERP
  stock_map constant jsonb := '{"Cát đen":"CAT-DEN","Cát nền":"CAT-NEN","Cvbt":"CVBT","Đá":"DA","Đá bẩn":"DA-BAN","Gạch A2":"GACH-A2","Gạch đặc":"GACH-DAC",
    "Gạch đen":"GACH-DEN","Gạch lỗ":"GACH-LO","Kê 10":"KE10","Kê 2":"KE2","Kê 3":"KE3","Kê 8":"KE8","Keo chít mạch":"KEO-CHIT-MACH","Sắt 6":"SAT6",
    "Sắt 6 đai":"SAT6-DAI","Sắt 8 đai":"SAT8-DAI","Sắt 10":"SAT10-CB300","Sắt 12":"SAT12-CB300","Sắt 14":"SAT14-CB300","Sắt 16":"SAT16-CB300",
    "Sắt 18":"SAT18-CB300","Sắt 18cb400":"SAT18-CB400","Sắt 20":"SAT20-CB300","Thép buộc":"THEP-BUOC","XIBS30":"XIBS30","XIBS40":"XIBS40","XIHH30":"XIHH30"}';
  -- ĐVT trên sổ → ký hiệu đơn vị ERP ("Xe" là Xe cn nhỏ, Owner 14/11/2026)
  uom_map constant jsonb := '{"Xe cn to":"Xe cn to","Xe":"Xe cn nhỏ","Xe cn nhỏ":"Xe cn nhỏ","Xe điện":"Xe điện","Xe oto":"Ô tô","Ô tô":"Ô tô","Bao":"Bao",
    "Viên":"Viên","Kg":"Kg","Cây":"Cây","Hộp":"Hộp","Khối":"Khối"}';
  vehicle_uoms constant text[] := array['Xe cn to', 'Xe cn nhỏ', 'Xe điện', 'Ô tô'];
  tag constant text := 'so' || replace(tab, '.', '');
  svtag constant text := 'sj' || replace(tab, '.', '');
  -- Nhập các dòng có ngày trước `until` (mặc định hôm nay); chỉ chạy khô mới được đặt ngày khác để thử.
  today constant date := coalesce(until, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  branch uuid; wh uuid; sup uuid; owner_emp uuid; xuc uuid;
  x jsonb; p jsonb; plans jsonb := '[]'; held jsonb := '[]'; made jsonb := '[]'; new_customers jsonb := '[]'; topups jsonb := '[]'; diffs jsonb := '[]';
  later integer := 0; payments integer := 0; done integer := 0;
  tt integer; d date; item text; unit_txt text; uom_sym text; giao text; cname text; sdt text; marker text; dup text; kind text; why text;
  qty numeric; price numeric; total numeric; mat uuid; baseuom uuid; uom uuid; num numeric; den numeric; mode text; typ public.service_types%rowtype;
  emp uuid; veh uuid; mach uuid; cust uuid; site uuid; n integer; next_code integer;
  rec record; lines jsonb := '[]'; onhand numeric; avail numeric; cnt uuid; res jsonb; ver integer;
  ord uuid; oline uuid; dl uuid; dline uuid; rid uuid; v integer; jv integer; job uuid; wk uuid; po uuid; so uuid; alloc record; t0 timestamptz; term text; amount bigint;
  goods_total bigint := 0; service_total bigint := 0; report jsonb;
begin
  perform set_config('request.jwt.claim.sub', owner::text, true);
  if tab !~ '^[0-9]{1,2}\.[0-9]{2}$' or jsonb_typeof(raw) <> 'array' then raise exception 'tham số sai: tab "%"', tab; end if;
  if until is not null and not dry then raise exception 'chỉ chạy khô mới được đặt ngày khác'; end if;
  select id into branch from public.branches where code = 'HX';
  select count(*), min(id::text)::uuid into n, wh from public.warehouses where branch_id = branch and active;
  if branch is null or n <> 1 then raise exception 'không xác định được chi nhánh / kho Hiền Xa'; end if;
  select id into sup from public.suppliers where branch_id = branch and code = 'VANAN' and active;
  select id into owner_emp from public.employees where display_name = 'Owner Hiền Xa' and active;
  select id into xuc from public.machines where branch_id = branch and code = 'XUC' and active;
  if owner_emp is null then raise exception 'thiếu nhân viên "Owner Hiền Xa"'; end if;

  -- 1. Đọc và kiểm từng dòng; chưa ghi gì.
  for x in select e from jsonb_array_elements(raw) e
    where jsonb_typeof(e) = 'array' and trim(coalesce(e->>0, '')) ~ '^[0-9]+$' order by trim(e->>0)::integer loop
    tt := trim(x->>0)::integer; item := trim(coalesce(x->>5, '')); unit_txt := trim(coalesce(x->>6, '')); giao := upper(trim(coalesce(x->>15, '')));
    cname := trim(coalesce(x->>3, '')); sdt := coalesce(substring(regexp_replace(coalesce(x->>2, ''), '[[:space:].]', '', 'g') from '[0-9]{9,11}'), '');
    d := case when trim(coalesce(x->>1, '')) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' then to_date(trim(x->>1), 'DD/MM/YYYY') end;
    qty := pg_temp.hx_so_num(x->>8); price := pg_temp.hx_so_num(x->>7); total := pg_temp.hx_so_num(x->>9);
    if item = '' or lower(item) in ('thanh toán công nợ', 'điều chỉnh v') then payments := payments + 1; continue; end if;
    if d is null then held := held || jsonb_build_object('tt', tt, 'ly_do', 'ngày không đọc được: "' || coalesce(x->>1, '') || '"'); continue; end if;
    if d >= today then later := later + 1; continue; end if;
    marker := 'Sổ ' || tab || ' dòng ' || tt || ' ·';
    if exists (select 1 from public.sales_orders o where o.branch_id = branch and o.commercial_terms like marker || '%')
      or exists (select 1 from public.service_jobs j where j.branch_id = branch and j.description like marker || '%') then done := done + 1; continue; end if;
    uom_sym := coalesce(uom_map->>unit_txt, unit_txt);
    why := null; mat := null; uom := null; num := null; den := null; mode := null; typ := null; emp := null; veh := null; mach := null; cust := null; site := null; dup := null;
    if stock_map ? item then
      kind := case when giao = 'VĂN AN' then 'DIRECT' else 'GOODS' end;
      select m.id, m.base_uom_id into mat, baseuom from public.materials m where m.code = stock_map->>item and m.active;
      select u.id into uom from public.units_of_measure u where u.symbol = uom_sym;
      if mat is null or uom is null then why := format('chưa có vật tư "%s" hoặc đơn vị "%s"', item, unit_txt);
      elsif uom = baseuom then num := 1; den := 1; mode := 'HALF_UP';
      else
        select c.numerator, c.denominator, c.rounding_mode into num, den, mode from public.material_uom_conversions c
          where c.material_id = mat and c.from_uom_id = uom and c.to_uom_id = baseuom and c.active;
        if num is null then why := format('chưa có quy đổi "%s" của %s', unit_txt, item); end if;
      end if;
      if why is null and (qty is null or qty <= 0) then why := 'số lượng trống hoặc không đọc được'; end if;
      if why is null and (price is null or price <= 0) then why := 'đơn giá trống hoặc bằng 0'; end if;
      if why is null and kind = 'DIRECT' and sup is null then why := 'chưa có nhà cung cấp Văn An (mã VANAN)'; end if;
      if why is null and kind = 'GOODS' then
        select id into veh from public.vehicles where branch_id = branch and active and code = case when uom_sym = any(vehicle_uoms) then uom_sym else 'Xe cn nhỏ' end;
        if veh is null then why := 'thiếu xe giao'; end if;
      end if;
    else
      kind := 'SERVICE';
      select count(*) into n from public.service_types t where t.branch_id = branch and t.active and lower(trim(t.name)) = lower(item) and lower(trim(t.unit_label)) = lower(uom_sym);
      if n = 1 then
        select * into typ from public.service_types t where t.branch_id = branch and t.active and lower(trim(t.name)) = lower(item) and lower(trim(t.unit_label)) = lower(uom_sym);
      end if;
      if n <> 1 then why := format('chưa có loại dịch vụ "%s" theo đơn vị "%s"', item, unit_txt);
      elsif giao = 'VĂN AN' then why := 'dịch vụ do Văn An làm: chưa có cách nhập';
      elsif qty is null or qty <= 0 then why := 'số lượng trống hoặc không đọc được';
      elsif typ.resource_kind = 'VEHICLE' then
        select id into veh from public.vehicles where branch_id = branch and active and code = case when typ.unit_label = any(vehicle_uoms) then typ.unit_label else 'Xe cn nhỏ' end;
        if veh is null then why := 'thiếu xe'; end if;
      elsif typ.resource_kind = 'MACHINE' then
        mach := xuc; if mach is null then why := 'thiếu máy xúc (mã XUC)'; end if;
      end if;
    end if;
    if why is null and kind <> 'DIRECT' then
      if giao = '' then emp := owner_emp;
      else
        select count(*), min(e.id::text)::uuid into n, emp from public.employees e where e.active and upper(trim(e.display_name)) = giao;
        if n <> 1 then why := format('không rõ người giao / người làm "%s"', x->>15); emp := null; end if;
      end if;
    end if;
    if why is null and cname = '' then why := 'trống tên khách'; end if;
    if why is null then
      select count(*), min(c.id::text)::uuid into n, cust from public.customers c where c.branch_id = branch and c.active and lower(trim(c.display_name)) = lower(cname);
      if n > 1 then why := format('có %s khách cùng tên "%s"', n, cname); cust := null;
      elsif n = 0 and length(sdt) >= 9 then
        select count(*), min(c.id::text)::uuid into n, cust from public.customers c where c.branch_id = branch and c.active and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = sdt;
        if n > 1 then why := format('có %s khách cùng SĐT %s', n, sdt); cust := null; end if;
      end if;
      if cust is not null then
        select s.id into site from public.customer_sites s where s.customer_id = cust and s.active order by s.code limit 1;
        if site is null then why := 'khách chưa có công trình'; end if;
      end if;
    end if;
    -- Đơn đã có trong ERP mà không từ sổ (khách đặt trên cổng, văn phòng nhập tay): cùng khách, vật tư, đơn vị, số lượng, ±1 ngày → giữ lại, không nhập trùng.
    if why is null and cust is not null and kind in ('GOODS', 'DIRECT') then
      select min(o.order_number) into dup from public.sales_orders o join public.sales_order_lines l on l.sales_order_id = o.id
        where o.customer_id = cust and o.commercial_state <> 'CANCELLED' and coalesce(o.commercial_terms, '') not like 'Sổ %dòng %'
          and l.material_id = mat and l.ordered_uom_id = uom and l.quantity = qty
          and (coalesce(o.requested_delivery_at, o.created_at) at time zone 'Asia/Ho_Chi_Minh')::date between d - 1 and d + 1;
      if dup is not null then why := format('trùng đơn %s đã có trong ERP (khách đặt trên cổng hoặc nhập tay): văn phòng chọn giữ một bên', dup); end if;
    end if;
    if why is not null then held := held || jsonb_build_object('tt', tt, 'ngay', to_char(d, 'DD/MM'), 'khach', cname, 'hang', item, 'ly_do', why); continue; end if;
    plans := plans || jsonb_build_object('tt', tt, 'ngay', d, 'kind', kind, 'customer', cname, 'phone', sdt, 'address', trim(coalesce(x->>4, '')),
      'item', item, 'mat', mat, 'uom', uom, 'num', num, 'den', den, 'mode', mode, 'qty', qty, 'price', price, 'sheet_total', total,
      'base_qty', case when num is not null then qty * num / den end, 'typ', typ.id, 'emp', emp, 'veh', veh, 'mach', mach, 'cust', cust, 'site', site,
      'note', trim(coalesce(x->>17, '')), 'giao', case when giao = '' then 'OWNER' else giao end);
  end loop;

  -- 2. Khách mới (cùng tên trong đợt này là một khách).
  select coalesce(max(substring(code from '^KH([0-9]+)$')::integer), 0) into next_code from public.customers where branch_id = branch;
  for rec in select lower(e->>'customer') as k, min(e->>'customer') as name, max(nullif(e->>'phone', '')) as phone, max(nullif(e->>'address', '')) as address,
      min((e->>'tt')::integer) as first_tt from jsonb_array_elements(plans) e where e->>'cust' is null group by 1 order by min((e->>'tt')::integer) loop
    next_code := next_code + 1;
    cust := md5(tag || ':khach:' || rec.k)::uuid;
    perform public.save_customer_site_profile('customers', cust, branch,
      jsonb_strip_nulls(jsonb_build_object('code', 'KH' || lpad(next_code::text, 3, '0'), 'display_name', rec.name, 'customer_type', 'INDIVIDUAL',
        'phone', case when length(coalesce(rec.phone, '')) between 9 and 11 then rec.phone end, 'address_text', coalesce(rec.address, 'Hà Nội'),
        'payment_terms_days', '14', 'credit_limit_vnd', '10000000000', 'active', true,
        'internal_note', format('Khách mới theo sổ bán hàng %s (dòng %s), nhập tự động', tab, rec.first_tt))),
      null, 'Tạo khách mới theo sổ bán hàng ' || tab, md5(tag || ':khach:' || rec.k || ':tao')::uuid);
    site := md5(tag || ':congtrinh:' || rec.k)::uuid;
    perform public.save_customer_site_profile('sites', site, branch,
      jsonb_build_object('customer_id', cust, 'code', 'CT1', 'name', left('Công trình ' || rec.name, 140), 'address_text', coalesce(rec.address, 'Hà Nội'),
        'receiver_name', null, 'receiver_phone', case when length(coalesce(rec.phone, '')) between 9 and 11 then rec.phone end,
        'sales_owner_employee_id', null, 'access_note', null, 'active', true),
      null, 'Tạo công trình cho khách mới theo sổ bán hàng ' || tab, md5(tag || ':congtrinh:' || rec.k || ':tao')::uuid);
    new_customers := new_customers || jsonb_build_object('ma', 'KH' || lpad(next_code::text, 3, '0'), 'ten', rec.name, 'sdt', rec.phone, 'dong', rec.first_tt);
    select jsonb_agg(case when q->>'cust' is null and lower(q->>'customer') = rec.k then q || jsonb_build_object('cust', cust, 'site', site) else q end
      order by (q->>'tt')::integer) into plans from jsonb_array_elements(plans) q;
  end loop;

  -- 3. Bù tồn kho cho phần thiếu (một phiếu kiểm kho cho cả đợt, duyệt luôn).
  for rec in select (e->>'mat')::uuid as mat, sum((e->>'base_qty')::numeric) as need, sum((e->>'qty')::numeric * (e->>'price')::numeric) as value,
      min(e->>'ngay') as d0, max(e->>'ngay') as d1 from jsonb_array_elements(plans) e where e->>'kind' = 'GOODS' group by 1 loop
    select coalesce(sum(base_quantity_delta), 0) into onhand from public.inventory_movements where warehouse_id = wh and material_id = rec.mat and occurred_at <= now();
    select coalesce(sum(available_base_quantity::numeric), 0) into avail from public.warehouse_inventory_read where warehouse_id = wh and material_id = rec.mat;
    if rec.need > avail then
      lines := lines || jsonb_build_object('material_id', rec.mat, 'counted_base_quantity', onhand + (rec.need - avail),
        'adjustment_unit_cost_vnd', greatest(1, round(0.85 * rec.value / rec.need)),
        'reason', format('Bù tồn trước khi giao theo sổ bán hàng %s ngày %s (giá vốn 85%% giá bán)', tab, rec.d0));
      topups := topups || jsonb_build_object('vat_tu', (select code from public.materials where id = rec.mat), 'ton', trim_scale(avail)::text,
        'can', trim_scale(rec.need)::text, 'bu', trim_scale(rec.need - avail)::text, 'gia_von', greatest(1, round(0.85 * rec.value / rec.need)));
    end if;
  end loop;
  if jsonb_array_length(lines) > 0 then
    cnt := public.open_stock_count(branch, wh, now(), md5(tag || ':buton:' || md5(lines::text) || ':open')::uuid);
    select version into ver from public.stock_counts where id = cnt;
    res := public.record_stock_count_lines_batch(cnt, lines, ver, md5(tag || ':buton:' || md5(lines::text) || ':lines')::uuid);
    perform public.approve_stock_count(cnt, (res->>'version')::integer, md5(tag || ':buton:' || md5(lines::text) || ':approve')::uuid);
  end if;

  -- 4. Tạo chứng từ từng dòng; một dòng lỗi thì chỉ dòng đó bị giữ lại.
  for p in select q from jsonb_array_elements(plans) q order by (q->>'tt')::integer loop
    begin
      tt := (p->>'tt')::integer; qty := (p->>'qty')::numeric; price := (p->>'price')::numeric;
      term := 'Sổ ' || tab || ' dòng ' || tt || ' · giao: ' || (p->>'giao') || coalesce(nullif(' · ' || (p->>'note'), ' · '), '');
      if p->>'kind' in ('GOODS', 'DIRECT') then
        t0 := ((p->>'ngay') || ' 08:00:00+07')::timestamptz; amount := round(qty * price);
        if p->>'kind' = 'GOODS' then
          ord := public.create_sales_order_draft(branch, (p->>'cust')::uuid, (p->>'site')::uuid, t0, term,
            jsonb_build_array(jsonb_build_object('material_id', p->'mat', 'ordered_uom_id', p->'uom', 'quantity', qty, 'conversion_numerator', (p->>'num')::numeric,
              'conversion_denominator', (p->>'den')::numeric, 'rounding_mode', p->>'mode', 'unit_price_vnd', price::bigint, 'price_source_type', 'MANUAL_APPROVED',
              'override_reason', 'Giá nhập tay theo sổ bán hàng ' || tab)), md5(tag || ':' || tt || ':draft')::uuid);
          perform public.confirm_sales_order(ord, md5(tag || ':' || tt || ':confirm')::uuid);
          select id into oline from public.sales_order_lines where sales_order_id = ord;
          res := public.create_delivery_for_order(ord, wh, jsonb_build_array(jsonb_build_object('sales_order_line_id', oline, 'quantity', trim_scale(qty)::text)), t0,
            jsonb_build_object('employee_id', p->>'emp', 'vehicle_id', p->>'veh', 'schedule_mode', 'NOW'), md5(tag || ':' || tt || ':delivery')::uuid);
          dl := (res->>'delivery_id')::uuid;
        else
          term := 'Sổ ' || tab || ' dòng ' || tt || ' · giao: VĂN AN · Văn An giao thẳng';
          po := public.create_linked_direct_drafts(branch, sup, (p->>'cust')::uuid, (p->>'site')::uuid,
            jsonb_build_object('material_id', p->'mat', 'ordered_uom_id', p->'uom', 'quantity', qty, 'conversion_numerator', (p->>'num')::numeric,
              'conversion_denominator', (p->>'den')::numeric, 'rounding_mode', p->>'mode', 'unit_cost_vnd', round(price * 0.85)::bigint, 'price_source_type', 'MANUAL_APPROVED',
              'override_reason', 'Giá mua Văn An giao thẳng (85% giá bán, Owner 14/11/2026)'),
            jsonb_build_object('material_id', p->'mat', 'ordered_uom_id', p->'uom', 'quantity', qty, 'conversion_numerator', (p->>'num')::numeric,
              'conversion_denominator', (p->>'den')::numeric, 'rounding_mode', p->>'mode', 'unit_price_vnd', price::bigint, 'price_source_type', 'MANUAL_APPROVED',
              'override_reason', 'Giá nhập tay theo sổ bán hàng ' || tab),
            t0, term, md5(tag || ':vanan:' || tt || ':draft')::uuid);
          select source_sales_order_id into so from public.purchase_orders where id = po;
          ord := so;
          perform public.confirm_purchase_order(po, md5(tag || ':vanan:' || tt || ':po')::uuid);
          perform public.confirm_sales_order(so, md5(tag || ':vanan:' || tt || ':so')::uuid);
          select a.id, a.allocated_base_quantity as q into alloc from public.supply_allocations a join public.sales_order_lines l on l.id = a.sales_order_line_id where l.sales_order_id = so;
          dl := public.create_delivery_from_allocations(so, jsonb_build_array(jsonb_build_object('supply_allocation_id', alloc.id, 'planned_base_quantity', alloc.q)), t0,
            md5(tag || ':vanan:' || tt || ':del')::uuid);
          select version into v from public.deliveries where id = dl;
          perform public.assign_delivery(dl, null, null, 'Văn An', null, v, md5(tag || ':vanan:' || tt || ':assign')::uuid);
        end if;
        select id into dline from public.delivery_lines where delivery_id = dl;
        select version into v from public.deliveries where id = dl;
        perform public.handoff_delivery_actual(dl, v, now() - interval '1 minute', md5(tag || ':' || tt || ':' || (p->>'kind') || ':handoff')::uuid,
          jsonb_build_array(jsonb_build_object('delivery_line_id', dline, 'loaded_base_quantity', trim_scale((select planned_base_quantity from public.delivery_lines where id = dline))::text)));
        select version into v from public.deliveries where id = dl;
        rid := public.submit_delivery_result(dl, 'FULL', jsonb_build_array(jsonb_build_object('delivery_line_id', dline,
            'actual_base_quantity', trim_scale((select planned_base_quantity from public.delivery_lines where id = dline))::text)),
          p->>'customer', 'Nhập theo sổ bán hàng ' || tab, null, null, v, md5(tag || ':' || tt || ':' || (p->>'kind') || ':result')::uuid);
        select version into v from public.deliveries where id = dl;
        perform public.verify_delivery(rid, jsonb_build_array(jsonb_build_object('delivery_line_id', dline,
            'accepted_base_quantity', trim_scale((select planned_base_quantity from public.delivery_lines where id = dline))::text,
            'billable_base_quantity', trim_scale((select planned_base_quantity from public.delivery_lines where id = dline))::text)),
          v, md5(tag || ':' || tt || ':' || (p->>'kind') || ':verify')::uuid);
        if (select execution_state from public.deliveries where id = dl) <> 'VERIFIED' then raise exception 'phiếu giao chưa xác nhận'; end if;
        if (select coalesce(sum(line_total_vnd), 0) from public.sales_order_lines where sales_order_id = ord) <> amount then raise exception 'tổng đơn lệch'; end if;
        goods_total := goods_total + amount;
        made := made || jsonb_build_object('tt', tt, 'loai', case when p->>'kind' = 'DIRECT' then 'Văn An giao thẳng' else 'hàng' end, 'khach', p->>'customer',
          'hang', p->>'item', 'so_luong', trim_scale(qty)::text, 'tien', amount, 'don', (select order_number from public.sales_orders where id = ord));
      else
        select * into typ from public.service_types where id = (p->>'typ')::uuid;
        t0 := ((p->>'ngay') || ' 09:00:00+07')::timestamptz; amount := round(coalesce((p->>'sheet_total')::numeric, qty * coalesce(price, 0), 0));
        job := public.schedule_service_job(branch, (p->>'cust')::uuid, (p->>'site')::uuid, typ.id,
          'Sổ ' || tab || ' dòng ' || tt || ' · ' || (p->>'giao') || coalesce(nullif(' · ' || (p->>'note'), ' · '), ''),
          t0, t0 + interval '1 hour', qty, null, (p->>'veh')::uuid, (p->>'mach')::uuid, md5(svtag || ':' || tt || ':sched')::uuid);
        wk := public.publish_work_item(branch, 'SERVICE_JOB', job, 'DIRECT', (p->>'emp')::uuid, md5(svtag || ':' || tt || ':pub')::uuid);
        select version into v from public.work_items where id = wk;
        perform public.start_work_item(wk, v, md5(svtag || ':' || tt || ':start')::uuid);
        select version into v from public.work_items where id = wk;
        perform public.submit_work_result(wk, qty, 'Nhập theo sổ bán hàng ' || tab, p->>'customer', null, v, md5(svtag || ':' || tt || ':result')::uuid);
        select version into v from public.work_items where id = wk; select version into jv from public.service_jobs where id = job;
        perform public.verify_service_job(job, qty, qty, amount, (p->>'ngay')::date + 14, 'Nhập theo sổ bán hàng ' || tab, jv, v, md5(svtag || ':' || tt || ':verify')::uuid);
        if (select execution_state from public.service_jobs where id = job) <> 'VERIFIED' then raise exception 'việc dịch vụ chưa xác nhận'; end if;
        service_total := service_total + amount;
        made := made || jsonb_build_object('tt', tt, 'loai', 'dịch vụ', 'khach', p->>'customer', 'hang', p->>'item' || ' (' || typ.unit_label || ')',
          'so_luong', trim_scale(qty)::text, 'tien', amount);
      end if;
      if p->>'kind' <> 'SERVICE' and nullif(p->>'sheet_total', '') is not null and abs(amount - round((p->>'sheet_total')::numeric)) > 1 then
        diffs := diffs || jsonb_build_object('tt', tt, 'erp', amount, 'so', round((p->>'sheet_total')::numeric));
      end if;
    exception when others then
      held := held || jsonb_build_object('tt', p->>'tt', 'ngay', p->>'ngay', 'khach', p->>'customer', 'hang', p->>'item', 'ly_do', 'lỗi khi tạo: ' || sqlerrm);
    end;
  end loop;

  report := jsonb_build_object('tab', tab, 'hom_nay', today, 'da_tao', jsonb_array_length(made), 'tien_hang', goods_total, 'tien_dich_vu', service_total,
    'da_nhap_truoc', done, 'dong_thu_tien_bo_qua', payments, 'dong_hom_nay_de_mai', later, 'giu_lai', held, 'khach_moi', new_customers, 'bu_ton', topups,
    'lech_so', diffs, 'chi_tiet', made);
  if dry then raise exception 'DRY OK %', report::text; end if;
  if jsonb_array_length(made) > 0 or jsonb_array_length(new_customers) > 0 or jsonb_array_length(topups) > 0 then
    insert into public.audit_events(actor_auth_user_id, branch_id, action, entity_type, entity_id, trace_id, changed_fields, reason)
    values (owner, branch, 'sales_ledger.daily_import', 'sales_ledger', gen_random_uuid(), gen_random_uuid(), array['sales_orders', 'deliveries', 'service_jobs', 'stock_counts'],
      left(format('Nhập tự động sổ bán hàng %s (Owner 14/11/2026): %s dòng, hàng %s đ, dịch vụ %s đ, %s khách mới, bù tồn %s mặt hàng, giữ lại %s dòng.',
        tab, jsonb_array_length(made), goods_total, service_total, jsonb_array_length(new_customers), jsonb_array_length(topups), jsonb_array_length(held)), 500));
  end if;
  return report;
end
$fn$;
