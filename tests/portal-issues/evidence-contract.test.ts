import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("WP1 worker evidence contract", () => {
  it("uses device geolocation and only exposes uploaded evidence after Storage plus metadata succeed", () => {
    const driver = readFileSync(join(process.cwd(), "src/components/driver-delivery-workspace.tsx"), "utf8");
    const uploader = readFileSync(join(process.cwd(), "src/components/worker-evidence-uploader.tsx"), "utf8");
    expect(driver).toContain("navigator.geolocation.getCurrentPosition");
    expect(driver).not.toContain("21.1212345");
    expect(driver).not.toContain("Nguyễn Văn An");
    expect(driver).toContain("Chọn ảnh hoặc chứng từ đã gửi");
    expect(uploader.indexOf('.storage.from("evidence").upload')).toBeGreaterThanOrEqual(0);
    expect(uploader.indexOf('.from("evidence")\n        .insert')).toBeGreaterThan(
      uploader.indexOf('.storage.from("evidence").upload'),
    );
    expect(uploader.indexOf("onUploaded(")).toBeGreaterThan(
      uploader.indexOf("if (evidenceResult.error || !evidenceResult.data)"),
    );
    expect(uploader).not.toContain("SUPABASE_SECRET_KEY");
    expect(uploader).not.toContain("service_role");
  });
});
