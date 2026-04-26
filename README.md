# visual-edit-kit

Ferramentas reutilizáveis para edição visual de apps React/Next.js direto do browser, extraídas como base para uma extensão Chrome voltada a alunos de vibe coding.

## Pacotes

- `@visual-edit/parser` — manipulação de AST (OIDs, edição de texto, classes Tailwind).
- `@visual-edit/cli` — CLI de teste que injeta OIDs e aplica edições em arquivos `.tsx`.

## Fase 0 — Validação

```bash
cd packages/cli
bun install
bun run src/index.ts inject-oids ../../fixtures/Sample.tsx
bun run src/index.ts edit-text  ../../fixtures/Sample.tsx <oid> "Novo texto"
bun run src/index.ts edit-class ../../fixtures/Sample.tsx <oid> "bg-blue-500 text-white"
```
