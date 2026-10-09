/** Default excludes cancelled documents without deleting or hiding their history. */
export function applyDocumentListScope<T extends {eq: (field: string, value: string) => T; neq: (field: string, value: string) => T}>(query: T, field: string, state: string): T {
 if (state === "ALL") return query;
 return state ? query.eq(field,state) : query.neq(field,"CANCELLED");
}
