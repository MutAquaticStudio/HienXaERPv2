"use client";
import { useId, useState } from "react";
import { formatQuantity } from "@/lib/core/quantity";
import { stockDemand, type WarehouseAvailability } from "@/modules/inventory/availability";
export function MaterialStockHint({ availability, materialId, orderedUomId, quantity, selectedWarehouseId }: { availability?: WarehouseAvailability; materialId: string; orderedUomId: string; quantity: string; selectedWarehouseId?: string }) {
  const fieldId = useId();
  const [chosenWarehouse, setChosenWarehouse] = useState("");
  if (!availability) return null;
  const warehouseId = selectedWarehouseId ?? chosenWarehouse;
  const position = availability.positions.find(row => row.warehouse_id === warehouseId && row.material_id === materialId);
  const status = stockDemand(position?.available_base_quantity ?? null, quantity, !position || position.base_uom_id === orderedUomId);
  return <div className="card-scope-note">
    {selectedWarehouseId === undefined && <label htmlFor={fieldId}>Kho tham khảo (không giữ tồn)<select id={fieldId} value={chosenWarehouse} onChange={event => setChosenWarehouse(event.target.value)}><option value="">Chọn kho để xem khả dụng</option>{availability.warehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
    {availability.incomplete && <p role="status">Dữ liệu kho chưa đầy đủ; mở màn hình Tồn kho để kiểm tra. Không dùng bản xem trước làm cam kết.</p>}
    {warehouseId && (position ? <><p>Trong kho: {formatQuantity(position.on_hand_base_quantity)} · Đã giữ: {formatQuantity(position.reserved_base_quantity)} · Khả dụng: {formatQuantity(position.available_base_quantity)} {position.baseSymbol}</p><p>{status === "SHORT" ? "Thiếu tồn tham khảo; có thể lưu nháp rồi chọn nguồn mua/NCC trực tiếp khi phân nguồn." : status === "SUFFICIENT" ? "Đủ tồn tại thời điểm đọc; hệ thống kiểm tra lại khi tạo phiếu giao." : status === "UOM_MISMATCH" ? "Khác ĐVT cơ sở: chưa đối chiếu lượng đặt, không suy đoán quy đổi." : "Nhập lượng hợp lệ để đối chiếu theo ĐVT cơ sở."}</p></> : <p>Chưa có vị trí kho phù hợp; không coi đây là số dư đầu kỳ bằng 0.</p>)}
    <p>Đơn bán nháp hoặc đã xác nhận chưa trừ kho. Hàng được giữ khi tạo phiếu giao và chuyển sang hàng đang giao khi bàn giao.</p>
  </div>;
}
export function WarehouseAllocationFields({ lineId, materialId, baseUomId, remaining, warehouses, availability }: { lineId: string; materialId: string; baseUomId: string; remaining: string; warehouses: {id: string; name: string}[]; availability?: WarehouseAvailability }) {
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState(remaining);
  return <><label htmlFor={`warehouse-${lineId}`}>Kho cấp hàng</label><select id={`warehouse-${lineId}`} name="warehouseId" value={warehouseId} onChange={event => setWarehouseId(event.target.value)} required><option value="" disabled>Chọn kho</option>{warehouses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><label htmlFor={`source-quantity-${lineId}`}>Lượng phân nguồn theo đơn vị cơ sở</label><input id={`source-quantity-${lineId}`} name="quantity" inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} required /><MaterialStockHint availability={availability} materialId={materialId} orderedUomId={baseUomId} quantity={quantity} selectedWarehouseId={warehouseId} /></>;
}
