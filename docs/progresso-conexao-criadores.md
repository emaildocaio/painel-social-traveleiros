# Progresso — Conexão de criadores

## Fase 0 — Diagnóstico (31/10 e 01/11/2026) — entregue, aguardando aprovação

- Entregue: `docs/conexao-criadores.md` (branch `fase0-conexao-criadores`, não publicado na `main`).
- Migrations aplicadas: nenhuma.
- Edge Functions em produção: `social-meta-oauth` v8 e `social-coleta` v10. Nenhuma alteração. **O código no GitHub está atrás dessas versões.**
- Acesso ao banco: pelo conector "Supabase Hey Ninja" (`?project_ref=zgpolatyyqxhdwborkbh`), separado do conector "Supabase" da org pessoal.

### Pendências
1. Confirmar o estado das permissões no app Meta (painel ou MCP devtools).
2. Decisão do Caio sobre o teste de acesso de parceiro.
3. Aprovação da Fase 0 para iniciar a Fase 1.

### Primeiros passos da Fase 1 (após aprovação)
1. Comitar no Git o código publicado (v8/v10).
2. Migrations: `hn_convites_conexao`, `social_exclusoes`, colunas novas; tokens no Vault (com backup).
3. Tornar o Caio admin da plataforma (`hn_admins_plataforma` está vazia).

### Próxima sessão
Começar lendo este arquivo e o `docs/conexao-criadores.md`.
