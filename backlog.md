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

### Recursos considerados implementados neste ciclo

6. Criar novos componentes/blocos pelo browser
7. Criar novas paginas pela extensao

### Recursos ainda 100% pendentes

8. Conversor de elementos externos em componente React
9. Importar componentes, blocos e charts de bibliotecas como Shadcn
10. Interface para aplicacao de animacoes
11. Ferramentas extras tipo TWColor

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

- funcional para fins de roadmap

Motivo da prioridade:

- aproveita a base AST e bridge ja prontas
- entrega valor alto sem abrir a complexidade de ingestao externa
- destrava a futura importacao de blocos/bibliotecas

### Fase D - Autoria de paginas pelo browser

Objetivo:

- permitir criar uma nova rota/pagina diretamente pela extensao e continuar a composicao visual dentro dela

Escopo macro:

- detectar App Router ou Pages Router automaticamente
- expor para a extensao os padroes de pasta e route groups encontrados
- criar a pagina inicial no destino correto do projeto
- navegar para a rota criada para continuar montando com elementos e componentes

Status:

- funcional para fins de roadmap

Observacoes:

- precisa funcionar para `app/`, `src/app/`, `pages/` e `src/pages/`
- em App Router com route groups, o bridge deve refletir essa estrutura para a extensao

### Fase E - Ingestao externa e importacao assistida

Objetivo:

- trazer UI externa ou de bibliotecas para dentro do projeto atual

Escopo macro:

- importar componentes/blocos/charts de bibliotecas como Shadcn
- converter trechos externos por URL + selector em componente React

Status:

- nao iniciado

Observacoes:

- esta fase exige pipeline nova de captura, normalizacao e persistencia
- deve vir depois da consolidacao das Fases C e D

### Fase F - Ferramentas de produtividade visual

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

Status: `Implementado para roadmap`

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

### 7. Criar novas paginas pela extensao

Status: `Implementado para roadmap`

Ja existe:

- deteccao automatica de `app/`, `src/app/`, `pages/` e `src/pages/`
- deteccao de route groups do App Router e exposicao desses padroes para a extensao
- criacao de pagina nova no destino compativel com a estrutura do projeto
- navegacao para a rota criada para continuar a edicao visual

Pendencias movidas para QA:

- validar criacao em projetos com App Router e Pages Router coexistindo
- revisar feedback visual para rota duplicada ou invalida

### 8. Conversor de elementos externos em componente React

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

### 9. Importar componentes, blocos e charts de bibliotecas como Shadcn

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

### 10. Interface para aplicacao de animacoes

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

### 11. Ferramentas extras tipo TWColor

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

Iniciar a Fase E: `Ingestao externa e importacao assistida`.

Gate das Fases C e D: concluido. Os milestones de componentes/blocos e de criacao de paginas ja foram entregues para roadmap.

Racional:

- a base de componentizacao, derivacao, biblioteca local e criacao de paginas esta estavel
- Shadcn e o conversor externo sao os proximos pontos de maior valor percebido
- a pipeline de captura e normalizacao externa e o novo risco tecnico a explorar
- recomendado comecar pelo Recurso 9 (Shadcn) por ter escopo mais controlado que o Recurso 8

### Objetivo do proximo ciclo

Permitir que o usuario traga componentes/blocos de bibliotecas externas para dentro do projeto atual, com isolamento total da instalacao de origem e adaptacao segura ao stack do projeto.

### Escopo sugerido para o proximo ciclo (Recurso 9 - Shadcn)

1. Listar componentes disponiveis no Shadcn CLI
2. Gerar o componente escolhido em um workspace temporario isolado, fora do projeto do usuario
3. Adaptar imports, aliases, utils e destino de arquivos ao padrao do projeto alvo
4. Persistir apenas os arquivos finais aprovados no projeto do usuario
5. Confirmar importacao e exibir o componente na biblioteca local da extensao
6. Permitir insercao direta do componente importado na pagina atual

### Sequencia operacional da Fase E

#### Milestone 1 - Catalogo Shadcn no bridge e na extensao

Objetivo:

- listar e buscar itens disponiveis no registry oficial do Shadcn sem ainda escrever arquivos no projeto

Entregas funcionais:

- bridge consulta o `shadcn list @shadcn` no contexto do projeto
- extensao exibe busca e listagem minima de componentes/blocos encontrados
- tipos retornados pelo registry ficam visiveis para preparar a fase de instalacao

Checklist tecnico:

- [x] criar modulo do bridge para consultar o CLI do Shadcn com parse seguro da saida
- [x] expor endpoint HTTP para listagem com `query`, `limit` e `offset`
- [x] adicionar testes do bridge cobrindo sucesso, filtros e erro do CLI
- [x] adaptar o painel de componentes para exibir um modo `Shadcn`
- [x] permitir busca textual no catalogo exibido pela extensao

Criterio de pronto:

- [ ] usuario consegue abrir o catalogo Shadcn na extensao e navegar pelos itens disponiveis

#### Milestone 2 - Importacao isolada de item Shadcn

Objetivo:

- impedir que o `shadcn add` altere o comportamento, as dependencias ou os arquivos padrao do projeto host

Entregas funcionais:

- bridge deixa de executar o `shadcn add` diretamente no projeto do usuario
- bridge cria um workspace temporario descartavel para materializar o item selecionado
- apenas os arquivos finais adaptados sao copiados para um namespace isolado do Visual Edit no projeto host
- `package.json`, lockfiles, `components.json` e quaisquer arquivos de UI existentes do host deixam de ser alvo do fluxo de importacao

Checklist tecnico:

- [ ] criar um pipeline no bridge para provisionar um workspace temporario fora do projeto host
- [ ] gerar nesse workspace uma configuracao minima do shadcn compativel com o item escolhido
- [ ] executar `shadcn add` somente dentro do workspace temporario
- [ ] coletar os arquivos gerados pelo CLI e montar um manifest de saida para a fase de adaptacao
- [ ] bloquear a persistencia de arquivos quando o pipeline detectar saida vazia, inesperada ou ambigua
- [ ] adicionar testes unitarios do bridge cobrindo workspace temporario, coleta de arquivos e descarte ao final do fluxo
- [ ] adicionar testes garantindo que o fluxo nao modifica `package.json`, lockfiles ou arquivos existentes do projeto host

Criterio de pronto:

- [ ] usuario consegue importar um item oficial do Shadcn sem que o projeto host receba alteracoes fora dos arquivos finais do componente importado

#### Milestone 3 - Adaptacao segura ao padrao do projeto

Objetivo:

- transformar a saida bruta do Shadcn em codigo persistivel no projeto alvo sem sobrescrever convencoes locais

Objetivo:

- aplicar adaptacoes deterministicas de baixo risco antes de gravar o componente no host

Entregas funcionais:

- reescrita de aliases para o namespace isolado do Visual Edit
- adaptacao de imports de utilitarios locais para os padroes detectados no projeto, como `cn` vs `cx`
- normalizacao de nomes de arquivo e pasta conforme a convencao do projeto, sem tocar componentes preexistentes
- persistencia dos arquivos em uma area controlada, como `components/visual-edit/shadcn` ou equivalente inferido

Checklist tecnico:

- [ ] mapear no bridge os padroes minimos do projeto alvo: alias raiz, convencao de pasta de componentes e helper utilitario primario
- [ ] criar um adaptador de imports para reescrever caminhos vindos do workspace temporario
- [ ] criar um adaptador de utilitarios para converter o helper padrao do shadcn para o helper local quando houver compatibilidade simples
- [ ] preservar isolamento quando o projeto nao tiver helper compativel, mantendo o utilitario do componente importado dentro do namespace do Visual Edit
- [ ] registrar conflitos de nome e bloquear gravacao quando a importacao colidir com arquivos ja existentes no destino final
- [ ] adicionar testes de bridge para aliases `@/*` e `~/*`, namespace isolado e adaptacao de `cn` para helper local

Criterio de pronto:

- [ ] usuario consegue importar um item do Shadcn e recebe no projeto um componente funcional, salvo em namespace isolado, sem sobrescrever `components/ui` ou `lib/utils`

#### Milestone 4 - Sincronizacao com biblioteca local

Objetivo:

- refletir imediatamente na biblioteca local os itens Shadcn importados pelo fluxo isolado

Entregas funcionais:

- reindexacao apos importacao
- destaque visual para itens trazidos do Shadcn
- reconciliacao entre componentes novos do namespace do Visual Edit e componentes ja existentes no projeto

Checklist tecnico:

- [ ] disparar reindexacao apenas apos a persistencia final dos arquivos adaptados
- [ ] marcar a origem do componente como `shadcn-imported` ou equivalente no indice interno
- [ ] exibir no painel que o item foi importado para namespace isolado do Visual Edit
- [ ] adicionar testes de indexacao cobrindo componentes importados pelo novo fluxo

Criterio de pronto:

- [ ] usuario consegue localizar na biblioteca local os componentes importados pelo fluxo isolado

#### Milestone 5 - Insercao direta no canvas

Objetivo:

- permitir usar no fluxo visual os componentes importados pelo Shadcn

Entregas funcionais:

- insercao rapida a partir da biblioteca local
- feedback claro quando o componente exigir composicao manual ou props obrigatorias
- validacao minima para casos de blocos e charts

Checklist tecnico:

- [ ] permitir inserir o componente importado a partir da biblioteca local sem depender do catalogo Shadcn
- [ ] exibir avisos quando o item importado exigir props obrigatorias ou subcomponentes compostos
- [ ] diferenciar no UX os casos de componente simples, bloco e chart antes da insercao
- [ ] adicionar cobertura de testes para refresh de biblioteca e insercao basica do componente importado

Criterio de pronto:

- [ ] usuario consegue importar um item do Shadcn e inseri-lo no canvas pelo mesmo fluxo usado para componentes locais

### Estrategia de evolucao posterior - Compatibilidade inteligente com componentes locais

Objetivo:

- evoluir do isolamento seguro para reaproveitamento opcional das primitivas ja existentes no projeto, sem perder previsibilidade

Escopo futuro:

- detectar componentes locais equivalentes como `Button`, `Input`, `Dialog` e `Icon`
- sugerir ou aplicar mapeamentos seguros entre a saida do Shadcn e as primitivas do projeto
- reduzir codigo duplicado quando houver padroes locais consolidados

Checklist de preparacao:

- [ ] manter os adaptadores do Milestone 3 separados por responsabilidade para permitir heuristicas futuras sem reescrever o pipeline
- [ ] registrar no manifest de importacao quais simbolos vieram do Shadcn e quais foram adaptados localmente
- [ ] definir uma camada de `component mappings` opcional para evoluir depois sem mudar o contrato base da importacao isolada
- [ ] desenhar um modo `conservador` padrao e um modo `compatibilidade inteligente` opt-in para a fase futura
- [ ] mapear criterios de seguranca para so reutilizar componentes locais quando a compatibilidade for verificavel

### Checklist de controle consolidado - Recurso 9 Shadcn

- [x] catalogo oficial do Shadcn disponivel no bridge e na extensao
- [x] endpoint e UX basica para acionar importacao por item
- [ ] fluxo de importacao executado apenas em workspace temporario isolado
- [ ] pipeline de adaptacao de aliases, imports e utilitarios locais
- [ ] persistencia final em namespace isolado do Visual Edit
- [ ] protecao total contra alteracao de `package.json`, lockfiles e arquivos padrao do host
- [ ] sincronizacao da biblioteca local apos importacao
- [ ] insercao do componente importado no canvas
- [ ] arquitetura preparada para a futura compatibilidade inteligente com componentes locais

### Fora do escopo imediato

- conversor por URL + selector (Recurso 8) - pipeline mais complexa, fica para depois
- builder avancado de animacoes (Recurso 10)
- ferramentas visuais extras (Recurso 11)

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

### Dependencias para iniciar a Fase E

A frente de importacao externa so deve comecar quando este ciclo estiver estavel em:

- criacao de componente com destino configuravel
- derivacao segura de componente existente
- biblioteca local atualizando corretamente
- insercao e reutilizacao de blocos criados pelo browser
- criacao de paginas respeitando App Router, Pages Router e route groups

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

- [x] definir o que pode ser reaproveitado da extracao atual versus o que precisa de fluxo proprio para derivacao
- [x] garantir que qualquer JSX derivado nao carregue `data-oid` indevido no arquivo salvo
- [x] revisar compatibilidade com imports e props em componentes derivados
- [x] adicionar testes cobrindo derivacao de componente simples e componente com imports locais

#### Checklist tecnico - Bridge

- [x] criar operacao nova para duplicar componente existente em novo arquivo
- [x] resolver como identificar o componente-fonte:
- [x] por `filePath`
- [x] por nome + path relativo
- [x] copiar conteudo e reescrever imports relativos quando o destino mudar
- [x] garantir nome novo sem colisao
- [x] reindexar componentes apos a derivacao
- [x] retornar metadados completos do novo componente
- [x] adicionar testes para:
- [x] derivar componente no mesmo diretório
- [x] derivar componente em subpasta diferente
- [x] preservar funcionamento de imports relativos
- [x] garantir que o original nao foi alterado

#### Checklist tecnico - Extension

- [x] adicionar acao de `duplicar como novo componente` no painel de componentes
- [x] abrir modal com nome e destino do novo componente
- [x] permitir seguir direto para insercao ou edicao da nova variacao
- [x] destacar visualmente que se trata de uma derivacao
- [x] atualizar lista local sem refresh manual

#### Validacao manual - Milestone 2

- [x] duplicar um componente existente e salvar com nome novo
- [x] confirmar que o componente original nao mudou
- [x] inserir a variacao criada na pagina atual
- [x] editar a variacao inserida e confirmar que o original continua intacto

#### Criterio de pronto - Milestone 2

- [x] usuario consegue derivar componente existente com seguranca e reutilizar a copia no fluxo normal

### Milestone 3 - Biblioteca local de componentes/blocos

Objetivo:

- transformar o painel de componentes em biblioteca operacional do que foi criado pelo browser

#### Entregas tecnicas

- destacar componentes criados pelo browser
- destacar variacoes derivadas
- melhorar insercao e descoberta
- preparar o painel para presets futuros

#### Checklist tecnico - Bridge

- [x] expandir o endpoint de componentes para devolver metadados de origem e tipo quando disponiveis
- [x] marcar componentes gerados pelo fluxo visual sempre que isso puder ser inferido de forma confiavel
- [x] devolver informacoes suficientes para agrupamento no painel

#### Checklist tecnico - Extension

- [x] agrupar ou rotular componentes do projeto versus componentes criados visualmente
- [x] agrupar ou rotular variacoes derivadas
- [x] adicionar ordenacao priorizando componentes criados recentemente ou criados visualmente
- [x] adicionar acoes de insercao rapida para componentes recem-criados
- [x] evitar poluir a interface com controles excessivos

#### Validacao manual - Milestone 3

- [x] criar componente novo e confirmar destaque na biblioteca
- [x] derivar componente e confirmar destaque como variacao
- [x] inserir rapidamente um item da biblioteca apos cria-lo

#### Criterio de pronto - Milestone 3

- [x] biblioteca local funciona como ponto central de criacao, derivacao e reutilizacao

### Milestone 4 - Builder MVP por presets

Objetivo:

- permitir criar componentes/blocos novos sem partir de selecao existente

#### Entregas tecnicas

- presets locais minimos
- geracao do componente real no projeto
- insercao do bloco no container atual

#### Checklist tecnico - Parser

- [x] definir estrutura JSX inicial para cada preset MVP
- [x] garantir compatibilidade com a logica atual de insercao e componentizacao
- [x] adicionar testes de geracao para presets escolhidos

#### Checklist tecnico - Bridge

- [x] definir payload de criacao por preset
- [x] gerar arquivo do componente com base no preset
- [x] inserir instancia do novo componente no alvo selecionado
- [x] indexar o novo componente e devolver metadados para a extensao
- [x] adicionar testes para:
- [x] criar preset `Section`
- [x] criar preset `Card`
- [x] criar preset `Hero`

#### Checklist tecnico - Extension

- [x] criar UX minima para selecionar preset, nome e destino
- [x] permitir inserir o bloco no elemento/container selecionado
- [x] mostrar preview textual simples do preset escolhido
- [x] reaproveitar ao maximo os fluxos de nome/destino ja feitos nas milestones anteriores

#### Validacao manual - Milestone 4

- [x] criar um `Card` em um container selecionado
- [x] criar uma `Section` em uma pagina vazia
- [x] criar um `Hero`, confirmar arquivo gerado e reinsercao pela biblioteca

#### Criterio de pronto - Milestone 4

- [x] usuario consegue criar blocos/componentes iniciais pelo browser sem depender de uma selecao existente

### Ordem detalhada de implementacao

#### Sprint 1

- [ ] ajustar contrato de `componentize` para suportar destino
- [ ] implementar resolucao segura de destino no bridge
- [ ] adaptar modal/acao na extensao para nome + destino
- [ ] cobrir testes principais do fluxo de extracao
- [ ] validar manualmente Milestone 1

#### Sprint 2

- [x] implementar endpoint/acao de derivacao de componente existente
- [x] adaptar painel de componentes para expor a nova acao
- [x] cobrir testes de copia e reescrita de imports
- [x] validar manualmente Milestone 2

#### Sprint 3

- [x] enriquecer metadados do catalogo local de componentes
- [x] melhorar agrupamento, labels e insercao rapida no painel
- [x] validar manualmente Milestone 3

#### Sprint 4

- [x] definir presets MVP
- [x] implementar criacao por preset no bridge/parser
- [x] adaptar UX da extensao para criar bloco por preset
- [x] validar manualmente Milestone 4

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

### Gate final antes de abrir Fase E

Todos os itens abaixo precisam estar marcados:

- [x] Milestone 1 concluida
- [x] Milestone 2 concluida
- [x] Milestone 3 concluida
- [x] Milestone 4 concluida
- [x] fluxo de criacao e derivacao validado manualmente
- [x] biblioteca local funcionando como ponto de reutilizacao

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

A Fase E so deve comecar quando as Fases C e D estiverem suficientemente estaveis nestes pontos:

- criar componente pelo browser com fluxo previsivel
- reinserir componente criado sem friccao
- duplicar/derivar bloco existente com seguranca
- biblioteca local de componentes funcionando como base de reutilizacao
- criar pagina nova no destino correto e continuar a edicao visual nela
