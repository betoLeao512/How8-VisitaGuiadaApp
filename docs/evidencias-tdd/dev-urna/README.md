# Etapa 2: urna de votação (DEV-URNA-01 a 03)

Na Etapa 2, o App passou a ser **só a urna de votação** da atividade no Plenário. Guia e Telão continuam em HTML. O ponto de partida foi um defeito real: na simulação, a urna aceitou 12 votos no grupo L1, que tinha 5 integrantes (registro de 26/11/2026). A regra "cada integrante vota uma vez" estava na cabeça de quem desenhou a atividade, mas nenhum teste a cobrava. Esta etapa começou por esses testes.

As saídas reais de cada fase estão nas pastas `dev-urna-01`, `dev-urna-02` e `dev-urna-03` (`01-red.txt`, `02-green.txt`, `03-refactor.txt`). O hash SHA-256 de cada arquivo de teste aparece no GREEN e no REFACTOR, e é o mesmo nos dois: os testes não foram mexidos depois de passarem. Execução com Node 22.23.5. O projeto recomenda Node 24, que também roda o servidor sem a opção `--experimental-strip-types`.

## Ciclos

| Ciclo | Regra | Arquivos | RED | GREEN |
| --- | --- | --- | --- | --- |
| DEV-URNA-01 | Grupos da atividade: turma de 4 a 40, grupos de até 5, no mínimo 2 grupos, lados alternados L1, C1, L2, C2… (substitui a regra da Etapa 1: 9 a 31, letras e dossiês) | `src/domain/groups.ts` | 24 testes falharam com a versão da Etapa 1. Os 37 casos "para toda turma" nem foram criados, porque o limite de 40 ainda não existia | 68 de 68 |
| DEV-URNA-02 | Regra de votos: limite por grupo, voto reenviado conta uma vez, urna fechada, grupo e regra inexistentes, proibir voto na própria regra, dado malformado vindo da rede e apuração igual à da simulação | `src/domain/urna.ts` | 1ª execução: o módulo não existia. 2ª execução: esqueleto só com as assinaturas, e 31 de 31 falharam | 31 de 31 |
| DEV-URNA-03 | Fila offline do tablet: votos guardados contam no limite, o que fazer com cada resposta do PC e votos sem resposta continuam guardados | `src/domain/fila.ts` | esqueleto só com assinaturas: 10 de 10 falharam | 10 de 10 |

Os cinco casos sugeridos no registro do defeito estão em `urna.test.ts` e `fila.test.ts`, com o mesmo número:

1. Aceita votos de um grupo até o tamanho dele.
2. Recusa o voto de número tamanho + 1.
3. Votos guardados offline contam no limite (`fila.test.ts`).
4. O total aceito nunca passa da soma dos tamanhos.
5. Limite conhecido: a urna não sabe quem é quem, então um voto no grupo errado ocupa a vaga de outra pessoa. Esse comportamento ficou documentado como teste.

## Testes escritos junto com o código (não são TDD)

Para ser franco, estes testes foram escritos junto com a implementação, e não antes:

- `src/rede/protocolo.test.ts` (21 testes): formato das mensagens entre tablet e PC e o endereço digitado.
- `App.test.tsx` (11 testes): telas da urna, usando um PC falso que aplica a regra verdadeira (`registrarVoto`). Cobrem o fluxo completo, a trava "todos já votaram", a queda do Wi-Fi, votos que sobrevivem ao App fechado, o aviso de voto recusado e a troca de turma.
- `servidor/servidor-urna.test.mjs` (10 testes, `npm run test:servidor`): o servidorzinho do PC por HTTP de verdade.

## Verificações finais

- Jest: 5 suítes, 141 testes aprovados.
- Servidor: 10 testes aprovados (`node --test`).
- TypeScript: sem erros (`tsc --noEmit`).
- `expo prebuild --platform android`: projeto gerado. O `AndroidManifest.xml` sai com `usesCleartextTraffic="true"` e o pacote `com.how8.visitacidada`.
- `expo export` para Android e iOS: o código empacota nas duas plataformas.
- **Não verificado aqui:** a compilação do APK e do app iOS, e a instalação em aparelho. O ambiente de desenvolvimento usado não tinha acesso às ferramentas do Android. Essa validação é feita no aparelho real (ver o README principal).
