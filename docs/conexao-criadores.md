# Conexão de criadores Publizeiros — Fase 0 (diagnóstico)

> Data: 31/10/2026, banco lido em 01/11/2026 · Branch: `fase0-conexao-criadores` · Nada foi alterado no banco, nas Edge Functions nem no app Meta.

## Resumo para leigo

- Para analisar os Reels de cada criador, o app da Publizeiros precisa de **5 permissões principais da Meta** (uma delas, `pages_manage_engagement`, nunca foi pedida e a documentação atual da Meta diz que é necessária para ler as métricas de Reels).
- Duas permissões que pedimos hoje (`pages_read_user_content` e `business_management`) **não têm uso comprovado** e devem sair ou ganhar uso real antes do App Review.
- Enquanto o app não for aprovado, cada criador entra como **testador**: a Publizeiros convida, o criador aceita numa tela do Facebook. **Ele não precisa de conta de desenvolvedor.** Limite de 50 testadores.
- A alternativa do "acesso de parceiro" (sem link por criador) **provavelmente funciona, mas a documentação da Meta não garante**. Proponho um teste de 15 minutos antes de decidir.
- **Banco lido em 01/11** (seção 1.1): a Traveleiros está conectada e coletando sem erros, e os tokens estão fechados para anon e authenticated. Mas o código no GitHub está atrás da produção, e o Hey Ninja já tem tabelas de workspace, convite e admin que vamos reaproveitar.
- **Permissões no app (seção 3):** todas em Acesso padrão. Para abrir a criadores de fora, a Meta pede verificação da empresa, `public_profile` em Avançado e, ao que tudo indica, o cadastro como Provedor de Tecnologia.

---

## 1. O que foi lido

| Fonte | Status |
|---|---|
| Repositório `emaildocaio/painel-social-traveleiros` (commit `f86f1a4`, 08/10/2026) | ✅ lido |
| Banco Supabase `zgpolatyyqxhdwborkbh` (tabelas, migrations, cron, funções SQL, advisors) | ✅ lido em 01/11 (conector "Supabase Hey Ninja") |
| Código **publicado** das Edge Functions | ✅ `social-meta-oauth` v8, `social-coleta` v10 |
| App Meta (estado das permissões) | ✅ lista do painel enviada pelo Caio (01/11) |
| Documentação da Meta (Graph API, versão atual v26) | ✅ lida, fontes no fim |

### Achado importante: o repositório está atrás da produção

| Lição aprendida | No GitHub | Em produção |
|---|---|---|
| `auth_type=rerequest` | ❌ | ✅ |
| Buscar a Página pelo ID quando não vem em `/me/accounts` | ❌ | ✅ |
| `debug_token` → `granular_scopes` | ❌ | ⚠️ só no caso de erro, e só vai para o log |
| Caminho alternativo por token colado (POST com senha do painel) | ❌ | ✅ |
| Lote adaptativo em `/{page}/posts` (metade até 5) | ❌ | ✅ (diária e backfill) |
| Alcance 0 do Facebook tratado como ausente | ❌ | ❌ **também não está em produção**: 54 posts do FB têm `alcance = 0` gravado (49 `added_video` e 5 `added_photos`) |

A produção foi editada direto no Supabase e não voltou para o Git. **Risco:** um deploy a partir do repositório desfaz as correções. **Primeira tarefa da Fase 1:** comitar no repositório o código publicado (v8 e v10).

### 1.1 Estado do banco (01/11/2026)

- **Contas:** `traveleiros` (conectada, verificada hoje às 09:51, Instagram @traveleiros vinculado) e `demo` (inativa, revogada).
- **Coletas:** as últimas execuções de `diaria`, `stories` e `backfill` estão todas `ok`, sem erros.
- **pg_cron:** `social-backfill` a cada 5 min (o README diz 15, está desatualizado), `social-coleta-diaria` às 03h UTC, `social-coleta-stories` a cada 3h (minuto 20). Há também `escritorio-coletor` a cada minuto, de outro projeto que usa o mesmo banco (fora do escopo).
- **Escopos concedidos na conexão da Traveleiros:** `read_insights`, `pages_show_list`, `business_management`, `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`, `pages_read_user_content`, `public_profile`. Ou seja, a configuração de login `1101105642285812` pede exatamente a lista do código, **sem** `pages_manage_engagement`.
- **Tokens:** `page_token` e `user_token` ficam **em texto** em `social_conexoes`. A extensão `supabase_vault` já está instalada.
- **Segurança:** `social_conexoes`, `social_config`, `social_oauth_states` e `social_sync_estado` não dão nenhum acesso a anon nem a authenticated (sem grant e sem policy). Tokens protegidos. ✅
- **Hey Ninja já em andamento** (migrations `hn_01` a `hn_05`, de 09/10):
  - `hn_workspaces` (3), `hn_membros` (0), `hn_convites` (1), `hn_admins_plataforma` (0), `hn_planos_assinatura`.
  - `social_contas.workspace_id` já existe.
  - Funções `hn_private.eh_admin()`, `meus_workspaces()`, `minhas_contas()`, `status_conexao()` e o gatilho `ao_criar_usuario` (convite por e-mail vira membro no primeiro login).
  - Policies de leitura para `authenticated` em `social_posts`, `social_contas`, `social_metricas_diarias` etc., filtradas por workspace. `hn_convites` só é legível por admin da plataforma.
- **Dados de Reels hoje:** 835 Reels do IG (último em 29/10). No FB, os vídeos aparecem como `VIDEO / added_video` (49) e `VIDEO / FEED` (47), e o **último post do FB no banco é de 03/10**, embora a coleta diária rode sem erro. Duas hipóteses: a Traveleiros não publicou no FB desde então, ou Reels de Página não vêm em `/{page}/posts`. Verificar na Fase 3; se for a segunda, reforça a necessidade de `/video_reels`.
- **Advisors de segurança:** nada novo nas tabelas `social_*`. `social_feed` chamável por anon é intencional (protegida pela senha). Os alertas de `escritorio_*` e `pg_net` em `public` são de outro projeto e não serão alterados aqui.

---

## 2. Permissão ↔ endpoint ↔ métrica ↔ código

Só entra o que a análise de Reels (e o complemento de Instagram) usa. "Hoje" = linha no repositório; "Novo" = ainda não existe no código.

### 2.1 Reels da Página do Facebook (caminho principal)

| Dado da análise | Endpoint | Campo / métrica (Graph v26) | Permissões | Código |
|---|---|---|---|---|
| Lista de Reels | `GET /{page-id}/video_reels` (filtros `since`/`until`) | `id` (ID do vídeo), `description`, `updated_time` | `pages_read_engagement` + token de Página | Novo |
| Data e hora, legenda, duração, link | `GET /{video-id}` | `created_time`, `description`, `length`, `permalink_url`, `post_id` ⚠️ | `pages_read_engagement` | Novo |
| Reproduções | `GET /{video-id}/video_insights` | `blue_reels_play_count` (sem replays) e `fb_reels_total_plays` (com replays) | `read_insights` + `pages_manage_engagement` + tarefa ANALYZE na Página | Novo |
| Alcance | idem | `post_impressions_unique` ⚠️ | idem | Novo |
| Tempo médio assistido | idem | `post_video_avg_time_watched` (ms, pode passar da duração por causa dos replays) | idem | Novo |
| Tempo total assistido | idem | `post_video_view_time` (ms) | idem | Novo |
| Retenção | idem | `post_video_retention_graph` | idem | Novo |
| Reações | idem | `post_video_likes_by_reaction_type` | idem | Novo |
| Comentários + compartilhamentos | idem | `post_video_social_actions` (soma dos dois) | idem | Novo |
| Comentários e compartilhamentos separados | `GET /{page-post-id}` | `comments.summary(total_count)`, `shares`, `reactions.summary(total_count)` | `pages_read_engagement` | Hoje: `social-coleta/index.ts:123` |
| Seguidores ganhos pelo Reel (extra) | `video_insights` | `post_video_followers` | `read_insights` + `pages_manage_engagement` | Novo |

⚠️ **Pontos a confirmar com uma chamada real** (Fase 3, com o token da Traveleiros):

1. **`length`, `permalink_url` e `post_id` no nó Video.** A referência atual do nó Video não lista esses campos de forma clara. Se faltarem, a duração vem do próprio Reel ou fica nula.
2. **Alcance (`post_impressions_unique`).** A documentação de Reels ainda lista essa métrica, mas a Meta descontinuou `post_impressions_unique` no nível de post em 15/06/2026, trocando por `post_total_media_view_unique` (a mesma que hoje devolve 0 nos posts da Traveleiros). Plano: pedir as duas; se vierem 0 ou erro, gravar alcance como **ausente** e o relatório diz "a Meta não informou o alcance deste Reel".
3. **`pages_manage_engagement`.** A documentação atual de `video_insights` exige essa permissão, mas ela é de escrita (moderar comentários) e o App Review pode questionar. Testar se `video_insights` responde sem ela. Se responder, não pedimos. Se não, a justificativa no App Review é "exigida pela Meta para ler métricas de Reels".
4. **`creator_monetization_qualified_views`** (visualizações que contam para monetização) existe em `video_insights` e é exatamente o tema do programa. A Meta diz que métricas de ganhos só respondem a **administrador** da Página. Testar; se funcionar, vira o indicador central do relatório.

Observações:
- Os dados de vídeo só ficam disponíveis por **2 anos**.
- Hoje a coleta não busca Reels de forma específica: ela pega `/{page}/posts` e chama de "VIDEO" qualquer anexo de vídeo ou reel (`social-coleta/index.ts:125-133`). As métricas de Reels acima **só existem em `video_insights`**, e não no `/insights` de post que o código usa hoje.

### 2.2 Instagram (complemento)

| Dado | Endpoint | Métricas (tipo REELS) | Permissões (login pelo Facebook) | Código |
|---|---|---|---|---|
| Lista de mídias | `GET /{ig-user-id}/media` | `media_product_type = REELS`, `timestamp`, `caption`, `permalink` | `instagram_basic`, `pages_read_engagement` | Hoje: `index.ts:29,66` |
| Métricas do Reel | `GET /{ig-media-id}/insights` | `views`, `reach`, `ig_reels_avg_watch_time`, `ig_reels_video_view_total_time`, `likes`, `comments`, `shares`, `saved`, `total_interactions`, `reels_skip_rate` | `instagram_manage_insights` | Hoje pede só `reach, views, saved, shares, total_interactions, likes, comments` (`index.ts:58`); faltam tempo médio e taxa de pulo |
| Perfil | `GET /{ig-user-id}` | seguidores etc. | `instagram_basic` | Hoje: `index.ts:44` |

Atenção: a Meta avisa que, se quem autoriza tem papel no **portfólio empresarial** ligado à Página, o Instagram pode exigir também `ads_read` e `ads_management`. Não pedimos essas. Se algum criador cair nesse caso, o diagnóstico da Fase 2 precisa mostrar a mensagem certa, e não um erro genérico.

### 2.3 Permissões: o que pedir

| Permissão | Pedida hoje? (`social-meta-oauth/index.ts:13-21`) | Uso real | Decisão proposta |
|---|---|---|---|
| `pages_show_list` | sim | `/me/accounts` | **manter** |
| `pages_read_engagement` | sim | posts, Reels, reações, comentários, IG via FB | **manter** |
| `read_insights` | sim | `/insights` e `video_insights` | **manter** |
| `pages_manage_engagement` | não | exigida pela doc de `video_insights` | **testar** (item 2.1-3) |
| `instagram_basic` | sim | mídia e perfil IG | **manter** |
| `instagram_manage_insights` | sim | insights IG | **manter** |
| `pages_read_user_content` | sim | serve para conteúdo publicado por visitantes. O código só lê contagens | **remover** (a Meta recusa permissão sem uso) |
| `business_management` | sim | nenhum endpoint de portfólio no código | **remover**, a menos que a Fase 2 use `/{business}/owned_pages` para achar Páginas de portfólio. Decidir na Fase 2 |
| `public_profile` | implícita | a Meta exige Advanced Access dela antes de o Facebook Login for Business ir ao ar | incluir no App Review |

Importante: como o login usa `config_id`, **a lista que vale é a da configuração `1101105642285812` no painel da Meta**, e não a constante `ESCOPOS` (ela só é usada sem `config_id`). Alterar a configuração exige a aprovação do Caio.

---

## 3. Estado de cada permissão no app hoje

Fonte: painel da Meta → Análise do app → Permissões e recursos (lista enviada pelo Caio em 01/11/2026, 10:32).

| Permissão | Nível | Status no painel | Análise |
|---|---|---|---|
| `pages_show_list` | Acesso padrão | Ativo | nenhuma solicitada |
| `pages_read_engagement` | Acesso padrão | Ativo | nenhuma solicitada |
| `pages_read_user_content` | Acesso padrão | Ativo | nenhuma solicitada |
| `business_management` | Acesso padrão | Ativo | nenhuma solicitada |
| `read_insights` | Acesso padrão | Ativo | nenhuma solicitada |
| `instagram_basic` | Acesso padrão | Ativo | nenhuma solicitada |
| `instagram_manage_insights` | Acesso padrão | Ativo | nenhuma solicitada |
| `pages_manage_engagement` | Acesso padrão | Pronto para usar (nunca chamada) | nenhuma solicitada |
| `public_profile` | Acesso padrão | Ativo | **Verificação necessária** |

**Conclusão: todas as permissões estão em Acesso padrão e nenhuma em Avançado.** Por isso só quem tem função no app consegue autorizar.

Três achados do painel:

1. **Alerta no topo do Facebook Login for Business:** "requer acesso avançado. Seu app tem acesso padrão a `public_profile`". Para criadores de fora, o primeiro item do App Review é `public_profile` em Avançado, e para ele o painel já mostra "Verificação necessária" (verificação da empresa). Entra no checklist da Fase 5.
2. **As permissões de Página e Instagram estão numa seção com o aviso:** "Seu app só precisa de acesso avançado às permissões e recursos a seguir se sua empresa fornecer serviços como um **Provedor de Tecnologia**. É necessário fazer a verificação da empresa." Como a Publizeiros vai ler as Páginas dos criadores (ativos de terceiros), tudo indica que ela se enquadra como Provedor de Tecnologia. A Fase 5 precisa incluir esse cadastro antes do pedido de Advanced Access. A confirmar no próprio fluxo da Meta.
3. **`pages_manage_engagement` já está disponível em Acesso padrão.** Dá para incluí-la na configuração de login, só para o teste da seção 2.1-3, sem pedir nada à Meta. Alterar a configuração exige aprovação.

Também conferido: a URI de redirecionamento cadastrada é `https://zgpolatyyqxhdwborkbh.supabase.co/functions/v1/social-meta-oauth`, com modo estrito e HTTPS forçado. O fluxo do convite pode usar a mesma URI. E a lista que a configuração de login pede bate com os escopos gravados na conexão da Traveleiros (seção 1.1).

---

## 4. Como adicionar um criador como testador (modo desenvolvimento)

Fatos da documentação da Meta:
- O papel **Testador não exige conta de desenvolvedor Meta**. Qualquer usuário comum do Facebook pode ser testador.
- Testador pode conceder **qualquer permissão** com o app em desenvolvimento.
- Limite: **50 testadores**, ou **500** (testadores + usuários de análise somados) se o app estiver ligado a um portfólio empresarial **verificado**.
- **Se o app estiver ligado a um portfólio empresarial, os papéis são gerenciados pelo Gerenciador de Negócios**, e não pelo painel do app.

### Passo a passo (equipe Publizeiros)

1. Pegar com o criador o **nome exato do perfil do Facebook** de quem administra a Página (ou o link do perfil).
2. Abrir developers.facebook.com → app "Agência Publizeiros" → **Funções do app → Funções**.
   - Se aparecer o aviso de que as funções são gerenciadas pelo portfólio: business.facebook.com → **Configurações → Contas → Apps → Agência Publizeiros → Atribuir pessoas**.
3. **Adicionar pessoas → Testador** → digitar o nome/perfil → Enviar.
4. Mandar ao criador a mensagem abaixo.
5. Depois de ele aceitar, conferir que aparece como Testador (sem "pendente") e só então enviar o link de convite da Fase 1.

⏳ Ainda não sei qual dos dois caminhos do passo 2 vale para este app. Verificar no painel.

### Texto pronto para o criador (WhatsApp)

> Oi, [nome]! Aqui é da Publizeiros 👋
> Para prepararmos a análise dos seus Reels, precisamos que você aceite um convite rápido no Facebook (leva 1 minuto):
>
> 1. Entre no Facebook com o perfil que **administra a sua Página** (precisa ser o administrador, não um editor).
> 2. Abra este link: https://www.facebook.com/settings/?tab=applications
> 3. Em **Solicitações**, você vai ver o app **Agência Publizeiros**. Toque em **Aceitar**.
>
> Não precisa criar conta de desenvolvedor nem instalar nada. Quando aceitar, me avisa aqui que eu te mando o link para conectar suas redes. 🙌

O criador pode sair quando quiser, no mesmo lugar (botão **Renunciar**).

---

## 5. Pergunta: acesso de parceiro + token de usuário do sistema, sem OAuth por criador?

**Resposta curta: provavelmente funciona tecnicamente, mas a documentação da Meta não confirma, e há um sinal contrário. Recomendo testar antes de decidir.**

O que a documentação diz:
- Um usuário do sistema só pode ter função num app **do mesmo portfólio**, e o app precisa de Standard Access para gerar o token (Business Management APIs → System Users).
- A mesma página diz que o app deve passar pelo App Review (e verificação) **para as permissões que o usuário do sistema vai usar**. Isso indica que **não dispensa App Review**.
- O Standard Access é definido só por "ter função no app". Um usuário do sistema atribuído ao app tem função, mas a documentação não fala de ativos compartilhados por parceiros.
- A documentação do Facebook Login for Business diz que, para atender empresas que você **não possui nem gerencia**, o app precisa de Advanced Access. Com acesso de parceiro, a Publizeiros passa a "gerenciar" o ativo, mas a Meta não diz se isso basta.

**Conclusão honesta:** não encontrei fonte oficial que garanta "sem OAuth e sem Advanced Access". Há indício de que App Review continua sendo exigido.

### Teste proposto (15 min, precisa de aprovação, porque mexe no portfólio e no app)

1. Um criador de confiança (ou a própria Traveleiros, se a Página estiver em outro portfólio) adiciona a Publizeiros como **parceira** da Página, com permissão só de **ver desempenho/insights**.
2. No portfólio da Publizeiros: atribuir a Página ao usuário do sistema e gerar um token com `read_insights` e `pages_read_engagement`.
3. Chamar `/{page-id}/video_reels` e `/{video-id}/video_insights?metric=blue_reels_play_count`.
4. Se responder com dados → o caminho funciona hoje (em Standard). Se der erro de permissão → fica descartado.

### Prós e contras frente ao link de convite

| | Acesso de parceiro + usuário do sistema | Link de convite (OAuth) |
|---|---|---|
| Atrito para o criador | adicionar parceiro no Business Suite (vários passos, e exige que a Página esteja num portfólio) | um toque + tela da Meta |
| Token | um só, da Publizeiros, pode não expirar | um por criador (o token de Página não expira, mas o criador pode revogar) |
| App Review | provavelmente ainda exigido; incerto | exigido (Advanced Access) |
| Limite de 50 testadores | não se aplica | aplica-se até a aprovação |
| Saber quando o criador sai | não há aviso: só descobrimos pelo erro | callback de desautorização |
| Consentimento (LGPD) | precisa de termo separado | a tela da Meta + nossa página registram o aceite |
| Instagram | compartilhar o IG como ativo de parceiro (mais um passo) | vem junto se estiver vinculado à Página |
| Risco de a Meta mudar a regra | maior (uso não documentado) | menor (fluxo oficial) |

**Recomendação:** seguir com o **link de convite** como caminho principal (decisão já tomada) e rodar o teste acima só como plano B para criadores que travarem no OAuth.

---

## 6. Modelo de dados proposto

Ajustado em 01/11 ao que já existe no banco: **reaproveita o Hey Ninja** em vez de criar uma estrutura paralela.

- **Equipe Publizeiros = `hn_admins_plataforma`.** Já existe, com `hn_private.eh_admin()` e policies. Não criamos `social_equipe`.
- **Cada criador ganha um `hn_workspaces`.** `social_contas.workspace_id` já existe. Quando o Hey Ninja tiver login, o criador vira membro (`hn_membros`) do workspace dele, sem retrabalho.
- **`hn_convites` não serve para isto.** Ele é convite *de login por e-mail* (vira membro no 1º login, pelo gatilho em `auth.users`). O convite *de conexão Meta* precisa de token de uso único com hash, validade, status e diagnóstico, por isso vai numa tabela própria, ligada ao workspace.

```
hn_admins_plataforma (já existe)    equipe Publizeiros: gera convites e vê a lista
        │
        ▼ cria
hn_convites_conexao (nova) ───────┐
  id, workspace_id → hn_workspaces │ conta_id (preenchido na conexão)
  nome_criador, contato            ▼
  token_hash (sha256, único)    social_contas (workspace_id já existe)
  expira_em, status                │  ◄── social_conexoes (tokens: só service role → Vault)
  criado_por, aberto_em            │        + convite_id, revogado_em, granular_scopes jsonb
  autorizado_em, tentativas        │
  diagnostico jsonb, revogado_em   ├── social_posts  + video_id, duracao_s, reproducoes,
                               │                   reproducoes_total, tempo_medio_ms,
                               │                   tempo_total_ms, retencao jsonb,
                               │                   seguidores_ganhos  (Reels FB e IG)
                               └── social_coletas_log (já existe)

social_exclusoes   pedidos de exclusão de dados da Meta: confirmation_code, fb_user_id,
                   status, solicitado_em, concluido_em  (a Meta exige URL de status)
```

- **Status do convite:** `criado → aberto → autorizado → conectado`, ou `incompleto` (faltou Página, IG ou permissão), `expirado`, `revogado`. Enum ou `check`.
- **`diagnostico`** guarda a última tentativa: Página encontrada (s/n + nome), IG vinculado, cada permissão concedida, ativos em `granular_scopes`, quantidade de Reels encontrados, mensagem mostrada ao criador.
- **Reels:** reaproveitar `social_posts` (já tem `rede`, `tipo_produto`, `insights` jsonb) com colunas novas, em vez de uma tabela nova. O painel atual continua lendo as mesmas colunas. A ligação entre o vídeo (`video_reels`) e o post (`/{page}/posts`) é feita pelo `post_id` do vídeo, se o campo existir (item 2.1-1).
- **Acesso da equipe:** Supabase Auth (link mágico) + `hn_admins_plataforma` + funções `security definer` em `hn_private` (padrão já usado). Hoje `hn_admins_plataforma` está **vazia**: o Caio e a equipe precisam virar admins (pelo `hn_convites` com `admin_plataforma = true`, que já existe).
- **Tokens:** confirmado que estão em texto em `social_conexoes` (`page_token`, `user_token`), mas sem acesso para anon e authenticated. Mover para o Vault (`supabase_vault` já instalado) é uma migration com backup e precisa de aprovação. Proposta: fazer na Fase 1, antes de entrarem tokens de terceiros.

---

## 7. Mudanças por função

### `social-meta-oauth`
1. **Antes de tudo:** trazer a versão publicada (v8) para o Git. Ela já tem `rerequest`, busca da Página pelo ID e o POST por token colado.
2. Início: receber `?convite=<token>` → calcular o hash → validar (existe, não expirou, não revogado) → marcar `aberto` → criar o state ligado ao convite (não à conta).
3. Diálogo: `config_id` + `auth_type=rerequest` + `response_type=code`.
4. Callback: token longo → `debug_token` (`granular_scopes`) → Páginas por `/me/accounts` **e** pelos IDs de `granular_scopes` → IG vinculado → **criar a conta** se não existir (slug a partir do nome da Página) → gravar a conexão → montar o diagnóstico → status `conectado` ou `incompleto`.
5. Contar Reels (`/video_reels?limit=1`) para o diagnóstico.
6. Redirecionar para `/conectar?convite=...&resultado=...` (página do criador), e não para o painel.
7. Rotas novas: **desautorização** (POST com `signed_request` → marca `revogado`) e **exclusão de dados** (POST com `signed_request` → registra o pedido, apaga os dados e devolve `{url, confirmation_code}`). Ambas validam o HMAC com `META_APP_SECRET`.
8. Manter o fluxo antigo `?conta=` funcionando até a Traveleiros migrar.

### `social-coleta`
1. Nova etapa `fb_reels`: `/video_reels` (paginado, com lote adaptativo) → `/{video}` → `video_insights` com as métricas de Reels, tolerante a métrica inválida (`insightsTolerante` já faz isso).
2. IG: incluir `ig_reels_avg_watch_time`, `ig_reels_video_view_total_time` e `reels_skip_rate` para `REELS`.
3. Aceitar `{conta, rotina, prioridade}` para a 1ª coleta do criador recém-conectado.
4. Alcance 0 → `null`: **não está implementado nem em produção**. Corrigir no código e limpar os 54 posts do FB com `alcance = 0` (alteração de dados: pedir aprovação).
5. Trazer a v10 publicada para o Git antes (já tem o lote adaptativo).
5. Erro 190 ou desautorização → refletir no convite também.

### Banco / SQL
- Migrations da Fase 1: `hn_convites_conexao`, `social_exclusoes`, colunas novas em `social_posts`/`social_conexoes`, funções `hn_gerar_convite_conexao()` (cria o workspace + o convite e devolve o link) e `hn_lista_conexoes()`, ambas restritas a `eh_admin()`.
- `social_disparar_coleta(p_rotina, p_conta)` já aceita uma conta específica: a 1ª coleta do criador usa isso, sem mudar a assinatura.

### Painel
- Página nova `/conectar` (estática, mobile first, marca Publizeiros), que chama a Edge Function.
- Lista da equipe (Fase 3).

---

## 8. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Repositório desatualizado em relação à produção | deploy regride correções | baixar o código publicado e comitar antes de editar |
| `pages_manage_engagement` exigida e questionada no App Review | atraso na liberação | testar sem ela; se exigida, justificar citando a doc |
| Alcance de Reels sem métrica confiável (descontinuações de jun/2026) | relatório sem alcance | tratar como ausente e destacar reproduções e tempo assistido |
| Limite de 50 testadores | trava o programa acima de 50 criadores | verificação da empresa (sobe para 500) e App Review em paralelo, desde já |
| Papéis do app geridos pelo portfólio | equipe procura no lugar errado | confirmar o caminho e registrar no runbook |
| Quem autoriza não é administrador | conexão vazia | aviso no convite e diagnóstico específico |
| Criador com papel no portfólio → IG pede `ads_read`/`ads_management` | IG não conecta | detectar o erro e mostrar a mensagem; avaliar pedir as permissões só se acontecer |
| Graph v23 expira em 08/10/2027 | coleta para | planejar subir para v25/v26 em 2027 (`META_GRAPH_VERSION` já é configurável) |
| Tokens em texto no banco (confirmado; hoje fechados para anon/authenticated) | vazamento se uma policy futura abrir a tabela | Vault na Fase 1, com aprovação, + teste SQL de acesso |
| Mesmo banco usado pelo projeto "escritório" (cron a cada minuto, funções anon) | migrations ou advisors misturados | prefixos separados; não tocar em `escritorio_*` |
| Reels do FB talvez fora de `/{page}/posts` (último post FB no banco: 03/10) | análise sem os Reels | verificar na Fase 3; coletar por `/video_reels` |
| Coleta sequencial de todas as contas numa chamada | timeout com dezenas de criadores | medir na Fase 3; se necessário, propor a fila por conta |

---

## 9. O que o Caio precisa fazer

1. ~~Dar acesso ao banco~~ ✅ feito em 01/11.
2. ~~Confirmar o estado das permissões~~ ✅ feito em 01/11.
3. **Decidir** se rodamos o teste de acesso de parceiro (seção 5), que mexe no portfólio.

---

## Sugestões para depois

- `creator_monetization_qualified_views` pode virar o indicador principal do relatório, se responder para o administrador.
- Iniciar já a verificação da empresa: ela destrava 500 testadores e é pré-requisito do Advanced Access.

## Fontes

- Video Insights (Reels Metrics, requisitos): https://developers.facebook.com/docs/graph-api/reference/video/video_insights/
- Reels Publishing API (`GET /{page-id}/video_reels`): https://developers.facebook.com/docs/video-api/guides/reels-publishing
- Page Insights (permissões): https://developers.facebook.com/docs/graph-api/reference/page/insights/
- Instagram Media Insights (métricas de REELS, permissões): https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights
- Funções do app (testadores, limites, aceite): https://developers.facebook.com/docs/development/build-and-test/app-roles
- Níveis de acesso (Standard × Advanced): https://developers.facebook.com/docs/graph-api/overview/access-levels
- Usuários do sistema: https://developers.facebook.com/docs/marketing-api/system-users/overview
- Facebook Login for Business: https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business
- Descontinuações de jun/2026: https://docs.supermetrics.com/docs/facebook-insights-field-changes-june-30-2026 e https://support.sproutsocial.com/hc/en-us/articles/45863997056397-Facebook-Metric-Deprecations-June-2026
- Versões da Graph API: https://developers.facebook.com/docs/graph-api/changelog/versions
