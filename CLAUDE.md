@AGENTS.md

# Pelada de Quarta

Lista de presença e sorteio de times de uma pelada semanal. 20 vagas, 100+ jogadores,
então a ordem da lista é o produto. UI em português do Brasil; código, tabelas,
funções e commits em inglês.

## Comandos

| | |
|---|---|
| `npm run dev` | app em http://localhost:3000 |
| `npm run db:start` | sobe o Supabase local (precisa de Docker) e seeda o admin de dev |
| `npm run db:status` | URL e chaves locais |
| `npm run db:reset` | recria o banco, reaplica as migrações e seeda o admin de dev |
| `npm run db:seed` | cria/reaprova o admin de dev (`admin@pelada.test` / `admin12345`) |
| `npm run db:stop` | desliga o Supabase local |
| `npm test` | Vitest (unitários + integração contra o banco local) |
| `npm run e2e` | Playwright (fluxos no navegador; sobe o dev server se preciso) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | build de produção |

Portão de cada fase: `npm test`, `npm run lint`, `npm run typecheck` e `npm run build`
passando. O banco local precisa estar de pé para os testes.

## Regras que não podem ser quebradas

1. **Escrita na lista só por função do banco.** Confirmar, desistir, adicionar, remover
   e mudar vagas passam por funções `security definer` que travam a linha da pelada
   (`select ... for update`) e fazem tudo numa transação. Nenhuma tabela de domínio tem
   policy de `insert`, `update` ou `delete` para cliente. Se você está escrevendo
   `.from("...").insert(...)` num componente, está errado.
2. **Estrelas nunca chegam ao cliente de um jogador.** Elas vivem em
   `player_admin_data`, com policy só de admin, e não voltam em nenhuma resposta a
   jogador comum — nem as próprias. O mesmo vale para e-mail.
3. **Nada depende de cron nem de e-mail.** A lista "abre" porque o banco compara o
   próprio relógio com `list_opens_at` em cada requisição. O cron diário só faz uma
   consulta leve para o projeto Supabase Free não pausar. Recuperação de senha é um
   link que o admin gera e manda no WhatsApp.
4. **O relógio é o do banco, nunca o do celular.** A contagem regressiva é visual e se
   calcula pela diferença para o `server_time` que a última resposta trouxe. `joined_at`
   usa `clock_timestamp()` lido depois do lock, porque `now()` é o início da transação.
5. **Papel e status se checam no servidor.** Toda Server Action e rota de admin chama
   `requireAdminProfile()` e a função do banco checa `auth.uid()`, status e papel outra
   vez. Esconder botão não conta. Server Actions não são cobertas pelo matcher do
   `proxy.ts`, então a checagem dentro da action é obrigatória.
6. **Nenhuma página autenticada é cacheada.** Rotas autenticadas são `force-dynamic` e
   o `proxy.ts` manda `Cache-Control: no-store`. O service worker só guarda estáticos e
   a página offline: lista velha em cache seria o pior bug possível deste app.
7. **A chave secreta só existe no servidor.** `SUPABASE_SECRET_KEY` nunca em
   `NEXT_PUBLIC_`. Chaves novas (`sb_publishable_` / `sb_secret_`), não `anon`/`service_role`.
8. **Datas em `timestamptz`, exibidas sempre com o fuso explícito** (`TIME_ZONE` em
   `src/lib/constants.ts`). A Vercel roda em UTC; formatar sem fuso mostra hora errada.
9. **O app nunca fica sem admin.** As funções recusam rebaixar, bloquear ou excluir o
   último (`admin_set_user_role`, `admin_set_user_status`,
   `admin_prepare_player_deletion`).
10. **Schema só por migração** em `supabase/migrations`. Nada de alterar o banco pela
    interface do Studio. Testes que tocam o banco criam e limpam os próprios dados.
11. **Excluir conta nunca é um delete direto em `auth.users`.** O fluxo é
    `admin_prepare_player_deletion` (RPC, tira o jogador de toda lista ativa e
    promove a espera) seguido de `auth.admin.deleteUser` (chave secreta, só no
    servidor) — essa ordem existe porque só a Admin API limpa sessões e refresh
    tokens corretamente. `profiles`/`player_admin_data` saem em cascata;
    `signup_events` preserva o histórico com o ator nulo.
12. **Um JWT pode sobreviver à própria linha em `profiles`.** Um `supabase db
    reset` local apaga `auth.users` mas o navegador pode continuar com um token
    cujo assinatura ainda bate; sem cuidado, isso vira
    `ERR_TOO_MANY_REDIRECTS` (proxy manda para `/`, o layout não acha o perfil e
    manda de volta para `/entrar`, para sempre). Por isso `src/proxy.ts`, ao ver
    uma sessão em `/entrar`/`/criar-conta`, confirma que o perfil existe antes de
    redirecionar — se não existir, desloga em vez de redirecionar. Teste de
    regressão (fora da suíte normal, apaga o banco de verdade):
    `npx playwright test e2e/real-reset-repro.manual.spec.ts`.
13. **Notificações são só dentro do app, nunca push.** `notifications` é
    populada por `_notify`, chamada de dentro das próprias funções de escrita
    (`_reconcile_game`, `admin_add_player`, `admin_remove_player`,
    `admin_set_game_status`, `admin_set_user_status`) — nunca inserida pelo
    cliente. O sino (`src/components/layout/notification-bell.tsx`) faz
    polling a cada 30s enquanto a aba está visível; sem Realtime, sem Service
    Worker, sem depender de nada acontecer com o app fechado.

## Fora do escopo

Pagamento ou Pix, push, vaga de goleiro, convidado sem conta, estatística e chat. Não
implemente e não deixe estrutura preparada.

## Mensagens de erro

As funções do banco levantam códigos estáveis (`LAST_ADMIN`, `FORBIDDEN`,
`NOT_APPROVED`, ...). A tradução para português vive em `src/lib/errors.ts`, perto da UI.
