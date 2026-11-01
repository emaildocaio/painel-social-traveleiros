# Progresso — Conexão de criadores

## Fase 0 — Diagnóstico (31/10 e 01/11/2026) — entregue, aguardando aprovação

- Entregue: `docs/conexao-criadores.md` (branch `fase0-conexao-criadores`, não publicado na `main`).
- Migrations aplicadas: nenhuma.
- Edge Functions em produção: `social-meta-oauth` v8 e `social-coleta` v10. Nenhuma alteração. **O código no GitHub está atrás dessas versões.**
- Acesso ao banco: pelo conector "Supabase Hey Ninja" (`?project_ref=zgpolatyyqxhdwborkbh`), separado do conector "Supabase" da org pessoal.

### Pendências
1. ~~Estado das permissões~~ ✅ todas em Acesso padrão (01/11).
2. Teste de acesso de parceiro: o Caio decidiu rodar; falta escolher a Página.
3. Confirmar se as funções do app são geridas pelo portfólio (Funções do app → Funções).
4. Decisão do Caio sobre o teste de acesso de parceiro.
5. Aprovação da Fase 0 para iniciar a Fase 1.

### Primeiros passos da Fase 1 (após aprovação)
1. Comitar no Git o código publicado (v8/v10).
2. Migrations: `hn_convites_conexao`, `social_exclusoes`, colunas novas; tokens no Vault (com backup).
3. Tornar o Caio admin da plataforma (`hn_admins_plataforma` está vazia).

### Portfólio do app (01/11)
- 11:18: app ligado ao portfólio verificado "stayarraial"; 11:26: o Caio removeu. Decisão: ligar ao portfólio da **Publizeiros**.
- Aguardando o dono do portfólio Publizeiros: confirmar a verificação, enviar a identificação do portfólio e aprovar a solicitação. A aprovação transfere a propriedade do app e, segundo a Meta, não pode ser desfeita.

### Próxima sessão
Começar lendo este arquivo e o `docs/conexao-criadores.md`.
