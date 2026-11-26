import { aplicarRespostas, contagemLocal, gruposCheiosLocal, type RespostaEnvio } from './fila';
import type { GrupoUrna, Voto } from './urna';

/*
 * DEV-URNA-03: fila de votos guardados no tablet quando o Wi-Fi cai.
 * Caso 3 do registro do defeito: votos guardados offline também contam no limite do grupo.
 */

const GRUPOS: GrupoUrna[] = [
  { id: 'L1', side: 'Lia', size: 5, rule: 'a' },
  { id: 'C1', side: 'Caio', size: 2, rule: 'b' },
];
const v = (id: string, group: string, rule = 'L1'): Voto => ({ id, group, rule });

describe('contagemLocal: o que o PC já recebeu + o que está guardado no tablet', () => {
  test('soma a contagem do PC com os votos pendentes de cada grupo', () => {
    expect(contagemLocal(GRUPOS, { L1: 2, C1: 1 }, [v('a', 'L1'), v('b', 'L1'), v('c', 'C1')]))
      .toEqual({ L1: 4, C1: 2 });
  });

  test('sem contagem do PC (tablet nunca conectou nesta votação) usa zero', () => {
    expect(contagemLocal(GRUPOS, {}, [v('a', 'C1')])).toEqual({ L1: 0, C1: 1 });
  });
});

describe('gruposCheiosLocal: caso 3, votos offline contam no limite', () => {
  test('grupo fica "todos já votaram" quando PC + pendentes atingem o tamanho', () => {
    expect(gruposCheiosLocal(GRUPOS, { C1: 1 }, [v('a', 'C1')])).toEqual(new Set(['C1']));
  });

  test('só com votos offline (Wi-Fi caiu desde o começo) o grupo também trava', () => {
    expect(gruposCheiosLocal(GRUPOS, {}, [v('a', 'C1'), v('b', 'C1')])).toEqual(new Set(['C1']));
  });

  test('abaixo do tamanho, ninguém trava', () => {
    expect(gruposCheiosLocal(GRUPOS, { L1: 4, C1: 1 }, []).size).toBe(0);
  });
});

describe('aplicarRespostas: o que fazer com a resposta do PC', () => {
  const pendentes = [v('a', 'L1'), v('b', 'L1'), v('c', 'C1'), v('d', 'C1')];

  test('ACEITO e DUPLICADO saem da fila (o PC já tem o voto)', () => {
    const respostas: RespostaEnvio[] = [
      { id: 'a', result: { status: 'ACEITO' } },
      { id: 'b', result: { status: 'DUPLICADO' } },
    ];
    const r = aplicarRespostas(pendentes, respostas);
    expect(r.pendentes.map(p => p.id)).toEqual(['c', 'd']);
    expect(r.recusados).toEqual([]);
  });

  test('RECUSADO sai da fila e é relatado, para o tablet avisar a guia', () => {
    const r = aplicarRespostas(pendentes, [{ id: 'd', result: { status: 'RECUSADO', reason: 'GRUPO_COMPLETO' } }]);
    expect(r.pendentes.map(p => p.id)).toEqual(['a', 'b', 'c']);
    expect(r.recusados).toEqual([{ voto: v('d', 'C1'), reason: 'GRUPO_COMPLETO' }]);
  });

  test('voto sem resposta (conexão caiu no meio) continua guardado, na mesma ordem', () => {
    const r = aplicarRespostas(pendentes, [{ id: 'c', result: { status: 'ACEITO' } }]);
    expect(r.pendentes.map(p => p.id)).toEqual(['a', 'b', 'd']);
  });

  test('resposta para um id que não está na fila é ignorada', () => {
    const r = aplicarRespostas(pendentes, [{ id: 'zzz', result: { status: 'RECUSADO', reason: 'URNA_FECHADA' } }]);
    expect(r.pendentes).toEqual(pendentes);
    expect(r.recusados).toEqual([]);
  });

  test('não altera a fila recebida', () => {
    const copia = [...pendentes];
    aplicarRespostas(pendentes, [{ id: 'a', result: { status: 'ACEITO' } }]);
    expect(pendentes).toEqual(copia);
  });
});
