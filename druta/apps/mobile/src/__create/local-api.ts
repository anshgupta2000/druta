const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type AuthUser = {
  id: string;
  email?: string;
  name?: string;
};

type AuthPayload = {
  jwt?: string;
  user?: AuthUser;
} | null;

type LocalUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  image: string | null;
  total_distance_km: number;
  total_runs: number;
  territories_owned: number;
  wins: number;
  losses: number;
  avatar_color: string;
  avatar_url: string | null;
  avatar_code: string | null;
  avatar_thumbnail_url: string | null;
  outfit_loadout: Record<string, unknown>;
};

type LocalRun = {
  id: number;
  user_id: string;
  distance_km: number;
  duration_seconds: number;
  avg_pace: number | null;
  territories_claimed: number;
  started_at: string;
  ended_at: string;
  created_at: string;
};

type LocalFriend = {
  id: number;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
};

type LocalRace = {
  id: number;
  challenger_id: string;
  opponent_id: string;
  race_type: string;
  target_value: number;
  status: 'pending' | 'active' | 'declined' | 'finished';
  challenger_distance: number;
  opponent_distance: number;
  winner_id: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

type LocalTerritory = {
  id: number;
  grid_lat: number;
  grid_lng: number;
  owner_id: string;
  owner_username: string;
  strength: number;
  last_run_at: string;
};

const state: {
  users: Map<string, LocalUser>;
  runs: LocalRun[];
  friends: LocalFriend[];
  races: LocalRace[];
  territories: LocalTerritory[];
  ids: { run: number; friend: number; race: number; territory: number };
} = {
  users: new Map(),
  runs: [],
  friends: [],
  races: [],
  territories: [],
  ids: { run: 1, friend: 1, race: 1, territory: 1 },
};

const colorPalette = ['#3B82F6', '#22C55E', '#F97316', '#A855F7', '#14B8A6'];

const colorForUser = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return colorPalette[Math.abs(hash) % colorPalette.length];
};

const getBody = (init?: RequestInit) => {
  if (!init?.body || typeof init.body !== 'string') {
    return {};
  }
  try {
    return JSON.parse(init.body);
  } catch {
    return {};
  }
};

const requireUser = (auth: AuthPayload) => {
  const user = auth?.user;
  if (!user?.id) {
    return null;
  }
  if (!state.users.has(user.id)) {
    const usernameBase =
      user.email?.split('@')?.[0] || user.name?.replace(/\s+/g, '').toLowerCase() || 'runner';
    state.users.set(user.id, {
      id: user.id,
      username: usernameBase.slice(0, 24),
      name: user.name || usernameBase,
      email: user.email || null,
      image: null,
      total_distance_km: 0,
      total_runs: 0,
      territories_owned: 0,
      wins: 0,
      losses: 0,
      avatar_color: colorForUser(user.id),
      avatar_url: null,
      avatar_code: null,
      avatar_thumbnail_url: null,
      outfit_loadout: {},
    });
  }
  return state.users.get(user.id)!;
};

const withRaceUsers = (race: LocalRace) => {
  const challenger = state.users.get(race.challenger_id);
  const opponent = state.users.get(race.opponent_id);
  return {
    ...race,
    challenger_username: challenger?.username || challenger?.name || 'Runner',
    challenger_color: challenger?.avatar_color || '#3B82F6',
    opponent_username: opponent?.username || opponent?.name || 'Runner',
    opponent_color: opponent?.avatar_color || '#22C55E',
  };
};

const listLeaderboard = (sortBy: string) => {
  const users = Array.from(state.users.values());
  if (sortBy === 'distance') {
    users.sort((a, b) => b.total_distance_km - a.total_distance_km);
  } else if (sortBy === 'wins') {
    users.sort((a, b) => b.wins - a.wins);
  } else {
    users.sort((a, b) => b.territories_owned - a.territories_owned);
  }
  return users.slice(0, 50);
};

const handleProfile = (method: string, auth: AuthPayload, init?: RequestInit) => {
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (method === 'GET') return jsonResponse({ user });

  if (method === 'PUT') {
    const body = getBody(init);
    const editableFields = [
      'username',
      'avatar_color',
      'avatar_url',
      'avatar_code',
      'avatar_thumbnail_url',
      'outfit_loadout',
    ] as const;

    for (const key of editableFields) {
      if (body[key] !== undefined) {
        // @ts-ignore index signature
        user[key] = body[key];
      }
    }
    state.users.set(user.id, user);
    return jsonResponse({ user });
  }

  return jsonResponse({ error: 'Method Not Allowed' }, 405);
};

const handleRuns = (method: string, auth: AuthPayload, init?: RequestInit) => {
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (method === 'GET') {
    const runs = state.runs
      .filter((run) => run.user_id === user.id)
      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
      .slice(0, 50);
    return jsonResponse({ runs });
  }

  if (method === 'POST') {
    const body = getBody(init);
    const now = new Date().toISOString();
    const run: LocalRun = {
      id: state.ids.run++,
      user_id: user.id,
      distance_km: Number(body.distance_km || 0),
      duration_seconds: Number(body.duration_seconds || 0),
      avg_pace: body.avg_pace ? Number(body.avg_pace) : null,
      territories_claimed: Number(body.territories_claimed || 0),
      started_at: body.started_at || now,
      ended_at: now,
      created_at: now,
    };

    state.runs.push(run);
    user.total_distance_km += run.distance_km;
    user.total_runs += 1;
    state.users.set(user.id, user);

    return jsonResponse({ run });
  }

  return jsonResponse({ error: 'Method Not Allowed' }, 405);
};

const handleFriends = (method: string, auth: AuthPayload, init?: RequestInit) => {
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (method === 'GET') {
    const friends = state.friends
      .filter(
        (f) => (f.user_id === user.id || f.friend_id === user.id) && f.status === 'accepted'
      )
      .map((f) => {
        const friendUserId = f.user_id === user.id ? f.friend_id : f.user_id;
        const friend = state.users.get(friendUserId);
        return {
          ...f,
          friend_user_id: friendUserId,
          username: friend?.username || 'runner',
          name: friend?.name || 'Runner',
          image: friend?.image || null,
          total_distance_km: friend?.total_distance_km || 0,
          total_runs: friend?.total_runs || 0,
          territories_owned: friend?.territories_owned || 0,
          wins: friend?.wins || 0,
          avatar_color: friend?.avatar_color || '#3B82F6',
        };
      });

    const pending = state.friends
      .filter((f) => f.friend_id === user.id && f.status === 'pending')
      .map((f) => {
        const requester = state.users.get(f.user_id);
        return {
          id: f.id,
          requester_id: f.user_id,
          created_at: f.created_at,
          username: requester?.username || 'runner',
          name: requester?.name || 'Runner',
          image: requester?.image || null,
          avatar_color: requester?.avatar_color || '#3B82F6',
        };
      });

    return jsonResponse({ friends, pending });
  }

  if (method === 'POST') {
    const body = getBody(init);

    if (body.action === 'accept' && body.friend_request_id) {
      const target = state.friends.find(
        (f) => f.id === Number(body.friend_request_id) && f.friend_id === user.id
      );
      if (!target) return jsonResponse({ error: 'Friend request not found' }, 404);
      target.status = 'accepted';
      return jsonResponse({ friend: target });
    }

    if (body.action === 'decline' && body.friend_request_id) {
      const idx = state.friends.findIndex(
        (f) => f.id === Number(body.friend_request_id) && f.friend_id === user.id
      );
      if (idx >= 0) state.friends.splice(idx, 1);
      return jsonResponse({ success: true });
    }

    if (typeof body.friend_username === 'string' && body.friend_username.trim()) {
      const friend = Array.from(state.users.values()).find(
        (u) => u.username === body.friend_username.trim()
      );
      if (!friend) return jsonResponse({ error: 'User not found' }, 404);
      if (friend.id === user.id) return jsonResponse({ error: 'Cannot add yourself' }, 400);

      const exists = state.friends.some(
        (f) =>
          (f.user_id === user.id && f.friend_id === friend.id) ||
          (f.user_id === friend.id && f.friend_id === user.id)
      );
      if (exists) return jsonResponse({ error: 'Already friends or request pending' }, 400);

      const request = {
        id: state.ids.friend++,
        user_id: user.id,
        friend_id: friend.id,
        status: 'pending' as const,
        created_at: new Date().toISOString(),
      };
      state.friends.push(request);
      return jsonResponse({ friend: request });
    }
  }

  return jsonResponse({ error: 'Invalid request' }, 400);
};

const handleRaces = (method: string, auth: AuthPayload, url: URL, init?: RequestInit) => {
  const user = requireUser(auth);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (method === 'GET') {
    const status = url.searchParams.get('status');
    const races = state.races
      .filter((r) => r.challenger_id === user.id || r.opponent_id === user.id)
      .filter((r) => (status ? r.status === status : true))
      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
      .slice(0, 20)
      .map(withRaceUsers);
    return jsonResponse({ races });
  }

  const body = getBody(init);

  if (method === 'POST') {
    if (!body.opponent_id) {
      return jsonResponse({ error: 'opponent_id is required' }, 400);
    }
    requireUser({ user: { id: body.opponent_id } });
    const race: LocalRace = {
      id: state.ids.race++,
      challenger_id: user.id,
      opponent_id: String(body.opponent_id),
      race_type: body.race_type || 'distance',
      target_value: Number(body.target_value || 1),
      status: 'pending',
      challenger_distance: 0,
      opponent_distance: 0,
      winner_id: null,
      created_at: new Date().toISOString(),
      started_at: null,
      ended_at: null,
    };
    state.races.push(race);
    return jsonResponse({ race: withRaceUsers(race) });
  }

  if (method === 'PUT') {
    const raceId = Number(body.race_id);
    const race = state.races.find((r) => r.id === raceId);
    if (!race) return jsonResponse({ error: 'Race not found' }, 404);

    if (body.action === 'accept') {
      if (race.opponent_id !== user.id) {
        return jsonResponse({ error: 'Not your race to accept' }, 403);
      }
      race.status = 'active';
      race.started_at = new Date().toISOString();
      return jsonResponse({ race: withRaceUsers(race) });
    }

    if (body.action === 'decline') {
      race.status = 'declined';
      return jsonResponse({ race: withRaceUsers(race) });
    }

    if (body.action === 'update_distance') {
      const value = Number(body.distance || 0);
      if (race.challenger_id === user.id) {
        race.challenger_distance = value;
      } else if (race.opponent_id === user.id) {
        race.opponent_distance = value;
      }

      if (
        race.race_type === 'distance' &&
        (race.challenger_distance >= race.target_value ||
          race.opponent_distance >= race.target_value)
      ) {
        race.status = 'finished';
        race.ended_at = new Date().toISOString();
        race.winner_id =
          race.challenger_distance >= race.target_value ? race.challenger_id : race.opponent_id;
        const loserId = race.winner_id === race.challenger_id ? race.opponent_id : race.challenger_id;
        const winner = state.users.get(race.winner_id);
        const loser = state.users.get(loserId);
        if (winner) winner.wins += 1;
        if (loser) loser.losses += 1;
        return jsonResponse({ race: withRaceUsers(race), finished: true });
      }

      return jsonResponse({ race: withRaceUsers(race) });
    }
  }

  return jsonResponse({ error: 'Invalid request' }, 400);
};

const handleTerritories = (method: string, auth: AuthPayload, url: URL, init?: RequestInit) => {
  if (method === 'GET') {
    const minLat = Number(url.searchParams.get('minLat') || 0);
    const maxLat = Number(url.searchParams.get('maxLat') || 0);
    const minLng = Number(url.searchParams.get('minLng') || 0);
    const maxLng = Number(url.searchParams.get('maxLng') || 0);

    const territories = state.territories
      .filter(
        (t) =>
          t.grid_lat >= minLat &&
          t.grid_lat <= maxLat &&
          t.grid_lng >= minLng &&
          t.grid_lng <= maxLng
      )
      .slice(0, 500);
    return jsonResponse({ territories });
  }

  if (method === 'POST') {
    const user = requireUser(auth);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body = getBody(init);
    const gridLat = Number(body.grid_lat);
    const gridLng = Number(body.grid_lng);

    if (!Number.isFinite(gridLat) || !Number.isFinite(gridLng)) {
      return jsonResponse({ error: 'grid_lat and grid_lng required' }, 400);
    }

    let territory = state.territories.find((t) => t.grid_lat === gridLat && t.grid_lng === gridLng);
    let claimed = false;

    if (!territory) {
      territory = {
        id: state.ids.territory++,
        grid_lat: gridLat,
        grid_lng: gridLng,
        owner_id: user.id,
        owner_username: user.username || user.name || 'Runner',
        strength: 1,
        last_run_at: new Date().toISOString(),
      };
      state.territories.push(territory);
      claimed = true;
      user.territories_owned += 1;
    } else if (territory.owner_id === user.id) {
      territory.strength = Math.min((territory.strength || 1) + 1, 10);
      territory.last_run_at = new Date().toISOString();
    } else {
      territory.strength = (territory.strength || 1) - 1;
      territory.last_run_at = new Date().toISOString();
      if (territory.strength <= 0) {
        const previousOwner = state.users.get(territory.owner_id);
        if (previousOwner) {
          previousOwner.territories_owned = Math.max(0, previousOwner.territories_owned - 1);
        }
        territory.owner_id = user.id;
        territory.owner_username = user.username || user.name || 'Runner';
        territory.strength = 1;
        user.territories_owned += 1;
        claimed = true;
      }
    }

    return jsonResponse({ territory, claimed });
  }

  return jsonResponse({ error: 'Method Not Allowed' }, 405);
};

export const shouldUseLocalApiFallback = () => {
  // Local API fallback must be an explicit opt-in. We do not silently switch
  // to in-memory state for QA/production-style environments.
  return process.env.EXPO_PUBLIC_FORCE_LOCAL_API === 'true';
};

export const handleLocalApiRequest = async ({
  url,
  init,
  auth,
}: {
  url: string;
  init?: RequestInit;
  auth: AuthPayload;
}): Promise<Response | null> => {
  if (!url) return null;

  const parsed = new URL(url, 'http://localhost');
  if (!parsed.pathname.startsWith('/api/')) {
    return null;
  }

  const method = (init?.method || 'GET').toUpperCase();
  const path = parsed.pathname;

  if (path === '/api/profile') return handleProfile(method, auth, init);
  if (path === '/api/runs') return handleRuns(method, auth, init);
  if (path === '/api/friends') return handleFriends(method, auth, init);
  if (path === '/api/races') return handleRaces(method, auth, parsed, init);
  if (path === '/api/territories') return handleTerritories(method, auth, parsed, init);
  if (path === '/api/leaderboard') {
    const sortBy = parsed.searchParams.get('sort') || 'territories';
    return jsonResponse({ leaderboard: listLeaderboard(sortBy) });
  }
  if (path === '/api/auth/token') {
    const user = requireUser(auth);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
    return jsonResponse({
      jwt: auth?.jwt || `local-dev-token:${user.id}`,
      user: { id: user.id, email: user.email, name: user.name },
    });
  }
  if (path === '/api/auth/expo-web-success') {
    const user = requireUser(auth);
    if (!user) {
      return new Response(
        '<html><body><script>window.parent.postMessage({ type: "AUTH_ERROR", error: "Unauthorized" }, "*");</script></body></html>',
        { status: 401, headers: { 'Content-Type': 'text/html' } }
      );
    }
    const message = JSON.stringify({
      type: 'AUTH_SUCCESS',
      jwt: auth?.jwt || `local-dev-token:${user.id}`,
      user: { id: user.id, email: user.email, name: user.name },
    });
    return new Response(
      `<html><body><script>window.parent.postMessage(${message}, "*");</script></body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  return jsonResponse({ error: 'Not Found' }, 404);
};
