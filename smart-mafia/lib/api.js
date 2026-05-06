const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:3001';
const GAME_URL = process.env.NEXT_PUBLIC_GAME_URL || 'http://localhost:3002';
const AI_URL   = process.env.NEXT_PUBLIC_AI_URL   || 'http://localhost:3003';
const PLAYER_STORAGE_KEY = 'mafia_player';

function getStorage(type) {
  if (typeof window === 'undefined') return null;
  return type === 'session' ? window.sessionStorage : window.localStorage;
}

function readJson(storage, key) {
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function persistPlayerSession(player) {
  const session = getStorage('session');
  const local = getStorage('local');

  if (!session) return;

  session.setItem(PLAYER_STORAGE_KEY, JSON.stringify(player));
  if (player?.token) session.setItem('mafia_token', player.token);
  if (player?.userId) session.setItem('mafia_userId', player.userId);
  if (player?.name) session.setItem('mafia_displayName', player.name);

  local?.removeItem(PLAYER_STORAGE_KEY);
  local?.removeItem('mafia_token');
  local?.removeItem('mafia_userId');
  local?.removeItem('mafia_displayName');
}

export function loadPlayerSession() {
  const session = getStorage('session');
  const local = getStorage('local');

  const currentSession = readJson(session, PLAYER_STORAGE_KEY);
  if (currentSession?.token) return currentSession;

  const legacySession = readJson(local, PLAYER_STORAGE_KEY);
  if (legacySession?.token) {
    persistPlayerSession(legacySession);
    return legacySession;
  }

  return null;
}

export function clearPlayerSession() {
  const session = getStorage('session');
  const local = getStorage('local');

  session?.removeItem(PLAYER_STORAGE_KEY);
  session?.removeItem('mafia_token');
  session?.removeItem('mafia_userId');
  session?.removeItem('mafia_displayName');

  local?.removeItem(PLAYER_STORAGE_KEY);
  local?.removeItem('mafia_token');
  local?.removeItem('mafia_userId');
  local?.removeItem('mafia_displayName');
}

function getToken() {
  const session = getStorage('session');
  const local = getStorage('local');
  return session?.getItem('mafia_token') || local?.getItem('mafia_token') || null;
}

function extractErrorMessage(data, status) {
  if (!data) return `Error ${status}`;
  if (typeof data === 'string') return data;
  if (Array.isArray(data.message)) return data.message.join(', ');
  if (typeof data.message === 'string') return data.message;
  if (data.message && typeof data.message === 'object') {
    if (Array.isArray(data.message.message)) return data.message.message.join(', ');
    if (typeof data.message.message === 'string') return data.message.message;
    if (typeof data.message.error === 'string') return data.message.error;
  }
  if (typeof data.error === 'string') return data.error;
  return `Error ${status}`;
}

async function request(baseUrl, path, options = {}) {
  const token = getToken();
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(extractErrorMessage(data, res.status));
  return data;
}

export async function registerGuest(displayName) {
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const username = `${displayName.replace(/\s+/g, '').substring(0, 12)}${rand}`;
  const email = `guest_${username}_${Date.now()}@mafia.local`;
  const password = `P${Date.now()}x!`;
  const data = await request(AUTH_URL, '/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
  const session = getStorage('session');
  const local = getStorage('local');
  session?.setItem('mafia_token', data.accessToken);
  session?.setItem('mafia_userId', data.userId);
  session?.setItem('mafia_displayName', displayName.trim());
  local?.removeItem('mafia_token');
  local?.removeItem('mafia_userId');
  local?.removeItem('mafia_displayName');
  return { ...data, displayName: displayName.trim() };
}

export async function createRoom(maxPlayers = 15) {
  return request(GAME_URL, '/rooms', { method: 'POST', body: JSON.stringify({ maxPlayers }) });
}

export async function startRoom(roomId) {
  const session = await request(GAME_URL, `/rooms/${roomId}/start`, { method: 'PATCH' });
  if (!session.gameState) {
    // Server returned room but no game state — try to fetch/init it. Surface errors clearly.
    try {
      const gameState = await request(GAME_URL, `/game/${roomId}/state`);
      return { ...session, gameState };
    } catch {
      const gameState = await request(GAME_URL, `/game/${roomId}/init`, { method: 'POST' });
      return { ...session, gameState };
    }
  }
  return session;
}

export async function joinRoomByCode(roomCode) {
  return request(GAME_URL, '/players/join', { method: 'POST', body: JSON.stringify({ roomCode }) });
}

export async function getPlayersInRoom(roomId) {
  return request(GAME_URL, `/players/room/${roomId}`);
}

export async function getGameState(roomId) {
  return request(GAME_URL, `/game/${roomId}/state`);
}

export async function advancePhase(roomId) {
  return request(GAME_URL, `/game/${roomId}/advance`, { method: 'POST' });
}

export async function resolveVotes(roomId) {
  return request(GAME_URL, `/game/${roomId}/resolve-votes`, { method: 'POST' });
}

export async function castVote(roomId, targetId) {
  return request(GAME_URL, `/game/${roomId}/vote`, {
    method: 'POST', body: JSON.stringify({ targetId }),
  });
}

export async function submitNightAction(roomId, action, targetId) {
  return request(GAME_URL, `/game/${roomId}/night-action`, {
    method: 'POST', body: JSON.stringify({ action, targetId }),
  });
}

export async function chatWithAI(message, history = [], roomId) {
  return request(AI_URL, '/ai/chat', {
    method: 'POST', body: JSON.stringify({ message, history, roomId }),
  });
}
