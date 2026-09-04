import { Navigation, Route } from "lucide-react";

import type { ApprovedDriverRoute } from "@/modules/route-optimization/types";

export function DriverRouteToday({ route }: { route: ApprovedDriverRoute | null }) {
  if (!route) return null;
  return <section className="driver-route-today" aria-labelledby="driver-route-today-heading">
    <header><div><p className="page-context">Lộ trình đã duyệt</p><h2 id="driver-route-today-heading">Chuyến hôm nay</h2></div><Route aria-hidden="true" /></header>
    <p>{route.planNumber} · {route.vehicleName}. Thứ tự này chỉ hiển thị cho tài xế được phân công; cập nhật tiến độ vẫn dùng các nút Delivery bên dưới.</p>
    <ol>{route.stops.map((stop) => <li key={stop.id}><span>{stop.stopSequence}</span><div><strong>{stop.dropAddress}</strong><small>{stop.deliveryNumber} · {stop.customerName}</small></div><Navigation aria-hidden="true" /></li>)}</ol>
  </section>;
}
