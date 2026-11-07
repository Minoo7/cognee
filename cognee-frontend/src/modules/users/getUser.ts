"use server";

import CogneeUser from "./CogneeUser";
import getLocalUser from "./getLocalUser";

/**
 * Open-source version — delegates to getLocalUser.
 * The SaaS version uses Auth0 session to resolve the authenticated user.
 */
export default async function getUser(): Promise<CogneeUser | null> {
  return getLocalUser();
}
