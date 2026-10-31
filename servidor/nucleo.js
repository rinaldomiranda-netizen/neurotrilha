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
//   desenvolvedor (RMD): planos, preços e funções de cada cliente · problemas do sistema · dados da RMD nos termos
//                 GET/PUT /api/admin/planos · GET /api/admin/erros · PUT /api/admin/erros/:id · GET/PUT /api/admin/empresa
//   público:      GET /api/empresa (dados da RMD para os termos) · POST /api/erro (a tela avisa um problema, sem dados de paciente)
// A conta do desenvolvedor (papel admin) NÃO vê nem cria fichas, avaliações ou questionários: só cuida das liberações.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};
const SENHA_TESTE = '123456';  // senha de teste na nuvem (mínimo 6); a definitiva é pedida quando o uso for real
const ESTACAO_VALIDADE_MS = 12 * 60 * 60 * 1000;

// Funções que a RMD libera para cada cliente (o servidor confere em cada pedido)
export const RECURSOS = {
  avaliacao: 'Avaliação adaptativa no tablet',
  laudo: 'Relatório, laudo e parecer',
  clinica: 'Logo e dados da clínica no laudo',
  devolutiva: 'Devolutiva para a família (link do WhatsApp)',
  exercicios: 'Exercícios em casa',
  questionarios: 'Questionários para pais e professores',
};
const TODOS = Object.keys(RECURSOS);
// Planos base (pesquisa de preços de 31/10/2026). A RMD muda preço, limite e funções no painel do desenvolvedor.
// pacientes = fichas que a conta pode ter (0 = sem limite) · dias = validade contada a partir de quando a RMD libera
export const PLANOS_PADRAO = {
  teste: { nome: 'Teste grátis', preco: 0, pacientes: 5, dias: 14, recursos: TODOS },
  essencial: { nome: 'Essencial', preco: 79, pacientes: 30, dias: 30, recursos: ['avaliacao', 'laudo', 'clinica'] },
  profissional: { nome: 'Profissional', preco: 129, pacientes: 80, dias: 30, recursos: ['avaliacao', 'laudo', 'clinica', 'devolutiva', 'exercicios'] },
  completo: { nome: 'Completo', preco: 189, pacientes: 0, dias: 30, recursos: TODOS },
};
const CAMPOS_EMPRESA = ['documento', 'endereco', 'email', 'whatsapp', 'encarregado', 'foro'];
// tira dos endereços as chaves de sessão e os códigos, para o registro de problemas nunca guardar acesso a nada
const semChaves = (t) => String(t || '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/[A-Za-z0-9_-]{20,64}/g, ':chave').slice(0, 200);

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
  const podeVer = (conta, dono) => conta.papel !== 'admin' && dono === conta.user_id;  // o desenvolvedor não vê dados de pacientes
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

  // ---------------------------------------------------------------- planos e liberações
  async function planos() {
    const salvos = (await armazem.config('planos')) || {}, r = {};
    for (const k of Object.keys(PLANOS_PADRAO)) r[k] = { ...PLANOS_PADRAO[k], ...(salvos[k] || {}) };
    return r;
  }
  // ao trocar o plano: funções, limite de fichas, valor e vencimento voltam ao padrão do plano (a RMD ajusta depois)
  function camposDoPlano(pls, chave) {
    const pl = pls[chave], venc = new Date(agora() + pl.dias * 24 * 3600 * 1000).toISOString().slice(0, 10);
    return { plano: chave, recursos: pl.recursos.slice(), limite_pacientes: pl.pacientes, valor: pl.preco, vencimento: pl.dias ? venc : null };
  }
  // contas antigas, sem plano marcado, continuam com tudo liberado (nada para de funcionar)
  function recursosDe(conta) { return Array.isArray(conta.recursos) ? conta.recursos : TODOS; }
  function vencido(conta) { return !!(conta.vencimento && String(conta.vencimento).slice(0, 10) < iso().slice(0, 10)); }
  function dataBr(d) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  // null = pode; texto = motivo de não poder (aparece na tela do profissional)
  function bloqueio(conta, recurso) {
    if (conta.papel === 'admin') return 'A conta do desenvolvedor não atende pacientes. Entre com uma conta de profissional.';
    if (vencido(conta)) return 'O seu plano venceu em ' + dataBr(conta.vencimento) + '. Fale com a RMD para renovar. Os seus dados continuam guardados.';
    if (recurso && !recursosDe(conta).includes(recurso)) return 'A função "' + RECURSOS[recurso] + '" não está liberada no seu plano. Fale com a RMD.';
    return null;
  }
  const erroPublico = new Map();  // limite de avisos de problema por endereço (evita enxurrada)

  // ---------------------------------------------------------------- tratamento das rotas
  return async function tratar(req) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const url = new URL(req.url);
    const caminho = url.pathname.replace(/^.*?(\/api\/)/, '/api/');
    let quem = '';
    try {
      // ---- dados da RMD para os termos de uso e a política de privacidade (públicos, como em qualquer site)
      if (caminho === '/api/empresa' && req.method === 'GET') return json(200, { empresa: (await armazem.config('empresa')) || {} });
      // ---- a tela avisa um problema (erro de programa). Só a mensagem técnica e a página, nunca dados de paciente.
      if (caminho === '/api/erro' && req.method === 'POST') {
        const ipE = String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60) || '?', t = agora(), r = erroPublico.get(ipE) || { n: 0, t };
        if (t - r.t > 3600000) { r.n = 0; r.t = t; }
        r.n++; erroPublico.set(ipE, r); if (erroPublico.size > 5000) erroPublico.clear();
        if (r.n > 30) return json(202, { ok: true });
        const b = await corpo(req) || {};
        await armazem.registrarErro({ origem: 'tela', mensagem: semChaves(b.mensagem).slice(0, 200) || 'erro sem mensagem', detalhe: semChaves(b.detalhe), pagina: semChaves(String(b.pagina || '').split('?')[0]).slice(0, 80), conta: '' });
        return json(202, { ok: true });
      }
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
      quem = conta.usuario;
      // verificação em duas etapas: quem ligou só entra com o código do aplicativo (login de nível aal2)
      if (conta.mfa && aal !== 'aal2') return json(401, { error: 'Digite o código de 6 números do aplicativo autenticador.', precisa2fa: true });
      const ip = String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 60);
      const registrar = (acao, alvo = '', detalhe = '') => armazem.registrar({ user_id: userId, usuario: conta.usuario, acao, alvo: String(alvo).slice(0, 120), detalhe: String(detalhe).slice(0, 300), ip });
      const registrarLeitura = (acao, alvo = '') => { const k = userId + '|' + acao + '|' + alvo, t = agora(); if (t - (leituras.get(k) || 0) < 30 * 60 * 1000) return; leituras.set(k, t); if (leituras.size > 5000) leituras.clear(); return registrar(acao, alvo); };

      if (caminho === '/api/eu' && req.method === 'GET') {
        await registrarLeitura('entrou');
        const pl = conta.plano ? (await planos())[conta.plano] : null;
        return json(200, { usuario: conta.usuario, nome: conta.nome, papel: conta.papel, senhaProvisoria: conta.senha_provisoria, mfa: !!conta.mfa, aal,
          plano: pl ? pl.nome : null, vencimento: conta.vencimento || null, vencido: vencido(conta), limitePacientes: conta.limite_pacientes || 0,
          recursos: conta.papel === 'admin' ? [] : recursosDe(conta), nomesRecursos: RECURSOS });
      }
      // dados da clínica deste profissional (logo, nome, endereço e contato no laudo e na devolutiva)
      if (caminho === '/api/eu/clinica' && req.method === 'GET') return json(200, { clinica: conta.clinica || null });
      if (caminho === '/api/eu/clinica' && req.method === 'PUT') {
        const bq = bloqueio(conta, 'clinica'); if (bq) return erro(403, bq);
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
      if (caminho === '/api/participantes' && req.method === 'GET') {
        if (conta.papel === 'admin') return json(200, { participants: [] });  // o desenvolvedor não vê pacientes
        await registrarLeitura('listar_fichas'); return json(200, { participants: await armazem.participantes(userId) });
      }
      if (caminho === '/api/participantes' && req.method === 'POST') {
        const bq = bloqueio(conta); if (bq) return erro(403, bq);
        const b = await corpo(req); if (!b) return erro(400, 'Dados inválidos.');
        const p = limparFicha(b), msg = fichaValida(p); if (msg) return erro(400, msg);
        const minhas = await armazem.participantes(userId);
        if (conta.limite_pacientes > 0 && minhas.length >= conta.limite_pacientes) return erro(403, 'O seu plano permite até ' + conta.limite_pacientes + ' fichas de pacientes. Fale com a RMD para aumentar.');
        const iguais = minhas.filter((x) => normalizar(x.name) === normalizar(p.name) && x.birthDate === p.birthDate);
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
        const bq = bloqueio(conta, 'exercicios'); if (bq) return erro(403, bq);
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
        const bq = bloqueio(conta, 'questionarios'); if (bq) return erro(403, bq);
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
        if (caminho === '/api/admin/contas' && req.method === 'GET') {
          // só números de uso (quantas fichas e aplicações), nunca nomes ou dados de pacientes
          const uso = await armazem.usoPorConta(new Date(agora() - 30 * 24 * 3600 * 1000).toISOString());
          return json(200, { contas: (await armazem.contas()).map((c) => ({ ...c, recursos: c.papel === 'admin' ? [] : recursosDe(c), vencido: vencido(c), fichas: (uso[c.user_id] || {}).fichas || 0, aplicacoes30: (uso[c.user_id] || {}).aplicacoes || 0 })) });
        }
        if (caminho === '/api/admin/planos' && req.method === 'GET') return json(200, { planos: await planos(), recursos: RECURSOS });
        if (caminho === '/api/admin/planos' && req.method === 'PUT') {
          const b = await corpo(req) || {}, salvos = {};
          for (const k of Object.keys(PLANOS_PADRAO)) {
            const x = (b.planos || {})[k]; if (!x) continue;
            salvos[k] = { preco: Math.max(0, Math.min(99999, Math.round(Number(x.preco) * 100) / 100 || 0)), pacientes: Math.max(0, Math.min(100000, parseInt(x.pacientes, 10) || 0)),
              recursos: (Array.isArray(x.recursos) ? x.recursos : PLANOS_PADRAO[k].recursos).filter((r) => TODOS.includes(r)) };
          }
          await armazem.salvarConfig('planos', salvos); await registrar('alterou_planos');
          return json(200, { planos: await planos() });
        }
        if (caminho === '/api/admin/empresa' && req.method === 'GET') return json(200, { empresa: (await armazem.config('empresa')) || {} });
        if (caminho === '/api/admin/empresa' && req.method === 'PUT') {
          const b = await corpo(req) || {}, e = {}; CAMPOS_EMPRESA.forEach((k) => { const v = String(b[k] || '').trim().slice(0, 200); if (v) e[k] = v; });
          await armazem.salvarConfig('empresa', e); await registrar('alterou_dados_rmd');
          return json(200, { empresa: e });
        }
        if (caminho === '/api/admin/erros' && req.method === 'GET') return json(200, { erros: await armazem.erros(300) });
        m = caminho.match(/^\/api\/admin\/erros\/(\d{1,12})$/);
        if (m && req.method === 'PUT') { const b = await corpo(req) || {}; await armazem.marcarErro(Number(m[1]), !!b.resolvido); return json(200, { ok: true }); }
        // cópia completa de tudo (para guardar no computador da RMD; o programa do computador é o backup)
        if (caminho === '/api/admin/backup' && req.method === 'GET') { await registrar('backup_completo'); return json(200, { geradoEm: iso(), sistema: 'NeuroTrilha (RMD)', ...(await armazem.backupCompleto()) }); }
        if (caminho === '/api/admin/auditoria' && req.method === 'GET') { await registrar('ver_registro_acessos'); return json(200, { registros: await armazem.auditoria(1000) }); }
        if (caminho === '/api/admin/contas' && req.method === 'POST') {
          const b = await corpo(req) || {}, usuario = String(b.usuario || '').trim().toLowerCase(), nome = String(b.nome || '').trim().slice(0, 100);
          if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) return erro(400, 'Usuário: 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.');
          if (nome.length < 2) return erro(400, 'Informe o nome do profissional.');
          if ((await armazem.contas()).some((c) => c.usuario === usuario)) return erro(409, 'Já existe esse usuário.');
          const pls = await planos(), chave = Object.prototype.hasOwnProperty.call(pls, b.plano) ? b.plano : 'teste';
          // sem senha definida pela RMD: a conta fica aguardando a própria pessoa criar a senha no primeiro acesso
          const nova = await armazem.criarConta({ usuario, nome, papel: 'profissional', senha: base64url(rnd(24)) });
          const campos = { primeiro_acesso: true, senha_provisoria: false, ...camposDoPlano(pls, chave) };
          await armazem.atualizarConta(nova.user_id, campos);
          await registrar('liberar_conta', usuario, pls[chave].nome);
          return json(201, { conta: { ...nova, ...campos } });
        }
        m = caminho.match(/^\/api\/admin\/contas\/([0-9a-f-]{36})(\/senha)?$/);
        if (m) {
          const alvo = await armazem.conta(m[1]);
          if (!alvo || alvo.papel === 'admin') return erro(404, 'Conta de profissional não encontrada.');
          // liberar/bloquear, trocar o plano, o valor, o vencimento, o limite de fichas e as funções liberadas
          if (!m[2] && req.method === 'PUT') {
            const b = await corpo(req) || {}, campos = {}, pls = await planos();
            if (b.ativo !== undefined) campos.ativo = !!b.ativo;
            if (b.plano !== undefined) { if (!Object.prototype.hasOwnProperty.call(pls, b.plano)) return erro(400, 'Plano desconhecido.'); Object.assign(campos, camposDoPlano(pls, b.plano)); }
            if (b.valor !== undefined) campos.valor = Math.max(0, Math.min(99999, Math.round(Number(b.valor) * 100) / 100 || 0));
            if (b.vencimento !== undefined) { if (b.vencimento && !/^\d{4}-\d{2}-\d{2}$/.test(b.vencimento)) return erro(400, 'Data de vencimento inválida.'); campos.vencimento = b.vencimento || null; }
            if (b.limite_pacientes !== undefined) campos.limite_pacientes = Math.max(0, Math.min(100000, parseInt(b.limite_pacientes, 10) || 0));
            if (b.recursos !== undefined) campos.recursos = (Array.isArray(b.recursos) ? b.recursos : []).filter((r) => TODOS.includes(r));
            await armazem.atualizarConta(m[1], campos);
            const mud = Object.keys(campos).filter((k) => k !== 'ativo');
            if (mud.length) await registrar('alterou_liberacao', alvo.usuario, mud.join(', '));
            return json(200, { ok: true, conta: { ...alvo, ...campos } });
          }
          // excluir conta: as fichas dos pacientes NÃO vão para a RMD (o desenvolvedor não vê pacientes).
          // Sem fichas: exclui. Com fichas: passam para outro profissional escolhido; sem ele, a exclusão é recusada.
          if (!m[2] && req.method === 'DELETE') {
            const b = await corpo(req) || {}, tem = (await armazem.participantes(m[1])).length;
            let para = null;
            if (tem) {
              const d = b.destino ? await armazem.contaPorUsuario(String(b.destino).trim().toLowerCase()) : null;
              if (!d || d.papel === 'admin' || d.user_id === m[1]) return json(409, { error: 'Esta conta tem ' + tem + ' ficha(s) de pacientes. Para excluir, informe o usuário de outro profissional que vai ficar com elas, ou só bloqueie a conta.', fichas: tem });
              para = d.user_id;
            }
            const movidas = await armazem.excluirConta(m[1], para);
            await registrar('excluir_conta', alvo.usuario, movidas ? movidas + ' ficha(s) passaram para ' + b.destino : 'sem fichas');
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
        if (conta.papel === 'admin') return json(200, { sessoes: [] });  // o desenvolvedor não vê avaliações
        const lista = await armazem.sessoes(userId, url.searchParams.get('participante') || null);
        return json(200, { sessoes: lista.map((r) => ({ id: r.id, participantId: r.participante, status: r.status, criadoEm: r.dados.criadoEm, atualizadoEm: r.dados.atualizadoEm, dominios: r.dados.dominios,
          modo: r.dados.modo || 'avaliacao', qiEstimado: r.dados.resultadoFinal ? r.dados.resultadoFinal.qiEstimado : null, areas: r.dados.resultadoFinal ? r.dados.resultadoFinal.areas.map((a) => ({ id: a.id, indice: a.indice, nivel: a.nivel })) : null, parecer: r.dados.parecer || null })) });
      }
      if (caminho === '/api/adaptativa' && req.method === 'POST') {
        const b = await corpo(req) || {}, part = await armazem.participante(String(b.participantId || ''));
        const bq0 = bloqueio(conta, b.modo === 'estimulacao' ? 'exercicios' : 'avaliacao'); if (bq0) return erro(403, bq0);
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
        if (m[2] === 'controle' && req.method === 'POST') {
          const bc = await corpo(req) || {}, precisa = { compartilharDevolutiva: 'devolutiva', laudo: 'laudo' }[bc.acao];
          if (precisa) { const bq = bloqueio(conta, precisa); if (bq) return erro(403, bq); }
          const r = controle(s, bc); if (r.erro) return erro(409, r.erro); await salvar(s); return json(200, paraAvaliador(s)); }
        if (m[2] === 'parecer' && req.method === 'PUT') {
          const bq = bloqueio(conta, 'laudo'); if (bq) return erro(403, bq);
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
      // vai para "Problemas" no painel do desenvolvedor (sem chaves nem dados de paciente)
      try { await armazem.registrarErro({ origem: 'servidor', mensagem: semChaves(e && e.message).slice(0, 200) || 'erro', detalhe: req.method + ' ' + semChaves(caminho), pagina: '', conta: quem }); } catch (e2) { /* nunca piora o erro */ }
      return erro(500, 'Erro interno. Tente de novo.');
    }
  };
}
