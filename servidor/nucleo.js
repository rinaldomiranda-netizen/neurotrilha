// NeuroTrilha (RMD) — núcleo da função da nuvem. Mesmas regras do servidor do computador (server.js),
// agora pela internet: o celular do avaliador e o tablet do paciente conversam de qualquer lugar.
// Feito em JavaScript padrão (Request/Response): roda na nuvem (Supabase, Deno) e nos testes deste computador (Node).
// Quem guarda os dados é o "armazém" recebido de fora (nuvem: Postgres; teste: memória).
//
// Rotas:
//   conta:        GET /api/eu · POST /api/eu/senha
//   fichas:       GET/POST /api/participantes · PUT /api/participantes/:id
//   RMD (admin):  GET/POST /api/admin/contas · PUT /api/admin/contas/:id · POST /api/admin/contas/:id/senha
//   sessões:      GET/POST /api/adaptativa · GET/DELETE /api/adaptativa/:id · POST .../controle · PUT .../parecer · POST .../enviar
//   paciente:     GET /api/p/:token/estado · POST /api/p/:token/resposta   (sem login: só a chave da sessão)
//   tablet:       POST /api/estacao · GET /api/estacao/:chave              (código de 6 números para parear)
//   questionário: POST/GET /api/questionarios · GET/POST /api/q/:token      (pais e professores respondem sem login)
//   pesquisa:     GET /api/admin/normas (só RMD; dados anônimos de quem autorizou)
//   LGPD:         GET /api/participantes/:id/exportar · DELETE /api/participantes/:id · GET /api/admin/auditoria · POST /api/eu/2fa

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
const SENHA_TESTE = '123456';  // senha de teste na nuvem (mínimo 6); a definitiva é pedida quando o uso for real
const ESTACAO_VALIDADE_MS = 12 * 60 * 60 * 1000;

function json(status, corpo) { return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
function erro(status, mensagem) { return json(status, { error: mensagem }); }
function normalizar(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function idadeEmAnos(nasc, agora) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(nasc || '')); if (!m) return null;
  const n = new Date(+m[1], +m[2] - 1, +m[3]), anos = (agora - n.getTime()) / (365.2425 * 24 * 3600 * 1000);
  return anos > 0 ? Math.round(anos * 100) / 100 : null;
}

export function criarNucleo({ Motor, Sessao, Questionario, Assinatura, armazem, autenticar, agora = () => Date.now(), aleatorio }) {
  const rnd0 = aleatorio || ((n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; });
  const G = Sessao.criarGestor(Motor, agora, () => btoa(String.fromCharCode(...rnd0(24))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));  // regras da sessão: as mesmas do programa do computador (sessao-adaptativa.js)
  const rnd = aleatorio || ((n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; });
  const base64url = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const uuid = () => crypto.randomUUID();
  const iso = () => new Date(agora()).toISOString();
  const leituras = new Map();  // leituras repetidas (a tela ao vivo consulta a cada 2 s) entram no registro uma vez a cada 30 min

  // ---------------------------------------------------------------- sessão adaptativa (regras em sessao-adaptativa.js)
  const paraPaciente = (s) => G.paraPaciente(s);
  const paraAvaliador = (s) => ({ ...G.paraAvaliador(s), nuvem: true });
  async function salvar(s) { s.atualizadoEm = iso(); await armazem.salvarSessao(s.id, s.status, s); }
  const responder = (s, b) => G.responder(s, b);
  const controle = (s, b) => G.controle(s, b);

  // ---------------------------------------------------------------- ajudantes
  async function corpo(req) { try { const t = await req.text(); if (t.length > 2000000) throw new Error('grande'); return t ? JSON.parse(t) : {}; } catch (e) { return null; } }
  const podeVer = (conta, dono) => conta.papel === 'admin' || dono === conta.user_id;
  function fichaValida(p) {
    if (!p.name || !p.birthDate || !p.consent) return 'Nome, nascimento e autorização são obrigatórios.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate) || p.birthDate > iso().slice(0, 10)) return 'Data de nascimento inválida.';
    return null;
  }
  function limparFicha(entrada, existente) {
    const p = { ...(existente || {}), ...(entrada || {}) };
    ['name', 'preferredName', 'birthDate', 'sex', 'education', 'grade', 'school', 'guardian', 'phone', 'email', 'city', 'notes', 'evaluator', 'handedness', 'language']
      .forEach((k) => { if (p[k] != null) p[k] = String(p[k]).trim().slice(0, k === 'notes' ? 2000 : 200); });
    p.consent = !!p.consent;
    p.pesquisa = !!p.pesquisa;  // autorizou uso ANÔNIMO para pesquisa e normas
    // termo de consentimento assinado na tela (LGPD); assinatura inválida não substitui a já guardada
    const termo = Assinatura ? Assinatura.limpar(entrada && entrada.termo) : null;
    if (termo) p.termo = termo; else if (existente && existente.termo) p.termo = existente.termo; else delete p.termo;
    if (p.anamnese && typeof p.anamnese === 'object') {
      const a = {}; ['queixa', 'gestacao', 'desenvolvimento', 'escola', 'saude', 'familia', 'diagnosticos'].forEach((k) => { if (p.anamnese[k]) a[k] = String(p.anamnese[k]).trim().slice(0, 1500); });
      p.anamnese = a;
    } else delete p.anamnese;
    return p;
  }

  // ---------------------------------------------------------------- dados anônimos para pesquisa e normas
  // Só sessões concluídas de quem marcou a autorização de pesquisa. Sem nome, código, data exata ou qualquer identificação.
  async function linhasPesquisa(arm) {
    const linhas = [];
    for (const r of await arm.sessoes(null, null)) {
      const s = r.dados; if (!['concluida', 'encerrada'].includes(s.status)) continue;
      const part = await arm.participante(r.participante); if (!part || !part.dados.pesquisa) continue;
      const res = Motor.resultado(s, s.idadeAnos), linha = { idade: Math.round(s.idadeAnos * 10) / 10, sexo: part.dados.sex || '', escolaridade: part.dados.education || '', mes: String(s.criadoEm).slice(0, 7), qi_estimado: res.qiEstimado == null ? '' : res.qiEstimado };
      res.areas.forEach((a) => { linha[a.id + '_nivel'] = a.nivel == null ? '' : a.nivel; linha[a.id + '_indice'] = a.indice == null ? '' : a.indice; linha[a.id + '_itens'] = a.itens; linha[a.id + '_tempo_ms'] = a.tempoMedianoMs == null ? '' : Math.round(a.tempoMedianoMs);
        if (a.metricas && a.metricas.omissoes != null) { linha[a.id + '_omissoes'] = a.metricas.omissoes; linha[a.id + '_comissoes'] = a.metricas.comissoes; linha[a.id + '_tr_ms'] = a.metricas.trMedioMs == null ? '' : a.metricas.trMedioMs; } });
      if (res.tardia) linha.ml_tardia = res.tardia.acertos + '/' + res.tardia.total;
      linhas.push(linha);
    }
    return linhas.sort(() => 0.5 - Math.random());  // ordem embaralhada: não dá para ligar à ordem de atendimento
  }

  // ---------------------------------------------------------------- tratamento das rotas
  return async function tratar(req) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const url = new URL(req.url);
    const caminho = url.pathname.replace(/^.*?(\/api\/)/, '/api/');
    try {
      // ---- tela do paciente (sem login: só a chave da própria sessão)
      let m = caminho.match(/^\/api\/p\/([A-Za-z0-9_-]{20,64})\/(estado|resposta)$/);
      if (m) {
        const s = await armazem.sessaoPorToken(m[1]);
        if (!s || (['concluida', 'encerrada'].includes(s.status) && agora() - Date.parse(s.atualizadoEm) > 10 * 60 * 1000)) return erro(404, 'Sessão não encontrada ou já encerrada.');
        if (m[2] === 'estado' && req.method === 'GET') return json(200, paraPaciente(s));
        if (m[2] === 'resposta' && req.method === 'POST') {
          const b = await corpo(req); if (!b) return erro(400, 'Dados inválidos.');
          const r = responder(s, b); if (r.erro) return erro(409, r.erro);
          await salvar(s); return json(200, paraPaciente(s));
        }
        return erro(405, 'Método não permitido.');
      }
      // ---- devolutiva para a família (link do WhatsApp, sem login): só o texto em linguagem simples
      m = caminho.match(/^\/api\/familia\/([A-Za-z0-9_-]{20,64})$/);
      if (m && req.method === 'GET') {
        const sf = await armazem.sessaoPorDevolutiva(m[1]), dono = sf && sf.owner ? await armazem.conta(sf.owner) : null;
        const d = G.paraFamilia(sf, dono && dono.clinica); return d ? json(200, d) : erro(404, 'Link inválido ou desativado pelo profissional.');
      }
      // ---- exercícios em casa: um link fixo; cada vez que a família abre, monta os exercícios do dia (sem login)
      m = caminho.match(/^\/api\/plano\/([A-Za-z0-9_-]{20,64})$/);
      if (m && req.method === 'GET') {
        const part = await armazem.participantePorPlano(m[1]), pd = part ? part.dados : null, plano = pd && (pd.planos || []).find((x) => x.token === m[1] && x.ativo);
        if (!plano) return erro(404, 'Link de exercícios inválido ou encerrado pelo profissional.');
        const regs = await armazem.sessoes(null, part.id), anteriores = regs.map((r) => r.dados);
        const aberta = anteriores.filter((x) => x.plano === m[1] && !['concluida', 'encerrada'].includes(x.status) && agora() - Date.parse(x.criadoEm) < 12 * 3600 * 1000)[0];
        if (aberta) return json(200, { token: aberta.token, nome: aberta.nomeChamado });
        const idade = idadeEmAnos(pd.birthDate, agora()), evitar = []; anteriores.forEach((x) => (x.historico || []).forEach((h) => { if (h.chave) evitar.push(h.chave); }));
        const s = G.criar({ evitar, id: uuid(), token: base64url(rnd(24)), participantId: part.id, owner: part.dono, avaliador: plano.criadoPor || '', idadeAnos: idade,
          nomeChamado: String(pd.preferredName || pd.name || '').split(' ')[0], leitor: idade >= 8, dominios: plano.dominios, maxItens: plano.maxItens || 12, modo: 'estimulacao', inicios: G.iniciosEstimulacao(anteriores), plano: m[1] });
        await armazem.criarSessao({ id: s.id, participante: part.id, dono: part.dono, token: s.token, status: s.status, dados: s });
        return json(200, { token: s.token, nome: s.nomeChamado });
      }
      // ---- tablet pareado: pede um código e fica esperando a sessão que o avaliador mandar
      if (caminho === '/api/estacao' && req.method === 'POST') {
        let codigo, tentativas = 0;
        do { const b = rnd(4); codigo = String((b[0] * 16777216 + b[1] * 65536 + b[2] * 256 + b[3]) % 900000 + 100000); tentativas++; } while (await armazem.estacaoPorCodigo(codigo) && tentativas < 20);
        const chave = base64url(rnd(24));
        await armazem.criarEstacao({ chave, codigo, sessao_token: null, visto_em: iso() });
        return json(201, { chave, codigo });
      }
      m = caminho.match(/^\/api\/estacao\/([A-Za-z0-9_-]{20,64})$/);
      if (m && req.method === 'GET') {
        const est = await armazem.estacaoPorChave(m[1]);
        if (!est) return erro(404, 'Este tablet não está mais registrado. Ele vai pedir um código novo.');
        await armazem.salvarEstacao(est.chave, { visto_em: iso() });
        return json(200, { codigo: est.codigo, token: est.sessao_token || null });
      }

      // ---- questionário dos pais/professores: abre pelo link (sem login), responde uma vez
      m = caminho.match(/^\/api\/q\/([A-Za-z0-9_-]{20,64})$/);
      if (m) {
        const q = await armazem.questionarioPorToken(m[1]);
        if (!q) return erro(404, 'Link de questionário inválido ou vencido.');
        if (req.method === 'GET') return json(200, { nome: q.dados.nomeChamado, profissional: q.dados.profissional, respondente: q.dados.respondente, instrumento: q.dados.instrumento || 'snap', respondido: !!q.dados.respondidoEm });
        if (req.method === 'POST') {
          if (q.dados.respondidoEm) return erro(409, 'Este questionário já foi respondido.');
          const b = await corpo(req) || {}, respostas = Array.isArray(b.respostas) ? b.respostas.map(Number) : [];
          const inst = q.dados.instrumento || 'snap', resultado = Questionario.pontuarInstrumento(inst, respostas); if (!resultado) return erro(400, 'Responda todas as frases.');
          await armazem.salvarQuestionario(q.id, { ...q.dados, respostas, resultado, pontuacao: inst === 'snap' ? resultado.escalas : null, nomeRespondente: String(b.nome || '').slice(0, 80), respondidoEm: iso() });
          return json(200, { ok: true });
        }
      }

      // ---- primeiro acesso: a RMD só libera o usuário; a própria pessoa cria a senha particular na primeira entrada
      if (caminho === '/api/primeiro-acesso' && req.method === 'POST') {
        const b = await corpo(req) || {}, usuario = String(b.usuario || '').trim().toLowerCase().slice(0, 40);
        const c = /^[a-z0-9._-]{3,40}$/.test(usuario) ? await armazem.contaPorUsuario(usuario) : null;
        const pendente = !!(c && c.ativo && c.primeiro_acesso);
        if (b.senha === undefined) return json(200, { pendente });  // só pergunta se falta criar a senha
        if (!pendente) return erro(409, 'Este usuário já tem senha. Entre com ela, ou peça à RMD um novo primeiro acesso.');
        const senha = String(b.senha);
        if (senha.length < 6 || senha.length > 128) return erro(400, 'A senha precisa ter pelo menos 6 caracteres.');
        if (b.aceiteTermos !== true) return erro(400, 'Para continuar, aceite os Termos de uso e a Política de privacidade.');
        await armazem.trocarSenha(c.user_id, senha); await armazem.atualizarConta(c.user_id, { primeiro_acesso: false, senha_provisoria: false });
        await armazem.registrar({ user_id: c.user_id, usuario: c.usuario, acao: 'criou_propria_senha', alvo: '', detalhe: 'aceitou termos e privacidade v1.0', ip: String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60) });
        return json(200, { ok: true });
      }

      // ---- daqui para baixo: só com login de profissional liberado
      const au = await autenticar(req), userId = au && typeof au === 'object' ? au.id : au, aal = au && typeof au === 'object' ? au.aal || 'aal1' : 'aal1';
      if (!userId) return erro(401, 'Entre com seu usuário e senha.');
      const conta = await armazem.conta(userId);
      if (!conta || !conta.ativo) return erro(403, 'Acesso não liberado. Fale com a RMD.');
      // verificação em duas etapas: quem ligou só entra com o código do aplicativo (login de nível aal2)
      if (conta.mfa && aal !== 'aal2') return json(401, { error: 'Digite o código de 6 números do aplicativo autenticador.', precisa2fa: true });
      const ip = String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60);
      const registrar = (acao, alvo = '', detalhe = '') => armazem.registrar({ user_id: userId, usuario: conta.usuario, acao, alvo: String(alvo).slice(0, 120), detalhe: String(detalhe).slice(0, 300), ip });
      const registrarLeitura = (acao, alvo = '') => { const k = userId + '|' + acao + '|' + alvo, t = agora(); if (t - (leituras.get(k) || 0) < 30 * 60 * 1000) return; leituras.set(k, t); if (leituras.size > 5000) leituras.clear(); return registrar(acao, alvo); };

      if (caminho === '/api/eu' && req.method === 'GET') { await registrarLeitura('entrou'); return json(200, { usuario: conta.usuario, nome: conta.nome, papel: conta.papel, senhaProvisoria: conta.senha_provisoria, mfa: !!conta.mfa, aal }); }
      // dados da clínica deste profissional (logo, nome, endereço e contato no laudo e na devolutiva)
      if (caminho === '/api/eu/clinica' && req.method === 'GET') return json(200, { clinica: conta.clinica || null });
      if (caminho === '/api/eu/clinica' && req.method === 'PUT') {
        const r = G.limparClinica(await corpo(req)); if (r.erro) return erro(400, r.erro);
        await armazem.atualizarConta(userId, { clinica: r.clinica }); await registrar('dados_clinica', '', r.clinica.nome);
        return json(200, { clinica: r.clinica });
      }
      if (caminho === '/api/eu/2fa' && req.method === 'POST') {
        const b = await corpo(req) || {};
        if (aal !== 'aal2') return erro(400, 'Confirme primeiro o código do aplicativo autenticador.');
        await armazem.atualizarConta(userId, { mfa: !!b.ativo }); await registrar(b.ativo ? '2fa_ligada' : '2fa_desligada');
        return json(200, { ok: true, mfa: !!b.ativo });
      }
      if (caminho === '/api/eu/senha' && req.method === 'POST') {
        const b = await corpo(req), nova = String((b && b.nova) || '');
        if (nova.length < 6 || nova.length > 128) return erro(400, 'A senha precisa ter pelo menos 6 caracteres.');
        await armazem.trocarSenha(userId, nova); await armazem.atualizarConta(userId, { senha_provisoria: nova === SENHA_TESTE, primeiro_acesso: false });
        return json(200, { ok: true });
      }

      // fichas
      if (caminho === '/api/participantes' && req.method === 'GET') { await registrarLeitura('listar_fichas'); return json(200, { participants: await armazem.participantes(conta.papel === 'admin' ? null : userId) }); }
      if (caminho === '/api/participantes' && req.method === 'POST') {
        const b = await corpo(req); if (!b) return erro(400, 'Dados inválidos.');
        const p = limparFicha(b), msg = fichaValida(p); if (msg) return erro(400, msg);
        const iguais = (await armazem.participantes(userId)).filter((x) => normalizar(x.name) === normalizar(p.name) && x.birthDate === p.birthDate);
        if (iguais.length) return erro(409, 'Já existe uma ficha com este nome e nascimento (' + iguais[0].code + ').');
        p.id = uuid(); p.createdAt = iso(); p.updatedAt = p.createdAt;
        const criada = await armazem.criarParticipante({ id: p.id, dono: userId, nome_busca: normalizar(p.name), nascimento: p.birthDate, dados: p });
        await registrar('criar_ficha', criada.code); return json(201, { participant: criada });
      }
      m = caminho.match(/^\/api\/participantes\/([0-9a-f-]{36})$/);
      if (m && req.method === 'PUT') {
        const atual = await armazem.participante(m[1]);
        if (!atual || !podeVer(conta, atual.dono)) return erro(404, 'Ficha não encontrada.');
        const b = await corpo(req); if (!b) return erro(400, 'Dados inválidos.');
        const p = limparFicha({ ...b, id: atual.dados.id, code: atual.dados.code }, atual.dados), msg = fichaValida(p); if (msg) return erro(400, msg);
        p.updatedAt = iso();
        await registrar('editar_ficha', p.code);
        return json(200, { participant: await armazem.atualizarParticipante(m[1], { nome_busca: normalizar(p.name), nascimento: p.birthDate, dados: p }) });
      }
      // LGPD: apagar todos os dados de uma pessoa (confirmação: o código da ficha)
      if (m && req.method === 'DELETE') {
        const atual = await armazem.participante(m[1]);
        if (!atual || !podeVer(conta, atual.dono)) return erro(404, 'Ficha não encontrada.');
        const b = await corpo(req) || {};
        if (String(b.confirmar || '').trim().toUpperCase() !== String(atual.dados.code).toUpperCase()) return erro(400, 'Para apagar, digite o código da ficha (' + atual.dados.code + ').');
        await armazem.apagarParticipante(m[1]); await registrar('apagar_ficha', atual.dados.code, 'todos os dados do participante');
        return json(200, { ok: true });
      }
      // LGPD: cópia de todos os dados de uma pessoa (direito de acesso e portabilidade)
      m = caminho.match(/^\/api\/participantes\/([0-9a-f-]{36})\/exportar$/);
      if (m && req.method === 'GET') {
        const atual = await armazem.participante(m[1]);
        if (!atual || !podeVer(conta, atual.dono)) return erro(404, 'Ficha não encontrada.');
        await registrar('exportar_dados', atual.dados.code);
        return json(200, { geradoEm: iso(), sistema: 'NeuroTrilha (RMD)', participante: atual.dados,
          avaliacoesAdaptativas: (await armazem.sessoes(null, m[1])).reverse().map((r) => { const d = { ...r.dados }; delete d.token; return d; }),
          questionarios: (await armazem.questionarios(m[1])).reverse().map((q) => q.dados) });
      }

      // plano de exercícios em casa (estimulação): o profissional cria e manda o link pelo WhatsApp
      if (caminho === '/api/planos' && req.method === 'POST') {
        const b = await corpo(req) || {}, part = await armazem.participante(String(b.participantId || ''));
        if (!part || !podeVer(conta, part.dono)) return erro(404, 'Ficha não encontrada.');
        const doms = (Array.isArray(b.dominios) ? b.dominios : []).filter((d) => { const x = Motor.dominio(d); return x && !x.fixo; });
        if (!doms.length) return erro(400, 'Escolha pelo menos uma área que possa virar exercício.');
        const pd = { ...part.dados }, plano = { token: base64url(rnd(24)), dominios: doms.slice(0, 6), maxItens: Math.max(6, Math.min(16, Number(b.maxItens) || 12)), criadoEm: iso(), criadoPor: conta.nome, ativo: true };
        pd.planos = (pd.planos || []).map((x) => ({ ...x, ativo: false })).concat([plano]);
        await armazem.atualizarParticipante(part.id, { dados: pd }); await registrar('criar_plano_exercicios', pd.code);
        return json(201, { token: plano.token, dominios: plano.dominios });
      }
      // questionários dos pais/professores
      if (caminho === '/api/questionarios' && req.method === 'POST') {
        const b = await corpo(req) || {}, part = await armazem.participante(String(b.participantId || ''));
        if (!part || !podeVer(conta, part.dono)) return erro(404, 'Ficha não encontrada.');
        const instrumento = Object.prototype.hasOwnProperty.call(Questionario.INSTRUMENTOS, b.instrumento) ? b.instrumento : 'snap', quem = Questionario.INSTRUMENTOS[instrumento].respondentes;
        const respondente = quem.indexOf(b.respondente) >= 0 ? b.respondente : quem[0], token = base64url(rnd(24));
        await armazem.criarQuestionario({ id: uuid(), participante: part.id, dono: part.dono, token, dados: { respondente, instrumento, nomeChamado: String(part.dados.preferredName || part.dados.name || '').split(' ')[0], profissional: conta.nome, criadoEm: iso() } });
        return json(201, { token, respondente, instrumento });
      }
      if (caminho === '/api/questionarios' && req.method === 'GET') {
        const part = await armazem.participante(url.searchParams.get('participante') || '');
        if (!part || !podeVer(conta, part.dono)) return erro(404, 'Ficha não encontrada.');
        return json(200, { questionarios: (await armazem.questionarios(part.id)).map((q) => ({ respondente: q.dados.respondente, instrumento: q.dados.instrumento || 'snap', resultado: q.dados.resultado || null, criadoEm: q.dados.criadoEm, respondidoEm: q.dados.respondidoEm || null, nomeRespondente: q.dados.nomeRespondente || '', respostas: q.dados.respostas || null, pontuacao: q.dados.pontuacao || null })) });
      }
      if (caminho === '/api/admin/normas' && req.method === 'GET') {
        if (conta.papel !== 'admin') return erro(403, 'Só a RMD exporta os dados de pesquisa.');
        return json(200, { linhas: await linhasPesquisa(armazem) });
      }

      // RMD: contas dos profissionais (senha de teste 123456; a pessoa troca na primeira entrada quando o uso for real)
      if (caminho.startsWith('/api/admin/')) {
        if (conta.papel !== 'admin') return erro(403, 'Só a RMD gerencia as contas.');
        if (caminho === '/api/admin/contas' && req.method === 'GET') return json(200, { contas: await armazem.contas() });
        // cópia completa de tudo (para guardar no computador da RMD; o programa do computador é o backup)
        if (caminho === '/api/admin/backup' && req.method === 'GET') { await registrar('backup_completo'); return json(200, { geradoEm: iso(), sistema: 'NeuroTrilha (RMD)', ...(await armazem.backupCompleto()) }); }
        if (caminho === '/api/admin/auditoria' && req.method === 'GET') { await registrar('ver_registro_acessos'); return json(200, { registros: await armazem.auditoria(1000) }); }
        if (caminho === '/api/admin/contas' && req.method === 'POST') {
          const b = await corpo(req) || {}, usuario = String(b.usuario || '').trim().toLowerCase(), nome = String(b.nome || '').trim().slice(0, 100);
          if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) return erro(400, 'Usuário: 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.');
          if (nome.length < 2) return erro(400, 'Informe o nome do profissional.');
          if ((await armazem.contas()).some((c) => c.usuario === usuario)) return erro(409, 'Já existe esse usuário.');
          // sem senha definida pela RMD: a conta fica aguardando a própria pessoa criar a senha no primeiro acesso
          const nova = await armazem.criarConta({ usuario, nome, papel: 'profissional', senha: base64url(rnd(24)) });
          await armazem.atualizarConta(nova.user_id, { primeiro_acesso: true, senha_provisoria: false });
          await registrar('liberar_conta', usuario);
          return json(201, { conta: { ...nova, primeiro_acesso: true } });
        }
        m = caminho.match(/^\/api\/admin\/contas\/([0-9a-f-]{36})(\/senha)?$/);
        if (m) {
          const alvo = await armazem.conta(m[1]);
          if (!alvo || alvo.papel === 'admin') return erro(404, 'Conta de profissional não encontrada.');
          if (!m[2] && req.method === 'PUT') { const b = await corpo(req) || {}; await armazem.atualizarConta(m[1], { ativo: !!b.ativo }); return json(200, { ok: true }); }
          // excluir conta: as fichas, avaliações e questionários dela passam para a RMD (nenhum dado de paciente se perde)
          if (!m[2] && req.method === 'DELETE') {
            const movidas = await armazem.excluirConta(m[1], userId);
            await registrar('excluir_conta', alvo.usuario, movidas + ' ficha(s) passaram para ' + conta.usuario);
            return json(200, { ok: true, fichasMovidas: movidas });
          }
          if (m[2] && req.method === 'POST') {  // novo primeiro acesso (esqueceu a senha, celular perdido): a pessoa cria outra senha ao entrar
            await armazem.trocarSenha(m[1], base64url(rnd(24))); await armazem.limparMfa(m[1]); await armazem.atualizarConta(m[1], { primeiro_acesso: true, senha_provisoria: false, mfa: false });
            await registrar('novo_primeiro_acesso', alvo.usuario, 'a pessoa cria outra senha ao entrar; duas etapas desligada'); return json(200, { ok: true });
          }
        }
        return erro(404, 'Rota não encontrada.');
      }

      // sessões adaptativas
      if (caminho === '/api/adaptativa' && req.method === 'GET') {
        const lista = await armazem.sessoes(conta.papel === 'admin' ? null : userId, url.searchParams.get('participante') || null);
        return json(200, { sessoes: lista.map((r) => ({ id: r.id, participantId: r.participante, status: r.status, criadoEm: r.dados.criadoEm, atualizadoEm: r.dados.atualizadoEm, dominios: r.dados.dominios,
          modo: r.dados.modo || 'avaliacao', qiEstimado: r.dados.resultadoFinal ? r.dados.resultadoFinal.qiEstimado : null, areas: r.dados.resultadoFinal ? r.dados.resultadoFinal.areas.map((a) => ({ id: a.id, indice: a.indice, nivel: a.nivel })) : null, parecer: r.dados.parecer || null })) });
      }
      if (caminho === '/api/adaptativa' && req.method === 'POST') {
        const b = await corpo(req) || {}, part = await armazem.participante(String(b.participantId || ''));
        if (!part || !podeVer(conta, part.dono)) return erro(400, 'Escolha uma ficha de participante desta conta.');
        const doms = (Array.isArray(b.dominios) ? b.dominios : []).filter((d) => Motor.dominio(d));
        if (!doms.length) return erro(400, 'Escolha pelo menos uma área.');
        const p = part.dados, idade = idadeEmAnos(p.birthDate, agora());
        if (idade == null || idade < 4) return erro(400, 'A aplicação adaptativa está preparada a partir de 4 anos.');
        const maxItens = Math.max(6, Math.min(16, Number(b.maxItens) || 10));
        // formas paralelas: tarefas que o paciente já viu em avaliações anteriores não se repetem
        const evitar = [], anteriores = await armazem.sessoes(null, part.id); anteriores.forEach((r) => (r.dados.historico || []).forEach((h) => { if (h.chave) evitar.push(h.chave); }));
        // estimulação em casa (jogos com retorno, sem QI) e avaliação rápida (menos tarefas por área)
        const modo = b.modo === 'estimulacao' ? 'estimulacao' : 'avaliacao', inicios = modo === 'estimulacao' ? G.iniciosEstimulacao(anteriores.map((r) => r.dados)) : {};
        const s = G.criar({ evitar, id: uuid(), token: base64url(rnd(24)), participantId: part.id, owner: part.dono, avaliador: conta.nome, idadeAnos: idade,
          nomeChamado: String(p.preferredName || p.name || '').split(' ')[0], leitor: b.leitor === undefined ? idade >= 8 : !!b.leitor, dominios: doms, maxItens, curta: !!b.curta, modo, inicios });
        await armazem.criarSessao({ id: s.id, participante: part.id, dono: part.dono, token: s.token, status: s.status, dados: s });
        return json(201, paraAvaliador(s));
      }
      m = caminho.match(/^\/api\/adaptativa\/([0-9a-f-]{36})(?:\/(controle|parecer|enviar))?$/);
      if (m) {
        const reg = await armazem.sessao(m[1]);
        if (!reg || !podeVer(conta, reg.dono)) return erro(404, 'Sessão não encontrada.');
        const s = reg.dados;
        if (!m[2] && req.method === 'GET') { await registrarLeitura('ver_avaliacao', s.id); return json(200, paraAvaliador(s)); }
        // excluir uma aplicação (ex.: pausada por engano): apaga só esta sessão; a ficha e as outras aplicações ficam
        if (!m[2] && req.method === 'DELETE') { await armazem.apagarSessao(s.id, s.token); await registrar('excluir_aplicacao', s.id, s.status || ''); return json(200, { ok: true }); }
        if (m[2] === 'controle' && req.method === 'POST') { const r = controle(s, await corpo(req) || {}); if (r.erro) return erro(409, r.erro); await salvar(s); return json(200, paraAvaliador(s)); }
        if (m[2] === 'parecer' && req.method === 'PUT') {
          const b = await corpo(req) || {}, decisao = String(b.decisao || '');
          if (!['aceito', 'aceito_ressalvas', 'nao_aceito'].includes(decisao)) return erro(400, 'Escolha a decisão do profissional.');
          s.parecer = { decisao, texto: String(b.texto || '').slice(0, 6000), profissional: String(b.profissional || conta.nome).slice(0, 120), registro: String(b.registro || '').slice(0, 40), em: iso() };
          await salvar(s); return json(200, paraAvaliador(s));
        }
        if (m[2] === 'enviar' && req.method === 'POST') {
          if (['concluida', 'encerrada'].includes(s.status)) return erro(409, 'A sessão já terminou.');
          const b = await corpo(req) || {}, codigo = String(b.codigo || '').replace(/\D/g, '');
          const est = codigo.length === 6 ? await armazem.estacaoPorCodigo(codigo) : null;
          if (!est || agora() - Date.parse(est.visto_em) > ESTACAO_VALIDADE_MS) return erro(404, 'Tablet não encontrado. Confira o código que aparece na tela do tablet.');
          await armazem.salvarEstacao(est.chave, { sessao_token: s.token });
          s.estacao = codigo; await salvar(s);
          return json(200, paraAvaliador(s));
        }
        return erro(405, 'Método não permitido.');
      }
      return erro(404, 'Rota não encontrada.');
    } catch (e) {
      console.error('neurotrilha:', e && e.message);
      return erro(500, 'Erro interno. Tente de novo.');
    }
  };
}
