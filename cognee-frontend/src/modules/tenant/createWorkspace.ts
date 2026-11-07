import localFetch from "@/modules/instances/localFetch";
import { object, parse, string } from "valibot";

const createTenantResponseSchema = object({
  tenant_id: string(),
});

export default async function createWorkspace(tenantName: string): Promise<string> {
  const response = await localFetch(
    `/v1/permissions/tenants?tenant_name=${encodeURIComponent(tenantName.trim())}`,
    { method: "POST" },
  );
  const result = parse(createTenantResponseSchema, await response.json());
  return result.tenant_id;
}
