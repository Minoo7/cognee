import {
  array,
  boolean,
  nullable,
  object,
  parse,
  string,
  type InferOutput,
} from "valibot";
import type { AvailableTenant } from "@/modules/users/UserContext";
import type { Tenant } from "./types";

const localUserSchema = object({
  tenant_id: nullable(string()),
});

const backendTenantSchema = object({
  id: string(),
  name: string(),
  is_owner: boolean(),
});

const backendTenantsSchema = array(backendTenantSchema);

type LocalUser = InferOutput<typeof localUserSchema>;
type BackendTenant = InferOutput<typeof backendTenantSchema>;
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const DEFAULT_LOCAL_SCOPE_ID = "default-single-user";
export const PERSONAL_WORKSPACE_NAME = "Personal Workspace";

const DEFAULT_LOCAL_SCOPE: AvailableTenant = {
  id: DEFAULT_LOCAL_SCOPE_ID,
  name: PERSONAL_WORKSPACE_NAME,
  isOwner: true,
  ownerHasSubscription: true,
};

export interface LocalTenantState {
  tenant: Tenant;
  availableTenants: AvailableTenant[];
}

export class LocalTenantApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getJson(
  fetcher: Fetcher,
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetcher(url, { credentials: "include", ...init });
  if (!response.ok) {
    throw new LocalTenantApiError(
      `Local backend returned ${response.status}: ${response.statusText}`,
      response.status,
    );
  }
  return response.json();
}

function toAvailableTenant(tenant: BackendTenant): AvailableTenant {
  return {
    id: tenant.id,
    name: tenant.name,
    isOwner: tenant.is_owner,
    ownerHasSubscription: true,
  };
}

export function resolveLocalTenantState(
  user: LocalUser,
  backendTenants: BackendTenant[],
): LocalTenantState {
  const availableTenants = [DEFAULT_LOCAL_SCOPE, ...backendTenants.map(toAvailableTenant)];

  if (user.tenant_id === null) {
    return {
      tenant: {
        tenant_id: DEFAULT_LOCAL_SCOPE.id,
        tenant_name: DEFAULT_LOCAL_SCOPE.name,
      },
      availableTenants,
    };
  }

  const activeTenant = availableTenants.find((tenant) => tenant.id === user.tenant_id);
  if (!activeTenant) {
    throw new Error(
      `Active tenant ${user.tenant_id} is missing from the authenticated user's memberships.`,
    );
  }

  return {
    tenant: { tenant_id: activeTenant.id, tenant_name: activeTenant.name },
    availableTenants,
  };
}

export async function loadLocalTenantState(
  apiUrl: string,
  fetcher: Fetcher = global.fetch,
): Promise<LocalTenantState> {
  const user = parse(
    localUserSchema,
    await getJson(fetcher, `${apiUrl}/api/v1/users/me`),
  );
  const tenants = parse(
    backendTenantsSchema,
    await getJson(fetcher, `${apiUrl}/api/v1/permissions/tenants/me`),
  );
  return resolveLocalTenantState(user, tenants);
}

export async function selectLocalTenant(
  apiUrl: string,
  tenantId: string,
  fetcher: Fetcher = global.fetch,
): Promise<void> {
  await getJson(fetcher, `${apiUrl}/api/v1/permissions/tenants/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant_id: tenantId === DEFAULT_LOCAL_SCOPE_ID ? null : tenantId,
    }),
  });
}
