@AGENTS.md

# Pelada de Quarta

Lista de presença e sorteio de times de uma pelada semanal. 20 vagas, 100+ jogadores,
então a ordem da lista é o produto. UI em português do Brasil; código, tabelas,
funções e commits em inglês.

## Comandos

| | |
|---|---|
| `npm run dev` | app em http://localhost:3000 |
| `npm run db:start` | sobe o Supabase local (precisa de Docker) |
| `npm run db:status` | URL e chaves locais |
| `npm run db:reset` | recria o banco e reaplica todas as migrações |
| `npm run db:stop` | desliga o Supabase local |
| `npm test` | Vitest (unitários + integração contra o banco local) |
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
9. **O app nunca fica sem admin.** As funções recusam rebaixar ou bloquear o último.
10. **Schema só por migração** em `supabase/migrations`. Nada de alterar o banco pela
    interface do Studio. Testes que tocam o banco criam e limpam os próprios dados.

## Fora do escopo

Pagamento ou Pix, push, vaga de goleiro, convidado sem conta, estatística e chat. Não
implemente e não deixe estrutura preparada.

## Mensagens de erro

As funções do banco levantam códigos estáveis (`LAST_ADMIN`, `FORBIDDEN`,
`NOT_APPROVED`, ...). A tradução para português vive em `src/lib/errors.ts`, perto da UI.
