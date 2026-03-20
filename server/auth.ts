import type { Express, Request, RequestHandler } from "express";
import session from "express-session";
import MemoryStoreFactory from "memorystore";
import type { AuthRole, SessionState, SessionUser } from "@shared/auth";

type SessionMode = "open" | "demo" | "configured";

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

const MemoryStore = MemoryStoreFactory(session);

const roleRank: Record<AuthRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

function parseMode(): SessionMode {
  const value = process.env.AUTH_MODE?.toLowerCase();
  if (value === "demo" || value === "configured" || value === "open") {
    return value;
  }
  return "demo";
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseCookieSecureMode(): boolean | "auto" {
  const value = process.env.COOKIE_SECURE?.toLowerCase();

  if (value === "auto") {
    return "auto";
  }

  if (value !== undefined) {
    return isTruthy(value);
  }

  return process.env.NODE_ENV === "production" ? "auto" : false;
}

function demoUser(): SessionUser {
  return {
    username: process.env.DEMO_AUTH_USERNAME || "demo-admin",
    name: process.env.DEMO_AUTH_NAME || "Demo Admin",
    role: (process.env.DEMO_AUTH_ROLE as AuthRole) || "admin",
  };
}

function configuredUser(): SessionUser {
  return {
    username: process.env.AUTH_USERNAME || "operator",
    name: process.env.AUTH_NAME || process.env.AUTH_USERNAME || "Configured User",
    role: (process.env.AUTH_ROLE as AuthRole) || "admin",
  };
}

function credentialsMatch(username: string, password: string): SessionUser | null {
  const mode = parseMode();

  if (mode === "demo") {
    const user = demoUser();
    const expectedPassword = process.env.DEMO_AUTH_PASSWORD || "demo-admin";
    if (username === user.username && password === expectedPassword) {
      return user;
    }
    return null;
  }

  if (mode === "configured") {
    const expectedUsername = process.env.AUTH_USERNAME;
    const expectedPassword = process.env.AUTH_PASSWORD;
    if (!expectedUsername || !expectedPassword) {
      return null;
    }
    if (username === expectedUsername && password === expectedPassword) {
      return configuredUser();
    }
  }

  return null;
}

export function setupAuth(app: Express) {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "mavyclaw-dev-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: parseCookieSecureMode(),
        maxAge: 1000 * 60 * 60 * 12,
      },
      store: new MemoryStore({ checkPeriod: 1000 * 60 * 60 * 24 }),
    }),
  );
}

export function getSessionState(req: Request): SessionState {
  const mode = parseMode();

  if (mode === "open") {
    return {
      enabled: false,
      authenticated: true,
      mode,
      user: {
        username: "open-access",
        name: "Open Access",
        role: "admin",
      },
    };
  }

  const user = req.session?.user ?? null;

  return {
    enabled: true,
    authenticated: Boolean(user),
    mode,
    user,
  };
}

export function loginHandler(): RequestHandler {
  return (req, res) => {
    const { username, password } = req.body ?? {};

    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = credentialsMatch(username, password);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.user = user;
    return res.json({ status: "ok", user });
  };
}

export function logoutHandler(): RequestHandler {
  return (req, res) => {
    req.session.destroy(() => {
      res.json({ status: "ok" });
    });
  };
}

export function requireRole(minRole: AuthRole): RequestHandler {
  return (req, res, next) => {
    const sessionState = getSessionState(req);

    if (!sessionState.authenticated || !sessionState.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (roleRank[sessionState.user.role] < roleRank[minRole]) {
      return res.status(403).json({ error: `Requires ${minRole} role or higher` });
    }

    return next();
  };
}
