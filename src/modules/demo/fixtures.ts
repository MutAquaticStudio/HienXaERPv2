export const demoFlow = {
  marker: "MOCK",
  customer: {
    id: "CUS-00018",
    name: "Cửa hàng VLXD Minh Phát",
    phone: "0912 345 678",
    address: "Phù Cừ, Hưng Yên",
    creditLimitVnd: "50000000",
  },
  salesOrder: {
    id: "SO-2026-00128",
    customerId: "CUS-00018",
    product: "Xi măng PCB40",
    quantityTon: "2",
    bagWeightKg: "50",
    bagCount: "40",
    unitPriceVnd: "3000000",
    totalVnd: "6000000",
    status: "Chờ gom nguồn",
    createdAt: "12/09/2026 · 08:20",
  },
  purchaseOrder: {
    id: "PO-2026-00076",
    salesOrderId: "SO-2026-00128",
    supplier: "Nhà máy Xi măng Hoàng Long",
    totalVnd: "5200000",
    status: "Đã xác nhận",
  },
  delivery: {
    id: "DLV-2026-00091",
    salesOrderId: "SO-2026-00128",
    purchaseOrderId: "PO-2026-00076",
    driver: "Trần Văn Bình",
    vehicle: "89C-123.45",
    status: "Chờ xuất kho",
  },
  debt: {
    id: "DEBT-00043",
    salesOrderId: "SO-2026-00128",
    customerId: "CUS-00018",
    outstandingVnd: "6000000",
    dueDate: "19/09/2026",
    status: "Trong hạn",
  },
} as const;

export const recentOrders = [
  demoFlow.salesOrder,
  {
    id: "SO-2026-00127",
    customerId: "CUS-00007",
    product: "Thép cuộn D6",
    quantityTon: "1.5",
    bagWeightKg: "0",
    bagCount: "0",
    unitPriceVnd: "15400000",
    totalVnd: "23100000",
    status: "Đang giao",
    createdAt: "12/09/2026 · 07:45",
  },
  {
    id: "SO-2026-00126",
    customerId: "CUS-00012",
    product: "Cát vàng",
    quantityTon: "8",
    bagWeightKg: "0",
    bagCount: "0",
    unitPriceVnd: "420000",
    totalVnd: "3360000",
    status: "Hoàn tất",
    createdAt: "11/09/2026 · 16:32",
  },
] as const;

export function formatFixtureVnd(value: string) {
  const grouped = value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped} ₫`;
}
