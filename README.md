# HOW8 — Visita Cidadã · Urna do Plenário

Aplicativo acadêmico usado nas visitas guiadas à Câmara de Vereadores de Itajaí. Na atividade **Plenário em Jogo**, a turma discute um caso na Rua Hercílio Luz, cada grupo escreve uma regra e, no fim, todos votam em segredo. **Este App é a urna.** O tablet passa de mão em mão, e cada aluno escolhe o próprio grupo e a regra em que vota. O voto vai pela rede Wi-Fi para o PC da guia.

> **Nomenclatura:** Visita Cidadã é o nome do produto; HOW8 identifica o projeto acadêmico. `HOW8-App` e `how8-app` são identificadores técnicos, e `How8-VisitaGuiadaApp` é o nome do repositório GitHub.

## Como as peças se encaixam

```
 Tablets (este App)  ──Wi-Fi──▶  PC da guia: servidorzinho (servidor/)  ◀──  painel da guia (navegador do PC)
 Android, iPad, iPhone            guarda os votos e aplica a regra            abre/encerra, vê contagem e apuração
```

- **Guia e Telão** da atividade continuam em HTML (simulação 3), fora deste repositório.
- O **servidorzinho** é um programa Node sem nenhuma biblioteca de fora. Ele usa **o mesmo arquivo de regra** que o App (`src/domain/urna.ts`), então o tablet e o PC aplicam a mesma regra.
- A comparação que ajuda: o tablet é a urna eletrônica da seção, e o PC é a apuração. Cada voto leva um número próprio, então, se a rede falhar no meio e o tablet reenviar, o PC reconhece o voto e não conta duas vezes.

## O que a urna faz

- Telas iguais às da simulação 3: "Urna fechada" → "Sua vez de votar" → "De qual grupo você é?" → "Qual regra você quer para a rua?" → "Voto guardado · Passe o tablet para a próxima pessoa" → "Todos votaram".
- **Limite por grupo:** um grupo de 5 recebe no máximo 5 votos. Depois disso, o botão aparece riscado como "todos já votaram". A trava é conferida ao escolher o grupo, ao confirmar o voto e de novo no PC.
- **Sem Wi-Fi, o voto não se perde:** ele fica guardado no tablet, inclusive se o App for fechado, e já conta no limite do grupo. Quando a rede volta, o voto é enviado. A barra do topo mostra "Sem rede · N votos guardados aguardando envio".
- Se o PC recusar um voto guardado (por exemplo, outro tablet completou o grupo enquanto este estava sem rede), o tablet mostra um aviso para chamar a guia.
- Opção da guia **"Proibir voto na própria regra"**, contra o voto de torcida.
- **Sigilo:** o tablet nunca recebe as escolhas, só a contagem por grupo. Depois de confirmado, o voto não aparece na tela.
- Turma de **4 a 40 alunos**, em grupos de até 5, com no mínimo 2 grupos e lados alternados (L1, C1, L2, C2…).

## Passo a passo no dia da visita

1. **Rede:** ligue o PC e os tablets na **mesma rede Wi-Fi**. O mais seguro é levar um roteador próprio ou usar o roteamento do celular. Redes de órgãos públicos costumam impedir que os aparelhos se enxerguem.
2. **PC da guia** (precisa do Node 24 e de uma cópia deste repositório com `npm ci` feito):
   ```sh
   npm run servidor
   ```
   A janela mostra o endereço para digitar no tablet, por exemplo `192.168.0.10:8787`, e o painel em `http://localhost:8787`. Na primeira vez, o Windows pode perguntar se libera a rede para o Node. Responda **Permitir em redes privadas**.
3. **Painel** (no navegador do PC): informe o número de alunos e toque em "Formar grupos". Digite as regras dos grupos, toque em "Salvar regras" e depois em "Abrir a votação".
4. **Tablet:** na primeira vez, digite o endereço do PC e toque em "Conectar". No iPad e no iPhone, aceite a permissão de **Rede Local**.
5. Quando todos votarem, toque em "Encerrar a votação" no painel e use a apuração.

### Com a simulação HTML (guia + telão)

O servidor também pode servir a pasta da simulação. Nesse modo, a guia abre e encerra a votação pela própria simulação, e os votos dos tablets entram na contagem da guia e do telão:

```sh
npm run servidor -- ~/Desktop/plenario-em-jogo
```

Abra `http://localhost:8787` no Chrome (em vez de abrir o arquivo). "Formar grupos" e "Recomeçar" na simulação começam uma votação nova no servidor. O painel técnico continua em `http://localhost:8787/painel`. Rotas usadas pela simulação: `POST /api/guia/limpar` e `POST /api/guia/abrir` (com a turma e as regras), e `GET /api/guia` (contagem, votos e endereços).

Os votos ficam salvos em `servidor/dados/sessao.json`. Se o PC reiniciar, nada se perde. Essa pasta não vai para o GitHub.

## Gerar o APK e instalar

### Android (APK pelo EAS, na nuvem da Expo)

Precisa de uma conta gratuita em expo.dev.

```sh
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile apk
```

No fim, o EAS mostra um link e um QR code para baixar o `.apk` no tablet. No Android, autorize a "instalação de apps desconhecidos" para o navegador ou o gerenciador de arquivos.

Alternativa local, com Android Studio instalado: `npx expo run:android --variant release`.

### iPad e iPhone

Igual à Etapa 1 (Mac com Xcode, Personal Team gratuito):

```sh
npx expo prebuild --platform ios
npx --no-install expo run:ios --configuration Release --device
```

Atenção: com a conta Apple gratuita, a instalação **vence em 7 dias**. Instale perto da data de uso.

## Tecnologias

| Tecnologia | Versão |
| --- | --- |
| Expo | SDK 58 |
| React Native | 0.88.1 |
| React | 19.3.0 |
| TypeScript | 6.0.3 |
| Jest / jest-expo | 30.5.2 / 58.0.14 |
| AsyncStorage | 2.2.0 (votos guardados no tablet) |
| expo-build-properties | 58.0.x (libera HTTP na rede local no Android) |
| Node (PC da guia) | 24 LTS |

## Estrutura

| Pasta/arquivo | O que tem |
| --- | --- |
| `src/domain/groups.ts` | Formação dos grupos (4 a 40 alunos, L1/C1…) |
| `src/domain/urna.ts` | Regra de votos e apuração. Usada pelo App **e** pelo servidor |
| `src/domain/fila.ts` | Fila de votos guardados sem rede |
| `src/rede/protocolo.ts` | Formato das mensagens entre tablet e PC |
| `src/urna/` | Conexão com o PC, armazenamento no tablet e o "cérebro" da urna (`useUrna`) |
| `App.tsx` | Telas da urna |
| `servidor/` | Servidorzinho do PC, painel da guia e testes |
| `docs/evidencias-tdd/` | Evidências RED/GREEN/REFACTOR das Etapas 1 e 2 |

## Testes

```sh
npm test                 # Jest: 141 testes (regra, fila, protocolo e telas)
npm run test:servidor    # servidorzinho: 10 testes por HTTP
npx tsc --noEmit         # tipos
```

As evidências de TDD da Etapa 2 estão em [`docs/evidencias-tdd/dev-urna/`](docs/evidencias-tdd/dev-urna/README.md). As da Etapa 1 continuam em [`docs/evidencias-tdd/`](docs/evidencias-tdd/README.md).

## Limitações conhecidas

- **A urna não sabe quem é quem.** Se um aluno do C1 tocar em "L1" por engano, o voto conta para o L1, e mais tarde um aluno do L1 encontra o grupo cheio. A tela orienta a chamar a guia. Resolver de vez exigiria identificar o eleitor, o que custa tempo e sigilo. Esse comportamento está documentado como teste.
- Com **vários tablets sem rede ao mesmo tempo**, cada um só sabe dos próprios votos guardados. O PC recusa o excedente quando eles reconectam, e o tablet avisa. Por isso o ideal é rede estável e um tablet por vez em cada grupo.
- Votos guardados offline que chegam **depois** de a guia encerrar a votação são recusados ("a votação já tinha sido encerrada"). O painel mostra quantos votos cada tablet tem guardados, para a guia esperar antes de encerrar.
- O painel da guia não tem senha: qualquer aparelho na mesma rede pode abri-lo. Na rede própria (roteador da guia), isso não é problema.
- A integração com a simulação HTML (guia e telão lendo os votos direto do servidor) ainda não foi feita. O servidor já aceita chamadas da página HTML (CORS liberado).
- APK e app iOS **ainda não foram compilados nem validados em aparelho** nesta versão.

## Histórico

- **Etapa 1 (nov/2026):** protótipo com um desafio dos Três Poderes, temporizador e pontuação, validado em iPhone 8 Plus. Descartado na Etapa 2. O código está no histórico do Git, e as evidências de TDD continuam em `docs/`.
- **Etapa 2:** o App vira a urna de votação da atividade do Plenário.
