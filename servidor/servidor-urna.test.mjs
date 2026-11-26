// Testes do servidorzinho: npm run test:servidor
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarServidor } from './servidor-urna.mjs';

let server, base;
before(async () => {
  server = criarServidor({ dataFile: null });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = async p => (await fetch(base + p)).json();
async function post(p, corpo) {
  const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo ?? {}) });
  return { status: r.status, dados: await r.json() };
}

test('turma de 9: dois grupos (L1 com 5, C1 com 4), urna começa fechada', async () => {
  const { status, dados } = await post('/api/guia/turma', { alunos: 9, confirmar: true });
  assert.equal(status, 200);
  assert.deepEqual(dados.groups.map(g => [g.id, g.size]), [['L1', 5], ['C1', 4]]);
  assert.equal(dados.open, false);
});

test('turma fora de 4 a 40 é recusada', async () => {
  const { status } = await post('/api/guia/turma', { alunos: 41, confirmar: true });
  assert.equal(status, 400);
});

test('regras entram antes de abrir; urna fechada recusa voto', async () => {
  await post('/api/guia/regras', { regras: { L1: ' Faixa para pedestres ', C1: 'Motos devagar' } });
  const estado = await get('/api/urna');
  assert.equal(estado.groups[0].rule, 'Faixa para pedestres');
  const r = await post('/api/votos', { sessao: estado.sessao, aparelho: 't1', votos: [{ id: 'a', group: 'L1', rule: 'C1' }] });
  assert.deepEqual(r.dados.respostas[0].result, { status: 'RECUSADO', reason: 'URNA_FECHADA' });
});

test('aberta: aceita até o tamanho do grupo, recusa o 6º do L1 e conta reenvio uma vez', async () => {
  await post('/api/guia/abrir');
  const { sessao } = await get('/api/urna');
  const votos = Array.from({ length: 6 }, (_, k) => ({ id: `L1-${k}`, group: 'L1', rule: 'C1' }));
  const r = await post('/api/votos', { sessao, aparelho: 't1', pendentes: 0, votos });
  assert.deepEqual(r.dados.respostas.map(x => x.result.status), ['ACEITO', 'ACEITO', 'ACEITO', 'ACEITO', 'ACEITO', 'RECUSADO']);
  assert.equal(r.dados.respostas[5].result.reason, 'GRUPO_COMPLETO');

  const reenvio = await post('/api/votos', { sessao, aparelho: 't2', votos: [votos[0]] });
  assert.equal(reenvio.dados.respostas[0].result.status, 'DUPLICADO');
  assert.deepEqual((await get('/api/urna')).contagem, { L1: 5, C1: 0 });
});

test('o tablet nunca recebe as escolhas, só a contagem', async () => {
  const estado = await get('/api/urna');
  assert.equal('votes' in estado, false);
  assert.equal('apuracao' in estado, false);
});

test('voto de uma votação antiga (outra sessão) é recusado com 409', async () => {
  const r = await post('/api/votos', { sessao: 'antiga', aparelho: 't1', votos: [{ id: 'z', group: 'C1', rule: 'L1' }] });
  assert.equal(r.status, 409);
  assert.equal(r.dados.erro, 'SESSAO_DIFERENTE');
});

test('regras não mudam com a votação aberta', async () => {
  const r = await post('/api/guia/regras', { regras: { L1: 'outra' } });
  assert.equal(r.status, 409);
});

test('painel da guia vê aparelhos, guardados offline e a apuração', async () => {
  await fetch(`${base}/api/urna?aparelho=tablet-ipad&pendentes=3`);
  const g = await get('/api/guia?x=1');
  assert.equal(g.recebidos, 5);
  assert.deepEqual(g.apuracao.winners, ['C1']);
  const ipad = g.aparelhos.find(a => a.id === 'tablet-ipad');
  assert.equal(ipad.pendentes, 3);
  assert.equal(ipad.online, true);
});

test('nova turma com votos exige confirmação', async () => {
  assert.equal((await post('/api/guia/turma', { alunos: 36 })).status, 409);
  const ok = await post('/api/guia/turma', { alunos: 36, confirmar: true });
  assert.equal(ok.dados.groups.length, 8);
  assert.equal(ok.dados.recebidos, 0);
});

test('JSON inválido e rota desconhecida', async () => {
  const r = await fetch(`${base}/api/votos`, { method: 'POST', body: '{nao é json' });
  assert.equal(r.status, 400);
  assert.equal((await fetch(`${base}/api/nada`)).status, 404);
});
