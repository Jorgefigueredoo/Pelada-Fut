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
