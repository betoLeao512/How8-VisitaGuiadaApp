import { normalizarEndereco, parseEstado, parseRespostas } from './protocolo';

const ESTADO = {
  sessao: 's1', open: true, noOwn: false, total: 9,
  groups: [
    { id: 'L1', side: 'Lia', size: 5, rule: 'Regra A' },
    { id: 'C1', side: 'Caio', size: 4, rule: '' },
  ],
  contagem: { L1: 2, C1: 0 },
};

describe('parseEstado', () => {
  test('aceita o estado enviado pelo PC', () => {
    expect(parseEstado(ESTADO)).toEqual(ESTADO);
  });

  test('contagem ausente ou estranha vira zero, e grupos desconhecidos na contagem são descartados', () => {
    expect(parseEstado({ ...ESTADO, contagem: { L1: -3, X9: 4 } })?.contagem).toEqual({ L1: 0, C1: 0 });
  });

  test.each([
    null, 'texto', [],
    { ...ESTADO, open: 'sim' },
    { ...ESTADO, groups: [{ id: 'L1', side: 'Outro', size: 5, rule: '' }] },
    { ...ESTADO, groups: [{ id: 'L1', side: 'Lia', size: 2.5, rule: '' }] },
    { ...ESTADO, total: -1 },
  ])('recusa estado fora do formato: %p', v => {
    expect(parseEstado(v)).toBeNull();
  });
});

describe('parseRespostas', () => {
  test('mantém só respostas bem formadas', () => {
    expect(parseRespostas({
      respostas: [
        { id: 'a', result: { status: 'ACEITO' } },
        { id: 'b', result: { status: 'RECUSADO', reason: 'GRUPO_COMPLETO' } },
        { id: 'c', result: { status: 'TALVEZ' } },
        { id: 'd', result: { status: 'RECUSADO' } },
        'lixo',
      ],
    })).toEqual([
      { id: 'a', result: { status: 'ACEITO' } },
      { id: 'b', result: { status: 'RECUSADO', reason: 'GRUPO_COMPLETO' } },
    ]);
  });

  test('corpo inesperado não derruba a urna', () => {
    expect(parseRespostas(undefined)).toEqual([]);
    expect(parseRespostas({ respostas: 'x' })).toEqual([]);
  });
});

describe('normalizarEndereco: o que a guia digita no tablet', () => {
  test.each([
    ['192.168.0.10', 'http://192.168.0.10:8787'],
    ['192.168.0.10:9000', 'http://192.168.0.10:9000'],
    ['  http://192.168.0.10:8787/ ', 'http://192.168.0.10:8787'],
    ['HTTP://pc-da-guia.local', 'http://pc-da-guia.local:8787'],
  ])('%p → %p', (entrada, saida) => {
    expect(normalizarEndereco(entrada)).toBe(saida);
  });

  test.each(['', '   ', 'ftp://1.2.3.4', '1.2.3.4:99999', '1.2.3.4/caminho', 'com espaço'])(
    'recusa %p', entrada => {
      expect(normalizarEndereco(entrada)).toBeNull();
    },
  );
});
