import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { AuthSkeleton, CardsSkeleton, DashboardSkeleton, DetailSkeleton, FormSkeleton, ListSkeleton } from "./skeletons";

afterEach(cleanup);

it.each([
  [ListSkeleton, "Đang tải danh sách"], [DetailSkeleton, "Đang tải chi tiết"], [FormSkeleton, "Đang mở biểu mẫu"],
  [DashboardSkeleton, "Đang tổng hợp số liệu"], [CardsSkeleton, "Đang tải"], [AuthSkeleton, "Đang mở"],
])("announces the loading screen and staggers its rows (FB17)", (Skeleton, label) => {
  const { container } = render(<Skeleton />);
  expect(screen.getByRole("status", { name: label })).toBeInTheDocument();
  expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(5);
  expect(container.querySelector('[style*="--i"]')).not.toBeNull();
});
