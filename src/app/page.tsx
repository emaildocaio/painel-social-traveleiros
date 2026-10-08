"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Heart,
  MessageCircle,
  Users,
  UserPlus,
  Grid3x3,
  ExternalLink,
  Lock,
  RefreshCw,
  TrendingUp,
  LogOut,
  Eye,
  Bookmark,
  Share2,
  Signal,
  CalendarRange,
  Link2,
  CheckCircle2,
  AlertTriangle,
  MousePointerClick,
  Activity,
  Clapperboard,
  ThumbsUp,
} from "lucide-react";
import Analise from "./analise";
import Plano from "./plano";
import {
  conectarUrl,
  contaAtual,
  SUPABASE_KEY,
  SUPABASE_URL,
  dataCurta,
  dataHora,
  engajamento,
  fmt,
  METRICA_LABEL,
  REDE_LABEL,
  tipoLabel,
  type Feed,
  type Post,
  type Rede,
  type Serie,
  type Snapshot,
  type Story,
} from "./lib";

const STORAGE_KEY = "traveleiros-social-key";

type Aba = "painel" | "j180" | "stories" | "analise" | "plano";

export default function Home() {
  const [key, setKey] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [data, setData] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [rede, setRede] = useState<Rede>("instagram");
  const [aba, setAba] = useState<Aba>("painel");

  const buscar = useCallback(async (chave: string) => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/social_feed`, {
        method: "POST",
        cache: "no-store",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_conta: contaAtual(), p_key: chave }),
      });
      if (res.status === 401 || res.status === 403) {
        setErro("Senha incorreta.");
        setData(null);
        sessionStorage.removeItem(STORAGE_KEY);
        setKey(null);
        return false;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Feed;
      // Se o IG ainda não tem dados mas o FB tem, abre no FB
      if (!json.instagram.perfil && json.facebook.perfil) setRede("facebook");
      setData(json);
      sessionStorage.setItem(STORAGE_KEY, chave);
      setKey(chave);
      return true;
    } catch {
      setErro("Não foi possível carregar os dados. Tente novamente.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- leitura única da URL no carregamento (sistema externo) */
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Link mágico (?k=senha) e retorno da conexão Meta (?conexao=ok|erro&motivo=...).
    const url = new URL(window.location.href);
    const daUrl = url.searchParams.get("k");
    const conexao = url.searchParams.get("conexao");
    if (conexao) {
      const ok = conexao === "ok";
      const partes = [url.searchParams.get("ig") && `@${url.searchParams.get("ig")}`, url.searchParams.get("fb")].filter(Boolean);
      setAviso({
        ok,
        texto: ok
          ? `Conexão feita${partes.length ? `: ${partes.join(" + ")}` : ""}. A primeira coleta já começou — atualize em alguns minutos.`
          : `A conexão não foi concluída: ${url.searchParams.get("motivo") ?? "motivo desconhecido"}.`,
      });
    }
    contaAtual(); // fixa ?conta= na sessão antes de limpar a URL
    ["k", "conexao", "motivo", "ig", "fb", "conta"].forEach((p) => url.searchParams.delete(p));
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    const chave = daUrl?.trim() || sessionStorage.getItem(STORAGE_KEY);
    if (chave) {
      setKey(chave);
      void buscar(chave);
    }
  }, [buscar]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Stories só existem no Instagram
  const abaAtiva: Aba = rede === "facebook" && aba === "stories" ? "painel" : aba;

  function sair() {
    sessionStorage.removeItem(STORAGE_KEY);
    setKey(null);
    setData(null);
    setSenha("");
  }

  // ---------- Tela de senha ----------
  if (!key || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (senha.trim()) void buscar(senha.trim());
          }}
          className="w-full max-w-sm rounded-2xl border border-line bg-white p-8 shadow-sm"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sea/15 text-sea-deep">
            <Lock size={22} />
          </div>
          <h1 className="text-xl font-bold text-ink">Painel de Redes</h1>
          <p className="mb-6 mt-1 text-sm text-slate-600">Acesso restrito · Traveleiros</p>
          {aviso && <Aviso {...aviso} />}
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Senha de acesso</label>
          <input
            type="password"
            value={senha}
            autoFocus
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Digite a senha do grupo"
            className="w-full rounded-lg border border-line bg-sand/40 px-3 py-2.5 text-ink outline-none focus:border-sea focus:ring-2 focus:ring-sea/30"
          />
          {erro && <p className="mt-2 text-sm text-coral">{erro}</p>}
          <button
            type="submit"
            disabled={loading || !senha.trim()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-sea px-4 py-2.5 font-semibold text-white transition hover:bg-sea-deep disabled:opacity-50"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : null}
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </main>
    );
  }

  const bloco = data[rede];
  const perfil = bloco.perfil;
  const conectado = data.conexao.status === "conectado";

  const abas: [Aba, string][] = [
    ["painel", "Visão geral"],
    ["j180", "Últimos 180 dias"],
    ...(rede === "instagram" ? ([["stories", "Stories"]] as [Aba, string][]) : []),
    ["analise", "Análise de conteúdo"],
    ["plano", "Plano da semana"],
  ];

  // ---------- Dashboard ----------
  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {perfil?.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={perfil.foto_url} alt="" className="h-11 w-11 rounded-full border border-line object-cover" />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-ink">{perfil?.nome ?? data.conta.nome}</h1>
              {perfil?.username && (
                <a
                  href={rede === "instagram" ? `https://instagram.com/${perfil.username}` : `https://facebook.com/${perfil.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-sea-deep hover:underline"
                >
                  @{perfil.username}
                </a>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-600">Painel de redes · coletado {dataHora(data.ultimaColeta)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-white p-0.5">
            {(["instagram", "facebook"] as Rede[]).map((r) => (
              <button
                key={r}
                onClick={() => setRede(r)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  rede === r ? (r === "instagram" ? "bg-ig text-white" : "bg-fb text-white") : "text-slate-600 hover:bg-sand"
                }`}
              >
                {REDE_LABEL[r]}
              </button>
            ))}
          </div>
          <button
            onClick={() => key && void buscar(key)}
            title="Recarregar"
            className="flex items-center rounded-lg border border-line bg-white px-2.5 py-2 text-slate-600 transition hover:bg-sand"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={sair}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-sand"
          >
            <LogOut size={15} /> Sair
          </button>
        </div>
      </header>

      {aviso && <Aviso {...aviso} />}
      <StatusConexao feed={data} />

      <div className="mb-6 flex flex-wrap gap-1">
        {abas.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setAba(v)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              abaAtiva === v ? "bg-ink text-sand" : "border border-line bg-white text-slate-600 hover:bg-sand"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {!conectado && !bloco.posts.length ? (
        <p className="rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center text-sm text-slate-500">
          Sem dados ainda. Assim que as contas forem conectadas, a primeira coleta preenche este painel.
        </p>
      ) : (
        <>
          {abaAtiva === "painel" && <VisaoGeral key={rede} rede={rede} bloco={data[rede]} />}
          {abaAtiva === "j180" && <Janela180 key={rede} posts={bloco.posts} rede={rede} />}
          {abaAtiva === "stories" && <Stories stories={data.instagram.stories} />}
          {abaAtiva === "analise" && <Analise posts={bloco.posts} seguidores={perfil?.seguidores ?? undefined} rede={rede} />}
          {abaAtiva === "plano" && <Plano itens={data.plano.filter((p) => p.rede === rede || p.rede === "ambas")} rede={rede} />}
        </>
      )}

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-slate-500">
        <span>
          Produzido by <span className="font-semibold text-slate-600">@caio farias</span>
        </span>
        <a href="mailto:emaildocaio@gmail.com" className="font-medium text-sea-deep hover:underline">
          emaildocaio@gmail.com
        </a>
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------

function Aviso({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <div
      className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
        ok ? "border-sea/30 bg-sea/10 text-sea-deep" : "border-coral/30 bg-coral/10 text-coral-deep"
      }`}
    >
      {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
      <span>{texto}</span>
    </div>
  );
}

function StatusConexao({ feed }: { feed: Feed }) {
  const c = feed.conexao;
  if (c.status === "conectado") {
    return (
      <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1 font-medium text-sea-deep">
          <CheckCircle2 size={13} /> Conectado
        </span>
        {c.ig_username && <span>Instagram @{c.ig_username}</span>}
        {c.fb_page_nome && <span>Facebook {c.fb_page_nome}</span>}
        <span>verificado {dataHora(c.verificado_em)}</span>
        <a href={conectarUrl(feed.conta.slug)} className="text-slate-400 underline hover:text-slate-600">reconectar</a>
      </p>
    );
  }
  return (
    <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sun/50 bg-sun/10 p-4">
      <div className="text-sm text-slate-700">
        <p className="font-semibold text-ink">
          {c.status === "erro" ? "A conexão com a Meta precisa ser refeita" : "Contas ainda não conectadas"}
        </p>
        <p className="mt-0.5">
          Quem administra a Página do Facebook (com o Instagram vinculado) precisa autorizar o acesso uma vez.
        </p>
      </div>
      <a
        href={conectarUrl(feed.conta.slug)}
        className="flex items-center gap-2 rounded-lg bg-fb px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
      >
        <Link2 size={15} /> Conectar Facebook + Instagram
      </a>
    </section>
  );
}

// ---------------------------------------------------------------------------

function VisaoGeral({ rede, bloco }: { rede: Rede; bloco: Feed["instagram"] }) {
  type Ordem = "engajamento" | "curtidas" | "comentarios" | "alcance" | "recentes";
  const [ordenar, setOrdenarRaw] = useState<Ordem>("engajamento");
  const [tipoFiltro, setTipoFiltroRaw] = useState<string>("todos");
  const [anoFiltro, setAnoFiltroRaw] = useState<string>("todos");
  const [visiveis, setVisiveis] = useState(60);
  // Mudar ordenação/filtro volta para a 1ª página de resultados
  const setOrdenar = (v: Ordem) => { setOrdenarRaw(v); setVisiveis(60); };
  const setTipoFiltro = (v: string) => { setTipoFiltroRaw(v); setVisiveis(60); };
  const setAnoFiltro = (v: string) => { setAnoFiltroRaw(v); setVisiveis(60); };
  const perfil = bloco.perfil;

  const anos = useMemo(() => {
    const set = new Set<string>();
    for (const p of bloco.posts) {
      const y = new Date(p.publicado_em ?? 0).getFullYear();
      if (!Number.isNaN(y)) set.add(String(y));
    }
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [bloco.posts]);

  const tipos = useMemo(() => [...new Set(bloco.posts.map((p) => p.tipo ?? ""))].filter(Boolean), [bloco.posts]);

  const posts = useMemo(() => {
    let arr = [...bloco.posts];
    if (tipoFiltro !== "todos") arr = arr.filter((p) => p.tipo === tipoFiltro);
    if (anoFiltro !== "todos") arr = arr.filter((p) => String(new Date(p.publicado_em ?? 0).getFullYear()) === anoFiltro);
    arr.sort((a, b) => {
      if (ordenar === "curtidas") return (b.curtidas ?? 0) - (a.curtidas ?? 0);
      if (ordenar === "comentarios") return (b.comentarios ?? 0) - (a.comentarios ?? 0);
      if (ordenar === "alcance") return (b.alcance ?? 0) - (a.alcance ?? 0);
      if (ordenar === "recentes") return new Date(b.publicado_em ?? 0).getTime() - new Date(a.publicado_em ?? 0).getTime();
      return engajamento(b) - engajamento(a);
    });
    return arr;
  }, [bloco.posts, ordenar, tipoFiltro, anoFiltro]);

  const kpis =
    rede === "instagram"
      ? [
          { icon: <Users size={18} />, label: "Seguidores", value: fmt(perfil?.seguidores), destaque: true },
          { icon: <UserPlus size={18} />, label: "Seguindo", value: fmt(perfil?.seguindo) },
          { icon: <Grid3x3 size={18} />, label: "Publicações", value: fmt(perfil?.publicacoes) },
        ]
      : [
          { icon: <Users size={18} />, label: "Seguidores", value: fmt(perfil?.seguidores), destaque: true },
          { icon: <ThumbsUp size={18} />, label: "Curtidas da página", value: fmt(perfil?.extra?.curtidas_pagina as number | undefined) },
          { icon: <Grid3x3 size={18} />, label: "Posts coletados", value: fmt(bloco.posts.length) },
        ];

  return (
    <>
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <Kpi key={k.label} {...k} />
        ))}
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-sea" />
            <h2 className="text-sm font-semibold text-ink">Evolução de seguidores</h2>
          </div>
          <Sparkline pontos={bloco.historico} />
        </section>
        <MetricasConta metricas={bloco.metricas} rede={rede} />
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Desempenho dos posts · {fmt(posts.length)}</h2>
          <Pills
            valor={ordenar}
            onChange={setOrdenar}
            opcoes={[
              ["engajamento", "Engajamento"],
              ["curtidas", rede === "facebook" ? "Reações" : "Curtidas"],
              ["comentarios", "Comentários"],
              ["alcance", "Alcance"],
              ["recentes", "Recentes"],
            ]}
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Pills
            pequeno
            valor={tipoFiltro}
            onChange={setTipoFiltro}
            opcoes={[["todos", "Todos os tipos"], ...tipos.map((t) => [t, tipoLabel({ id: "", tipo: t })] as [string, string])]}
          />
          <select
            value={anoFiltro}
            onChange={(e) => setAnoFiltro(e.target.value)}
            className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-slate-700 outline-none focus:border-sea"
          >
            <option value="todos">Todos os anos</option>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {posts.slice(0, visiveis).map((p, i) => (
            <PostCard key={p.id} post={p} rede={rede} rank={ordenar !== "recentes" ? i + 1 : undefined} />
          ))}
        </div>

        {posts.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nenhum post com esses filtros.</p>}

        <div className="mt-5 flex flex-col items-center gap-2">
          <p className="text-xs text-slate-500">
            Mostrando {fmt(Math.min(visiveis, posts.length))} de {fmt(posts.length)}
          </p>
          {visiveis < posts.length && (
            <button
              onClick={() => setVisiveis((v) => v + 60)}
              className="rounded-lg border border-line bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-sand"
            >
              Carregar mais
            </button>
          )}
        </div>
      </section>
    </>
  );
}

function Pills<T extends string>({
  valor,
  onChange,
  opcoes,
  pequeno,
}: {
  valor: T;
  onChange: (v: T) => void;
  opcoes: [T, string][];
  pequeno?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {opcoes.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-full ${pequeno ? "px-2.5" : "px-3"} py-1 text-xs font-medium transition ${
            valor === v
              ? pequeno
                ? "bg-coral text-white"
                : "bg-ink text-sand"
              : "border border-line bg-white text-slate-600 hover:bg-sand"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Kpi({ icon, label, value, destaque }: { icon: React.ReactNode; label: string; value: string; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${destaque ? "border-sea/40 bg-sea/10" : "border-line bg-white"}`}>
      <div className="flex items-center gap-1.5 text-slate-600">
        <span className={destaque ? "text-sea-deep" : "text-slate-500"}>{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

function Sparkline({ pontos }: { pontos: Snapshot[] }) {
  const dados = pontos
    .filter((p) => typeof p.seguidores === "number")
    .map((p) => ({ v: p.seguidores as number, data: p.data }));

  if (dados.length < 2) {
    return (
      <p className="text-sm text-slate-500">
        {dados.length === 1 ? `${fmt(dados[0].v)} seguidores hoje. ` : ""}
        Coletando histórico… o gráfico aparece conforme os snapshots diários se acumulam.
      </p>
    );
  }

  const w = 640;
  const h = 120;
  const pad = 8;
  const vs = dados.map((d) => d.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (dados.length - 1);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const pontosSvg = dados.map((d, i) => `${pad + i * stepX},${y(d.v)}`).join(" ");

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-ink">{fmt(dados[dados.length - 1].v)}</span>
        <Delta de={dados[0].v} para={dados[dados.length - 1].v} />
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full">
        <polyline points={pontosSvg} fill="none" stroke="#1f8a80" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {dados.length <= 60 &&
          dados.map((d, i) => <circle key={i} cx={pad + i * stepX} cy={y(d.v)} r={2.5} fill="#e06c4f" />)}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{dataCurta(dados[0].data)}</span>
        <span>{dataCurta(dados[dados.length - 1].data)}</span>
      </div>
    </div>
  );
}

function Delta({ de, para }: { de: number; para: number }) {
  const d = para - de;
  if (d === 0) return <span className="text-xs text-slate-500">estável</span>;
  const pos = d > 0;
  return (
    <span className={`text-xs font-semibold ${pos ? "text-sea-deep" : "text-coral"}`}>
      {pos ? "+" : ""}
      {fmt(d)} no período
    </span>
  );
}

// Métricas diárias da conta (Insights da Meta, últimos 30 dias)
const PREFERIDAS: Record<Rede, string[]> = {
  instagram: ["reach", "follower_count", "views", "accounts_engaged", "profile_views", "website_clicks"],
  facebook: ["page_media_view", "page_total_media_view_unique", "page_impressions_unique", "page_post_engagements", "page_daily_follows_unique", "page_views_total"],
};

function MetricasConta({ metricas, rede }: { metricas: Record<string, Serie>; rede: Rede }) {
  const disponiveis = useMemo(() => {
    const pref = PREFERIDAS[rede].filter((m) => (metricas[m]?.length ?? 0) > 0);
    // Só mostra séries (≥ 2 dias); totais de um dia ficam de fora do gráfico
    return pref.filter((m) => metricas[m].length >= 2);
  }, [metricas, rede]);
  const [sel, setSel] = useState<string | null>(null);
  const atual = sel && disponiveis.includes(sel) ? sel : disponiveis[0];

  if (!atual) {
    return (
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Activity size={16} className="text-sea" />
          <h2 className="text-sm font-semibold text-ink">Métricas da conta (30 dias)</h2>
        </div>
        <p className="text-sm text-slate-500">As métricas diárias aparecem após a primeira coleta.</p>
      </section>
    );
  }

  const serie = metricas[atual].filter((p) => typeof p.valor === "number").slice(-30);
  const total = serie.reduce((s, p) => s + (p.valor ?? 0), 0);
  const max = Math.max(1, ...serie.map((p) => p.valor ?? 0));
  const w = 640;
  const h = 120;
  const bw = w / Math.max(1, serie.length);

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-sea" />
          <h2 className="text-sm font-semibold text-ink">Métricas da conta (30 dias)</h2>
        </div>
        <select
          value={atual}
          onChange={(e) => setSel(e.target.value)}
          className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-slate-700 outline-none focus:border-sea"
        >
          {disponiveis.map((m) => (
            <option key={m} value={m}>
              {METRICA_LABEL[m] ?? m}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-2 text-2xl font-bold text-ink">
        {fmt(total)} <span className="text-xs font-medium text-slate-500">no período · média {fmt(total / (serie.length || 1))}/dia</span>
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full">
        {serie.map((p, i) => {
          const bh = ((p.valor ?? 0) / max) * (h - 4);
          return (
            <rect key={p.data} x={i * bw + bw * 0.15} y={h - bh} width={bw * 0.7} height={Math.max(1, bh)} rx={2} fill="#1f8a80">
              <title>{`${dataCurta(p.data)}: ${fmt(p.valor)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{dataCurta(serie[0]?.data)}</span>
        <span>{dataCurta(serie[serie.length - 1]?.data)}</span>
      </div>
    </section>
  );
}

function PostCard({ post, rank, rede }: { post: Post; rank?: number; rede: Rede }) {
  const [imgErro, setImgErro] = useState(false);
  const img = post.thumbnail_url || post.media_url;
  const insights: [React.ReactNode, number | null | undefined, string][] = [
    [<Signal key="a" size={13} className="text-slate-400" />, post.alcance, "alcance"],
    [<Eye key="v" size={13} className="text-slate-400" />, post.views, "views"],
    [<Bookmark key="s" size={13} className="text-slate-400" />, post.salvos, "salvos"],
    [<Share2 key="c" size={13} className="text-slate-400" />, post.compartilhamentos, "compart."],
    [<MousePointerClick key="k" size={13} className="text-slate-400" />, post.cliques, "cliques"],
  ];
  const visiveis = insights.filter(([, v]) => v);

  return (
    <a
      href={post.permalink ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition hover:shadow-md"
    >
      <div className="relative aspect-square bg-sand">
        {img && !imgErro ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={post.legenda?.slice(0, 40) ?? "post"} className="h-full w-full object-cover" loading="lazy" onError={() => setImgErro(true)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-slate-400">
            {post.legenda ? post.legenda.slice(0, 140) : <Grid3x3 size={28} />}
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-ink/75 px-2 py-0.5 text-[11px] font-medium text-sand">{tipoLabel(post)}</span>
        {rank && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-coral text-xs font-bold text-white">
            {rank}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 text-sm text-slate-700">{post.legenda || <span className="text-slate-400">(sem legenda)</span>}</p>
        <div className="mt-auto flex items-center gap-3 pt-3 text-sm">
          <span className="flex items-center gap-1 font-semibold text-coral">
            {rede === "facebook" ? <ThumbsUp size={15} /> : <Heart size={15} />} {fmt(post.curtidas)}
          </span>
          <span className="flex items-center gap-1 font-semibold text-slate-600">
            <MessageCircle size={15} /> {fmt(post.comentarios)}
          </span>
          <span className="ml-auto text-xs text-slate-400">{dataCurta(post.publicado_em)}</span>
          <ExternalLink size={13} className="text-slate-400 opacity-0 transition group-hover:opacity-100" />
        </div>
        {visiveis.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line pt-2 text-xs text-slate-500">
            {visiveis.map(([icon, v, l]) => (
              <span key={l} className="flex items-center gap-1">
                {icon} {fmt(v)} <span className="text-slate-400">{l}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-sand/30 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-ink">{value}</p>
    </div>
  );
}

// Recorte dos últimos 180 dias: leitura do momento atual, sem o peso de posts antigos.
function Janela180({ posts, rede }: { posts: Post[]; rede: Rede }) {
  const [metrica, setMetrica] = useState<"engajamento" | "alcance" | "views">("engajamento");
  const [tipo, setTipo] = useState<string>("todos");
  const [inicio] = useState(() => Date.now() - 180 * 24 * 3600 * 1000);

  const base = useMemo(
    () =>
      posts
        .filter((p) => {
          const t = new Date(p.publicado_em ?? 0).getTime();
          return !Number.isNaN(t) && t >= inicio;
        })
        .sort((a, b) => new Date(b.publicado_em ?? 0).getTime() - new Date(a.publicado_em ?? 0).getTime()),
    [posts, inicio],
  );
  const tipos = useMemo(() => [...new Set(base.map((p) => p.tipo ?? ""))].filter(Boolean), [base]);
  const lista = useMemo(() => (tipo === "todos" ? base : base.filter((p) => p.tipo === tipo)), [base, tipo]);

  const valor = useCallback(
    (p: Post) => (metrica === "alcance" ? p.alcance ?? 0 : metrica === "views" ? p.views ?? 0 : engajamento(p)),
    [metrica],
  );
  const metricaLabel = metrica === "alcance" ? "alcance" : metrica === "views" ? "views" : "engajamento";

  const kpis = useMemo(() => {
    const n = lista.length;
    const media = (f: (p: Post) => number) => (n ? lista.reduce((s, p) => s + f(p), 0) / n : 0);
    return { n, likes: media((p) => p.curtidas ?? 0), coments: media((p) => p.comentarios ?? 0), reach: media((p) => p.alcance ?? 0) };
  }, [lista]);

  const meses = useMemo(() => {
    const start = new Date(inicio);
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const fim = new Date();
    const out: { key: string; label: string; count: number; media: number }[] = [];
    while (cursor <= fim) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const doMes = lista.filter((p) => (p.publicado_em ?? "").slice(0, 7) === key);
      const media = doMes.length ? doMes.reduce((s, p) => s + valor(p), 0) / doMes.length : 0;
      out.push({ key, label: cursor.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), count: doMes.length, media });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }, [lista, inicio, valor]);

  const maxV = Math.max(1, ...meses.map((m) => m.media));
  const w = 640;
  const h = 170;
  const padX = 10;
  const padTop = 26;
  const padBottom = 26;
  const bw = (w - padX * 2) / Math.max(1, meses.length);

  return (
    <div>
      <section className="mb-5 rounded-2xl border border-line bg-white p-5">
        <div className="mb-1 flex items-center gap-2">
          <CalendarRange size={16} className="text-sea" />
          <h2 className="text-sm font-semibold text-ink">Últimos 180 dias · {REDE_LABEL[rede]}</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          De {dataCurta(new Date(inicio).toISOString())} até hoje · {fmt(kpis.n)} publicações. Recorte para ler o momento atual.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniKpi label="Publicações" value={fmt(kpis.n)} />
          <MiniKpi label={rede === "facebook" ? "Reações (média)" : "Curtidas (média)"} value={fmt(kpis.likes)} />
          <MiniKpi label="Comentários (média)" value={fmt(kpis.coments)} />
          <MiniKpi label="Alcance (média)" value={kpis.reach ? fmt(kpis.reach) : "—"} />
        </div>
      </section>

      <section className="mb-5 rounded-2xl border border-line bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Média de {metricaLabel} por mês</h3>
          <Pills
            valor={metrica}
            onChange={setMetrica}
            opcoes={[
              ["engajamento", "Engajamento"],
              ["alcance", "Alcance"],
              ["views", "Views"],
            ]}
          />
        </div>
        {kpis.n === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Sem publicações nos últimos 180 dias.</p>
        ) : (
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full min-w-[420px]">
              {meses.map((m, i) => {
                const bh = (m.media / maxV) * (h - padTop - padBottom);
                const x = padX + i * bw;
                const barW = bw * 0.5;
                const bx = x + (bw - barW) / 2;
                const by = h - padBottom - bh;
                return (
                  <g key={m.key}>
                    <rect x={bx} y={by} width={barW} height={Math.max(0, bh)} rx={4} fill="#1f8a80" />
                    <text x={x + bw / 2} y={by - 6} textAnchor="middle" fontSize={11} fill="#5f5a4f">
                      {m.media ? fmt(m.media) : ""}
                    </text>
                    <text x={x + bw / 2} y={h - 9} textAnchor="middle" fontSize={11} fill="#7f7767">
                      {m.label}
                      {m.count ? ` · ${m.count}` : ""}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
        <p className="mt-1 text-xs text-slate-400">Barras = média de {metricaLabel} por post no mês · o número ao lado do mês é a quantidade de posts.</p>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Pills
            pequeno
            valor={tipo}
            onChange={setTipo}
            opcoes={[["todos", "Todos os tipos"], ...tipos.map((t) => [t, tipoLabel({ id: "", tipo: t })] as [string, string])]}
          />
          <span className="text-xs text-slate-500">{fmt(lista.length)} publicações</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((p) => (
            <PostCard key={p.id} post={p} rede={rede} />
          ))}
        </div>
        {lista.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nenhuma publicação com esse filtro nos últimos 180 dias.</p>}
      </section>
    </div>
  );
}

// Stories do Instagram (efêmeros — o painel guarda o último snapshot antes de expirar)
function Stories({ stories }: { stories: Story[] }) {
  const tot = useMemo(() => {
    const n = stories.length;
    const soma = (f: (s: Story) => number) => stories.reduce((a, s) => a + f(s), 0);
    return {
      n,
      alcance: n ? soma((s) => s.alcance ?? 0) / n : 0,
      views: n ? soma((s) => s.views ?? 0) / n : 0,
      respostas: soma((s) => s.respostas ?? 0),
      compart: soma((s) => s.compartilhamentos ?? 0),
    };
  }, [stories]);

  if (!stories.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center text-sm text-slate-500">
        Nenhum story capturado nos últimos 60 dias. A coleta roda a cada 3h e pega os stories enquanto estão no ar (24h).
      </p>
    );
  }

  return (
    <div>
      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniKpi label="Stories (60 dias)" value={fmt(tot.n)} />
        <MiniKpi label="Alcance médio" value={fmt(tot.alcance)} />
        <MiniKpi label="Views médias" value={fmt(tot.views)} />
        <MiniKpi label="Respostas + compart." value={fmt(tot.respostas + tot.compart)} />
      </section>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stories.map((s) => (
          <a
            key={s.story_id}
            href={s.permalink ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="overflow-hidden rounded-2xl border border-line bg-white transition hover:shadow-md"
          >
            <div className="relative aspect-[9/16] bg-sand">
              {s.thumbnail_url || s.media_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(s.thumbnail_url || s.media_url) ?? undefined} alt="story" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full items-center justify-center text-slate-400">
                  <Clapperboard size={24} />
                </div>
              )}
              <span className="absolute left-2 top-2 rounded-full bg-ink/75 px-2 py-0.5 text-[11px] text-sand">{dataHora(s.publicado_em)}</span>
            </div>
            <div className="grid grid-cols-2 gap-1 p-2 text-[11px] text-slate-500">
              <span>{fmt(s.alcance)} alc.</span>
              <span>{fmt(s.views)} views</span>
              <span>{fmt(s.respostas)} resp.</span>
              <span>{fmt(s.compartilhamentos)} comp.</span>
            </div>
          </a>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        A Meta só disponibiliza a mídia do story enquanto ele está no ar; depois disso a imagem pode não carregar, mas as métricas ficam salvas.
      </p>
    </div>
  );
}
