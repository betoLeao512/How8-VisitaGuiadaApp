#!/usr/bin/env node
/*
 * Servidorzinho da urna, para rodar no PC da guia (Node 24 ou mais novo).
 *
 *   node servidor/servidor-urna.mjs            (porta 8787)
 *   PORTA=9000 node servidor/servidor-urna.mjs
 *
 * Recebe os votos dos tablets pela rede Wi-Fi e mostra o painel da guia em http://localhost:8787.
 * Usa a MESMA regra de votos do App (src/domain/urna.ts e groups.ts): limite por grupo,
 * voto repetido conta uma vez, urna fechada não aceita voto novo.
 * O estado fica salvo em servidor/dados/sessao.json, então reiniciar o PC não perde votos.
 * Não usa nenhuma biblioteca de fora.
 */
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { apurar, contagemPorGrupo, registrarVoto, totalAlunos } from '../src/domain/urna.ts';
import { formGroups } from '../src/domain/groups.ts';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MAX_CORPO = 64 * 1024;
const MAX_VOTOS_POR_ENVIO = 50;
const MAX_REGRA = 280;
const APARELHO_SUMIDO_MS = 15_000;

function novaSessao(alunos = 9) {
  return {
    sessao: crypto.randomUUID(),
    open: false,
    noOwn: false,
    groups: formGroups(alunos).map(g => ({ ...g, rule: '' })),
    votes: [],
  };
}

/** Cria o servidor. Exportado para os testes; `dataFile: null` desliga o arquivo. */
export function criarServidor({ dataFile = path.join(AQUI, 'dados', 'sessao.json'), agora = () => Date.now(), pastaSimulacao = null, porta = 8787 } = {}) {
  let estado = carregar() ?? novaSessao();
  const aparelhos = new Map(); // id → { pendentes, visto }

  function carregar() {
    if (!dataFile || !fs.existsSync(dataFile)) return null;
    try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch { return null; }
  }
  function salvar() {
    if (!dataFile) return;
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(estado, null, 2));
    fs.renameSync(tmp, dataFile);
  }

  const publico = () => ({
    sessao: estado.sessao, open: estado.open, noOwn: estado.noOwn,
    groups: estado.groups, contagem: contagemPorGrupo(estado), total: totalAlunos(estado.groups),
  });

  function verAparelho(id, pendentes) {
    if (typeof id !== 'string' || !id || id.length > 80) return;
    aparelhos.set(id, { pendentes: Number.isInteger(pendentes) && pendentes >= 0 ? pendentes : 0, visto: agora() });
  }
  const listaAparelhos = () => [...aparelhos].map(([id, a]) => ({
    id, pendentes: a.pendentes, online: agora() - a.visto < APARELHO_SUMIDO_MS, vistoHa: Math.round((agora() - a.visto) / 1000),
  }));

  const guia = x => ({
    ...publico(), recebidos: estado.votes.length, aparelhos: listaAparelhos(),
    votos: estado.votes, enderecos: enderecosDaRede().map(ip => `${ip}:${porta}`),
    apuracao: estado.votes.length ? serializar(apurar(estado.groups, estado.votes, x)) : null,
  });
  const serializar = r => ({ ...r, winners: [...r.winners] });

  // ---- rotas ----
  const rotas = {
    'GET /api/urna': (_c, url) => {
      verAparelho(url.searchParams.get('aparelho'), Number(url.searchParams.get('pendentes')));
      return [200, publico()];
    },
    'POST /api/votos': corpo => {
      if (!corpo || typeof corpo !== 'object') return [400, { erro: 'Corpo inválido.' }];
      verAparelho(corpo.aparelho, corpo.pendentes);
      if (corpo.sessao !== estado.sessao) return [409, { erro: 'SESSAO_DIFERENTE', sessao: estado.sessao }];
      if (!Array.isArray(corpo.votos) || corpo.votos.length > MAX_VOTOS_POR_ENVIO) return [400, { erro: 'Lista de votos inválida.' }];
      const respostas = [];
      for (const v of corpo.votos) {
        const r = registrarVoto(estado, v);
        estado = r.session;
        respostas.push({ id: typeof v?.id === 'string' ? v.id : '', result: r.result });
      }
      salvar();
      return [200, { respostas }];
    },
    'GET /api/guia': (_c, url) => [200, guia(Math.min(3, Math.max(1, Number(url.searchParams.get('x')) || 1)))],
    'POST /api/guia/turma': corpo => {
      if (estado.votes.length && !corpo?.confirmar) return [409, { erro: 'Já há votos nesta votação. Confirme para apagar e começar outra.' }];
      try { estado = novaSessao(corpo?.alunos); } catch (e) { return [400, { erro: e.message }]; }
      salvar();
      return [200, guia(1)];
    },
    'POST /api/guia/regras': corpo => {
      if (estado.open || estado.votes.length) return [409, { erro: 'As regras não mudam depois de abrir a votação.' }];
      const regras = corpo?.regras;
      if (!regras || typeof regras !== 'object') return [400, { erro: 'Envie { regras: { L1: "..." } }.' }];
      estado = { ...estado, groups: estado.groups.map(g => typeof regras[g.id] === 'string' ? { ...g, rule: regras[g.id].trim().slice(0, MAX_REGRA) } : g) };
      salvar();
      return [200, guia(1)];
    },
    'POST /api/guia/proibir-propria': corpo => {
      if (estado.open || estado.votes.length) return [409, { erro: 'Essa opção só muda antes de abrir a votação.' }];
      estado = { ...estado, noOwn: corpo?.valor === true };
      salvar();
      return [200, guia(1)];
    },
    'POST /api/guia/abrir': corpo => {
      // A simulação (guia em HTML) manda a turma e as regras na hora de abrir.
      if (corpo && Array.isArray(corpo.groups)) {
        const grupos = validarGrupos(corpo.groups);
        if (!grupos) return [400, { erro: 'Grupos inválidos.' }];
        const iguais = JSON.stringify(grupos) === JSON.stringify(estado.groups);
        if (!iguais && estado.votes.length) return [409, { erro: 'Já há votos com outra turma. Forme os grupos de novo para recomeçar.' }];
        estado = { ...estado, groups: grupos, noOwn: corpo.noOwn === true ? true : corpo.noOwn === false ? false : estado.noOwn };
      }
      estado = { ...estado, open: true }; salvar(); return [200, guia(1)];
    },
    'POST /api/guia/limpar': corpo => {
      // Começa uma votação nova (apaga os votos). Usado quando a guia forma os grupos ou recomeça.
      let grupos = estado.groups;
      if (corpo && Array.isArray(corpo.groups)) {
        grupos = validarGrupos(corpo.groups);
        if (!grupos) return [400, { erro: 'Grupos inválidos.' }];
      }
      estado = { sessao: crypto.randomUUID(), open: false, noOwn: corpo?.noOwn === true, groups: grupos, votes: [] };
      salvar();
      return [200, guia(1)];
    },
    'POST /api/guia/fechar': () => { estado = { ...estado, open: false }; salvar(); return [200, guia(1)]; },
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // CORS aberto: permite que a simulação HTML (aberta do arquivo) também converse com o servidor.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (req.method === 'GET' && (url.pathname === '/painel' || (url.pathname === '/' && !pastaSimulacao))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(AQUI, 'painel.html')));
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && pastaSimulacao && !url.pathname.startsWith('/api/')) {
      return servirArquivo(req, res, pastaSimulacao, url.pathname);
    }

    const rota = rotas[`${req.method} ${url.pathname}`];
    if (!rota) return responder(res, 404, { erro: 'Rota não encontrada.' });

    let tamanho = 0;
    const partes = [];
    req.on('data', c => {
      tamanho += c.length;
      if (tamanho > MAX_CORPO) { responder(res, 413, { erro: 'Corpo grande demais.' }); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let corpo = null;
      if (partes.length) {
        try { corpo = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { return responder(res, 400, { erro: 'JSON inválido.' }); }
      }
      try {
        const [status, dados] = rota(corpo, url);
        responder(res, status, dados);
      } catch (e) {
        responder(res, 500, { erro: 'Erro interno.' });
        console.error(e);
      }
    });
  });

  return server;
}

const SIDES = new Set(['Lia', 'Caio']);
/** Confere a turma enviada pela guia: ids únicos (L1, C1…), lado, tamanho de 1 a 5 e regra em texto. */
function validarGrupos(lista) {
  if (!Array.isArray(lista) || lista.length < 2 || lista.length > 20) return null;
  const vistos = new Set();
  const grupos = [];
  for (const g of lista) {
    if (!g || typeof g.id !== 'string' || !/^[A-Za-z0-9]{1,8}$/.test(g.id) || vistos.has(g.id)) return null;
    if (!SIDES.has(g.side) || !Number.isInteger(g.size) || g.size < 1 || g.size > 5) return null;
    vistos.add(g.id);
    grupos.push({ id: g.id, side: g.side, size: g.size, rule: typeof g.rule === 'string' ? g.rule.trim().slice(0, MAX_REGRA) : '' });
  }
  return grupos;
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

/** Serve a pasta da simulação (guia + telão). A raiz abre a primeira página .html da pasta. */
function servirArquivo(req, res, pasta, caminho) {
  const raiz = path.resolve(pasta);
  let rel = decodeURIComponent(caminho);
  if (rel === '/' || rel === '') {
    const html = fs.readdirSync(raiz).filter(n => n.toLowerCase().endsWith('.html')).sort((a, b) => (b.startsWith('ABRIR') - a.startsWith('ABRIR')) || a.localeCompare(b))[0];
    if (!html) return responder(res, 404, { erro: 'Nenhuma página .html na pasta da simulação.' });
    rel = '/' + html;
  }
  const alvo = path.resolve(raiz, '.' + rel);
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return responder(res, 403, { erro: 'Fora da pasta.' });
  let info;
  try { info = fs.statSync(alvo); } catch { return responder(res, 404, { erro: 'Arquivo não encontrado.' }); }
  if (!info.isFile()) return responder(res, 404, { erro: 'Arquivo não encontrado.' });
  const tipo = TIPOS[path.extname(alvo).toLowerCase()] ?? 'application/octet-stream';
  const intervalo = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (intervalo && (intervalo[1] || intervalo[2])) {
    // Áudio e vídeo pedem pedaços do arquivo (Range); sem isso o Chrome não deixa voltar ou avançar.
    let ini = intervalo[1] ? Number(intervalo[1]) : info.size - Number(intervalo[2]);
    let fim = intervalo[1] && intervalo[2] ? Number(intervalo[2]) : info.size - 1;
    ini = Math.max(0, ini); fim = Math.min(info.size - 1, fim);
    if (ini > fim) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
    res.writeHead(206, { 'Content-Type': tipo, 'Content-Length': fim - ini + 1, 'Content-Range': `bytes ${ini}-${fim}/${info.size}`, 'Accept-Ranges': 'bytes' });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(alvo, { start: ini, end: fim }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': info.size, 'Accept-Ranges': 'bytes' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(alvo).pipe(res);
}

function responder(res, status, dados) {
  if (res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(dados));
}

/* Endereços IPv4 do PC, com o do Wi-Fi primeiro. VPN, máquinas virtuais e pontes vão para o fim,
   porque o tablet não alcança esses endereços (no Mac da guia, uma VPN aparecia antes do Wi-Fi). */
export function ordenarEnderecos(interfaces) {
  const peso = (nome, ip) => {
    if (/^(utun|tun|tap|ppp|ipsec|vmnet|vbox|virbr|docker|br-|bridge|awdl|llw|zt|tailscale|wg)/i.test(nome)) return 9;
    let p = /^(en0|wlan|wi-?fi|wl)/i.test(nome) ? 0 : 3;
    if (ip.startsWith('192.168.')) p += 0; else if (ip.startsWith('10.')) p += 1; else p += 2;
    return p;
  };
  return Object.entries(interfaces)
    .flatMap(([nome, lista]) => (lista || []).filter(i => i && i.family === 'IPv4' && !i.internal).map(i => ({ ip: i.address, p: peso(nome, i.address) })))
    .sort((a, b) => a.p - b.p)
    .map(x => x.ip);
}
function enderecosDaRede() {
  return ordenarEnderecos(os.networkInterfaces());
}

// Execução direta (não nos testes).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const porta = Number(process.env.PORTA) || 8787;
  const pastaSimulacao = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (pastaSimulacao && !fs.existsSync(pastaSimulacao)) {
    console.error(`\nNão achei a pasta da simulação: ${pastaSimulacao}\n`);
    process.exit(1);
  }
  criarServidor({ pastaSimulacao, porta }).listen(porta, '0.0.0.0', () => {
    console.log('\nUrna do Plenário: servidor ligado.\n');
    if (pastaSimulacao) {
      console.log(`  Simulação (guia + telão), abra no Chrome:  http://localhost:${porta}`);
      console.log(`  Painel técnico da urna:                    http://localhost:${porta}/painel`);
    } else {
      console.log(`  Painel da guia (neste PC):  http://localhost:${porta}`);
    }
    const ips = enderecosDaRede();
    if (ips.length) {
      console.log(`\n  Endereço para digitar no tablet:  ${ips[0]}:${porta}`);
      if (ips.length > 1) console.log(`  (se não funcionar, tente: ${ips.slice(1).map(ip => `${ip}:${porta}`).join(' ou ')})`);
    } else {
      console.log('\n  Atenção: este PC não parece estar em nenhuma rede Wi-Fi ou cabeada.');
    }
    console.log('\nPara desligar: Ctrl+C.\n');
  });
}
