/* NeuroTrilha (RMD) — questionário para pais e professores: SNAP-IV (escala de domínio público para sintomas de
   desatenção, hiperatividade/impulsividade e oposição/desafio). Redação em português própria do NeuroTrilha,
   baseada nos critérios da escala; é TRIAGEM, não diagnóstico. Usado pela página do questionário, pelo relatório
   e pelos servidores (computador e nuvem) para calcular a pontuação. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.NeuroTrilhaQuestionario = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var OPCOES = ['Nem um pouco', 'Só um pouco', 'Bastante', 'Demais'];
  var ITENS = [
    // desatenção (1 a 9)
    'Não presta atenção a detalhes ou comete erros por descuido nas tarefas da escola ou de casa.',
    'Tem dificuldade de manter a atenção em tarefas ou brincadeiras.',
    'Parece não estar ouvindo quando falam diretamente com ele(a).',
    'Não segue as instruções até o fim e não termina as tarefas ou obrigações.',
    'Tem dificuldade para organizar tarefas e atividades.',
    'Evita ou não gosta de tarefas que exigem esforço mental prolongado.',
    'Perde coisas necessárias para as atividades (brinquedos, cadernos, lápis, livros).',
    'Distrai-se com facilidade com coisas à sua volta.',
    'É esquecido(a) nas atividades do dia a dia.',
    // hiperatividade e impulsividade (10 a 18)
    'Mexe muito com as mãos ou os pés, ou se remexe na cadeira.',
    'Levanta do lugar quando deveria ficar sentado(a) (sala de aula, mesa, igreja).',
    'Corre ou sobe nas coisas em situações em que isso não é adequado.',
    'Tem dificuldade de brincar ou fazer atividades de lazer com calma.',
    'Não para, parece estar "a mil por hora".',
    'Fala demais.',
    'Responde antes de a pergunta terminar.',
    'Tem dificuldade de esperar a sua vez.',
    'Interrompe ou se mete nas conversas e brincadeiras dos outros.',
    // oposição e desafio (19 a 26)
    'Perde a calma com facilidade.',
    'Discute com adultos.',
    'Desafia ou se recusa a obedecer pedidos e regras dos adultos.',
    'Faz de propósito coisas que incomodam os outros.',
    'Culpa os outros pelos próprios erros ou mau comportamento.',
    'Fica irritado(a) ou incomodado(a) com facilidade.',
    'Está muitas vezes zangado(a) ou ressentido(a).',
    'É maldoso(a) ou vingativo(a).'
  ];
  var ESCALAS = [
    { id: 'desatencao', nome: 'Desatenção', de: 0, ate: 9, corte: 6 },
    { id: 'hiperatividade', nome: 'Hiperatividade e impulsividade', de: 9, ate: 18, corte: 6 },
    { id: 'oposicao', nome: 'Oposição e desafio', de: 18, ate: 26, corte: 4 }
  ];

  // pontuação: média de cada escala (0 a 3) e quantos itens marcados como "bastante" ou "demais"
  function pontuar(respostas) {
    if (!Array.isArray(respostas) || respostas.length !== ITENS.length || respostas.some(function (r) { return [0, 1, 2, 3].indexOf(r) < 0; })) return null;
    return ESCALAS.map(function (e) {
      var parte = respostas.slice(e.de, e.ate), altos = parte.filter(function (r) { return r >= 2; }).length;
      return { id: e.id, nome: e.nome, media: Math.round(parte.reduce(function (s, r) { return s + r; }, 0) / parte.length * 100) / 100, altos: altos, total: parte.length, corte: e.corte, acima: altos >= e.corte };
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function resumoHtml(q) {
    var p = q.pontuacao || pontuar(q.respostas) || [];
    return '<div class="ad-questionario"><p><b>' + (q.respondente === 'professor' ? 'Professor(a)' : 'Pais / responsáveis') + '</b>' + (q.nomeRespondente ? ' · ' + esc(q.nomeRespondente) : '') +
      ' · respondido em ' + new Date(q.respondidoEm).toLocaleDateString('pt-BR') + '</p><table class="table"><thead><tr><th>Escala</th><th>Itens marcados "bastante" ou "demais"</th><th>Média (0 a 3)</th><th>Sinal</th></tr></thead><tbody>' +
      p.map(function (e) { return '<tr><td>' + esc(e.nome) + '</td><td>' + e.altos + ' de ' + e.total + '</td><td>' + String(e.media).replace('.', ',') + '</td><td><b>' + (e.acima ? 'acima do ponto de atenção (' + e.corte + '+)' : 'abaixo do ponto de atenção') + '</b></td></tr>'; }).join('') +
      '</tbody></table><p class="small muted">Triagem baseada no SNAP-IV (domínio público). Não é diagnóstico: o resultado precisa ser confirmado com entrevista, observação em mais de um ambiente e critérios clínicos.</p></div>';
  }
  return { OPCOES: OPCOES, ITENS: ITENS, ESCALAS: ESCALAS, pontuar: pontuar, resumoHtml: resumoHtml };
});
