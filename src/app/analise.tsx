"use client";

// Análise de conteúdo — calculada a partir dos dados coletados (sem texto fixo):
// tendência por ano, funil alcance/salvamentos/compartilhamentos, formatos,
// gatilhos de conversa, tamanho de legenda, timing (BRT), hashtags/menções e
// recomendações geradas pelas próprias medianas.
import { useMemo, useState } from "react";
import { TrendingUp, Sparkles, AlertTriangle, MessageSquare, Clock, Hash, Target, Lightbulb, Radio, Bookmark, Share2, CalendarDays } from "lucide-react";
import { anoDe, avg, diaBRT, engajamento as eng, fmt, horaBRT, median, REDE_LABEL, tipoLabel, type Post, type Rede } from "./lib";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const engOnReach = (p: Post) =>
  (p.alcance ?? 0) > 0 ? ((p.curtidas ?? 0) + (p.comentarios ?? 0) + (p.salvos ?? 0) + (p.compartilhamentos ?? 0)) / (p.alcance as number) : 0;

function VBars({ dados, cor = "var(--color-sea)", altura = 120 }: { dados: { label: string; valor: number; destaque?: boolean }[]; cor?: string; altura?: number }) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ height: altura + 48 }}>
      {dados.map((d) => (
        <div key={d.label} className="flex min-w-[34px] flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[11px] font-semibold text-slate-600">{fmt(d.valor)}</span>
          <div
            className="w-full rounded-t"
            style={{ height: Math.max(2, (d.valor / max) * altura), background: d.destaque ? "var(--color-coral)" : cor }}
            title={`${d.label}: ${fmt(d.valor)}`}
          />
          <span className="whitespace-nowrap text-[11px] text-slate-500">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-white p-5 ${className}`}>{children}</div>;
}
function Titulo({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-sea">{icon}</span>
      <h3 className="text-base font-bold text-ink">{children}</h3>
    </div>
  );
}

function Lista({ posts, valor, cor = "text-coral", n = 55 }: { posts: Post[]; valor: (p: Post) => string; cor?: string; n?: number }) {
  return (
    <ul className="space-y-1.5">
      {posts.map((p) => (
        <li key={p.id} className="flex items-center gap-2 text-sm">
          <span className={`w-20 shrink-0 font-semibold ${cor}`}>{valor(p)}</span>
          <a href={p.permalink ?? undefined} target="_blank" rel="noreferrer" className="truncate text-slate-600 hover:underline">
            {(p.legenda ?? "").replace(/\n/g, " ").slice(0, n) || "(sem legenda)"}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function Analise({ posts, seguidores, rede }: { posts: Post[]; seguidores?: number; rede: Rede }) {
  const base = useMemo(() => posts.filter((p) => p.publicado_em), [posts]);
  const [umAno] = useState(() => Date.now() - 365 * 86400_000);
  const recentes = useMemo(() => base.filter((p) => new Date(p.publicado_em!).getTime() >= umAno), [base, umAno]);
  const comAlcance = useMemo(() => base.filter((p) => (p.alcance ?? 0) > 0), [base]);

  const porAno = useMemo(() => {
    const g: Record<string, Post[]> = {};
    for (const p of base) (g[String(anoDe(p))] ||= []).push(p);
    return Object.keys(g).sort().map((y) => ({ ano: y, n: g[y].length, medianaEng: median(g[y].map(eng)) }));
  }, [base]);

  const cadencia = useMemo(() => {
    const out: { label: string; valor: number }[] = [];
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 11);
    for (let i = 0; i < 12; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push({ label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), valor: base.filter((p) => p.publicado_em!.slice(0, 7) === key).length });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }, [base]);

  const funil = useMemo(
    () => ({
      medReach: median(comAlcance.map((p) => p.alcance ?? 0)),
      medTaxa: median(comAlcance.map(engOnReach)),
      topReach: [...comAlcance].sort((a, b) => (b.alcance ?? 0) - (a.alcance ?? 0)).slice(0, 6),
      topSaved: [...base].filter((p) => (p.salvos ?? 0) > 0).sort((a, b) => (b.salvos ?? 0) - (a.salvos ?? 0)).slice(0, 6),
      topShares: [...base].filter((p) => (p.compartilhamentos ?? 0) > 0).sort((a, b) => (b.compartilhamentos ?? 0) - (a.compartilhamentos ?? 0)).slice(0, 6),
    }),
    [base, comAlcance],
  );

  const porTipo = useMemo(() => {
    const g: Record<string, Post[]> = {};
    for (const p of base) (g[tipoLabel(p) || "?"] ||= []).push(p);
    return Object.entries(g)
      .map(([tipo, arr]) => ({
        tipo,
        n: arr.length,
        pct: Math.round((100 * arr.length) / (base.length || 1)),
        medianaEng: median(arr.map(eng)),
        medianaAlc: median(arr.filter((p) => (p.alcance ?? 0) > 0).map((p) => p.alcance ?? 0)),
      }))
      .sort((a, b) => b.n - a.n);
  }, [base]);

  const porHora = useMemo(() => {
    const g: Record<number, number[]> = {};
    for (const p of base) (g[horaBRT(p.publicado_em)] ||= []).push(eng(p));
    return Array.from({ length: 24 }, (_, h) => ({ h, label: `${h}h`, valor: g[h] ? avg(g[h]) : 0, n: g[h]?.length ?? 0 })).filter((d) => d.n > 0);
  }, [base]);
  const porDia = useMemo(() => {
    const g: Record<number, number[]> = {};
    for (const p of base) (g[diaBRT(p.publicado_em)] ||= []).push(eng(p));
    return DIAS.map((label, i) => ({ label, valor: g[i] ? avg(g[i]) : 0, n: g[i]?.length ?? 0 }));
  }, [base]);
  const melhoresHoras = useMemo(() => [...porHora].filter((d) => d.n >= 3).sort((a, b) => b.valor - a.valor).slice(0, 3), [porHora]);
  const melhoresDias = useMemo(() => [...porDia].filter((d) => d.n >= 3).sort((a, b) => b.valor - a.valor).slice(0, 3), [porDia]);

  const legenda = useMemo(() => {
    const buckets: [string, (l: number) => boolean][] = [
      ["0–99", (l) => l < 100],
      ["100–299", (l) => l >= 100 && l < 300],
      ["300–599", (l) => l >= 300 && l < 600],
      ["600–999", (l) => l >= 600 && l < 1000],
      ["1000+", (l) => l >= 1000],
    ];
    return buckets.map(([label, f]) => {
      const g = base.filter((p) => f((p.legenda ?? "").length));
      return { label, valor: median(g.map(eng)), n: g.length };
    });
  }, [base]);

  const top = useMemo(() => [...base].sort((a, b) => eng(b) - eng(a)).slice(0, 6), [base]);
  const piores = useMemo(() => [...(recentes.length >= 10 ? recentes : base)].sort((a, b) => eng(a) - eng(b)).slice(0, 5), [base, recentes]);
  const limiarDebate = useMemo(() => median(base.map((p) => p.curtidas ?? 0)), [base]);
  const debate = useMemo(
    () =>
      [...base]
        .filter((p) => (p.curtidas ?? 0) >= Math.max(5, limiarDebate))
        .sort((a, b) => (b.comentarios ?? 0) / (b.curtidas || 1) - (a.comentarios ?? 0) / (a.curtidas || 1))
        .slice(0, 5),
    [base, limiarDebate],
  );

  const contar = (re: RegExp) => {
    const c: Record<string, number> = {};
    base.forEach((p) => (p.legenda ?? "").toLowerCase().match(re)?.forEach((t) => (c[t] = (c[t] ?? 0) + 1)));
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 14);
  };
  const hashtags = useMemo(() => contar(/#[\wà-ÿ]+/g), [base]); // eslint-disable-line react-hooks/exhaustive-deps
  const mentions = useMemo(() => contar(/@[\w.]+/g), [base]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- leitura automática ----------
  const anosCompletos = porAno.filter((y) => y.n >= 5);
  const primeiro = anosCompletos[0];
  const ultimo = anosCompletos[anosCompletos.length - 1];
  const variacao = primeiro && ultimo && primeiro !== ultimo && primeiro.medianaEng > 0 ? (ultimo.medianaEng - primeiro.medianaEng) / primeiro.medianaEng : null;
  const postsMes12 = avg(cadencia.map((c) => c.valor));
  const mesesParados = cadencia.filter((c) => c.valor === 0).length;
  const melhorFormatoAlc = [...porTipo].filter((t) => t.n >= 3 && t.medianaAlc > 0).sort((a, b) => b.medianaAlc - a.medianaAlc)[0];
  const melhorFormatoEng = [...porTipo].filter((t) => t.n >= 3).sort((a, b) => b.medianaEng - a.medianaEng)[0];
  const melhorLegenda = [...legenda].filter((l) => l.n >= 3).sort((a, b) => b.valor - a.valor)[0];

  if (base.length < 5) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center text-sm text-slate-500">
        A análise de conteúdo aparece quando houver pelo menos 5 posts coletados no {REDE_LABEL[rede]}. O histórico completo é
        importado automaticamente após a conexão.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-sea/30 bg-sea/5">
        <Titulo icon={<TrendingUp size={16} />}>Diagnóstico · {REDE_LABEL[rede]}</Titulo>
        <p className="text-base leading-relaxed text-slate-700">
          Base de <b>{fmt(base.length)} posts</b>
          {porAno.length ? ` (${porAno[0].ano}–${porAno[porAno.length - 1].ano})` : ""}. Nos últimos 12 meses a conta publicou em média{" "}
          <b>{postsMes12.toFixed(1).replace(".", ",")} posts/mês</b>
          {mesesParados > 0 ? (
            <>
              {" "}e ficou <b>{mesesParados} {mesesParados === 1 ? "mês" : "meses"} sem publicar</b> — consistência é o que o algoritmo mais premia.
            </>
          ) : (
            " sem meses parados."
          )}{" "}
          {variacao !== null && (
            <>
              A mediana de engajamento por post foi de <b>{fmt(primeiro.medianaEng)}</b> em {primeiro.ano} para <b>{fmt(ultimo.medianaEng)}</b> em {ultimo.ano} (
              <b className={variacao >= 0 ? "text-sea-deep" : "text-coral"}>
                {variacao >= 0 ? "+" : ""}
                {Math.round(variacao * 100)}%
              </b>
              ).
            </>
          )}
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-500">Mediana de engajamento por ano</p>
            <VBars dados={porAno.map((y) => ({ label: y.ano, valor: y.medianaEng, destaque: y === ultimo }))} />
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-500">
              <CalendarDays size={14} /> Posts por mês (12 meses)
            </p>
            <VBars dados={cadencia} cor="var(--color-sun)" />
          </div>
        </div>
      </Card>

      {comAlcance.length > 0 && (
        <Card>
          <Titulo icon={<Radio size={16} />}>Alcance, salvamentos &amp; compartilhamentos (funil)</Titulo>
          <p className="mb-4 text-base leading-relaxed text-slate-700">
            Mediana de alcance por post: <b>{fmt(funil.medReach)}</b>
            {seguidores ? <> (~{Math.round((100 * funil.medReach) / seguidores)}% dos seguidores)</> : null}. Quando alcança, o conteúdo
            converte <b>{(funil.medTaxa * 100).toFixed(1).replace(".", ",")}%</b> do alcance em interação (curtidas, comentários, salvos e
            compartilhamentos).
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-line bg-sand/30 p-3">
              <div className="mb-2 flex items-center gap-1.5 font-bold text-sea-deep">
                <Radio size={15} /> Alcance
              </div>
              <Lista posts={funil.topReach} valor={(p) => `${fmt(p.alcance)} alc.`} cor="text-sea-deep" />
            </div>
            <div className="rounded-xl border border-line bg-sand/30 p-3">
              <div className="mb-2 flex items-center gap-1.5 font-bold text-sun">
                <Bookmark size={15} /> Salvamentos
              </div>
              {funil.topSaved.length ? (
                <Lista posts={funil.topSaved} valor={(p) => `${fmt(p.salvos)} salv.`} cor="text-amber-600" />
              ) : (
                <p className="text-sm text-slate-400">{rede === "facebook" ? "O Facebook não informa salvamentos." : "Sem dados ainda."}</p>
              )}
            </div>
            <div className="rounded-xl border border-line bg-sand/30 p-3">
              <div className="mb-2 flex items-center gap-1.5 font-bold text-coral">
                <Share2 size={15} /> Compartilhamentos
              </div>
              <Lista posts={funil.topShares} valor={(p) => `${fmt(p.compartilhamentos)} comp.`} />
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <Titulo icon={<Sparkles size={16} />}>O que funciona (top engajamento)</Titulo>
          <Lista posts={top} valor={(p) => `${fmt(eng(p))} eng.`} n={60} />
        </Card>
        <Card>
          <Titulo icon={<AlertTriangle size={16} />}>O que não funciona {recentes.length >= 10 ? "(últimos 12 meses)" : ""}</Titulo>
          <Lista posts={piores} valor={(p) => `${fmt(eng(p))} eng.`} cor="text-slate-400" n={60} />
        </Card>
      </div>

      <Card>
        <Titulo icon={<Target size={16} />}>Formato</Titulo>
        <div className="grid gap-2 sm:grid-cols-2">
          {porTipo.map((t) => (
            <div key={t.tipo} className="flex items-center justify-between rounded-lg border border-line bg-sand/40 px-3 py-2 text-sm">
              <span className="font-medium text-ink">{t.tipo}</span>
              <span className="text-slate-500">
                {t.pct}% · mediana {fmt(t.medianaEng)} eng.{t.medianaAlc ? ` · ${fmt(t.medianaAlc)} alc.` : ""}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <Titulo icon={<MessageSquare size={16} />}>Gatilhos de conversa</Titulo>
          <p className="mb-3 text-sm text-slate-600">Maior razão comentário/curtida — o que faz a audiência responder:</p>
          <Lista posts={debate} valor={(p) => `${fmt(p.comentarios)} 💬`} cor="text-sea-deep" />
        </Card>
        <Card>
          <Titulo icon={<Hash size={16} />}>Tamanho de legenda</Titulo>
          <p className="mb-3 text-sm text-slate-600">Mediana de engajamento por faixa de caracteres:</p>
          <VBars dados={legenda.map((l) => ({ label: l.label, valor: l.valor, destaque: l === melhorLegenda }))} altura={90} cor="var(--color-sun)" />
        </Card>
      </div>

      <Card>
        <Titulo icon={<Clock size={16} />}>Timing (horário de Brasília)</Titulo>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-500">Engajamento médio por horário</p>
            <VBars dados={porHora.map((d) => ({ label: d.label, valor: d.valor, destaque: melhoresHoras.includes(d) }))} altura={90} />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-500">Engajamento médio por dia</p>
            <VBars dados={porDia.map((d) => ({ label: d.label, valor: d.valor, destaque: melhoresDias.includes(d) }))} altura={90} cor="var(--color-sun)" />
          </div>
        </div>
      </Card>

      <Card>
        <Titulo icon={<Hash size={16} />}>Hashtags &amp; menções mais usadas</Titulo>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-wrap gap-1">
            {hashtags.length ? hashtags.map(([t, c]) => (
              <span key={t} className="rounded-full bg-sand px-2 py-0.5 text-sm text-slate-600">{t} · {c}</span>
            )) : <span className="text-sm text-slate-400">Nenhuma hashtag.</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            {mentions.length ? mentions.map(([t, c]) => (
              <span key={t} className="rounded-full border border-line bg-white px-2 py-0.5 text-sm text-slate-600">{t} · {c}</span>
            )) : <span className="text-sm text-slate-400">Nenhuma menção.</span>}
          </div>
        </div>
      </Card>

      <Card className="border-sun/50 bg-sun/5">
        <Titulo icon={<Lightbulb size={16} />}>Recomendações a partir dos dados</Titulo>
        <ol className="list-decimal space-y-1.5 pl-5 text-base text-slate-700">
          {melhorFormatoAlc && (
            <li>
              <b>{melhorFormatoAlc.tipo}</b> é o formato que mais alcança (mediana {fmt(melhorFormatoAlc.medianaAlc)}) — use para atrair gente nova.
            </li>
          )}
          {melhorFormatoEng && melhorFormatoEng !== melhorFormatoAlc && (
            <li>
              <b>{melhorFormatoEng.tipo}</b> é o que mais engaja (mediana {fmt(melhorFormatoEng.medianaEng)}) — use para relacionamento com quem já segue.
            </li>
          )}
          {melhoresDias.length > 0 && melhoresHoras.length > 0 && (
            <li>
              Priorize <b>{melhoresDias.map((d) => d.label).join(", ")}</b> nas janelas de <b>{melhoresHoras.map((h) => h.label).join(", ")}</b>.
            </li>
          )}
          {melhorLegenda && (
            <li>
              Legendas na faixa de <b>{melhorLegenda.label} caracteres</b> têm a melhor mediana de engajamento.
            </li>
          )}
          <li>
            {mesesParados > 0 || postsMes12 < 8 ? (
              <>Ganhe <b>consistência</b>: hoje são {postsMes12.toFixed(1).replace(".", ",")} posts/mês — uma base de 3 a 4 por semana mantém a conta “quente” para o algoritmo.</>
            ) : (
              <>A cadência está boa ({postsMes12.toFixed(1).replace(".", ",")} posts/mês) — o foco agora é qualidade e formato.</>
            )}
          </li>
        </ol>
        <p className="mt-3 text-xs text-slate-400">Calculado automaticamente a cada atualização; horários/dias consideram só faixas com 3+ posts.</p>
      </Card>
    </div>
  );
}
