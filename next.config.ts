import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Painel social PRIVADO — Traveleiros (Instagram + Facebook).
//  • Local (sem GITHUB_PAGES): `next dev` na raiz.
//  • GitHub Pages (GITHUB_PAGES=true no workflow): export estático em out/,
//    sob o basePath /painel-social-traveleiros.
// O painel é só a "casca": nenhum dado vem no build. Tudo é buscado em runtime
// na função social_feed do Supabase, que exige a senha do grupo.
// ---------------------------------------------------------------------------
const ghPages = process.env.GITHUB_PAGES === "true";
const repo = "painel-social-traveleiros";

const nextConfig: NextConfig = ghPages
  ? {
      output: "export",
      basePath: `/${repo}`,
      images: { unoptimized: true },
      trailingSlash: true,
    }
  : {};

export default nextConfig;
