# Painel de Redes — Traveleiros (privado)

Painel **privado** das redes sociais do Traveleiros (Instagram **@traveleiros** + Página do Facebook),
construído a partir do painel do Pellizzari e estendido para as duas redes. Acesso por **senha** do grupo.

## Arquitetura

```
GitHub Pages (Next.js estático, "casca")
   │  POST /rest/v1/rpc/social_feed {p_conta, p_key}   ← chave publicável + senha
   ▼
Supabase "Hey Ninja" (zgpolatyyqxhdwborkbh)
   ├─ tabelas social_* (RLS fechado, sem acesso direto pela chave pública)
   ├─ social_feed()  → JSON {conta, conexao, instagram, facebook, plano}
   ├─ Edge Function social-meta-oauth  → conexão Meta (Facebook Login for Business)
   ├─ Edge Function social-coleta      → coleta IG + FB na Graph API
   └─ pg_cron → social_disparar_coleta()
        • 00h BRT   diaria   (perfil, 50 posts/rede + insights, métricas 30 dias)
        • a cada 3h stories  (stories ativos do IG + insights)
        • 15 em 15  backfill (histórico completo + insights pendentes; vira no-op ao terminar)
```

Uma única autorização da Meta cobre **Página do Facebook + Instagram vinculado** (o IG precisa
estar conectado à Página). O token de Página derivado do token longo **não expira** — não há
fluxo de renovação de 60 dias como no Pelli.

### Tabelas

| tabela | conteúdo |
|---|---|
| `social_contas` | contas acompanhadas (slug, página esperada, hash da senha do painel) |
| `social_conexoes` | tokens Meta, página e IG vinculados, status da conexão |
| `social_perfis_hist` | snapshot diário de seguidores/seguindo/publicações por rede |
| `social_posts` | posts IG + FB com curtidas/reações, comentários, alcance, views, salvos, compartilhamentos, cliques (+ `insights` brutos em jsonb) |
| `social_stories` | stories do IG com alcance, views, respostas, compartilhamentos |
| `social_metricas_diarias` | métricas da conta por dia (alcance, novos seguidores, views, engajamento…) |
| `social_planos` | sugestões da aba “Plano da semana” |
| `social_sync_estado` | cursor do backfill histórico |
| `social_coletas_log` | log de cada execução (status, duração, erros) |
| `social_config` | segredo do cron, URL das functions e do painel |

As migrations estão registradas no próprio Supabase (`social_estrutura_base`,
`social_feed_funcoes`, `social_disparar_coleta`). O código das Edge Functions está em
`supabase/functions/`.

## Conectar as contas (uma vez)

1. Em [developers.facebook.com](https://developers.facebook.com/apps) crie um app tipo **Business**
   e adicione o produto **Facebook Login for Business**.
2. Em *Facebook Login → Settings*, adicione a URI de redirecionamento:
   `https://zgpolatyyqxhdwborkbh.supabase.co/functions/v1/social-meta-oauth`
3. No Supabase → *Edge Functions → Secrets*, cadastre `META_APP_ID` e `META_APP_SECRET`
   (opcional: `META_LOGIN_CONFIG_ID`, se criar uma configuração no Login for Business).
4. Quem administra a Página (com o @traveleiros vinculado) abre o painel e clica em
   **Conectar Facebook + Instagram**. Ao voltar, a primeira coleta começa sozinha.

Enquanto o app estiver em modo *Desenvolvimento*, só administradores/testadores do app
conseguem autorizar — para uso interno isso basta.

## Senha do painel

Trocar a senha (SQL editor do Supabase):

```sql
select public.social_definir_senha('traveleiros', 'nova-senha');
```

Link mágico: `https://emaildocaio.github.io/painel-social-traveleiros/?k=<senha>`

## Rodar manualmente uma coleta

```sql
select public.social_disparar_coleta('diaria', 'traveleiros');   -- ou 'stories' / 'backfill'
select * from social_coletas_log order by id desc limit 10;      -- acompanhar
```

## Rodar local / deploy

```bash
npm install
npm run dev          # http://localhost:3000
```

Push na `main` → GitHub Actions builda o export estático e publica no Pages.
