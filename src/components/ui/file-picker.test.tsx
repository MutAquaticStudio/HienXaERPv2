import { createRef, type ChangeEvent } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FilePicker } from "./file-picker";

afterEach(cleanup);

it("keeps the native required file control, form name, accepted types and focusable ref", () => {
  const inputRef = createRef<HTMLInputElement>();
  const { container } = render(<form><label htmlFor="proof">Minh chứng</label>
    <FilePicker id="proof" name="file" accept="image/png,application/pdf" required inputRef={inputRef} />
  </form>);
  const input = screen.getByLabelText("Minh chứng") as HTMLInputElement;
  expect(inputRef.current).toBe(input);
  expect(input).toHaveAttribute("type", "file");
  expect(input).toHaveAttribute("accept", "image/png,application/pdf");
  expect(input.required).toBe(true);
  expect(input.validity.valueMissing).toBe(true);
  expect(input.willValidate).toBe(true);
  expect(input).not.toHaveAttribute("hidden");
  inputRef.current!.focus();
  expect(input).toHaveFocus();
  inputRef.current!.setCustomValidity("Minh chứng chưa xác minh");
  expect(input.validationMessage).toBe("Minh chứng chưa xác minh");
  const payload = new FormData(container.querySelector("form")!);
  expect(payload.has("file")).toBe(true);
  expect(payload.get("file")).toBeInstanceOf(File);
  expect(screen.getByText("Chọn tệp")).toBeInTheDocument();
  expect(screen.getByText("Chưa chọn tệp")).toBeInTheDocument();
});

it("passes the exact selected File and native input to the existing callback and FormData payload", () => {
  const file = new File(["nguồn dữ liệu"], "minh-chứng.png", { type: "image/png", lastModified: 1234 });
  const payload = new FormData();
  let callbackInput: HTMLInputElement | undefined;
  const onChange = vi.fn((event: ChangeEvent<HTMLInputElement>) => {
    callbackInput = event.currentTarget;
    payload.set(event.currentTarget.name, event.currentTarget.files![0]);
  });
  render(<><label htmlFor="proof">Minh chứng</label><FilePicker id="proof" name="file" onChange={onChange} /></>);
  const input = screen.getByLabelText("Minh chứng") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(callbackInput).toBe(input);
  expect(input.files![0]).toBe(file);
  expect(payload.get("file")).toBe(file);
  expect((payload.get("file") as File).name).toBe("minh-chứng.png");
  expect((payload.get("file") as File).size).toBe(file.size);
  expect((payload.get("file") as File).lastModified).toBe(1234);
  expect(screen.getByText("minh-chứng.png")).toBeInTheDocument();
  fireEvent.change(input, { target: { files: [] } });
  expect(screen.getByText("Chưa chọn tệp")).toBeInTheDocument();
});

it("restores the Vietnamese empty label after native form reset without triggering the upload callback", async () => {
  const onChange = vi.fn();
  const { container } = render(<form><label htmlFor="proof">Minh chứng</label><FilePicker id="proof" name="file" onChange={onChange} /></form>);
  fireEvent.change(screen.getByLabelText("Minh chứng"), { target: { files: [new File(["1"], "chứng-từ.pdf", { type: "application/pdf" })] } });
  expect(screen.getByText("chứng-từ.pdf")).toBeInTheDocument();
  act(() => { container.querySelector("form")!.reset(); });
  await waitFor(() => expect(screen.getByText("Chưa chọn tệp")).toBeInTheDocument());
  expect(onChange).toHaveBeenCalledTimes(1);
});

it("retains the displayed selection when the existing form prevents reset", async () => {
  const { container } = render(<form onReset={(event) => event.preventDefault()}><label htmlFor="proof">Minh chứng</label><FilePicker id="proof" name="file" /></form>);
  fireEvent.change(screen.getByLabelText("Minh chứng"), { target: { files: [new File(["1"], "giữ-bản-nháp.pdf")] } });
  await act(async () => { container.querySelector("form")!.reset(); });
  expect(screen.getByText("giữ-bản-nháp.pdf")).toBeInTheDocument();
});

it("forwards disabled and an existing description without replacing accessibility metadata", () => {
  const ref = vi.fn();
  render(<><label htmlFor="proof">Minh chứng</label><p id="hint">Tệp PDF</p>
    <FilePicker id="proof" disabled inputRef={ref} aria-describedby="hint" />
  </>);
  const input = screen.getByLabelText("Minh chứng");
  expect(input).toBeDisabled();
  expect(input.getAttribute("aria-describedby")?.split(" ")).toContain("hint");
  expect(ref).toHaveBeenCalledWith(input);
});
