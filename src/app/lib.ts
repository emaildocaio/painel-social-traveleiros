// Tipos e utilitários compartilhados do painel.

// Supabase do painel (chave publicável: só consegue chamar a função social_feed,
// que exige a senha do grupo — as tabelas não são legíveis com ela).
export const SUPABASE_URL = "https://zgpolatyyqxhdwborkbh.supabase.co";
export const SUPABASE_KEY = "sb_publishable__n21aDqH_hjPZ2VINlZkLA_KllEjl_f";
export const CONTA_PADRAO = "traveleiros";

/** Conta exibida: ?conta=<slug> na URL (guardada na sessão) ou a padrão. Permite reusar o painel para outras marcas. */
export function contaAtual(): string {
  if (typeof window === "undefined") return CONTA_PADRAO;
  const daUrl = new URL(window.location.href).searchParams.get("conta")?.trim().toLowerCase();
  if (daUrl && /^[a-z0-9-]{2,40}$/.test(daUrl)) {
    sessionStorage.setItem("social-conta", daUrl);
    return daUrl;
  }
  return sessionStorage.getItem("social-conta") ?? CONTA_PADRAO;
}

export const conectarUrl = (conta: string) => `${SUPABASE_URL}/functions/v1/social-meta-oauth?conta=${encodeURIComponent(conta)}`;

export type Rede = "instagram" | "facebook";

export type Perfil = {
  username?: string | null;
  nome?: string | null;
  seguidores?: number | null;
  seguindo?: number | null;
  publicacoes?: number | null;
  foto_url?: string | null;
  coletado_em?: string;
  extra?: Record<string, unknown>;
};

export type Snapshot = { data?: string; seguidores?: number | null; seguindo?: number | null; publicacoes?: number | null };

export type Post = {
  id: string;
  tipo?: string | null;
  tipo_produto?: string | null;
  legenda?: string | null;
  permalink?: string | null;
  media_url?: string | null;
  thumbnail_url?: string | null;
  publicado_em?: string | null;
  curtidas?: number | null;
  comentarios?: number | null;
  compartilhamentos?: number | null;
  alcance?: number | null;
  views?: number | null;
  salvos?: number | null;
  interacoes?: number | null;
  cliques?: number | null;
  coletado_em?: string;
};

export type Story = {
  story_id: string;
  tipo?: string | null;
  publicado_em?: string | null;
  permalink?: string | null;
  media_url?: string | null;
  thumbnail_url?: string | null;
  alcance?: number | null;
  views?: number | null;
  respostas?: number | null;
  compartilhamentos?: number | null;
  interacoes?: number | null;
  coletado_em?: string;
};

export type Serie = { data: string; valor: number | null }[];

export type BlocoRede = {
  perfil: Perfil | null;
  historico: Snapshot[];
  posts: Post[];
  stories: Story[];
  metricas: Record<string, Serie>;
};

export type ItemPlano = {
  id: number;
  rede: string;
  dia: string;
  foco?: string | null;
  horario?: string | null;
  ordem: number;
  titulo: string;
  formato?: string | null;
  resumo?: string | null;
  estrategia?: string | null;
  objetivo?: string | null;
  cta?: string | null;
  recomendada: boolean;
};

export type Feed = {
  atualizadoEm: string;
  ultimaColeta: string | null;
  conta: { slug: string; nome: string };
  conexao: {
    status: "pendente" | "conectado" | "erro" | "revogado";
    ig_username?: string | null;
    fb_page_nome?: string | null;
    conectado_em?: string | null;
    verificado_em?: string | null;
  };
  instagram: BlocoRede;
  facebook: BlocoRede;
  plano: ItemPlano[];
};

const nf = new Intl.NumberFormat("pt-BR");
export const fmt = (n?: number | null) => (typeof n === "number" && !Number.isNaN(n) ? nf.format(Math.round(n)) : "—");

export function dataCurta(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function dataHora(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Engajamento base = curtidas/reações + comentários (comparável entre redes). */
export const engajamento = (p: Post) => (p.curtidas ?? 0) + (p.comentarios ?? 0);

export const TIPO_LABEL: Record<string, string> = {
  IMAGE: "Imagem",
  VIDEO: "Reel/Vídeo",
  CAROUSEL_ALBUM: "Carrossel",
  LINK: "Link",
  TEXT: "Texto",
};

export const tipoLabel = (p: Post) =>
  p.tipo_produto === "REELS" ? "Reel" : TIPO_LABEL[p.tipo ?? ""] ?? p.tipo ?? "";

export const REDE_LABEL: Record<Rede, string> = { instagram: "Instagram", facebook: "Facebook" };

/** Rótulos amigáveis para as métricas diárias da conta. */
export const METRICA_LABEL: Record<string, string> = {
  reach: "Alcance",
  follower_count: "Novos seguidores",
  views: "Visualizações",
  accounts_engaged: "Contas engajadas",
  total_interactions: "Interações",
  profile_views: "Visitas ao perfil",
  website_clicks: "Cliques no link",
  page_media_view: "Visualizações",
  page_total_media_view_unique: "Alcance",
  page_impressions_unique: "Alcance",
  page_post_engagements: "Engajamento nos posts",
  page_follows: "Seguidores (total)",
  page_daily_follows_unique: "Novos seguidores",
  page_daily_unfollows_unique: "Deixaram de seguir",
  page_views_total: "Visitas à página",
  page_video_views: "Views de vídeo",
};

export const anoDe = (p: Post) => Number((p.publicado_em ?? "0").slice(0, 4));
export const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Hora/dia no fuso de Brasília (UTC-3), independente do fuso do navegador. */
export const horaBRT = (iso?: string | null) => new Date(new Date(iso ?? 0).getTime() - 3 * 3600 * 1000).getUTCHours();
export const diaBRT = (iso?: string | null) => new Date(new Date(iso ?? 0).getTime() - 3 * 3600 * 1000).getUTCDay();
