export interface GameInitPayload {
  /** Resolved Colyseus room id. Omitted when creating a fresh room
   * (standalone solo/multiplayer); present when joining/spectating/reconnecting
   * a specific room by id. */
  roomId?: string;
  serverUrl: string;
  userId: string;
  playerName: string;
  isAdmin: boolean;
  soloMode: boolean;
  devMode?: boolean;
  gameToken?: string;
  levelSpec?: string;
  seed?: number;
  bgMusicUrl?: string;
  spectator?: boolean;
  challengeName?: string;
  /** polarwinds_sessions.id returned by join-matchmaking. Forwarded to the
   * Colyseus server so transcripts and other per-session artifacts key off
   * the DB row UUID, not the transient Colyseus room id. */
  sessionId?: string;
}

const RETURN_URL_KEY = "pw_return_url";

export function saveReturnUrl(url: string): void {
  try {
    sessionStorage.setItem(RETURN_URL_KEY, url);
  } catch {
    // noop
  }
}

export function loadReturnUrl(): string | null {
  try {
    return sessionStorage.getItem(RETURN_URL_KEY);
  } catch {
    return null;
  }
}

/** Clear any stale session data left by previous versions */
export function clearSession(): void {
  try {
    sessionStorage.removeItem("pw_active_session");
    sessionStorage.removeItem(RETURN_URL_KEY);
  } catch {
    // noop
  }
}
