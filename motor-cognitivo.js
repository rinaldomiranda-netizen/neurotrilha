/* RMD Cognitivo — motor da aplicação adaptativa (usado pelo servidor, pela tela do paciente e pelo painel do avaliador).

   Como funciona (pedido do Rinaldo, 28/10/2026):
   - Todas as áreas começam no nível 1 (o mais fácil), seja qual for a idade. A dificuldade sobe ou desce conforme a
     resposta e o tempo ("escada" adaptativa): acerto rápido sobe; acerto lento mantém; erro desce.
     Até o primeiro erro a escada sobe de 2 em 2 (para não cansar quem já domina o fácil).
   - 16 níveis por área. Os níveis 1 a 13 foram ancorados em idades de referência aproximadas (3 a 17 anos),
     tiradas da progressão descrita na literatura do desenvolvimento (por exemplo, a amplitude de memória sobe
     de 2–3 itens aos 4–5 anos para 5–7 no adulto). Os níveis 14 a 16 ficam acima da média adulta.
   - Áreas baseadas no modelo CHC (Cattell-Horn-Carroll), o mesmo das baterias modernas de inteligência:
     Gf raciocínio fluido, Gwm memória de trabalho, Gv visuoespacial, Gs velocidade de processamento,
     Gc vocabulário/conhecimento, Gq raciocínio quantitativo, além de atenção/controle inibitório (tarefa dos peixes,
     tipo "flanker") e flexibilidade cognitiva (jogo das cartas, tipo "troca de regra").
   - Nada depende de leitura até a criança mostrar que lê: a instrução é falada (voz do aparelho) e as respostas
     são figuras. As tarefas são ORIGINAIS (geradas pelo programa), não cópias de testes comerciais.
   - O "QI estimado" é uma ESTIMATIVA EXPERIMENTAL: compara o nível alcançado com o nível esperado para a idade,
     usando referências aproximadas e um desvio-padrão assumido. Não é um teste aprovado no SATEPSI/CFP e não tem
     normas brasileiras. Serve de informação para o profissional, que aceita ou não no parecer final. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.RmdMotor = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NIVEIS = 16;
  // idade de referência (anos) em que cada nível costuma ser alcançado — aproximada, não é norma
  var IDADE_REF = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 17];
  var DP_NIVEIS = 1.5;  // desvio-padrão assumido, em níveis (equivale a 15 pontos)

  // grupo: onde aparece no relatório · qi: entra no QI estimado · idades: faixa em que a tarefa faz sentido
  // fixo: bloco de tamanho fixo (não é escada; não dá "nível", dá medidas próprias)
  var DOMINIOS = [
    { id: 'gf', nome: 'Raciocínio fluido', chc: 'Gf', curto: 'Padrões', grupo: 'inteligencia', qi: true, idades: [4, 120], desc: 'Descobrir a regra de uma sequência ou matriz de figuras.' },
    { id: 'gwm', nome: 'Memória de trabalho', chc: 'Gwm', curto: 'Memória', grupo: 'inteligencia', qi: true, idades: [4, 120], desc: 'Guardar e repetir a ordem em que os quadrados acendem.' },
    { id: 'gv', nome: 'Visuoespacial', chc: 'Gv', curto: 'Formas', grupo: 'inteligencia', qi: true, idades: [4, 120], desc: 'Achar a mesma forma, mesmo girada (sem espelhar).' },
    { id: 'gs', nome: 'Velocidade de processamento', chc: 'Gs', curto: 'Rapidez', grupo: 'inteligencia', qi: true, idades: [5, 120], desc: 'Encontrar rápido o desenho igual ao modelo.' },
    { id: 'gc', nome: 'Vocabulário e conhecimento', chc: 'Gc', curto: 'Palavras', grupo: 'inteligencia', qi: true, idades: [4, 120], desc: 'Ouvir uma palavra ou definição e tocar na figura certa.' },
    { id: 'gq', nome: 'Raciocínio quantitativo', chc: 'Gq', curto: 'Números', grupo: 'inteligencia', qi: true, idades: [4, 120], desc: 'Quantidades, contas e sequências numéricas.' },
    { id: 'rv', nome: 'Categorias e semelhanças', chc: 'Gc/Gf', curto: 'Combina?', grupo: 'inteligencia', qi: true, idades: [4, 120], desc: 'Achar o que não combina, o que combina e completar analogias com figuras.' },
    { id: 'dg', nome: 'Números ouvidos (na ordem)', chc: 'Gwm auditiva', curto: 'Números ouvidos', grupo: 'inteligencia', qi: true, idades: [5, 120], desc: 'Ouvir números e tocar neles na mesma ordem.' },
    { id: 'di', nome: 'Números de trás para frente', chc: 'Gwm', curto: 'Ao contrário', grupo: 'inteligencia', qi: true, idades: [7, 120], desc: 'Ouvir números e tocar neles de trás para frente.' },
    { id: 'ml', nome: 'Memória de figuras', chc: 'Glr', curto: 'Memória de figuras', grupo: 'inteligencia', qi: true, idades: [4, 120], desc: 'Memorizar figuras, reconhecer em seguida e lembrar de novo no fim da sessão.' },
    { id: 'at', nome: 'Atenção e controle inibitório', chc: 'Atenção', curto: 'Peixes', grupo: 'executivas', qi: false, idades: [4, 120], desc: 'Dizer para onde nada o peixe do meio, ignorando os outros.' },
    { id: 'gn', nome: 'Controle de impulsos (toque ou não toque)', chc: 'Inibição', curto: 'Toque ou não', grupo: 'executivas', qi: false, idades: [4, 120], desc: 'Tocar quando aparece peixe e segurar quando aparece tubarão. Mede impulsividade e tempo de reação.' },
    { id: 'ac', nome: 'Atenção contínua', chc: 'Atenção sustentada', curto: 'Estrela', grupo: 'executivas', qi: false, fixo: true, fixoItens: 48, idades: [5, 120], desc: 'Cerca de 2 minutos tocando só na estrela. Mede desatenção e queda da atenção com o tempo.' },
    { id: 'fx', nome: 'Flexibilidade cognitiva', chc: 'Funções executivas', curto: 'Cartas', grupo: 'executivas', qi: false, idades: [5, 120], desc: 'Separar cartas pela cor ou pela forma, trocando a regra.' },
    { id: 'to', nome: 'Planejamento (torre)', chc: 'Funções executivas', curto: 'Torre', grupo: 'executivas', qi: false, idades: [6, 120], desc: 'Mover bolinhas até ficar igual ao modelo com o menor número de jogadas.' },
    { id: 'tl', nome: 'Ligar os pontos', chc: 'Atenção alternada', curto: 'Ligar pontos', grupo: 'executivas', qi: false, idades: [6, 120], desc: 'Tocar em ordem (1, 2, 3...) e depois alternando número e letra (1, A, 2, B...).' },
    { id: 'cm', nome: 'Caminhos', chc: 'Rastreio visual', curto: 'Caminhos', grupo: 'executivas', qi: false, idades: [4, 120], desc: 'Seguir com os olhos o caminho do ratinho até o prêmio.' },
    { id: 'fo', nome: 'Rimas e sons (consciência fonológica)', chc: 'Pré-leitura', curto: 'Rimas', grupo: 'aprendizagem', qi: false, idades: [4, 10], desc: 'Rimas, sons iniciais, juntar e trocar pedaços de palavras. Base da alfabetização (triagem de dislexia).' },
    { id: 'le', nome: 'Leitura', chc: 'Leitura', curto: 'Leitura', grupo: 'aprendizagem', qi: false, idades: [6, 120], desc: 'Ler palavras e frases e tocar na figura certa (decodificação e compreensão).' },
    { id: 'em', nome: 'Emoções e situações sociais', chc: 'Cognição social', curto: 'Emoções', grupo: 'social', qi: false, idades: [4, 120], desc: 'Reconhecer emoções em rostos e situações e entender o que o outro pensa.' },
    // ampliação (30/10/2026) — avaliador: true = o avaliador pontua no celular (o paciente fala ou desenha)
    { id: 'mp', nome: 'Memória de palavras (lista)', chc: 'Glr verbal', curto: 'Palavras ouvidas', grupo: 'memoria', qi: false, fixo: true, fixoItens: function (idade, curta) { return curta || idade < 8 ? 3 : 5; }, semTreino: true, avaliador: true, idades: [5, 120], desc: 'Ouvir uma lista de palavras várias vezes, dizer as que lembra e lembrar de novo no fim da sessão (e reconhecer entre figuras). O avaliador marca no celular.' },
    { id: 'fv', nome: 'Fluência verbal', chc: 'Glr / fluência', curto: 'Diga palavras', grupo: 'memoria', qi: false, fixo: true, fixoItens: function (idade) { return idade >= 8 ? 2 : 1; }, semTreino: true, avaliador: true, idades: [5, 120], desc: 'Dizer em 1 minuto o máximo de animais (e, a partir de 8 anos, palavras com F). O avaliador conta no celular.' },
    { id: 'lx', nome: 'Leitura de texto (fluência e compreensão)', chc: 'Leitura', curto: 'Ler o texto', grupo: 'aprendizagem', qi: false, fixo: true, fixoItens: 4, semTreino: true, avaliador: true, idades: [7, 120], desc: 'Ler um texto em voz alta (o avaliador marca os erros; o sistema calcula palavras por minuto) e responder 3 perguntas sobre ele.' },
    { id: 'dt', nome: 'Ditado (escrita de palavras)', chc: 'Escrita', curto: 'Escrever', grupo: 'aprendizagem', qi: false, idades: [7, 120], desc: 'Ouvir uma palavra e escrever no teclado da tela. Separa erros de som (fonológicos) de erros de regra (ortográficos).' },
    { id: 'mt', nome: 'Matemática escolar', chc: 'Gq escolar', curto: 'Contas', grupo: 'aprendizagem', qi: false, idades: [6, 120], desc: 'Contas e problemas: somar, subtrair, tabuada, divisão, frações, porcentagem e equação.' },
    { id: 'cs', nome: 'Entender o outro (teoria da mente)', chc: 'Cognição social', curto: 'O que ele pensa?', grupo: 'social', qi: false, idades: [4, 120], desc: 'Histórias curtas: o que a pessoa quer, pensa e sabe; crença falsa, ironia e gafes. Apoio na hipótese de TEA.' },
    { id: 'dc', nome: 'Cópia de figura', chc: 'Visuoconstrução', curto: 'Copiar desenho', grupo: 'motor', qi: false, fixo: true, fixoItens: function (idade) { return idade < 7 ? 2 : 3; }, semTreino: true, avaliador: true, idades: [4, 120], desc: 'Copiar desenhos no tablet com o dedo ou caneta. O avaliador pontua cada elemento.' },
    { id: 'rl', nome: 'Desenho do relógio', chc: 'Visuoconstrução e planejamento', curto: 'Relógio', grupo: 'motor', qi: false, fixo: true, fixoItens: 1, semTreino: true, avaliador: true, idades: [8, 120], desc: 'Desenhar um relógio marcando 11h10. Também usado no rastreio de idosos. O avaliador pontua.' },
    { id: 'tp', nome: 'Toque rápido (coordenação fina)', chc: 'Motor fino', curto: 'Toque rápido', grupo: 'motor', qi: false, fixo: true, fixoItens: 4, semTreino: true, idades: [4, 120], desc: 'Tocar o mais rápido possível por 10 segundos com cada mão (duas vezes).' },
    { id: 'tr', nome: 'Tempo de reação', chc: 'Velocidade de reação', curto: 'Reação', grupo: 'motor', qi: false, fixo: true, fixoItens: 20, idades: [5, 120], desc: 'Reagir rápido a uma estrela (reação simples) e tocar o lado da seta (reação de escolha).' },
    { id: 'or', nome: 'Orientação (tempo e lugar)', chc: 'Rastreio cognitivo', curto: 'Perguntas', grupo: 'rastreio', qi: false, fixo: true, fixoItens: 7, semTreino: true, avaliador: true, idades: [10, 120], desc: 'Perguntas sobre data, hora e lugar. Rastreio de memória em adultos e idosos. O avaliador marca certo ou errado.' }
  ];
  var GRUPOS = { inteligencia: 'Inteligência (entra no QI estimado)', executivas: 'Atenção e funções executivas', memoria: 'Memória verbal e linguagem', aprendizagem: 'Aprendizagem escolar (sons, leitura, escrita e matemática)',
    social: 'Cognição social', motor: 'Desenho, coordenação e reação', rastreio: 'Rastreio cognitivo (adultos e idosos)' };
  // conjuntos prontos de tarefas (o profissional pode mudar). rapida: cerca de 15 minutos, com menos tarefas por área
  var PROTOCOLOS = {
    rapida: { nome: 'Avaliação rápida (≈15 min)', itens: 6, curta: true, areas: function (i) { return i >= 60 ? ['or', 'mp', 'rl', 'fv', 'gc'] : i < 7 ? ['gf', 'gwm', 'gc', 'gq', 'gn', 'fo'] : i < 13 ? ['gf', 'gwm', 'gc', 'gq', 'gn', 'le', 'dt'] : ['gf', 'gwm', 'gc', 'gq', 'gn', 'mp']; } },
    escolar: { nome: 'Dificuldade escolar', itens: 10, areas: function () { return ['fo', 'le', 'lx', 'dt', 'mt', 'dg', 'gwm', 'ac', 'mp']; } },
    tdah: { nome: 'Atenção e TDAH', itens: 10, areas: function () { return ['gn', 'ac', 'at', 'fx', 'gwm', 'di', 'tr', 'to', 'mp']; } },
    tea: { nome: 'Cognição social e TEA', itens: 10, areas: function () { return ['em', 'cs', 'rv', 'gc', 'fx', 'gf', 'gwm']; } },
    idoso: { nome: 'Rastreio de memória (adultos e idosos)', itens: 8, curta: true, areas: function () { return ['or', 'mp', 'rl', 'fv', 'dc', 'tr', 'gc', 'gf']; } }
  };
  function protocolo(id, idade) {
    var p = PROTOCOLOS[id]; if (!p) return null;
    return { nome: p.nome, itens: p.itens, curta: !!p.curta, areas: p.areas(idade).filter(function (a) { var d = dominio(a); return d && idade >= d.idades[0] && idade <= d.idades[1]; }) };
  }
  // áreas já marcadas na preparação, conforme a idade (o profissional pode mudar)
  function recomendadas(idade) {
    var base = idade < 7 ? ['gf', 'gwm', 'gv', 'gc', 'gq', 'rv', 'ml', 'gn', 'cm', 'fo', 'em']
      : idade < 13 ? ['gf', 'gwm', 'gv', 'gs', 'gc', 'gq', 'rv', 'dg', 'di', 'ml', 'gn', 'le']
        : ['gf', 'gwm', 'gv', 'gs', 'gc', 'gq', 'rv', 'dg', 'di', 'ml', 'fx', 'tl'];
    return base.filter(function (id) { var d = dominio(id); return idade >= d.idades[0] && idade <= d.idades[1]; });
  }
  function dominio(id) { return DOMINIOS.filter(function (d) { return d.id === id; })[0]; }

  // ------------------------------------------------------------------ números "sorteados" repetíveis
  function hash(t) { var h = 2166136261; t = String(t); for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(semente) {
    var a = hash(semente);
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function int(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
  function pega(r, lista) { return lista[Math.floor(r() * lista.length)]; }
  function embaralha(r, lista) { var x = lista.slice(); for (var i = x.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = x[i]; x[i] = x[j]; x[j] = t; } return x; }
  function amostra(r, lista, n) { return embaralha(r, lista).slice(0, n); }

  var CORES = { vermelho: '#e5484d', azul: '#2f6fe4', verde: '#1f9d6b', amarelo: '#f2b100', roxo: '#8e4ec6', laranja: '#f26b1d' };
  var NOMES_COR = Object.keys(CORES);
  var FORMAS = ['circulo', 'quadrado', 'triangulo', 'estrela', 'coracao', 'losango', 'hexagono', 'cruz'];
  function igual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  // monta as opções: a certa + distratores diferentes entre si; devolve {opcoes, certo}
  function montarOpcoes(r, certa, distratores, n) {
    var lista = [certa];
    for (var i = 0; i < distratores.length && lista.length < n; i++) {
      if (!lista.some(function (x) { return igual(x, distratores[i]); })) lista.push(distratores[i]);
    }
    var ids = 'abcdefgh'.split('');
    var ordem = embaralha(r, lista.map(function (fig, k) { return { fig: fig, k: k }; }));
    var certo = null;
    var opcoes = ordem.map(function (o, k) { if (o.k === 0) certo = ids[k]; return { id: ids[k], fig: o.fig }; });
    return { opcoes: opcoes, certo: certo };
  }

  // ------------------------------------------------------------------ Gf — padrões e matrizes
  function variar(r, fig, campo) {
    var x = Object.assign({}, fig);
    if (campo === 'c') x.c = pega(r, NOMES_COR.filter(function (c) { return c !== fig.c; }));
    if (campo === 'f') x.f = pega(r, FORMAS.filter(function (f) { return f !== fig.f; }));
    if (campo === 'n') x.n = Math.max(1, (fig.n || 1) + pega(r, [-1, 1, 2]));
    if (campo === 'r') x.r = ((fig.r || 0) + pega(r, [45, 90, 180])) % 360;
    if (campo === 't') x.t = fig.t === 0.55 ? 1 : 0.55;
    return x;
  }
  function itemGf(r, nivel) {
    var cs = amostra(r, NOMES_COR, 4), fs = amostra(r, FORMAS.filter(function (f) { return f !== 'circulo'; }), 4);
    var fala = 'Olhe a fileira. Qual figura completa o espaço vazio?', seq, certa, campos, layout = 'fileira', nOp = nivel <= 3 ? 3 : nivel <= 8 ? 4 : 6;
    if (nivel <= 8) {
      var gerar;
      if (nivel === 1) gerar = function (i) { return { f: 'circulo', c: cs[i % 2] }; };
      else if (nivel === 2) gerar = function (i) { return { f: fs[i % 2], c: cs[0] }; };
      else if (nivel === 3) gerar = function (i) { return { f: fs[0], c: cs[i % 3 === 2 ? 1 : 0] }; };
      else if (nivel === 4) gerar = function (i) { return { f: fs[i % 3], c: cs[i % 3] }; };
      else if (nivel === 5) gerar = function (i) { return { f: fs[0], c: cs[0], t: [0.45, 0.7, 1][i % 3] }; };
      else if (nivel === 6) gerar = function (i) { return { f: 'triangulo', c: cs[1], r: (i * 45) % 360 }; };
      else if (nivel === 7) gerar = function (i) { return { f: fs[1], c: cs[2], n: (i % 4) + 1 }; };
      else gerar = function (i) { return { f: fs[i % 3], c: cs[i % 2] }; };
      var tam = nivel === 7 ? 4 : nivel === 6 || nivel <= 3 ? 5 : 6;
      seq = []; for (var i = 0; i < tam; i++) seq.push(gerar(i));
      certa = seq[tam - 1]; seq[tam - 1] = null;
      campos = nivel === 1 ? ['c'] : nivel === 2 ? ['f'] : nivel === 5 ? ['t', 'c'] : nivel === 6 ? ['r', 'c'] : nivel === 7 ? ['n', 'f'] : ['f', 'c'];
    } else {
      // matrizes 3x3 (nível 9: 2x2)
      layout = nivel === 9 ? 'matriz2' : 'matriz3';
      fala = 'Olhe o quadro. Qual figura completa o espaço vazio?';
      var lado = nivel === 9 ? 2 : 3, m = [];
      var atrib = nivel === 9 ? ['c-linha', 'f-coluna'] : nivel === 10 ? ['f-lat', 'c-linha'] : nivel === 11 ? ['f-lat', 'n-col'] :
        nivel === 12 ? ['f-lat', 'c-lat2'] : nivel === 13 ? ['f-lat', 'c-lat2', 'r-col'] : nivel === 14 ? ['f-lat', 'c-lat2', 'n-col'] : ['f-lat', 'c-lat2', 'n-col', 'r-lin'];
      var desloc = int(r, 1, 2);
      for (var li = 0; li < lado; li++) for (var co = 0; co < lado; co++) {
        var fig = { f: fs[0], c: cs[0] };
        atrib.forEach(function (a) {
          if (a === 'c-linha') fig.c = cs[li];
          if (a === 'f-coluna') fig.f = fs[co];
          if (a === 'f-lat') fig.f = fs[(li + co) % 3];
          if (a === 'c-lat2') fig.c = cs[(li * desloc + co * 2) % 3];
          if (a === 'n-col') fig.n = co + 1;
          if (a === 'r-col') { fig.f = fig.f === 'circulo' || fig.f === 'hexagono' ? 'triangulo' : fig.f; fig.r = co * 90; }
          if (a === 'r-lin') fig.r = li * 90;
        });
        m.push(fig);
      }
      certa = m[m.length - 1]; m[m.length - 1] = null; seq = m;
      campos = atrib.map(function (a) { return a[0]; });
      if (nivel >= 16) nOp = 8;
    }
    var distr = [];
    for (var k = 0; k < 30 && distr.length < nOp + 3; k++) distr.push(variar(r, certa, campos[k % campos.length]));
    // distratores "quase certos": outras figuras do próprio quadro
    seq.forEach(function (f) { if (f && distr.length < nOp + 6) distr.push(f); });
    var o = montarOpcoes(r, certa, embaralha(r, distr), nOp);
    return { tipo: 'escolha', layout: layout, fala: fala, estimulo: seq, opcoes: o.opcoes, certo: o.certo, lentoMs: 30000 };
  }

  // ------------------------------------------------------------------ Gwm — quadrados que acendem (tipo Corsi)
  var SPAN = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 7, 8];
  function itemGwm(r, nivel) {
    var grade = nivel <= 6 ? 3 : 4, n = SPAN[nivel - 1], celulas = [];
    for (var i = 0; i < grade * grade; i++) celulas.push(i);
    var seq = [];
    while (seq.length < n) { var c = pega(r, celulas); if (seq[seq.length - 1] !== c && seq.indexOf(c) < 0) seq.push(c); }
    return { tipo: 'corsi', layout: 'corsi', fala: 'Olhe os quadrados que acendem. Depois toque neles na mesma ordem.', grade: grade, sequencia: seq,
      passoMs: nivel <= 4 ? 1000 : 800, certo: seq, lentoMs: 4000 + n * 2500 };
  }

  // ------------------------------------------------------------------ Gv — mesma forma, mesmo girada
  function poliomino(r, n) {
    var cel = [[0, 0]];
    while (cel.length < n) {
      var b = pega(r, cel), d = pega(r, [[1, 0], [-1, 0], [0, 1], [0, -1]]), x = [b[0] + d[0], b[1] + d[1]];
      if (!cel.some(function (c) { return c[0] === x[0] && c[1] === x[1]; })) cel.push(x);
    }
    return normal(cel);
  }
  function normal(cel) {
    var mx = Math.min.apply(null, cel.map(function (c) { return c[0]; })), my = Math.min.apply(null, cel.map(function (c) { return c[1]; }));
    return cel.map(function (c) { return [c[0] - mx, c[1] - my]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  }
  function girar(cel, vezes) { var x = cel; for (var i = 0; i < vezes; i++) x = x.map(function (c) { return [-c[1], c[0]]; }); return normal(x); }
  function espelhar(cel) { return normal(cel.map(function (c) { return [-c[0], c[1]]; })); }
  function rotacoes(cel) { return [0, 1, 2, 3].map(function (v) { return JSON.stringify(girar(cel, v)); }); }
  function itemGv(r, nivel) {
    var cor = pega(r, NOMES_COR);
    if (nivel <= 2) {
      var fs = amostra(r, FORMAS, 4), alvo = { f: fs[0], c: cor };
      var o0 = montarOpcoes(r, alvo, fs.slice(1).map(function (f) { return { f: f, c: cor }; }), nivel === 1 ? 3 : 4);
      return { tipo: 'escolha', layout: 'modelo', fala: 'Toque na figura igual a esta de cima.', estimulo: [alvo], opcoes: o0.opcoes, certo: o0.certo, lentoMs: 15000 };
    }
    var n = nivel <= 3 ? 3 : nivel <= 6 ? 4 : nivel <= 9 ? 5 : nivel <= 12 ? 6 : 7, forma;
    for (var t = 0; t < 60; t++) { forma = poliomino(r, n); if (rotacoes(forma).indexOf(JSON.stringify(espelhar(forma))) < 0) break; }
    var vezes = nivel <= 3 ? 0 : nivel <= 5 ? 1 : int(r, 1, 3);
    var certa = { poli: girar(forma, vezes), c: cor };
    var distr = [];
    if (nivel <= 3) { for (var k = 0; k < 6; k++) distr.push({ poli: poliomino(r, n), c: cor }); }
    else {
      var esp = espelhar(forma);
      [0, 1, 2, 3].forEach(function (v) { distr.push({ poli: girar(esp, v), c: cor }); });
      if (nivel <= 6) distr.unshift({ poli: poliomino(r, n), c: cor });
    }
    distr = distr.filter(function (d) { return rotacoes(forma).indexOf(JSON.stringify(d.poli)) < 0; });
    var o = montarOpcoes(r, certa, embaralha(r, distr), nivel <= 6 ? 4 : 5);
    return { tipo: 'escolha', layout: 'modelo', fala: nivel <= 3 ? 'Toque na forma igual a esta de cima.' : 'Toque na forma igual a esta de cima. Ela pode estar girada, mas não virada no espelho.',
      estimulo: [{ poli: forma, c: cor }], opcoes: o.opcoes, certo: o.certo, lentoMs: 25000 };
  }

  // ------------------------------------------------------------------ Gs — achar rápido o igual
  var GS_N = [3, 4, 4, 6, 6, 8, 8, 9, 12, 12, 12, 16, 16, 16, 20, 20];
  var GS_LIMITE = [9000, 8000, 7000, 7000, 6000, 6500, 6000, 6000, 7000, 6500, 6000, 7500, 7000, 6500, 7500, 7000];
  function itemGs(r, nivel) {
    var n = GS_N[nivel - 1], alvo = { f: pega(r, FORMAS), c: pega(r, NOMES_COR) };
    if (nivel >= 7) alvo.r = pega(r, [0, 90]);
    var distr = [];
    for (var k = 0; k < 80 && distr.length < n + 4; k++) {
      var d = Object.assign({}, alvo), muda = nivel <= 3 ? 'f' : nivel <= 8 ? pega(r, ['f', 'c']) : pega(r, ['c', 'f', 'r']);
      if (muda === 'f') d.f = pega(r, FORMAS.filter(function (f) { return f !== alvo.f; }));
      if (muda === 'c') d.c = pega(r, NOMES_COR.filter(function (c) { return c !== alvo.c; }));
      if (muda === 'r') d.r = ((alvo.r || 0) + 180) % 360;
      if (muda === 'r' && (alvo.f === 'circulo' || alvo.f === 'cruz' || alvo.f === 'hexagono' || alvo.f === 'losango' || alvo.f === 'quadrado')) d.c = pega(r, NOMES_COR.filter(function (c) { return c !== alvo.c; }));
      distr.push(d);
    }
    // repetidos permitidos entre distratores (como numa busca visual)
    var ids = 'abcdefghijklmnopqrstuvwxyz'.split(''), pos = int(r, 0, n - 1), opcoes = [];
    for (var i = 0, j = 0; i < n; i++) opcoes.push({ id: ids[i], fig: i === pos ? alvo : distr[j++ % distr.length] });
    return { tipo: 'escolha', layout: 'busca', fala: 'Encontre o desenho igual ao de cima. Seja rápido!', estimulo: [alvo], opcoes: opcoes, certo: ids[pos],
      limiteMs: GS_LIMITE[nivel - 1], lentoMs: Math.round(GS_LIMITE[nivel - 1] * 0.6) };
  }

  // ------------------------------------------------------------------ Gc — vocabulário por figuras (palavra falada)
  // [o que é falado, figura certa, distratores]
  var GC = [
    [['cachorro', '🐶', ['🐱', '🐟', '🐦']], ['bola', '⚽', ['🚗', '🍎', '🏠']], ['casa', '🏠', ['🌳', '🚗', '⚽']], ['maçã', '🍎', ['🍌', '🥕', '⚽']], ['sol', '☀️', ['🌙', '⭐', '☁️']]],
    [['cavalo', '🐴', ['🐮', '🐷', '🐶']], ['banana', '🍌', ['🍎', '🍇', '🥕']], ['chave', '🔑', ['🔨', '✂️', '🥄']], ['avião', '✈️', ['🚗', '🚢', '🚲']], ['lua', '🌙', ['☀️', '⭐', '☁️']]],
    [['tartaruga', '🐢', ['🐸', '🐍', '🦎']], ['tesoura', '✂️', ['🔪', '🔨', '🥄']], ['guarda-chuva', '☂️', ['🧢', '👓', '🎈']], ['abacaxi', '🍍', ['🍓', '🍐', '🥥']], ['coruja', '🦉', ['🦅', '🐧', '🐔']]],
    [['elefante', '🐘', ['🦏', '🦛', '🐄']], ['foguete', '🚀', ['✈️', '🚁', '🛸']], ['martelo', '🔨', ['🪛', '🔧', '🪚']], ['girafa', '🦒', ['🦓', '🐪', '🦌']], ['relógio', '⏰', ['📱', '💡', '🔔']]],
    [['pinguim', '🐧', ['🦆', '🦢', '🦜']], ['violão', '🎸', ['🎻', '🥁', '🎺']], ['cadeado', '🔒', ['🔑', '🧲', '🔔']], ['polvo', '🐙', ['🦑', '🦀', '🐠']], ['ambulância', '🚑', ['🚒', '🚓', '🚌']]],
    [['canguru', '🦘', ['🐰', '🦌', '🐿️']], ['ímã', '🧲', ['🔩', '🔋', '🔑']], ['paraquedas', '🪂', ['🎈', '🪁', '⛱️']], ['vulcão', '🌋', ['⛰️', '🏔️', '🏝️']], ['cogumelo', '🍄', ['🌰', '🥔', '🧅']]],
    [['termômetro', '🌡️', ['⏱️', '🧭', '🔦']], ['bússola', '🧭', ['⏱️', '🌡️', '🕰️']], ['âncora', '⚓', ['🔱', '⛏️', '🪝']], ['telescópio', '🔭', ['🔬', '📷', '🔦']], ['escorpião', '🦂', ['🕷️', '🦗', '🐜']]],
    [['microscópio', '🔬', ['🔭', '🔍', '📷']], ['ampulheta', '⏳', ['⏰', '🕰️', '⏱️']], ['violino', '🎻', ['🎸', '🎷', '🪕']], ['estetoscópio', '🩺', ['💉', '🌡️', '🦯']], ['bumerangue', '🪃', ['🪁', '🏹', '🥏']]],
    [['Toque no animal que é um mamífero que voa.', '🦇', ['🦅', '🦋', '🐝']], ['Toque no instrumento de cordas tocado com um arco.', '🎻', ['🎸', '🎹', '🎺']], ['Toque no que mostra a direção do norte.', '🧭', ['⏰', '🌡️', '🗺️']], ['Toque no animal que respira por guelras.', '🐟', ['🐬', '🐸', '🦆']]],
    [['Toque no planeta conhecido pelos anéis.', '🪐', ['🌍', '🌕', '☀️']], ['Toque no animal que é um anfíbio.', '🐸', ['🦎', '🐢', '🐍']], ['Toque no que usamos para medir a febre.', '🌡️', ['🩺', '💊', '⏱️']], ['Toque na estação do ano em que as folhas caem.', '🍂', ['🌸', '☀️', '❄️']]],
    [['Toque no símbolo da justiça.', '⚖️', ['🏛️', '📜', '🔨']], ['Toque no que serve para ampliar coisas muito pequenas, como células.', '🔬', ['🔭', '🔍', '👓']], ['Toque no inseto que passa por metamorfose e vira borboleta.', '🐛', ['🐜', '🕷️', '🐞']], ['Toque no que indica a passagem do tempo com areia.', '⏳', ['⌛', '⏰', '🕰️']]],
    [['Toque no animal invertebrado marinho com tentáculos.', '🐙', ['🦈', '🐬', '🐋']], ['Toque no fenômeno causado pela erupção de magma.', '🌋', ['⛰️', '🌪️', '🌊']], ['Toque no instrumento de sopro feito de metal.', '🎺', ['🎻', '🥁', '🪈']], ['Toque no objeto usado para escrever antes da caneta, com tinta.', '🪶', ['✏️', '🖌️', '🖍️']]],
    [['Toque no animal marsupial.', '🦘', ['🐨', '🐼', '🦥']], ['Toque no símbolo usado para a medicina.', '⚕️', ['⚖️', '☮️', '♻️']], ['Toque na ave que não voa e vive no gelo.', '🐧', ['🦅', '🦉', '🦩']], ['Toque no animal que dorme pendurado de cabeça para baixo.', '🦇', ['🦉', '🐦', '🐿️']]],
    [['Toque no réptil.', '🦎', ['🐸', '🦦', '🐊']], ['Toque no que um arqueólogo procura.', '🦴', ['💎', '🪙', '🗝️']], ['Toque no que representa a reciclagem.', '♻️', ['☢️', '⚠️', '🚯']], ['Toque no instrumento que mede o tempo exato numa corrida.', '⏱️', ['⏰', '🕰️', '⌛']]],
    [['Toque no símbolo de radioatividade.', '☢️', ['☣️', '⚠️', '♻️']], ['Toque no animal que é um crustáceo.', '🦀', ['🐙', '🦑', '🐚']], ['Toque no objeto usado para orientação no mar antes do GPS.', '🧭', ['⚓', '🔭', '🗺️']], ['Toque no que representa o risco biológico.', '☣️', ['☢️', '⚠️', '🧪']]],
    [['Toque no animal que é um mamífero aquático.', '🐋', ['🦈', '🐟', '🐙']], ['Toque no que representa um elemento químico em laboratório.', '⚗️', ['🧪', '🔬', '💊']], ['Toque no instrumento de percussão.', '🥁', ['🎷', '🎻', '🪗']], ['Toque no que simboliza a paz.', '☮️', ['☯️', '♾️', '⚛️']]]
  ];
  function itemGc(r, nivel) {
    var x = pega(r, GC[nivel - 1]), palavra = nivel <= 8;
    var o = montarOpcoes(r, { e: x[1] }, x[2].map(function (e) { return { e: e }; }), 4);
    return { tipo: 'escolha', layout: 'figuras', fala: palavra ? 'Toque: ' + x[0] + '.' : x[0], palavra: x[0], estimulo: [], opcoes: o.opcoes, certo: o.certo, lentoMs: 15000 };
  }

  // ------------------------------------------------------------------ Gq — quantidade e números
  function numOpcoes(r, certo, perto) {
    var d = [];
    perto.forEach(function (p) { var v = certo + p; if (v >= 0 && v !== certo && d.indexOf(v) < 0) d.push(v); });
    return d;
  }
  function itemGq(r, nivel) {
    var a, b, c, certo, fala, est = [], extras;
    if (nivel === 1 || nivel === 2) {
      var grupos = nivel === 1 ? [int(r, 1, 2), int(r, 4, 5)] : [int(r, 1, 2), int(r, 3, 3), int(r, 5, 6)];
      var maior = Math.max.apply(null, grupos), cor = pega(r, NOMES_COR);
      var o0 = montarOpcoes(r, { pontos: maior, c: cor }, grupos.filter(function (g) { return g !== maior; }).map(function (g) { return { pontos: g, c: cor }; }), grupos.length);
      return { tipo: 'escolha', layout: 'figuras', fala: 'Toque no cartão que tem MAIS bolinhas.', estimulo: [], opcoes: o0.opcoes, certo: o0.certo, lentoMs: 12000 };
    }
    if (nivel === 3 || nivel === 4) {
      certo = nivel === 3 ? int(r, 3, 5) : int(r, 6, 9);
      var cor2 = pega(r, NOMES_COR), dd = numOpcoes(r, certo, [-1, 1, 2, -2]);
      var o1 = montarOpcoes(r, { pontos: certo, c: cor2 }, dd.map(function (v) { return { pontos: v, c: cor2 }; }), 4);
      return { tipo: 'escolha', layout: 'figuras', fala: 'Toque no cartão que tem ' + certo + ' bolinhas.', estimulo: [], opcoes: o1.opcoes, certo: o1.certo, lentoMs: 15000 };
    }
    if (nivel === 5 || nivel === 6) {
      var emo = pega(r, ['🍎', '⭐', '🐟', '🎈']);
      a = int(r, 2, 4); b = int(r, 1, 3);
      if (nivel === 5) { certo = a + b; fala = 'Aqui tem ' + a + ' e chegam mais ' + b + '. Quantos ficam ao todo?'; est = [{ e: emo, n: a }, { mais: true }, { e: emo, n: b }]; }
      else { a = int(r, 5, 7); b = int(r, 1, 3); certo = a - b; fala = 'Tinha ' + a + '. Foram embora ' + b + '. Quantos sobraram?'; est = [{ e: emo, n: a }, { menos: true }, { e: emo, n: b }]; }
      var cor3 = pega(r, NOMES_COR), d3 = numOpcoes(r, certo, [-1, 1, 2]);
      var o2 = montarOpcoes(r, { pontos: certo, c: cor3 }, d3.map(function (v) { return { pontos: v, c: cor3 }; }), 4);
      return { tipo: 'escolha', layout: 'conta', fala: fala, estimulo: est, opcoes: o2.opcoes, certo: o2.certo, lentoMs: 20000 };
    }
    if (nivel === 7) { a = int(r, 1, 5); b = pega(r, [1, 2]); est = [a, a + b, a + 2 * b, a + 3 * b]; certo = a + 4 * b; fala = 'Qual número vem depois?'; extras = [-1, 1, b + 1]; }
    else if (nivel === 8) { a = int(r, 20, 30); b = pega(r, [-3, 3, 5, -5]); est = [a, a + b, a + 2 * b, a + 3 * b]; certo = a + 4 * b; fala = 'Qual número vem depois?'; extras = [-b, b > 0 ? 1 : -1, 2]; }
    else if (nivel === 9) { var soma = r() < 0.5; a = int(r, 6, 9); b = int(r, 5, 9); if (soma) certo = a + b; else { a = a + b; certo = a - b; } fala = 'Quanto dá esta conta?'; est = [a + (soma ? ' + ' : ' − ') + b]; extras = [-1, 1, 10, -2]; }
    else if (nivel === 10) { a = int(r, 3, 9); b = int(r, 4, 9); certo = a * b; fala = 'Quanto dá esta conta?'; est = [a + ' × ' + b]; extras = [a, -a, b, 1]; }
    else if (nivel === 11) { a = int(r, 2, 5); est = [a, a * 2, a * 4, a * 8]; certo = a * 16; fala = 'Qual número vem depois?'; extras = [a * 4, -a * 4, a * 2]; }
    else if (nivel === 12) { a = int(r, 2, 4); c = [a]; for (var i = 1; i < 5; i++) c.push(c[i - 1] * 2 - 1); certo = c[4]; est = c.slice(0, 4); fala = 'Qual número vem depois?'; extras = [1, -1, 2, c[3]]; }
    else if (nivel === 13) { a = pega(r, [12, 15, 18, 21, 24]); certo = a - a / 3; fala = 'Uma caixa tem ' + a + ' lápis. Você dá a terça parte para um amigo. Quantos lápis ficam na caixa?'; est = [a + ' lápis − ⅓']; extras = [a / 3 - certo, a - certo, 1, -1]; }
    else if (nivel === 14) { a = int(r, 1, 3); est = [a * a, (a + 1) * (a + 1), (a + 2) * (a + 2), (a + 3) * (a + 3)]; certo = (a + 4) * (a + 4); fala = 'Qual número vem depois?'; extras = [-(2 * a + 7), 2, -2, 1]; }
    else if (nivel === 15) { a = pega(r, [40, 60, 80, 120, 200]); b = pega(r, [25, 75]); certo = a * b / 100; fala = 'Quanto é ' + b + ' por cento de ' + a + '?'; est = [b + '% de ' + a]; extras = [a / 2 - certo, a / 10, -a / 10, 5]; }
    else { var s = [int(r, 1, 3), int(r, 2, 4)]; while (s.length < 6) s.push(s[s.length - 1] + s[s.length - 2]); certo = s[5]; est = s.slice(0, 5); fala = 'Qual número vem depois?'; extras = [-s[3], 1, -1, s[4] - s[3]]; }
    var dist = numOpcoes(r, certo, extras.concat([1, -1, 2, -2]));
    var o3 = montarOpcoes(r, { num: String(certo) }, dist.map(function (v) { return { num: String(v) }; }), 4);
    return { tipo: 'escolha', layout: 'numeros', fala: fala, estimulo: est.map(function (v) { return { num: String(v) }; }), opcoes: o3.opcoes, certo: o3.certo, lentoMs: 30000 };
  }

  // ------------------------------------------------------------------ Atenção — peixes (tipo flanker)
  var AT_LIMITE = [5000, 4500, 4000, 3500, 3200, 3000, 2700, 2400, 2200, 2000, 1800, 1600, 1400, 1250, 1100, 950];
  function itemAt(r, nivel) {
    var dir = pega(r, ['esq', 'dir']), outro = dir === 'esq' ? 'dir' : 'esq', cor = '#f2b100';
    var tipo = nivel === 1 ? 'sozinho' : nivel === 2 ? 'igual' : nivel <= 4 ? pega(r, ['igual', 'contra']) : nivel <= 8 ? pega(r, ['igual', 'contra', 'contra', 'neutro']) : pega(r, ['contra', 'contra', 'contra', 'igual']);
    var lado = tipo === 'sozinho' ? null : tipo === 'igual' ? { peixe: dir, c: cor } : tipo === 'contra' ? { peixe: outro, c: cor } : { f: 'losango', c: '#9aa8b8', t: 0.5 };
    var est = tipo === 'sozinho' ? [{ peixe: dir, c: cor }] : [lado, lado, { peixe: dir, c: cor }, lado, lado];
    return { tipo: 'escolha', layout: 'peixes', fala: 'Para que lado está nadando o peixe do MEIO?', estimulo: est, condicao: tipo,
      opcoes: [{ id: 'esq', fig: { seta: 'esq' } }, { id: 'dir', fig: { seta: 'dir' } }], certo: dir, limiteMs: AT_LIMITE[nivel - 1], lentoMs: Math.round(AT_LIMITE[nivel - 1] * 0.7) };
  }

  // ------------------------------------------------------------------ Flexibilidade — jogo das cartas (cor / forma)
  var FX_LIMITE = [0, 0, 0, 0, 9000, 8000, 7000, 7000, 6000, 5500, 5000, 4500, 4000, 3500, 3200, 3000];
  function itemFx(r, nivel) {
    var cs = amostra(r, NOMES_COR, 2), fs = amostra(r, ['estrela', 'coracao', 'triangulo', 'circulo', 'quadrado'], 2);
    var A = { f: fs[0], c: cs[0] }, B = { f: fs[1], c: cs[1] };
    var carta = r() < 0.5 ? { f: fs[0], c: cs[1] } : { f: fs[1], c: cs[0] };
    var regra, fala, borda = false;
    if (nivel <= 2) regra = 'cor';
    else if (nivel <= 4) regra = 'forma';
    else if (nivel <= 7) regra = pega(r, ['cor', 'forma']);
    else { borda = r() < 0.5; regra = borda ? 'forma' : 'cor'; }
    if (borda) carta.borda = true;
    if (nivel <= 7) fala = regra === 'cor' ? 'Jogo da COR. Coloque a carta junto da que tem a mesma cor.' : 'Jogo da FORMA. Coloque a carta junto da que tem a mesma forma.';
    else fala = 'Se a carta tiver borda preta, jogue pela FORMA. Se não tiver borda, jogue pela COR.';
    var certo = regra === 'cor' ? (carta.c === A.c ? 'a' : 'b') : (carta.f === A.f ? 'a' : 'b');
    var it = { tipo: 'escolha', layout: 'cartas', fala: fala, regra: regra, estimulo: [carta], opcoes: [{ id: 'a', fig: A }, { id: 'b', fig: B }], certo: certo, lentoMs: 12000 };
    if (FX_LIMITE[nivel - 1]) { it.limiteMs = FX_LIMITE[nivel - 1]; it.lentoMs = Math.round(FX_LIMITE[nivel - 1] * 0.7); }
    return it;
  }

  // ================================================================== TAREFAS NOVAS (pedido do Rinaldo, 30/10/2026)
  // Todas originais, geradas pelo programa; 16 níveis; instrução falada; respostas por figura sempre que possível.

  // ---------------------------------------------------------------- Controle de impulsos: toque ou não toque (go/no-go)
  // Toca quando aparece peixe; NÃO toca no tubarão. Mede impulsividade (toques no tubarão) e tempo de reação.
  var GN_LIMITE = [2600, 2400, 2200, 2000, 1850, 1700, 1550, 1400, 1280, 1160, 1050, 950, 860, 780, 700, 640];
  function itemGn(r, nivel) {
    var nogo = r() < 0.2 + nivel * 0.0125;
    var peixe = nivel >= 9 ? pega(r, ['🐟', '🐠', '🐡']) : '🐟';
    return { tipo: 'gonogo', layout: 'gonogo', fala: 'Toque na tela quando aparecer um PEIXE. Quando aparecer o TUBARÃO, não toque!',
      estimulo: [{ e: nogo ? '🦈' : peixe }], certo: nogo ? null : 'toque', limiteMs: GN_LIMITE[nivel - 1], lentoMs: GN_LIMITE[nivel - 1] };
  }
  // ---------------------------------------------------------------- Atenção contínua (bloco fixo, não é escada)
  // Toca só na estrela, por cerca de 2 minutos. Mede omissões (desatenção), toques errados e queda ao longo do tempo.
  function itemAc(r) {
    var alvo = r() < 0.3;
    return { tipo: 'gonogo', layout: 'gonogo', fala: 'Toque na tela só quando aparecer a ESTRELA.',
      estimulo: [{ e: alvo ? '⭐' : pega(r, ['🔵', '🔺', '🟩', '🟣', '🔶']) }], certo: alvo ? 'toque' : null, limiteMs: 1300, lentoMs: 1300 };
  }

  // ---------------------------------------------------------------- Consciência fonológica: rimas e sons
  var PAL = { 'pão': '🍞', 'mão': '✋', 'cão': '🐶', 'sol': '☀️', 'flor': '🌸', 'pé': '🦶', 'lua': '🌙', 'gato': '🐱', 'pato': '🦆', 'rato': '🐭', 'sapo': '🐸', 'dado': '🎲', 'bola': '⚽',
    'vela': '🕯️', 'casa': '🏠', 'chave': '🔑', 'meia': '🧦', 'foca': '🦭', 'boca': '👄', 'mala': '🧳', 'bala': '🍬', 'rua': '🛣️', 'bota': '👢', 'boné': '🧢', 'dente': '🦷', 'folha': '🍃',
    'fogo': '🔥', 'carro': '🚗', 'peixe': '🐟', 'leão': '🦁', 'limão': '🍋', 'avião': '✈️', 'balão': '🎈', 'janela': '🪟', 'panela': '🍲', 'abelha': '🐝', 'ovelha': '🐑', 'orelha': '👂',
    'coelho': '🐰', 'espelho': '🪞', 'joelho': '🦵', 'tambor': '🥁', 'trator': '🚜', 'jacaré': '🐊', 'café': '☕', 'baleia': '🐋', 'sereia': '🧜', 'sorvete': '🍦', 'foguete': '🚀',
    'caracol': '🐌', 'anzol': '🎣', 'sapato': '👞', 'cavalo': '🐴', 'galinha': '🐔', 'garfo': '🍴', 'macaco': '🐒', 'maçã': '🍎', 'tomate': '🍅', 'borboleta': '🦋', 'bicicleta': '🚲',
    'abacaxi': '🍍', 'hipopótamo': '🦛', 'elefante': '🐘', 'tartaruga': '🐢', 'telefone': '☎️', 'chocolate': '🍫', 'pirulito': '🍭', 'velha': '👵', 'mate': '🧉' };
  var SILABAS = { 'pão': 1, 'mão': 1, 'cão': 1, 'sol': 1, 'flor': 1, 'pé': 1, 'trem': 1, 'lua': 2, 'gato': 2, 'bola': 2, 'casa': 2, 'carro': 2, 'peixe': 2, 'dado': 2, 'sapo': 2,
    'janela': 3, 'sapato': 3, 'macaco': 3, 'tomate': 3, 'cavalo': 3, 'jacaré': 3, 'borboleta': 4, 'bicicleta': 4, 'elefante': 4, 'tartaruga': 4, 'chocolate': 4, 'hipopótamo': 5 };
  var RIMAS = [['pão', 'mão', 'cão', 'limão', 'avião', 'balão', 'leão'], ['gato', 'pato', 'rato', 'sapato'], ['vela', 'janela', 'panela'], ['abelha', 'ovelha', 'orelha'],
    ['coelho', 'espelho', 'joelho'], ['flor', 'tambor', 'trator'], ['pé', 'jacaré', 'café', 'boné'], ['baleia', 'sereia', 'meia'], ['sorvete', 'foguete'], ['sol', 'caracol', 'anzol'],
    ['foca', 'boca'], ['mala', 'bala'], ['lua', 'rua']];
  var INICIO = [['bola', 'bala', 'boca', 'bota', 'boné', 'baleia', 'balão'], ['casa', 'cavalo', 'café', 'carro', 'caracol', 'coelho'], ['pato', 'pão', 'panela', 'pé', 'peixe'],
    ['foca', 'fogo', 'folha', 'foguete'], ['sapo', 'sol', 'sapato', 'sorvete', 'sereia'], ['mão', 'mala', 'maçã', 'macaco', 'meia'], ['lua', 'leão', 'limão'], ['tomate', 'tambor', 'trator', 'tartaruga'], ['janela', 'jacaré', 'joelho']];
  var JUNTAR = { 'balão': 'ba... lão', 'bola': 'bo... la', 'gato': 'ga... to', 'sapo': 'sa... po', 'casa': 'ca... sa', 'dado': 'da... do', 'sapato': 'sa... pa... to', 'janela': 'ja... ne... la',
    'cavalo': 'ca... va... lo', 'macaco': 'ma... ca... co', 'tomate': 'to... ma... te', 'foguete': 'fo... gue... te', 'borboleta': 'bor... bo... le... ta', 'bicicleta': 'bi... ci... cle... ta',
    'abacaxi': 'a... ba... ca... xi', 'elefante': 'e... le... fan... te', 'tartaruga': 'tar... ta... ru... ga', 'chocolate': 'cho... co... la... te', 'pirulito': 'pi... ru... li... to' };
  var TROCAR = [['pato', 'pa', 'ga', 'gato'], ['gato', 'ga', 'ra', 'rato'], ['foca', 'fo', 'bo', 'boca'], ['mala', 'ma', 'ba', 'bala'], ['lua', 'lu', 'ru', 'rua'], ['rato', 'ra', 'pa', 'pato']];
  var TIRAR = [['sapato', 'sa', 'pato'], ['limão', 'li', 'mão'], ['ovelha', 'o', 'velha'], ['tomate', 'to', 'mate']];
  function grupoDe(lista, p) { return lista.filter(function (g) { return g.indexOf(p) >= 0; })[0] || []; }
  function figurasPal(r, certa, evitar, n) {
    var fora = Object.keys(PAL).filter(function (p) { return p !== certa && evitar.indexOf(p) < 0; });
    var o = montarOpcoes(r, { e: PAL[certa] }, amostra(r, fora, n + 2).map(function (p) { return { e: PAL[p] }; }), n);
    return o;
  }
  function itemFo(r, nivel) {
    var tipo = ['rima', 'rima', 'inicio', 'rima', 'inicio', 'juntar', 'intrusa', 'longa', 'juntar', 'longa', 'trocar', 'trocar', 'tirar', 'tirar', 'trocar', 'tirar'][nivel - 1];
    var n = nivel === 1 ? 2 : nivel <= 3 ? 3 : nivel >= 15 ? 5 : 4, a, b, g, o;
    if (tipo === 'rima' || tipo === 'inicio') {
      var lista = tipo === 'rima' ? RIMAS : INICIO;
      g = pega(r, lista.filter(function (x) { return x.length >= 2; })); var par = amostra(r, g, 2); a = par[0]; b = par[1];
      var evitar = tipo === 'rima' ? grupoDe(RIMAS, a) : grupoDe(INICIO, a).concat(grupoDe(RIMAS, a));
      o = figurasPal(r, b, evitar.concat([a]), n);
      return { tipo: 'escolha', layout: 'modelo', fala: tipo === 'rima' ? 'Qual figura rima com ' + a + '?' : 'Qual figura começa com o mesmo som de ' + a + '?', estimulo: [{ e: PAL[a] }], opcoes: o.opcoes, certo: o.certo, lentoMs: 15000 };
    }
    if (tipo === 'juntar') {
      var cand = Object.keys(JUNTAR).filter(function (p) { return nivel <= 6 ? JUNTAR[p].split('...').length === 2 : JUNTAR[p].split('...').length >= 3; });
      a = pega(r, cand); o = figurasPal(r, a, [], n);
      return { tipo: 'escolha', layout: 'figuras', fala: 'Junte os pedaços: ' + JUNTAR[a] + '. Que palavra é?', estimulo: [], opcoes: o.opcoes, certo: o.certo, lentoMs: 15000 };
    }
    if (tipo === 'intrusa') {
      g = pega(r, RIMAS.filter(function (x) { return x.length >= 3; })); var tres = amostra(r, g, 3);
      var outra = pega(r, Object.keys(PAL).filter(function (p) { return grupoDe(RIMAS, p) !== g && g.indexOf(p) < 0; }));
      o = montarOpcoes(r, { e: PAL[outra] }, tres.map(function (p) { return { e: PAL[p] }; }), 4);
      return { tipo: 'escolha', layout: 'figuras', fala: 'Diga o nome das figuras. Qual NÃO rima com as outras?', estimulo: [], opcoes: o.opcoes, certo: o.certo, lentoMs: 20000 };
    }
    if (tipo === 'longa') {
      var porTam = {}; Object.keys(SILABAS).forEach(function (p) { if (PAL[p]) (porTam[SILABAS[p]] = porTam[SILABAS[p]] || []).push(p); });
      var tams = amostra(r, Object.keys(porTam).map(Number), Math.min(n, Object.keys(porTam).length)).sort(function (x, y) { return y - x; });
      var palavras = tams.map(function (t) { return pega(r, porTam[t]); });
      o = montarOpcoes(r, { e: PAL[palavras[0]] }, palavras.slice(1).map(function (p) { return { e: PAL[p] }; }), palavras.length);
      return { tipo: 'escolha', layout: 'figuras', fala: 'Diga o nome das figuras. Qual palavra é a mais comprida, com mais pedaços?', estimulo: [], opcoes: o.opcoes, certo: o.certo, lentoMs: 20000 };
    }
    if (tipo === 'trocar') {
      var t = pega(r, TROCAR); o = figurasPal(r, t[3], [], n);
      return { tipo: 'escolha', layout: 'modelo', fala: 'Em ' + t[0] + ', troque o ' + t[1] + ' pelo ' + t[2] + '. Que palavra fica?', estimulo: [{ e: PAL[t[0]] }], opcoes: o.opcoes, certo: o.certo, lentoMs: 20000 };
    }
    var x = pega(r, TIRAR); o = figurasPal(r, x[2], [], n);
    return { tipo: 'escolha', layout: 'modelo', fala: 'Fale ' + x[0] + ' sem o ' + x[1] + '. Que palavra fica?', estimulo: [{ e: PAL[x[0]] }], opcoes: o.opcoes, certo: o.certo, lentoMs: 20000 };
  }

  // ---------------------------------------------------------------- Reconhecimento de emoções e situações sociais
  var EMO = { feliz: '😀', triste: '😢', bravo: '😠', medo: '😨', surpreso: '😲', nojo: '🤢', calmo: '😌', sono: '😴', vergonha: '😳', preocupado: '😟', confuso: '😕', decepcionado: '😞' };
  var NOME_EMO = { feliz: 'FELIZ', triste: 'TRISTE', bravo: 'BRAVO', medo: 'COM MEDO', surpreso: 'SURPRESO', nojo: 'COM NOJO' };
  var SIT1 = [['Ganhou um presente.', 'feliz'], ['O sorvete caiu no chão.', 'triste'], ['Alguém pegou o brinquedo sem pedir.', 'bravo'], ['Ouviu um barulho forte no escuro.', 'medo'],
    ['Abriu a porta e todos gritaram: surpresa!', 'surpreso'], ['Sentiu um cheiro muito ruim.', 'nojo']];
  var SIT2 = [['Tropeçou e caiu na frente da turma.', 'vergonha'], ['A mãe está demorando muito para chegar.', 'preocupado'], ['A professora explicou e a criança não entendeu nada.', 'confuso'],
    ['Ia ao parque, mas choveu e não pôde ir.', 'decepcionado'], ['Brincou o dia todo e já é noite.', 'sono'], ['Está deitada ouvindo uma música tranquila.', 'calmo']];
  var MENTE = [['Ana guardou o chocolate na caixa e saiu. O irmão mudou o chocolate para a gaveta. Quando Ana voltar, onde ela vai procurar primeiro?', '📦', ['🗄️', '🎒', '🛏️']],
    ['Pedro escondeu a bola atrás do sofá e foi lanchar. A irmã levou a bola para o cesto. Onde Pedro acha que a bola está?', '🛋️', ['🧺', '🚪', '📦']],
    ['Choveu o passeio inteiro e o menino disse: que dia lindo! Como ele está de verdade?', '😒', ['😀', '😲', '😴']],
    ['O amigo perdeu o jogo, ficou com os olhos cheios de lágrimas, mas disse que está tudo bem. Como ele se sente de verdade?', '😞', ['😀', '😠', '😴']]];
  function itemEm(r, nivel) {
    var o, alvo;
    if (nivel <= 5) {
      var pool = nivel === 1 ? ['feliz', 'triste'] : nivel === 2 ? ['feliz', 'triste', 'bravo'] : nivel === 3 ? ['feliz', 'triste', 'bravo', 'medo'] : Object.keys(NOME_EMO);
      alvo = nivel === 5 ? pega(r, ['surpreso', 'nojo', 'medo']) : pega(r, pool);
      o = montarOpcoes(r, { e: EMO[alvo] }, amostra(r, pool.filter(function (x) { return x !== alvo; }), 4).map(function (x) { return { e: EMO[x] }; }), Math.min(nivel <= 1 ? 2 : nivel <= 3 ? 3 : 4, pool.length));
      return { tipo: 'escolha', layout: 'figuras', fala: 'Toque no rosto ' + NOME_EMO[alvo] + '.', estimulo: [], opcoes: o.opcoes, certo: o.certo, lentoMs: 12000 };
    }
    if (nivel <= 12) {
      var s = nivel <= 8 ? pega(r, SIT1) : pega(r, SIT2), lista = nivel <= 8 ? Object.keys(NOME_EMO) : Object.keys(EMO);
      o = montarOpcoes(r, { e: EMO[s[1]] }, amostra(r, lista.filter(function (x) { return x !== s[1]; }), 4).map(function (x) { return { e: EMO[x] }; }), 4);
      return { tipo: 'escolha', layout: 'figuras', fala: s[0] + ' Como a criança se sente?', estimulo: [], opcoes: o.opcoes, certo: o.certo, lentoMs: 20000 };
    }
    var m = pega(r, MENTE);
    o = montarOpcoes(r, { e: m[1] }, m[2].map(function (x) { return { e: x }; }), 4);
    return { tipo: 'escolha', layout: 'figuras', fala: m[0], estimulo: [], opcoes: o.opcoes, certo: o.certo, lentoMs: 30000 };
  }

  // ---------------------------------------------------------------- Caminhos: siga a linha do ratinho (rastreio visual e planejamento)
  var CM = [[2, 1], [2, 2], [3, 2], [3, 3], [3, 4], [3, 5], [4, 4], [4, 5], [4, 6], [4, 7], [5, 6], [5, 7], [5, 8], [5, 9], [5, 10], [5, 12]];
  function itemCm(r, nivel) {
    var n = CM[nivel - 1][0], qt = CM[nivel - 1][1], ys = [], degraus = [];
    // degraus em alturas diferentes (espaço mínimo pequeno e limite de tentativas: nunca trava)
    for (var tent = 0; ys.length < qt && tent < 500; tent++) { var y = Math.round((0.12 + r() * 0.76) * 100) / 100; if (ys.every(function (v) { return Math.abs(v - y) >= 0.04; })) ys.push(y); }
    for (var f = 0; ys.length < qt; f++) ys.push(Math.round((0.1 + f * 0.8 / qt) * 100) / 100 + 0.005);
    ys.sort(function (a, b) { return a - b; }).forEach(function (yy) { degraus.push({ c: int(r, 0, n - 2), y: yy }); });
    var inicio = int(r, 0, n - 1), pos = inicio;
    degraus.forEach(function (d) { if (d.c === pos) pos++; else if (d.c === pos - 1) pos--; });
    var premios = amostra(r, ['🧀', '🍎', '⚽', '🎈', '🍪', '🌸'], n);
    return { tipo: 'escolha', layout: 'caminho', fala: 'Siga o caminho do ratinho com os olhos. Onde ele vai chegar?', estimulo: [{ escada: { n: n, degraus: degraus, inicio: inicio } }],
      opcoes: premios.map(function (e, i) { return { id: 'c' + i, fig: { e: e } }; }), certo: 'c' + pos, lentoMs: 8000 + qt * 1500 };
  }

  // ---------------------------------------------------------------- Números ouvidos (ordem direta e inversa)
  var SPAN_D = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 7, 8], SPAN_I = [2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6, 6];
  function digitos(r, n) { var s = []; while (s.length < n) { var d = int(r, 1, 9); if (s.indexOf(d) < 0) s.push(d); } return s; }
  function itemDg(r, nivel) {
    var s = digitos(r, SPAN_D[nivel - 1]);
    return { tipo: 'digitos', layout: 'digitos', fala: 'Ouça os números. Depois toque neles na mesma ordem.', sequencia: s, inverso: false, passoMs: 1000, certo: s, lentoMs: 4000 + s.length * 1800 };
  }
  function itemDi(r, nivel) {
    var s = digitos(r, SPAN_I[nivel - 1]);
    return { tipo: 'digitos', layout: 'digitos', fala: 'Ouça os números. Depois toque neles de trás para frente.', sequencia: s, inverso: true, passoMs: 1000, certo: s.slice().reverse(), lentoMs: 6000 + s.length * 2200 };
  }

  // ---------------------------------------------------------------- Leitura: palavras (decodificação) e frases (compreensão)
  var LE_PAL = [
    [['PÉ', '🦶'], ['LUA', '🌙'], ['BOLA', '⚽'], ['PATO', '🦆'], ['DADO', '🎲'], ['CASA', '🏠']],
    [['GATO', '🐱'], ['SAPO', '🐸'], ['MALA', '🧳'], ['VELA', '🕯️'], ['FOCA', '🦭'], ['BOCA', '👄']],
    [['SAPATO', '👞'], ['CAVALO', '🐴'], ['PANELA', '🍲'], ['JANELA', '🪟'], ['MACACO', '🐒'], ['TOMATE', '🍅']],
    [['PÃO', '🍞'], ['MÃO', '✋'], ['LIMÃO', '🍋'], ['BALÃO', '🎈'], ['CHAVE', '🔑'], ['PEIXE', '🐟']],
    [['FLOR', '🌸'], ['TREM', '🚆'], ['PRATO', '🍽️'], ['TRATOR', '🚜'], ['ESTRELA', '⭐'], ['BRUXA', '🧙']],
    [['BORBOLETA', '🦋'], ['BICICLETA', '🚲'], ['ABACAXI', '🍍'], ['ELEFANTE', '🐘'], ['TARTARUGA', '🐢'], ['CHOCOLATE', '🍫']],
    [['HIPOPÓTAMO', '🦛'], ['GUARDA-CHUVA', '☂️'], ['PIRULITO', '🍭'], ['COMPUTADOR', '💻'], ['HELICÓPTERO', '🚁'], ['ESQUILO', '🐿️']]];
  var LE_FRASE = [
    [['Toque no animal que voa.', '🐦', ['🐟', '🐶', '🐢']], ['Toque na fruta amarela.', '🍌', ['🍎', '🍇', '🍓']], ['Toque no que usamos para ver as horas.', '⏰', ['📱', '🔑', '💡']], ['Toque no que tem rodas.', '🚗', ['🏠', '🌳', '🪑']]],
    [['Toque no animal que vive na água e tem oito braços.', '🐙', ['🦀', '🐟', '🐬']], ['Toque no que usamos para escrever no caderno.', '✏️', ['🔨', '🥄', '✂️']], ['Toque no que esquenta a comida.', '🔥', ['❄️', '💧', '🌬️']], ['Toque na roupa que usamos nos pés.', '🧦', ['🧢', '🧤', '👕']]],
    [['Toque no objeto que usamos quando chove para não nos molharmos.', '☂️', ['🕶️', '🧣', '🎒']], ['Toque no animal que tem tromba e orelhas muito grandes.', '🐘', ['🦒', '🦏', '🐄']], ['Toque no lugar onde as crianças vão para estudar.', '🏫', ['🏥', '🏪', '🏠']], ['Toque no que a gente usa para ligar para outra pessoa.', '📱', ['📺', '📷', '💻']]],
    [['Toque no que NÃO é um meio de transporte.', '🍎', ['🚗', '✈️', '🚲']], ['Toque no animal que NÃO vive na água.', '🐫', ['🐟', '🐙', '🐬']], ['Toque na figura que NÃO é uma fruta.', '🥕', ['🍌', '🍇', '🍍']], ['Toque no objeto que NÃO usamos para comer.', '🔨', ['🥄', '🍴', '🥢']]]];
  function itemLe(r, nivel) {
    var o;
    if (nivel <= 7) {
      var lista = LE_PAL[nivel - 1], p = pega(r, lista), outros = lista.concat(LE_PAL[Math.max(0, nivel - 2)]).filter(function (x) { return x[0] !== p[0]; });
      o = montarOpcoes(r, { e: p[1] }, amostra(r, outros, 5).map(function (x) { return { e: x[1] }; }), nivel <= 2 ? 3 : 4);
      return { tipo: 'escolha', layout: 'leitura', fala: 'Leia e toque na figura certa.', estimulo: [{ texto: p[0] }], opcoes: o.opcoes, certo: o.certo, lentoMs: 6000 + p[0].length * 900 };
    }
    var f = pega(r, LE_FRASE[nivel <= 9 ? 0 : nivel <= 11 ? 1 : nivel <= 13 ? 2 : 3]);
    o = montarOpcoes(r, { e: f[1] }, f[2].map(function (x) { return { e: x }; }), 4);
    return { tipo: 'escolha', layout: 'leitura', fala: 'Leia e toque na figura certa.', estimulo: [{ texto: f[0], frase: true }], opcoes: o.opcoes, certo: o.certo, lentoMs: 8000 + f[0].length * 250 };
  }

  // ---------------------------------------------------------------- Planejamento: torre (mover bolinhas até ficar igual ao modelo)
  var TORRE_CAP = [3, 2, 1], TORRE_MIN = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8];
  function torreEstados() {
    var bolas = ['vermelho', 'azul', 'verde'], res = [];
    (function colocar(i, pinos) {
      if (i === bolas.length) {
        // cada pino pode ter as bolas em qualquer ordem: gera as permutações dentro de cada pino
        res.push(pinos.map(function (p) { return p.slice(); })); return;
      }
      for (var k = 0; k < 3; k++) if (pinos[k].length < TORRE_CAP[k]) { pinos[k].push(bolas[i]); colocar(i + 1, pinos); pinos[k].pop(); }
    })(0, [[], [], []]);
    var todos = {};
    res.forEach(function (st) {
      (function permutar(p, acc) {
        if (p === 3) { todos[JSON.stringify(acc)] = acc; return; }
        permutacoes(st[p]).forEach(function (perm) { permutar(p + 1, acc.concat([perm])); });
      })(0, []);
    });
    return Object.keys(todos).map(function (k) { return todos[k]; });
  }
  function permutacoes(a) { if (a.length <= 1) return [a.slice()]; var r = []; a.forEach(function (x, i) { permutacoes(a.slice(0, i).concat(a.slice(i + 1))).forEach(function (p) { r.push([x].concat(p)); }); }); return r; }
  function torreMover(st, de, para) {
    if (!st[de] || !st[para] || !st[de].length || st[para].length >= TORRE_CAP[para] || de === para) return null;
    var n = st.map(function (p) { return p.slice(); }); n[para].push(n[de].pop()); return n;
  }
  function torreDistancias(inicio) {
    var dist = {}, fila = [inicio]; dist[JSON.stringify(inicio)] = 0;
    while (fila.length) {
      var st = fila.shift(), d = dist[JSON.stringify(st)];
      for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) { var n = torreMover(st, a, b); if (n && dist[JSON.stringify(n)] == null) { dist[JSON.stringify(n)] = d + 1; fila.push(n); } }
    }
    return dist;
  }
  var TORRE_TODOS = null;
  function itemTo(r, nivel) {
    TORRE_TODOS = TORRE_TODOS || torreEstados();
    var alvo = TORRE_MIN[nivel - 1], inicio, meta;
    for (var t = 0; t < 200; t++) {
      inicio = pega(r, TORRE_TODOS); var dist = torreDistancias(inicio);
      var cand = Object.keys(dist).filter(function (k) { return dist[k] === alvo; });
      if (cand.length) { meta = JSON.parse(pega(r, cand)); break; }
    }
    return { tipo: 'torre', layout: 'torre', fala: 'Mova as bolinhas para ficar igual ao modelo, com o menor número de jogadas.', inicio: inicio, meta: meta, capacidades: TORRE_CAP,
      minimo: alvo, maxMov: alvo * 2 + 3, certo: alvo, lentoMs: 12000 + alvo * 7000 };
  }
  // confere no servidor as jogadas feitas (não confia só no "resolvi" da tela)
  function torreConferir(it, jogadas) {
    var st = it.inicio, n = 0;
    (Array.isArray(jogadas) ? jogadas : []).slice(0, 40).forEach(function (j) { var x = st && torreMover(st, Number(j[0]), Number(j[1])); if (x) { st = x; n++; } });
    return { resolveu: JSON.stringify(st) === JSON.stringify(it.meta), movimentos: n };
  }

  // ---------------------------------------------------------------- Ligar os pontos (atenção alternada, tipo "trilhas")
  var TL = [[3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [4, 1], [6, 1], [6, 1], [8, 1], [8, 1], [10, 1], [10, 1], [12, 1], [12, 1], [14, 1]];
  function itemTl(r, nivel) {
    var n = TL[nivel - 1][0], alternar = !!TL[nivel - 1][1], ordem = [], letras = 'ABCDEFGHIJ';
    for (var i = 0; i < n; i++) ordem.push(alternar ? (i % 2 === 0 ? String(i / 2 + 1) : letras[(i - 1) / 2]) : String(i + 1));
    var pts = [];
    for (var k = 0; k < 400 && pts.length < n; k++) {
      var p = { x: Math.round((0.08 + r() * 0.84) * 100) / 100, y: Math.round((0.1 + r() * 0.8) * 100) / 100 };
      if (pts.every(function (q) { return Math.hypot(q.x - p.x, q.y - p.y) > (n > 10 ? 0.15 : 0.19); })) pts.push(p);
    }
    while (pts.length < n) pts.push({ x: Math.round(r() * 80 + 10) / 100, y: Math.round(r() * 80 + 10) / 100 });
    return { tipo: 'pontos', layout: 'pontos', fala: alternar ? 'Toque nos círculos em ordem, trocando número e letra: um, A, dois, B, e assim por diante.' : 'Toque nos números em ordem: um, dois, três, e assim por diante.',
      pontos: embaralha(r, ordem).map(function (t, i) { return { t: t, x: pts[i].x, y: pts[i].y }; }), certo: ordem, lentoMs: Math.round(n * (2300 - nivel * 70)) };
  }
  function pontosConferir(it, toques) {
    var k = 0, erros = 0;
    (Array.isArray(toques) ? toques : []).slice(0, 80).forEach(function (t) { if (k < it.certo.length && String(t) === it.certo[k]) k++; else erros++; });
    return { completou: k === it.certo.length, erros: erros };
  }

  // ---------------------------------------------------------------- Categorias e semelhanças (raciocínio verbal com figuras)
  var CAT = { frutas: ['🍎', '🍌', '🍇', '🍓', '🍍', '🍉', '🍐', '🍒'], veiculos: ['🚗', '🚌', '🚲', '✈️', '🚂', '🚢', '🚁', '🛵'], bichos: ['🐶', '🐱', '🐴', '🐮', '🐷', '🐑', '🦁', '🐘'],
    aves: ['🐦', '🦆', '🦅', '🦉', '🐔', '🦜', '🐧'], mar: ['🐟', '🐠', '🐙', '🦀', '🐬', '🐳'], roupas: ['👕', '👖', '👗', '🧥', '🧣'], calcados: ['👟', '👞', '👢', '🩴', '👠'],
    ferramentas: ['🔨', '🪛', '🔧', '🪚', '⛏️'], instrumentos: ['🎸', '🥁', '🎺', '🎻', '🎹'], cozinha: ['🥄', '🍴', '🔪', '🍳', '🥣'], bolas: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐'],
    clima: ['☀️', '🌧️', '❄️', '🌈', '⛈️'], insetos: ['🐝', '🐞', '🦋', '🐜', '🦗'], legumes: ['🥕', '🥦', '🌽', '🥔', '🧅', '🥒'], moveis: ['🛏️', '🪑', '🛋️', '🚪'] };
  var LONGE = [['frutas', 'veiculos'], ['bichos', 'instrumentos'], ['roupas', 'clima'], ['bolas', 'legumes'], ['ferramentas', 'frutas'], ['mar', 'moveis']];
  var PERTO = [['bichos', 'aves'], ['frutas', 'legumes'], ['ferramentas', 'cozinha'], ['roupas', 'calcados'], ['aves', 'insetos'], ['mar', 'bichos'], ['instrumentos', 'bolas']];
  var ANALOGIAS = [['🐄', '🥛', '🐔', '🥚', ['🐣', '🌽', '🍳']], ['🐝', '🍯', '🐄', '🥛', ['🌾', '🐮', '🧀']], ['🌧️', '☂️', '☀️', '🕶️', ['🌈', '🌡️', '⛱️']],
    ['✋', '🧤', '🦶', '🧦', ['👟', '🦵', '🧣']], ['🐣', '🐔', '🐛', '🦋', ['🐜', '🌸', '🐞']], ['🐟', '🌊', '🐪', '🏜️', ['🌳', '🏔️', '🌊']],
    ['🔑', '🔒', '✏️', '📝', ['📏', '✂️', '📚']], ['🍞', '🥖', '🍇', '🍷', ['🍎', '🧃', '🍉']], ['🌱', '🌳', '👶', '🧓', ['👦', '🍼', '🌳']], ['🎣', '🐟', '🏹', '🎯', ['🪃', '⚽', '🛡️']]];
  function itemRv(r, nivel) {
    var o;
    if (nivel <= 6) {
      var par = pega(r, nivel <= 3 ? LONGE : PERTO), cats = r() < 0.5 ? par : [par[1], par[0]];
      var tres = amostra(r, CAT[cats[0]], 3), intruso = pega(r, CAT[cats[1]]);
      o = montarOpcoes(r, { e: intruso }, tres.map(function (e) { return { e: e }; }), nivel <= 1 ? 3 : 4);
      return { tipo: 'escolha', layout: 'figuras', fala: 'Qual figura NÃO combina com as outras?', estimulo: [], opcoes: o.opcoes, certo: o.certo, lentoMs: 15000 };
    }
    if (nivel <= 10) {
      var nomes = Object.keys(CAT), c = pega(r, nivel <= 8 ? ['frutas', 'veiculos', 'bichos', 'roupas', 'bolas', 'instrumentos'] : nomes), dois = amostra(r, CAT[c], 3);
      var vizinhos = PERTO.filter(function (p) { return p.indexOf(c) >= 0; }).map(function (p) { return p[0] === c ? p[1] : p[0]; });
      var outras = (nivel >= 9 && vizinhos.length ? vizinhos : nomes.filter(function (x) { return x !== c; }));
      o = montarOpcoes(r, { e: dois[2] }, amostra(r, outras, 3).map(function (x) { return { e: pega(r, CAT[x]) }; }), 4);
      return { tipo: 'escolha', layout: 'modelo2', fala: 'Qual figura combina com estas duas?', estimulo: [{ e: dois[0] }, { e: dois[1] }], opcoes: o.opcoes, certo: o.certo, lentoMs: 15000 };
    }
    var a = pega(r, nivel <= 13 ? ANALOGIAS.slice(0, 6) : ANALOGIAS);
    o = montarOpcoes(r, { e: a[3] }, a[4].map(function (e) { return { e: e }; }), 4);
    return { tipo: 'escolha', layout: 'analogia', fala: 'A primeira figura combina com a segunda. A terceira combina com qual?', estimulo: [{ e: a[0] }, { e: a[1] }, { e: a[2] }, null], opcoes: o.opcoes, certo: o.certo, lentoMs: 25000 };
  }

  // ---------------------------------------------------------------- Memória de figuras (com recordação no fim da sessão)
  var ML_K = [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9];
  var ML_POOL = ['🍎', '🚗', '🐶', '⚽', '🏠', '🌸', '🔑', '🎈', '🐱', '✈️', '🍌', '🎸', '⏰', '🌙', '🐟', '🍕', '👟', '📚', '🚲', '🐢', '☂️', '🍦', '🦋', '🔔', '🎁', '🐘', '🍇', '🧸',
    '🚂', '🌵', '🍪', '🦊', '📷', '🧩', '🥕', '🐧', '🛶', '🍓', '🎩', '🪁', '🦒', '🍉', '🔦', '🐝', '🥁', '🧢', '🌽', '🦀'];
  function montarReconhecer(r, alvos, n) {
    var novos = amostra(r, ML_POOL.filter(function (e) { return alvos.indexOf(e) < 0; }), n);
    var ids = 'abcdefghijklmnopqrst'.split(''), todos = embaralha(r, alvos.map(function (e) { return { e: e, a: true }; }).concat(novos.map(function (e) { return { e: e, a: false }; })));
    var certo = [];
    var opcoes = todos.map(function (x, i) { if (x.a) certo.push(ids[i]); return { id: ids[i], fig: { e: x.e } }; });
    return { opcoes: opcoes, certo: certo };
  }
  function itemMl(r, nivel) {
    var k = ML_K[nivel - 1], alvos = amostra(r, ML_POOL, k), m = montarReconhecer(r, alvos, k);
    return { tipo: 'reconhecer', layout: 'reconhecer', fala: 'Olhe as figuras com atenção. Depois toque nas que você viu e toque em Pronto.', mostrar: alvos.map(function (e) { return { e: e }; }),
      mostrarMs: nivel <= 8 ? 1500 : 1100, opcoes: m.opcoes, certo: m.certo, margem: k >= 6 ? 1 : 0, lentoMs: 8000 + k * 3000, alvosFig: alvos };
  }
  // recordação tardia: as figuras do 1º item de memória, no fim da sessão, sem mostrar de novo
  function itemTardio(alvos, semente) {
    var r = rng(semente + '|tardia'), m = montarReconhecer(r, alvos, alvos.length);
    return { tipo: 'reconhecer', layout: 'reconhecer', tardia: true, fim: 'ml', dominio: 'ml', nivel: 0, id: 'it-tardia-' + hash(semente).toString(36),
      fala: 'Lembra das figuras que você memorizou lá no começo? Toque nelas e depois toque em Pronto.', mostrar: [], opcoes: m.opcoes, certo: m.certo, margem: 0, lentoMs: 30000 };
  }
  function reconhecerConferir(it, sel) {
    sel = Array.isArray(sel) ? sel.map(String) : [];
    var acertos = sel.filter(function (s) { return it.certo.indexOf(s) >= 0; }).length, falsos = sel.filter(function (s) { return it.certo.indexOf(s) < 0; }).length;
    return { acertos: acertos, falsos: falsos, total: it.certo.length };
  }

  // ================================================================== AMPLIAÇÃO (pedido do Rinaldo, 30/10/2026: "faça todos")
  // Tarefas novas: memória de palavras, fluência verbal, leitura em voz alta e compreensão, ditado, matemática escolar,
  // cognição social (teoria da mente), cópia de figura, desenho do relógio, toque rápido, tempo de reação e orientação.
  // Algumas são PONTUADAS PELO AVALIADOR (tipo 'avaliador'): o paciente fala ou desenha e o avaliador marca no celular.
  // Todas são originais do NeuroTrilha (inspiradas em procedimentos clássicos da neuropsicologia), sem normas brasileiras próprias.

  function opcoesTexto(r, certa, erradas) {
    var lista = embaralha(r, [certa].concat(erradas)), ids = 'abcdefgh'.split(''), certo = null;
    var opcoes = lista.map(function (t, k) { if (t === certa) certo = ids[k]; return { id: ids[k], fig: { texto: t } }; });
    return { opcoes: opcoes, certo: certo };
  }
  function contar(texto) { return String(texto).split(/\s+/).filter(function (p) { return /[A-Za-zÀ-ú0-9]/.test(p); }).length; }

  // ---------------------------------------------------------------- Memória de palavras (lista ouvida várias vezes + lembrar no fim)
  var MP_POOL = [['gato', '🐱'], ['bola', '⚽'], ['casa', '🏠'], ['flor', '🌸'], ['pão', '🍞'], ['carro', '🚗'], ['sol', '☀️'], ['peixe', '🐟'], ['livro', '📚'], ['chave', '🔑'],
    ['balão', '🎈'], ['sapato', '👟'], ['cavalo', '🐴'], ['maçã', '🍎'], ['relógio', '⏰'], ['barco', '⛵'], ['trem', '🚂'], ['vaca', '🐄'], ['uva', '🍇'], ['cadeira', '🪑'],
    ['dente', '🦷'], ['lápis', '✏️'], ['estrela', '⭐'], ['foguete', '🚀'], ['tambor', '🥁'], ['leão', '🦁'], ['urso', '🐻'], ['bolo', '🎂'], ['abacaxi', '🍍'], ['tesoura', '✂️'],
    ['sino', '🔔'], ['violão', '🎸'], ['galinha', '🐔'], ['meia', '🧦'], ['cama', '🛏️'], ['martelo', '🔨'], ['presente', '🎁'], ['avião', '✈️'], ['lua', '🌙'], ['árvore', '🌳'],
    ['cenoura', '🥕'], ['coelho', '🐰'], ['guarda-chuva', '☂️'], ['óculos', '👓'], ['vela', '🕯️'], ['sorvete', '🍦'], ['tartaruga', '🐢'], ['borboleta', '🦋']];
  function mpEnsaios(ctx) { return ctx && (ctx.curta || ctx.idade < 8) ? 3 : 5; }
  function itemMp(r, nivel, ctx) {
    ctx = ctx || {};
    var bloco = ctx.bloco || { lista: amostra(r, MP_POOL, ctx.idade < 8 ? 8 : 10) };
    var ensaio = (ctx.indice || 0) + 1;
    return { tipo: 'avaliador', layout: 'lista', ensaio: ensaio, bloco: bloco, lista: bloco.lista.map(function (p) { return p[0]; }),
      fala: ensaio === 1 ? 'Vou falar algumas palavras. Escute com atenção. Quando eu terminar, diga todas as palavras que você lembrar, em qualquer ordem.'
        : 'Vou falar as mesmas palavras de novo. Depois diga todas que lembrar, inclusive as que você já disse.',
      pontuacao: { modo: 'palavras', palavras: bloco.lista.map(function (p) { return p[0]; }) } };
  }
  // no fim da sessão: lembrar sem ouvir de novo (o avaliador marca) e depois reconhecer entre figuras
  function itemFimMp(tipo, bloco, semente) {
    var r = rng(semente), lista = bloco.lista;
    if (tipo === 'mp-evoc') return { tipo: 'avaliador', layout: 'falar', fim: tipo, tardia: true, dominio: 'mp', nivel: 0, id: 'it-mpevoc-' + hash(semente).toString(36), icone: '🧠',
      fala: 'Lembra das palavras que eu falei várias vezes lá no começo? Diga todas que você lembrar.', pontuacao: { modo: 'palavras', palavras: lista.map(function (p) { return p[0]; }) } };
    var novos = amostra(r, MP_POOL.filter(function (p) { return !lista.some(function (q) { return q[0] === p[0]; }); }), lista.length);
    var ids = 'abcdefghijklmnopqrst'.split(''), todos = embaralha(r, lista.map(function (p) { return { p: p, a: true }; }).concat(novos.map(function (p) { return { p: p, a: false }; })));
    var certo = [], opcoes = todos.map(function (x, i) { if (x.a) certo.push(ids[i]); return { id: ids[i], fig: { e: x.p[1], rotulo: x.p[0] } }; });
    return { tipo: 'reconhecer', layout: 'reconhecer', fim: tipo, tardia: true, dominio: 'mp', nivel: 0, id: 'it-mprec-' + hash(semente).toString(36),
      fala: 'Agora toque nas figuras das palavras que eu falei. Depois toque em Pronto.', mostrar: [], opcoes: opcoes, certo: certo, margem: 0, lentoMs: 60000 };
  }
  function itemFim(tipo, sessao, semente) {
    if (tipo === 'ml') return itemTardio(sessao.mlAlvos, semente);
    var it = itemFimMp(tipo, (sessao.blocos || {}).mp, semente); it.mostradoEm = null; return it;
  }

  // ---------------------------------------------------------------- Fluência verbal (falar palavras em 1 minuto; o avaliador conta)
  function itemFv(r, nivel, ctx) {
    var i = (ctx && ctx.indice) || 0;
    if (i === 0) return { tipo: 'avaliador', layout: 'falar', icone: '🐾', rotulo: 'ANIMAIS', duracaoMs: 60000, categoria: 'animais',
      fala: 'Agora diga o nome de todos os animais que você conseguir lembrar, o mais rápido que puder. Pode ser bicho de casa, da fazenda, da floresta ou do mar. Você tem um minuto. Pode começar!',
      pontuacao: { modo: 'contador', regra: 'Conta cada animal diferente. Não conta repetição. Raça ou filhote do mesmo animal conta uma vez só.' } };
    return { tipo: 'avaliador', layout: 'falar', icone: 'F', rotulo: 'PALAVRAS COM F', duracaoMs: 60000, categoria: 'letra F',
      fala: 'Agora diga todas as palavras que começam com a letra F, como faca. Não vale nome de pessoa nem de cidade, e não vale a mesma palavra com outro final. Você tem um minuto. Pode começar!',
      pontuacao: { modo: 'contador', regra: 'Conta palavras com F. Não conta nomes próprios, repetições nem a mesma palavra com outro final (ex.: feliz, felizes).' } };
  }

  // ---------------------------------------------------------------- Leitura em voz alta e compreensão do texto
  var TEXTOS = [
    { faixa: 7, t: 'O gato Tito mora numa casa azul. Todo dia ele dorme na janela. Hoje choveu e Tito ficou molhado. A menina Lia secou o gato com uma toalha. Depois deu leite para ele.',
      q: [['Onde o Tito dorme todo dia?', 'Na janela', ['Na cama', 'No telhado', 'Na rua']], ['Por que o Tito ficou molhado?', 'Porque choveu', ['Porque caiu no rio', 'Porque tomou banho', 'Porque brincou com a mangueira']], ['O que a Lia deu para o gato?', 'Leite', ['Peixe', 'Água', 'Pão']]] },
    { faixa: 7, t: 'Pedro ganhou uma bicicleta vermelha no aniversário. Ele quis andar logo no parque. No caminho, a corrente saiu. O pai de Pedro consertou a bicicleta e os dois voltaram rindo para casa.',
      q: [['Qual é a cor da bicicleta?', 'Vermelha', ['Azul', 'Verde', 'Amarela']], ['O que aconteceu no caminho?', 'A corrente saiu', ['O pneu furou', 'Pedro caiu', 'Começou a chover']], ['Quem consertou a bicicleta?', 'O pai', ['O Pedro', 'A mãe', 'Um amigo']]] },
    { faixa: 9, t: 'Na escola de Ana, os alunos fizeram uma horta. Cada turma ficou com um canteiro. A turma de Ana plantou alface e cenoura e regou as plantas todas as manhãs. Um dia, uma lagarta começou a comer as folhas da alface. A professora explicou que não precisavam de veneno: bastava tirar as lagartas com cuidado e levá-las para longe. No fim do mês, a turma colheu as verduras e fez uma salada para a escola inteira.',
      q: [['O que a turma de Ana plantou?', 'Alface e cenoura', ['Tomate e milho', 'Feijão e arroz', 'Só flores']], ['Que problema apareceu na horta?', 'Uma lagarta comia as folhas', ['Faltou água', 'O canteiro quebrou', 'Choveu demais']], ['Por que não usaram veneno?', 'Dava para resolver tirando as lagartas', ['O veneno tinha acabado', 'A lagarta era bonita', 'A horta já estava pronta']]] },
    { faixa: 9, t: 'Miguel queria muito ver o mar. Ele morava no interior e só conhecia o mar pela televisão. Nas férias, a avó o levou de ônibus até a praia. A viagem durou a noite inteira. Quando chegaram, Miguel correu até a areia, mas parou de repente: as ondas eram muito maiores do que ele imaginava. A avó segurou sua mão e os dois entraram juntos na água rasa. No fim do dia, Miguel não queria mais ir embora.',
      q: [['Como Miguel conhecia o mar antes da viagem?', 'Pela televisão', ['Por livros', 'Por fotos da avó', 'Ele já tinha ido']], ['Por que Miguel parou de repente na areia?', 'As ondas eram maiores do que imaginava', ['A areia estava quente', 'Viu um peixe', 'Estava cansado']], ['Como Miguel se sentiu no fim do dia?', 'Gostou muito da praia', ['Ficou com medo', 'Ficou entediado', 'Ficou com raiva']]] },
    { faixa: 11, t: 'As abelhas fazem grande parte da polinização das plantas que usamos como alimento. Ao visitar as flores para coletar néctar, elas carregam o pólen de uma flor para outra, o que permite a formação dos frutos. Nos últimos anos, cientistas observaram uma diminuição no número de abelhas em várias regiões do mundo. Entre as causas estão o uso intenso de agrotóxicos, o desmatamento e as mudanças no clima. Se as abelhas desaparecessem, alimentos como maçã, morango e café ficariam mais raros e mais caros. Por isso, algumas cidades já incentivam o cultivo de flores e a criação de abelhas sem ferrão.',
      q: [['Qual é a ideia principal do texto?', 'As abelhas são importantes e estão diminuindo', ['As abelhas são perigosas', 'O café ficou mais barato', 'Como fazer mel em casa']], ['Por que a polinização é importante?', 'Permite a formação dos frutos', ['Deixa as flores coloridas', 'Produz o mel', 'Afasta as pragas']], ['Sem abelhas, o que aconteceria com o preço do morango?', 'Ficaria mais caro', ['Ficaria mais barato', 'Não mudaria', 'O morango ficaria maior']]] },
    { faixa: 11, t: 'Em 1969, pela primeira vez, seres humanos pisaram na Lua. A missão Apollo 11 levou três astronautas, mas apenas dois desceram até a superfície; o terceiro ficou em órbita, pilotando a nave que os traria de volta. A viagem de ida durou cerca de quatro dias. Como a Lua não tem atmosfera nem vento, as pegadas deixadas pelos astronautas provavelmente continuam lá até hoje. Milhões de pessoas acompanharam a chegada pela televisão.',
      q: [['Quantos astronautas desceram na Lua?', 'Dois', ['Três', 'Um', 'Quatro']], ['Por que as pegadas devem continuar na Lua?', 'Lá não há vento nem atmosfera', ['Foram pintadas', 'A Lua é gelada', 'Ninguém mais foi lá']], ['O que fazia o terceiro astronauta?', 'Pilotava a nave em órbita', ['Filmava a chegada', 'Ficou na Terra', 'Consertava o foguete']]] },
    { faixa: 15, t: 'Dormir bem não é apenas descansar. Durante o sono, o cérebro organiza as informações aprendidas ao longo do dia e reforça as memórias mais importantes. Estudos mostram que pessoas que dormem menos de seis horas por noite, com frequência, têm mais dificuldade de concentração, mais irritabilidade e maior risco de acidentes. Mesmo assim, muitos adultos reduzem as horas de sono para trabalhar ou usar o celular à noite. A luz das telas, além de manter a mente agitada, pode atrasar a liberação da melatonina, substância que ajuda o corpo a reconhecer a hora de dormir. Especialistas recomendam horários regulares, quarto escuro e evitar telas pelo menos uma hora antes de deitar.',
      q: [['Qual é a ideia principal do texto?', 'O sono é importante para o cérebro e precisa de cuidado', ['O celular deve ser proibido', 'A melatonina causa acidentes', 'Adultos dormem demais']], ['Segundo o texto, a luz das telas pode:', 'Atrasar a liberação da melatonina', ['Melhorar a memória', 'Aumentar a melatonina', 'Curar a insônia']], ['Quem dorme cinco horas por noite com frequência provavelmente:', 'Terá mais dificuldade de concentração', ['Aprenderá mais rápido', 'Ficará mais calmo', 'Não terá mudança nenhuma']]] },
    { faixa: 15, t: 'Embora cerca de setenta por cento da superfície da Terra seja coberta por água, só uma pequena parte é doce e está disponível para o consumo humano. A maior parte da água doce está congelada nas geleiras ou guardada no subsolo. No Brasil, que tem uma das maiores reservas de água doce do mundo, a distribuição é desigual: a região Norte concentra a maior parte dos recursos, enquanto grande parte da população vive no Sudeste e no Nordeste. Por isso, mesmo num país rico em água, há cidades que enfrentam racionamento. O desperdício em casa, os vazamentos na rede e a poluição dos rios agravam o problema.',
      q: [['Por que cidades brasileiras podem ter racionamento?', 'A água é mal distribuída e há desperdício', ['O Brasil tem pouca água doce', 'Chove demais', 'As geleiras derreteram']], ['Onde está a maior parte da água doce do planeta?', 'Congelada ou no subsolo', ['Nos rios', 'Nos oceanos', 'Nas cidades']], ['Qual atitude o texto apoiaria?', 'Consertar vazamentos', ['Construir mais piscinas', 'Lavar a calçada com mangueira', 'Usar mais o carro']]] }
  ];
  function textoDaIdade(r, idade) { var f = idade >= 15 ? 15 : idade >= 11 ? 11 : idade >= 9 ? 9 : 7; return pega(r, TEXTOS.filter(function (x) { return x.faixa === f; })); }
  function itemLx(r, nivel, ctx) {
    ctx = ctx || {};
    var bloco = ctx.bloco || { t: textoDaIdade(r, ctx.idade || 10) }, tx = bloco.t, i = ctx.indice || 0;
    if (i === 0) return { tipo: 'avaliador', layout: 'texto', bloco: bloco, texto: tx.t, palavras: contar(tx.t),
      fala: 'Leia este texto em voz alta, do seu jeito, com atenção. Quando terminar, toque em Terminei.', pontuacao: { modo: 'erros', palavras: tx.t.split(/\s+/) } };
    var q = tx.q[i - 1], o = opcoesTexto(r, q[1], q[2]);
    return { tipo: 'escolha', layout: 'textos', bloco: bloco, textoApoio: tx.t, enunciado: q[0], fala: q[0], opcoes: o.opcoes, certo: o.certo, lentoMs: 40000 };
  }

  // ---------------------------------------------------------------- Ditado (ouvir a palavra e escrever no teclado da tela)
  var DT = [['bola', 'casa', 'dado', 'pato', 'sapo', 'mala'], ['gato', 'bota', 'vela', 'fada', 'luva', 'tatu'], ['janela', 'boneca', 'macaco', 'tomate', 'sapato', 'panela'],
    ['chuva', 'ninho', 'folha', 'carro', 'chave', 'galho'], ['prato', 'bruxa', 'flauta', 'livro', 'globo', 'tigre'], ['campo', 'tempo', 'bombom', 'pente', 'canto', 'lembrar'],
    ['guerra', 'queijo', 'foguete', 'pássaro', 'osso', 'girafa'], ['cabeça', 'açúcar', 'massa', 'sossego', 'crescer', 'nascer'], ['xícara', 'enxada', 'caixa', 'exame', 'lixo', 'enxergar'],
    ['hora', 'hoje', 'hospital', 'homem', 'horta', 'humor'], ['exceção', 'excesso', 'piscina', 'nascimento', 'descer', 'consciência'], ['privilégio', 'beneficente', 'mendigo', 'cabeleireiro', 'asterisco', 'reivindicar'],
    ['paralisar', 'analisar', 'pesquisar', 'pretensão', 'obsessão', 'extensão'], ['ascensão', 'exceder', 'prescindir', 'discernir', 'espontâneo', 'hesitar'],
    ['ressarcir', 'excelência', 'hesitação', 'ojeriza', 'paralisação', 'miscigenação'], ['concessionária', 'ascensorista', 'idiossincrasia', 'prescrição', 'excursão', 'exuberância']];
  var DT_REGRA = ['sílabas simples', 'sílabas simples', 'palavras de 3 sílabas', 'dígrafos (ch, nh, lh, rr)', 'encontros consonantais', 'm antes de p e b / nasal', 'gu, qu, ss, g e j', 'ç, ss, sc', 'x e ch', 'h inicial', 'sc, xc', 'palavras com erro comum', 's e z / ss e ç', 'sc, xc e acentos', 'palavras difíceis', 'palavras difíceis'];
  function itemDt(r, nivel) {
    var w = pega(r, DT[nivel - 1]);
    return { tipo: 'ditado', layout: 'teclado', fala: 'Escreva a palavra: ' + w + '. ' + w + '.', certo: w, regra: DT_REGRA[nivel - 1], lentoMs: 25000 + w.length * 2500 };
  }
  // chave "como se fala": separa erro de som (fonológico) de erro de regra ortográfica
  function somDe(p) {
    return String(p || '').toLowerCase().replace(/ç/g, 'S').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^h/, '').replace(/([^cslnr])h/g, '$1')
      .replace(/ss|ç|sc(?=[ei])|xc(?=[ei])|c(?=[ei])/g, 'S').replace(/s(?=[ei])/g, 'S').replace(/(?<=[aeiou])s(?=[aeiou])/g, 'Z').replace(/z/g, 'Z')
      .replace(/ch|x/g, 'X').replace(/g(?=[ei])|j/g, 'J').replace(/gu(?=[ei])/g, 'G').replace(/qu(?=[ei])|c|k|q/g, 'K').replace(/rr/g, 'R').replace(/^r/, 'R')
      .replace(/m(?=[pb])/g, 'n').replace(/l$/, 'u').replace(/s/g, 'S');
  }

  // ---------------------------------------------------------------- Matemática escolar (contas e problemas)
  function itemMt(r, nivel) {
    var a, b, c, en, certo, perto = [-2, -1, 1, 2, 10, -10];
    switch (nivel) {
      case 1: a = int(r, 1, 3); b = int(r, 1, 2); en = a + ' + ' + b + ' = ?'; certo = a + b; perto = [-1, 1, 2]; break;
      case 2: a = int(r, 2, 6); b = int(r, 2, 4); en = a + ' + ' + b + ' = ?'; certo = a + b; perto = [-1, 1, 2]; break;
      case 3: a = int(r, 5, 10); b = int(r, 1, a - 1); en = a + ' − ' + b + ' = ?'; certo = a - b; perto = [-1, 1, 2]; break;
      case 4: a = int(r, 6, 12); b = int(r, 4, 8); en = a + ' + ' + b + ' = ?'; certo = a + b; perto = [-1, 1, -2]; break;
      case 5: a = int(r, 2, 8) * 10 + int(r, 0, 4); b = int(r, 1, 5); en = a + ' + ' + b + ' = ?'; certo = a + b; perto = [-1, 1, 10]; break;
      case 6: a = int(r, 15, 48); b = int(r, 15, 47); if ((a % 10) + (b % 10) < 10) b += 5; en = a + ' + ' + b + ' = ?'; certo = a + b; perto = [-10, 10, -1]; break;
      case 7: a = int(r, 42, 95); b = int(r, 16, 39); if ((a % 10) >= (b % 10)) b += (a % 10) - (b % 10) + 1; en = a + ' − ' + b + ' = ?'; certo = a - b; perto = [10, -10, 2]; break;
      case 8: a = int(r, 2, 5); b = int(r, 3, 9); en = a + ' × ' + b + ' = ?'; certo = a * b; perto = [a, -a, 1]; break;
      case 9: a = int(r, 6, 9); b = int(r, 6, 9); en = a + ' × ' + b + ' = ?'; certo = a * b; perto = [a, -a, b]; break;
      case 10: b = int(r, 3, 9); c = int(r, 3, 9); a = b * c; en = a + ' ÷ ' + b + ' = ?'; certo = c; perto = [1, -1, 2]; break;
      case 11: a = int(r, 205, 689); b = int(r, 118, 199); en = a + ' − ' + b + ' = ?'; certo = a - b; perto = [100, -10, 10]; break;
      case 12: a = int(r, 4, 9); b = int(r, 4, 8); en = 'Uma caixa tem ' + a + ' ovos. Quantos ovos há em ' + b + ' caixas?'; certo = a * b; perto = [a, -a, b]; break;
      case 13: c = pega(r, [2, 3, 4]); a = c * int(r, 4, 12); en = 'Quanto é ' + (c === 2 ? 'a metade' : c === 3 ? 'um terço' : 'um quarto') + ' de ' + a + '?'; certo = a / c; perto = [1, -1, 2]; break;
      case 14: c = pega(r, [10, 25, 50, 20]); a = pega(r, [40, 80, 120, 200, 60]); en = 'Quanto é ' + c + '% de ' + a + '?'; certo = a * c / 100; perto = [2, -2, 10]; break;
      case 15: a = int(r, 12, 48) / 4; b = int(r, 6, 30) / 4; en = String(a).replace('.', ',') + ' + ' + String(b).replace('.', ',') + ' = ?'; certo = a + b; perto = [0.25, -0.5, 1]; break;
      default: c = int(r, 2, 5); b = int(r, 2, 9); a = int(r, 1, 9); en = c + 'x + ' + a + ' = ' + (c * b + a) + '. Quanto vale x?'; certo = b; perto = [1, -1, 2];
    }
    var fmt = function (v) { return String(Math.round(v * 100) / 100).replace('.', ','); };
    var o = opcoesTexto(r, fmt(certo), numOpcoes(r, certo, perto).slice(0, 3).map(fmt));
    return { tipo: 'escolha', layout: 'textos', enunciado: en, fala: nivel >= 12 ? en : 'Resolva a conta e toque na resposta certa.', opcoes: o.opcoes, certo: o.certo, numerico: true, lentoMs: 15000 + nivel * 2500 };
  }

  // ---------------------------------------------------------------- Cognição social: entender o que o outro pensa e sente
  var CS = [
    [1, 'O menino queria um sorvete. A mãe comprou o sorvete para ele. Como ele fica?', ['😀'], ['😢', '😠']],
    [1, 'A menina queria brincar no parque, mas começou a chover e ela não pôde ir. Como ela fica?', ['😞'], ['😀', '😲']],
    [2, 'O cachorro do Lucas fugiu. O Lucas procurou o dia inteiro. Como ele está se sentindo?', ['😟'], ['😀', '😴']],
    [3, 'Esta é uma caixa de lápis, mas dentro dela tem balas. O João nunca abriu a caixa. O que o João acha que tem dentro?', ['✏️'], ['🍬', '⚽']],
    [3, 'Esta caixa de ovos está cheia de botões. A Bia ainda não abriu. O que a Bia acha que tem dentro?', ['🥚'], ['🔘', '🍎']],
    [5, 'Ana guardou a boneca no baú e foi almoçar. O irmão mudou a boneca para o armário. Quando Ana voltar, onde ela vai procurar primeiro?', ['🧳'], ['🚪', '🛏️']],
    [5, 'Leo deixou o carrinho na caixa vermelha e foi dormir. A mãe arrumou o quarto e pôs o carrinho na caixa azul. Onde Leo vai procurar ao acordar?', ['🟥'], ['🟦', '🟩']],
    [6, 'Sofia escondeu o chocolate na gaveta. Enquanto ela estava no banho, o primo comeu o chocolate. O que Sofia acha que tem na gaveta?', ['🍫'], ['🗑️', '🍪']],
    [8, 'Maria e João viram o sorveteiro no parque, e ele disse que ficaria lá a tarde toda. João foi para casa. Depois o sorveteiro avisou Maria que ia para a praça da igreja. No caminho, ele passou pela casa do João e contou que ia para a igreja, mas Maria não viu. Onde Maria acha que o João vai procurar o sorveteiro?', 'No parque', ['Na igreja', 'Na casa do João']],
    [9, 'Carla comprou um presente para o aniversário da Bia e escondeu no armário. Bia viu escondido onde estava o presente, mas Carla não sabe que Bia viu. O que Carla pensa que Bia sabe sobre o presente?', 'Que Bia não sabe onde está', ['Que Bia sabe onde está', 'Que Bia não quer o presente']],
    [11, 'O time do Paulo perdeu de dez a zero. Na saída, o Paulo disse: "Que jogo maravilhoso!". O que ele quis dizer?', 'Que o jogo foi muito ruim', ['Que o jogo foi ótimo', 'Que quer jogar de novo amanhã']],
    [11, 'A vovó fez um bolo que ficou seco. A neta comeu e disse: "Está uma delícia, vó!". Por que a neta disse isso?', 'Para não magoar a avó', ['Porque o bolo estava ótimo', 'Porque queria mais bolo']],
    [12, 'O chefe chegou atrasado pela terceira vez e o colega comentou: "Chegou cedo hoje, hein!". O colega estava:', 'Fazendo ironia sobre o atraso', ['Elogiando de verdade', 'Perguntando que horas são']],
    [14, 'Júlia trocou as cortinas da sala. A amiga Ana veio visitar e disse: "Que cortinas feias! Espero que você troque logo." Ana não sabia que eram novas. Alguém disse algo que não devia?', 'Sim: Ana magoou Júlia sem perceber', ['Não, ninguém disse nada errado', 'Sim: Júlia foi mal-educada com Ana']],
    [14, 'Na festa, Rui disse para um senhor: "Esse bolo está horrível, quem fez?". O senhor respondeu: "Fui eu." Rui sabia que tinha sido o senhor quem fez o bolo?', 'Não, ele não sabia', ['Sim, ele sabia', 'Não dá para saber nada']],
    [15, 'Na reunião, a nova funcionária perguntou à colega quando nasceria o bebê. A colega respondeu que não estava grávida. Por que essa pergunta foi uma gafe?', 'Supôs algo sobre o corpo da colega sem saber', ['Porque reunião não é lugar de conversa', 'Porque ela já sabia a resposta']]
  ];
  function itemCs(r, nivel) {
    var pool = CS.filter(function (c) { return c[0] <= nivel && c[0] >= nivel - 3; }); if (!pool.length) pool = CS.filter(function (c) { return c[0] <= nivel; });
    var c = pega(r, pool);
    if (Array.isArray(c[2])) { var o = montarOpcoes(r, { e: c[2][0] }, c[3].map(function (x) { return { e: x }; }), 3); return { tipo: 'escolha', layout: 'figuras', fala: c[1], enunciado: c[1], opcoes: o.opcoes, certo: o.certo, lentoMs: 30000 }; }
    var t = opcoesTexto(r, c[2], c[3]);
    return { tipo: 'escolha', layout: 'textos', fala: c[1], enunciado: c[1], opcoes: t.opcoes, certo: t.certo, lentoMs: 45000 };
  }

  // ---------------------------------------------------------------- Desenho: cópia de figura e relógio (o avaliador pontua)
  var FIGURAS = [
    { nome: 'círculo com cruz', elementos: ['Círculo', 'Linha vertical', 'Linha horizontal', 'Cruz no meio do círculo'] },
    { nome: 'casa', elementos: ['Parede (quadrado)', 'Telhado (triângulo) em cima', 'Porta', 'Janela', 'Chaminé no telhado'] },
    { nome: 'figura complexa', elementos: ['Retângulo grande', 'Duas diagonais', 'Linha vertical do meio', 'Triângulo à direita', 'Círculo com 3 pontos (alto, à esquerda)', 'Losango em cima', '4 linhas paralelas (baixo, à direita)', 'Cruz pequena (baixo, à esquerda)'] }
  ];
  function itemDc(r, nivel, ctx) {
    var k = Math.min(2, (ctx && ctx.indice) || 0), f = FIGURAS[k];
    return { tipo: 'avaliador', layout: 'desenho', modelo: k, fala: 'Copie este desenho no quadro de baixo, do jeito mais parecido que conseguir. Quando terminar, toque em Pronto.',
      pontuacao: { modo: 'checklist', figura: f.nome, elementos: f.elementos, escala: ['Ausente', 'Torto ou fora do lugar', 'Certo e no lugar'] } };
  }
  var RELOGIO = ['Contorno do relógio fechado', 'Os 12 números estão lá', 'Números em ordem e bem espalhados', 'Dois ponteiros', 'Ponteiro das horas no 11', 'Ponteiro dos minutos no 2 (10 minutos)', 'Ponteiro das horas menor que o dos minutos'];
  function itemRl() {
    return { tipo: 'avaliador', layout: 'desenho', fala: 'Desenhe um relógio redondo, com todos os números. Depois desenhe os ponteiros marcando onze horas e dez minutos. Quando terminar, toque em Pronto.',
      pontuacao: { modo: 'checklist', figura: 'relógio (11h10)', elementos: RELOGIO, escala: ['Não', 'Sim'] } };
  }

  // ---------------------------------------------------------------- Toque rápido (coordenação motora fina) e tempo de reação
  function itemTp(r, nivel, ctx) {
    var i = (ctx && ctx.indice) || 0, mao = i % 2 === 0 ? 'preferida' : 'outra';
    return { tipo: 'tapping', layout: 'tapping', mao: mao, duracaoMs: 10000,
      fala: mao === 'preferida' ? 'Use o dedo indicador da mão que você mais usa. Quando aparecer o círculo, toque nele o mais rápido que puder, sem parar, até o tempo acabar.'
        : 'Agora use o dedo indicador da OUTRA mão. Toque o mais rápido que puder até o tempo acabar.' };
  }
  function itemTr(r, nivel, ctx) {
    var i = (ctx && ctx.indice) || 0, atraso = int(r, 600, 2400);
    if (i < 10) return { tipo: 'gonogo', layout: 'gonogo', reacao: 'simples', atrasoMs: atraso, fala: 'Toque na tela assim que aparecer a estrela. Seja rápido!', estimulo: [{ e: '⭐' }], certo: 'toque', limiteMs: 1500, lentoMs: 1500 };
    var lado = r() < 0.5 ? 'esq' : 'dir';
    return { tipo: 'escolha', layout: 'reacao2', reacao: 'escolha', atrasoMs: atraso, fala: 'Agora aparece uma seta. Toque no botão do mesmo lado da seta, bem rápido.', estimulo: [{ seta: lado }],
      opcoes: [{ id: 'esq', fig: { seta: 'esq' } }, { id: 'dir', fig: { seta: 'dir' } }], certo: lado, limiteMs: 2000, lentoMs: 2000 };
  }

  // ---------------------------------------------------------------- Orientação (adultos e idosos; o avaliador marca certo ou errado)
  var ORIENT = [['dia_semana', 'Que dia da semana é hoje?'], ['dia_mes', 'Que dia do mês é hoje?'], ['mes', 'Em que mês estamos?'], ['ano', 'Em que ano estamos?'],
    ['hora', 'Que horas são, mais ou menos, sem olhar no relógio?'], ['cidade', 'Em que cidade estamos?'], ['lugar', 'Que lugar é este, onde estamos agora?']];
  function itemOr(r, nivel, ctx) {
    var q = ORIENT[Math.min(ORIENT.length - 1, (ctx && ctx.indice) || 0)];
    return { tipo: 'avaliador', layout: 'falar', icone: '🗓️', rotulo: q[1], pergunta: q[0], fala: q[1], pontuacao: { modo: 'certoerrado', pergunta: q[0] } };
  }

  // ---------------------------------------------------------------- correção das tarefas novas
  // pontuação dada pelo avaliador no celular (só números e marcas; nada de texto livre longo)
  function corrigirAvaliador(it, p, entrega) {
    p = p || {}; var n = function (v, max) { v = Math.round(Number(v) || 0); return Math.max(0, Math.min(max || 999, v)); };
    var pc = it.pontuacao || {}, ex = { modo: pc.modo };
    if (pc.modo === 'palavras') {
      var marc = (Array.isArray(p.marcadas) ? p.marcadas : []).map(Number).filter(function (i, k, a) { return i >= 0 && i < pc.palavras.length && a.indexOf(i) === k; });
      ex.lembradas = marc.length; ex.total = pc.palavras.length; ex.marcadas = marc; ex.intrusoes = n(p.intrusoes, 50); ex.repeticoes = n(p.repeticoes, 50); ex.ensaio = it.ensaio || 0;
      return { correto: ex.lembradas >= Math.ceil(ex.total / 2), rapido: true, esgotado: false, extra: ex };
    }
    if (pc.modo === 'contador') { ex.validas = n(p.validas, 200); ex.repeticoes = n(p.repeticoes, 99); ex.intrusoes = n(p.intrusoes, 99); ex.categoria = it.categoria; ex.transcricao = entrega && entrega.transcricao ? String(entrega.transcricao).slice(0, 2000) : null; return { correto: ex.validas > 0, rapido: true, esgotado: false, extra: ex }; }
    if (pc.modo === 'checklist') {
      var max = pc.escala.length - 1, notas = (Array.isArray(p.notas) ? p.notas : []).slice(0, pc.elementos.length).map(function (v) { return n(v, max); });
      while (notas.length < pc.elementos.length) notas.push(0);
      ex.notas = notas; ex.pontos = notas.reduce(function (s, v) { return s + v; }, 0); ex.maximo = pc.elementos.length * max; ex.figura = pc.figura; ex.desenho = entrega && entrega.desenho ? true : false;
      return { correto: ex.pontos >= ex.maximo * 0.7, rapido: true, esgotado: false, extra: ex };
    }
    if (pc.modo === 'certoerrado') { ex.certo = p.certo === true; ex.pergunta = pc.pergunta; return { correto: ex.certo, rapido: true, esgotado: false, extra: ex }; }
    if (pc.modo === 'erros') {
      var marcE = (Array.isArray(p.marcadas) ? p.marcadas : []).map(Number).filter(function (i, k, a) { return i >= 0 && i < pc.palavras.length && a.indexOf(i) === k; });
      ex.palavras = it.palavras; ex.erros = marcE.length; ex.marcadas = marcE; ex.autocorrecoes = n(p.autocorrecoes, 99);
      ex.tempoMs = entrega && entrega.tempoMs ? n(entrega.tempoMs, 3600000) : n(p.tempoMs, 3600000);
      // tempo curto demais para ter lido (mais de 400 palavras por minuto): toque sem querer em Terminei; não gera número
      ex.ppm = ex.tempoMs ? Math.round((ex.palavras - ex.erros) / (ex.tempoMs / 60000)) : null;
      if (ex.ppm != null && ex.ppm > 400) { ex.ppm = null; ex.tempoInvalido = true; }
      return { correto: ex.erros <= Math.ceil(ex.palavras * 0.1), rapido: true, esgotado: false, extra: ex };
    }
    return { correto: false, rapido: true, esgotado: false, extra: ex };
  }
  // entrega do paciente nas tarefas pontuadas pelo avaliador (desenho, tempo de leitura, fim do minuto, transcrição)
  function limparEntrega(e) {
    e = e || {}; var x = {};
    if (typeof e.desenho === 'string' && e.desenho.length <= 400000 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(e.desenho)) x.desenho = e.desenho;
    if (e.tempoMs != null) x.tempoMs = Math.max(0, Math.min(3600000, Math.round(Number(e.tempoMs) || 0)));
    if (e.transcricao) x.transcricao = String(e.transcricao).slice(0, 2000);
    return x;
  }

  // ---------------------------------------------------------------- referências aproximadas (literatura; NÃO são normas do NeuroTrilha)
  function refFluencia(cat, idade) {
    if (cat === 'animais') return idade < 7 ? 8 : idade < 9 ? 11 : idade < 11 ? 13 : idade < 15 ? 15 : idade < 60 ? 17 : 13;
    return idade < 11 ? 6 : idade < 15 ? 9 : idade < 60 ? 12 : 10;
  }
  function refLeituraPpm(idade) { return idade < 8 ? 50 : idade < 9 ? 70 : idade < 10 ? 85 : idade < 11 ? 100 : idade < 12 ? 110 : idade < 15 ? 120 : 140; }

  // ---------------------------------------------------------------- medidas das tarefas novas (para o relatório)
  function metricasNovas(e, sessao) {
    var it = e.itens, idade = sessao.idadeAnos || 10, med = function (v) { return mediana(v.filter(function (x) { return x != null; })); };
    if (e.dominio === 'mp') {
      var curva = it.map(function (i) { return i.lembradas || 0; }), total = curva.reduce(function (s, v) { return s + v; }, 0);
      var tard = sessao.mpTardia || {}, ult = curva.length ? curva[curva.length - 1] : 0;
      return { curva: curva, total: total, maximo: it.length && it[0].total ? it[0].total * it.length : null, palavras: it.length ? it[0].total : null, intrusoes: it.reduce(function (s, i) { return s + (i.intrusoes || 0); }, 0),
        evocacaoTardia: tard.evoc ? tard.evoc.lembradas : null, retencao: tard.evoc && ult ? Math.round(100 * tard.evoc.lembradas / ult) : null,
        reconhecimento: tard.rec ? { acertos: tard.rec.acertos, falsos: tard.rec.falsos, total: tard.rec.total } : null };
    }
    if (e.dominio === 'fv') return { categorias: it.map(function (i) { return { categoria: i.categoria, validas: i.validas, repeticoes: i.repeticoes, intrusoes: i.intrusoes, referencia: refFluencia(i.categoria, idade) }; }) };
    if (e.dominio === 'lx') {
      var l = it.filter(function (i) { return i.modo === 'erros'; })[0], comp = it.filter(function (i) { return i.modo !== 'erros'; });
      return { ppm: l ? l.ppm : null, tempoInvalido: !!(l && l.tempoInvalido), erros: l ? l.erros : null, palavras: l ? l.palavras : null, autocorrecoes: l ? l.autocorrecoes : null, tempoMs: l ? l.tempoMs : null, referenciaPpm: refLeituraPpm(idade),
        compreensao: comp.length ? { acertos: comp.filter(function (i) { return i.correto; }).length, total: comp.length } : null };
    }
    if (e.dominio === 'dc' || e.dominio === 'rl') return { figuras: it.map(function (i) { return { figura: i.figura, pontos: i.pontos, maximo: i.maximo, notas: i.notas }; }) };
    if (e.dominio === 'tp') {
      var pref = it.filter(function (i) { return i.mao === 'preferida'; }).map(function (i) { return i.toques; }), out = it.filter(function (i) { return i.mao === 'outra'; }).map(function (i) { return i.toques; });
      var mp = pref.length ? Math.round(pref.reduce(function (s, v) { return s + v; }, 0) / pref.length) : null, mo = out.length ? Math.round(out.reduce(function (s, v) { return s + v; }, 0) / out.length) : null;
      return { preferida: mp, outra: mo, diferenca: mp && mo ? Math.round(100 * (mp - mo) / mp) : null };
    }
    if (e.dominio === 'tr') {
      var simp = it.filter(function (i) { return i.reacao === 'simples'; }), esc = it.filter(function (i) { return i.reacao === 'escolha'; });
      return { simplesMs: med(simp.filter(function (i) { return i.correto && i.tempoMs >= 150; }).map(function (i) { return i.tempoMs; })), escolhaMs: med(esc.filter(function (i) { return i.correto && i.tempoMs >= 150; }).map(function (i) { return i.tempoMs; })),
        antecipacoes: it.filter(function (i) { return i.tempoMs < 150; }).length, omissoes: simp.filter(function (i) { return !i.correto; }).length, errosEscolha: esc.filter(function (i) { return !i.correto; }).length };
    }
    if (e.dominio === 'or') return { acertos: it.filter(function (i) { return i.correto; }).length, total: it.length, erradas: it.filter(function (i) { return !i.correto; }).map(function (i) { return i.pergunta; }) };
    return null;
  }
  function alertasNovos(sessao, areas) {
    var a = [];
    areas.forEach(function (x) {
      var m = x.metricas; if (!m) return;
      if (x.id === 'mp') {
        if (m.curva && m.curva.length >= 3 && m.curva[m.curva.length - 1] - m.curva[0] <= 1) a.push({ tipo: 'aprendizagem', texto: 'Memória de palavras: quase não aumentou o número de palavras com a repetição (curva de aprendizagem plana). Investigar memória verbal, atenção e estratégia.' });
        if (m.retencao != null && m.retencao < 60) a.push({ tipo: 'esquecimento', texto: 'Memória de palavras: no fim da sessão lembrou só ' + m.retencao + '% do que lembrava na última rodada (esquecimento rápido). Se o reconhecimento foi bom, a dificuldade é mais de busca/acesso do que de armazenamento.' });
      }
      if (x.id === 'fv') m.categorias.forEach(function (c) { if (c.validas != null && c.validas < c.referencia - 4) a.push({ tipo: 'fluencia', texto: 'Fluência verbal (' + c.categoria + '): ' + c.validas + ' palavras, abaixo da referência aproximada (cerca de ' + c.referencia + ' para a idade). Investigar linguagem e funções executivas.' }); });
      if (x.id === 'lx' && m.ppm != null && m.ppm < m.referenciaPpm * 0.7) a.push({ tipo: 'leitura', texto: 'Leitura em voz alta: ' + m.ppm + ' palavras corretas por minuto, bem abaixo da referência aproximada para a idade (' + m.referenciaPpm + '). Investigar fluência de leitura (hipótese de dislexia), junto com a consciência fonológica.' });
      if (x.id === 'rl' && m.figuras[0] && m.figuras[0].pontos != null && m.figuras[0].pontos <= 4 && sessao.idadeAnos >= 9) a.push({ tipo: 'relogio', texto: 'Desenho do relógio com ' + m.figuras[0].pontos + ' de 7 pontos: avaliar planejamento, visuoconstrução e, em idosos, rastreio de declínio cognitivo.' });
      if (x.id === 'or' && m.total >= 5 && m.total - m.acertos >= 2) a.push({ tipo: 'orientacao', texto: 'Orientação: errou ' + (m.total - m.acertos) + ' de ' + m.total + ' perguntas (' + m.erradas.join(', ') + '). Em adultos e idosos, sinal de alerta para avaliação de memória e cognição.' });
      if (x.id === 'tp' && m.diferenca != null && Math.abs(m.diferenca) >= 35) a.push({ tipo: 'motor', texto: 'Toque rápido: diferença grande entre as mãos (' + m.diferenca + '%). Considerar avaliação neurológica/motora.' });
      if (x.id === 'tr' && m.antecipacoes >= 3) a.push({ tipo: 'impulsos', texto: 'Tempo de reação: ' + m.antecipacoes + ' respostas antes da hora (antecipação), sinal de impulsividade.' });
    });
    return a;
  }

  // ---------------------------------------------------------------- sugestões de intervenção (para o profissional revisar)
  var SUGESTOES = {
    gf: ['Usar materiais concretos e exemplos antes de regras abstratas.', 'Ensinar estratégias de resolução de problemas passo a passo (o que eu sei, o que falta, como testar).'],
    gwm: ['Dar instruções curtas, uma etapa de cada vez, e conferir o entendimento.', 'Apoios visuais: listas, roteiros e quadros com os passos da tarefa.'],
    dg: ['Repetir e escrever as informações ditadas; evitar cópia do quadro com pressa.'], di: ['Reduzir a carga de memória: permitir rascunho e etapas escritas nas contas.'],
    gs: ['Dar mais tempo nas provas e tarefas (tempo estendido).', 'Diminuir a quantidade de cópia; priorizar a qualidade.'],
    gc: ['Ampliar vocabulário com leitura compartilhada diária e conversa sobre palavras novas.'], rv: ['Trabalhar categorias, semelhanças e analogias em jogos e conversas.'],
    ml: ['Revisões espaçadas (rever o conteúdo no dia seguinte e na semana seguinte).'], mp: ['Ensinar estratégias de memória: agrupar por categoria, criar histórias e revisar.', 'Avaliar se lembra melhor com pistas: oferecer escolhas/recordação guiada nas provas.'],
    gn: ['Combinar regras claras e curtas, com combinados visuais e reforço positivo imediato.', 'Pausas curtas de movimento entre as atividades.'], ac: ['Atividades em blocos curtos, sentar perto do professor, ambiente com menos distrações.'],
    at: ['Organizar o material e a mesa para reduzir distrações visuais.'], fx: ['Avisar antes das mudanças de rotina e de regra; treinar flexibilidade com jogos de troca de regra.'],
    to: ['Ensinar a planejar antes de começar (pensar alto, desenhar o plano).'], tl: ['Treinar alternância com jogos e checklists de etapas.'], cm: ['Atividades de rastreio visual (labirintos, caça-palavras).'],
    fo: ['Estimulação da consciência fonológica: rimas, sílabas e sons iniciais em brincadeiras diárias.', 'Encaminhar para fonoaudiologia se persistir.'],
    le: ['Intervenção em decodificação (método fônico) e leitura em voz alta diária.'], lx: ['Leitura repetida de textos curtos para ganhar fluência; perguntas sobre o texto para trabalhar compreensão.', 'Considerar avaliação fonoaudiológica e psicopedagógica.'],
    dt: ['Trabalhar regras ortográficas explicitamente, com listas de palavras por regra; correção sem punição.'], mt: ['Retomar o sentido das operações com material concreto; tabuada com jogos.', 'Permitir tabela de apoio nas provas enquanto consolida.'],
    em: ['Treino de reconhecimento de emoções com fotos e situações do dia a dia.'], cs: ['Histórias sociais e conversas sobre o que o outro pensa e sente; treino de habilidades sociais em grupo.'],
    fv: ['Jogos de evocação (diga palavras de uma categoria, de uma letra); ampliação de vocabulário.'], dc: ['Atividades de cópia, quebra-cabeça e construção; terapia ocupacional se houver dificuldade motora.'],
    rl: ['Avaliar planejamento e visuoconstrução; em idosos, acompanhamento médico da memória.'], tp: ['Avaliação de coordenação motora fina (terapia ocupacional) se houver lentidão ou assimetria.'],
    tr: ['Investigar se a lentidão é geral (velocidade) ou só quando precisa escolher (tomada de decisão).'], or: ['Encaminhar para avaliação médica/neurológica da memória; organizar rotina com calendário e lembretes.']
  };
  function sugestoes(res) {
    var lista = [];
    (res.areas || []).forEach(function (a) {
      var fraco = (a.indice != null && a.indice < 85) || (res.alertas || []).some(function (al) { return al.texto.indexOf((dominio(a.id) || {}).nome || '###') === 0; });
      if (a.id === 'mp' && a.metricas && a.metricas.retencao != null && a.metricas.retencao < 60) fraco = true;
      if (a.id === 'lx' && a.metricas && a.metricas.ppm != null && a.metricas.ppm < a.metricas.referenciaPpm * 0.8) fraco = true;
      if (a.id === 'or' && a.metricas && a.metricas.total - a.metricas.acertos >= 2) fraco = true;
      if (a.id === 'fv' && a.metricas && a.metricas.categorias.some(function (c) { return c.validas != null && c.validas < c.referencia - 4; })) fraco = true;
      if (fraco && SUGESTOES[a.id]) lista.push({ area: a.nome, itens: SUGESTOES[a.id] });
    });
    return lista;
  }

  var GERADORES = { gf: itemGf, gwm: itemGwm, gv: itemGv, gs: itemGs, gc: itemGc, gq: itemGq, at: itemAt, fx: itemFx,
    gn: itemGn, ac: itemAc, fo: itemFo, em: itemEm, cm: itemCm, dg: itemDg, di: itemDi, le: itemLe, to: itemTo, tl: itemTl, rv: itemRv, ml: itemMl,
    mp: itemMp, fv: itemFv, lx: itemLx, dt: itemDt, mt: itemMt, cs: itemCs, dc: itemDc, rl: itemRl, tp: itemTp, tr: itemTr, or: itemOr };
  // ctx (opcional): { indice: posição no bloco fixo, idade, curta, bloco: o que precisa continuar igual no bloco (lista de palavras, texto) }
  function gerarItem(dom, nivel, semente, ctx) {
    nivel = Math.max(1, Math.min(NIVEIS, Math.round(nivel)));
    var it = GERADORES[dom](rng(semente + '|' + dom + '|' + nivel), nivel, ctx || {});
    it.dominio = dom; it.nivel = nivel; it.id = 'it-' + hash(semente + dom + nivel).toString(36);
    var st = subtipoDe(dom, nivel); if (st) it.subtipo = st;
    return it;
  }
  // o que vai para a tela do paciente (sem a resposta certa)
  function itemPublico(it) {
    if (!it) return null;
    var x = Object.assign({}, it); delete x.certo; delete x.lentoMs; delete x.palavra; delete x.regra; delete x.condicao; delete x.margem; delete x.alvosFig; delete x.minimo; delete x.subtipo; delete x.bloco; delete x.pontuacao; delete x.entrega;
    if (it.entrega) x.entregue = true;
    return x;
  }
  function corrigir(it, resposta, tempoMs) {
    var certo, extra = {};
    if (it.tipo === 'gonogo') {  // não tocar no tubarão (ou fora da estrela) é acerto; tocar no peixe a tempo é acerto
      var tocou = resposta === 'toque'; extra = { alvo: it.certo !== null, toque: tocou }; if (it.reacao) extra.reacao = it.reacao;
      certo = it.certo === null ? !tocou : tocou && tempoMs <= it.limiteMs;
      return { correto: certo, rapido: certo, esgotado: false, extra: extra };
    }
    if (it.tipo === 'tapping') {
      var tq = Math.max(0, Math.min(250, Math.round(Number(resposta && resposta.toques) || 0)));
      return { correto: tq > 0, rapido: true, esgotado: false, extra: { toques: tq, mao: it.mao } };
    }
    if (it.tipo === 'ditado') {
      var escrito = String(resposta == null ? '' : resposta).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
      extra = { escrito: escrito, palavra: it.certo }; certo = escrito === it.certo;
      return { correto: certo, rapido: certo && tempoMs <= it.lentoMs, esgotado: false, extra: extra };
    }
    if (it.tipo === 'corsi' || it.tipo === 'digitos') certo = Array.isArray(resposta) && igual(resposta.map(Number), it.certo);
    else if (it.tipo === 'torre') { extra = torreConferir(it, resposta && resposta.jogadas); extra.minimo = it.minimo; certo = extra.resolveu && extra.movimentos <= it.minimo; }
    else if (it.tipo === 'pontos') { extra = pontosConferir(it, resposta); certo = extra.completou && extra.erros === 0; }
    else if (it.tipo === 'reconhecer') { extra = reconhecerConferir(it, resposta); certo = extra.acertos >= extra.total - (it.margem || 0) && extra.falsos <= (it.margem || 0); }
    else certo = resposta === it.certo;
    var esgotado = !!(it.limiteMs && tempoMs > it.limiteMs);
    if (esgotado) certo = false;
    if (it.reacao) extra.reacao = it.reacao;  // tempo de reação: simples ou de escolha
    return { correto: certo, rapido: certo && (!it.lentoMs || tempoMs <= it.lentoMs), esgotado: esgotado, extra: extra };
  }

  // ------------------------------------------------------------------ escada adaptativa (uma por área)
  function novaEscada(dom, opcoes) {
    opcoes = opcoes || {};
    var d = dominio(dom) || {};
    var fixos = typeof d.fixoItens === 'function' ? d.fixoItens(opcoes.idade == null ? 10 : opcoes.idade, !!opcoes.curta) : d.fixoItens;
    return { dominio: dom, nivel: Math.max(1, Math.min(NIVEIS, opcoes.inicio || 1)), maxItens: d.fixo ? fixos : (opcoes.maxItens || 10), fixo: !!d.fixo, itens: [], reversoes: [],
      direcao: 0, teveErro: false, errosSeguidos: 0, terminado: false, motivoFim: '', treinoFeito: !!(opcoes.semTreino || d.semTreino) };
  }
  function registrar(escada, item, resultado, tempoMs) {
    var antes = escada.nivel;
    escada.itens.push(Object.assign({ nivel: antes, correto: resultado.correto, rapido: resultado.rapido, esgotado: resultado.esgotado, tempoMs: tempoMs }, resultado.extra || {}));
    if (escada.fixo) { if (escada.itens.length >= escada.maxItens) { escada.terminado = true; escada.motivoFim = 'itens'; } return escada; }  // bloco fixo: o nível não muda
    var passo = 0;
    if (resultado.correto && resultado.rapido) passo = escada.teveErro ? 1 : 2;
    else if (!resultado.correto) { passo = -1; escada.teveErro = true; }
    escada.errosSeguidos = resultado.correto ? 0 : escada.errosSeguidos + 1;
    var dir = passo > 0 ? 1 : passo < 0 ? -1 : 0;
    if (dir && escada.direcao && dir !== escada.direcao) escada.reversoes.push(antes);
    if (dir) escada.direcao = dir;
    escada.nivel = Math.max(1, Math.min(NIVEIS, antes + passo));
    var acertosNoTopo = escada.itens.filter(function (i) { return i.nivel === NIVEIS && i.correto; }).length;
    if (escada.itens.length >= escada.maxItens) { escada.terminado = true; escada.motivoFim = 'itens'; }
    else if (escada.reversoes.length >= 6) { escada.terminado = true; escada.motivoFim = 'estavel'; }
    else if (antes === 1 && escada.errosSeguidos >= 3) { escada.terminado = true; escada.motivoFim = 'piso'; }
    else if (acertosNoTopo >= 2) { escada.terminado = true; escada.motivoFim = 'teto'; }
    return escada;
  }
  // nível alcançado na área (com casas decimais)
  function nivelEstimado(escada) {
    var it = escada.itens;
    if (!it.length || escada.fixo) return null;
    var revs = escada.reversoes.slice(escada.reversoes.length > 3 ? 1 : 0);
    var maxCerto = 0;
    it.forEach(function (i) { if (i.correto && i.nivel > maxCerto) maxCerto = i.nivel; });
    if (!maxCerto) return 0.5;
    if (revs.length >= 2) {
      var media = revs.reduce(function (a, b) { return a + b; }, 0) / revs.length;
      return Math.round(Math.min(maxCerto + 0.5, Math.max(media, maxCerto - 2)) * 10) / 10;
    }
    // sem reversões suficientes: o maior nível acertado (meio ponto acima se acertou o último item)
    var ultimo = it[it.length - 1];
    return Math.round((maxCerto + (ultimo.correto && ultimo.nivel === maxCerto ? 0.5 : 0)) * 10) / 10;
  }

  // ------------------------------------------------------------------ idade, nível esperado e QI estimado
  function idadeDoNivel(n) {
    if (n == null) return null;
    if (n <= 1) return IDADE_REF[0] - (1 - n);
    if (n >= 13) return 17 + (n - 13) * 2;  // acima de 13: além da referência adulta (só indicativo)
    var i = Math.floor(n), f = n - i;
    return IDADE_REF[i - 1] + f * (IDADE_REF[i] - IDADE_REF[i - 1]);
  }
  function nivelEsperado(idadeAnos) {
    if (idadeAnos <= IDADE_REF[0]) return 1;
    if (idadeAnos >= 17) return 13;
    for (var i = 0; i < IDADE_REF.length - 1; i++) {
      if (idadeAnos >= IDADE_REF[i] && idadeAnos <= IDADE_REF[i + 1]) return i + 1 + (idadeAnos - IDADE_REF[i]) / (IDADE_REF[i + 1] - IDADE_REF[i]);
    }
    return 13;
  }
  function indice(nivel, idadeAnos) {
    if (nivel == null) return null;
    var v = 100 + 15 * (nivel - nivelEsperado(idadeAnos)) / DP_NIVEIS;
    return Math.round(Math.max(40, Math.min(160, v)));
  }
  function faixa(qi) {
    if (qi == null) return '—';
    if (qi >= 130) return 'Muito superior';
    if (qi >= 120) return 'Superior';
    if (qi >= 110) return 'Média superior';
    if (qi >= 90) return 'Média';
    if (qi >= 80) return 'Média inferior';
    if (qi >= 70) return 'Limítrofe';
    return 'Extremamente baixo';
  }
  function mediana(v) { if (!v.length) return null; var s = v.slice().sort(function (a, b) { return a - b; }), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  // Resultado completo da sessão (para o painel ao vivo e o relatório)
  function resultado(sessao, idadeAnos) {
    var areas = sessao.escadas.map(function (e) {
      var d = dominio(e.dominio), n = nivelEstimado(e), feitos = e.itens.length, certos = e.itens.filter(function (i) { return i.correto; }).length;
      return { id: e.dominio, nome: d.nome, chc: d.chc, grupo: d.grupo, qi: !!d.qi, fixo: !!d.fixo, metricas: metricasArea(e, sessao), itens: feitos, acertos: certos, nivel: n, idadeDesempenho: n == null ? null : Math.round(idadeDoNivel(n) * 10) / 10,
        indice: indice(n, idadeAnos), faixa: faixa(indice(n, idadeAnos)), tempoMedianoMs: mediana(e.itens.map(function (i) { return i.tempoMs; })),
        terminado: e.terminado, motivoFim: e.motivoFim, curva: e.itens.map(function (i) { return { nivel: i.nivel, correto: i.correto }; }) };
    });
    var comDados = areas.filter(function (a) { return a.qi && a.nivel != null; });  // só inteligência entra no QI
    var comIndice = areas.filter(function (a) { return a.indice != null; });
    var res = { areas: areas, idade: idadeAnos, nivelEsperado: Math.round(nivelEsperado(idadeAnos) * 10) / 10, tardia: sessao.tardia || null };
    if (comDados.length) {
      var nivelGeral = comDados.reduce(function (s, a) { return s + a.nivel; }, 0) / comDados.length;
      res.nivelGeral = Math.round(nivelGeral * 10) / 10;
      res.idadeDesempenho = Math.round(idadeDoNivel(nivelGeral) * 10) / 10;
      res.qiEstimado = indice(nivelGeral, idadeAnos);
      // incerteza: poucas áreas e poucos itens = faixa maior; nunca menos de ±10 (sem normas próprias)
      var margem = Math.max(10, Math.round(1.96 * 15 * Math.sqrt(1 / comDados.length + 0.15) / DP_NIVEIS));
      // poucas tarefas por área = estimativa menos firme: a faixa provável fica maior
      var mediaItens = comDados.reduce(function (s, a) { return s + a.itens; }, 0) / comDados.length;
      if (mediaItens < 5) margem += 6;
      res.intervalo = [Math.max(40, res.qiEstimado - margem), Math.min(160, res.qiEstimado + margem)];
      res.faixa = faixa(res.qiEstimado);
    }
    if (comIndice.length) {
      var media = comIndice.reduce(function (s, a) { return s + a.indice; }, 0) / comIndice.length;
      res.fortes = comIndice.filter(function (a) { return a.indice >= media + 12; }).map(function (a) { return a.nome; });
      res.fracos = comIndice.filter(function (a) { return a.indice <= media - 12; }).map(function (a) { return a.nome; });
    }
    res.alertas = alertas(sessao, areas);
    var comp = indicesCompostos(areas, idadeAnos);
    res.indices = comp.indices; res.discrepancias = comp.discrepancias; res.habilidadeGeral = comp.habilidadeGeral;
    res.validade = validade(sessao);
    res.erros = analiseErros(sessao);
    return res;
  }

  // medidas próprias: impulsividade, desatenção, tempo de reação, erros, jogadas a mais, recordação tardia
  function metricasArea(e, sessao) {
    var it = e.itens, soma = function (l, f) { return l.reduce(function (s, i) { return s + (f(i) || 0); }, 0); };
    if (e.dominio === 'gn' || e.dominio === 'ac') {
      var alvos = it.filter(function (i) { return i.alvo === true; }), outros = it.filter(function (i) { return i.alvo === false; });
      var trs = alvos.filter(function (i) { return i.toque && i.correto; }).map(function (i) { return i.tempoMs; });
      var media = trs.length ? soma(trs, function (x) { return x; }) / trs.length : null;
      var dp = trs.length > 1 ? Math.sqrt(soma(trs, function (x) { return (x - media) * (x - media); }) / (trs.length - 1)) : null;
      var m = { alvos: alvos.length, omissoes: alvos.filter(function (i) { return !i.toque; }).length, naoAlvos: outros.length, comissoes: outros.filter(function (i) { return i.toque; }).length,
        trMedioMs: media == null ? null : Math.round(media), trVariabilidadeMs: dp == null ? null : Math.round(dp) };
      if (it.length >= 12) {
        var meio = Math.floor(it.length / 2), a1 = it.slice(0, meio).filter(function (i) { return i.correto; }).length / meio, a2 = it.slice(meio).filter(function (i) { return i.correto; }).length / (it.length - meio);
        m.queda = Math.round((a1 - a2) * 100);
      }
      return m;
    }
    if (e.dominio === 'tl') return { erros: soma(it, function (i) { return i.erros; }) };
    if (e.dominio === 'to') return { jogadasAMais: soma(it, function (i) { return i.resolveu ? Math.max(0, i.movimentos - i.minimo) : 0; }), naoResolvidas: it.filter(function (i) { return i.resolveu === false; }).length };
    if (e.dominio === 'ml') return { falsosReconhecimentos: soma(it, function (i) { return i.falsos; }), tardia: sessao.tardia || null };
    if (e.dominio === 'dt') return { errosSom: it.filter(function (i) { return !i.correto && i.escrito != null && somDe(i.escrito) !== somDe(i.palavra); }).length, errosRegra: it.filter(function (i) { return !i.correto && i.escrito != null && somDe(i.escrito) === somDe(i.palavra); }).length };
    return metricasNovas(e, sessao);
  }

  function alertas(sessao, areas) {
    var a = [], todos = [];
    sessao.escadas.forEach(function (e) { e.itens.forEach(function (i) { todos.push(Object.assign({ dominio: e.dominio }, i)); }); });
    var erros = todos.filter(function (i) { return !i.correto && ['gs', 'at', 'gn', 'ac', 'tl', 'dg', 'di', 'ml', 'gwm'].indexOf(i.dominio) < 0; });
    var impulsivos = erros.filter(function (i) { return i.tempoMs < 1500; });
    if (erros.length >= 4 && impulsivos.length / erros.length >= 0.4) a.push({ tipo: 'impulsividade', texto: 'Muitos erros com resposta muito rápida (menos de 1,5 s): pode indicar impulsividade ou pouca atenção à instrução.' });
    var lentos = todos.filter(function (i) { return i.correto && !i.rapido; });
    if (todos.length >= 10 && lentos.length / todos.length >= 0.3) a.push({ tipo: 'lentidao', texto: 'Muitos acertos lentos: o desempenho pode estar limitado pelo ritmo (velocidade de processamento, cautela ou cansaço).' });
    if (todos.length >= 18) {
      var t = Math.floor(todos.length / 3), ini = todos.slice(0, t), fim = todos.slice(-t);
      var pIni = ini.filter(function (i) { return i.correto; }).length / t, pFim = fim.filter(function (i) { return i.correto; }).length / t;
      if (pIni - pFim >= 0.3) a.push({ tipo: 'fadiga', texto: 'O aproveitamento caiu bastante no final da sessão: considerar cansaço ou queda de motivação.' });
    }
    var idx = areas.filter(function (x) { return x.indice != null; }).map(function (x) { return x.indice; });
    if (idx.length >= 3 && Math.max.apply(null, idx) - Math.min.apply(null, idx) >= 30) a.push({ tipo: 'heterogeneo', texto: 'Diferença grande entre as áreas (30 pontos ou mais): o QI global pode não representar bem o perfil; dê mais peso aos índices por área.' });
    areas.forEach(function (x) {
      if (x.motivoFim === 'piso') a.push({ tipo: 'piso', texto: x.nome + ': não alcançou o nível inicial. Verificar compreensão da instrução, visão/audição, motivação ou necessidade de outra forma de aplicação.' });
      if (x.motivoFim === 'teto') a.push({ tipo: 'teto', texto: x.nome + ': atingiu o nível máximo; o índice pode estar subestimado.' });
    });
    var poucos = areas.filter(function (x) { return x.itens > 0 && x.itens < 4; }).map(function (x) { return x.nome; });
    if (poucos.length) a.push({ tipo: 'poucos', texto: 'Poucas tarefas em: ' + poucos.join(', ') + '. Nessas áreas a estimativa é pouco confiável (a faixa provável foi ampliada).' });
    areas.forEach(function (x) {
      var m = x.metricas;
      if (x.id === 'gn' && m && m.naoAlvos >= 3 && m.comissoes / m.naoAlvos >= 0.35) a.push({ tipo: 'impulsos', texto: 'Toque ou não toque: tocou no tubarão em ' + m.comissoes + ' de ' + m.naoAlvos + ' vezes. Sinal de impulsividade (controle inibitório); comparar com o questionário dos pais/professores.' });
      if (x.id === 'ac' && m) {
        if (m.alvos >= 5 && m.omissoes / m.alvos >= 0.25) a.push({ tipo: 'desatencao', texto: 'Atenção contínua: deixou passar ' + m.omissoes + ' de ' + m.alvos + ' estrelas. Sinal de desatenção sustentada.' });
        if (m.naoAlvos >= 5 && m.comissoes / m.naoAlvos >= 0.2) a.push({ tipo: 'impulsos', texto: 'Atenção contínua: tocou em ' + m.comissoes + ' figuras que não eram estrela. Sinal de impulsividade.' });
        if (m.queda >= 20) a.push({ tipo: 'queda', texto: 'Atenção contínua: o aproveitamento caiu ' + m.queda + ' pontos da primeira para a segunda metade (queda da atenção com o tempo).' });
        if (m.trVariabilidadeMs >= 250) a.push({ tipo: 'oscilacao', texto: 'Tempo de reação muito irregular (variação de ' + m.trVariabilidadeMs + ' ms): a atenção oscila.' });
      }
      if (x.id === 'fo' && x.indice != null && x.indice < 80) a.push({ tipo: 'fonologia', texto: 'Rimas e sons abaixo do esperado para a idade: considerar avaliação de pré-requisitos da alfabetização (triagem para dislexia), audição e estimulação.' });
      if (x.id === 'le' && x.indice != null && x.indice < 80) a.push({ tipo: 'leitura', texto: 'Leitura abaixo do esperado para a idade: investigar decodificação e compreensão com instrumentos específicos.' });
      if (x.id === 'em' && x.indice != null && x.indice < 80) a.push({ tipo: 'social', texto: 'Reconhecimento de emoções e situações sociais abaixo do esperado: considerar avaliação da cognição social (ex.: hipótese de TEA), sempre junto com a observação clínica.' });
    });
    if (sessao.tardia && sessao.tardia.total) {
      var ret = sessao.tardia.acertos / sessao.tardia.total;
      if (ret < 0.5) a.push({ tipo: 'tardia', texto: 'Recordação no fim da sessão: lembrou ' + sessao.tardia.acertos + ' de ' + sessao.tardia.total + ' figuras. Verificar memória de longo prazo (consolidação).' });
    }
    a = a.concat(alertasNovos(sessao, areas));
    var obs = sessao.observacoes || [];
    if (obs.length) a.push({ tipo: 'observacoes', texto: obs.length + ' observação(ões) do avaliador registrada(s) durante a sessão.' });
    return a;
  }

  // ================================================================== REFINO DO DIAGNÓSTICO (pedido do Rinaldo, 30/10/2026)

  // ---------------------------------------------------------------- tipo de item (para a análise de erros)
  var FO_TIPO = ['rima', 'rima', 'som inicial', 'rima', 'som inicial', 'juntar sílabas', 'rima intrusa', 'tamanho da palavra', 'juntar sílabas', 'tamanho da palavra', 'trocar sílaba', 'trocar sílaba', 'tirar sílaba', 'tirar sílaba', 'trocar sílaba', 'tirar sílaba'];
  function subtipoDe(dom, nivel) {
    if (dom === 'fo') return FO_TIPO[nivel - 1];
    if (dom === 'le') return nivel <= 7 ? 'palavra' : 'frase';
    if (dom === 'em') return nivel <= 5 ? 'rosto' : nivel <= 12 ? 'situação' : 'o que o outro pensa';
    if (dom === 'gc') return nivel <= 8 ? 'palavra' : 'definição';
    if (dom === 'gq') return nivel <= 2 ? 'comparar quantidades' : nivel <= 4 ? 'contagem' : nivel <= 6 ? 'juntar e tirar' : [7, 8, 11, 12, 14, 16].indexOf(nivel) >= 0 ? 'sequência numérica' : nivel <= 10 ? 'conta' : 'problema';
    if (dom === 'gf') return nivel <= 8 ? 'sequência' : 'matriz';
    if (dom === 'rv') return nivel <= 6 ? 'o que não combina' : nivel <= 10 ? 'o que combina' : 'analogia';
    return null;
  }
  // "impressão digital" da tarefa: serve para não repetir tarefas na reavaliação (formas paralelas)
  function chaveItem(it) {
    var figs = (it.opcoes || []).map(function (o) { return JSON.stringify(o.fig); }).sort();
    return it.dominio + '|' + it.nivel + '|' + hash(it.fala + '|' + JSON.stringify(it.estimulo || it.sequencia || it.pontos || it.inicio || it.lista || it.enunciado || it.texto || '') + '|' + figs.join(',')).toString(36);
  }

  // ---------------------------------------------------------------- tipo de cada erro (análise qualitativa)
  function figDaOpcao(it, id) { var o = (it.opcoes || []).filter(function (x) { return x.id === id; })[0]; return o ? o.fig : null; }
  function classificarErro(it, resposta, res) {
    if (it.tipo === 'ditado') {
      var esc = String(resposta == null ? '' : resposta).trim().toLowerCase(), sem = function (t) { return t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
      if (!esc) return 'não escreveu';
      if (sem(esc) === sem(it.certo)) return 'acento';
      return somDe(esc) === somDe(it.certo) ? 'erro de regra ortográfica (escreveu como se fala)' : 'erro de som (troca, falta ou sobra de letras)';
    }
    if (it.tipo === 'avaliador' || it.tipo === 'tapping') return null;
    if (res && res.esgotado) return 'tempo esgotado';
    if (it.tipo === 'gonogo') return it.certo === null ? 'tocou sem dever (impulsividade)' : 'deixou passar (omissão)';
    if (it.tipo === 'corsi' || it.tipo === 'digitos') {
      var r = Array.isArray(resposta) ? resposta.map(Number) : [], c = it.certo;
      if (r.length === c.length && r.slice().sort().join() === c.slice().sort().join()) {
        if (it.tipo === 'digitos' && it.inverso && igual(r, it.sequencia)) return 'repetiu na ordem direta (não inverteu)';
        return 'ordem trocada';
      }
      return 'esqueceu ou trocou itens';
    }
    if (it.tipo === 'torre') return res && res.extra && res.extra.resolveu ? 'resolveu com jogadas a mais' : 'não resolveu';
    if (it.tipo === 'pontos') return it.certo.some(function (t) { return /[A-J]/.test(t); }) ? 'erro ao alternar número e letra' : 'erro na sequência simples';
    if (it.tipo === 'reconhecer') { var x = res && res.extra; return x && x.falsos > 0 ? (x.acertos < x.total ? 'esqueceu e marcou figuras que não viu' : 'marcou figuras que não viu') : 'esqueceu figuras'; }
    var escolhida = figDaOpcao(it, resposta), certa = figDaOpcao(it, it.certo);
    if (resposta == null) return 'não respondeu';
    if (it.dominio === 'gv' && escolhida && escolhida.poli && it.estimulo[0] && it.estimulo[0].poli) {
      var esp = rotacoes(espelhar(it.estimulo[0].poli));
      return esp.indexOf(JSON.stringify(escolhida.poli)) >= 0 ? 'espelhamento (inverteu a forma)' : 'escolheu outra forma';
    }
    if (it.dominio === 'gf' && escolhida && certa) {
      var nomes = { f: 'forma', c: 'cor', n: 'quantidade', r: 'rotação', t: 'tamanho' }, dif = Object.keys(nomes).filter(function (k) { return (escolhida[k] || 0) !== (certa[k] || 0); });
      return dif.length === 1 ? 'errou a regra de ' + nomes[dif[0]] : dif.length ? 'errou mais de uma regra (' + dif.map(function (k) { return nomes[k]; }).join(', ') + ')' : 'outra figura';
    }
    if (it.dominio === 'at') return it.condicao === 'contra' ? 'interferência (peixes do lado contrário)' : 'erro sem interferência';
    if (it.dominio === 'fx' && escolhida && it.estimulo[0]) {
      var carta = it.estimulo[0], outraRegra = it.regra === 'cor' ? (escolhida.f === carta.f) : (escolhida.c === carta.c);
      return outraRegra ? 'seguiu a regra errada (perseveração)' : 'outro erro';
    }
    if (it.dominio === 'em' && escolhida && escolhida.e) {
      var nome = Object.keys(EMO).filter(function (k) { return EMO[k] === escolhida.e; })[0];
      return (it.subtipo || 'emoção') + (nome ? ': confundiu com ' + nome : '');
    }
    return it.subtipo ? 'erro em ' + it.subtipo : 'resposta errada';
  }
  var DICA_ERRO = {
    'espelhamento (inverteu a forma)': 'Espelhamentos frequentes são comuns em dificuldades visuoespaciais e na dislexia; observar também na escrita (b/d, p/q).',
    'interferência (peixes do lado contrário)': 'Erros só com peixes contrários indicam dificuldade de filtrar distrações (controle de interferência).',
    'seguiu a regra errada (perseveração)': 'Continuar na regra antiga indica rigidez cognitiva (dificuldade de trocar de estratégia).',
    'repetiu na ordem direta (não inverteu)': 'Não conseguir inverter indica sobrecarga da memória de trabalho (manipular, não só guardar).',
    'ordem trocada': 'Lembrar os itens mas trocar a ordem sugere fragilidade no sequenciamento.',
    'tocou sem dever (impulsividade)': 'Toques indevidos frequentes indicam impulsividade (controle inibitório).',
    'deixou passar (omissão)': 'Omissões frequentes indicam desatenção.',
    'marcou figuras que não viu': 'Falsos reconhecimentos sugerem impulsividade ou memória pouco precisa.',
    'erro ao alternar número e letra': 'Errar só ao alternar indica dificuldade de flexibilidade/atenção alternada.',
    'erro de som (troca, falta ou sobra de letras)': 'Erros de som na escrita (trocar f/v, p/b, omitir letras) indicam dificuldade fonológica, comum na dislexia/disortografia.',
    'erro de regra ortográfica (escreveu como se fala)': 'Escrever como se fala (cassa, exeção) indica regras ortográficas ainda não consolidadas; esperado nos primeiros anos, sinal de alerta depois.'
  };
  // agrupa os erros da sessão por área e por tipo
  function analiseErros(sessao) {
    var porArea = {};
    (sessao.historico || []).forEach(function (h) {
      if (h.treino || h.tardia || h.correto || !h.tipoErro) return;
      var a = porArea[h.dominio] = porArea[h.dominio] || { area: h.dominio, nome: (dominio(h.dominio) || {}).nome, total: 0, tipos: {} };
      a.total++; a.tipos[h.tipoErro] = (a.tipos[h.tipoErro] || 0) + 1;
    });
    return Object.keys(porArea).map(function (k) {
      var a = porArea[k], tipos = Object.keys(a.tipos).map(function (t) { return { tipo: t, vezes: a.tipos[t], dica: DICA_ERRO[t] || null }; }).sort(function (x, y) { return y.vezes - x.vezes; });
      return { area: a.area, nome: a.nome, total: a.total, tipos: tipos };
    });
  }

  // ---------------------------------------------------------------- índices compostos (como nas baterias profissionais)
  // Fidedignidade ASSUMIDA (sem estudo próprio ainda): 0,85 para índice com 2+ áreas, 0,75 com 1 área.
  var INDICES = [
    { id: 'icv', nome: 'Compreensão verbal', sigla: 'ICV', areas: ['gc', 'rv'] },
    { id: 'irf', nome: 'Raciocínio fluido', sigla: 'IRF', areas: ['gf', 'gq'] },
    { id: 'ive', nome: 'Visuoespacial', sigla: 'IVE', areas: ['gv'] },
    { id: 'imt', nome: 'Memória de trabalho', sigla: 'IMT', areas: ['gwm', 'dg', 'di'] },
    { id: 'ivp', nome: 'Velocidade de processamento', sigla: 'IVP', areas: ['gs'] },
    { id: 'iml', nome: 'Memória de longo prazo', sigla: 'IML', areas: ['ml'] }
  ];
  function semIndice(nAreas) { return 15 * Math.sqrt(1 - (nAreas >= 2 ? 0.85 : 0.75)); }
  function indicesCompostos(areas, idadeAnos) {
    var lista = INDICES.map(function (ix) {
      var comp = areas.filter(function (a) { return ix.areas.indexOf(a.id) >= 0 && a.nivel != null; });
      if (!comp.length) return null;
      var nivel = comp.reduce(function (s, a) { return s + a.nivel; }, 0) / comp.length, v = indice(nivel, idadeAnos), sem = semIndice(comp.length);
      return { id: ix.id, nome: ix.nome, sigla: ix.sigla, areas: comp.map(function (a) { return a.nome; }), valor: v, faixa: faixa(v), sem: Math.round(sem * 10) / 10,
        intervalo: [Math.max(40, Math.round(v - 1.96 * sem)), Math.min(160, Math.round(v + 1.96 * sem))] };
    }).filter(Boolean);
    // diferenças entre índices maiores que o acaso (diferença crítica a 95%)
    var discrepancias = [];
    for (var i = 0; i < lista.length; i++) for (var j = i + 1; j < lista.length; j++) {
      var a = lista[i], b = lista[j], critica = Math.round(1.96 * Math.sqrt(a.sem * a.sem + b.sem * b.sem));
      if (Math.abs(a.valor - b.valor) >= critica) discrepancias.push({ maior: a.valor > b.valor ? a.sigla : b.sigla, menor: a.valor > b.valor ? b.sigla : a.sigla, diferenca: Math.abs(a.valor - b.valor), critica: critica });
    }
    // pontos fortes e fracos pessoais: índice longe da média dos próprios índices
    var media = lista.length ? lista.reduce(function (s, x) { return s + x.valor; }, 0) / lista.length : null;
    lista.forEach(function (x) { if (lista.length >= 3) { var d = x.valor - media; x.relativo = Math.abs(d) >= 1.96 * x.sem ? (d > 0 ? 'ponto forte' : 'ponto fraco') : null; } });
    // índice de habilidade geral (sem memória de trabalho e velocidade): útil quando elas puxam o QI para baixo (ex.: TDAH)
    var gaiComp = lista.filter(function (x) { return ['icv', 'irf', 'ive'].indexOf(x.id) >= 0; }), gai = null;
    if (gaiComp.length >= 2) {
      var niv = areas.filter(function (a) { return ['gc', 'rv', 'gf', 'gq', 'gv'].indexOf(a.id) >= 0 && a.nivel != null; });
      var nv = niv.reduce(function (s, a) { return s + a.nivel; }, 0) / niv.length;
      gai = { valor: indice(nv, idadeAnos), faixa: faixa(indice(nv, idadeAnos)) };
    }
    return { indices: lista, discrepancias: discrepancias, habilidadeGeral: gai };
  }

  // ---------------------------------------------------------------- conferência do esforço (validade da sessão)
  function validade(sessao) {
    var h = (sessao.historico || []).filter(function (x) { return !x.treino && !x.tardia; }), sinais = [];
    var escolhas = h.filter(function (x) { return typeof x.resposta === 'string' && x.resposta !== 'toque' && ['gn', 'ac'].indexOf(x.dominio) < 0; });
    var rapidas = escolhas.filter(function (x) { return x.tempoMs < 600; });
    if (escolhas.length >= 8 && rapidas.length / escolhas.length >= 0.25) sinais.push('Respostas rápidas demais (menos de 0,6 s) em ' + rapidas.length + ' de ' + escolhas.length + ' tarefas de escolha: pode ter respondido sem olhar.');
    var repetidas = 0; for (var i = 1; i < escolhas.length; i++) if (escolhas[i].resposta === escolhas[i - 1].resposta) repetidas++;
    if (escolhas.length >= 8 && repetidas / (escolhas.length - 1) >= 0.6) sinais.push('Escolheu muitas vezes seguidas a mesma posição de resposta (' + Math.round(100 * repetidas / (escolhas.length - 1)) + '%): padrão repetitivo.');
    // erros em itens fáceis com acertos em itens bem mais difíceis da mesma área
    var incoerentes = 0;
    (sessao.escadas || []).forEach(function (e) {
      var acertosAltos = e.itens.filter(function (x) { return x.correto; }).map(function (x) { return x.nivel; });
      var maxCerto = acertosAltos.length ? Math.max.apply(null, acertosAltos) : 0;
      incoerentes += e.itens.filter(function (x) { return !x.correto && x.nivel <= 3 && maxCerto >= x.nivel + 5; }).length;
    });
    if (incoerentes >= 3) sinais.push(incoerentes + ' erros em tarefas muito fáceis depois de acertar tarefas bem mais difíceis: desempenho incoerente (atenção oscilante ou pouco esforço).');
    // acertos abaixo do acaso no conjunto das escolhas
    if (escolhas.length >= 15) {
      var acaso = escolhas.reduce(function (s, x) { return s + 1 / Math.max(2, x.nOpcoes || 4); }, 0), acertos = escolhas.filter(function (x) { return x.correto; }).length;
      if (acertos < acaso * 0.8) sinais.push('Acertos abaixo do esperado por acaso (' + acertos + ' de ' + escolhas.length + '): resultado muito provavelmente NÃO reflete a capacidade real.');
    }
    var nivel = !sinais.length ? 'adequada' : sinais.length === 1 && !/acaso/.test(sinais[0]) ? 'atenção' : 'questionável';
    return { nivel: nivel, sinais: sinais };
  }

  // ---------------------------------------------------------------- mudança confiável entre duas avaliações (índice de mudança confiável)
  // Fidedignidade assumida 0,80 para o QI estimado (sem estudo próprio): mudança só é "confiável" se passar do limiar.
  function mudancaConfiavel(antes, depois, fidedignidade) {
    var r = fidedignidade || 0.8, sdif = Math.sqrt(2) * 15 * Math.sqrt(1 - r), limiar = Math.round(1.96 * sdif), delta = depois - antes;
    return { delta: delta, limiar: limiar, confiavel: Math.abs(delta) >= limiar, sentido: Math.abs(delta) < limiar ? 'dentro da variação normal' : delta > 0 ? 'melhora confiável' : 'piora confiável' };
  }

  // ------------------------------------------------------------------ desenho das figuras (SVG, igual no paciente e no avaliador)
  function caminho(f) {
    switch (f) {
      case 'circulo': return '<circle cx="50" cy="50" r="38"/>';
      case 'quadrado': return '<rect x="14" y="14" width="72" height="72" rx="6"/>';
      case 'triangulo': return '<polygon points="50,10 90,86 10,86"/>';
      case 'estrela': return '<polygon points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38"/>';
      case 'coracao': return '<path d="M50 88 L14 52 A20 20 0 0 1 50 22 A20 20 0 0 1 86 52 Z"/>';
      case 'losango': return '<polygon points="50,6 90,50 50,94 10,50"/>';
      case 'hexagono': return '<polygon points="28,10 72,10 94,50 72,90 28,90 6,50"/>';
      case 'cruz': return '<polygon points="36,8 64,8 64,36 92,36 92,64 64,64 64,92 36,92 36,64 8,64 8,36 36,36"/>';
    }
    return '';
  }
  function cor(c) { return CORES[c] || c || '#2f6fe4'; }
  function svg(fig, classe) {
    var ab = '<svg viewBox="0 0 100 100" class="' + (classe || 'fig') + '" aria-hidden="true">', fe = '</svg>';
    if (!fig) return ab + '<rect x="6" y="6" width="88" height="88" rx="14" fill="none" stroke="#9aa8b8" stroke-width="4" stroke-dasharray="8 7"/><text x="50" y="66" font-size="44" text-anchor="middle" fill="#9aa8b8" font-family="Arial" font-weight="700">?</text>' + fe;
    if (fig.e && fig.rotulo) return ab + '<text x="50" y="58" font-size="48" text-anchor="middle">' + fig.e + '</text><text x="50" y="92" font-size="14" text-anchor="middle" font-family="Arial" font-weight="800" fill="#172438">' + String(fig.rotulo).replace(/[&<>]/g, '') + '</text>' + fe;
    if (fig.modelo != null) {
      var L = 'fill="none" stroke="#172438" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';
      var M0 = '<circle cx="50" cy="50" r="34" ' + L + '/><line x1="50" y1="22" x2="50" y2="78" ' + L + '/><line x1="22" y1="50" x2="78" y2="50" ' + L + '/>';
      var M1 = '<rect x="22" y="46" width="56" height="42" ' + L + '/><polygon points="16,46 50,16 84,46" ' + L + '/><rect x="44" y="64" width="13" height="24" ' + L + '/><rect x="28" y="54" width="11" height="11" ' + L + '/><polyline points="66,30 66,18 73,18 73,36" ' + L + '/>';
      var M2 = '<rect x="12" y="28" width="62" height="50" ' + L + '/><line x1="12" y1="28" x2="74" y2="78" ' + L + '/><line x1="74" y1="28" x2="12" y2="78" ' + L + '/><line x1="43" y1="28" x2="43" y2="78" ' + L + '/>' +
        '<polygon points="74,28 94,53 74,78" ' + L + '/><circle cx="24" cy="38" r="6" ' + L + '/><circle cx="22" cy="36" r="0.9" fill="#172438"/><circle cx="26" cy="36" r="0.9" fill="#172438"/><circle cx="24" cy="40.5" r="0.9" fill="#172438"/>' +
        '<polygon points="43,10 50,19 43,28 36,19" ' + L + '/><line x1="56" y1="60" x2="70" y2="60" ' + L + '/><line x1="56" y1="65" x2="70" y2="65" ' + L + '/><line x1="56" y1="70" x2="70" y2="70" ' + L + '/><line x1="56" y1="75" x2="70" y2="75" ' + L + '/>' +
        '<line x1="22" y1="66" x2="30" y2="66" ' + L + '/><line x1="26" y1="62" x2="26" y2="70" ' + L + '/>';
      return ab + [M0, M1, M2][fig.modelo] + fe;
    }
    if (fig.e) {
      var n = fig.n || 1, h = '';
      if (n === 1) h = '<text x="50" y="70" font-size="62" text-anchor="middle">' + fig.e + '</text>';
      else for (var k = 0; k < n; k++) h += '<text x="' + (18 + (k % 3) * 32) + '" y="' + (34 + Math.floor(k / 3) * 32) + '" font-size="26" text-anchor="middle">' + fig.e + '</text>';
      return ab + h + fe;
    }
    if (fig.texto != null) { var tx = String(fig.texto); return ab + '<text x="50" y="60" font-size="' + (tx.length > 9 ? 12 : tx.length > 5 ? 17 : 26) + '" text-anchor="middle" font-family="Arial" font-weight="800" fill="#172438">' + tx.replace(/[&<>]/g, '') + '</text>' + fe; }
    if (fig.escada) {
      var es = fig.escada, xs = function (i) { return (i + 0.5) * 100 / es.n; }, ys = function (y) { return 14 + y * 74; };
      var linhas = ''; for (var li = 0; li < es.n; li++) linhas += '<line x1="' + xs(li) + '" y1="14" x2="' + xs(li) + '" y2="90" stroke="#2d5684" stroke-width="2.2" stroke-linecap="round"/>';
      es.degraus.forEach(function (d) { linhas += '<line x1="' + xs(d.c) + '" y1="' + ys(d.y) + '" x2="' + xs(d.c + 1) + '" y2="' + ys(d.y) + '" stroke="#2d5684" stroke-width="2.2" stroke-linecap="round"/>'; });
      return ab.replace('viewBox="0 0 100 100"', 'viewBox="0 0 100 100" preserveAspectRatio="none"') + linhas + '<text x="' + xs(es.inicio) + '" y="11" font-size="10" text-anchor="middle">🐭</text>' + fe;
    }
    if (fig.torre) {
      var tp = fig.torre.pinos, caps = fig.torre.caps || [3, 2, 1], h = '<rect x="4" y="88" width="92" height="6" rx="3" fill="#8b6b4a"/>';
      for (var pi = 0; pi < 3; pi++) {
        var px = 18 + pi * 32, alt = caps[pi] * 22;
        h += '<rect x="' + (px - 2) + '" y="' + (88 - alt - 4) + '" width="4" height="' + (alt + 4) + '" rx="2" fill="#8b6b4a"/>';
        (tp[pi] || []).forEach(function (b, k) { h += '<circle cx="' + px + '" cy="' + (78 - k * 22) + '" r="10" fill="' + cor(b) + '" stroke="#fff" stroke-width="1.5"/>'; });
      }
      return ab + h + fe;
    }
    if (fig.num != null) return ab + '<text x="50" y="64" font-size="' + (String(fig.num).length > 4 ? 22 : String(fig.num).length > 2 ? 32 : 46) + '" text-anchor="middle" font-family="Arial" font-weight="800" fill="#172438">' + fig.num + '</text>' + fe;
    if (fig.mais || fig.menos) return ab + '<text x="50" y="68" font-size="56" text-anchor="middle" font-family="Arial" font-weight="800" fill="#6b7b90">' + (fig.mais ? '+' : '−') + '</text>' + fe;
    if (fig.seta) return ab + '<g fill="#2f6fe4" transform="' + (fig.seta === 'esq' ? 'scale(-1,1) translate(-100,0)' : '') + '"><rect x="12" y="40" width="50" height="20" rx="6"/><polygon points="58,22 92,50 58,78"/></g>' + fe;
    if (fig.peixe) {
      var corp = cor(fig.c);
      return ab + '<g transform="' + (fig.peixe === 'esq' ? 'scale(-1,1) translate(-100,0)' : '') + '"><polygon points="8,30 26,50 8,70" fill="' + corp + '"/><ellipse cx="54" cy="50" rx="34" ry="22" fill="' + corp + '"/><circle cx="72" cy="45" r="5" fill="#172438"/></g>' + fe;
    }
    if (fig.pontos != null) {
      var P = { 1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[25, 25], [50, 50], [75, 75]], 4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
        6: [[30, 22], [70, 22], [30, 50], [70, 50], [30, 78], [70, 78]], 7: [[30, 22], [70, 22], [30, 50], [50, 50], [70, 50], [30, 78], [70, 78]],
        8: [[30, 20], [70, 20], [30, 40], [70, 40], [30, 60], [70, 60], [30, 80], [70, 80]], 9: [[25, 25], [50, 25], [75, 25], [25, 50], [50, 50], [75, 50], [25, 75], [50, 75], [75, 75]],
        10: [[20, 25], [40, 25], [60, 25], [80, 25], [30, 50], [50, 50], [70, 50], [20, 75], [50, 75], [80, 75]], 11: [[20, 22], [40, 22], [60, 22], [80, 22], [20, 50], [40, 50], [60, 50], [80, 50], [30, 78], [50, 78], [70, 78]] };
      var pts = P[fig.pontos] || P[11];
      return ab + '<rect x="4" y="4" width="92" height="92" rx="14" fill="#fff" stroke="#d6dee8" stroke-width="3"/>' + pts.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="8" fill="' + cor(fig.c) + '"/>'; }).join('') + fe;
    }
    if (fig.poli) {
      var w = Math.max.apply(null, fig.poli.map(function (c) { return c[0]; })) + 1, hh = Math.max.apply(null, fig.poli.map(function (c) { return c[1]; })) + 1;
      var tam = 84 / Math.max(w, hh, 3), ox = (100 - w * tam) / 2, oy = (100 - hh * tam) / 2;
      return ab + fig.poli.map(function (c) { return '<rect x="' + (ox + c[0] * tam) + '" y="' + (oy + c[1] * tam) + '" width="' + (tam - 2) + '" height="' + (tam - 2) + '" rx="2" fill="' + cor(fig.c) + '"/>'; }).join('') + fe;
    }
    var t = fig.t || 1, r = fig.r || 0, cnt = fig.n || 1, corpo = '';
    var borda = fig.borda ? '<rect x="2" y="2" width="96" height="96" rx="12" fill="none" stroke="#111" stroke-width="6"/>' : '';
    if (cnt === 1) corpo = '<g fill="' + cor(fig.c) + '" transform="translate(50 50) scale(' + t + ') rotate(' + r + ') translate(-50 -50)">' + caminho(fig.f) + '</g>';
    else {
      var pos = { 2: [[30, 50], [70, 50]], 3: [[30, 32], [70, 32], [50, 70]], 4: [[30, 30], [70, 30], [30, 70], [70, 70]] }[Math.min(cnt, 4)];
      corpo = pos.map(function (p) { return '<g fill="' + cor(fig.c) + '" transform="translate(' + p[0] + ' ' + p[1] + ') scale(' + (0.36 * t) + ') rotate(' + r + ') translate(-50 -50)">' + caminho(fig.f) + '</g>'; }).join('');
    }
    return ab + borda + corpo + fe;
  }

  // identificador da fala (nome do arquivo de áudio gravado)
  function idFala(texto) { return hash(String(texto).trim()).toString(36); }

  return { chaveItem: chaveItem, classificarErro: classificarErro, analiseErros: analiseErros, indicesCompostos: indicesCompostos, validade: validade, mudancaConfiavel: mudancaConfiavel, INDICES: INDICES,
    idFala: idFala, GRUPOS: GRUPOS, recomendadas: recomendadas, itemTardio: itemTardio, NIVEIS: NIVEIS, DOMINIOS: DOMINIOS, IDADE_REF: IDADE_REF, DP_NIVEIS: DP_NIVEIS, dominio: dominio, gerarItem: gerarItem, itemPublico: itemPublico, corrigir: corrigir,
    novaEscada: novaEscada, registrar: registrar, nivelEstimado: nivelEstimado, idadeDoNivel: idadeDoNivel, nivelEsperado: nivelEsperado, indice: indice, faixa: faixa,
    resultado: resultado, svg: svg, rng: rng,
    PROTOCOLOS: PROTOCOLOS, protocolo: protocolo, itemFim: itemFim, corrigirAvaliador: corrigirAvaliador, limparEntrega: limparEntrega, sugestoes: sugestoes, somDe: somDe,
    refFluencia: refFluencia, refLeituraPpm: refLeituraPpm, FIGURAS: FIGURAS, ORIENT: ORIENT, TEXTOS: TEXTOS, MP_PALAVRAS: MP_POOL.map(function (p) { return p[0]; }) };
});
