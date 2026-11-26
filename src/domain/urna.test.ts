import {
  apurar, contagemPorGrupo, parseVoto, registrarVoto, totalAlunos,
  type GrupoUrna, type SessaoUrna, type Voto,
} from './urna';

/*
 * DEV-URNA-02: regra de votos da urna.
 * Casos 1 a 5 vêm do registro do defeito encontrado pelo Leao na simulação (26/11):
 * a urna aceitava 12 votos no L1, que tinha 5 integrantes.
 */

const GRUPOS: GrupoUrna[] = [
  { id: 'L1', side: 'Lia', size: 5, rule: 'Faixa só para pedestres no meio da rua' },
  { id: 'C1', side: 'Caio', size: 4, rule: 'Motos a no máximo 10 km/h' },
  { id: 'L2', side: 'Lia', size: 3, rule: 'Placas nas duas entradas' },
];

function sessao(parcial: Partial<SessaoUrna> = {}): SessaoUrna {
  return { groups: GRUPOS, noOwn: false, open: true, votes: [], ...parcial };
}

let seq = 0;
const voto = (group: string, rule: string, id = `v${++seq}`): Voto => ({ id, group, rule });

/** Registra uma sequência de votos e devolve a sessão final e os resultados. */
function votar(inicial: SessaoUrna, votos: unknown[]) {
  let s = inicial;
  const resultados = votos.map(v => {
    const r = registrarVoto(s, v);
    s = r.session;
    return r.result;
  });
  return { s, resultados };
}

describe('registrarVoto: limite por grupo (defeito da simulação, casos 1, 2 e 4)', () => {
  test('caso 1: aceita votos de um grupo até o tamanho dele', () => {
    const { s, resultados } = votar(sessao(), Array.from({ length: 5 }, () => voto('L1', 'C1')));
    expect(resultados).toEqual(Array(5).fill({ status: 'ACEITO' }));
    expect(contagemPorGrupo(s)).toEqual({ L1: 5, C1: 0, L2: 0 });
  });

  test('caso 2: recusa o voto de número tamanho + 1 (o 6º voto do L1)', () => {
    const { s, resultados } = votar(sessao(), Array.from({ length: 6 }, () => voto('L1', 'C1')));
    expect(resultados[5]).toEqual({ status: 'RECUSADO', reason: 'GRUPO_COMPLETO' });
    expect(s.votes).toHaveLength(5);
  });

  test('o reteste do Leao: 12 tentativas no L1 de 5 pessoas resultam em 5 votos', () => {
    const { s } = votar(sessao(), Array.from({ length: 12 }, () => voto('L1', 'L2')));
    expect(contagemPorGrupo(s).L1).toBe(5);
  });

  test('caso 4: o total aceito nunca passa da soma dos tamanhos dos grupos', () => {
    const ids = GRUPOS.map(g => g.id);
    const tentativas = Array.from({ length: 60 }, (_, k) => voto(ids[(k * 7) % 3], ids[(k * 5) % 3]));
    const { s } = votar(sessao(), tentativas);
    expect(s.votes.length).toBe(totalAlunos(GRUPOS));
    for (const g of GRUPOS) expect(contagemPorGrupo(s)[g.id]).toBe(g.size);
  });

  test('caso 5 (limite conhecido): a urna não sabe quem é quem; um voto no grupo errado ocupa a vaga', () => {
    // Um aluno do C1 toca em "L1" por engano. A urna aceita, e o último aluno do L1 encontra o grupo cheio.
    const { s, resultados } = votar(sessao(), [
      voto('L1', 'C1'), voto('L1', 'C1'), voto('L1', 'C1'), voto('L1', 'C1'),
      voto('L1', 'L2'), // na verdade era do C1
      voto('L1', 'L1'), // o 5º integrante real do L1
    ]);
    expect(resultados[4]).toEqual({ status: 'ACEITO' });
    expect(resultados[5]).toEqual({ status: 'RECUSADO', reason: 'GRUPO_COMPLETO' });
    expect(contagemPorGrupo(s)).toEqual({ L1: 5, C1: 0, L2: 0 });
  });
});

describe('registrarVoto: reenvio do mesmo voto (rede instável)', () => {
  test('o mesmo voto enviado de novo conta uma vez só', () => {
    const v = voto('C1', 'L1', 'tablet-A-1');
    const { s, resultados } = votar(sessao(), [v, { ...v }, { ...v }]);
    expect(resultados).toEqual([{ status: 'ACEITO' }, { status: 'DUPLICADO' }, { status: 'DUPLICADO' }]);
    expect(s.votes).toHaveLength(1);
  });

  test('reenvio de um voto já aceito é DUPLICADO mesmo depois de a guia encerrar a votação', () => {
    const v = voto('C1', 'L1', 'tablet-A-2');
    const { s } = votar(sessao(), [v]);
    expect(registrarVoto({ ...s, open: false }, v).result).toEqual({ status: 'DUPLICADO' });
  });

  test('o mesmo id com outra escolha não troca o voto já guardado', () => {
    const { s, resultados } = votar(sessao(), [voto('C1', 'L1', 'x'), voto('C1', 'L2', 'x')]);
    expect(resultados[1]).toEqual({ status: 'DUPLICADO' });
    expect(s.votes).toEqual([{ id: 'x', group: 'C1', rule: 'L1' }]);
  });
});

describe('registrarVoto: outras recusas', () => {
  test('urna fechada não aceita voto novo', () => {
    expect(registrarVoto(sessao({ open: false }), voto('L1', 'C1')).result)
      .toEqual({ status: 'RECUSADO', reason: 'URNA_FECHADA' });
  });

  test('grupo inexistente', () => {
    expect(registrarVoto(sessao(), voto('C9', 'L1')).result)
      .toEqual({ status: 'RECUSADO', reason: 'GRUPO_INEXISTENTE' });
  });

  test('regra inexistente', () => {
    expect(registrarVoto(sessao(), voto('L1', 'C9')).result)
      .toEqual({ status: 'RECUSADO', reason: 'REGRA_INEXISTENTE' });
  });

  test('com "proibir voto na própria regra", recusa o voto do grupo na própria regra', () => {
    const s = sessao({ noOwn: true });
    expect(registrarVoto(s, voto('L1', 'L1')).result)
      .toEqual({ status: 'RECUSADO', reason: 'VOTO_NA_PROPRIA_REGRA' });
    expect(registrarVoto(s, voto('L1', 'L2')).result).toEqual({ status: 'ACEITO' });
  });

  test('sem essa opção, votar na própria regra é permitido', () => {
    expect(registrarVoto(sessao(), voto('L1', 'L1')).result).toEqual({ status: 'ACEITO' });
  });

  test.each([
    undefined, null, 'L1', 42, [], {},
    { id: 'a', group: 'L1' },
    { id: '', group: 'L1', rule: 'C1' },
    { id: 'a', group: 1, rule: 'C1' },
    { id: 'x'.repeat(81), group: 'L1', rule: 'C1' },
  ])('dado malformado vindo da rede é VOTO_INVALIDO: %p', entrada => {
    const r = registrarVoto(sessao(), entrada);
    expect(r.result).toEqual({ status: 'RECUSADO', reason: 'VOTO_INVALIDO' });
    expect(r.session.votes).toHaveLength(0);
  });
});

describe('registrarVoto: não altera a sessão recebida', () => {
  test('devolve uma sessão nova e preserva a anterior', () => {
    const antes = sessao();
    const { session } = registrarVoto(antes, voto('L1', 'C1'));
    expect(antes.votes).toHaveLength(0);
    expect(session.votes).toHaveLength(1);
    expect(session).not.toBe(antes);
  });

  test('guarda só id, grupo e regra (campos extras não entram)', () => {
    const { session } = registrarVoto(sessao(), { id: 'k', group: 'L1', rule: 'C1', nome: 'Fulano' });
    expect(session.votes).toEqual([{ id: 'k', group: 'L1', rule: 'C1' }]);
  });
});

describe('parseVoto', () => {
  test('aceita um voto bem formado e descarta campos extras', () => {
    expect(parseVoto({ id: 'a1', group: 'L1', rule: 'C2', extra: true })).toEqual({ id: 'a1', group: 'L1', rule: 'C2' });
  });
  test('recusa o que não é voto', () => {
    expect(parseVoto('L1')).toBeNull();
  });
});

describe('apurar: mesma apuração da simulação 3', () => {
  const votos: Voto[] = [
    // L1 (Lia): 3 votam em C1, 2 em L1
    voto('L1', 'C1'), voto('L1', 'C1'), voto('L1', 'C1'), voto('L1', 'L1'), voto('L1', 'L1'),
    // C1 (Caio): 1 vota em L1, 3 em C1
    voto('C1', 'L1'), voto('C1', 'C1'), voto('C1', 'C1'), voto('C1', 'C1'),
  ];

  test('ordena por votos e aprova as x mais votadas', () => {
    const r = apurar(GRUPOS, votos, 1);
    expect(r.counts.map(c => [c.id, c.n])).toEqual([['C1', 6], ['L1', 3], ['L2', 0]]);
    expect([...r.winners]).toEqual(['C1']);
    expect(r.total).toBe(9);
  });

  test('empate no corte aprova as empatadas; regra sem voto nunca é aprovada', () => {
    const empate = [voto('L1', 'L1'), voto('C1', 'C1')];
    expect([...apurar(GRUPOS, empate, 1).winners].sort()).toEqual(['C1', 'L1']);
    expect([...apurar(GRUPOS, empate, 3).winners].sort()).toEqual(['C1', 'L1']);
  });

  test('mostra quanto cada lado votou em regra do outro lado', () => {
    const r = apurar(GRUPOS, votos, 1);
    expect(r.lia).toEqual({ total: 5, other: 3, pct: 60 });
    expect(r.caio).toEqual({ total: 4, other: 1, pct: 25 });
    expect(r.outsidePct).toBe(44); // 4 de 9 votaram numa regra de outro grupo
  });

  test('sem votos, tudo zerado e nenhuma aprovada', () => {
    const r = apurar(GRUPOS, [], 2);
    expect(r.winners.size).toBe(0);
    expect(r.outsidePct).toBe(0);
    expect(r.lia.pct).toBe(0);
  });
});
