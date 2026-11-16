import { formGroups } from './groups';

const DOSSIERS = ['PEDESTRES', 'VEICULOS', 'LEGISLACAO', 'FISCALIZACAO'];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

describe('formGroups: casos de aceitação RG-01 a RG-04', () => {
  test.each<[number, number[]]>([
    [9, [5, 4]],
    [16, [4, 4, 4, 4]],
    [20, [5, 5, 5, 5]],
    [23, [5, 5, 5, 4, 4]],
    [31, [5, 5, 5, 4, 4, 4, 4]],
  ])('%i estudantes têm a distribuição aprovada', (total, sizes) => {
    const groups = formGroups(total);
    expect(groups.map(group => group.size)).toEqual(sizes);
    expect(groups.map(group => group.id)).toEqual(LETTERS.slice(0, sizes.length));
  });

  test.each(Array.from({ length: 23 }, (_, index) => index + 9))(
    'RG-02/RG-03: %i estudantes preservam soma, limite, equilíbrio e ordem', total => {
      const groups = formGroups(total);
      const sizes = groups.map(group => group.size);
      expect(groups).toHaveLength(Math.ceil(total / 5));
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(total);
      for (const size of sizes) {
        expect(Number.isInteger(size)).toBe(true);
        expect(size).toBeGreaterThan(0);
        expect(size).toBeLessThanOrEqual(5);
      }
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
      expect(groups.map(group => group.id)).toEqual(LETTERS.slice(0, groups.length));
      expect(new Set(groups.map(group => group.id)).size).toBe(groups.length);
      expect(new Set(groups.flatMap(group => group.dossierIds))).toEqual(new Set(DOSSIERS));
      for (const group of groups) {
        expect(group.dossierIds.length).toBeGreaterThan(0);
        expect(new Set(group.dossierIds).size).toBe(group.dossierIds.length);
      }
    },
  );
});

describe('formGroups: rejeição explícita de entradas inválidas (RG-01)', () => {
  test.each([0, -1, -10, 8, 32, 100, 9.5, 15.5, 30.5, NaN, Infinity, -Infinity])(
    'rejeita quantidade numérica inválida: %s', value => {
      expect(() => formGroups(value)).toThrow(RangeError);
      expect(() => formGroups(value)).toThrow('entre 9 e 31');
    },
  );

  test.each([undefined, null, true, false, '9', '16', '', [], {}, new Number(9)])(
    'rejeita entrada sem coerção: %p', value => {
      expect(() => formGroups(value)).toThrow(TypeError);
      expect(() => formGroups(value)).toThrow('número');
    },
  );
});

describe('formGroups: dossiês estáveis e distribuição circular (RG-05 a RG-07)', () => {
  test.each<[number, string[][]]>([
    [9, [['PEDESTRES', 'LEGISLACAO'], ['VEICULOS', 'FISCALIZACAO']]],
    [11, [['PEDESTRES', 'FISCALIZACAO'], ['VEICULOS'], ['LEGISLACAO']]],
    [16, [['PEDESTRES'], ['VEICULOS'], ['LEGISLACAO'], ['FISCALIZACAO']]],
    [23, [['PEDESTRES'], ['VEICULOS'], ['LEGISLACAO'], ['FISCALIZACAO'], ['PEDESTRES']]],
    [26, [['PEDESTRES'], ['VEICULOS'], ['LEGISLACAO'], ['FISCALIZACAO'], ['PEDESTRES'], ['VEICULOS']]],
    [31, [['PEDESTRES'], ['VEICULOS'], ['LEGISLACAO'], ['FISCALIZACAO'], ['PEDESTRES'], ['VEICULOS'], ['LEGISLACAO']]],
  ])('%i estudantes recebem os dossiês esperados', (total, dossiers) => {
    expect(formGroups(total).map(group => group.dossierIds)).toEqual(dossiers);
  });
});

describe('formGroups: determinismo, isolamento e execução offline (RG-08/RG-09)', () => {
  test('chamadas intercaladas não carregam estado de outra formação', () => {
    const expected = formGroups(23);
    formGroups(9);
    formGroups(31);
    expect(formGroups(23)).toEqual(expected);
    expect(formGroups(23)).not.toBe(expected);
  });

  test('alterar um resultado não modifica chamadas futuras nem outro grupo', () => {
    const groups = formGroups(23);
    groups[0].id = 'ALTERADO';
    groups[0].size = 99;
    groups[0].dossierIds.push('FISCALIZACAO');
    expect(groups[4].dossierIds).toEqual(['PEDESTRES']);
    const fresh = formGroups(23);
    expect(fresh[0]).toEqual({ id: 'A', size: 5, dossierIds: ['PEDESTRES'] });
    expect(fresh[4].dossierIds).toEqual(['PEDESTRES']);
  });

  test('carrega e calcula sem consultar rede, relógio ou aleatoriedade', () => {
    const unexpected = () => { throw new Error('Dependência externa não permitida'); };
    const clock = jest.spyOn(Date, 'now').mockImplementation(unexpected);
    const random = jest.spyOn(Math, 'random').mockImplementation(unexpected);
    const network = jest.spyOn(globalThis, 'fetch').mockImplementation(unexpected);
    try {
      jest.isolateModules(() => {
        const isolated: typeof import('./groups') = require('./groups');
        expect(isolated.formGroups(9)).toEqual([
          { id: 'A', size: 5, dossierIds: ['PEDESTRES', 'LEGISLACAO'] },
          { id: 'B', size: 4, dossierIds: ['VEICULOS', 'FISCALIZACAO'] },
        ]);
      });
      expect(clock).not.toHaveBeenCalled();
      expect(random).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
      random.mockRestore();
      network.mockRestore();
    }
  });
});
