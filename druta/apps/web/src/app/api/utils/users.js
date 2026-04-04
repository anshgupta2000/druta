import sql from "@/app/api/utils/sql";

const DEFAULT_COLORS = ["#3B82F6", "#22C55E", "#F97316", "#A855F7", "#14B8A6"];

const toSafeString = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toSlug = (value) => {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const hashString = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const colorForUserId = (id) => {
  const seed = String(id || "");
  const hash = hashString(seed);
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
};

const buildDefaultUsername = ({ id, email, name }) => {
  const idRaw = String(id || "");
  const idSuffix = toSlug(idRaw).replace(/-/g, "") || hashString(idRaw).toString(36);
  const emailPrefix = toSlug(email?.split("@")?.[0]);
  const namePrefix = toSlug(name);
  const prefixSeed = emailPrefix || namePrefix || "runner";
  const maxPrefixLength = Math.max(3, 64 - idSuffix.length - 1);
  const prefix = prefixSeed.slice(0, maxPrefixLength);
  return `${prefix}-${idSuffix}`.slice(0, 64);
};

export const normalizeSessionUser = (user) => {
  const id = toSafeString(user?.id);
  if (!id) {
    return null;
  }

  return {
    id,
    email: toSafeString(user?.email)?.toLowerCase() || null,
    name: toSafeString(user?.name) || null,
    image: toSafeString(user?.image) || null,
  };
};

export async function ensureAuthUser(user) {
  const normalized = normalizeSessionUser(user);
  if (!normalized) {
    return null;
  }

  const defaultUsername = buildDefaultUsername(normalized);
  const avatarColor = colorForUserId(normalized.id);

  const rows = await sql`
    INSERT INTO auth_users (
      id, name, email, image, username, avatar_color, outfit_loadout
    )
    VALUES (
      ${normalized.id},
      ${normalized.name},
      ${normalized.email},
      ${normalized.image},
      ${defaultUsername},
      ${avatarColor},
      ${JSON.stringify({})}::jsonb
    )
    ON CONFLICT (id) DO UPDATE
      SET name = COALESCE(EXCLUDED.name, auth_users.name),
          email = COALESCE(EXCLUDED.email, auth_users.email),
          image = COALESCE(EXCLUDED.image, auth_users.image),
          username = COALESCE(auth_users.username, EXCLUDED.username),
          updated_at = NOW()
    RETURNING id, name, email, image, username, total_distance_km, total_runs, territories_owned, wins, losses, avatar_color, avatar_url, avatar_code, avatar_thumbnail_url, outfit_loadout
  `;

  return rows?.[0] || null;
}
