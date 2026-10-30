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
    { id: 'em', nome: 'Emoções e situações sociais', chc: 'Cognição social', curto: 'Emoções', grupo: 'social', qi: false, idades: [4, 120], desc: 'Reconhecer emoções em rostos e situações e entender o que o outro pensa.' }
  ];
  var GRUPOS = { inteligencia: 'Inteligência (entra no QI estimado)', executivas: 'Atenção e funções executivas', aprendizagem: 'Aprendizagem (sons e leitura)', social: 'Cognição social' };
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
    return { tipo: 'reconhecer', layout: 'reconhecer', tardia: true, dominio: 'ml', nivel: 0, id: 'it-tardia-' + hash(semente).toString(36),
      fala: 'Lembra das figuras que você memorizou lá no começo? Toque nelas e depois toque em Pronto.', mostrar: [], opcoes: m.opcoes, certo: m.certo, margem: 0, lentoMs: 30000 };
  }
  function reconhecerConferir(it, sel) {
    sel = Array.isArray(sel) ? sel.map(String) : [];
    var acertos = sel.filter(function (s) { return it.certo.indexOf(s) >= 0; }).length, falsos = sel.filter(function (s) { return it.certo.indexOf(s) < 0; }).length;
    return { acertos: acertos, falsos: falsos, total: it.certo.length };
  }

  var GERADORES = { gf: itemGf, gwm: itemGwm, gv: itemGv, gs: itemGs, gc: itemGc, gq: itemGq, at: itemAt, fx: itemFx,
    gn: itemGn, ac: itemAc, fo: itemFo, em: itemEm, cm: itemCm, dg: itemDg, di: itemDi, le: itemLe, to: itemTo, tl: itemTl, rv: itemRv, ml: itemMl };
  function gerarItem(dom, nivel, semente) {
    nivel = Math.max(1, Math.min(NIVEIS, Math.round(nivel)));
    var it = GERADORES[dom](rng(semente + '|' + dom + '|' + nivel), nivel);
    it.dominio = dom; it.nivel = nivel; it.id = 'it-' + hash(semente + dom + nivel).toString(36);
    var st = subtipoDe(dom, nivel); if (st) it.subtipo = st;
    return it;
  }
  // o que vai para a tela do paciente (sem a resposta certa)
  function itemPublico(it) {
    if (!it) return null;
    var x = Object.assign({}, it); delete x.certo; delete x.lentoMs; delete x.palavra; delete x.regra; delete x.condicao; delete x.margem; delete x.alvosFig; delete x.minimo; delete x.subtipo;
    return x;
  }
  function corrigir(it, resposta, tempoMs) {
    var certo, extra = {};
    if (it.tipo === 'gonogo') {  // não tocar no tubarão (ou fora da estrela) é acerto; tocar no peixe a tempo é acerto
      var tocou = resposta === 'toque'; extra = { alvo: it.certo !== null, toque: tocou };
      certo = it.certo === null ? !tocou : tocou && tempoMs <= it.limiteMs;
      return { correto: certo, rapido: certo, esgotado: false, extra: extra };
    }
    if (it.tipo === 'corsi' || it.tipo === 'digitos') certo = Array.isArray(resposta) && igual(resposta.map(Number), it.certo);
    else if (it.tipo === 'torre') { extra = torreConferir(it, resposta && resposta.jogadas); extra.minimo = it.minimo; certo = extra.resolveu && extra.movimentos <= it.minimo; }
    else if (it.tipo === 'pontos') { extra = pontosConferir(it, resposta); certo = extra.completou && extra.erros === 0; }
    else if (it.tipo === 'reconhecer') { extra = reconhecerConferir(it, resposta); certo = extra.acertos >= extra.total - (it.margem || 0) && extra.falsos <= (it.margem || 0); }
    else certo = resposta === it.certo;
    var esgotado = !!(it.limiteMs && tempoMs > it.limiteMs);
    if (esgotado) certo = false;
    return { correto: certo, rapido: certo && (!it.lentoMs || tempoMs <= it.lentoMs), esgotado: esgotado, extra: extra };
  }

  // ------------------------------------------------------------------ escada adaptativa (uma por área)
  function novaEscada(dom, opcoes) {
    opcoes = opcoes || {};
    var d = dominio(dom) || {};
    return { dominio: dom, nivel: Math.max(1, Math.min(NIVEIS, opcoes.inicio || 1)), maxItens: d.fixo ? d.fixoItens : (opcoes.maxItens || 10), fixo: !!d.fixo, itens: [], reversoes: [],
      direcao: 0, teveErro: false, errosSeguidos: 0, terminado: false, motivoFim: '', treinoFeito: !!opcoes.semTreino };
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
    return null;
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
    return it.dominio + '|' + it.nivel + '|' + hash(it.fala + '|' + JSON.stringify(it.estimulo || it.sequencia || it.pontos || it.inicio || '') + '|' + figs.join(',')).toString(36);
  }

  // ---------------------------------------------------------------- tipo de cada erro (análise qualitativa)
  function figDaOpcao(it, id) { var o = (it.opcoes || []).filter(function (x) { return x.id === id; })[0]; return o ? o.fig : null; }
  function classificarErro(it, resposta, res) {
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
    'erro ao alternar número e letra': 'Errar só ao alternar indica dificuldade de flexibilidade/atenção alternada.'
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
    resultado: resultado, svg: svg, rng: rng };
});
