/* NeuroTrilha (RMD) — questionários complementares (TRIAGEM, não diagnóstico). Redação em português própria do NeuroTrilha.
   - SNAP-IV (pais/professores; domínio público): desatenção, hiperatividade/impulsividade, oposição/desafio.
   - ASRS v1.1 (OMS, uso livre; adultos, autoaplicado): sintomas de TDAH no adulto.
   - PHQ-9 (domínio público; adolescentes a partir de 12 anos e adultos, autoaplicado): sintomas de depressão.
   - GAD-7 (domínio público; a partir de 12 anos, autoaplicado): sintomas de ansiedade.
   - M-CHAT-R (rastreio de autismo, 16 a 30 meses, pais): redação própria baseada nos comportamentos do M-CHAT-R/F; para uso oficial, a versão traduzida autorizada (mchatscreen.com).
   - Vanderbilt (TDAH e comorbidades, pais e professor; uso clínico livre): redação própria, com desempenho escolar e social.
   - Autonomia no dia a dia (comportamento adaptativo): questionário próprio do NeuroTrilha, SEM normas; mostra o quanto a pessoa faz sozinha.
   Usado pela página do questionário, pelo relatório e pelos servidores (computador e nuvem). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.NeuroTrilhaQuestionario = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var FREQ4 = ['Nem um pouco', 'Só um pouco', 'Bastante', 'Demais'];
  var DIAS = ['Nenhuma vez', 'Vários dias', 'Mais da metade dos dias', 'Quase todos os dias'];
  var SIMNAO = ['Sim', 'Não'];
  var VAND = ['Nunca', 'Às vezes', 'Frequentemente', 'Muito frequentemente'];
  var DESEMP = ['Excelente', 'Acima da média', 'Na média', 'Um pouco problemático', 'Problemático'];
  var AUTON = ['Ainda não faz', 'Faz com ajuda', 'Faz sozinho(a)'];
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
    mchat: {
      nome: 'M-CHAT-R', titulo: 'Questionário sobre o desenvolvimento da criança pequena (M-CHAT-R)', respondentes: ['pais'], idade: [1.3, 2.7], opcoes: SIMNAO,
      intro: 'Responda pensando em como a criança costuma se comportar. Se ela fez algo poucas vezes, responda como se não fizesse.',
      itens: ['Se você aponta para algo do outro lado da sala, a criança olha para o que você apontou?', 'Você já se perguntou se a criança pode ter algum problema de audição?',
        'A criança brinca de faz de conta (dar comida para a boneca, falar num telefone de brinquedo)?', 'A criança gosta de subir nas coisas (móveis, escadas, brinquedos do parque)?',
        'A criança faz movimentos diferentes com os dedos perto dos olhos?', 'A criança aponta com o dedo para pedir algo ou conseguir ajuda?', 'A criança aponta com o dedo para mostrar a você algo interessante?',
        'A criança se interessa por outras crianças (olha, sorri, chega perto)?', 'A criança traz coisas ou levanta objetos para mostrar a você, só para dividir com você?', 'A criança atende quando você a chama pelo nome?',
        'Quando você sorri para a criança, ela sorri de volta?', 'A criança fica muito incomodada com barulhos comuns do dia a dia (liquidificador, aspirador, música alta)?', 'A criança anda?',
        'A criança olha nos seus olhos quando você fala com ela, brinca com ela ou a veste?', 'A criança tenta imitar o que você faz (dar tchau, bater palmas, fazer um som engraçado)?',
        'Se você vira a cabeça para olhar alguma coisa, a criança olha em volta para ver o que você está olhando?', 'A criança tenta fazer você olhar para ela?',
        'A criança entende quando você pede algo sem apontar (por exemplo: "põe o livro na cadeira")?', 'Quando acontece algo novo, a criança olha para o seu rosto para ver como você reage?',
        'A criança gosta de brincadeiras de movimento (ser balançada, pular no seu colo)?'],
      riscoSim: [1, 4, 11]  // nestas perguntas (2, 5 e 12) o "Sim" é que pede atenção
    },
    vanderbilt: {
      nome: 'Vanderbilt', titulo: 'Questionário de atenção, comportamento e desempenho (Vanderbilt)', respondentes: ['pais', 'professor'], idade: [6, 12], opcoes: VAND,
      intro: 'Pense nos últimos 6 meses e marque com que frequência cada situação acontece. No fim, avalie o desempenho na escola e com as pessoas.',
      itens: [].concat(null),  // preenchido logo abaixo (reaproveita a redação do SNAP-IV)
      secoes: [{ de: 33, opcoes: DESEMP, titulo: 'Desempenho' }],
      escalas: [{ id: 'desatencao', nome: 'Desatenção', de: 0, ate: 9, corte: 6 }, { id: 'hiperatividade', nome: 'Hiperatividade e impulsividade', de: 9, ate: 18, corte: 6 },
        { id: 'oposicao', nome: 'Oposição e desafio', de: 18, ate: 26, corte: 4 }, { id: 'ansiedade', nome: 'Ansiedade e humor', de: 26, ate: 33, corte: 3 }]
    },
    autonomia: {
      nome: 'Autonomia', titulo: 'Autonomia no dia a dia (comportamento adaptativo)', respondentes: ['pais', 'proprio'], idade: [4, 120], opcoes: AUTON,
      intro: 'Marque o quanto a pessoa consegue fazer cada coisa hoje, no dia a dia. Se a atividade ainda não é esperada para a idade, marque "Ainda não faz".',
      itens: ['Diz o próprio nome completo e a idade.', 'Entende as horas no relógio.', 'Usa dinheiro para comprar algo simples e confere o troco.', 'Lê recados, placas ou avisos simples.',
        'Lembra de compromissos e recados.', 'Escreve um bilhete ou mensagem simples.', 'Separa o que precisa para uma tarefa (por exemplo, o material da escola).', 'Usa o celular para ligar ou mandar mensagem para alguém conhecido.',
        'Cumprimenta e se despede das pessoas.', 'Espera a vez em jogos e conversas.', 'Faz e mantém amizades.', 'Pede ajuda quando precisa.', 'Segue as regras de jogos e brincadeiras.',
        'Percebe quando alguém está chateado.', 'Pede desculpas quando erra.', 'Evita situações perigosas com estranhos.',
        'Come sozinho(a) usando talheres.', 'Veste-se e se calça sozinho(a).', 'Toma banho sozinho(a).', 'Usa o banheiro sozinho(a).', 'Arruma a cama ou guarda as próprias coisas.',
        'Prepara um lanche simples.', 'Atravessa a rua com segurança.', 'Cuida dos próprios remédios ou da saúde, com orientação.'],
      dominios: [{ id: 'conceitual', nome: 'Conceitual (dinheiro, horas, leitura, recados)', de: 0, ate: 8 }, { id: 'social', nome: 'Social (convivência e regras)', de: 8, ate: 16 }, { id: 'pratico', nome: 'Prático (cuidados pessoais e casa)', de: 16, ate: 24 }]
    },
    gad7: {
      nome: 'GAD-7', titulo: 'Questionário sobre ansiedade (GAD-7)', respondentes: ['proprio'], idade: [12, 120], opcoes: DIAS,
      intro: 'Nas últimas 2 semanas, com que frequência você foi incomodado(a) por cada um destes problemas?',
      itens: ['Sentir-se nervoso(a), ansioso(a) ou muito tenso(a).', 'Não conseguir parar ou controlar as preocupações.', 'Preocupar-se demais com várias coisas diferentes.',
        'Dificuldade para relaxar.', 'Ficar tão agitado(a) que é difícil continuar sentado(a).', 'Ficar irritado(a) ou aborrecido(a) com facilidade.', 'Sentir medo, como se algo horrível fosse acontecer.']
    }
  };
  // Vanderbilt: 18 de atenção + 8 de oposição (mesma redação do SNAP-IV), 7 de ansiedade/humor e 8 de desempenho
  INSTRUMENTOS.vanderbilt.itens = INSTRUMENTOS.snap.itens.slice(0, 26).concat([
    'Fica com medo ou preocupado(a) com facilidade.', 'Tem medo de experimentar coisas novas por receio de errar.', 'Diz que não tem valor ou se sente inferior aos outros.',
    'Culpa-se pelos problemas e se sente culpado(a).', 'Sente-se sozinho(a), diz que ninguém gosta dele(a).', 'Fica triste, infeliz ou desanimado(a).', 'É muito tímido(a) ou se envergonha com facilidade.',
    'Desempenho em leitura', 'Desempenho em escrita', 'Desempenho em matemática', 'Relacionamento com os adultos (pais ou professores)', 'Relacionamento com irmãos ou colegas',
    'Seguir regras e combinados', 'Organizar materiais e tarefas', 'Participar de atividades em grupo']);
  // opções de cada pergunta (alguns questionários mudam a escala no meio, como o desempenho do Vanderbilt)
  function opcoesDoItem(I, i) { var sc = (I.secoes || []).filter(function (x) { return i >= x.de; }).pop(); return sc ? sc.opcoes : I.opcoes; }
  function faixaTotal(inst, total) {
    if (inst === 'phq9') return total >= 20 ? 'grave' : total >= 15 ? 'moderadamente grave' : total >= 10 ? 'moderada' : total >= 5 ? 'leve' : 'mínima';
    if (inst === 'gad7') return total >= 15 ? 'grave' : total >= 10 ? 'moderada' : total >= 5 ? 'leve' : 'mínima';
    return null;
  }
  // pontuação de qualquer instrumento; devolve null se faltar resposta
  function pontuarInstrumento(inst, respostas) {
    if (!Object.prototype.hasOwnProperty.call(INSTRUMENTOS, inst)) return null; var I = INSTRUMENTOS[inst];
    if (!Array.isArray(respostas) || respostas.length !== I.itens.length || respostas.some(function (r, i) { return !(r >= 0 && r <= opcoesDoItem(I, i).length - 1 && r === Math.floor(r)); })) return null;
    if (inst === 'mchat') {
      var risco = respostas.filter(function (r, i) { return I.riscoSim.indexOf(i) >= 0 ? r === 0 : r === 1; }).length;
      return { total: risco, maximo: 20, faixa: risco >= 8 ? 'risco alto' : risco >= 3 ? 'risco médio' : 'risco baixo', acima: risco >= 3,
        itensRisco: respostas.map(function (r, i) { return (I.riscoSim.indexOf(i) >= 0 ? r === 0 : r === 1) ? i + 1 : null; }).filter(Boolean) };
    }
    if (inst === 'vanderbilt') {
      var esc = I.escalas.map(function (e) { var parte = respostas.slice(e.de, e.ate), altos = parte.filter(function (r) { return r >= 2; }).length; return { id: e.id, nome: e.nome, altos: altos, total: parte.length, corte: e.corte, acima: altos >= e.corte, valor: altos + ' de ' + parte.length + ' marcados "frequentemente" ou mais' }; });
      var prob = respostas.slice(33).map(function (r, k) { return r >= 3 ? I.itens[33 + k] : null; }).filter(Boolean);
      esc.push({ id: 'desempenho', nome: 'Prejuízo no desempenho', valor: prob.length ? prob.join(', ') : 'nenhuma área problemática', acima: prob.length > 0 });
      return { escalas: esc };
    }
    if (inst === 'autonomia') return { escalas: I.dominios.map(function (d) {
      var parte = respostas.slice(d.de, d.ate), pts = parte.reduce(function (s, r) { return s + r; }, 0), pct = Math.round(100 * pts / (parte.length * 2));
      return { id: d.id, nome: d.nome, valor: pct + '% do máximo (faz sozinho ' + parte.filter(function (r) { return r === 2; }).length + ' de ' + parte.length + ')', acima: pct < 50 };
    }) };
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
      var sinal = inst === 'autonomia' ? (e.acima ? 'abaixo da metade: investigar' : 'adequado para muitas atividades') : e.acima ? 'acima do ponto de atenção' : 'abaixo do ponto de atenção';
      return '<tr><td>' + esc(e.nome) + '</td><td>' + esc(val) + '</td><td><b>' + (e.acima === undefined ? '—' : sinal) + '</b></td></tr>'; }).join('') + '</tbody></table>' +
      (inst === 'autonomia' ? '<p class="small muted">Questionário próprio, sem normas: compare com o que é esperado para a idade e com a observação clínica (importante na hipótese de deficiência intelectual).</p>' : '');
    else if (inst === 'mchat') corpo = '<p><b>' + r.total + ' de 20</b> respostas que pedem atenção · <b>' + esc(r.faixa) + '</b>.</p>' + (r.total >= 3 ? '<div class="notice' + (r.total >= 8 ? ' danger-note' : '') + '">' + (r.total >= 8 ? 'Risco alto: encaminhar logo para avaliação diagnóstica e intervenção precoce.' : 'Risco médio: fazer a entrevista de seguimento (M-CHAT-R/F) com os pais; se continuar positivo, encaminhar para avaliação.') + ' Perguntas em destaque: ' + r.itensRisco.join(', ') + '.</div>' : '');
    else corpo = '<p>Total <b>' + r.total + ' de ' + r.maximo + '</b> · sintomas em grau <b>' + esc(r.faixa) + '</b>' + (r.acima ? ' (acima do ponto de atenção, 10+)' : '') + '.</p>' +
      (r.alertaRisco ? '<div class="notice danger-note"><b>ATENÇÃO — RISCO:</b> a pessoa marcou a pergunta sobre pensamentos de se machucar ou de estar morta. Avalie o risco o quanto antes e, se necessário, acione a rede de apoio (CVV 188, SAMU 192, CAPS).</div>' : '');
    return cab + corpo + '<p class="small muted">Triagem (' + esc(I.nome) + '). Não é diagnóstico: confirmar com entrevista clínica e outros dados.</p></div>';
  }
  var OPCOES = INSTRUMENTOS.snap.opcoes, ITENS = INSTRUMENTOS.snap.itens, ESCALAS = INSTRUMENTOS.snap.escalas;
  return { INSTRUMENTOS: INSTRUMENTOS, QUEM: QUEM, pontuarInstrumento: pontuarInstrumento, opcoesDoItem: opcoesDoItem, OPCOES: OPCOES, ITENS: ITENS, ESCALAS: ESCALAS, pontuar: pontuar, resumoHtml: resumoHtml };
});
