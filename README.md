# Pelada de Quarta

Lista de presença e sorteio de times da pelada semanal. 20 vagas para um grupo de 100+
pessoas, então quem decide a ordem é o servidor, não o WhatsApp.

- **Stack**: Next.js (App Router) na Vercel, Supabase (Postgres, Auth, Realtime),
  Tailwind CSS e shadcn/ui, PWA instalável.
- **Setup e deploy**: [SETUP.md](SETUP.md)
- **Regras do projeto e comandos**: [CLAUDE.md](CLAUDE.md)

Toda escrita na lista passa por funções do Postgres que travam a pelada e resolvem a
ordem dentro de uma transação, para que dezenas de pessoas tocando no botão no mesmo
segundo nunca gerem uma 21ª vaga.
