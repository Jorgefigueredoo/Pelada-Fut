/**
 * Local dev convenience only: creates (or promotes) one approved admin account so
 * the app is never empty right after `npm run db:start` / `npm run db:reset`.
 *
 * This is not part of the running app and is never deployed. In production the
 * first admin is still created by hand, on purpose — see SETUP.md. Refuses to run
 * against anything that is not the local Supabase stack unless explicitly forced.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

const email = process.env.SEED_ADMIN_EMAIL ?? "admin@pelada.test";
const password = process.env.SEED_ADMIN_PASSWORD ?? "admin12345";
const fullName = process.env.SEED_ADMIN_FULL_NAME ?? "Administrador";
const nickname = process.env.SEED_ADMIN_NICKNAME ?? "Admin";

async function main() {
  if (!url || !secretKey) {
    console.error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. Rode `npm run db:start` primeiro.",
    );
    process.exit(1);
  }

  const isLocal = /127\.0\.0\.1|localhost/.test(url);
  if (!isLocal && process.env.SEED_ADMIN_ALLOW_REMOTE !== "true") {
    console.error(
      "Recusando: esta URL não parece ser o Supabase local. " +
        "Este seed é só para desenvolvimento. Em produção, promova o primeiro " +
        "admin pelo SQL documentado em SETUP.md.",
    );
    process.exit(1);
  }

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, nickname },
  });

  let userId = created?.user?.id;

  if (createError) {
    // Already exists from a previous run: look it up instead of failing the seed.
    const { data: existing, error: lookupError } = await admin
      .from("player_admin_data")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();

    if (lookupError || !existing) {
      console.error(`Não foi possível criar nem encontrar ${email}:`, createError.message);
      process.exit(1);
    }
    userId = existing.user_id;
  }

  if (!userId) {
    console.error("Usuário criado sem id. Algo inesperado aconteceu.");
    process.exit(1);
  }

  const { error: promoteError } = await admin
    .from("profiles")
    .update({ role: "admin", status: "approved", full_name: fullName, nickname })
    .eq("id", userId);

  if (promoteError) {
    console.error("Não foi possível promover a admin:", promoteError.message);
    process.exit(1);
  }

  console.log("Admin de desenvolvimento pronto:");
  console.log(`  e-mail: ${email}`);
  console.log(`  senha:  ${password}`);
}

main();
