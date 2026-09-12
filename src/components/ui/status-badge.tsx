const statusTone = { success: "status-success", warning: "status-warning", info: "status-info", danger: "status-danger" } as const;

export function StatusBadge({ children, tone }: { children: React.ReactNode; tone: keyof typeof statusTone }) {
  return <span className={`status ${statusTone[tone]}`}>{children}</span>;
}
