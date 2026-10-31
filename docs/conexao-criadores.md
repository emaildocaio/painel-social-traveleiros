# Conexão de criadores Publizeiros — Fase 0 (diagnóstico)

> Data: 31/10/2026 · Branch: `fase0-conexao-criadores` · Nada foi alterado no banco, nas Edge Functions nem no app Meta.

## Resumo para leigo

- Para analisar os Reels de cada criador, o app da Publizeiros precisa de **5 permissões principais da Meta** (uma delas, `pages_manage_engagement`, nunca foi pedida e a documentação atual da Meta diz que é necessária para ler as métricas de Reels).
- Duas permissões que pedimos hoje (`pages_read_user_content` e `business_management`) **não têm uso comprovado** e devem sair ou ganhar uso real antes do App Review.
- Enquanto o app não for aprovado, cada criador entra como **testador**: a Publizeiros convida, o criador aceita numa tela do Facebook. **Ele não precisa de conta de desenvolvedor.** Limite de 50 testadores.
- A alternativa do "acesso de parceiro" (sem link por criador) **provavelmente funciona, mas a documentação da Meta não garante**. Proponho um teste de 15 minutos antes de decidir.
- **Pendência:** não consegui ler o banco nem o código publicado das Edge Functions, porque o conector do Supabase desta sessão não tem acesso à organização do projeto Hey Ninja. As seções marcadas com ⏳ dependem disso.

---

## 1. O que foi lido

| Fonte | Status |
|---|---|
| Repositório `emaildocaio/painel-social-traveleiros` (commit `f86f1a4`, 08/10/2026) | ✅ lido |
| Banco Supabase `zgpolatyyqxhdwborkbh` (tabelas, migrations, cron, funções SQL) | ⏳ sem acesso (o conector só vê a org "Supabase do Caio") |
| Código **publicado** das Edge Functions | ⏳ sem acesso |
| App Meta (estado das permissões) | ⏳ o MCP de desenvolvedor da Meta (`devtools_*`) não está conectado nesta sessão |
| Documentação da Meta (Graph API, versão atual v26) | ✅ lida, fontes no fim |

### Achado importante: o repositório está atrás da produção

O código das funções no GitHub **não tem** várias correções descritas nas lições aprendidas:

| Lição aprendida | No repositório? |
|---|---|
| `auth_type=rerequest` | ❌ não aparece (`social-meta-oauth/index.ts:52-59`) |
| Buscar a Página pelo ID quando não vem em `/me/accounts` | ❌ só usa `/me/accounts` (`index.ts:95-106`) |
| `debug_token` → `granular_scopes` | ❌ usa `/me/permissions` (`index.ts:91`) |
| Caminho alternativo por token colado (POST) | ❌ não existe |
| Lote adaptativo em `/{page}/posts` | ❌ backfill usa `limit: 100` fixo (`social-coleta/index.ts:251`) |
| Alcance 0 do Facebook tratado como ausente | ❌ `post_total_media_view_unique ?? ...` aceita o 0 (`index.ts:173`) |

Ou seja, a versão em produção foi editada direto no Supabase e não voltou para o Git. **Risco alto:** qualquer deploy feito a partir do repositório desfaz essas correções. Primeira tarefa assim que houver acesso: baixar o código publicado (`get_edge_function`) e comitar no repositório antes de mexer em qualquer coisa.

Outra divergência: o README diz que o backfill roda a cada 15 min; o prompt diz 5 min. Conferir no `cron.job` ⏳.

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

## 3. Estado de cada permissão no app hoje ⏳

Não consegui verificar: o MCP de desenvolvedor da Meta não está conectado e não abri o painel da Meta.

O que a documentação garante: app do tipo Empresa recebe **Standard Access** automaticamente em todas as permissões do seu tipo. **Advanced Access** exige verificação da empresa + App Review por permissão. Como o app está em modo desenvolvimento e a empresa não foi verificada (pelo que consta no prompt), o esperado é **todas em Standard, nenhuma em Advanced**.

Para confirmar (1 minuto): developers.facebook.com → app "Agência Publizeiros" → **Revisão do app → Permissões e recursos**. Ou conectar o MCP `https://mcp.facebook.com/devtools` e eu rodo `app_review → privileges`.

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

Nomes provisórios; conferir contra o banco real ⏳ antes da Fase 1.

```
social_equipe (user_id → auth.users)          quem da Publizeiros pode gerar convites e ver a lista
        │
        ▼ cria
social_convites ──────────────┐
  id, nome_criador, contato    │ conta_id (preenchido na conexão)
  token_hash (sha256, único)   ▼
  expira_em, status         social_contas ◄── social_conexoes (tokens: só service role, via Vault)
  criado_por, aberto_em        │                 + convite_id, fb_user_id (app-scoped),
  autorizado_em, tentativas    │                   revogado_em, granular_scopes jsonb
  diagnostico jsonb            │
  revogado_em                  ├── social_posts  + video_id, duracao_s, reproducoes,
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
- **Acesso da equipe:** Supabase Auth (link mágico) + tabela `social_equipe` + funções `security definer` que checam a participação. Já fica alinhado com o login do Hey Ninja. Alternativa mais simples para a Fase 1: senha da equipe, como `social_feed`. Decidir na Fase 1.
- **Tokens:** hoje estão em texto em `social_conexoes` ⏳. Mover para o Supabase Vault (guardar só o `secret_id` na tabela) é uma migration que precisa de backup e de aprovação.

---

## 7. Mudanças por função

### `social-meta-oauth`
1. **Antes de tudo:** trazer a versão publicada para o Git.
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
4. Alcance 0 → `null` (já deve estar em produção; garantir no Git).
5. Erro 190 ou desautorização → refletir no convite também.

### Banco / SQL
- Migrations da Fase 1: `social_convites`, `social_equipe`, `social_exclusoes`, colunas novas em `social_posts`/`social_conexoes`, funções `social_gerar_convite()` e `social_lista_equipe()`.
- `social_disparar_coleta` aceitar prioridade ⏳ (ver a definição atual).

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
| Tokens em texto no banco ⏳ | vazamento em caso de acesso indevido | Vault na Fase 1, com aprovação |
| Coleta sequencial de todas as contas numa chamada | timeout com dezenas de criadores | medir na Fase 3; se necessário, propor a fila por conta |

---

## 9. O que o Caio precisa fazer

1. **Dar acesso ao banco** (para fechar as seções ⏳): reconectar o conector do Supabase incluindo a organização do Hey Ninja, ou autorizar leitura pelo Chrome.
2. **Confirmar o estado das permissões**: print de "Revisão do app → Permissões e recursos", ou conectar o MCP de desenvolvedor da Meta.
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
