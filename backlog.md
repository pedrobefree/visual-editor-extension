# Backlog de Evolucao do `befree-visual-edit`

## Objetivo

Expandir a extensao para dar ao usuario mais poder de manipulacao visual de front-end diretamente no browser, preservando a arquitetura atual do projeto e evitando dependencias desnecessarias.

Este arquivo passa a funcionar como:

- visao geral do produto
- status consolidado dos recursos
- roadmap por fases
- plano da proxima frente de desenvolvimento

## Principios

- Priorizar primitivas estruturais antes de UXs mais sofisticadas.
- Manter o stack leve: extensao + bridge local + parser AST.
- Entregar em fatias incrementais com validacao manual simples em apps React/Next.js.
- Separar claramente o que esta operacional, o que ainda precisa consolidacao e o que ainda esta em descoberta.
- Evitar abrir novas frentes grandes antes de fechar bem a frente atual.

## Leitura Rapida do Status

### Recursos considerados implementados para fins de roadmap

Os recursos abaixo passam a ser tratados como implementados nesta fase de planejamento. Pendencias de validacao podem ser revisitadas depois em rodadas dedicadas de QA.

1. Adicionar elementos a tela ou componente
2. Remover elementos existentes
3. Biblioteca de assets do projeto
4. Mover elementos por drag and drop
5. Duplicar elemento ou bloco

### Recurso em consolidacao (ciclo atual concluido)

6. Criar novos componentes/blocos pelo browser

### Recursos ainda 100% pendentes

7. Conversor de elementos externos em componente React
8. Importar componentes, blocos e charts de bibliotecas como Shadcn
9. Interface para aplicacao de animacoes
10. Ferramentas extras tipo TWColor

## Roadmap Reorganizado

### Fase A - Base estrutural

Objetivo:

- permitir manipulacao estrutural segura do JSX pelo browser

Escopo:

- inserir elementos
- remover elementos
- mover elementos
- duplicar elementos/blocos

Status:

- funcional para fins de roadmap

Observacoes:

- validacoes restantes ficam para QA posterior

### Fase B - Biblioteca local de assets

Objetivo:

- permitir reaproveitamento e aplicacao rapida de imagens do projeto

Escopo:

- listagem de assets
- upload
- rename com atualizacao de referencias
- delete
- aplicacao em `img` e fluxos relacionados

Status:

- funcional para fins de roadmap

### Fase C - Autoria de componentes pelo browser

Objetivo:

- evoluir de edicao estrutural para composicao real de UI reutilizavel

Escopo macro:

- extrair selecao para componente React
- inserir componente existente
- transformar o fluxo atual em um construtor simples de blocos/componentes

Status:

- parcialmente implementado

Motivo da prioridade:

- aproveita a base AST e bridge ja prontas
- entrega valor alto sem abrir a complexidade de ingestao externa
- destrava a futura importacao de blocos/bibliotecas

### Fase D - Ingestao externa e importacao assistida

Objetivo:

- trazer UI externa ou de bibliotecas para dentro do projeto atual

Escopo macro:

- importar componentes/blocos/charts de bibliotecas como Shadcn
- converter trechos externos por URL + selector em componente React

Status:

- nao iniciado

Observacoes:

- esta fase exige pipeline nova de captura, normalizacao e persistencia
- deve vir depois da consolidacao da Fase C

### Fase E - Ferramentas de produtividade visual

Objetivo:

- acelerar refinamentos visuais sem exigir edicao manual de classes

Escopo macro:

- presets e editor de animacoes
- ferramentas extras tipo glassmorphism, backdrop, gradients e afins

Status:

- nao iniciado

Observacoes:

- idealmente depende de uma base estrutural e de componentes mais estavel

## Status Detalhado dos Recursos

### 1. Adicionar elementos a tela ou componente

Status: `Implementado para roadmap`

Escopo atual coberto:

- inserir `div`
- inserir texto
- inserir `button`
- inserir imagem referenciada por `src`
- inserir container/grupo simples
- posicionamento por `append`, `prepend` e `index`

Pendencias movidas para QA:

- validar insercao em `.tsx` e `.jsx`

### 2. Remover elementos existentes

Status: `Implementado para roadmap`

Escopo atual coberto:

- remover elemento selecionado
- confirmacao basica
- atualizar selecao e arvore apos remocao

### 3. Biblioteca de assets do projeto

Status: `Implementado para roadmap`

Escopo atual coberto:

- biblioteca de imagens
- upload
- rename com atualizacao de referencias
- delete
- aplicar imagem ao elemento selecionado
- atualizar `src` de `<img>` e fluxos relacionados

Evolucoes futuras possiveis:

- videos
- audios
- pastas customizadas alem de `public/` e `src/assets/`

### 4. Mover elementos por drag and drop

Status: `Implementado para roadmap`

Escopo atual coberto:

- reordenacao pela arvore
- persistencia estrutural no JSX
- mover para outro container suportado pela arvore

Pendencias movidas para QA/UX:

- revisar preview visual durante hover de drop

### 5. Duplicar elemento ou bloco

Status: `Implementado para roadmap`

Escopo atual coberto:

- duplicar o elemento selecionado logo apos ele
- duplicar subarvore
- remover `data-oid` do clone
- atualizar arvore e overlays

Pendencias movidas para QA:

- validar duplicacao de componentes reutilizados e elementos com props dinamicas

### 6. Criar novos componentes/blocos pelo browser

Status: `Parcialmente implementado`

Ja existe:

- extrair o elemento selecionado para um novo componente React
- criar arquivo em `src/components/visual-edit/`
- substituir o JSX original por uma instancia do novo componente
- adicionar import no arquivo original
- inserir componente existente no elemento/container selecionado
- inferir props iniciais para textos estaticos, `src`, `alt` e classes estaticas

Concluido neste ciclo:

- [x] permitir escolher pasta/destino do componente
- [x] duplicar componente existente antes de editar (endpoint /component-duplicate + UI no painel)
- [x] fluxo de "salvar como bloco" e "criar variacao" via presets MVP
- [x] biblioteca local diferencia componentes criados pelo browser (badge + secao separada)
- [x] builder MVP por presets: Section, Card, Hero, Feature Grid, CTA

### 7. Conversor de elementos externos em componente React

Status: `Backlog de descoberta`

Descricao:

- o usuario informa uma URL e um `selector`, `id` ou alvo equivalente
- o sistema extrai a estrutura desejada e converte isso em um componente React reaproveitavel

Desafios:

- captura de HTML e CSS efetivamente usados
- normalizacao de estilos
- sanitizacao de scripts e dependencias
- conversao HTML -> JSX limpo
- adaptacao ao stack do projeto atual
- tratamento de assets externos

### 8. Importar componentes, blocos e charts de bibliotecas como Shadcn

Status: `Backlog de descoberta`

Escopo inicial desejado:

- importacao guiada de blocos/componentes do Shadcn
- insercao assistida no projeto atual
- adaptacao minima ao padrao do projeto

Pontos a definir:

- fonte inicial de importacao suportada
- formato interno para blocos importados
- preview antes da insercao
- tratamento de imports, dependencias e conflitos de nome

### 9. Interface para aplicacao de animacoes

Status: `Backlog`

Escopo inicial desejado:

- presets de animacao
- controle visual de duracao, delay, easing e repeticao
- escrita de classes/utilitarios no elemento selecionado

Pontos a definir:

- modelo de presets
- estrategia de escrita em classes Tailwind
- preview no DOM antes de aplicar
- conflitos com classes existentes

### 10. Ferramentas extras tipo TWColor

Status: `Backlog`

Escopo inicial desejado:

- glassmorphism
- backdrop
- gradient presets
- gradient animator

Escopo posterior:

- gradient mesh
- text effects
- shadow/glow builders

## Proxima Frente Recomendada

### Prioridade atual

Consolidar o recurso 6: `Criar novos componentes/blocos pelo browser`.

Racional:

- e a frente com melhor relacao entre valor entregue e risco tecnico
- reutiliza parser, bridge e extensao ja existentes
- evita abrir cedo demais a complexidade de ingestao externa
- cria a base certa para Shadcn, blocos importados e conversor externo

### Objetivo do proximo ciclo

Transformar a componentizacao atual em um fluxo real de autoria de componentes/blocos.

### Escopo sugerido para o proximo ciclo

1. Escolha de pasta/destino ao criar componente
2. Duplicar componente existente antes de editar
3. Definir acao de "salvar como bloco" ou "criar variacao"
4. Melhorar a biblioteca local para destacar componentes criados pelo browser
5. Criar um MVP de construtor baseado em presets locais

### Fora do escopo imediato

- conversao de UI externa por URL
- importacao de bibliotecas como Shadcn
- builder avancado de animacoes
- ferramentas visuais extras

## Plano Sugerido por Milestone

### Milestone 1 - Finalizar componentizacao atual

Entregas:

- escolha de destino do arquivo
- naming mais previsivel
- UX mais clara para criacao de componente

Saida esperada:

- fluxo confiavel de "extrair para componente"

### Milestone 2 - Criar variacoes reutilizaveis

Entregas:

- duplicar componente existente antes de editar
- salvar como bloco/variacao
- reinserir facilmente componentes criados

Saida esperada:

- fluxo confiavel de reutilizacao e derivacao de blocos

### Milestone 3 - Builder MVP de componentes

Entregas:

- presets simples como `Section`, `Card`, `Hero`, `Feature Grid`, `CTA`
- criacao pelo browser com estrutura inicial pronta
- persistencia no projeto como componente real

Saida esperada:

- primeiro "construtor" de componentes sem depender de bibliotecas externas

## Plano Operacional do Recurso 6

### Objetivo operacional

Fechar a frente de `Criar novos componentes/blocos pelo browser` sem abrir ainda a complexidade de importacao externa.

Resultado esperado:

- o usuario consegue criar um componente novo a partir de uma selecao
- o usuario consegue escolher onde esse componente sera salvo
- o usuario consegue derivar um componente existente sem editar o original
- o usuario consegue reinserir e reutilizar esses componentes/blocos com fluxo previsivel

### Escopo do ciclo atual

Dentro do escopo:

- escolha de pasta/destino do componente
- duplicar componente existente antes de editar
- fluxo de "salvar como bloco" ou "criar variacao"
- melhoria da biblioteca local para componentes criados pelo browser

Fora do escopo:

- importacao de Shadcn
- conversor por URL + selector
- builder visual livre no canvas
- sistema avancado de presets visuais

### Entregas por milestone

#### Milestone 1 - Escolha de destino e previsibilidade do fluxo

Objetivo:

- consolidar o fluxo atual de extracao para componente

Entregas funcionais:

- permitir escolher pasta/destino ao criar componente
- padronizar naming e evitar colisao de nomes de forma clara
- mostrar no browser onde o componente sera criado
- atualizar a biblioteca local imediatamente apos a criacao

Critério de pronto:

- extrair um elemento para componente sem depender de caminho fixo
- criar arquivo, importar e substituir JSX de forma consistente
- componente aparece como reutilizavel na biblioteca logo apos a operacao

#### Milestone 2 - Derivacao e reutilizacao

Objetivo:

- permitir que o usuario trabalhe por fork/variacao de blocos existentes

Entregas funcionais:

- duplicar componente existente antes de editar
- criar variacao com novo nome e novo arquivo
- reinserir variacao no projeto pelo browser
- diferenciar componente original de derivacoes criadas localmente

Critério de pronto:

- o usuario consegue partir de um componente existente, gerar uma copia segura e seguir editando a copia

#### Milestone 3 - Blocos e builder MVP

Objetivo:

- transformar a componentizacao em uma experiencia inicial de construcao de blocos

Entregas funcionais:

- acao de criar bloco a partir de presets locais
- presets minimos como `Section`, `Card`, `Hero`, `Feature Grid`, `CTA`
- persistencia desses presets como componentes reais do projeto
- insercao desses blocos na arvore atual

Critério de pronto:

- o usuario consegue criar um componente/bloco novo pelo browser sem partir obrigatoriamente de uma selecao ja existente

### Subtarefas por camada

#### Parser

Responsabilidades:

- manter a extracao AST confiavel
- suportar novos fluxos de derivacao/variacao
- manter imports, props inferidas e JSX gerado consistentes

Subtarefas do ciclo:

- parametrizar melhor a extracao para aceitar metadados do destino do componente
- revisar a geracao de props inferidas para reduzir ruido em componentes extraidos
- preparar operacao de derivacao de componente existente sem reaproveitar OIDs indevidos
- garantir que a geracao de arquivo final continue limpa e previsivel

Riscos:

- props inferidas demais podem gerar API ruim no componente criado
- derivacao de componente com imports relativos pode quebrar paths se o destino mudar

#### Bridge

Responsabilidades:

- coordenar persistencia de arquivos
- expor rotas do fluxo de criacao/derivacao
- atualizar indexacao e resposta para a extensao

Subtarefas do ciclo:

- aceitar `destinationPath` ou equivalente no fluxo de `componentize`
- validar se o destino escolhido e permitido e existe no projeto
- criar operacao de duplicar componente existente para novo arquivo
- devolver metadados suficientes para a extensao atualizar a biblioteca local sem refresh manual
- tratar conflitos de nome, import path e arquivos ja existentes com feedback claro

Riscos:

- destinos livres demais podem criar componentes em locais incoerentes
- derivacao de componentes compartilhados pode exigir reescrita cuidadosa de imports relativos

#### Extension

Responsabilidades:

- oferecer o fluxo de UX principal
- guiar naming, destino e derivacao
- refletir imediatamente os novos componentes na biblioteca local

Subtarefas do ciclo:

- expandir modal de criacao de componente para incluir nome e destino
- adicionar acao de "duplicar como novo componente" no painel de componentes
- exibir melhor quais componentes foram criados localmente pelo browser
- permitir reinsercao rapida dos componentes recem-criados
- preparar UX para futuro fluxo de presets/blocos sem retrabalho grande

Riscos:

- excesso de opcoes no primeiro modal pode deixar o fluxo lento
- biblioteca de componentes pode ficar confusa se nao houver distincoes claras entre origem e tipo

### Ordem sugerida de implementacao

1. Fechar Milestone 1 ponta a ponta.
2. Implementar derivacao segura de componente existente.
3. Melhorar a biblioteca local para refletir componentes e variacoes.
4. So depois adicionar o builder MVP baseado em presets.

### Validacao manual esperada

Casos minimos para validar ao fim do ciclo:

- extrair um bloco simples para um destino diferente de `src/components/visual-edit/`
- extrair bloco com imagens e textos e confirmar props inferidas
- duplicar um componente existente e reinseri-lo na mesma pagina
- criar uma variacao sem alterar o componente original
- inserir um preset simples como `Card` ou `Section` e continuar editando pelo browser

### Dependencias para iniciar a Fase D

A frente de importacao externa so deve comecar quando este ciclo estiver estavel em:

- criacao de componente com destino configuravel
- derivacao segura de componente existente
- biblioteca local atualizando corretamente
- insercao e reutilizacao de blocos criados pelo browser

## Plano de Execucao Detalhado

### Estrategia de execucao

Executar a Fase C em ordem estrita:

1. fechar o fluxo atual de `componentize`
2. adicionar derivacao de componente existente
3. consolidar a biblioteca local como hub de reutilizacao
4. adicionar o builder MVP por presets

Regra de execucao:

- nao abrir Milestone 2 antes de a Milestone 1 estar funcional ponta a ponta
- nao abrir presets antes de derivacao e biblioteca local estarem estaveis

### Milestone 1 - Componentizacao com destino configuravel

Objetivo:

- transformar o fluxo atual de extracao em um fluxo confiavel e configuravel

#### Entregas tecnicas

- permitir enviar destino do novo componente a partir da extensao
- validar destino no bridge
- gerar arquivo no destino escolhido
- recalcular import relativo do arquivo de origem
- refletir o novo componente na biblioteca local imediatamente

#### Checklist tecnico - Parser

- [x] revisar a API de extracao atual e definir o payload minimo necessario para aceitar destino sem acoplar logica de filesystem ao parser
- [x] manter `extractElementToComponentAtPath` focada em gerar o componente, sem conhecer paths do projeto
- [x] revisar inferencia de props para garantir previsibilidade em texto, `src`, `alt` e `className`
- [x] adicionar ou ajustar testes para confirmar que a extracao continua gerando JSX limpo e sem `data-oid`

#### Checklist tecnico - Bridge

- [x] expandir o payload de `componentize` para aceitar `name` e `destinationPath`
- [x] criar funcao utilitaria para resolver o destino final dentro do projeto com validacao de seguranca
- [x] impedir escrita fora do projeto ou em paths invalidos
- [x] ajustar a logica de `componentFilePath` para aceitar pasta-base configuravel
- [x] recalcular corretamente o import relativo entre arquivo de origem e componente gerado
- [x] retornar no response o `filePath`, `relPath`, `componentName` e metadados necessarios para refresh da biblioteca
- [x] tratar conflitos de nome com estrategia previsivel
- [x] adicionar testes para:
- [x] criar componente em destino padrao
- [x] criar componente em subpasta customizada
- [x] recalcular import relativo corretamente
- [x] bloquear destino invalido

#### Checklist tecnico - Extension

- [x] expandir o fluxo de criacao de componente para incluir campo de nome e destino
- [x] definir UX simples para destino:
- [x] opcao rapida de pasta default
- [x] opcao de subpasta comum
- [x] campo manual como fallback
- [x] enviar `destinationPath` no request de `componentize`
- [x] ao sucesso, atualizar painel de componentes sem exigir reabertura manual

#### Criterio de pronto - Milestone 1

- [x] componente extraido pode ser salvo em destino configuravel com import correto e visibilidade imediata na biblioteca local

### Milestone 2 - Derivacao segura de componente existente

Objetivo:

- permitir fork de componente existente antes de editar

#### Entregas tecnicas

- adicionar acao de duplicar componente existente como novo componente
- persistir o novo arquivo sem alterar o original
- permitir reinserir a variacao criada
- distinguir original e derivacoes na biblioteca local

#### Checklist tecnico - Parser

- [ ] definir o que pode ser reaproveitado da extracao atual versus o que precisa de fluxo proprio para derivacao
- [ ] garantir que qualquer JSX derivado nao carregue `data-oid` indevido no arquivo salvo
- [ ] revisar compatibilidade com imports e props em componentes derivados
- [ ] adicionar testes cobrindo derivacao de componente simples e componente com imports locais

#### Checklist tecnico - Bridge

- [ ] criar operacao nova para duplicar componente existente em novo arquivo
- [ ] resolver como identificar o componente-fonte:
- [ ] por `filePath`
- [ ] por nome + path relativo
- [ ] copiar conteudo e reescrever imports relativos quando o destino mudar
- [ ] garantir nome novo sem colisao
- [ ] reindexar componentes apos a derivacao
- [ ] retornar metadados completos do novo componente
- [ ] adicionar testes para:
- [ ] derivar componente no mesmo diretório
- [ ] derivar componente em subpasta diferente
- [ ] preservar funcionamento de imports relativos
- [ ] garantir que o original nao foi alterado

#### Checklist tecnico - Extension

- [ ] adicionar acao de `duplicar como novo componente` no painel de componentes
- [ ] abrir modal com nome e destino do novo componente
- [ ] permitir seguir direto para insercao ou edicao da nova variacao
- [ ] destacar visualmente que se trata de uma derivacao
- [ ] atualizar lista local sem refresh manual

#### Validacao manual - Milestone 2

- [ ] duplicar um componente existente e salvar com nome novo
- [ ] confirmar que o componente original nao mudou
- [ ] inserir a variacao criada na pagina atual
- [ ] editar a variacao inserida e confirmar que o original continua intacto

#### Criterio de pronto - Milestone 2

- [ ] usuario consegue derivar componente existente com seguranca e reutilizar a copia no fluxo normal

### Milestone 3 - Biblioteca local de componentes/blocos

Objetivo:

- transformar o painel de componentes em biblioteca operacional do que foi criado pelo browser

#### Entregas tecnicas

- destacar componentes criados pelo browser
- destacar variacoes derivadas
- melhorar insercao e descoberta
- preparar o painel para presets futuros

#### Checklist tecnico - Bridge

- [ ] expandir o endpoint de componentes para devolver metadados de origem e tipo quando disponiveis
- [ ] marcar componentes gerados pelo fluxo visual sempre que isso puder ser inferido de forma confiavel
- [ ] devolver informacoes suficientes para agrupamento no painel

#### Checklist tecnico - Extension

- [ ] agrupar ou rotular componentes do projeto versus componentes criados visualmente
- [ ] agrupar ou rotular variacoes derivadas
- [ ] adicionar ordenacao priorizando componentes criados recentemente ou criados visualmente
- [ ] adicionar acoes de insercao rapida para componentes recem-criados
- [ ] evitar poluir a interface com controles excessivos

#### Validacao manual - Milestone 3

- [ ] criar componente novo e confirmar destaque na biblioteca
- [ ] derivar componente e confirmar destaque como variacao
- [ ] inserir rapidamente um item da biblioteca apos cria-lo

#### Criterio de pronto - Milestone 3

- [ ] biblioteca local funciona como ponto central de criacao, derivacao e reutilizacao

### Milestone 4 - Builder MVP por presets

Objetivo:

- permitir criar componentes/blocos novos sem partir de selecao existente

#### Entregas tecnicas

- presets locais minimos
- geracao do componente real no projeto
- insercao do bloco no container atual

#### Checklist tecnico - Parser

- [ ] definir estrutura JSX inicial para cada preset MVP
- [ ] garantir compatibilidade com a logica atual de insercao e componentizacao
- [ ] adicionar testes de geracao para presets escolhidos

#### Checklist tecnico - Bridge

- [ ] definir payload de criacao por preset
- [ ] gerar arquivo do componente com base no preset
- [ ] inserir instancia do novo componente no alvo selecionado
- [ ] indexar o novo componente e devolver metadados para a extensao
- [ ] adicionar testes para:
- [ ] criar preset `Section`
- [ ] criar preset `Card`
- [ ] criar preset `Hero`

#### Checklist tecnico - Extension

- [ ] criar UX minima para selecionar preset, nome e destino
- [ ] permitir inserir o bloco no elemento/container selecionado
- [ ] mostrar preview textual simples do preset escolhido
- [ ] reaproveitar ao maximo os fluxos de nome/destino ja feitos nas milestones anteriores

#### Validacao manual - Milestone 4

- [ ] criar um `Card` em um container selecionado
- [ ] criar uma `Section` em uma pagina vazia
- [ ] criar um `Hero`, confirmar arquivo gerado e reinsercao pela biblioteca

#### Criterio de pronto - Milestone 4

- [ ] usuario consegue criar blocos/componentes iniciais pelo browser sem depender de uma selecao existente

### Ordem detalhada de implementacao

#### Sprint 1

- [ ] ajustar contrato de `componentize` para suportar destino
- [ ] implementar resolucao segura de destino no bridge
- [ ] adaptar modal/acao na extensao para nome + destino
- [ ] cobrir testes principais do fluxo de extracao
- [ ] validar manualmente Milestone 1

#### Sprint 2

- [ ] implementar endpoint/acao de derivacao de componente existente
- [ ] adaptar painel de componentes para expor a nova acao
- [ ] cobrir testes de copia e reescrita de imports
- [ ] validar manualmente Milestone 2

#### Sprint 3

- [ ] enriquecer metadados do catalogo local de componentes
- [ ] melhorar agrupamento, labels e insercao rapida no painel
- [ ] validar manualmente Milestone 3

#### Sprint 4

- [ ] definir presets MVP
- [ ] implementar criacao por preset no bridge/parser
- [ ] adaptar UX da extensao para criar bloco por preset
- [ ] validar manualmente Milestone 4

### Arquivos provaveis a tocar

#### Parser

- [ ] `packages/parser/src/code-edit/structure.ts`
- [ ] `packages/parser/src/code-edit/structure.test.ts`

#### Bridge

- [ ] `packages/bridge/src/editor.ts`
- [ ] `packages/bridge/src/components.ts` ou arquivo equivalente de catalogo
- [ ] `packages/bridge/src/editor.test.ts`
- [ ] `packages/bridge/src/components.test.ts`

#### Extension

- [ ] `packages/extension/src/content.ts`
- [ ] `packages/extension/src/components-panel.ts`
- [ ] arquivos de UI/modal relacionados ao fluxo de componentizacao

### Gate final antes de abrir Fase D

Todos os itens abaixo precisam estar marcados:

- [ ] Milestone 1 concluida
- [ ] Milestone 2 concluida
- [ ] Milestone 3 concluida
- [ ] Milestone 4 concluida
- [ ] fluxo de criacao e derivacao validado manualmente
- [ ] biblioteca local funcionando como ponto de reutilizacao

## Dependencias Tecnicas por Camada

### Parser

- manter primitivas estruturais estaveis
- expandir a extracao/componentizacao com suporte melhor a props e variacoes
- suportar persistencia previsivel dos novos fluxos de bloco/componente

### Bridge

- expor rotas adicionais para o fluxo de criacao/duplicacao de componentes
- persistir arquivos em destinos escolhidos pelo usuario
- atualizar indexacao e refresh apos mutacoes estruturais e de componentes

### Extensao

- melhorar UX de criacao de componente
- suportar escolha de pasta/destino
- suportar fork/duplicacao de componente existente
- destacar biblioteca local de blocos/componentes criados pelo browser

## Pendencias de QA Pospostas

- validar insercao em `.tsx` e `.jsx`
- revisar preview visual de drag and drop
- validar duplicacao de componentes reutilizados e props dinamicas
- revisar casos restantes de UX project-wide e sugestoes de classes

## Criterio de Avanco para a Proxima Fase

A Fase D so deve comecar quando a Fase C estiver suficientemente estavel nestes pontos:

- criar componente pelo browser com fluxo previsivel
- reinserir componente criado sem friccao
- duplicar/derivar bloco existente com seguranca
- biblioteca local de componentes funcionando como base de reutilizacao
