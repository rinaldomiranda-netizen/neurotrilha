/* NeuroTrilha (RMD) — regras da sessão adaptativa, num lugar só: usadas pelo servidor do computador (server.js)
   e pela função da nuvem (nuvem/funcao/nucleo.js). Assim uma melhoria vale para os dois.
   Cuida de: tarefa da vez (treino na 1ª de cada área), resposta do paciente, controles do avaliador,
   recordação das figuras no fim da sessão e o que cada tela pode ver (o paciente nunca recebe a resposta). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.RmdSessao = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // gerarChave: cria um código secreto aleatório (link da devolutiva para a família); vem do servidor
  function criarGestor(Motor, agora, gerarChave) {
    agora = agora || function () { return Date.now(); };
    var iso = function () { return new Date(agora()).toISOString(); };
    function escada(s) { return s.escadas[s.atual] || null; }

    // nova sessão (todas as áreas começam no nível 1)
    // versão do NeuroTrilha gravada em cada aplicação: sempre dá para saber com que regras aquele resultado foi calculado
    var VERSAO_SISTEMA = '2026.10.31';
    function criar(d) {
      var s = { id: d.id, token: d.token, participantId: d.participantId, owner: d.owner, avaliador: d.avaliador, status: 'aguardando', criadoEm: iso(), atualizadoEm: iso(), versaoSistema: VERSAO_SISTEMA,
        idadeAnos: d.idadeAnos, nomeChamado: d.nomeChamado, leitor: d.leitor, dominios: d.dominios, maxItens: d.maxItens,
        escadas: d.dominios.map(function (id) { return Motor.novaEscada(id, { maxItens: d.maxItens, idade: d.idadeAnos, curta: !!d.curta, inicio: (d.inicios || {})[id] }); }), atual: 0, item: null, versao: 1, falar: 0, historico: [], observacoes: [], parecer: null,
        evitar: (d.evitar || []).slice(-3000), encontros: [{ inicio: iso() }], comportamento: null,
        modo: d.modo === 'estimulacao' ? 'estimulacao' : 'avaliacao', curta: !!d.curta, blocos: {}, desenhos: {}, plano: d.plano || null };
      novoItem(s);
      return s;
    }

    function novoItem(s) {
      var e = escada(s);
      while (e && e.terminado) { s.atual++; e = escada(s); }
      if (!e) {
        // fim das áreas: recordação tardia (figuras do começo; palavras da lista: lembrar e reconhecer)
        if (s.status !== 'encerrada') {
          if (!s.fim) { s.fim = []; if (s.mlAlvos && !s.tardiaFeita) s.fim.push('ml'); if (s.blocos && s.blocos.mp) s.fim.push('mp-evoc', 'mp-rec'); }
          if (s.fim.length) { s.item = Motor.itemFim(s.fim[0], s, s.id + '|fim|' + s.fim[0]); s.item.mostradoEm = agora(); s.versao++; return; }
        }
        s.item = null; if (s.status !== 'encerrada') s.status = 'concluida'; s.resultadoFinal = Motor.resultado(s, s.idadeAnos); s.versao++; return;
      }
      var treino = !e.treinoFeito;  // a 1ª tarefa de cada área é treino (com retorno, não conta)
      // formas paralelas: não repete tarefa já vista nesta sessão nem nas avaliações anteriores do paciente
      var vistas = (s.evitar || []).concat(s.historico.map(function (h) { return h.chave; }));
      // tarefas em bloco (lista de palavras, texto, cópias): a posição no bloco e o que precisa continuar igual
      var ctx = { indice: e.itens.length, idade: s.idadeAnos, curta: !!s.curta, bloco: (s.blocos || {})[e.dominio] || null };
      for (var tent = 0; tent < 8; tent++) {
        s.item = Motor.gerarItem(e.dominio, treino ? 1 : e.nivel, s.id + '|' + s.historico.length + '|' + s.versao + (tent ? '|p' + tent : ''), ctx);
        if (ctx.bloco || vistas.indexOf(Motor.chaveItem(s.item)) < 0) break;
      }
      if (s.item.bloco && !treino) { s.blocos = s.blocos || {}; s.blocos[e.dominio] = s.item.bloco; }
      s.item.treino = treino; s.item.mostradoEm = agora(); s.versao++;
      if (e.dominio === 'ml' && !treino && !s.mlAlvos && s.item.alvosFig) s.mlAlvos = s.item.alvosFig;  // guarda as figuras do 1º item valendo
    }

    function paraPaciente(s) {
      var e = escada(s), d = e ? Motor.dominio(e.dominio) : null, ult = s.historico[s.historico.length - 1];
      return { status: s.status, versao: s.versao, falar: s.falar, leitor: s.leitor, nome: s.nomeChamado,
        pausaEncontro: !!s.pausaEncontro, modo: s.modo || 'avaliacao', area: d ? { curto: d.curto, numero: s.atual + 1, total: s.escadas.length } : (s.item && s.item.tardia ? { curto: 'Lembra?', numero: s.escadas.length, total: s.escadas.length } : null),
        item: ['aguardando', 'em_andamento'].indexOf(s.status) >= 0 ? Motor.itemPublico(s.item) : null,
        // estimulação em casa: mostra se acertou em toda tarefa (jogo); na avaliação, só no treino
        retorno: ult && (ult.treino || (s.modo === 'estimulacao' && typeof ult.certo === 'string')) ? { correto: ult.correto, certo: ult.certo } : null };
    }

    function paraAvaliador(s) {
      var e = escada(s);
      return { id: s.id, token: s.token, status: s.status, participantId: s.participantId, avaliador: s.avaliador, criadoEm: s.criadoEm, atualizadoEm: s.atualizadoEm, versaoSistema: s.versaoSistema || 'anterior a 2026.10.31',
        idadeAnos: s.idadeAnos, leitor: s.leitor, dominios: s.dominios, maxItens: s.maxItens, atual: s.atual, nivelAtual: e ? e.nivel : null, item: s.item, versao: s.versao,
        historico: s.historico.slice(-400), observacoes: s.observacoes, parecer: s.parecer, escadas: s.escadas, tardia: s.tardia || null,
        comportamento: s.comportamento || null, laudo: s.laudo || null, devolutiva: s.devolutiva || null, devolutivaLink: s.devolutivaLink || null, plano: s.plano || null, modo: s.modo || 'avaliacao', curta: !!s.curta, mpTardia: s.mpTardia || null,
        desenhos: ['concluida', 'encerrada'].indexOf(s.status) >= 0 ? (s.desenhos || {}) : {}, encontros: s.encontros || [], pausaEncontro: !!s.pausaEncontro,
        resultado: Motor.resultado(s, s.idadeAnos), estacao: s.estacao || null };
    }

    function responder(s, b) {
      if (['aguardando', 'em_andamento'].indexOf(s.status) < 0) return { erro: 'A sessão está ' + (s.status === 'pausada' ? 'em pausa' : 'encerrada') + '.' };
      if (!s.item || b.itemId !== s.item.id) return { erro: 'Esta tarefa já foi respondida.' };
      if (s.item.tipo === 'avaliador') {  // o paciente terminou (desenho, leitura, minuto): o avaliador é quem pontua
        s.item.entrega = Motor.limparEntrega(b.entrega || b.resposta || {}); s.status = 'em_andamento'; s.versao++;
        return { ok: true };
      }
      var decorrido = agora() - (s.item.mostradoEm || agora()), tempo = Math.max(0, Math.min(Number(b.tempoMs) || decorrido, decorrido + 1500));
      var res = Motor.corrigir(s.item, b.resposta, tempo), e = escada(s);
      s.status = 'em_andamento';
      s.historico.push({ dominio: s.item.dominio, nivel: s.item.nivel, itemId: s.item.id, treino: !!s.item.treino, tardia: !!s.item.tardia, resposta: b.resposta, certo: s.item.certo,
        correto: res.correto, rapido: res.rapido, esgotado: res.esgotado, extra: res.extra || null, tempoMs: tempo, em: iso(), fala: s.item.fala,
        nOpcoes: (s.item.opcoes || []).length, chave: Motor.chaveItem(s.item), subtipo: s.item.subtipo || null,
        tipoErro: res.correto ? null : Motor.classificarErro(s.item, b.resposta, res) });
      if (s.item.tardia) concluirFim(s, res.extra);
      else if (s.item.treino) e.treinoFeito = true;
      else Motor.registrar(e, s.item, res, tempo);
      novoItem(s);
      return { ok: true };
    }
    function concluirFim(s, extra) {
      var f = s.item.fim || 'ml';
      if (f === 'ml') { s.tardia = extra; s.tardiaFeita = true; }
      else { s.mpTardia = s.mpTardia || {}; s.mpTardia[f === 'mp-evoc' ? 'evoc' : 'rec'] = extra; }
      if (s.fim && s.fim[0] === f) s.fim.shift();
    }
    // o avaliador pontua no celular a tarefa falada/desenhada (lista de palavras, fluência, leitura, desenho, orientação)
    function pontuar(s, b) {
      if (['aguardando', 'em_andamento', 'pausada'].indexOf(s.status) < 0) return { erro: 'A sessão já terminou.' };
      if (!s.item || s.item.tipo !== 'avaliador' || b.itemId !== s.item.id) return { erro: 'Esta tarefa já foi pontuada.' };
      var it = s.item, e = escada(s), entrega = it.entrega || {}, res = Motor.corrigirAvaliador(it, b.pontuacao, entrega);
      var tempo = Math.max(0, agora() - (it.mostradoEm || agora()));
      if (entrega.desenho) { s.desenhos = s.desenhos || {}; s.desenhos[it.id] = entrega.desenho; }
      s.historico.push({ dominio: it.dominio, nivel: it.nivel, itemId: it.id, treino: false, tardia: !!it.tardia, resposta: { pontuacao: res.extra, desenho: entrega.desenho ? it.id : null },
        certo: null, correto: res.correto, rapido: true, esgotado: false, extra: res.extra, tempoMs: entrega.tempoMs || tempo, em: iso(), fala: it.fala, nOpcoes: 0, chave: Motor.chaveItem(it), subtipo: null, tipoErro: null });
      if (it.tardia) concluirFim(s, res.extra); else Motor.registrar(e, it, res, entrega.tempoMs || tempo);
      if (s.status === 'aguardando') s.status = 'em_andamento';
      novoItem(s);
      return { ok: true };
    }

    // controles do avaliador: pausar, continuar, subir/descer nível, pular área, encerrar, repetir a fala, anotar
    function controle(s, b) {
      var e = escada(s), acao = String(b.acao || '');
      if (['concluida', 'encerrada'].indexOf(s.status) >= 0 && ['observacao', 'comportamento', 'laudo', 'devolutiva', 'compartilharDevolutiva', 'revogarDevolutiva'].indexOf(acao) < 0) return { erro: 'A sessão já terminou.' };
      // devolutiva para a família por link (WhatsApp): só depois de salva; o profissional pode desativar o link
      if (acao === 'compartilharDevolutiva') { if (!s.devolutiva) return { erro: 'Salve a devolutiva antes de enviar.' }; if (!s.devolutivaLink) { if (!gerarChave) return { erro: 'Link indisponível.' }; s.devolutivaLink = gerarChave(); } return { ok: true }; }
      if (acao === 'revogarDevolutiva') { s.devolutivaLink = null; return { ok: true }; }
      if (acao === 'pontuar') return pontuar(s, b);
      if (acao === 'pausar') { s.status = 'pausada'; s.versao++; }
      else if (acao === 'encontro') {  // termina o encontro de hoje; continua outro dia do ponto onde parou
        s.status = 'pausada'; s.pausaEncontro = true; s.versao++;
        var ult = (s.encontros || [])[s.encontros.length - 1]; if (ult && !ult.fim) ult.fim = iso();
      }
      else if (acao === 'continuar') {
        if (s.pausaEncontro) { s.pausaEncontro = false; s.encontros = s.encontros || []; s.encontros.push({ inicio: iso() }); }
        s.status = s.historico.length ? 'em_andamento' : 'aguardando'; if (s.item) s.item.mostradoEm = agora(); s.versao++;
      }
      else if (acao === 'comportamento') {  // observação padronizada do comportamento (preenchida no fim)
        var c = b.comportamento || {}, campos = ['cooperacao', 'atencao', 'humor', 'linguagem', 'atividade', 'ansiedade', 'compreensao'], ok = {};
        campos.forEach(function (k) { if (['adequado', 'parcial', 'prejudicado'].indexOf(c[k]) >= 0) ok[k] = c[k]; });
        s.comportamento = { itens: ok, recursos: String(c.recursos || '').slice(0, 200), nota: String(c.nota || '').slice(0, 1000), em: iso() };
      }
      else if (acao === 'devolutiva') {  // relatório em linguagem simples para família e escola (o profissional revisa)
        var dv = b.devolutiva || {}, partes = ['abertura', 'fortes', 'atencao', 'casa', 'escola', 'encaminhamentos', 'fechamento'], tx = {};
        partes.forEach(function (k) { tx[k] = String(dv[k] || '').slice(0, 6000); });
        s.devolutiva = { secoes: tx, profissional: String(dv.profissional || '').slice(0, 120), registro: String(dv.registro || '').slice(0, 40), em: iso() };
      }
      else if (acao === 'laudo') {  // texto do laudo (modelo da Resolução CFP 06/2019), editado pelo profissional
        var l = b.laudo || {}, secoes = ['solicitante', 'finalidade', 'demanda', 'procedimento', 'analise', 'conclusao', 'referencias', 'local'], txt = {};
        secoes.forEach(function (k) { txt[k] = String(l[k] || '').slice(0, 8000); });
        s.laudo = { secoes: txt, profissional: String(l.profissional || '').slice(0, 120), registro: String(l.registro || '').slice(0, 40), em: iso() };
      }
      else if (acao === 'subir' || acao === 'descer') {
        if (!e) return { erro: 'Não há área em andamento.' };
        if (e.fixo) return { erro: 'Esta tarefa tem tamanho fixo; o nível não muda.' };
        e.nivel = Math.max(1, Math.min(Motor.NIVEIS, e.nivel + (acao === 'subir' ? 1 : -1))); e.treinoFeito = true; e.ajustesAvaliador = (e.ajustesAvaliador || 0) + 1; novoItem(s);
      }
      else if (acao === 'pular') {
        if (e) { e.terminado = true; e.motivoFim = 'pulado'; }
        else if (s.item && s.item.tardia) { if (s.item.fim && s.fim && s.fim[0] === s.item.fim) s.fim.shift(); if ((s.item.fim || 'ml') === 'ml') s.tardiaFeita = true; }  // pula a recordação do fim
        else return { erro: 'Não há área em andamento.' };
        novoItem(s);
      }
      else if (acao === 'encerrar') { s.status = 'encerrada'; s.item = null; s.resultadoFinal = Motor.resultado(s, s.idadeAnos); s.versao++; }
      else if (acao === 'repetir') { s.falar++; }
      else if (acao === 'observacao') s.observacoes.push({ em: iso(), itemId: s.item ? s.item.id : null, dominio: e ? e.dominio : null, flags: (Array.isArray(b.flags) ? b.flags : []).slice(0, 10).map(function (x) { return String(x).slice(0, 60); }), nota: String(b.nota || '').slice(0, 500) });
      else return { erro: 'Ação desconhecida.' };
      return { ok: true };
    }

    // estimulação em casa: cada área recomeça um pouco abaixo do nível da última estimulação (progresso contínuo)
    function iniciosEstimulacao(anteriores) {
      var ini = {};
      (anteriores || []).filter(function (x) { return x && x.modo === 'estimulacao'; }).sort(function (a, b) { return String(a.criadoEm).localeCompare(String(b.criadoEm)); }).forEach(function (x) {
        (x.escadas || []).forEach(function (e) { var n = Motor.nivelEstimado(e); if (n != null && !e.fixo) ini[e.dominio] = Math.max(1, Math.round(n) - 1); });
      });
      return ini;
    }

    // o que a família vê pelo link (só a devolutiva em linguagem simples; nada de QI nem respostas)
    function paraFamilia(s, clinica) { return s && s.devolutiva ? { nome: s.nomeChamado, data: s.criadoEm, secoes: s.devolutiva.secoes, profissional: s.devolutiva.profissional, registro: s.devolutiva.registro, clinica: clinica ? { nome: clinica.nome || '', contato: clinica.contato || '', logo: clinica.logo || '' } : null } : null; }

    // dados da clínica (aparecem no laudo, na devolutiva e na página da família): só texto curto e uma imagem pequena
    function limparClinica(b) {
      b = b || {};
      var logo = String(b.logo || '');
      if (logo && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(logo) || logo.length > 200000)) return { erro: 'O logo precisa ser uma imagem PNG, JPG ou WEBP pequena (até uns 150 KB).' };
      return { clinica: { nome: String(b.nome || '').trim().slice(0, 120), endereco: String(b.endereco || '').trim().slice(0, 200), contato: String(b.contato || '').trim().slice(0, 120), logo: logo } };
    }

    return { limparClinica: limparClinica, paraFamilia: paraFamilia, iniciosEstimulacao: iniciosEstimulacao, criar: criar, novoItem: novoItem, paraPaciente: paraPaciente, paraAvaliador: paraAvaliador, responder: responder, controle: controle };
  }

  return { criarGestor: criarGestor };
});
