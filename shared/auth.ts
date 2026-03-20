export const authRoles = ["viewer", "editor", "admin"] as const;

export type AuthRole = (typeof authRoles)[number];

export interface SessionUser {
  username: string;
  name: string;
  role: AuthRole;
}

export interface SessionState {
  enabled: boolean;
  authenticated: boolean;
  mode: "open" | "demo" | "configured";
  user: SessionUser | null;
}
