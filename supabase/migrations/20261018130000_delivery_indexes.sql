-- FB3 A5: indexes for the checks run on every delivery and assignment: allocation → delivery lines (capacity, consumed),
-- active stock reservations per warehouse and material (available stock), and the current assignments of a driver or a
-- vehicle (schedule clashes, next free time). Tables are small today; plain CREATE INDEX inside the transaction is enough.
begin;
create index if not exists delivery_lines_supply_allocation_idx on public.delivery_lines(supply_allocation_id);
create index if not exists inventory_reservations_active_position_idx on public.inventory_reservations(warehouse_id, material_id) where state = 'ACTIVE';
create index if not exists delivery_assignments_current_employee_idx on public.delivery_assignments(employee_id) where superseded_at is null;
create index if not exists delivery_assignments_current_vehicle_idx on public.delivery_assignments(vehicle_id) where superseded_at is null and vehicle_id is not null;
commit;
