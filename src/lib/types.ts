export type UserRole = "player" | "admin";
export type UserStatus = "pending" | "approved" | "rejected" | "blocked";

export type Profile = {
  id: string;
  full_name: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
};

/** Admin-only view of a player. Email and stars never reach a player client. */
export type AdminPlayer = Profile & {
  created_at: string;
  email: string | null;
  stars: number | null;
};

export type AdminPlayerPage = {
  items: AdminPlayer[];
  total: number;
  page: number;
  per_page: number;
};

export const PLAYERS_PER_PAGE = 10;

export type GameStatus = "scheduled" | "canceled";
export type SignupStatus = "confirmed" | "waitlist";

export type Game = {
  id: string;
  starts_at: string;
  location: string;
  slots: number;
  list_opens_at: string;
  status: GameStatus;
  /** Decided by the database clock, never by the phone. */
  is_open: boolean;
};

export type ListEntry = {
  seq: number;
  user_id: string;
  nickname: string;
  first_name: string;
  status: SignupStatus;
  joined_at: string;
  added_by_admin: boolean;
  position: number;
};

export type MySignup = {
  status: SignupStatus;
  position: number;
  joined_at: string;
  added_by_admin: boolean;
  promoted_at: string | null;
  demoted_at: string | null;
};

/** Everything a client needs for one pelada, including the server clock. */
export type GameState = {
  server_time: string;
  game: Game | null;
  entries: ListEntry[];
  my_signup: MySignup | null;
};

/** Home screen: every upcoming pelada, not just the nearest one. */
export type UpcomingGames = {
  server_time: string;
  games: GameState[];
};

export type AdminGame = {
  id: string;
  starts_at: string;
  location: string;
  slots: number;
  list_opens_at: string;
  status: GameStatus;
  confirmed_count: number;
  waitlist_count: number;
};

export type AppSettings = {
  default_location: string;
  default_slots: number;
  game_weekday: number;
  game_time: string;
  open_weekday: number;
  open_time: string;
  default_team_count: number;
};

/** Nicknames can repeat, so a repeated one is shown with the first name next to it. */
export function duplicatedNicknames(entries: ListEntry[]): Set<string> {
  const seen = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.nickname.toLocaleLowerCase("pt-BR");
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

export function entryLabel(entry: ListEntry, duplicates: Set<string>): string {
  const isDuplicate = duplicates.has(entry.nickname.toLocaleLowerCase("pt-BR"));
  return isDuplicate && entry.first_name && entry.first_name !== entry.nickname
    ? `${entry.nickname} (${entry.first_name})`
    : entry.nickname;
}

export type NotificationType =
  | "promoted"
  | "demoted"
  | "admin_added"
  | "admin_removed"
  | "approved"
  | "game_canceled"
  | "game_reopened"
  | "team_published";

export type AppNotification = {
  id: number;
  type: NotificationType;
  meta: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
  game: { id: string; starts_at: string; location: string } | null;
};

export type NotificationPage = {
  items: AppNotification[];
  unread_count: number;
};
