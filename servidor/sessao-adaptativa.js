/* NeuroTrilha (RMD) — regras da sessão adaptativa, num lugar só: usadas pelo servidor do computador (server.js)
   e pela função da nuvem (nuvem/funcao/nucleo.js). Assim uma melhoria vale para os dois.
   Cuida de: tarefa da vez (treino na 1ª de cada área), resposta do paciente, controles do avaliador,
   recordação das figuras no fim da sessão e o que cada tela pode ver (o paciente nunca recebe a resposta). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.RmdSessao = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function criarGestor(Motor, agora) {
    agora = agora || function () { return Date.now(); };
    var iso = function () { return new Date(agora()).toISOString(); };
    function escada(s) { return s.escadas[s.atual] || null; }

    // nova sessão (todas as áreas começam no nível 1)
    function criar(d) {
      var s = { id: d.id, token: d.token, participantId: d.participantId, owner: d.owner, avaliador: d.avaliador, status: 'aguardando', criadoEm: iso(), atualizadoEm: iso(),
        idadeAnos: d.idadeAnos, nomeChamado: d.nomeChamado, leitor: d.leitor, dominios: d.dominios, maxItens: d.maxItens,
        escadas: d.dominios.map(function (id) { return Motor.novaEscada(id, { maxItens: d.maxItens }); }), atual: 0, item: null, versao: 1, falar: 0, historico: [], observacoes: [], parecer: null };
      novoItem(s);
      return s;
    }

    function novoItem(s) {
      var e = escada(s);
      while (e && e.terminado) { s.atual++; e = escada(s); }
      if (!e) {
        // fim das áreas: se houve memória de figuras, pergunta de novo as figuras do começo (recordação tardia)
        if (s.mlAlvos && !s.tardiaFeita && s.status !== 'encerrada') {
          s.item = Motor.itemTardio(s.mlAlvos, s.id + '|tardia'); s.item.mostradoEm = agora(); s.versao++; return;
        }
        s.item = null; if (s.status !== 'encerrada') s.status = 'concluida'; s.resultadoFinal = Motor.resultado(s, s.idadeAnos); s.versao++; return;
      }
      var treino = !e.treinoFeito;  // a 1ª tarefa de cada área é treino (com retorno, não conta)
      s.item = Motor.gerarItem(e.dominio, treino ? 1 : e.nivel, s.id + '|' + s.historico.length + '|' + s.versao);
      s.item.treino = treino; s.item.mostradoEm = agora(); s.versao++;
      if (e.dominio === 'ml' && !treino && !s.mlAlvos && s.item.alvosFig) s.mlAlvos = s.item.alvosFig;  // guarda as figuras do 1º item valendo
    }

    function paraPaciente(s) {
      var e = escada(s), d = e ? Motor.dominio(e.dominio) : null, ult = s.historico[s.historico.length - 1];
      return { status: s.status, versao: s.versao, falar: s.falar, leitor: s.leitor, nome: s.nomeChamado,
        area: d ? { curto: d.curto, numero: s.atual + 1, total: s.escadas.length } : (s.item && s.item.tardia ? { curto: 'Lembra?', numero: s.escadas.length, total: s.escadas.length } : null),
        item: ['aguardando', 'em_andamento'].indexOf(s.status) >= 0 ? Motor.itemPublico(s.item) : null,
        retorno: ult && ult.treino ? { correto: ult.correto, certo: ult.certo } : null };
    }

    function paraAvaliador(s) {
      var e = escada(s);
      return { id: s.id, token: s.token, status: s.status, participantId: s.participantId, avaliador: s.avaliador, criadoEm: s.criadoEm, atualizadoEm: s.atualizadoEm,
        idadeAnos: s.idadeAnos, leitor: s.leitor, dominios: s.dominios, maxItens: s.maxItens, atual: s.atual, nivelAtual: e ? e.nivel : null, item: s.item, versao: s.versao,
        historico: s.historico.slice(-400), observacoes: s.observacoes, parecer: s.parecer, escadas: s.escadas, tardia: s.tardia || null,
        resultado: Motor.resultado(s, s.idadeAnos), estacao: s.estacao || null };
    }

    function responder(s, b) {
      if (['aguardando', 'em_andamento'].indexOf(s.status) < 0) return { erro: 'A sessão está ' + (s.status === 'pausada' ? 'em pausa' : 'encerrada') + '.' };
      if (!s.item || b.itemId !== s.item.id) return { erro: 'Esta tarefa já foi respondida.' };
      var decorrido = agora() - (s.item.mostradoEm || agora()), tempo = Math.max(0, Math.min(Number(b.tempoMs) || decorrido, decorrido + 1500));
      var res = Motor.corrigir(s.item, b.resposta, tempo), e = escada(s);
      s.status = 'em_andamento';
      s.historico.push({ dominio: s.item.dominio, nivel: s.item.nivel, itemId: s.item.id, treino: !!s.item.treino, tardia: !!s.item.tardia, resposta: b.resposta, certo: s.item.certo,
        correto: res.correto, rapido: res.rapido, esgotado: res.esgotado, extra: res.extra || null, tempoMs: tempo, em: iso(), fala: s.item.fala });
      if (s.item.tardia) { s.tardia = res.extra; s.tardiaFeita = true; }
      else if (s.item.treino) e.treinoFeito = true;
      else Motor.registrar(e, s.item, res, tempo);
      novoItem(s);
      return { ok: true };
    }

    // controles do avaliador: pausar, continuar, subir/descer nível, pular área, encerrar, repetir a fala, anotar
    function controle(s, b) {
      var e = escada(s), acao = String(b.acao || '');
      if (['concluida', 'encerrada'].indexOf(s.status) >= 0 && acao !== 'observacao') return { erro: 'A sessão já terminou.' };
      if (acao === 'pausar') { s.status = 'pausada'; s.versao++; }
      else if (acao === 'continuar') { s.status = s.historico.length ? 'em_andamento' : 'aguardando'; if (s.item) s.item.mostradoEm = agora(); s.versao++; }
      else if (acao === 'subir' || acao === 'descer') {
        if (!e) return { erro: 'Não há área em andamento.' };
        if (e.fixo) return { erro: 'A atenção contínua tem velocidade fixa; o nível não muda.' };
        e.nivel = Math.max(1, Math.min(Motor.NIVEIS, e.nivel + (acao === 'subir' ? 1 : -1))); e.treinoFeito = true; e.ajustesAvaliador = (e.ajustesAvaliador || 0) + 1; novoItem(s);
      }
      else if (acao === 'pular') {
        if (e) { e.terminado = true; e.motivoFim = 'pulado'; }
        else if (s.item && s.item.tardia) s.tardiaFeita = true;  // pula a recordação do fim
        else return { erro: 'Não há área em andamento.' };
        novoItem(s);
      }
      else if (acao === 'encerrar') { s.status = 'encerrada'; s.item = null; s.resultadoFinal = Motor.resultado(s, s.idadeAnos); s.versao++; }
      else if (acao === 'repetir') { s.falar++; }
      else if (acao === 'observacao') s.observacoes.push({ em: iso(), itemId: s.item ? s.item.id : null, dominio: e ? e.dominio : null, flags: (Array.isArray(b.flags) ? b.flags : []).slice(0, 10).map(function (x) { return String(x).slice(0, 60); }), nota: String(b.nota || '').slice(0, 500) });
      else return { erro: 'Ação desconhecida.' };
      return { ok: true };
    }

    return { criar: criar, novoItem: novoItem, paraPaciente: paraPaciente, paraAvaliador: paraAvaliador, responder: responder, controle: controle };
  }

  return { criarGestor: criarGestor };
});
