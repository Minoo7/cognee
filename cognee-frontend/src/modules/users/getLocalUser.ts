import CogneeUser from "./CogneeUser";
import { getLocalApiUrl } from "./getLocalApiUrl";
import { object, parse, string } from "valibot";

const localUserSchema = object({
  id: string(),
  email: string(),
});

export default async function getLocalUser(apiUrl = getLocalApiUrl(), headers?: HeadersInit): Promise<CogneeUser | null> {
  const response = await global.fetch(`${apiUrl}/api/v1/users/me`, {
    credentials: "include",
    headers,
    cache: "no-store",
  });

  if (!response.ok) return null;

  const { id, email } = parse(localUserSchema, await response.json());

  return {
    id,
    name: email.split("@")[0] || email,
    email,
    picture: "",
  };
}
