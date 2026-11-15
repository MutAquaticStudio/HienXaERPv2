-- Chấm công ca qua đêm: "Vào ca" lúc đang trong ca bắt đầu từ hôm qua ghi ngày công là hôm qua (ngày ca bắt đầu), dù hôm nay
-- cũng có xếp ca đó. Ca dài 23 giờ, bắt đầu 22 giờ trước lúc chạy, nên ở mọi giờ chạy cửa sổ khớp là ca bắt đầu ngày
-- (giờ VN hiện tại − 22 giờ); ca cùng tên của ngày sau mới bắt đầu sau 2 giờ nữa.
do $test$
declare
  branch constant uuid := '20000000-0000-4000-8000-00000000000a';
  worker constant uuid := '30000000-0000-4000-8000-000000000003';
  local_now timestamp := date_trunc('minute', now() at time zone 'Asia/Ho_Chi_Minh');
  started timestamp := local_now - interval '22 hours';
  shift uuid; rec uuid; r public.attendance_records%rowtype;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  shift := public.save_work_shift(branch, null, 'DEM', 'Ca dài qua đêm', started::time, (started + interval '23 hours')::time, 0, true,
    '7f347000-0000-4000-8000-000000000001');
  perform public.schedule_shifts(branch, array[worker], shift, started::date, started::date + 1, null, '7f347000-0000-4000-8000-000000000002');
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  rec := public.clock_attendance(branch, 'IN', 10.762622, 106.660172, '7f347000-0000-4000-8000-000000000003');
  perform pg_temp.act_as_admin();
  select * into r from public.attendance_records where id = rec;
  assert r.shift_id = shift and r.work_date = started::date, format('work day of the matched window %s (expected %s)', row_to_json(r), started::date);
  assert r.late_minutes between 22 * 60 - 1 and 22 * 60 + 1, format('late against that window %s', r.late_minutes);
end
$test$;
