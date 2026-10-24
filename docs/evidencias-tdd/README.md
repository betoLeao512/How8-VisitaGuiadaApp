# Primeiro ciclo TDD: pontuação

## Contexto

Diretório: . (raiz do projeto HOW8-App).
Branch inicial: master. Commit-base: c40db72. Working tree inicialmente limpo.
Execução com Node v24.16.0. Sem implementação de interface HOW8.

## Regra e comportamento testado

A função pura calculateScore recebe AnswerResult:

- correct (resposta correta): 100 pontos;
- incorrect (resposta incorreta): 0 pontos;
- timeout (tempo esgotado): 0 pontos.

O resultado é informado por quem chama a função. A regra não mede o tempo nem valida respostas: essas funcionalidades estão fora deste ciclo.
Implementação em src/domain/score.ts; três testes em src/domain/score.test.ts.

## Configuração mínima

Instalação: npx expo install jest-expo jest @types/jest --dev

Dependências de desenvolvimento: Jest ~30.5.2, jest-expo ~58.0.12 e @types/jest 30.0.0.
Preset jest-expo no package.json; script test sem modo de observação; tipos Jest no tsconfig.json.
Não foi adicionada React Native Testing Library.
Referências: https://docs.expo.dev/develop/unit-testing/ e https://docs.expo.dev/versions/v58.0.0/.

## RED

Os três testes foram escritos antes de existir score.ts.
Comando: npm test -- --runInBand --watch=false --no-cache src/domain/score.test.ts

Resultado real em [01-red-score.txt](01-red-score.txt): código 1, suíte falhou ao importar ./score porque a implementação ainda não existia. Os três casos estavam declarados, mas nenhuma asserção chegou a executar (Tests: 0 total). A falha não foi de configuração do Jest.

## GREEN

Foi criada apenas a união de três resultados e a função que retorna 100 para correct e 0 nos demais casos.
O teste permaneceu igual.
Comando: npm test -- --runInBand --watch=false --no-cache src/domain/score.test.ts

Resultado real em [02-green-score.txt](02-green-score.txt): uma suíte e três testes aprovados, código 0.

## REFACTOR

Não foi necessária refatoração adicional neste ciclo.
A implementação já é pequena, não tem duplicação e não produz efeitos colaterais.
Nenhuma alteração artificial foi feita para simular uma refatoração.

## Verificações finais

Comandos executados, todos com código 0:

- npm test -- --runInBand --watch=false --no-cache (uma suíte, três testes aprovados);
- npx --no-install tsc --noEmit (sem erros de tipos);
- npx --no-install expo install --check (Dependencies are up to date).

Saídas reais em [03-refactor-score.txt](03-refactor-score.txt). Os arquivos de evidência contêm stdout e stderr capturados do processo, além de cabeçalhos e análise identificados; os códigos registrados são os dos comandos executados.
Lint não estava configurado no template e não foi instalado para manter o escopo mínimo solicitado.

## Resultado final

Os três comportamentos foram testados e aprovados. Nenhuma interface, navegação ou backend foi implementado. O npm informou cinco vulnerabilidades altas durante a instalação; não foi executado npm audit fix nem npm audit fix --force. Nenhum push ou configuração de credenciais foi feito.
