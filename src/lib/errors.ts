/**
 * Database functions raise stable machine codes so the SQL stays in English
 * and the Portuguese wording lives here, next to the UI.
 */
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "Sua sessão expirou. Entre de novo.",
  NOT_APPROVED: "Sua conta ainda não foi aprovada por um admin.",
  FORBIDDEN: "Você não tem permissão para fazer isso.",
  PLAYER_NOT_FOUND: "Jogador não encontrado.",
  LAST_ADMIN: "O app não pode ficar sem admin. Promova outra pessoa primeiro.",
  APPROVE_FIRST: "Aprove o jogador antes de torná-lo admin.",
  INVALID_NAME: "O nome precisa ter entre 2 e 80 caracteres.",
  INVALID_NICKNAME: "O apelido precisa ter entre 2 e 24 caracteres.",
  INVALID_STARS: "As estrelas vão de 1 a 5.",
  // Supabase Auth
  invalid_credentials: "E-mail ou senha incorretos.",
  user_already_exists: "Já existe uma conta com esse e-mail.",
  email_exists: "Já existe uma conta com esse e-mail.",
  weak_password: "A senha precisa ter pelo menos 8 caracteres.",
  same_password: "A nova senha precisa ser diferente da atual.",
  over_request_rate_limit: "Muitas tentativas. Espere um pouco e tente de novo.",
  validation_failed: "Confira os dados preenchidos.",
};

const FALLBACK = "Algo deu errado. Tente de novo.";

/** Turns a Supabase/Postgres error into a sentence a player can act on. */
export function friendlyError(error: unknown): string {
  if (!error) return FALLBACK;

  const candidate = error as { code?: string; message?: string };
  if (candidate.code && MESSAGES[candidate.code]) return MESSAGES[candidate.code];

  const message = (candidate.message ?? String(error)).trim();
  for (const code of Object.keys(MESSAGES)) {
    if (message === code || message.includes(code)) return MESSAGES[code];
  }
  if (/fetch failed|NetworkError|Failed to fetch|ECONNREFUSED/i.test(message)) {
    return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  }
  return message || FALLBACK;
}
