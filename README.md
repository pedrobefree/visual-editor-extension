# befree-visual-edit

Editor visual para projetos React e Next.js. Edite textos, classes Tailwind, variáveis de tema e muito mais diretamente no browser — as alterações são salvas automaticamente no seu código-fonte.

## Instalação

```bash
npm install -D befree-visual-edit
npx befree-visual-edit init
```

Depois, inicie seu projeto normalmente:

```bash
npm run dev
```

A bridge sobe automaticamente junto com o servidor de desenvolvimento.

## O que você pode editar

- **Texto** — dê duplo clique em qualquer texto para editar inline
- **Classes Tailwind** — clique em qualquer elemento e modifique suas classes
- **Tema** — altere cores da marca e famílias de fontes
- **Componentes** — navegue pela árvore de componentes e visualize componentes isolados
- **Responsivo** — simule breakpoints sem redimensionar a janela

## Como funciona

O Visual Edit opera com duas partes:

1. **Plugin Vite/Babel** — injeta marcadores `data-oid` no seu JSX em tempo de compilação para que a extensão consiga identificar cada elemento
2. **Bridge server** — servidor HTTP local (porta 5179) que recebe as edições da extensão e as aplica nos seus arquivos-fonte

Após rodar `npx befree-visual-edit init`, o `npm run dev` já inicia os dois juntos.

## Requisitos

- Projeto React ou Next.js
- Node.js 18+
- Browser Chrome
- Extensão befree-visual-edit instalada no Chrome

## Comandos disponíveis

```bash
npx befree-visual-edit init     # configura o projeto (execute uma vez)
npx befree-visual-edit bridge   # inicia só o bridge server

npm run dev                     # bridge + dev server juntos (após o init)
npm run dev:edit                # mesmo que dev (alternativa)
npm run bridge                  # só o bridge
```

## Configuração manual — Vite

Se preferir configurar sem rodar `init`:

```ts
// vite.config.ts
import { visualEditPlugin } from 'befree-visual-edit/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), visualEditPlugin()],
});
```

## Configuração manual — Next.js

```json
// .babelrc
{
  "presets": ["next/babel"],
  "plugins": ["befree-visual-edit/babel"]
}
```

> **Atenção:** usar o plugin Babel no Next.js desativa a compilação SWC. Isso é esperado em ambiente de desenvolvimento.

---

## Estrutura interna (monorepo)

| Pacote | Responsabilidade |
|--------|-----------------|
| `packages/befree-visual-edit` | Pacote publicado no npm — CLI + plugins |
| `packages/bridge` | Servidor HTTP local que aplica edições nos arquivos |
| `packages/setup` | Vite plugin, Babel plugin e script de init |
| `packages/parser` | Manipulação de AST (OIDs, Tailwind, texto) |
| `packages/extension` | Extensão Chrome |

### Build da extensão

```bash
cd packages/extension
bun run build.ts
# Carregue a pasta dist/ no Chrome em chrome://extensions
```

### Build do pacote npm

```bash
cd packages/befree-visual-edit
bun run build.ts
```
