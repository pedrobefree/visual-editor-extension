# Backlog de Evolucao do `befree-visual-edit`

## Objetivo

Expandir a extensao para dar ao usuario mais poder de manipulacao visual de front-end diretamente no browser, preservando a arquitetura atual do projeto e evitando dependencias desnecessarias da implementacao do Onlook.

Este documento consolida:

- os recursos desejados
- a sequencia recomendada de implementacao
- o escopo de cada fase
- os checklists tecnicos de entrega

## Principios

- Priorizar primitivas estruturais de edicao antes de UXs mais sofisticadas.
- Reaproveitar referencias do Onlook apenas quando fizer sentido arquiteturalmente.
- Manter o stack atual leve: extensao + bridge local + parser AST.
- Preferir entregas incrementais com validacao manual simples em apps React/Next.js.
- Separar claramente o que e prioridade imediata do que permanece como backlog.

## Sequencia de Implementacao

A sequencia abaixo substitui a divisao anterior em blocos por uma ordem mais racional de dependencia tecnica.

### Fase 1 - Primitivas estruturais de edicao

1. Inserir elementos
2. Remover elementos
3. Mover elementos por arvore

Motivo:

- `insert`, `remove` e `move` sao a base para quase todo o restante.
- Drag visual, duplicacao, extracao de componente e biblioteca de blocos dependem disso.

### Fase 2 - Biblioteca de assets

4. Biblioteca de imagens com upload, rename, delete e aplicacao no elemento selecionado

Motivo:

- Tem valor alto para o usuario.
- Pode ser entregue sem exigir toda a complexidade de drag livre no canvas.

### Fase 3 - Operacoes visuais de composicao

5. Drag and drop pela arvore de elementos
6. Duplicar elemento ou bloco
7. Criar novos componentes/blocos pelo browser

Motivo:

- Depende de `insert/remove/move`.
- Permite evoluir de edicao de elementos para composicao de UI.

### Fase 4 - Biblioteca externa e importacao assistida

8. Importar componentes, blocos e charts de bibliotecas como Shadcn
9. Conversor de elementos externos em componente React a partir de URL + selector/id

Motivo:

- Aqui o produto passa a ingerir UI externa.
- Exige pipeline de captura, normalizacao e persistencia mais robusta.

### Fase 5 - Ferramentas de produtividade visual

10. Builder de animacoes
11. Ferramentas extras tipo glassmorphism, backdrop, gradient mesh, gradient animator e afins

Motivo:

- Sao multiplicadores de produtividade e UX.
- Ficam melhores quando a base estrutural e de assets ja estiver estavel.

## Status dos Recursos

### 1. Adicionar elementos a tela ou componente

Status: `Parcialmente implementado na Fase 1`

Escopo inicial:

- Inserir `div`
- Inserir texto
- Inserir `button`
- Inserir imagem referenciada por `src`
- Inserir container/grupo simples
- Posicionamento por `append`, `prepend` e `index`

Fora do escopo inicial:

- Insercao livre complexa no canvas com snapping
- Insercao de componentes complexos vindos de bibliotecas externas

Checklist:

- [x] Definir tipos de acao para `insert-element`
- [x] Adicionar suporte no parser para criacao de JSX
- [x] Permitir atributos, texto e filhos basicos
- [x] Permitir insercao em pai alvo por `oid`
- [x] Expor endpoint no bridge para insercao
- [x] Criar UI inicial de insercao na extensao
- [x] Atualizar overlays e layers apos insercao
- [x] Restringir insercao para containers validos e evitar filhos invalidos em `button`, `p`, `span`, headings e afins
- [x] Dar visibilidade melhor ao `group` inserido com estilo default visivel
- [x] Reaproveitar classes ja usadas no projeto ao inserir `button` e `img`, quando disponiveis
- [ ] Validar insercao em `.tsx` e `.jsx`
- [ ] Testar em elementos simples e em componentes reutilizados

### 2. Remover elementos existentes

Status: `Parcialmente implementado na Fase 1`

Escopo inicial:

- Remover elemento selecionado
- Confirmacao basica para evitar remocoes acidentais
- Atualizar selecao e arvore depois da remocao

Checklist:

- [x] Definir tipos de acao para `remove-element`
- [x] Adicionar remocao AST por `oid`
- [x] Garantir preservacao do JSX restante
- [x] Expor endpoint no bridge para remocao
- [x] Adicionar comando de delete na extensao
- [x] Atualizar painel de layers e overlays apos remocao
- [x] Testar remocao de filhos, containers e elementos de texto

### 3. Biblioteca de assets do projeto

Status: `Parcialmente implementado na Fase 2`

Escopo inicial:

- Biblioteca de imagens
- Upload de novas imagens
- Rename de arquivos com atualizacao de referencias
- Delete de arquivos
- Aplicar imagem ao elemento selecionado
- Atualizar `src` de `<img>` e, quando fizer sentido, `background-image`

Escopo posterior:

- Videos
- Audios
- Pastas customizadas alem de `public/` e `src/assets/`

Checklist:

- [x] Mapear diretorios de assets suportados
- [x] Criar leitura/listagem de imagens no bridge
- [x] Criar upload de arquivos no bridge
- [x] Criar rename com atualizacao de referencias em arquivos TSX/JSX
- [x] Criar delete de asset
- [x] Criar painel de assets na extensao
- [x] Permitir aplicar asset ao elemento selecionado
- [x] Permitir inserir nova imagem a partir de um asset selecionado
- [x] Permitir atualizar imagem existente
- [x] Tratar erros de arquivos ausentes, nome duplicado e extensao invalida
- [x] Integrar a biblioteca de assets diretamente ao editor de `img` no painel de propriedades, mantendo `src` manual como fallback
- [x] Substituir dialogs nativos de rename/delete por controles inline no painel
- [x] Permitir usar imagem por URL/path diretamente pela biblioteca de assets
- [x] Substituir input manual de `src` por preview da imagem no painel de propriedades
- [x] Permitir criar atributo `alt` ausente ao salvar propriedades de imagem

### 4. Mover elementos por drag and drop

Status: `Parcialmente implementado na Fase 1`

Escopo inicial:

- Reordenacao pela arvore de elementos
- Restricao inicial a movimentos dentro do mesmo pai
- Persistencia por indice no JSX

Escopo posterior:

- Mover entre pais compativeis
- Drag direto no canvas
- Regras especiais para flex/grid/absolute
- Drag and drop completo na arvore

Checklist:

- [x] Definir tipos de acao para `move-element`
- [x] Adicionar suporte AST para mover por indice
- [x] Expor endpoint no bridge para move
- [x] Adaptar painel de layers para drag and drop inicial
- [ ] Atualizar preview visual durante hover de drop
- [x] Recalcular selecao e overlays apos move
- [x] Testar reordenacao de siblings no mesmo container
- [x] Bloquear casos nao suportados com feedback claro
- [x] Manter elemento selecionado em foco na arvore depois de selecionar ou mover
- [x] Sincronizar melhor overlay e selecao da arvore apos move
- [x] Permitir mover elemento para outro container via drag and drop na arvore

### 5. Duplicar elemento ou bloco

Status: `Parcialmente implementado na Fase 3`

Escopo inicial:

- Duplicar o elemento selecionado logo apos ele no mesmo pai
- Duplicar a subarvore do elemento selecionado
- Remover `data-oid` do clone para evitar OIDs duplicados no codigo
- Atualizar arvore/overlays apos a operacao

Checklist:

- [x] Criar primitiva AST de duplicacao de JSXElement
- [x] Remover OIDs do clone e dos filhos clonados
- [x] Expor acao `duplicate` no bridge
- [x] Adicionar botao de duplicacao no painel de estrutura
- [x] Atualizar checklist da Fase 3
- [x] Selecionar automaticamente a copia apos refresh/indexacao quando possivel
- [ ] Validar duplicacao de componentes reutilizados e elementos com props dinamicas

### 6. Criar novos componentes/blocos pelo browser

Status: `Parcialmente implementado na Fase 3`

Escopo inicial:

- Extrair o elemento selecionado para um novo componente React
- Criar arquivo em `src/components/visual-edit/`
- Substituir o JSX original por uma instancia do novo componente
- Adicionar import no arquivo original
- Cobrir a operacao pelo undo global

Checklist:

- [x] Criar primitiva AST para extrair elemento selecionado
- [x] Remover `data-oid` da subarvore extraida
- [x] Gerar arquivo de componente nomeado
- [x] Inserir import no arquivo original
- [x] Substituir elemento original por `<Componente />`
- [x] Expor acao `componentize` no bridge
- [x] Adicionar acao inicial no painel de estrutura
- [x] Adicionar teste de extracao no parser
- [x] Copiar imports usados pela subarvore extraida para o componente gerado
- [x] Reduzir linhas em branco excessivas geradas ao componentizar
- [x] Inserir componente existente no elemento/container selecionado
- [x] Adicionar import automaticamente ao inserir componente existente
- [x] Substituir prompt nativo por modal/input proprio da extensao
- [ ] Trocar prompt de inserir componente por seletor/dropdown pesquisavel
- [x] Inferir props iniciais para textos estaticos e `src`/`alt` de imagens
- [x] Inferir props para classes estaticas e permitir edicao por instancia quando possivel
- [ ] Permitir escolher pasta/destino do componente
- [ ] Permitir duplicar componente existente antes de editar

### Ajustes de UX e Contexto aplicados na Fase 1

- [x] Ocultar seletor `Aplicacao/Componente` quando o elemento nao estiver em contexto de componente
- [x] Indicar raiz de componente na arvore de elementos
- [x] Adicionar busca por nome nas paletas de cor
- [x] Expandir chips de tipografia com alinhamento, estilo, `leading` e `tracking`
- [x] Permitir editar `src` e `alt` de imagens no painel de conteudo
- [x] Sugerir classes ja usadas no projeto por tipo de elemento
- [x] Exibir sugestoes de classes e presets project-wide vindos do bridge
- [x] Adicionar modo de copiar estilo de outro elemento
- [x] Melhorar UI dos controles estruturais com botoes iconograficos e tooltip
- [x] Diferenciar selecao da arvore por instancia de elemento, e nao apenas por `oid`
- [x] Transformar estilos do projeto em dropdown com busca e preview por hover
- [x] Adicionar undo global no bridge para restaurar a ultima edicao persistida no codigo-fonte
- [ ] Revisar por que classes project-wide como `text-brand-600` ainda podem nao aparecer em alguns projetos/paginas
- [ ] Revisitar a persistencia de `move` na arvore: ainda ha casos em que mover um elemento e tentar movê-lo de volta em seguida falha sem refresh

### 5. Conversor de elementos externos em componente React

Status: `Backlog`

Descricao refinada:

- O usuario informa uma URL e um `selector`, `id` ou outro alvo da pagina.
- O sistema extrai a estrutura desejada e converte isso em um componente React ou em um elemento reaproveitavel dentro do projeto atual.

Desafios principais:

- Captura de HTML e CSS efetivamente usados
- Normalizacao de estilos
- Sanitizacao de scripts e dependencias
- Conversao para JSX limpo
- Adaptacao ao stack do projeto atual

Checklist inicial de descoberta:

- [ ] Definir pipeline de captura da pagina
- [ ] Definir formato de entrada: URL + selector/id
- [ ] Definir estrategia de extracao de estilos
- [ ] Definir conversao HTML -> JSX
- [ ] Definir estrategia de assets externos
- [ ] Definir criterio de insercao no projeto atual

### 6. Importar componentes, blocos e charts de bibliotecas como Shadcn

Status: `Planejado para Fase 4`

Escopo inicial:

- Importacao guiada de blocos/componentes do Shadcn
- Insercao assistida no projeto atual
- Adaptacao minima ao padrao do projeto

Escopo posterior:

- Outras bibliotecas
- Charts
- Ajustes automaticos de tokens/tema

Checklist:

- [ ] Definir fonte inicial de importacao suportada
- [ ] Criar catalogo ou parser de componentes externos
- [ ] Definir formato interno para blocos importados
- [ ] Permitir preview antes da insercao
- [ ] Inserir bloco no projeto via parser/bridge
- [ ] Tratar imports, dependencias e nomes conflitantes

### 7. Criar novos componentes pelo browser

Status: `Planejado para Fase 3`

Escopo inicial:

- Duplicar elemento/bloco existente
- Salvar duplicacao como novo bloco reutilizavel
- Criar componente simples a partir de selecao

Escopo posterior:

- Extracao automatica com props
- Escolha de arquivo/localizacao
- Registro em biblioteca local

Checklist:

- [ ] Implementar duplicacao estrutural
- [ ] Definir operacao de "salvar como componente"
- [ ] Definir template minimo para novo componente
- [ ] Persistir arquivo do novo componente
- [ ] Inserir uso do componente no local de origem
- [ ] Atualizar painel de componentes

### 8. Interface para aplicacao de animacoes

Status: `Planejado para Fase 5`

Escopo inicial:

- Presets de animacao
- Controle visual de duracao, delay, easing e repeticao
- Escrita de classes/utilitarios no elemento selecionado

Escopo posterior:

- Integracao com libs externas de animacao
- Builder mais avancado
- Preview temporal refinado

Checklist:

- [ ] Definir modelo de presets
- [ ] Definir estrategia de escrita em classes Tailwind
- [ ] Criar painel de animacoes
- [ ] Adicionar preview no DOM antes de aplicar
- [ ] Persistir configuracao no codigo
- [ ] Testar conflito com classes existentes

### 9. Ferramentas extras tipo TWColor

Status: `Planejado para Fase 5`

Escopo inicial:

- Glassmorphism
- Backdrop
- Gradient presets
- Gradient animator

Escopo posterior:

- Gradient mesh
- Text effects
- Shadows e glow builders

Checklist:

- [ ] Definir primeira leva de ferramentas
- [ ] Criar geradores de classes/presets
- [ ] Integrar ao painel atual
- [ ] Permitir preview antes de aplicar
- [ ] Garantir composicao com classes existentes

### 10. Objetivo principal de dar mais poder visual ao usuario

Status: `Diretriz permanente`

Indicadores de sucesso:

- O usuario consegue editar estrutura, conteudo e estilo sem sair do browser na maioria dos casos comuns.
- A extensao reduz a necessidade de alterar JSX manualmente para tarefas basicas e intermediarias.
- O fluxo visual continua refletindo o codigo real do projeto.

## Dependencias Tecnicas

### Parser

- Expandir alem de `text`, `class`, `class-add` e `attr`
- Adicionar primitivas estruturais:
  - `insert`
  - `remove`
  - `move`
  - possivelmente `duplicate`

### Bridge

- Expor novas rotas para acoes estruturais
- Atualizar indexacao e refresh de arquivos apos mutacoes
- Adicionar operacoes de assets

### Extensao

- Novos controles de insercao/remocao
- Drag and drop na arvore
- Painel de assets
- Ferramentas visuais especializadas

## Ordem Recomendada de Execucao

- [ ] Fase 1: `insert`, `remove`, `move`
- [ ] Fase 2: assets de imagem
- [ ] Fase 3: drag na arvore, duplicacao e criacao de componentes/blocos
- [ ] Fase 4: importacao de bibliotecas e conversor externo
- [ ] Fase 5: animacoes e ferramentas extras

## Proxima Implementacao

A proxima etapa apos este documento deve ser:

- implementar `insert-element` no parser, bridge e extensao
- em seguida `remove-element`
- depois `move-element` com foco inicial em reordenacao pela arvore
