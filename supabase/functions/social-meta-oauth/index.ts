// Conexão Meta (Facebook Login for Business) — uma autorização cobre a Página do
// Facebook e o Instagram profissional vinculado a ela.
//
//  GET ?conta=traveleiros          → cria state e redireciona para o diálogo da Meta
//  GET ?code=...&state=...         → callback: troca o code por token longo, acha a
//                                    Página + IG, grava em social_conexoes e volta
//                                    para o painel com ?conexao=ok|erro
//
// Secrets necessários (Edge Functions → Secrets): META_APP_ID, META_APP_SECRET.
// Opcional: META_LOGIN_CONFIG_ID (configuração do Facebook Login for Business).
import { db, config, graph, GraphError, GRAPH_VERSION } from "./meta.ts";

const ESCOPOS = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
  "business_management",
];

function voltar(painel: string, params: Record<string, string>) {
  const u = new URL(painel);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return Response.redirect(u.toString(), 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const sb = db();
  const painel = (await config(sb, "painel_url")) ?? "https://emaildocaio.github.io/";
  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");
  const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/social-meta-oauth`;

  if (!appId || !appSecret) {
    return voltar(painel, { conexao: "erro", motivo: "App Meta não configurado (META_APP_ID/META_APP_SECRET)" });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const erroMeta = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  // ---------- 1) Início do fluxo ----------
  if (!code && !state) {
    const slug = url.searchParams.get("conta") ?? "traveleiros";
    const { data: conta } = await sb.from("social_contas").select("id").eq("slug", slug).eq("ativo", true).maybeSingle();
    if (!conta) return voltar(painel, { conexao: "erro", motivo: "conta inexistente" });
    const st = crypto.randomUUID();
    await sb.from("social_oauth_states").insert({ state: st, conta_id: conta.id });
    const dialog = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
    dialog.searchParams.set("client_id", appId);
    dialog.searchParams.set("redirect_uri", redirectUri);
    dialog.searchParams.set("state", st);
    dialog.searchParams.set("response_type", "code");
    const configId = Deno.env.get("META_LOGIN_CONFIG_ID");
    if (configId) dialog.searchParams.set("config_id", configId);
    else dialog.searchParams.set("scope", ESCOPOS.join(","));
    return Response.redirect(dialog.toString(), 302);
  }

  // ---------- 2) Callback ----------
  const { data: st } = await sb.from("social_oauth_states").select("conta_id, criado_em, usado_em").eq("state", state ?? "").maybeSingle();
  if (!st || st.usado_em || Date.now() - new Date(st.criado_em).getTime() > 30 * 60 * 1000) {
    return voltar(painel, { conexao: "erro", motivo: "link expirado — gere a conexão de novo" });
  }
  await sb.from("social_oauth_states").update({ usado_em: new Date().toISOString() }).eq("state", state!);
  const { data: conta } = await sb.from("social_contas").select("id, slug, fb_page_id, ig_username").eq("id", st.conta_id).single();

  const falhar = async (motivo: string) => {
    await sb.from("social_conexoes").upsert(
      { conta_id: conta!.id, status: "erro", ultimo_erro: motivo, atualizado_em: new Date().toISOString() },
      { onConflict: "conta_id" },
    );
    return voltar(painel, { conexao: "erro", motivo });
  };

  if (!code) return falhar(erroMeta ?? "autorização cancelada");

  try {
    // code → token curto → token longo (~60d)
    const curto = await graph<{ access_token: string }>("/oauth/access_token", {
      client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code,
    });
    const longo = await graph<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: curto.access_token,
    });
    const userToken = longo.access_token;
    const eu = await graph<{ id: string; name: string }>("/me", { fields: "id,name" }, userToken);
    const perms = await graph<{ data: { permission: string; status: string }[] }>("/me/permissions", {}, userToken);
    const escopos = perms.data.filter((p) => p.status === "granted").map((p) => p.permission);

    // Páginas que o usuário administra (page token derivado de token longo não expira)
    const contas = await graph<{ data: any[] }>("/me/accounts", {
      fields: "id,name,username,access_token,instagram_business_account{id,username}", limit: 100,
    }, userToken);
    const paginas = contas.data ?? [];
    let pagina = paginas.find((p) => p.id === conta!.fb_page_id)
      ?? paginas.find((p) => p.instagram_business_account?.username?.toLowerCase() === (conta!.ig_username ?? "").toLowerCase())
      ?? paginas.find((p) => `${p.name} ${p.username ?? ""}`.toLowerCase().includes(conta!.slug))
      ?? (paginas.length === 1 ? paginas[0] : undefined);
    if (!pagina) {
      const nomes = paginas.map((p) => `${p.name} (${p.id})`).join(", ") || "nenhuma";
      return falhar(`Página não encontrada entre as autorizadas: ${nomes}`);
    }
    // Garante o IG vinculado (às vezes só aparece consultando a página com o page token)
    let ig = pagina.instagram_business_account;
    if (!ig) {
      const pg = await graph<any>(`/${pagina.id}`, { fields: "instagram_business_account{id,username}" }, pagina.access_token);
      ig = pg.instagram_business_account;
    }

    await sb.from("social_conexoes").upsert({
      conta_id: conta!.id,
      provedor: "facebook_login_business",
      fb_user_id: eu.id,
      fb_user_nome: eu.name,
      user_token: userToken,
      user_token_expira_em: longo.expires_in ? new Date(Date.now() + longo.expires_in * 1000).toISOString() : null,
      fb_page_id: pagina.id,
      fb_page_nome: pagina.name,
      page_token: pagina.access_token,
      ig_user_id: ig?.id ?? null,
      ig_username: ig?.username ?? null,
      escopos,
      status: "conectado",
      ultimo_erro: ig ? null : "Instagram não vinculado à Página — só o Facebook será coletado",
      conectado_em: new Date().toISOString(),
      verificado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    }, { onConflict: "conta_id" });

    // Reinicia o backfill histórico e dispara a 1ª coleta em segundo plano
    await sb.from("social_sync_estado").delete().eq("conta_id", conta!.id);
    const segredo = await config(sb, "cron_secret");
    const coleta = (rotina: string) =>
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/social-coleta`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": segredo ?? "" },
        body: JSON.stringify({ conta: conta!.slug, rotina }),
      }).catch(() => null);
    // @ts-ignore EdgeRuntime existe no runtime do Supabase
    EdgeRuntime.waitUntil(coleta("diaria").then(() => coleta("stories")).then(() => coleta("backfill")));

    return voltar(painel, { conexao: "ok", ig: ig?.username ?? "", fb: pagina.name });
  } catch (e) {
    const msg = e instanceof GraphError ? `Meta: ${e.message}` : String(e);
    return falhar(msg.slice(0, 300));
  }
});
