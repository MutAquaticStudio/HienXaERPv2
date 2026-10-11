export const noticeCommands = ["review_payment_notice", "match_payment_notice", "reverse_payment_notice_match", "record_payment_reconciliation"] as const;
export type NoticeCommand = (typeof noticeCommands)[number];
