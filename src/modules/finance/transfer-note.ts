// The transfer note a customer types so SePay (D42) can match the money: the bank prefix of the account (SEVQR / TKP…),
// then the order code without dashes, else "TT", then the customer code — the same as private.bank_transfer_note.
const token = (value: string | null | undefined) => (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function bankTransferNote(prefix: string | null | undefined, orderNumber: string | null | undefined, customerCode: string | null | undefined) {
  return [token(prefix), orderNumber ? token(orderNumber) : "TT", token(customerCode)].filter(Boolean).join(" ");
}
