# DEV-003A — Formação de grupos e distribuição de dossiês

Baseline inicial: `cdbb77b17ce1033d499819e32016f537ff7b99e6`, branch `master`, árvore limpa. Execução com Node 24.16.0 e dependências já instaladas. Nenhuma dependência adicionada.

## Interface e decisões

Implementação: `src/domain/groups.ts`. Testes: `src/domain/groups.test.ts`.

```ts
type DossierId = 'PEDESTRES' | 'VEICULOS' | 'LEGISLACAO' | 'FISCALIZACAO';
type InvestigationGroup = { id: string; size: number; dossierIds: DossierId[] };
function formGroups(studentCount: unknown): InvestigationGroup[];
```

Os tipos e a função são exportados. A função valida a entrada sem coerção: entradas que não sejam números primitivos geram `TypeError`; números fora de 9–31, não inteiros ou não finitos geram `RangeError`. Os resultados contêm apenas letras, quantidades e identificadores fictícios de dossiês, sem dados de pessoas.

A quantidade de grupos é a mínima que respeita o limite de cinco integrantes. Os integrantes adicionais ficam nos primeiros grupos. Para até quatro grupos, os quatro dossiês são distribuídos em ordem circular pelos grupos existentes; para mais grupos, os quatro identificadores se repetem circularmente. Exemplos:

- Dois grupos: A = PEDESTRES + LEGISLACAO; B = VEICULOS + FISCALIZACAO.
- Três grupos: A = PEDESTRES + FISCALIZACAO; B = VEICULOS; C = LEGISLACAO.
- Cinco grupos: A = PEDESTRES; B = VEICULOS; C = LEGISLACAO; D = FISCALIZACAO; E = PEDESTRES.

Cada chamada cria novos objetos e novas listas. A constante interna dos quatro identificadores não é exposta. O módulo não possui imports, consultas de relógio, rede, aleatoriedade, armazenamento ou estado mutável compartilhado.

## Matriz de testes

| Regras | Casos | Quantidade |
| --- | --- | ---: |
| RG-01 a RG-04 | Exemplos aprovados: 9, 16, 20, 23 e 31 estudantes | 5 |
| RG-02 a RG-07 | Todos os inteiros de 9 a 31: soma, quantidade mínima, limite, equilíbrio, adicionais primeiro, letras únicas e cobertura dos quatro dossiês | 23 |
| RG-01 | Zero, negativos, abaixo/acima dos limites, decimais, NaN e infinitos | 12 |
| RG-01 | undefined, null, booleanos, strings, array, objeto e número encapsulado; sem coerção | 10 |
| RG-05 a RG-07 | Atribuição exata para dois, três, quatro, cinco, seis e sete grupos | 6 |
| RG-08/RG-09 | Chamadas intercaladas, isolamento dos resultados e carregamento/cálculo com rede, relógio e aleatoriedade bloqueados | 3 |
| **Total novo** | | **59** |

## RED → GREEN → REFACTOR

1. **RED:** testes escritos antes de `groups.ts`. A execução retornou código 1 porque o módulo não existia. A suíte não carregou e nenhuma asserção executou; não se apresenta essa falha como falha de uma regra calculada. Saída real em `01-red.txt`.
2. **GREEN:** implementada a função pura e executados os 59 testes, todos aprovados. As expectativas de RED foram preservadas; foram apenas explicitados os tipos TypeScript de duas tabelas de testes. Saída real e hash dos testes em `02-green.txt`.
3. **REFACTOR:** revisadas legibilidade, organização e duplicação. A distribuição usa um único percurso circular e não foi identificada mudança adicional com benefício demonstrável. A implementação GREEN foi mantida. A suíte completa, o TypeScript e a verificação de ausência de alterações em arquivos anteriormente versionados passaram. Saídas reais em `03-refactor.txt`.

As saídas dos processos foram capturadas sem substituição ou fabricação. Cabeçalhos e comentários são identificados. Os hashes de GREEN e da revisão final permitem conferir que os testes não mudaram entre essas etapas.

## Verificações finais

- Jest: três suítes, 89 testes aprovados (59 novos + 30 existentes).
- TypeScript: aprovado com `--noEmit`.
- Cobertura de `src/domain/groups.ts`: 100% de instruções, ramos, funções e linhas. Esse percentual não representa o aplicativo inteiro.
- Não há lint configurado; nenhuma ferramenta foi instalada.
- `App.tsx`, `App.test.tsx`, pontuação, temporização, dependências e configurações Expo/iOS permaneceram inalterados.

Comando de domínio:

```sh
node node_modules/jest/bin/jest.js --runInBand --watch=false --watchman=false --no-cache src/domain/groups.test.ts
```

Comandos finais (usando Node 24):

```sh
node node_modules/jest/bin/jest.js --runInBand --watch=false --watchman=false --no-cache --coverage --collectCoverageFrom=src/domain/groups.ts --coverageReporters=text --coverageReporters=json-summary --coverageDirectory=/private/tmp/how8-dev003a-coverage
node node_modules/typescript/bin/tsc --noEmit
git diff --exit-code
```

Não foi criada interface de seleção, integração com o aplicativo, conteúdo investigativo, persistência ou comportamento além da formação e atribuição de identificadores. O módulo retorna resultados mutáveis, porém independentes entre grupos e chamadas; os testes verificam esse isolamento. Nenhum commit ou push realizado nesta missão.
