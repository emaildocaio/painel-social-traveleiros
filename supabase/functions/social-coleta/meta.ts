// Helpers compartilhados: cliente Supabase (service role), Graph API da Meta e
// leitura tolerante de insights (métricas que a Meta deprecia não derrubam a coleta).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") ?? "v23.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export function db(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function config(sb: SupabaseClient, chave: string): Promise<string | null> {
  const { data } = await sb.from("social_config").select("valor").eq("chave", chave).maybeSingle();
  return data?.valor ?? null;
}

export class GraphError extends Error {
  code?: number;
  subcode?: number;
  status: number;
  constructor(msg: string, status: number, code?: number, subcode?: number) {
    super(msg);
    this.status = status;
    this.code = code;
    this.subcode = subcode;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET na Graph API. `path` pode ser relativo (/me) ou URL completa (paging.next). */
export async function graph<T = any>(path: string, params: Record<string, string | number> = {}, token?: string): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  if (token && !url.searchParams.has("access_token")) url.searchParams.set("access_token", token);
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (res.ok && !body.error) return body as T;
    const e = body.error ?? {};
    // 4/17/32/613 = rate limit; 1/2 = erro transitório → espera e tenta de novo
    if ([1, 2, 4, 17, 32, 613].includes(e.code) && tentativa < 2) {
      await sleep(1500 * (tentativa + 1));
      continue;
    }
    throw new GraphError(e.message ?? `HTTP ${res.status}`, res.status, e.code, e.error_subcode);
  }
  throw new GraphError("falha após retentativas", 500);
}

export type InsightValor = { name: string; valor: number | null; bruto: unknown; serie?: { data: string; valor: number | null }[] };

function numero(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    // ex.: post_reactions_by_type_total → { like: 10, love: 2 }
    return Object.values(v as Record<string, unknown>).reduce<number>((s, x) => s + (typeof x === "number" ? x : 0), 0);
  }
  return null;
}

function parseInsights(data: any[]): Record<string, InsightValor> {
  const out: Record<string, InsightValor> = {};
  for (const d of data ?? []) {
    const vals = Array.isArray(d.values) ? d.values : [];
    const ultimo = d.total_value ? d.total_value.value : vals.length ? vals[vals.length - 1].value : null;
    out[d.name] = {
      name: d.name,
      valor: numero(ultimo),
      bruto: ultimo,
      serie: vals.map((v: any) => ({ data: v.end_time, valor: numero(v.value) })),
    };
  }
  return out;
}

/**
 * Busca insights pedindo todas as métricas de uma vez; se a Meta recusar
 * (métrica inválida/depreciada para aquele objeto), cai para uma por uma e
 * memoriza as inválidas em `invalidas` para não repetir o erro no resto da rodada.
 */
export async function insightsTolerante(
  objetoId: string,
  metricas: string[],
  token: string,
  extra: Record<string, string | number> = {},
  invalidas: Set<string> = new Set(),
): Promise<Record<string, InsightValor>> {
  const validas = metricas.filter((m) => !invalidas.has(m));
  if (!validas.length) return {};
  try {
    const r = await graph<{ data: any[] }>(`/${objetoId}/insights`, { metric: validas.join(","), ...extra }, token);
    return parseInsights(r.data);
  } catch (e) {
    // 2108006 = mídia publicada antes da conversão para conta profissional: não há insights
    if (e instanceof GraphError && e.subcode === 2108006) return {};
    if (!(e instanceof GraphError) || e.code !== 100) {
      if (e instanceof GraphError && e.code === 10) return {}; // sem permissão / post sem dados (ex.: post antigo)
      throw e;
    }
  }
  const out: Record<string, InsightValor> = {};
  for (const m of validas) {
    try {
      const r = await graph<{ data: any[] }>(`/${objetoId}/insights`, { metric: m, ...extra }, token);
      Object.assign(out, parseInsights(r.data));
    } catch (e) {
      if (e instanceof GraphError && (e.code === 100 || e.code === 10)) {
        // 100 = métrica não suportada para este objeto. Só memoriza como inválida
        // se a mensagem indicar métrica inválida (não um post específico sem dados).
        if (/metric/i.test(e.message)) invalidas.add(m);
        continue;
      }
      throw e;
    }
  }
  return out;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
