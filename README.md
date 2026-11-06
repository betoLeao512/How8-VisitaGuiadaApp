# HOW8 — Visita Cidadã

Protótipo acadêmico de aplicativo para apoiar experiências educativas no contexto das visitas guiadas à Câmara de Vereadores de Itajaí. A proposta é aproximar os visitantes do funcionamento do Poder Legislativo por meio de uma interação em grupo e de um desafio de conhecimento.

> **Nomenclatura:** Visita Cidadã é o nome do produto; HOW8 identifica o projeto acadêmico. `HOW8-App` e `how8-app` são identificadores técnicos, e `How8-VisitaGuiadaApp` é o nome do repositório GitHub. A descrição oficial do produto é **Aplicativo educacional para visitas guiadas ao Poder Legislativo**.

## Estado atual

Protótipo funcional desenvolvido na **Etapa 1 do HOW8**. O fluxo permite iniciar uma visita, identificar o grupo, responder a um desafio com limite de tempo, consultar o resultado e reiniciar a experiência.

A implementação atual concentra a interface em `App.tsx` e mantém a regra de pontuação separada em `src/domain/score.ts`. A Etapa 2 deverá evoluir esse ponto de partida para o MVP; as evoluções previstas ainda não fazem parte das funcionalidades implementadas.

## Tecnologias

Versões resolvidas no `package-lock.json` e conferidas nas dependências instaladas:

| Tecnologia | Versão |
| --- | --- |
| React Native | 0.88.0 |
| Expo | 58.0.19 — SDK 58 |
| React | 19.3.0 |
| TypeScript | 6.0.3 |
| Jest | 30.5.2 |
| jest-expo | 58.0.12 |

O `package.json` define os intervalos de versões permitidos; o arquivo de lock registra as versões utilizadas para uma instalação reproduzível.

## Funcionalidades implementadas

- Tela de apresentação e início da experiência.
- Identificação do grupo com nome obrigatório, remoção de espaços nas extremidades e limite de 80 caracteres.
- Tela de preparação para iniciar o desafio.
- Um desafio de múltipla escolha sobre o Poder ao qual pertence a Câmara de Vereadores, com três alternativas.
- Temporizador de 30 segundos e encerramento por tempo esgotado.
- Registro da primeira resposta válida e apresentação do resultado: correta, incorreta ou tempo esgotado.
- Pontuação de **100 pontos por resposta correta** e **0 pontos por resposta incorreta ou tempo esgotado**.
- Reinício com limpeza do nome do grupo, do resultado e do temporizador.

Nome, resposta e pontuação permanecem somente em memória durante a execução. A aplicação não salva histórico de visitas.

## Como executar

### Requisitos

- Git para obter o repositório.
- Node.js **24 LTS, a partir de 24.3.0 na série 24.x**, com npm. Essa faixa atende aos requisitos declarados pelas versões instaladas de Expo e React Native.
- Um ambiente compatível para abrir o aplicativo: Android Emulator, iOS Simulator no macOS ou Expo Go compatível com o SDK 58.

O Android Emulator requer configuração do Android Studio; o iOS Simulator requer macOS e Xcode. A execução em dispositivo físico ainda precisa ser validada para este projeto.

### Instalação

```sh
git clone https://github.com/betoLeao512/How8-VisitaGuiadaApp.git HOW8-App
cd HOW8-App
npm ci
```

Se o repositório já estiver clonado, execute `npm ci` em sua raiz, onde estão `package.json` e `App.tsx`. Use o lock existente para manter as versões registradas.

### Inicialização

```sh
npm start
```

Esse script executa `expo start`. Com o servidor de desenvolvimento ativo, use as opções do terminal para abrir um emulador/simulador ou escanear o QR code com uma versão compatível do Expo Go. Em dispositivo físico, computador e aparelho precisam de conectividade entre si.

Também estão disponíveis os scripts de inicialização por plataforma:

```sh
npm run android
npm run ios
```

Eles executam `expo start --android` e `expo start --ios`, respectivamente, e dependem do ambiente correspondente configurado. A existência desses scripts não representa validação do aplicativo em todas as plataformas.

Referências: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/) e [inicialização do ambiente de desenvolvimento](https://docs.expo.dev/get-started/start-developing/).

## Testes e verificações

Execute os comandos na raiz, após instalar as dependências.

### Testes unitários com Jest

```sh
npm test -- --runInBand --watch=false --no-cache
```

A suíte atual está em [`src/domain/score.test.ts`](src/domain/score.test.ts) e contém três testes da função `calculateScore`: acerto, erro e tempo esgotado. Os testes verificam a pontuação correspondente a cada resultado; não exercitam o temporizador ou a interface.

### Verificação TypeScript

```sh
npx --no-install tsc --noEmit
```

Confere os tipos sem gerar arquivos de saída.

### Compatibilidade das dependências com Expo

```sh
npx --no-install expo install --check
```

Confere as versões esperadas para o SDK instalado. A verificação completa pode consultar metadados pela rede. Esse comando não substitui uma auditoria de vulnerabilidades.

Os três testes unitários e a verificação TypeScript foram executados com sucesso na preparação desta documentação. Isso não equivale a validação funcional em dispositivo físico. Não há comando de lint configurado no `package.json`.

## TDD aplicado à pontuação

O primeiro ciclo de TDD foi aplicado à regra de domínio `calculateScore`:

1. **RED:** os três testes foram escritos antes da implementação. A suíte falhou ao importar o módulo inexistente; nenhuma asserção chegou a executar nessa fase.
2. **GREEN:** foi implementada a função mínima que retorna 100 para `correct` e 0 para `incorrect` ou `timeout`, fazendo os três testes passarem.
3. **REFACTOR:** a implementação foi revisada. Não foi necessária refatoração adicional, pois a regra já estava expressa de forma simples, sem duplicação ou efeitos colaterais.

As evidências originais estão em [`docs/evidencias-tdd/`](docs/evidencias-tdd/):

- [Descrição do ciclo e dos comandos](docs/evidencias-tdd/README.md).
- [RED — falha inicial](docs/evidencias-tdd/01-red-score.txt).
- [GREEN — testes aprovados](docs/evidencias-tdd/02-green-score.txt).
- [REFACTOR e verificações finais](docs/evidencias-tdd/03-refactor-score.txt).

Esses registros documentam a construção da regra de pontuação, não a cobertura completa do aplicativo.

## Limitações conhecidas

- Apenas um desafio fixo; não há catálogo ou edição de perguntas.
- Não há backend, banco de dados, autenticação, persistência de visitas ou ranking entre grupos.
- O fluxo de visita não contempla ainda um roteiro completo com múltiplas etapas e desafios.
- A cobertura automatizada está restrita à pontuação. Faltam testes de componentes, interação, temporização e fluxo completo.
- Não há validação em dispositivo físico nem estudo de uso com visitantes documentados nesta versão.
- O script web existe no `package.json`, mas `react-dom` e `react-native-web` não estão declarados como dependências diretas. A execução web não é apresentada como ambiente pronto ou validado.

## Próximos passos — Etapa 2

- Definir e priorizar os incrementos do MVP para a jornada de visita guiada.
- Evoluir o fluxo e o conteúdo educativo a partir dos requisitos da Etapa 2.
- Ampliar os testes para interface, respostas, temporizador, reinício e integração entre as etapas.
- Validar a execução em dispositivos físicos e revisar acessibilidade e usabilidade.
- Realizar avaliação com usuários no contexto das visitas e incorporar os resultados às próximas iterações.
