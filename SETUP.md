# Setup

Tudo que é manual, em ordem. A parte 1 é o que você precisa para rodar na sua máquina;
as partes 2 e 3 são para colocar no ar.

---

## 1. Rodar local

### Requisitos

- Node 20 ou mais novo (aqui está rodando no 24)
- Docker Desktop aberto (o Supabase local roda em contêineres)

### Passos

```bash
npm install
npm run db:start      # sobe Postgres, Auth, Realtime e Studio; a primeira vez baixa imagens
npm run dev           # http://localhost:3000
```

O `npm run db:start` aplica todas as migrações de `supabase/migrations` automaticamente.
Para recomeçar do zero com o banco limpo:

```bash
npm run db:reset
```

### Variáveis de ambiente

O `.env.local` já vem preenchido com as chaves do Supabase local, que são fixas e
públicas por natureza. Se precisar vê-las de novo:

```bash
npm run db:status
```

Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY`. As chaves `anon` e
`service_role` que aparecem na saída são as antigas e não são usadas pelo app.

### Endereços úteis no local

| | |
|---|---|
| App | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |
| API | http://127.0.0.1:54321 |
| Caixa de e-mail de teste | http://127.0.0.1:54324 |

### Criar o primeiro admin

Crie sua conta normalmente em http://localhost:3000/criar-conta. Ela nasce pendente.
Depois rode este SQL para se promover (Studio → SQL Editor, ou `npx supabase db ...`):

```sql
update public.profiles
   set role = 'admin',
       status = 'approved'
 where id = (select id from auth.users where email = 'SEU-EMAIL-AQUI');
```

A partir daí você aprova os outros e promove novos admins pela própria interface.
Este SQL é o único jeito de criar o primeiro admin, de propósito: o app nunca cria um
admin sozinho, e as funções do banco não deixam o último admin ser rebaixado ou
bloqueado.

### Rodar os testes

```bash
npm test          # Vitest: unitários + integração contra o banco local
npm run e2e       # Playwright: fluxo no navegador (sobe o dev server se preciso)
npm run lint
npm run typecheck
npm run build
```

Os testes de banco precisam do `npm run db:start` rodando. Eles criam os próprios
usuários e apagam no fim.

---

## 2. Criar o projeto no Supabase (nuvem)

> Esta parte é só sua: eu não tenho acesso à sua conta.

1. Em https://supabase.com/dashboard, **New project**. Plano **Free**. Escolha a região
   mais perto do Brasil (`South America (São Paulo)`).
2. Guarde a senha do banco que ele pede — você vai precisar dela para aplicar as
   migrações.
3. **Desativar a confirmação de e-mail** (obrigatório, porque o projeto não tem SMTP):
   Authentication → Sign In / Providers → Email → desligue **Confirm email** → Save.
   O filtro de entrada do app é a aprovação do admin, não o e-mail.
4. Authentication → Sign In / Providers → Email: deixe **Enable email provider** ligado
   e **Minimum password length** em 8.
5. Pegue as chaves em Project Settings → API keys:
   - `Publishable key` (`sb_publishable_...`) → vai para `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `Secret key` (`sb_secret_...`) → vai para `SUPABASE_SECRET_KEY`, só no servidor
   - E a `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`

   Não use `anon` nem `service_role`: o Supabase está descontinuando as duas até o fim
   de 2026.

### Aplicar as migrações no projeto da nuvem

```bash
npx supabase login
npx supabase link --project-ref SEU-PROJECT-REF
npx supabase db push
```

O `project-ref` é o código que aparece na URL do painel. O `db push` aplica, em ordem,
tudo que está em `supabase/migrations`. **Nunca altere o schema pela interface do
Studio**: o banco só muda por migração versionada, senão a nuvem e o local saem de sincronia.

Depois do push, crie sua conta no app em produção e rode o mesmo SQL do primeiro admin,
agora no SQL Editor do projeto da nuvem.

---

## 3. Deploy na Vercel

> Também só sua. As CLIs `vercel` e `gh` não estão instaladas nesta máquina; se você
> instalar e logar (`npm i -g vercel`, `winget install GitHub.cli`), eu faço esses passos.

1. Suba o repositório para o GitHub (repositório **privado**, por causa das chaves nos
   seus commits locais — ainda que o `.env.local` esteja no `.gitignore`).
2. Em https://vercel.com/new, importe o repositório. Plano **Hobby**. O framework é
   detectado como Next.js; não mude nada no build.
3. Em Settings → Environment Variables, para **Production** e **Preview**:

   | Nome | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | a Project URL do Supabase |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_...` |
   | `CRON_SECRET` | uma string longa e aleatória |

   `SUPABASE_SECRET_KEY` e `CRON_SECRET` nunca com prefixo `NEXT_PUBLIC_`.
4. Deploy.
5. Volte no Supabase → Authentication → URL Configuration e ponha a URL da Vercel em
   **Site URL** e em **Redirect URLs**.

### O cron que mantém o projeto acordado

Um projeto Supabase Free pausa depois de 7 dias sem atividade, e voltar de uma pausa é
manual. Por isso existe um cron diário na Vercel que faz uma consulta leve no banco.

No Hobby a Vercel só aceita cron **uma vez por dia** e dispara em qualquer minuto da
hora marcada (±59 min). Isso não é problema porque nada no app depende de cron: a lista
abre porque o banco compara o próprio relógio com o horário de abertura em cada
requisição.

Depois do deploy, confira em Vercel → Settings → Cron Jobs que o job aparece, e teste
uma vez na mão:

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" https://SEU-APP.vercel.app/api/cron/keepalive
```

Se o projeto Supabase já estiver pausado, o cron não acorda ele — só evita que pause.
Despausar é no painel do Supabase.

---

## 4. Instalar o app no celular

- **Android (Chrome)**: abra a URL e toque em **Instalar app**.
- **iPhone (Safari)**: abra a URL, toque em Compartilhar → **Adicionar à Tela de
  Início**. O iOS não tem prompt de instalação, por isso a instrução aparece escrita.
