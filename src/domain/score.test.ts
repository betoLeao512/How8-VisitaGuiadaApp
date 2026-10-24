import { calculateScore } from './score';

describe('calculateScore', () => {
  test('resposta correta retorna 100 pontos', () => {
    expect(calculateScore('correct')).toBe(100);
  });

  test('resposta incorreta retorna 0 pontos', () => {
    expect(calculateScore('incorrect')).toBe(0);
  });

  test('tempo esgotado retorna 0 pontos', () => {
    expect(calculateScore('timeout')).toBe(0);
  });
});
