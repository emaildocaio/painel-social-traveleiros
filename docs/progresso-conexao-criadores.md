# Progresso — Conexão de criadores

## Fase 0 — Diagnóstico (31/10 e 01/11/2026) — entregue, aguardando aprovação

- Entregue: `docs/conexao-criadores.md` (branch `fase0-conexao-criadores`, não publicado na `main`).
- Migrations aplicadas: nenhuma.
- Edge Functions em produção: `social-meta-oauth` v8 e `social-coleta` v10. Nenhuma alteração. **O código no GitHub está atrás dessas versões.**
- Acesso ao banco: pelo conector "Supabase Hey Ninja" (`?project_ref=zgpolatyyqxhdwborkbh`), separado do conector "Supabase" da org pessoal.

### Pendências
1. ~~Estado das permissões~~ ✅ todas em Acesso padrão (01/11).
2. Teste de acesso de parceiro: Página de teste `100069758125233` (facebook.com/profile.php?id=100069758125233). Aguardando o compartilhamento como parceiro e o token do usuário do sistema.
3. ~~Funções do app~~ ✅ gerenciadas pelo portfólio Publizeiros desde 01/11 (testadores de fora: botão Adicionar pessoas no app).
4. ~~Portfólio Publizeiros verificado?~~ ✅ sim (confirmado pelo Caio em 01/11). Limite de 500 testadores.
5. Aprovação da Fase 0 para iniciar a Fase 1.

### Primeiros passos da Fase 1 (após aprovação)
1. Comitar no Git o código publicado (v8/v10).
2. Migrations: `hn_convites_conexao`, `social_exclusoes`, colunas novas; tokens no Vault (com backup).
3. Tornar o Caio admin da plataforma (`hn_admins_plataforma` está vazia).

### Portfólio do app (01/11)
- 11:18: app ligado ao portfólio verificado "stayarraial"; 11:26: o Caio removeu. Decisão: ligar ao portfólio da **Publizeiros**.
- 11:46: solicitação enviada ao portfólio **Publizeiros (ID 1099752320677908)**, pendente. Falta o dono aprovar em Solicitações → Recebidas e confirmar se o portfólio é verificado. A aprovação transfere a propriedade do app e, segundo a Meta, não pode ser desfeita.
- 12:26: **aprovado**. App gerenciado pela Publizeiros. Coleta da Traveleiros conferida depois da troca: stories 12:20 ok, conexão verificada 12:26.

### Próxima sessão
Começar lendo este arquivo e o `docs/conexao-criadores.md`.
