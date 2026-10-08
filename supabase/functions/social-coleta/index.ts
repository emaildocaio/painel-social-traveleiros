// Coletor social (Instagram + Facebook) — equivalente aos fluxos n8n do Pelli,
// rodando dentro do Supabase e disparado pelo pg_cron.
//
// POST { conta?: "traveleiros", rotina: "diaria" | "stories" | "backfill" }
// Header obrigatório: x-cron-secret = social_config.cron_secret
//
//  diaria   → perfil IG/FB (snapshot), 50 posts recentes de cada rede + insights,
//             métricas diárias da conta (30 dias) — roda 00h BRT
//  stories  → stories ativos do IG + insights (efêmeros 24h) — a cada 3h
//  backfill → pagina o histórico completo de posts (cursor salvo) e completa os
//             insights que faltam, dentro de um orçamento de tempo — a cada 15 min,
//             vira no-op quando termina
import { db, config, graph, GraphError, insightsTolerante, json, InsightValor } from "./meta.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const ORCAMENTO_MS = 110_000; // margem sob o limite de ~150s da Edge Function
const inicio = () => Date.now();

type Conexao = {
  conta_id: string; slug: string;
  page_token: string; fb_page_id: string;
  ig_user_id: string | null;
};

const agora = () => new Date().toISOString();
const n = (v: unknown) => (typeof v === "number" ? v : null);

// ---------------- Instagram ----------------
const IG_MEDIA_FIELDS = "id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count";

function igPostRow(c: Conexao, p: any) {
  return {
    conta_id: c.conta_id, rede: "instagram", post_id: p.id,
    tipo: p.media_type ?? null, tipo_produto: p.media_product_type ?? null,
    legenda: p.caption ?? null, permalink: p.permalink ?? null,
    media_url: p.media_url ?? null, thumbnail_url: p.thumbnail_url ?? null,
    publicado_em: p.timestamp ?? null,
    curtidas: n(p.like_count), comentarios: n(p.comments_count),
    coletado_em: agora(),
  };
}

async function igPerfil(sb: SupabaseClient, c: Conexao) {
  const p = await graph<any>(`/${c.ig_user_id}`, {
    fields: "username,name,followers_count,follows_count,media_count,profile_picture_url,biography,website",
  }, c.page_token);
  await sb.from("social_perfis_hist").insert({
    conta_id: c.conta_id, rede: "instagram", username: p.username, nome: p.name ?? p.username,
    seguidores: n(p.followers_count), seguindo: n(p.follows_count), publicacoes: n(p.media_count),
    foto_url: p.profile_picture_url ?? null, extra: { biografia: p.biography ?? null, site: p.website ?? null },
  });
}

const invalidasIg: Record<string, Set<string>> = {};
async function igInsightsPost(c: Conexao, post: { post_id: string; tipo: string | null; tipo_produto: string | null }) {
  const chave = `${post.tipo}/${post.tipo_produto}`;
  const inval = (invalidasIg[chave] ??= new Set());
  const m = await insightsTolerante(post.post_id, ["reach", "views", "saved", "shares", "total_interactions", "likes", "comments"], c.page_token, {}, inval);
  return insightRow(m, {
    alcance: m.reach?.valor, views: m.views?.valor, salvos: m.saved?.valor,
    compartilhamentos: m.shares?.valor, interacoes: m.total_interactions?.valor,
  });
}

async function igPostsRecentes(sb: SupabaseClient, c: Conexao, limite = 50) {
  const r = await graph<{ data: any[] }>(`/${c.ig_user_id}/media`, { fields: IG_MEDIA_FIELDS, limit: limite }, c.page_token);
  const rows = (r.data ?? []).map((p) => igPostRow(c, p));
  if (rows.length) await sb.from("social_posts").upsert(rows, { onConflict: "rede,post_id" });
  let comInsights = 0;
  for (const row of rows) {
    const ins = await igInsightsPost(c, row);
    await sb.from("social_posts").update(ins).eq("rede", "instagram").eq("post_id", row.post_id);
    comInsights++;
  }
  return { posts: rows.length, insights: comInsights };
}

async function igStories(sb: SupabaseClient, c: Conexao) {
  const r = await graph<{ data: any[] }>(`/${c.ig_user_id}/stories`, {
    fields: "id,media_type,media_url,thumbnail_url,permalink,timestamp",
  }, c.page_token);
  const inval = new Set<string>();
  let total = 0;
  for (const s of r.data ?? []) {
    const m = await insightsTolerante(s.id, ["reach", "views", "replies", "shares", "total_interactions"], c.page_token, {}, inval);
    await sb.from("social_stories").upsert({
      conta_id: c.conta_id, story_id: s.id, tipo: s.media_type ?? null, publicado_em: s.timestamp ?? null,
      permalink: s.permalink ?? null, media_url: s.media_url ?? null, thumbnail_url: s.thumbnail_url ?? null,
      alcance: m.reach?.valor ?? null, views: m.views?.valor ?? null, respostas: m.replies?.valor ?? null,
      compartilhamentos: m.shares?.valor ?? null, interacoes: m.total_interactions?.valor ?? null,
      insights: brutos(m), coletado_em: agora(),
    }, { onConflict: "story_id" });
    total++;
  }
  return { stories: total };
}

async function igMetricasConta(sb: SupabaseClient, c: Conexao) {
  const hoje = Math.floor(Date.now() / 1000);
  const rows: any[] = [];
  // Séries diárias (até 30 dias): alcance e novos seguidores
  const serie = await insightsTolerante(c.ig_user_id!, ["reach", "follower_count"], c.page_token, {
    period: "day", since: hoje - 29 * 86400, until: hoje,
  }, new Set());
  for (const m of Object.values(serie)) {
    for (const p of m.serie ?? []) {
      if (!p.data) continue;
      rows.push({ conta_id: c.conta_id, rede: "instagram", metrica: m.name, data: diaAnterior(p.data), valor: p.valor, coletado_em: agora() });
    }
  }
  // Totais de ontem (métricas que só existem como total_value)
  const ontemIni = hoje - (hoje % 86400) - 86400 + 3 * 3600; // 00h BRT de ontem
  const tot = await insightsTolerante(c.ig_user_id!, ["views", "accounts_engaged", "total_interactions", "profile_views", "website_clicks", "likes", "comments", "shares", "saves"], c.page_token, {
    period: "day", metric_type: "total_value", since: ontemIni, until: ontemIni + 86400,
  }, new Set());
  const ontem = new Date((ontemIni) * 1000).toISOString().slice(0, 10);
  for (const m of Object.values(tot)) rows.push({ conta_id: c.conta_id, rede: "instagram", metrica: m.name, data: ontem, valor: m.valor, coletado_em: agora() });
  if (rows.length) await sb.from("social_metricas_diarias").upsert(rows, { onConflict: "conta_id,rede,metrica,data" });
  return { metricas: rows.length };
}

// ---------------- Facebook ----------------
const FB_POST_FIELDS = "id,message,created_time,permalink_url,full_picture,status_type,attachments{media_type,type,media},shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)";

function fbTipo(p: any): string {
  const a = p.attachments?.data?.[0];
  const t = (a?.media_type ?? a?.type ?? "").toLowerCase();
  if (t.includes("album")) return "CAROUSEL_ALBUM";
  if (t.includes("video") || t.includes("reel")) return "VIDEO";
  if (t.includes("photo") || t.includes("image")) return "IMAGE";
  if (t.includes("link") || t.includes("share")) return "LINK";
  return p.full_picture ? "IMAGE" : "TEXT";
}

function fbPostRow(c: Conexao, p: any) {
  return {
    conta_id: c.conta_id, rede: "facebook", post_id: p.id,
    tipo: fbTipo(p), tipo_produto: p.status_type ?? null,
    legenda: p.message ?? null, permalink: p.permalink_url ?? null,
    media_url: p.full_picture ?? null, thumbnail_url: p.full_picture ?? null,
    publicado_em: p.created_time ?? null,
    curtidas: n(p.reactions?.summary?.total_count), comentarios: n(p.comments?.summary?.total_count),
    compartilhamentos: n(p.shares?.count) ?? 0,
    coletado_em: agora(),
  };
}

async function fbPerfil(sb: SupabaseClient, c: Conexao) {
  const p = await graph<any>(`/${c.fb_page_id}`, {
    fields: "id,name,username,fan_count,followers_count,link,picture{url},about,category",
  }, c.page_token);
  await sb.from("social_perfis_hist").insert({
    conta_id: c.conta_id, rede: "facebook", username: p.username ?? null, nome: p.name,
    seguidores: n(p.followers_count) ?? n(p.fan_count), seguindo: null, publicacoes: null,
    foto_url: p.picture?.data?.url ?? null,
    extra: { curtidas_pagina: p.fan_count ?? null, link: p.link ?? null, sobre: p.about ?? null, categoria: p.category ?? null },
  });
}

// A Meta trocou "impressions" por "media views" nas Páginas (nov/2025) — pedimos
// as duas famílias e usamos o que vier.
const FB_POST_METRICAS = [
  "post_total_media_view_unique", "post_media_view", "post_impressions_unique", "post_impressions",
  "post_clicks", "post_reactions_by_type_total", "post_video_views",
];
const invalidasFb: Record<string, Set<string>> = {};
async function fbInsightsPost(c: Conexao, post: { post_id: string; tipo: string | null; publicado_em?: string | null }) {
  // A Meta só guarda insights de posts de Página por ~2 anos
  if (post.publicado_em && Date.now() - new Date(post.publicado_em).getTime() > 730 * 86400_000) return insightRow({}, {});
  const inval = (invalidasFb[post.tipo ?? "?"] ??= new Set());
  const m = await insightsTolerante(post.post_id, FB_POST_METRICAS, c.page_token, {}, inval);
  return insightRow(m, {
    alcance: m.post_total_media_view_unique?.valor ?? m.post_impressions_unique?.valor,
    views: m.post_media_view?.valor ?? m.post_video_views?.valor ?? m.post_impressions?.valor,
    cliques: m.post_clicks?.valor,
  });
}

async function fbPostsRecentes(sb: SupabaseClient, c: Conexao, limite = 50) {
  const r = await graph<{ data: any[] }>(`/${c.fb_page_id}/posts`, { fields: FB_POST_FIELDS, limit: limite }, c.page_token);
  const rows = (r.data ?? []).map((p) => fbPostRow(c, p));
  if (rows.length) await sb.from("social_posts").upsert(rows, { onConflict: "rede,post_id" });
  for (const row of rows) {
    const ins = await fbInsightsPost(c, row);
    await sb.from("social_posts").update(ins).eq("rede", "facebook").eq("post_id", row.post_id);
  }
  return { posts: rows.length };
}

const FB_PAGINA_METRICAS = [
  "page_follows", "page_daily_follows_unique", "page_daily_unfollows_unique", "page_post_engagements",
  "page_media_view", "page_total_media_view_unique", "page_impressions_unique", "page_views_total", "page_video_views",
];
async function fbMetricasPagina(sb: SupabaseClient, c: Conexao) {
  const hoje = Math.floor(Date.now() / 1000);
  const m = await insightsTolerante(c.fb_page_id, FB_PAGINA_METRICAS, c.page_token, {
    period: "day", since: hoje - 29 * 86400, until: hoje,
  }, new Set());
  const rows: any[] = [];
  for (const met of Object.values(m)) {
    for (const p of met.serie ?? []) {
      if (!p.data) continue;
      rows.push({ conta_id: c.conta_id, rede: "facebook", metrica: met.name, data: diaAnterior(p.data), valor: p.valor, coletado_em: agora() });
    }
  }
  if (rows.length) await sb.from("social_metricas_diarias").upsert(rows, { onConflict: "conta_id,rede,metrica,data" });
  return { metricas: rows.length };
}

// ---------------- utilidades ----------------
function brutos(m: Record<string, InsightValor>) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) o[k] = v.bruto;
  return o;
}
function insightRow(m: Record<string, InsightValor>, campos: Record<string, number | null | undefined>) {
  const row: Record<string, unknown> = { insights: brutos(m), insights_em: agora() };
  for (const [k, v] of Object.entries(campos)) if (v !== undefined && v !== null) row[k] = v;
  return row;
}
// end_time da Meta marca o FIM do dia (meia-noite seguinte, horário do Pacífico) → dia de referência = véspera
function diaAnterior(endTime: string) {
  const d = new Date(endTime);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function estado(sb: SupabaseClient, c: Conexao, rede: string) {
  const { data } = await sb.from("social_sync_estado").select("cursor, completo")
    .eq("conta_id", c.conta_id).eq("rede", rede).eq("rotina", "backfill_posts").maybeSingle();
  return data ?? { cursor: null, completo: false };
}
async function salvarEstado(sb: SupabaseClient, c: Conexao, rede: string, cursor: string | null, completo: boolean) {
  await sb.from("social_sync_estado").upsert({
    conta_id: c.conta_id, rede, rotina: "backfill_posts", cursor, completo, atualizado_em: agora(),
  }, { onConflict: "conta_id,rede,rotina" });
}

async function backfill(sb: SupabaseClient, c: Conexao, t0: number) {
  const res: Record<string, unknown> = {};
  // 1) Histórico de posts, página a página (cursor persistido)
  const redes: [string, string, string, (p: any) => any][] = [];
  if (c.ig_user_id) redes.push(["instagram", `/${c.ig_user_id}/media`, IG_MEDIA_FIELDS, (p) => igPostRow(c, p)]);
  redes.push(["facebook", `/${c.fb_page_id}/posts`, FB_POST_FIELDS, (p) => fbPostRow(c, p)]);
  for (const [rede, path, fields, toRow] of redes) {
    const st = await estado(sb, c, rede);
    if (st.completo) { res[`${rede}_posts`] = "completo"; continue; }
    let next: string | null = st.cursor;
    let paginas = 0, total = 0;
    while (Date.now() - t0 < ORCAMENTO_MS * 0.5) {
      const r: any = next ? await graph(next) : await graph(path, { fields, limit: 100 }, c.page_token);
      const rows = (r.data ?? []).map(toRow);
      if (rows.length) await sb.from("social_posts").upsert(rows, { onConflict: "rede,post_id" });
      total += rows.length; paginas++;
      next = r.paging?.next ?? null;
      await salvarEstado(sb, c, rede, next, !next);
      if (!next) break;
    }
    res[`${rede}_posts`] = { paginas, total, completo: !next };
  }
  // 2) Insights pendentes (mais recentes primeiro), até acabar o orçamento
  let feitos = 0;
  while (Date.now() - t0 < ORCAMENTO_MS) {
    const { data: pend } = await sb.from("social_posts").select("post_id, rede, tipo, tipo_produto, publicado_em")
      .eq("conta_id", c.conta_id).is("insights_em", null).order("publicado_em", { ascending: false }).limit(25);
    if (!pend?.length) break;
    for (const p of pend) {
      if (Date.now() - t0 >= ORCAMENTO_MS) break;
      if (p.rede === "instagram" && !c.ig_user_id) continue;
      const ins = p.rede === "instagram" ? await igInsightsPost(c, p) : await fbInsightsPost(c, p);
      await sb.from("social_posts").update(ins).eq("rede", p.rede).eq("post_id", p.post_id);
      feitos++;
    }
  }
  const { count } = await sb.from("social_posts").select("post_id", { count: "exact", head: true })
    .eq("conta_id", c.conta_id).is("insights_em", null);
  res.insights_feitos = feitos;
  res.insights_pendentes = count ?? 0;
  return res;
}

// ---------------- orquestração ----------------
async function rodar(sb: SupabaseClient, c: Conexao, rotina: string) {
  const t0 = inicio();
  const { data: log } = await sb.from("social_coletas_log").insert({ conta_id: c.conta_id, rotina }).select("id").single();
  const detalhe: Record<string, unknown> = {};
  const erros: string[] = [];
  const etapa = async (nome: string, fn: () => Promise<unknown>) => {
    try { detalhe[nome] = await fn(); }
    catch (e) {
      const msg = e instanceof GraphError ? `${e.code ?? ""} ${e.message}` : String(e);
      erros.push(`${nome}: ${msg}`);
      // 190 = token inválido/revogado → marca a conexão
      if (e instanceof GraphError && e.code === 190) {
        await sb.from("social_conexoes").update({ status: "erro", ultimo_erro: msg, atualizado_em: agora() }).eq("conta_id", c.conta_id);
      }
    }
  };

  if (rotina === "diaria") {
    if (c.ig_user_id) {
      await etapa("ig_perfil", () => igPerfil(sb, c));
      await etapa("ig_posts", () => igPostsRecentes(sb, c));
      await etapa("ig_metricas", () => igMetricasConta(sb, c));
    }
    await etapa("fb_perfil", () => fbPerfil(sb, c));
    await etapa("fb_posts", () => fbPostsRecentes(sb, c));
    await etapa("fb_metricas", () => fbMetricasPagina(sb, c));
  } else if (rotina === "stories") {
    if (c.ig_user_id) await etapa("ig_stories", () => igStories(sb, c));
  } else if (rotina === "backfill") {
    await etapa("backfill", () => backfill(sb, c, t0));
  } else {
    erros.push(`rotina desconhecida: ${rotina}`);
  }

  const etapasOk = Object.keys(detalhe).length;
  const status = erros.length === 0 ? "ok" : etapasOk > 0 ? "parcial" : "erro";
  if (status !== "erro") {
    await sb.from("social_conexoes").update({ verificado_em: agora() }).eq("conta_id", c.conta_id).eq("status", "conectado");
  }
  await sb.from("social_coletas_log").update({
    finalizado_em: agora(), status, detalhe: { ...detalhe, erros, duracao_ms: Date.now() - t0 },
  }).eq("id", log!.id);
  return { conta: c.slug, rotina, status, detalhe, erros };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "use POST" }, 405);
  const sb = db();
  const segredo = await config(sb, "cron_secret");
  if (!segredo || req.headers.get("x-cron-secret") !== segredo) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const rotina: string = body.rotina ?? "diaria";

  let q = sb.from("social_conexoes")
    .select("conta_id, page_token, fb_page_id, ig_user_id, status, social_contas!inner(slug, ativo)")
    .eq("status", "conectado").eq("social_contas.ativo", true);
  if (body.conta) q = q.eq("social_contas.slug", body.conta);
  const { data: conexoes, error } = await q;
  if (error) return json({ error: error.message }, 500);
  if (!conexoes?.length) return json({ ok: true, rotina, mensagem: "nenhuma conta conectada" });

  const resultados = [];
  for (const cx of conexoes as any[]) {
    resultados.push(await rodar(sb, {
      conta_id: cx.conta_id, slug: cx.social_contas.slug,
      page_token: cx.page_token, fb_page_id: cx.fb_page_id, ig_user_id: cx.ig_user_id,
    }, rotina));
  }
  return json({ ok: true, resultados });
});
