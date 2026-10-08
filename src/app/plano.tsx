"use client";

// Plano da semana — sugestões de conteúdo por dia, vindas da tabela
// social_planos do Supabase (editável sem novo deploy do painel).
import { useMemo } from "react";
import { CalendarDays, Clock, Film, Image as ImageIcon, LayoutGrid, Radio, Star, Target, Megaphone, Lightbulb } from "lucide-react";
import { REDE_LABEL, type ItemPlano, type Rede } from "./lib";

const FORMATO_ICON: Record<string, React.ReactNode> = {
  Reel: <Film size={13} />,
  Carrossel: <LayoutGrid size={13} />,
  Publicação: <ImageIcon size={13} />,
  Stories: <Radio size={13} />,
};

const OBJETIVO_COR: Record<string, string> = {
  Alcance: "bg-coral/10 text-coral-deep",
  Salvamento: "bg-sun/20 text-amber-700",
  Compartilhamento: "bg-ink/10 text-ink",
  Comunidade: "bg-ink text-sand",
  Afinidade: "bg-sea/15 text-sea-deep",
  Conversão: "bg-fb/10 text-fb",
};

export default function Plano({ itens, rede }: { itens: ItemPlano[]; rede: Rede }) {
  const dias = useMemo(() => {
    const g = new Map<string, ItemPlano[]>();
    for (const it of itens) g.set(it.dia, [...(g.get(it.dia) ?? []), it]);
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [itens]);

  if (!dias.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center text-sm text-slate-500">
        <CalendarDays size={22} className="mx-auto mb-2 text-slate-400" />
        Nenhum plano cadastrado para o {REDE_LABEL[rede]} nesta semana.
        <p className="mt-1 text-xs text-slate-400">
          Os planos ficam na tabela <code>social_planos</code> do Supabase — cada linha é uma sugestão (dia, título, formato, objetivo,
          estratégia, CTA). Assim que houver dados coletados, a aba “Análise de conteúdo” embasa as sugestões.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {dias.map(([dia, opcoes]) => {
        const d = new Date(`${dia}T12:00:00`);
        const cab = opcoes[0];
        return (
          <section key={dia} className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-bold capitalize text-ink">
                {d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {cab.foco && <span className="font-medium text-slate-600">{cab.foco}</span>}
                {cab.horario && (
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {cab.horario}
                  </span>
                )}
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {[...opcoes].sort((a, b) => a.ordem - b.ordem).map((o) => (
                <article
                  key={o.id}
                  className={`flex flex-col rounded-xl border p-4 ${o.recomendada ? "border-sea/50 bg-sea/5" : "border-line bg-sand/30"}`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                    {o.recomendada && (
                      <span className="flex items-center gap-1 rounded-full bg-sea px-2 py-0.5 text-white">
                        <Star size={11} /> Recomendada
                      </span>
                    )}
                    {o.formato && (
                      <span className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-slate-600">
                        {FORMATO_ICON[o.formato] ?? null} {o.formato}
                      </span>
                    )}
                    {o.objetivo && <span className={`rounded-full px-2 py-0.5 ${OBJETIVO_COR[o.objetivo] ?? "bg-white text-slate-600"}`}>{o.objetivo}</span>}
                  </div>
                  <h4 className="font-semibold text-ink">{o.titulo}</h4>
                  {o.resumo && <p className="mt-1 text-sm text-slate-600">{o.resumo}</p>}
                  {o.estrategia && (
                    <p className="mt-2 flex gap-1.5 text-xs text-slate-500">
                      <Lightbulb size={13} className="mt-0.5 shrink-0 text-sun" /> {o.estrategia}
                    </p>
                  )}
                  {o.cta && (
                    <p className="mt-auto flex items-center gap-1.5 pt-3 text-xs font-medium text-slate-600">
                      <Megaphone size={13} className="text-coral" /> {o.cta}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        );
      })}
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Target size={12} /> Sugestões cadastradas em <code>social_planos</code> · mostra a semana corrente e os próximos dias.
      </p>
    </div>
  );
}
