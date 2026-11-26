import { formGroups, MAX_ALUNOS, MIN_ALUNOS } from './groups';

/*
 * DEV-URNA-01: formação dos grupos da atividade do Plenário.
 * Mesma regra da simulação 3 (v59/v60): turma de 4 a 40 alunos, grupos de até 5,
 * pelo menos 2 grupos (um da Lia e um do Caio), lados alternados L1, C1, L2, C2…
 */

const sizesOf = (total: number) => formGroups(total).map(group => group.size);
const idsOf = (total: number) => formGroups(total).map(group => group.id);

describe('formGroups: limites da turma (RG-01)', () => {
  test('a turma vai de 4 a 40 alunos', () => {
    expect(MIN_ALUNOS).toBe(4);
    expect(MAX_ALUNOS).toBe(40);
  });

  test.each([0, -1, 3, 41, 100, 4.5, 36.5, NaN, Infinity, -Infinity])(
    'rejeita quantidade numérica inválida: %s', value => {
      expect(() => formGroups(value)).toThrow(RangeError);
      expect(() => formGroups(value)).toThrow('de 4 a 40');
    },
  );

  test.each([undefined, null, true, '36', '', [], {}, new Number(36)])(
    'rejeita entrada sem coerção: %p', value => {
      expect(() => formGroups(value)).toThrow(TypeError);
      expect(() => formGroups(value)).toThrow('número');
    },
  );
});

describe('formGroups: exemplos aprovados (RG-02 a RG-04)', () => {
  test.each<[number, string[], number[]]>([
    [4, ['L1', 'C1'], [2, 2]],
    [5, ['L1', 'C1'], [3, 2]],
    [9, ['L1', 'C1'], [5, 4]],
    [10, ['L1', 'C1'], [5, 5]],
    [11, ['L1', 'C1', 'L2'], [4, 4, 3]],
    [31, ['L1', 'C1', 'L2', 'C2', 'L3', 'C3', 'L4'], [5, 5, 5, 4, 4, 4, 4]],
    [36, ['L1', 'C1', 'L2', 'C2', 'L3', 'C3', 'L4', 'C4'], [5, 5, 5, 5, 4, 4, 4, 4]],
    [40, ['L1', 'C1', 'L2', 'C2', 'L3', 'C3', 'L4', 'C4'], [5, 5, 5, 5, 5, 5, 5, 5]],
  ])('%i alunos formam os grupos esperados', (total, ids, sizes) => {
    expect(idsOf(total)).toEqual(ids);
    expect(sizesOf(total)).toEqual(sizes);
  });

  test('36 alunos (turma de sexta, 27/11): lados alternados começando pela Lia', () => {
    expect(formGroups(36).map(group => group.side)).toEqual(
      ['Lia', 'Caio', 'Lia', 'Caio', 'Lia', 'Caio', 'Lia', 'Caio'],
    );
  });
});

describe('formGroups: propriedades para toda turma válida (RG-02 a RG-05)', () => {
  test.each(Array.from({ length: MAX_ALUNOS - MIN_ALUNOS + 1 }, (_, index) => index + MIN_ALUNOS))(
    '%i alunos: soma, limite de 5, equilíbrio, ordem e nomes por lado', total => {
      const groups = formGroups(total);
      const sizes = groups.map(group => group.size);

      expect(groups).toHaveLength(Math.max(2, Math.ceil(total / 5)));
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(total);
      for (const size of sizes) {
        expect(Number.isInteger(size)).toBe(true);
        expect(size).toBeGreaterThan(0);
        expect(size).toBeLessThanOrEqual(5);
      }
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(sizes).toEqual([...sizes].sort((a, b) => b - a));

      // Sempre há pelo menos um grupo de cada lado.
      expect(groups.some(group => group.side === 'Lia')).toBe(true);
      expect(groups.some(group => group.side === 'Caio')).toBe(true);

      // Lados alternados e numeração própria de cada lado: L1, C1, L2, C2…
      groups.forEach((group, index) => {
        const side = index % 2 === 0 ? 'Lia' : 'Caio';
        expect(group.side).toBe(side);
        expect(group.id).toBe(`${side === 'Lia' ? 'L' : 'C'}${Math.floor(index / 2) + 1}`);
      });
      expect(new Set(groups.map(group => group.id)).size).toBe(groups.length);
    },
  );
});

describe('formGroups: determinismo e isolamento (RG-06)', () => {
  test('chamadas intercaladas não carregam estado e devolvem objetos novos', () => {
    const expected = formGroups(23);
    formGroups(4);
    formGroups(40);
    expect(formGroups(23)).toEqual(expected);
    expect(formGroups(23)).not.toBe(expected);
  });

  test('alterar um resultado não modifica chamadas futuras', () => {
    const groups = formGroups(9);
    groups[0].id = 'ALTERADO';
    groups[0].size = 99;
    expect(formGroups(9)[0]).toEqual({ id: 'L1', side: 'Lia', size: 5 });
  });

  test('calcula sem consultar rede, relógio ou aleatoriedade', () => {
    const unexpected = () => { throw new Error('Dependência externa não permitida'); };
    const clock = jest.spyOn(Date, 'now').mockImplementation(unexpected);
    const random = jest.spyOn(Math, 'random').mockImplementation(unexpected);
    const network = jest.spyOn(globalThis, 'fetch').mockImplementation(unexpected);
    try {
      expect(formGroups(9)).toEqual([
        { id: 'L1', side: 'Lia', size: 5 },
        { id: 'C1', side: 'Caio', size: 4 },
      ]);
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
