/* NeuroTrilha (RMD) — questionários complementares (TRIAGEM, não diagnóstico). Redação em português própria do NeuroTrilha.
   - SNAP-IV (pais/professores; domínio público): desatenção, hiperatividade/impulsividade, oposição/desafio.
   - ASRS v1.1 (OMS, uso livre; adultos, autoaplicado): sintomas de TDAH no adulto.
   - PHQ-9 (domínio público; adolescentes a partir de 12 anos e adultos, autoaplicado): sintomas de depressão.
   - GAD-7 (domínio público; a partir de 12 anos, autoaplicado): sintomas de ansiedade.
   Usado pela página do questionário, pelo relatório e pelos servidores (computador e nuvem). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.NeuroTrilhaQuestionario = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var FREQ4 = ['Nem um pouco', 'Só um pouco', 'Bastante', 'Demais'];
  var DIAS = ['Nenhuma vez', 'Vários dias', 'Mais da metade dos dias', 'Quase todos os dias'];
  var INSTRUMENTOS = {
    snap: {
      nome: 'SNAP-IV', titulo: 'Questionário de comportamento (SNAP-IV)', respondentes: ['pais', 'professor'], idade: [4, 17], opcoes: FREQ4,
      intro: 'Pense no comportamento nos últimos 6 meses e marque o quanto cada frase descreve o que você observa.',
      itens: [
        'Não presta atenção a detalhes ou comete erros por descuido nas tarefas da escola ou de casa.', 'Tem dificuldade de manter a atenção em tarefas ou brincadeiras.',
        'Parece não estar ouvindo quando falam diretamente com ele(a).', 'Não segue as instruções até o fim e não termina as tarefas ou obrigações.',
        'Tem dificuldade para organizar tarefas e atividades.', 'Evita ou não gosta de tarefas que exigem esforço mental prolongado.',
        'Perde coisas necessárias para as atividades (brinquedos, cadernos, lápis, livros).', 'Distrai-se com facilidade com coisas à sua volta.', 'É esquecido(a) nas atividades do dia a dia.',
        'Mexe muito com as mãos ou os pés, ou se remexe na cadeira.', 'Levanta do lugar quando deveria ficar sentado(a) (sala de aula, mesa, igreja).',
        'Corre ou sobe nas coisas em situações em que isso não é adequado.', 'Tem dificuldade de brincar ou fazer atividades de lazer com calma.', 'Não para, parece estar "a mil por hora".',
        'Fala demais.', 'Responde antes de a pergunta terminar.', 'Tem dificuldade de esperar a sua vez.', 'Interrompe ou se mete nas conversas e brincadeiras dos outros.',
        'Perde a calma com facilidade.', 'Discute com adultos.', 'Desafia ou se recusa a obedecer pedidos e regras dos adultos.', 'Faz de propósito coisas que incomodam os outros.',
        'Culpa os outros pelos próprios erros ou mau comportamento.', 'Fica irritado(a) ou incomodado(a) com facilidade.', 'Está muitas vezes zangado(a) ou ressentido(a).', 'É maldoso(a) ou vingativo(a).'],
      escalas: [{ id: 'desatencao', nome: 'Desatenção', de: 0, ate: 9, corte: 6 }, { id: 'hiperatividade', nome: 'Hiperatividade e impulsividade', de: 9, ate: 18, corte: 6 }, { id: 'oposicao', nome: 'Oposição e desafio', de: 18, ate: 26, corte: 4 }]
    },
    asrs: {
      nome: 'ASRS-18', titulo: 'Questionário sobre atenção e agitação em adultos (ASRS v1.1)', respondentes: ['proprio'], idade: [18, 120],
      opcoes: ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Muito frequentemente'],
      intro: 'Pense em como você tem se sentido e se comportado nos últimos 6 meses e marque a frequência de cada situação.',
      itens: [
        'Com que frequência você tem dificuldade para terminar os detalhes finais de um trabalho, depois que a parte difícil já foi feita?',
        'Com que frequência você tem dificuldade para pôr as coisas em ordem quando a tarefa exige organização?', 'Com que frequência você tem problemas para lembrar compromissos ou obrigações?',
        'Quando uma tarefa exige muito raciocínio, com que frequência você evita ou adia o começo?', 'Com que frequência você mexe ou balança as mãos ou os pés quando precisa ficar sentado(a) por muito tempo?',
        'Com que frequência você se sente ativo(a) demais, como se estivesse "ligado(a) na tomada"?',
        'Com que frequência você comete erros por descuido em trabalhos chatos ou difíceis?', 'Com que frequência você tem dificuldade de manter a atenção em trabalhos chatos ou repetitivos?',
        'Com que frequência você tem dificuldade de se concentrar no que as pessoas dizem, mesmo quando falam diretamente com você?', 'Com que frequência você perde ou tem dificuldade de achar coisas em casa ou no trabalho?',
        'Com que frequência você se distrai com barulho ou movimento à sua volta?', 'Com que frequência você levanta em reuniões ou situações em que deveria continuar sentado(a)?',
        'Com que frequência você se sente inquieto(a) ou agitado(a)?', 'Com que frequência você tem dificuldade de relaxar quando tem tempo livre?',
        'Com que frequência você fala demais em situações sociais?', 'Numa conversa, com que frequência você termina as frases dos outros antes que eles terminem?',
        'Com que frequência você tem dificuldade de esperar a sua vez?', 'Com que frequência você interrompe os outros quando estão ocupados?'],
      escalas: [{ id: 'parteA', nome: 'Triagem (parte A, 6 perguntas)', de: 0, ate: 6 }, { id: 'desatencao', nome: 'Desatenção (9 perguntas)', de: 0, ate: 18, itensIdx: [0, 1, 2, 3, 6, 7, 8, 9, 10] }, { id: 'hiper', nome: 'Hiperatividade e impulsividade (9 perguntas)', de: 0, ate: 18, itensIdx: [4, 5, 11, 12, 13, 14, 15, 16, 17] }]
    },
    phq9: {
      nome: 'PHQ-9', titulo: 'Questionário sobre o humor (PHQ-9)', respondentes: ['proprio'], idade: [12, 120], opcoes: DIAS,
      intro: 'Nas últimas 2 semanas, com que frequência você foi incomodado(a) por cada um destes problemas?',
      itens: ['Pouco interesse ou pouco prazer em fazer as coisas.', 'Sentir-se para baixo, deprimido(a) ou sem esperança.',
        'Dificuldade para pegar no sono ou continuar dormindo, ou dormir mais do que o costume.', 'Sentir-se cansado(a) ou com pouca energia.', 'Falta de apetite ou comer demais.',
        'Sentir-se mal consigo mesmo(a), achar que é um fracasso ou que decepcionou a família ou a si mesmo(a).', 'Dificuldade para se concentrar nas coisas, como ler ou ver televisão.',
        'Lentidão para se mexer ou falar, a ponto de os outros perceberem; ou o contrário: muita agitação e inquietação.', 'Pensar em se machucar de alguma forma ou que seria melhor estar morto(a).']
    },
    gad7: {
      nome: 'GAD-7', titulo: 'Questionário sobre ansiedade (GAD-7)', respondentes: ['proprio'], idade: [12, 120], opcoes: DIAS,
      intro: 'Nas últimas 2 semanas, com que frequência você foi incomodado(a) por cada um destes problemas?',
      itens: ['Sentir-se nervoso(a), ansioso(a) ou muito tenso(a).', 'Não conseguir parar ou controlar as preocupações.', 'Preocupar-se demais com várias coisas diferentes.',
        'Dificuldade para relaxar.', 'Ficar tão agitado(a) que é difícil continuar sentado(a).', 'Ficar irritado(a) ou aborrecido(a) com facilidade.', 'Sentir medo, como se algo horrível fosse acontecer.']
    }
  };
  function faixaTotal(inst, total) {
    if (inst === 'phq9') return total >= 20 ? 'grave' : total >= 15 ? 'moderadamente grave' : total >= 10 ? 'moderada' : total >= 5 ? 'leve' : 'mínima';
    if (inst === 'gad7') return total >= 15 ? 'grave' : total >= 10 ? 'moderada' : total >= 5 ? 'leve' : 'mínima';
    return null;
  }
  // pontuação de qualquer instrumento; devolve null se faltar resposta
  function pontuarInstrumento(inst, respostas) {
    if (!Object.prototype.hasOwnProperty.call(INSTRUMENTOS, inst)) return null; var I = INSTRUMENTOS[inst];
    var max = I.opcoes.length - 1;
    if (!Array.isArray(respostas) || respostas.length !== I.itens.length || respostas.some(function (r) { return !(r >= 0 && r <= max && r === Math.floor(r)); })) return null;
    if (inst === 'snap') return { escalas: I.escalas.map(function (e) {
      var parte = respostas.slice(e.de, e.ate), altos = parte.filter(function (r) { return r >= 2; }).length;
      return { id: e.id, nome: e.nome, media: Math.round(parte.reduce(function (s, r) { return s + r; }, 0) / parte.length * 100) / 100, altos: altos, total: parte.length, corte: e.corte, acima: altos >= e.corte };
    }) };
    if (inst === 'asrs') {
      // parte A: perguntas 1-3 positivas a partir de "às vezes"; 4-6 a partir de "frequentemente"; 4 ou mais = triagem positiva
      var parteA = respostas.slice(0, 6).filter(function (r, i) { return r >= (i < 3 ? 2 : 3); }).length;
      var soma = function (idx) { return idx.reduce(function (s, i) { return s + respostas[i]; }, 0); };
      return { escalas: [{ id: 'parteA', nome: 'Triagem (parte A)', valor: parteA + ' de 6 perguntas em destaque', acima: parteA >= 4, corte: 4 },
        { id: 'desatencao', nome: 'Desatenção', valor: soma(I.escalas[1].itensIdx) + ' de 36' }, { id: 'hiper', nome: 'Hiperatividade e impulsividade', valor: soma(I.escalas[2].itensIdx) + ' de 36' }] };
    }
    var total = respostas.reduce(function (s, r) { return s + r; }, 0), fx = faixaTotal(inst, total);
    var res = { total: total, maximo: I.itens.length * 3, faixa: fx, acima: total >= 10 };
    if (inst === 'phq9' && respostas[8] > 0) res.alertaRisco = true;  // pergunta 9: pensamentos de se machucar
    return res;
  }
  // compatibilidade: SNAP-IV como antes
  function pontuar(respostas) { var r = pontuarInstrumento('snap', respostas); return r ? r.escalas : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var QUEM = { pais: 'Pais / responsáveis', professor: 'Professor(a)', proprio: 'O próprio paciente' };
  function resumoHtml(q) {
    var inst = q.instrumento || 'snap', I = INSTRUMENTOS[inst], r = q.resultado || (inst === 'snap' && q.pontuacao ? { escalas: q.pontuacao } : pontuarInstrumento(inst, q.respostas)) || {};
    var cab = '<div class="ad-questionario"><p><b>' + esc(I.nome) + '</b> · ' + esc(QUEM[q.respondente] || '') + (q.nomeRespondente ? ' (' + esc(q.nomeRespondente) + ')' : '') + ' · respondido em ' + new Date(q.respondidoEm).toLocaleDateString('pt-BR') + '</p>';
    var corpo;
    if (r.escalas) corpo = '<table class="table"><thead><tr><th>Escala</th><th>Resultado</th><th>Sinal</th></tr></thead><tbody>' + r.escalas.map(function (e) {
      var val = e.valor || (e.altos + ' de ' + e.total + ' marcados "bastante" ou "demais" · média ' + String(e.media).replace('.', ','));
      return '<tr><td>' + esc(e.nome) + '</td><td>' + esc(val) + '</td><td><b>' + (e.acima === undefined ? '—' : e.acima ? 'acima do ponto de atenção' : 'abaixo do ponto de atenção') + '</b></td></tr>'; }).join('') + '</tbody></table>';
    else corpo = '<p>Total <b>' + r.total + ' de ' + r.maximo + '</b> · sintomas em grau <b>' + esc(r.faixa) + '</b>' + (r.acima ? ' (acima do ponto de atenção, 10+)' : '') + '.</p>' +
      (r.alertaRisco ? '<div class="notice danger-note"><b>ATENÇÃO — RISCO:</b> a pessoa marcou a pergunta sobre pensamentos de se machucar ou de estar morta. Avalie o risco o quanto antes e, se necessário, acione a rede de apoio (CVV 188, SAMU 192, CAPS).</div>' : '');
    return cab + corpo + '<p class="small muted">Triagem (' + esc(I.nome) + '). Não é diagnóstico: confirmar com entrevista clínica e outros dados.</p></div>';
  }
  var OPCOES = INSTRUMENTOS.snap.opcoes, ITENS = INSTRUMENTOS.snap.itens, ESCALAS = INSTRUMENTOS.snap.escalas;
  return { INSTRUMENTOS: INSTRUMENTOS, QUEM: QUEM, pontuarInstrumento: pontuarInstrumento, OPCOES: OPCOES, ITENS: ITENS, ESCALAS: ESCALAS, pontuar: pontuar, resumoHtml: resumoHtml };
});
