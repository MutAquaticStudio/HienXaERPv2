export const masterCommands = ["save_catalog_record", "save_customer_site_profile", "save_branch_config"] as const;
export type MasterCommand = typeof masterCommands[number];
export function masterCommand(kind: string): MasterCommand {
  return kind === "branches" ? "save_branch_config" : kind === "customers" || kind === "sites" ? "save_customer_site_profile" : "save_catalog_record";
}
