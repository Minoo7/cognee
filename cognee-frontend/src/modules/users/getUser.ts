"use server";

import { headers } from "next/headers";
import { getServerBackendUrl } from "@/modules/config/serverRuntimeConfig";
import getLocalUser from "./getLocalUser";
import type CogneeUser from "./CogneeUser";

export default async function getUser(): Promise<CogneeUser | null> {
  const incoming = await headers();
  const forwarded = new Headers();
  for (const name of ["cookie", "authorization", "x-api-key"]) {
    const value = incoming.get(name);
    if (value) forwarded.set(name, value);
  }
  return getLocalUser(getServerBackendUrl(), forwarded);
}
