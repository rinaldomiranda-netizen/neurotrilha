/* NeuroTrilha (RMD) — aplicação adaptativa: preparar a sessão, acompanhar AO VIVO o que o paciente faz,
   controlar (pausar, subir/descer nível, pular área, encerrar, repetir a fala, anotar) e o relatório completo
   com QI estimado e o parecer do profissional. Usa as funções da tela principal (api, esc, db, switchView, toast...). */
(function () {
  "use strict";
  var M = window.RmdMotor;
  var st = { sessao: null, timer: null, ultimaVersao: 0, lista: [] };
  var $ = function (id) { return document.getElementById(id); };
  var NOME_STATUS = { aguardando: "Aguardando o paciente", em_andamento: "Em andamento", pausada: "Pausada", concluida: "Concluída", encerrada: "Encerrada pelo avaliador" };
  var NOME_FIM = { itens: "limite de itens", estavel: "nível estabilizado", piso: "não alcançou o nível inicial", teto: "atingiu o nível máximo", pulado: "pulada pelo avaliador" };
  var DECISAO = { aceito: "Aceito pelo profissional", aceito_ressalvas: "Aceito com ressalvas", nao_aceito: "Não aceito pelo profissional" };
  var COMP = [["cooperacao", "Cooperação"], ["atencao", "Atenção à tarefa"], ["humor", "Humor / afeto"], ["linguagem", "Linguagem e comunicação"], ["atividade", "Agitação motora"], ["ansiedade", "Ansiedade"], ["compreensao", "Compreensão das instruções"]];
  var COMP_NIVEL = { adequado: "Adequado", parcial: "Parcialmente prejudicado", prejudicado: "Prejudicado" };
  var FLAGS = ["Repetiu a instrução", "Distraído(a)", "Cansado(a)", "Precisou de ajuda", "Interrompeu", "Recusou", "Ansioso(a)", "Muito rápido / impulsivo"];

  TITLES.adaptive = ["Aplicação adaptativa", "Do mais fácil ao mais difícil, ajustado pela resposta e pelo tempo — acompanhe ao vivo."];

  function pessoa(pid) { return (db.participants || []).filter(function (p) { return p.id === pid; })[0] || null; }
  function idadeTexto(anos) { if (anos == null) return "—"; var a = Math.floor(anos), m = Math.floor((anos - a) * 12); return a + " anos e " + m + " meses"; }
  function numero(v, casas) { return v == null ? "—" : String(Math.round(v * Math.pow(10, casas || 0)) / Math.pow(10, casas || 0)).replace(".", ","); }
  function seg(ms) { return ms == null ? "—" : numero(ms / 1000, 1) + " s"; }
  function dataHora(s) { return s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"; }

  // ---------------------------------------------------------------- preparar
  function prepararSetup() {
    var sel = $("ad-participante"), atual = sel.value;
    sel.innerHTML = '<option value="">Escolha a ficha…</option>' + (db.participants || []).map(function (p) {
      var a = ageForParticipant(p); return '<option value="' + esc(p.id) + '">' + esc(p.name) + " · " + esc(p.code || "") + (a ? " · " + a.years + " anos" : "") + "</option>";
    }).join("");
    if (atual) sel.value = atual;
    if (!$("ad-dominios").children.length) {
      $("ad-dominios").innerHTML = Object.keys(M.GRUPOS).map(function (g) {
        return '<div class="ad-grupo"><b>' + esc(M.GRUPOS[g]) + "</b>" + M.DOMINIOS.filter(function (d) { return d.grupo === g; }).map(function (d) {
          return '<label class="ad-dom"><input type="checkbox" value="' + d.id + '"><span><b>' + esc(d.nome) + "</b><small>" + esc(d.chc) + " · " + esc(d.desc) + " (" + d.idades[0] + (d.idades[1] < 100 ? " a " + d.idades[1] + " anos" : " anos ou mais") + ")</small></span></label>";
        }).join("") + "</div>";
      }).join("") + '<div class="ad-atalhos"><button type="button" class="quiet" data-marcar="rec">Recomendadas para a idade</button><button type="button" class="quiet" data-marcar="qi">Só as do QI</button><button type="button" class="quiet" data-marcar="todas">Todas</button><button type="button" class="quiet" data-marcar="nenhuma">Nenhuma</button></div>' +
        '<div class="ad-atalhos"><span class="small muted">Conjuntos prontos:</span>' + Object.keys(M.PROTOCOLOS).map(function (k) { return '<button type="button" class="quiet" data-protocolo="' + k + '">' + esc(M.PROTOCOLOS[k].nome) + "</button>"; }).join("") + '</div><p class="small muted" id="ad-duracao"></p>';
      $("ad-dominios").addEventListener("click", function (ev) { var b = ev.target.closest("[data-marcar]"); if (b) marcar(b.dataset.marcar); var pr = ev.target.closest("[data-protocolo]"); if (pr) aplicarProtocolo(pr.dataset.protocolo); });
      $("ad-dominios").addEventListener("change", duracao);
      $("ad-itens").addEventListener("change", duracao);
    }
    atualizarDica();
  }
  function idadeEscolhida() { var p = pessoa($("ad-participante").value), a = p ? ageForParticipant(p) : null; return a ? a.years + a.months / 12 : 8; }
  // marca as áreas: recomendadas para a idade, só as do QI, todas ou nenhuma (o profissional pode ajustar depois)
  function marcar(modo) {
    var idade = idadeEscolhida(), rec = M.recomendadas(idade); st.curta = false;
    document.querySelectorAll("#ad-dominios input[type=checkbox]").forEach(function (x) {
      var d = M.dominio(x.value), cabe = idade >= d.idades[0] && idade <= d.idades[1];
      x.checked = modo === "rec" ? rec.indexOf(d.id) >= 0 : modo === "qi" ? d.qi && cabe : modo === "todas" ? cabe : false;
    });
    duracao();
  }
  function duracao() {
    var marcadas = [].slice.call(document.querySelectorAll("#ad-dominios input:checked")).map(function (x) { return M.dominio(x.value); });
    var itens = Number($("ad-itens").value) || 10, seg = marcadas.reduce(function (t, d) { return t + (d.fixo ? ({ ac: 120, mp: st.curta ? 200 : 320, fv: 150, lx: 240, dc: 240, rl: 120, tp: 80, tr: 90, or: 120 }[d.id] || 120) : (itens + 1) * (d.grupo === "inteligencia" ? 13 : 9)); }, 0);
    $("ad-duracao").textContent = marcadas.length ? marcadas.length + " área(s) marcada(s) · duração estimada ≈ " + Math.max(1, Math.round(seg / 60)) + " minutos (pode variar com o ritmo da pessoa)." : "Nenhuma área marcada.";
  }
  function atualizarDica() {
    var p = pessoa($("ad-participante").value), el = $("ad-dica");
    if (document.querySelector("#ad-dominios [data-marcar]")) marcar("rec");
    if (!p) { el.textContent = "Escolha a ficha do participante. A idade serve para comparar o resultado; as tarefas sempre começam no nível mais fácil."; return; }
    var a = ageForParticipant(p);
    el.textContent = a ? "Idade: " + ageText(a) + ". " + (a.years < 8 ? "Instruções só faladas e respostas por figuras (não precisa ler)." : "Pode ler: as instruções aparecem escritas e também são faladas.") : "Data de nascimento inválida na ficha.";
  }
  async function iniciar() {
    var pid = $("ad-participante").value, doms = [].slice.call(document.querySelectorAll("#ad-dominios input:checked")).map(function (x) { return x.value; });
    var msg = $("ad-erro"); msg.textContent = "";
    if (!pid) { msg.textContent = "Escolha a ficha do participante."; return; }
    if (!doms.length) { msg.textContent = "Escolha pelo menos uma área."; return; }
    var leitor = $("ad-leitor").value;
    try {
      var s = await api("/api/adaptativa", { method: "POST", body: JSON.stringify({ participantId: pid, dominios: doms, maxItens: Number($("ad-itens").value), curta: st.curta, leitor: leitor === "auto" ? undefined : leitor === "sim" }) });
      abrirSessao(s); toast("Sessão criada. Abra a tela do paciente.");
    } catch (e) { msg.textContent = e.message; }
  }

  // ---------------------------------------------------------------- ao vivo
  function linkPaciente(s, host) {
    var base = host ? location.protocol + "//" + host + ":" + location.port + "/" : location.href.replace(/[?#].*$/, "").replace(/[^/]*$/, "");
    return base + "paciente.html?t=" + encodeURIComponent(s.token);
  }
  function abrirSessao(s) {
    st.sessao = s; st.ultimaVersao = 0;
    $("ad-setup").classList.add("hidden"); $("ad-lista-painel").classList.add("hidden"); $("ad-relatorio").classList.add("hidden"); $("ad-aovivo").classList.remove("hidden");
    desenharAoVivo(s); vigiar();
  }
  function vigiar() {
    clearInterval(st.timer);
    st.timer = setInterval(async function () {
      if (!st.sessao || !$("view-adaptive").classList.contains("active") || $("ad-aovivo").classList.contains("hidden")) return;
      try { var s = await api("/api/adaptativa/" + encodeURIComponent(st.sessao.id)); st.sessao = s; desenharAoVivo(s); if (["concluida", "encerrada"].indexOf(s.status) >= 0) clearInterval(st.timer); } catch (e) { /* tenta de novo */ }
    }, 1000);
  }
  async function controle(acao, extra) {
    if (!st.sessao) return;
    try { var s = await api("/api/adaptativa/" + encodeURIComponent(st.sessao.id) + "/controle", { method: "POST", body: JSON.stringify(Object.assign({ acao: acao }, extra || {})) }); st.sessao = s; desenharAoVivo(s); if (acao === "encerrar") toast("Sessão encerrada."); }
    catch (e) { toast(e.message); }
  }
  function desenharAoVivo(s) {
    var p = pessoa(s.participantId), r = s.resultado || {}, fim = ["concluida", "encerrada"].indexOf(s.status) >= 0;
    $("ad-av-nome").textContent = p ? p.name + " · " + (p.code || "") : "Participante";
    $("ad-av-sub").textContent = "Idade " + idadeTexto(s.idadeAnos) + " · " + (s.leitor ? "lê as instruções" : "instruções faladas, sem leitura") + " · iniciada " + dataHora(s.criadoEm);
    $("ad-av-status").textContent = NOME_STATUS[s.status] || s.status; $("ad-av-status").className = "pill ad-st-" + s.status;
    var link = linkPaciente(s);
    $("ad-link").value = link;
    // pela internet: o tablet mostra um código e o avaliador manda a sessão para ele (campo fixo, não é redesenhado)
    var parear = $("ad-parear");
    if (parear) { parear.classList.toggle("hidden", !s.nuvem || ["concluida", "encerrada"].indexOf(s.status) >= 0); $("ad-parear-status").textContent = s.estacao ? "Enviada para o tablet " + s.estacao.slice(0, 3) + " " + s.estacao.slice(3) + "." : ""; }
    $("ad-rede").innerHTML = s.nuvem ? "No tablet, abra o aplicativo NeuroTrilha (modo Paciente) e digite aqui o código que aparece na tela dele." :
      s.rede && s.rede.enderecos.length ? "No tablet (mesmo Wi-Fi), abra: " + s.rede.enderecos.map(function (ip) { return "<b>" + esc(linkPaciente(s, ip)) + "</b>"; }).join(" ou ") :
      "Para usar num tablet, abra o programa pelo atalho <b>“NeuroTrilha - Tablet (rede)”</b>. Agora ele só aceita esta tela neste computador (uma segunda janela ou um segundo monitor).";
    ["pausar", "continuar", "subir", "descer", "pular", "repetir", "encerrar", "encontro"].forEach(function (a) { var b = $("ad-c-" + a); if (b) b.disabled = fim; });
    $("ad-c-encontro").classList.toggle("hidden", s.status === "pausada");
    if (s.pausaEncontro) $("ad-av-status").textContent = "Encontro encerrado · continua em outro dia";
    // observação do comportamento: aparece no fim; preenche uma vez por sessão (não apaga o que o avaliador está marcando)
    $("ad-comportamento").classList.toggle("hidden", !fim);
    if (fim && st.compSessao !== s.id) {
      st.compSessao = s.id; var c = s.comportamento || {}, itens = c.itens || {};
      document.querySelectorAll("#ad-comp-campos input").forEach(function (x) { x.checked = itens[x.name.slice(5)] === x.value; });
      $("ad-comp-recursos").value = c.recursos || ""; $("ad-comp-nota").value = c.nota || "";
    }
    $("ad-c-pausar").classList.toggle("hidden", s.status === "pausada"); $("ad-c-continuar").classList.toggle("hidden", s.status !== "pausada");
    $("ad-ver-relatorio").classList.toggle("hidden", !fim);
    // tarefa da vez (com a resposta certa marcada, só para o avaliador)
    var it = s.item, area = it ? M.dominio(it.dominio) : null;
    // só redesenha a tarefa quando algo mudou (senão um toque no painel de pontuação pode se perder no meio da atualização)
    var htmlTarefa = !it ? '<div class="empty"><b>' + (fim ? "Sessão terminada" : "Sem tarefa agora") + "</b>" + (fim ? "Abra o relatório completo." : "") + "</div>" :
      it.tipo === "avaliador" ? '<div class="ad-tarefa-cab"><span class="pill">' + esc(area.nome) + '</span><span><b>Você pontua esta tarefa</b></span></div><p class="ad-fala">🗣️ “' + esc(it.fala) + "”</p>" + painelPontuar(it) :
      '<div class="ad-tarefa-cab"><span class="pill">' + esc(area.nome) + "</span><span>" + (M.dominio(it.dominio).fixo ? "Bloco fixo" : "Nível <b>" + it.nivel + "</b> de 16") + (it.treino ? " · <b>treino</b> (não conta)" : "") + "</span></div>" +
      '<p class="ad-fala">🗣️ “' + esc(it.fala) + "”</p>" + espelho(it) + '<p class="small muted">Contorno verde = resposta certa' + (it.limiteMs ? " · tempo limite " + seg(it.limiteMs) : "") + ".</p>";
    if (htmlTarefa !== st.htmlTarefa) { st.htmlTarefa = htmlTarefa; $("ad-tarefa").innerHTML = htmlTarefa; }
    // áreas
    $("ad-areas").innerHTML = '<table class="table ad-tab"><thead><tr><th>Área</th><th>Itens</th><th>Acertos</th><th>Nível agora</th><th>Nível alcançado</th><th>Índice</th><th></th></tr></thead><tbody>' +
      s.escadas.map(function (e, i) {
        var a = (r.areas || [])[i] || {};
        return "<tr" + (i === s.atual && !fim ? ' class="ad-agora"' : "") + "><td><b>" + esc(M.dominio(e.dominio).nome) + "</b></td><td>" + e.itens.length + "/" + e.maxItens + "</td><td>" + (a.acertos || 0) + "</td><td>" + (e.terminado ? "—" : e.nivel) +
          "</td><td>" + numero(a.nivel, 1) + "</td><td>" + (a.indice == null ? "—" : "<b>" + a.indice + "</b>") + "</td><td class=\"small muted\">" + (e.terminado ? esc(NOME_FIM[e.motivoFim] || "concluída") : i === s.atual ? "em andamento" : "") + "</td></tr>";
      }).join("") + "</tbody></table>";
    // curva da área atual
    var e = s.escadas[Math.min(s.atual, s.escadas.length - 1)];
    $("ad-curva").innerHTML = e ? "<h4>Escada de dificuldade · " + esc(M.dominio(e.dominio).nome) + "</h4>" + curva(e.itens, 320, 120) : "";
    // estimativa parcial
    $("ad-parcial").innerHTML = r.qiEstimado == null ? '<div class="small muted">A estimativa aparece depois das primeiras respostas.</div>' :
      '<div class="ad-qi"><span>QI estimado' + (fim ? "" : " (parcial)") + "</span><b>" + r.qiEstimado + '</b><small>faixa provável ' + r.intervalo[0] + "–" + r.intervalo[1] + " · " + esc(r.faixa) + "</small></div>" +
      '<div class="small muted">Idade de desempenho ≈ ' + numero(r.idadeDesempenho, 1) + " anos (idade real " + numero(s.idadeAnos, 1) + ").</div>";
    // últimas respostas
    var hist = (s.historico || []).slice(-8).reverse();
    $("ad-respostas").innerHTML = hist.length ? hist.map(function (h) {
      return '<div class="ad-resp ' + (h.treino ? "treino" : h.correto ? "ok" : "erro") + '"><span>' + (h.treino ? "Treino" : h.correto ? (h.rapido ? "✔ certo" : "✔ certo, lento") : h.esgotado ? "⏱ tempo esgotado" : "✖ errado") +
        "</span><span>" + esc(M.dominio(h.dominio).curto) + " · nível " + h.nivel + "</span><span>" + seg(h.tempoMs) + "</span></div>";
    }).join("") : '<div class="small muted">Nenhuma resposta ainda.</div>';
    // alertas
    $("ad-alertas").innerHTML = (r.alertas || []).filter(function (a) { return a.tipo !== "observacoes"; }).map(function (a) { return '<div class="notice">' + esc(a.texto) + "</div>"; }).join("");
  }
  // espelho da tarefa (mesmo desenho que o paciente vê)
  function espelho(it) {
    var mini = function (f, cls) { return '<span class="ad-casa ' + (cls || "") + '">' + M.svg(f) + "</span>"; };
    var h = "";
    if (it.tipo === "ditado") return '<p>Palavra: <b style="font-size:24px">' + esc(it.certo) + "</b> · " + esc(it.regra) + "</p>";
    if (it.tipo === "tapping") return "<p>Toque rápido por 10 segundos · mão <b>" + esc(it.mao) + "</b>.</p>";
    if (it.layout === "textos") return (it.textoApoio ? '<p class="small">' + esc(it.textoApoio) + "</p>" : "") + "<p><b>" + esc(it.enunciado || "") + '</b></p><ol class="ad-opcoes-texto">' + it.opcoes.map(function (o) { return '<li class="' + (o.id === it.certo ? "certa" : "") + '">' + esc(o.fig.texto) + "</li>"; }).join("") + "</ol>";
    if (it.tipo === "gonogo") return '<div class="ad-linha">' + mini(it.estimulo[0], it.certo ? "certa" : "") + '</div><p><b>' + (it.certo ? "Certo: TOCAR" : "Certo: NÃO tocar") + "</b> · limite " + seg(it.limiteMs) + "</p>";
    if (it.tipo === "digitos") return '<p class="ad-fala" style="font-size:22px;letter-spacing:.2em"><b>' + it.sequencia.join(" ") + "</b></p><p>" + (it.inverso ? "De trás para frente: <b>" + it.certo.join(" ") + "</b>" : "Na mesma ordem") + "</p>";
    if (it.tipo === "torre") return '<div class="ad-linha">' + mini({ torre: { pinos: it.inicio, caps: it.capacidades } }) + '<span style="align-self:center">→</span>' + mini({ torre: { pinos: it.meta, caps: it.capacidades } }, "certa") + "</div><p>Mínimo de <b>" + it.minimo + "</b> jogada(s).</p>";
    if (it.tipo === "pontos") return "<p>Ordem certa: <b>" + it.certo.join(" → ") + "</b></p>";
    if (it.tipo === "reconhecer") return (it.tardia ? "<p><b>Recordação do fim da sessão</b> (" + (it.dominio === "mp" ? "palavras da lista" : "figuras do começo") + ").</p>" : "") + '<div class="ad-linha">' + it.opcoes.map(function (o) { return mini(o.fig, it.certo.indexOf(o.id) >= 0 ? "certa" : ""); }).join("") + "</div>";
    if (it.layout === "leitura") return '<p class="ad-fala"><b>' + esc(it.estimulo[0].texto) + "</b></p>" + '<div class="ad-linha">' + it.opcoes.map(function (o) { return mini(o.fig, o.id === it.certo ? "certa" : ""); }).join("") + "</div>";
    if (it.tipo === "corsi") {
      var g = it.grade, cel = []; for (var i = 0; i < g * g; i++) { var k = it.sequencia.indexOf(i); cel.push('<span class="ad-cel' + (k >= 0 ? " on" : "") + '">' + (k >= 0 ? k + 1 : "") + "</span>"); }
      return '<div class="ad-corsi" style="grid-template-columns:repeat(' + g + ',34px)">' + cel.join("") + '</div><p class="small muted">Ordem certa: ' + it.sequencia.map(function (x) { return x + 1; }).join(" → ") + "</p>";
    }
    // matriz: mostra em quadro (2x2 ou 3x3), igual ao que o paciente vê
    var colunas = it.layout === "matriz3" ? 3 : it.layout === "matriz2" ? 2 : 0;
    if (it.estimulo && it.estimulo.length) h += '<div class="ad-linha"' + (colunas ? ' style="display:grid;grid-template-columns:repeat(' + colunas + ',62px);gap:6px"' : "") + ">" + it.estimulo.map(function (f) { return mini(f); }).join("") + "</div>";
    h += '<div class="ad-linha">' + it.opcoes.map(function (o) { return mini(o.fig, o.id === it.certo ? "certa" : ""); }).join("") + "</div>";
    return h;
  }
  // gráfico da escada: um ponto por item (verde acerto, vermelho erro)
  function curva(itens, w, h) {
    if (!itens.length) return '<div class="small muted">Ainda sem itens nesta área.</div>';
    var n = Math.max(itens.length, 6), x = function (i) { return 30 + i * ((w - 40) / (n - 1)); }, y = function (v) { return h - 18 - (v - 1) * ((h - 30) / 15); };
    var linhas = [1, 4, 8, 12, 16].map(function (v) { return '<line x1="26" x2="' + (w - 6) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#e4ebf3"/><text x="4" y="' + (y(v) + 4) + '" font-size="10" fill="#8796a8">' + v + "</text>"; }).join("");
    var caminho = itens.map(function (it, i) { return (i ? "L" : "M") + x(i) + " " + y(it.nivel); }).join(" ");
    var pts = itens.map(function (it, i) { return '<circle cx="' + x(i) + '" cy="' + y(it.nivel) + '" r="5" fill="' + (it.correto ? "#1f9d6b" : "#e5484d") + '"/>'; }).join("");
    return '<svg viewBox="0 0 ' + w + " " + h + '" class="ad-curva" role="img" aria-label="Níveis apresentados">' + linhas + '<path d="' + caminho + '" fill="none" stroke="#2f6fe4" stroke-width="2"/>' + pts + "</svg>";
  }
  async function salvarComportamento() {
    var c = { recursos: $("ad-comp-recursos").value.trim(), nota: $("ad-comp-nota").value.trim() };
    COMP.forEach(function (k) { var m = document.querySelector('#ad-comp-campos input[name="comp-' + k[0] + '"]:checked'); if (m) c[k[0]] = m.value; });
    await controle("comportamento", { comportamento: c }); toast("Observação do comportamento salva.");
  }
  async function observar() {
    var flags = [].slice.call(document.querySelectorAll("#ad-flags input:checked")).map(function (x) { return x.value; }), nota = $("ad-nota").value.trim();
    if (!flags.length && !nota) { toast("Marque uma observação ou escreva uma nota."); return; }
    await controle("observacao", { flags: flags, nota: nota });
    document.querySelectorAll("#ad-flags input").forEach(function (x) { x.checked = false; }); $("ad-nota").value = ""; toast("Observação registrada.");
  }

  // ---------------------------------------------------------------- lista de sessões
  async function listar() {
    var host = $("ad-lista");
    try {
      var d = await api("/api/adaptativa"); st.lista = d.sessoes || [];
      host.innerHTML = st.lista.length ? '<table class="table"><thead><tr><th>Participante</th><th>Data</th><th>Situação</th><th>Áreas</th><th>QI estimado</th><th>Parecer</th><th></th></tr></thead><tbody>' + st.lista.map(function (x) {
        var p = pessoa(x.participantId), fim = ["concluida", "encerrada"].indexOf(x.status) >= 0;
        return "<tr><td><b>" + esc(p ? p.name : "—") + '</b><br><span class="small muted">' + esc(p ? p.code : "") + "</span></td><td>" + dataHora(x.criadoEm) + "</td><td>" + esc(NOME_STATUS[x.status] || x.status) + (x.modo === "estimulacao" ? ' <span class="pill">estimulação</span>' : "") + "</td><td>" + (x.dominios || []).length +
          "</td><td>" + (x.qiEstimado == null ? "—" : "<b>" + x.qiEstimado + "</b>") + "</td><td>" + (x.parecer ? esc(DECISAO[x.parecer.decisao]) : '<span class="small muted">pendente</span>') +
          '</td><td><button class="secondary" data-ad-abrir="' + esc(x.id) + '" data-fim="' + (fim ? 1 : 0) + '">' + (fim ? "Relatório" : "Acompanhar") + "</button></td></tr>";
      }).join("") + "</tbody></table>" : '<div class="empty"><b>Nenhuma aplicação adaptativa ainda</b>Prepare a primeira acima.</div>';
    } catch (e) { host.innerHTML = '<div class="notice danger-note">' + esc(e.message) + "</div>"; }
  }
  async function abrirPorId(id, relatorio) {
    try { var s = await api("/api/adaptativa/" + encodeURIComponent(id)); if (relatorio) mostrarRelatorio(s); else abrirSessao(s); } catch (e) { toast(e.message); }
  }
  function voltar() {
    clearInterval(st.timer); st.sessao = null;
    ["ad-aovivo", "ad-relatorio"].forEach(function (x) { $(x).classList.add("hidden"); });
    $("ad-setup").classList.remove("hidden"); $("ad-lista-painel").classList.remove("hidden"); prepararSetup(); listar();
  }

  // ================================================================ AMPLIAÇÃO (30/10/2026): pontuar no celular, relatório novo, devolutiva, estimulação
  st.marcas = {}; st.curta = false;
  // conjuntos prontos (avaliação rápida, escolar, TDAH, TEA, idoso)
  function aplicarProtocolo(id) {
    var idade = idadeEscolhida(), p = M.protocolo(id, idade); if (!p) return;
    document.querySelectorAll("#ad-dominios input[type=checkbox]").forEach(function (x) { x.checked = p.areas.indexOf(x.value) >= 0; });
    var sel = $("ad-itens"); if (sel && [].some.call(sel.options, function (o) { return Number(o.value) === p.itens; })) sel.value = String(p.itens);
    st.curta = p.curta; duracao(); toast(p.nome + ": " + p.areas.length + " área(s) marcada(s).");
  }
  function marcasDe(it) { return st.marcas[it.id] || (st.marcas[it.id] = { marcadas: [], intrusoes: 0, repeticoes: 0, validas: 0, notas: [], autocorrecoes: 0 }); }
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function esperadoOrientacao(q) {
    var d = new Date();
    return { dia_semana: d.toLocaleDateString("pt-BR", { weekday: "long" }), dia_mes: String(d.getDate()), mes: MESES[d.getMonth()], ano: String(d.getFullYear()),
      hora: d.getHours() + "h (aceite até 1 hora de diferença)", cidade: "a cidade onde vocês estão", lugar: "o tipo de lugar (clínica, consultório, escola, casa)" }[q] || "—";
  }
  // painel para o avaliador pontuar a tarefa falada/desenhada (as marcas ficam guardadas enquanto a tela se atualiza)
  function painelPontuar(it) {
    var pc = it.pontuacao || {}, m = marcasDe(it), ent = it.entrega || null, h = '<div class="ad-pontuar">';
    var cont = function (c, rot) { return '<span class="ad-cont"><button type="button" class="quiet" data-pt="menos" data-c="' + c + '">−</button><b>' + m[c] + '</b><button type="button" class="quiet" data-pt="mais" data-c="' + c + '">+</button> ' + esc(rot) + "</span>"; };
    if (pc.modo === "palavras") {
      h += "<p><b>Toque nas palavras que a pessoa DISSE</b>" + (it.ensaio ? " (rodada " + it.ensaio + ")" : " (lembrança no fim da sessão, sem ouvir de novo)") + ":</p><div class=\"ad-chips\">" +
        pc.palavras.map(function (w, i) { return '<button type="button" data-pt="palavra" data-i="' + i + '" class="' + (m.marcadas.indexOf(i) >= 0 ? "on" : "") + '">' + esc(w) + "</button>"; }).join("") + "</div>" +
        "<p>" + cont("intrusoes", "palavras que não eram da lista") + " " + cont("repeticoes", "repetições") + '</p><p class="small muted">' + m.marcadas.length + " de " + pc.palavras.length + " palavras.</p>";
    } else if (pc.modo === "contador") {
      h += '<p class="small">' + esc(pc.regra) + '</p><div class="ad-contador"><button type="button" class="primary" data-pt="mais" data-c="validas">+1 palavra certa</button><b class="ad-total">' + m.validas + '</b><button type="button" class="quiet" data-pt="menos" data-c="validas">−1</button></div>' +
        "<p>" + cont("repeticoes", "repetições") + " " + cont("intrusoes", "fora da regra") + "</p>" +
        (ent ? '<p class="small"><b>O minuto terminou no tablet.</b>' + (ent.transcricao ? " Transcrição automática (pode ter erros): <i>" + esc(ent.transcricao) + "</i>" : "") + "</p>" : '<p class="small muted">O tablet mostra 1 minuto. Conte enquanto a pessoa fala.</p>');
    } else if (pc.modo === "checklist") {
      h += (ent && ent.desenho ? '<img class="ad-desenho" src="' + ent.desenho + '" alt="Desenho feito pelo paciente">' : '<p class="small muted">Aguardando a pessoa desenhar e tocar em Pronto…</p>') +
        (it.modelo != null ? '<p class="small muted">Modelo:</p><span class="ad-casa" style="width:110px;height:110px">' + M.svg({ modelo: it.modelo }) + "</span>" : "") +
        '<table class="table"><tbody>' + pc.elementos.map(function (el, i) {
          return "<tr><td>" + esc(el) + "</td><td>" + pc.escala.map(function (rot, k) { return '<button type="button" class="quiet ad-nota' + (m.notas[i] === k ? " on" : "") + '" data-pt="nota" data-i="' + i + '" data-v="' + k + '">' + esc(rot) + "</button>"; }).join(" ") + "</td></tr>"; }).join("") + "</tbody></table>";
    } else if (pc.modo === "certoerrado") {
      return h + '<p class="ad-fala"><b>' + esc(it.fala) + '</b></p><p class="small">Resposta certa: <b>' + esc(esperadoOrientacao(pc.pergunta)) + '</b></p><div class="ad-contador"><button type="button" class="success" data-pt="certo">✔ Certo</button><button type="button" class="danger" data-pt="errado">✖ Errado</button></div></div>';
    } else if (pc.modo === "erros") {
      h += "<p><b>Toque nas palavras lidas com ERRO</b> (trocou, pulou ou inventou):</p><div class=\"ad-texto-erros\">" + pc.palavras.map(function (w, i) { return '<span data-pt="erro" data-i="' + i + '" class="' + (m.marcadas.indexOf(i) >= 0 ? "on" : "") + '">' + esc(w) + "</span>"; }).join(" ") + "</div>" +
        "<p>" + cont("autocorrecoes", "autocorreções") + " · erros marcados: <b>" + m.marcadas.length + "</b></p>" +
        (ent && ent.tempoMs ? "<p>Tempo de leitura: <b>" + seg(ent.tempoMs) + "</b> · ≈ <b>" + Math.round((it.palavras - m.marcadas.length) / (ent.tempoMs / 60000)) + "</b> palavras corretas por minuto.</p>" +
          (it.palavras / (ent.tempoMs / 60000) > 400 ? '<div class="notice danger-note">Tempo curto demais para ter lido o texto (talvez tocou em Terminei sem querer). As palavras por minuto não serão calculadas.</div>' : "") : '<p class="small muted">Aguardando a pessoa tocar em Terminei (o tempo é medido no tablet)…</p>');
    }
    return h + '<button type="button" class="primary" data-pt="salvar">Salvar e ir para a próxima</button></div>';
  }
  async function enviarPontuacao(it, p) { await controle("pontuar", { itemId: it.id, pontuacao: p }); delete st.marcas[it.id]; }
  function cliquePontuar(ev) {
    var b = ev.target.closest("[data-pt]"); if (!b || !st.sessao || !st.sessao.item) return;
    var it = st.sessao.item, pc = it.pontuacao || {}, m = marcasDe(it), a = b.dataset.pt, i = Number(b.dataset.i);
    if (a === "palavra" || a === "erro") { var k = m.marcadas.indexOf(i); if (k >= 0) m.marcadas.splice(k, 1); else m.marcadas.push(i); }
    else if (a === "mais") m[b.dataset.c]++;
    else if (a === "menos") m[b.dataset.c] = Math.max(0, m[b.dataset.c] - 1);
    else if (a === "nota") m.notas[i] = Number(b.dataset.v);
    else if (a === "certo" || a === "errado") { enviarPontuacao(it, { certo: a === "certo" }); return; }
    else if (a === "salvar") {
      if (pc.modo === "checklist" && !(it.entrega && it.entrega.desenho) && !confirm("O desenho ainda não chegou do tablet. Salvar mesmo assim?")) return;
      if (pc.modo === "checklist" && pc.elementos.some(function (x, j) { return m.notas[j] == null; }) && !confirm("Há elementos sem nota (contam como zero). Salvar?")) return;
      if (pc.modo === "erros" && !(it.entrega && it.entrega.tempoMs) && !confirm("A pessoa ainda não tocou em Terminei, então não há tempo de leitura. Salvar mesmo assim?")) return;
      enviarPontuacao(it, { marcadas: m.marcadas, intrusoes: m.intrusoes, repeticoes: m.repeticoes, validas: m.validas, autocorrecoes: m.autocorrecoes,
        notas: (pc.elementos || []).map(function (x, j) { return m.notas[j] == null ? 0 : m.notas[j]; }) });
      return;
    }
    desenharAoVivo(st.sessao);
  }

  // ---- relatório: medidas das tarefas novas
  function miniLinha(vals, max, w, h) {
    var n = Math.max(vals.length, 2), x = function (i) { return 30 + i * ((w - 50) / (n - 1)); }, y = function (v) { return h - 22 - v * ((h - 36) / Math.max(1, max)); };
    return '<svg viewBox="0 0 ' + w + " " + h + '" class="ad-curva" role="img" aria-label="Palavras lembradas por rodada"><line x1="26" x2="' + (w - 10) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="#e4ebf3"/>' +
      '<path d="' + vals.map(function (v, i) { return (i ? "L" : "M") + x(i) + " " + y(v); }).join(" ") + '" fill="none" stroke="#2f6fe4" stroke-width="2"/>' +
      vals.map(function (v, i) { return '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="5" fill="#17a895"/><text x="' + x(i) + '" y="' + (y(v) - 9) + '" font-size="11" text-anchor="middle">' + v + '</text><text x="' + x(i) + '" y="' + (h - 6) + '" font-size="10" text-anchor="middle" fill="#6b7b90">' + (i + 1) + "ª</text>"; }).join("") + "</svg>";
  }
  function medidasNovasHtml(r, s, sec) {
    var por = function (id) { return (r.areas || []).filter(function (a) { return a.id === id && a.metricas; })[0]; }, h = "", m;
    var a = por("mp");
    if (a) { m = a.metricas; h += sec("Memória de palavras (lista ouvida)") + '<div class="ad-curvabox"><b>Palavras lembradas em cada rodada (de ' + m.palavras + ")</b>" + miniLinha(m.curva, m.palavras || 10, 360, 130) + "</div>" +
      '<div class="tablewrap"><table class="table"><tbody><tr><td>Total nas rodadas</td><td><b>' + m.total + "</b> de " + m.maximo + "</td></tr><tr><td>Palavras que não estavam na lista (intrusões)</td><td>" + m.intrusoes + "</td></tr>" +
      "<tr><td>Lembrou no fim da sessão, sem ouvir de novo</td><td>" + (m.evocacaoTardia == null ? "—" : "<b>" + m.evocacaoTardia + "</b> (retenção de " + m.retencao + "% da última rodada)") + "</td></tr>" +
      "<tr><td>Reconheceu entre figuras</td><td>" + (m.reconhecimento ? m.reconhecimento.acertos + " de " + m.reconhecimento.total + ", com " + m.reconhecimento.falsos + " escolha(s) errada(s)" : "—") + "</td></tr></tbody></table></div>" +
      '<p class="small muted">Leitura: a curva deve subir com as repetições (aprendizagem). Lembrar pouco no fim mas reconhecer bem sugere dificuldade de busca; não reconhecer sugere dificuldade de armazenamento. Sem normas próprias: comparar com instrumentos validados.</p>'; }
    a = por("fv");
    if (a) h += sec("Fluência verbal (1 minuto)") + '<div class="tablewrap"><table class="table"><thead><tr><th>Tipo</th><th>Palavras válidas</th><th>Repetições</th><th>Fora da regra</th><th>Referência aproximada para a idade</th></tr></thead><tbody>' +
      a.metricas.categorias.map(function (c) { return "<tr><td>" + esc(c.categoria) + "</td><td><b>" + c.validas + "</b></td><td>" + c.repeticoes + "</td><td>" + c.intrusoes + "</td><td>≈ " + c.referencia + "</td></tr>"; }).join("") + '</tbody></table></div><p class="small muted">Referências aproximadas da literatura (variam muito com a escolaridade); não são normas do NeuroTrilha.</p>';
    a = por("lx");
    if (a) { m = a.metricas; h += sec("Leitura de texto: fluência e compreensão") + '<div class="ad-fatos"><div><span>Palavras corretas por minuto</span><b>' + (m.ppm == null ? (m.tempoInvalido ? "— (tempo inválido)" : "—") : m.ppm) + '</b></div><div><span>Referência aproximada para a idade</span><b>≈ ' + m.referenciaPpm + "</b></div><div><span>Erros de leitura</span><b>" + (m.erros == null ? "—" : m.erros + " de " + m.palavras + " palavras") + "</b></div><div><span>Compreensão</span><b>" + (m.compreensao ? m.compreensao.acertos + " de " + m.compreensao.total : "—") + "</b></div></div>"; }
    a = por("dt");
    if (a) h += sec("Ditado: tipo de erro na escrita") + "<p>Erros de <b>som</b> (troca, falta ou sobra de letras): <b>" + a.metricas.errosSom + "</b> · erros de <b>regra ortográfica</b> (escreveu como se fala): <b>" + a.metricas.errosRegra + '</b>.</p><p class="small muted">Muitos erros de som sugerem dificuldade fonológica (dislexia/disortografia); erros de regra são esperados nos primeiros anos e preocupam depois.</p>' +
      (function () { var errs = s.historico.filter(function (x) { return x.dominio === "dt" && !x.treino && !x.correto; }); return !errs.length ? "" : '<div class="tablewrap"><table class="table"><thead><tr><th>Palavra</th><th>Escreveu</th></tr></thead><tbody>' + errs.map(function (x) { return "<tr><td>" + esc(x.extra && x.extra.palavra) + "</td><td>" + esc(x.extra && x.extra.escrito) + " <span class=\"small muted\">(" + esc(x.tipoErro || "") + ")</span></td></tr>"; }).join("") + "</tbody></table></div>"; })();
    var des = s.historico.filter(function (x) { return (x.dominio === "dc" || x.dominio === "rl") && x.resposta && x.resposta.pontuacao; });
    if (des.length) h += sec("Desenhos (cópia de figura e relógio)") + '<div class="ad-desenhos">' + des.map(function (x) {
      var img = x.resposta.desenho && s.desenhos && s.desenhos[x.resposta.desenho]; return '<div class="ad-curvabox"><b>' + esc(x.extra.figura) + " · " + x.extra.pontos + " de " + x.extra.maximo + " pontos</b>" + (img ? '<img class="ad-desenho" src="' + img + '" alt="Desenho">' : '<p class="small muted">(desenho não guardado)</p>') + "</div>"; }).join("") + "</div>";
    a = por("tp"); var b = por("tr");
    if (a || b) h += sec("Coordenação e tempo de reação") + '<div class="ad-fatos">' + (a ? "<div><span>Toques em 10 s · mão preferida</span><b>" + (a.metricas.preferida == null ? "—" : a.metricas.preferida) + "</b></div><div><span>Toques em 10 s · outra mão</span><b>" + (a.metricas.outra == null ? "—" : a.metricas.outra) + "</b></div>" : "") +
      (b ? "<div><span>Reação simples (mediana)</span><b>" + (b.metricas.simplesMs == null ? "—" : b.metricas.simplesMs + " ms") + "</b></div><div><span>Reação de escolha (mediana)</span><b>" + (b.metricas.escolhaMs == null ? "—" : b.metricas.escolhaMs + " ms") + "</b></div><div><span>Antecipações / erros de escolha</span><b>" + b.metricas.antecipacoes + " / " + b.metricas.errosEscolha + "</b></div>" : "") + "</div>";
    a = por("or");
    if (a) h += sec("Orientação no tempo e no lugar") + "<p>Acertou <b>" + a.metricas.acertos + " de " + a.metricas.total + "</b> perguntas." + (a.metricas.erradas.length ? " Errou: " + esc(a.metricas.erradas.join(", ").replace(/_/g, " ")) + "." : "") + "</p>";
    return h;
  }
  function sugestoesHtml(r, sec) {
    var l = M.sugestoes(r); if (!l.length) return "";
    return sec("Sugestões de intervenção (para revisão do profissional)") + '<ul class="ad-base">' + l.map(function (x) { return "<li><b>" + esc(x.area) + ":</b> " + esc(x.itens.join(" ")) + "</li>"; }).join("") + '</ul><p class="small muted">Sugestões automáticas a partir das áreas com desempenho mais baixo. O profissional decide o que vale para o caso.</p>';
  }

  // ---- devolutiva para família e escola (linguagem simples; o profissional revisa e imprime)
  var DEV_SECOES = [["abertura", "Para começar"], ["fortes", "O que foi bem"], ["atencao", "O que precisa de mais apoio"], ["casa", "Ideias para casa"], ["escola", "Ideias para a escola"], ["encaminhamentos", "Próximos passos"], ["fechamento", "Para terminar"]];
  function rascunhoDevolutiva(s, p, r) {
    var nome = p ? (p.preferredName || p.name || "").split(" ")[0] : "a pessoa avaliada", areas = (r.areas || []).filter(function (a) { return a.itens; });
    var bons = areas.filter(function (a) { return a.indice != null && a.indice >= 95; }).map(function (a) { return a.nome.toLowerCase(); });
    var sug = M.sugestoes(r), fracos = sug.map(function (x) { return x.area.toLowerCase(); }), todas = [];
    sug.forEach(function (x) { x.itens.forEach(function (t) { todas.push(t); }); });
    var ehEscola = function (t) { return /prova|professor|sala|turma|escola|cópia|tempo estendido|tabela de apoio|quadro|regras ortográficas/i.test(t); }, ehEnc = function (t) { return /encaminhar|avalia(ção|r)|fonoaudiologia|terapia|médic/i.test(t); };
    return {
      abertura: "Esta devolutiva resume, em linguagem simples, a avaliação de " + nome + " feita em " + new Date(s.criadoEm).toLocaleDateString("pt-BR") + ". Ela complementa a conversa com o(a) profissional responsável e não é um diagnóstico.",
      fortes: bons.length ? nome + " mostrou bom desempenho em: " + bons.join(", ") + ". Vale reconhecer e incentivar esses pontos." : "Durante a avaliação, " + nome + " se dedicou às tarefas. O(a) profissional vai comentar os pontos positivos observados.",
      atencao: fracos.length ? nome + " precisa de mais apoio em: " + fracos.join(", ") + ". Isso não define o futuro: com estímulo e as adaptações certas, é possível avançar." : "Não apareceram dificuldades importantes nas tarefas aplicadas.",
      casa: todas.filter(function (t) { return !ehEscola(t) && !ehEnc(t); }).map(function (t) { return "- " + t; }).join("\n"),
      escola: todas.filter(ehEscola).map(function (t) { return "- " + t; }).join("\n"),
      encaminhamentos: todas.filter(ehEnc).map(function (t) { return "- " + t; }).join("\n"),
      fechamento: "Em caso de dúvida, converse com o(a) profissional responsável. Uma nova avaliação pode mostrar a evolução ao longo do tempo."
    };
  }
  function mostrarDevolutiva(s) {
    var p = pessoa(s.participantId), r = s.resultado || {}, base = rascunhoDevolutiva(s, p, r), salvo = s.devolutiva || {}, txt = Object.assign({}, base, salvo.secoes || {});
    var prof = salvo.profissional || (s.laudo && s.laudo.profissional) || (s.parecer && s.parecer.profissional) || "", reg = salvo.registro || (s.laudo && s.laudo.registro) || (s.parecer && s.parecer.registro) || "";
    $("ad-relatorio").innerHTML = '<div class="ad-rel-cab no-print"><button class="quiet" id="ad-dev-voltar">← Voltar ao relatório</button><div class="actions"><button class="secondary" id="ad-dev-salvar">Salvar</button><button class="primary" id="ad-dev-imprimir">Imprimir / salvar PDF</button></div></div>' +
      '<div class="notice no-print">Relatório em <b>linguagem simples</b> para a família e a escola. O texto foi sugerido pelo sistema: revise, complete e tire o que não couber. Sem números de QI.</div>' +
      '<div class="panel no-print ad-laudo-editor"><div class="formgrid"><div class="field"><label>Profissional</label><input id="ad-dev-prof" maxlength="120" value="' + esc(prof) + '"></div><div class="field"><label>Registro</label><input id="ad-dev-reg" maxlength="40" value="' + esc(reg) + '"></div></div>' +
      DEV_SECOES.map(function (k) { return '<div class="field"><label>' + esc(k[1]) + '</label><textarea data-dev="' + k[0] + '" rows="' + (["casa", "escola"].indexOf(k[0]) >= 0 ? 6 : 3) + '">' + esc(txt[k[0]] || "") + "</textarea></div>"; }).join("") + '<span id="ad-dev-msg" class="small"></span></div>' +
      '<div class="panel ad-rel ad-laudo" id="ad-dev-doc"></div>';
    function desenhar() {
      var v = function (k) { var x = document.querySelector('[data-dev="' + k + '"]'); return x ? x.value.trim() : ""; };
      var par = function (t) { var l = t.split("\n").filter(Boolean); return l.every(function (x) { return /^- /.test(x); }) ? "<ul>" + l.map(function (x) { return "<li>" + esc(x.slice(2)) + "</li>"; }).join("") + "</ul>" : l.map(function (x) { return "<p>" + esc(x) + "</p>"; }).join(""); };
      $("ad-dev-doc").innerHTML = '<div class="ad-marca">NeuroTrilha</div><h2>Devolutiva da avaliação</h2><p class="muted">' + esc(p ? p.name : "") + " · " + new Date(s.criadoEm).toLocaleDateString("pt-BR") + "</p>" +
        DEV_SECOES.map(function (k) { return v(k[0]) ? "<h3>" + esc(k[1]) + "</h3>" + par(v(k[0])) : ""; }).join("") +
        '<p style="margin-top:36px">' + esc($("ad-dev-prof").value || "") + (($("ad-dev-reg").value || "") ? " · " + esc($("ad-dev-reg").value) : "") + "</p>";
    }
    desenhar();
    $("ad-relatorio").querySelectorAll("textarea,input").forEach(function (x) { x.addEventListener("input", desenhar); });
    $("ad-dev-voltar").onclick = function () { mostrarRelatorio(st.sessao); };
    $("ad-dev-imprimir").onclick = function () { window.print(); };
    $("ad-dev-salvar").onclick = async function () {
      var d = { profissional: $("ad-dev-prof").value, registro: $("ad-dev-reg").value };
      DEV_SECOES.forEach(function (k) { d[k[0]] = document.querySelector('[data-dev="' + k[0] + '"]').value; });
      try { st.sessao = await api("/api/adaptativa/" + encodeURIComponent(s.id) + "/controle", { method: "POST", body: JSON.stringify({ acao: "devolutiva", devolutiva: d }) }); $("ad-dev-msg").textContent = "Salvo em " + dataHora(st.sessao.devolutiva.em) + "."; toast("Devolutiva salva."); }
      catch (e) { $("ad-dev-msg").textContent = e.message; }
    };
    window.scrollTo(0, 0);
  }

  // ---- estimulação em casa: as áreas mais frágeis viram jogos com retorno, e o profissional acompanha o progresso
  async function criarEstimulacao(s) {
    var r = s.resultado || {}, cands = (r.areas || []).filter(function (a) { var d = M.dominio(a.id); return d && !d.fixo && a.indice != null; }).sort(function (x, y) { return x.indice - y.indice; });
    var doms = cands.filter(function (a) { return a.indice < 95; }).slice(0, 4).map(function (a) { return a.id; });
    if (!doms.length) doms = cands.slice(0, 3).map(function (a) { return a.id; });
    if (!doms.length) { toast("Esta avaliação não tem áreas que possam virar jogo de estimulação."); return; }
    if (!confirm("Criar uma estimulação em casa com: " + doms.map(function (d) { return M.dominio(d).curto; }).join(", ") + "?\n\nA pessoa joga pelo link (celular, tablet ou computador), vê se acertou em cada tarefa, e você acompanha a evolução no relatório.")) return;
    try {
      var e = await api("/api/adaptativa", { method: "POST", body: JSON.stringify({ participantId: s.participantId, dominios: doms, maxItens: 12, modo: "estimulacao" }) });
      var link = linkPaciente(e), p = pessoa(s.participantId), nome = p ? (p.preferredName || p.name || "").split(" ")[0] : "";
      var texto = "Olá! Aqui estão os jogos de estimulação do NeuroTrilha" + (nome ? " para " + nome : "") + ". Abra no celular, tablet ou computador, com calma, em um lugar tranquilo: " + link;
      $("ad-estim-link").innerHTML = '<div class="notice"><b>Estimulação criada.</b> Envie este link para a família:<br><input class="ad-qlink" readonly value="' + esc(link) + '"> <a class="secondary" style="display:inline-block;margin-top:6px;padding:9px 12px;border-radius:10px;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(texto) + '">Enviar pelo WhatsApp</a></div>';
      toast("Estimulação criada.");
    } catch (e2) { toast(e2.message); }
  }
  function progressoEstimulacao(lista) {
    var est = lista.filter(function (x) { return x.modo === "estimulacao" && x.areas; }).reverse(); if (!est.length) return "";
    var ids = []; est.forEach(function (x) { x.areas.forEach(function (a) { if (a.nivel != null && ids.indexOf(a.id) < 0) ids.push(a.id); }); });
    return "<h3>Estimulação em casa: evolução</h3><p class=\"small muted\">Nível alcançado (1 a 16) em cada sessão de jogos. Subir ao longo das semanas indica progresso.</p><div class=\"tablewrap\"><table class=\"table\"><thead><tr><th>Data</th>" + ids.map(function (i) { return "<th>" + esc(M.dominio(i).curto) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      est.map(function (x) { return "<tr><td>" + dataHora(x.criadoEm) + "</td>" + ids.map(function (i) { var a = x.areas.filter(function (z) { return z.id === i; })[0]; return "<td>" + (a && a.nivel != null ? numero(a.nivel, 1) : "—") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }

  // ---- questionários (no relatório e na ficha do paciente, inclusive para crianças pequenas sem sessão)
  async function montarQuestionarios(host, participantId, idade, nomeP) {
    var QI = window.NeuroTrilhaQuestionario; if (!host || !QI) return;
    try {
      var q = await api("/api/questionarios?participante=" + encodeURIComponent(participantId));
      var resp = (q.questionarios || []).filter(function (x) { return x.respondidoEm; }), pend = (q.questionarios || []).length - resp.length, botoes = [];
      Object.keys(QI.INSTRUMENTOS).forEach(function (k) {
        var I = QI.INSTRUMENTOS[k]; if (idade < I.idade[0] || idade > I.idade[1]) return;
        I.respondentes.forEach(function (quem) { botoes.push('<button type="button" class="secondary" data-questionario="' + quem + '" data-instrumento="' + k + '">' + esc(I.nome) + " · " + esc(quem === "proprio" ? "para o paciente" : quem === "professor" ? "para o professor" : "para os pais") + "</button>"); });
      });
      host.innerHTML = "<h3>Questionários complementares (triagem)</h3>" + '<p class="small muted no-print">Aparecem só os indicados para a idade. SNAP-IV e Vanderbilt: TDAH e comportamento · M-CHAT-R: autismo (16 a 30 meses) · ASRS: atenção no adulto · PHQ-9: humor · GAD-7: ansiedade · Autonomia: dia a dia.</p>' +
        '<div class="ad-qbotoes no-print">' + (botoes.join("") || '<span class="small muted">Nenhum questionário indicado para esta idade.</span>') + '</div><div class="ad-qlink-host no-print"></div>' +
        (resp.length ? resp.map(QI.resumoHtml).join("") : '<p class="small muted">' + (pend ? pend + " link(s) enviado(s), aguardando resposta." : "Nenhum questionário respondido ainda.") + "</p>");
      host.querySelectorAll("[data-questionario]").forEach(function (b) { b.addEventListener("click", async function () {
        try {
          var r = await api("/api/questionarios", { method: "POST", body: JSON.stringify({ participantId: participantId, respondente: b.dataset.questionario, instrumento: b.dataset.instrumento }) });
          var link = location.href.replace(/[?#].*$/, "").replace(/[^/]*$/, "") + "questionario.html?q=" + encodeURIComponent(r.token), nm = nomeP || "o paciente";
          var texto = b.dataset.questionario === "proprio" ? "Olá, " + nm + "! Por favor, responda este questionário pedido pelo(a) profissional (leva poucos minutos): " + link : "Olá! Por favor, responda este questionário sobre " + nm + " pedido pelo(a) profissional (leva cerca de 5 minutos): " + link;
          host.querySelector(".ad-qlink-host").innerHTML = '<p class="small">Envie este link para ' + (b.dataset.questionario === "professor" ? "o(a) professor(a)" : b.dataset.questionario === "proprio" ? "o próprio paciente" : "os pais ou responsáveis") + ':</p><input class="ad-qlink" readonly value="' + esc(link) + '"> <a class="secondary" style="display:inline-block;margin-top:6px;padding:9px 12px;border-radius:10px;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(texto) + '">Enviar pelo WhatsApp</a>';
        } catch (e) { toast(e.message); }
      }); });
    } catch (e) { host.innerHTML = '<p class="small muted">Não foi possível carregar os questionários: ' + esc(e.message) + "</p>"; }
  }
  // usado pela ficha do paciente (computador e internet)
  window.NeuroTrilhaQuestionarios = function (host, p) { var a = ageForParticipant(p); montarQuestionarios(host, p.id, a ? a.years + a.months / 12 : 0, (p.preferredName || p.name || "").split(" ")[0]); };

  // ---------------------------------------------------------------- relatório
  function interpretacao(s, r, p) {
    if (r.qiEstimado == null) return ["Esta aplicação não teve tarefas de inteligência suficientes para estimar o QI. Os resultados de cada área estão nos quadros acima."].concat((r.alertas || []).map(function (a) { return a.texto; }));
    var nome = p ? (p.preferredName || p.name || "").split(" ")[0] : "O participante", t = [];
    t.push(nome + " realizou " + s.historico.filter(function (h) { return !h.treino; }).length + " tarefas em " + r.areas.filter(function (a) { return a.itens; }).length + " área(s). " +
      "O desempenho geral estimado ficou na faixa " + r.faixa.toLowerCase() + " (QI estimado " + r.qiEstimado + ", faixa provável " + r.intervalo[0] + "–" + r.intervalo[1] + "), " +
      "com idade de desempenho aproximada de " + numero(r.idadeDesempenho, 1) + " anos para uma idade real de " + numero(s.idadeAnos, 1) + " anos.");
    if (r.fortes && r.fortes.length) t.push("Pontos relativamente fortes: " + r.fortes.join(", ") + ".");
    if (r.fracos && r.fracos.length) t.push("Pontos relativamente frágeis: " + r.fracos.join(", ") + ". Vale investigar com instrumentos específicos e aprovados.");
    if (!(r.fortes || []).length && !(r.fracos || []).length) t.push("O perfil entre as áreas foi relativamente homogêneo.");
    r.areas.forEach(function (a) { if (a.indice != null && a.indice < 80) t.push(a.nome + ": índice " + a.indice + " (" + a.faixa.toLowerCase() + "), abaixo do esperado para a idade nesta aplicação."); });
    t.push("Estas frases são uma sugestão automática para apoiar a escrita do profissional; devem ser revistas à luz da entrevista, da observação clínica e de instrumentos aprovados.");
    return t;
  }
  function barrasIndices(areas) {
    var w = 640, linha = 30, h = 40 + areas.length * linha, x = function (v) { return 190 + (Math.max(40, Math.min(160, v)) - 40) * ((w - 210) / 120); };
    var faixaMedia = '<rect x="' + x(85) + '" y="20" width="' + (x(115) - x(85)) + '" height="' + (h - 30) + '" fill="#eef5ff"/>';
    var guias = [40, 70, 85, 100, 115, 130, 160].map(function (v) { return '<line x1="' + x(v) + '" x2="' + x(v) + '" y1="20" y2="' + (h - 10) + '" stroke="' + (v === 100 ? "#2f6fe4" : "#e1e8f0") + '"/><text x="' + x(v) + '" y="14" font-size="10" text-anchor="middle" fill="#6b7b90">' + v + "</text>"; }).join("");
    var barras = areas.map(function (a, i) {
      var yy = 28 + i * linha;
      return '<text x="0" y="' + (yy + 13) + '" font-size="12" fill="#172438">' + esc(a.nome) + "</text>" + (a.indice == null ? "" :
        '<rect x="' + x(40) + '" y="' + yy + '" width="' + (x(a.indice) - x(40)) + '" height="18" rx="4" fill="' + (a.indice >= 115 ? "#17a895" : a.indice >= 85 ? "#2f6fe4" : a.indice >= 70 ? "#e0a03b" : "#d65a4f") + '"/><text x="' + (x(a.indice) + 6) + '" y="' + (yy + 13) + '" font-size="12" font-weight="700" fill="#172438">' + a.indice + "</text>");
    }).join("");
    return '<svg viewBox="0 0 ' + w + " " + h + '" class="ad-barras" role="img" aria-label="Índices por área">' + faixaMedia + guias + barras + "</svg>";
  }
  // atenção, impulsividade, tempo de reação, recordação tardia, ligar pontos e torre
  function medidasHtml(r, sec) {
    var areas = r.areas || [], h = "", por = function (id) { return areas.filter(function (a) { return a.id === id && a.metricas; })[0]; };
    var gn = por("gn"), ac = por("ac");
    if (gn || ac) {
      h += sec("Atenção, impulsividade e tempo de reação") + '<div class="tablewrap"><table class="table"><thead><tr><th>Tarefa</th><th>Deixou passar (omissões)</th><th>Tocou sem dever (impulsividade)</th><th>Tempo de reação médio</th><th>Variação do tempo</th><th>Queda 1ª → 2ª metade</th></tr></thead><tbody>' +
        [gn, ac].filter(Boolean).map(function (a) { var m = a.metricas; return "<tr><td><b>" + esc(a.nome) + "</b></td><td>" + m.omissoes + " de " + m.alvos + "</td><td>" + m.comissoes + " de " + m.naoAlvos + "</td><td>" + (m.trMedioMs == null ? "—" : m.trMedioMs + " ms") + "</td><td>" + (m.trVariabilidadeMs == null ? "—" : m.trVariabilidadeMs + " ms") + "</td><td>" + (m.queda == null ? "—" : m.queda + " pontos") + "</td></tr>"; }).join("") +
        '</tbody></table></div><p class="small muted">Omissões altas sugerem desatenção; toques indevidos altos sugerem impulsividade; variação grande do tempo sugere oscilação da atenção. Comparar com o questionário dos pais e professores e com a observação clínica.</p>';
    }
    if (r.tardia && r.tardia.total) h += sec("Memória: recordação no fim da sessão") + "<p>Das <b>" + r.tardia.total + "</b> figuras memorizadas no começo, reconheceu <b>" + r.tardia.acertos + "</b> no fim (" + Math.round(100 * r.tardia.acertos / r.tardia.total) + "%), com " + r.tardia.falsos + " escolha(s) de figura que não tinha aparecido.</p>";
    var tl = por("tl"), to = por("to");
    if (tl || to) h += '<p class="small">' + (tl ? "<b>Ligar os pontos:</b> " + tl.metricas.erros + " toque(s) fora de ordem. " : "") + (to ? "<b>Torre:</b> " + to.metricas.jogadasAMais + " jogada(s) a mais que o necessário e " + to.metricas.naoResolvidas + " torre(s) não resolvida(s)." : "") + "</p>";
    return h;
  }
  function anamneseHtml(a) {
    var campos = [["queixa", "Queixa principal"], ["gestacao", "Gestação e parto"], ["desenvolvimento", "Desenvolvimento (andar, falar, controle)"], ["escola", "Escola e aprendizagem"], ["saude", "Saúde, sono e medicação"], ["familia", "Família e rotina"], ["diagnosticos", "Diagnósticos ou avaliações anteriores"]];
    var linhas = campos.filter(function (c) { return a[c[0]]; });
    return linhas.length ? '<div class="ad-anamnese"><b>Anamnese</b>' + linhas.map(function (c) { return "<p><span>" + esc(c[1]) + ":</span> " + esc(a[c[0]]) + "</p>"; }).join("") + "</div>" : "";
  }
  // evolução (avaliações anteriores do mesmo participante) e questionários dos pais/professores
  async function complementos(s, p, sec) {
    try {
      var d = await api("/api/adaptativa?participante=" + encodeURIComponent(s.participantId)), lista = (d.sessoes || []).filter(function (x) { return x.qiEstimado != null && x.modo !== "estimulacao"; }).reverse();
      $("ad-estimulacao").innerHTML = progressoEstimulacao(d.sessoes || []);
      if (lista.length >= 2) $("ad-evolucao").innerHTML = "<h3>Evolução entre avaliações</h3>" + graficoEvolucao(lista) + '<div class="tablewrap"><p class="small muted">Mudança confiável: só é considerada mudança real quando a diferença passa de ' + M.mudancaConfiavel(100, 100).limiar + ' pontos (índice de mudança confiável, fidedignidade assumida 0,80). Diferenças menores podem ser só variação normal de uma aplicação para outra. As tarefas da reavaliação são formas paralelas (não repetem as já vistas).</p><table class="table"><thead><tr><th>Data</th><th>QI estimado (mudança)</th>' +
        M.DOMINIOS.filter(function (dm) { return lista.some(function (x) { return (x.areas || []).some(function (a) { return a.id === dm.id && a.indice != null; }); }); }).map(function (dm) { return "<th>" + esc(dm.curto) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        lista.map(function (x, i) { var mc = i ? M.mudancaConfiavel(lista[i - 1].qiEstimado, x.qiEstimado) : null; return "<tr><td>" + dataHora(x.criadoEm) + (x.id === s.id ? " <b>(esta)</b>" : "") + "</td><td><b>" + x.qiEstimado + "</b>" + (mc ? ' <span class="small">(' + (mc.delta > 0 ? "+" : "") + mc.delta + ": " + (mc.confiavel ? "<b>" + mc.sentido + "</b>" : mc.sentido) + ")</span>" : "") + "</td>" + M.DOMINIOS.filter(function (dm) { return lista.some(function (y) { return (y.areas || []).some(function (a) { return a.id === dm.id && a.indice != null; }); }); }).map(function (dm) { var a = (x.areas || []).filter(function (z) { return z.id === dm.id; })[0]; return "<td>" + (a && a.indice != null ? a.indice : "—") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    } catch (e) { /* sem evolução */ }
    montarQuestionarios($("ad-questionarios"), s.participantId, s.idadeAnos || 0, p ? (p.preferredName || p.name || "").split(" ")[0] : "");
  }
  function graficoEvolucao(lista) {
    var w = 560, h = 160, x = function (i) { return 40 + i * ((w - 60) / Math.max(1, lista.length - 1)); }, y = function (v) { return h - 20 - (Math.max(40, Math.min(160, v)) - 40) * ((h - 40) / 120); };
    var guia = [70, 100, 130].map(function (v) { return '<line x1="34" x2="' + (w - 10) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + (v === 100 ? "#2f6fe4" : "#e4ebf3") + '"/><text x="4" y="' + (y(v) + 4) + '" font-size="11" fill="#6b7b90">' + v + "</text>"; }).join("");
    var linha = lista.map(function (s2, i) { return (i ? "L" : "M") + x(i) + " " + y(s2.qiEstimado); }).join(" ");
    return '<svg viewBox="0 0 ' + w + " " + h + '" class="ad-barras" role="img" aria-label="Evolução do QI estimado">' + guia + '<path d="' + linha + '" fill="none" stroke="#17a895" stroke-width="3"/>' +
      lista.map(function (s2, i) { return '<circle cx="' + x(i) + '" cy="' + y(s2.qiEstimado) + '" r="5" fill="#17a895"/><text x="' + x(i) + '" y="' + (y(s2.qiEstimado) - 10) + '" font-size="11" text-anchor="middle">' + s2.qiEstimado + '</text><text x="' + x(i) + '" y="' + (h - 4) + '" font-size="10" text-anchor="middle" fill="#6b7b90">' + new Date(s2.criadoEm).toLocaleDateString("pt-BR") + "</text>"; }).join("") + "</svg>";
  }

  // ---- refinamentos do relatório: índices compostos, validade, erros, comportamento, encontros
  var VALIDADE = { adequada: "Adequada", "atenção": "Pede atenção", "questionável": "Questionável" };
  function indicesHtml(r, sec) {
    var ix = r.indices || []; if (!ix.length) return "";
    var h = sec("Índices compostos") + '<p class="small muted">Agrupam áreas que medem a mesma capacidade, como nas baterias profissionais. Intervalo de 95% com fidedignidade <b>assumida</b> (0,85 com 2 ou mais áreas; 0,75 com uma área) até haver estudo próprio.</p>' +
      barrasIndices(ix.map(function (x) { return { nome: x.sigla + " · " + x.nome, indice: x.valor }; })) +
      '<div class="tablewrap"><table class="table"><thead><tr><th>Índice</th><th>Áreas</th><th>Valor</th><th>Intervalo 95%</th><th>Faixa</th><th>Comparado com a própria pessoa</th></tr></thead><tbody>' +
      ix.map(function (x) { return "<tr><td><b>" + esc(x.sigla) + "</b> " + esc(x.nome) + "</td><td class=\"small\">" + esc(x.areas.join(", ")) + "</td><td><b>" + x.valor + "</b></td><td>" + x.intervalo[0] + "–" + x.intervalo[1] + "</td><td>" + esc(x.faixa) + "</td><td>" + esc(x.relativo || "—") + "</td></tr>"; }).join("") + "</tbody></table></div>";
    if (r.habilidadeGeral) h += '<p><b>Índice de habilidade geral (IHG): ' + r.habilidadeGeral.valor + "</b> (" + esc(r.habilidadeGeral.faixa) + '). Usa só compreensão verbal, raciocínio e visuoespacial — sem memória de trabalho e velocidade. Quando fica bem acima do QI estimado, sugere que atenção/memória de trabalho/rapidez estão "puxando para baixo" o resultado geral (comum no TDAH).</p>';
    var d = r.discrepancias || [];
    h += d.length ? "<p><b>Diferenças significativas entre índices</b> (maiores que o acaso, 95%):</p><ul>" + d.map(function (x) { return "<li>" + esc(x.maior) + " &gt; " + esc(x.menor) + ": diferença de " + x.diferenca + " pontos (mínimo para ser significativa: " + x.critica + ").</li>"; }).join("") + "</ul>"
      : '<p class="small muted">Nenhuma diferença entre índices passou do valor crítico: o perfil é relativamente homogêneo.</p>';
    return h;
  }
  function validadeHtml(r, sec) {
    var v = r.validade; if (!v) return "";
    return sec("Validade da aplicação (esforço e atenção)") + '<p>Resultado da conferência automática: <b class="ad-val-' + esc(v.nivel) + '">' + esc(VALIDADE[v.nivel] || v.nivel) + "</b>.</p>" +
      (v.sinais.length ? '<div class="notice' + (v.nivel === "questionável" ? " danger-note" : "") + '"><ul style="margin:0">' + v.sinais.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" + (v.nivel === "questionável" ? "<p><b>Os resultados desta sessão devem ser interpretados com muito cuidado</b> ou a aplicação deve ser repetida.</p>" : "") + "</div>"
        : '<p class="small muted">Não houve respostas rápidas demais, padrão repetitivo, erros incoerentes nem acertos abaixo do acaso.</p>');
  }
  function errosHtml(r, sec) {
    var e = (r.erros || []).filter(function (a) { return a.total; }); if (!e.length) return "";
    return sec("Análise qualitativa dos erros") + '<p class="small muted">Que tipo de erro a pessoa cometeu em cada área. O tipo de erro ajuda a entender o porquê da dificuldade.</p><div class="tablewrap"><table class="table"><thead><tr><th>Área</th><th>Erros</th><th>Tipos mais comuns</th></tr></thead><tbody>' +
      e.map(function (a) { return "<tr><td><b>" + esc(a.nome) + "</b></td><td>" + a.total + "</td><td>" + a.tipos.slice(0, 3).map(function (t) { return esc(t.tipo) + " (" + t.vezes + "x)"; }).join("; ") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      (function () { var dicas = {}; e.forEach(function (a) { a.tipos.forEach(function (t) { if (t.dica && t.vezes >= 2) dicas[t.dica] = 1; }); }); var l = Object.keys(dicas); return l.length ? "<ul class=\"ad-base\">" + l.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : ""; })();
  }
  function comportamentoHtml(s) {
    var c = s.comportamento, h = "";
    if (c && Object.keys(c.itens || {}).length) h += '<div class="tablewrap"><table class="table"><thead><tr><th>Aspecto observado</th><th>Avaliação</th></tr></thead><tbody>' +
      COMP.filter(function (k) { return c.itens[k[0]]; }).map(function (k) { return "<tr><td>" + esc(k[1]) + "</td><td><b>" + esc(COMP_NIVEL[c.itens[k[0]]]) + "</b></td></tr>"; }).join("") + "</tbody></table></div>";
    if (c && c.recursos) h += "<p><b>Recursos usados:</b> " + esc(c.recursos) + "</p>";
    if (c && c.nota) h += "<p><b>Observação do avaliador:</b> " + esc(c.nota) + "</p>";
    var enc = (s.encontros || []).filter(function (x) { return x.inicio; });
    if (enc.length > 1) h += "<p><b>Aplicada em " + enc.length + " encontros:</b> " + enc.map(function (x, i) { return (i + 1) + "º em " + dataHora(x.inicio); }).join("; ") + ".</p>";
    return h || '<p class="small muted no-print">A observação do comportamento ainda não foi preenchida (aparece na tela ao vivo, no fim da sessão).</p>';
  }
  function textoComportamento(s) {
    var c = s.comportamento; if (!c || !Object.keys(c.itens || {}).length) return "";
    var bons = COMP.filter(function (k) { return c.itens[k[0]] === "adequado"; }).map(function (k) { return k[1].toLowerCase(); });
    var ruins = COMP.filter(function (k) { return c.itens[k[0]] && c.itens[k[0]] !== "adequado"; }).map(function (k) { return k[1].toLowerCase() + " (" + COMP_NIVEL[c.itens[k[0]]].toLowerCase() + ")"; });
    return "Durante a avaliação, " + (bons.length ? "mostrou-se adequado(a) quanto a " + bons.join(", ") : "") + (bons.length && ruins.length ? "; " : "") + (ruins.length ? "observou-se: " + ruins.join(", ") : "") + "." + (c.nota ? " " + c.nota : "");
  }
  // ---- laudo no modelo da Resolução CFP 06/2019 (o profissional revisa e assina; o sistema só monta o rascunho)
  var LAUDO_SECOES = [["solicitante", "Solicitante"], ["finalidade", "Finalidade"], ["demanda", "Descrição da demanda"], ["procedimento", "Procedimento"], ["analise", "Análise"], ["conclusao", "Conclusão"], ["referencias", "Referências"], ["local", "Local e data"]];
  function rascunhoLaudo(s, p, r) {
    var nome = p ? p.name : "o(a) avaliado(a)", a = (p && p.anamnese) || {}, ix = r.indices || [];
    var enc = (s.encontros || []).length, areas = (r.areas || []).filter(function (x) { return x.itens; }).map(function (x) { return x.nome; });
    return {
      solicitante: "", finalidade: "Avaliação das funções cognitivas para subsidiar " + (s.idadeAnos < 18 ? "orientação escolar e familiar" : "orientação clínica") + ".",
      demanda: a.queixa ? a.queixa : "",
      procedimento: "Entrevista de anamnese" + (a.queixa ? "" : " (a completar)") + "; aplicação informatizada adaptativa do NeuroTrilha (RMD) em " + (enc > 1 ? enc + " encontros" : "um encontro") + ", com as tarefas: " + areas.join(", ") + "; observação do comportamento durante a aplicação" +
        "; questionários complementares, quando houver. Instrumentos validados e aprovados no SATEPSI utilizados: (completar).",
      analise: interpretacao(s, r, p).join("\n\n") + (ix.length ? "\n\nÍndices compostos: " + ix.map(function (x) { return x.sigla + " " + x.valor + " (" + x.faixa.toLowerCase() + ")"; }).join("; ") + "." : "") +
        (r.habilidadeGeral ? " Índice de habilidade geral: " + r.habilidadeGeral.valor + "." : "") + ((r.discrepancias || []).length ? " Diferenças significativas: " + r.discrepancias.map(function (d) { return d.maior + " > " + d.menor; }).join("; ") + "." : "") +
        (r.validade && r.validade.nivel !== "adequada" ? "\n\nValidade da aplicação: " + r.validade.sinais.join(" ") : "") + (textoComportamento(s) ? "\n\n" + textoComportamento(s) : ""),
      conclusao: "", referencias: "Conselho Federal de Psicologia. Resolução CFP nº 06/2019 (elaboração de documentos escritos).\nConselho Federal de Psicologia. Resolução CFP nº 31/2022 (avaliação psicológica e SATEPSI).\nMcGrew, K. S. (2009). CHC theory and the human cognitive abilities project. Intelligence, 37(1), 1-10.\nJacobson, N. S., & Truax, P. (1991). Clinical significance: a statistical approach. Journal of Consulting and Clinical Psychology, 59(1), 12-19.",
      local: "(cidade), " + new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) + "."
    };
  }
  function mostrarLaudo(s) {
    var p = pessoa(s.participantId), r = s.resultado || {}, base = rascunhoLaudo(s, p, r), salvo = s.laudo || {}, txt = Object.assign({}, base, salvo.secoes || {});
    var prof = salvo.profissional || (s.parecer && s.parecer.profissional) || "", reg = salvo.registro || (s.parecer && s.parecer.registro) || "";
    var h = '<div class="ad-rel-cab no-print"><button class="quiet" id="ad-laudo-voltar">← Voltar ao relatório</button><div class="actions"><button class="secondary" id="ad-laudo-salvar">Salvar laudo</button><button class="primary" id="ad-laudo-imprimir">Imprimir / salvar PDF</button><a class="secondary" style="padding:9px 12px;border-radius:10px;text-decoration:none" href="https://assinador.iti.br/" target="_blank" rel="noopener">Assinar no gov.br</a></div></div>' +
      '<div class="notice no-print">Rascunho no modelo da <b>Resolução CFP 06/2019</b>. Revise cada parte: só o(a) psicólogo(a) pode concluir e assinar. Para assinar com o gov.br: salve em PDF, abra <b>assinador.iti.br</b>, envie o PDF e baixe o arquivo assinado.</div>' +
      '<div class="panel no-print ad-laudo-editor"><div class="formgrid"><div class="field"><label>Psicólogo(a) responsável</label><input id="ad-laudo-prof" maxlength="120" value="' + esc(prof) + '"></div><div class="field"><label>CRP</label><input id="ad-laudo-reg" maxlength="40" value="' + esc(reg) + '" placeholder="CRP 00/00000"></div></div>' +
      LAUDO_SECOES.map(function (k) { return '<div class="field"><label>' + esc(k[1]) + '</label><textarea data-laudo="' + k[0] + '" rows="' + (k[0] === "analise" ? 12 : k[0] === "local" ? 1 : 4) + '">' + esc(txt[k[0]] || "") + "</textarea></div>"; }).join("") + '<span id="ad-laudo-msg" class="small"></span></div>' +
      '<div class="panel ad-rel ad-laudo" id="ad-laudo-doc"></div>';
    $("ad-relatorio").innerHTML = h;
    function desenhar() {
      var v = function (k) { var x = document.querySelector('[data-laudo="' + k + '"]'); return x ? x.value : ""; };
      var num = 0, par = function (t) { return esc(t).split(/\n{2,}/).map(function (x) { return "<p>" + x.replace(/\n/g, "<br>") + "</p>"; }).join(""); };
      $("ad-laudo-doc").innerHTML = '<h2 style="text-align:center">LAUDO PSICOLÓGICO</h2>' +
        "<h3>" + (++num) + ". Identificação</h3><p><b>Autor(a):</b> " + esc($("ad-laudo-prof").value || "(nome)") + " — " + esc($("ad-laudo-reg").value || "CRP (número)") + "<br><b>Interessado(a):</b> " + esc(p ? p.name : "—") + (p && p.birthDate ? ", nascido(a) em " + p.birthDate.split("-").reverse().join("/") : "") + " (" + idadeTexto(s.idadeAnos) + ")" +
        (v("solicitante") ? "<br><b>Solicitante:</b> " + esc(v("solicitante")) : "") + "<br><b>Finalidade:</b> " + esc(v("finalidade")) + "</p>" +
        ["demanda", "procedimento", "analise", "conclusao", "referencias"].map(function (k) { var t = LAUDO_SECOES.filter(function (x) { return x[0] === k; })[0][1]; return "<h3>" + (++num) + ". " + esc(k === "demanda" ? "Descrição da demanda" : t) + "</h3>" + (v(k) ? par(v(k)) : '<p class="muted">(a completar)</p>'); }).join("") +
        '<p style="margin-top:28px">' + esc(v("local")) + '</p><p style="margin-top:46px;text-align:center">______________________________________<br>' + esc($("ad-laudo-prof").value || "Psicólogo(a)") + "<br>" + esc($("ad-laudo-reg").value || "CRP") + "</p>" +
        '<p class="small muted" style="margin-top:20px">Documento sigiloso, de uso restrito do interessado e do solicitante. Os resultados do NeuroTrilha são experimentais (sem normas brasileiras e sem aprovação no SATEPSI) e foram usados de forma complementar.</p>';
    }
    desenhar();
    $("ad-relatorio").querySelectorAll("textarea,input").forEach(function (x) { x.addEventListener("input", desenhar); });
    $("ad-laudo-voltar").onclick = function () { mostrarRelatorio(st.sessao); };
    $("ad-laudo-imprimir").onclick = function () { window.print(); };
    $("ad-laudo-salvar").onclick = async function () {
      var l = { profissional: $("ad-laudo-prof").value, registro: $("ad-laudo-reg").value };
      LAUDO_SECOES.forEach(function (k) { l[k[0]] = document.querySelector('[data-laudo="' + k[0] + '"]').value; });
      try { st.sessao = await api("/api/adaptativa/" + encodeURIComponent(s.id) + "/controle", { method: "POST", body: JSON.stringify({ acao: "laudo", laudo: l }) }); $("ad-laudo-msg").textContent = "Laudo salvo em " + dataHora(st.sessao.laudo.em) + "."; toast("Laudo salvo."); }
      catch (e) { $("ad-laudo-msg").textContent = e.message; }
    };
    window.scrollTo(0, 0);
  }
  function mostrarRelatorio(s) {
    clearInterval(st.timer); st.sessao = s;
    var p = pessoa(s.participantId), r = s.resultado || {}, itens = s.historico.filter(function (h) { return !h.treino; });
    var ini = s.historico.length ? s.historico[0].em : s.criadoEm, fimT = s.historico.length ? s.historico[s.historico.length - 1].em : s.atualizadoEm;
    var dur = Math.max(0, Math.round((Date.parse(fimT) - Date.parse(ini)) / 60000));
    var num = 0, sec = function (titulo) { num++; return "<h3>" + num + ". " + titulo + "</h3>"; };
    var h = '<div class="ad-rel-cab no-print"><button class="quiet" id="ad-rel-voltar">← Voltar</button><div class="actions"><button class="secondary" id="ad-rel-csv">Exportar respostas (CSV)</button><button class="secondary" id="ad-rel-laudo">Laudo (modelo CFP)</button><button class="secondary" id="ad-rel-devolutiva">Para família e escola</button><button class="secondary" id="ad-rel-estim">Estimulação em casa</button><button class="primary" id="ad-rel-imprimir">Imprimir / salvar PDF</button></div></div>';
    h += '<div class="panel ad-rel"><div class="ad-rel-topo"><div><div class="ad-marca">NeuroTrilha</div><h2>Relatório de avaliação cognitiva adaptativa</h2><p class="muted">Instrumento experimental de apoio ao profissional · desenvolvido por RMD</p></div><div class="ad-rel-id">Sessão ' + esc(s.id.slice(0, 11)) + "<br>" + dataHora(s.criadoEm) + "</div></div>";
    h += sec("Identificação") + '<div class="ad-ficha">' + [["Nome", p ? p.name : "—"], ["Código", p ? p.code : "—"], ["Nascimento", p ? p.birthDate.split("-").reverse().join("/") : "—"], ["Idade na aplicação", idadeTexto(s.idadeAnos)],
      ["Sexo", p && p.sex || "—"], ["Escolaridade", p && p.education || "—"], ["Avaliador", s.avaliador || "—"], ["Duração aproximada", dur + " min"], ["Situação", NOME_STATUS[s.status] || s.status], ["Forma de aplicação", s.leitor ? "instruções escritas e faladas" : "instruções só faladas, respostas por figuras"]]
      .map(function (x) { return "<div><span>" + esc(x[0]) + "</span><b>" + esc(x[1]) + "</b></div>"; }).join("") + "</div>";
    if (p && p.anamnese) h += anamneseHtml(p.anamnese);
    h += sec("Resultado geral estimado") + '<p class="small muted">O QI estimado usa só as áreas de inteligência (raciocínio, memória, visuoespacial, rapidez, vocabulário, números e categorias). Atenção, emoções, leitura e rimas aparecem em quadros próprios.</p>';
    h += r.qiEstimado == null ? '<div class="empty">Sem respostas suficientes para estimar.</div>' : '<div class="ad-resumo"><div class="ad-qi grande"><span>QI estimado</span><b>' + r.qiEstimado + "</b><small>faixa provável (95%): " + r.intervalo[0] + "–" + r.intervalo[1] + "</small></div>" +
      '<div class="ad-fatos"><div><span>Classificação descritiva</span><b>' + esc(r.faixa) + "</b></div><div><span>Idade de desempenho</span><b>≈ " + numero(r.idadeDesempenho, 1) + " anos</b></div><div><span>Nível médio alcançado</span><b>" + numero(r.nivelGeral, 1) + " de 16</b></div><div><span>Nível esperado para a idade</span><b>" + numero(r.nivelEsperado, 1) + "</b></div></div></div>";
    h += '<div class="notice"><b>Importante:</b> o QI aqui é uma <b>estimativa experimental</b>, calculada pela distância entre o nível alcançado e o nível esperado para a idade (referências aproximadas da literatura, desvio-padrão assumido de 15 pontos). O instrumento <b>não tem normas brasileiras e não é aprovado no SATEPSI</b>; pela Resolução CFP 31/2022, decisões de avaliação psicológica devem se apoiar em testes com parecer favorável, entrevista e observação. Use como informação complementar.</div>';
    h += validadeHtml(r, sec);
    var comIndice = (r.areas || []).filter(function (a) { return a.indice != null; });
    h += sec("Perfil por área") + barrasIndices(comIndice) +
      '<div class="tablewrap"><table class="table"><thead><tr><th>Área</th><th>CHC</th><th>Itens</th><th>Acertos</th><th>Nível alcançado</th><th>Idade de desempenho</th><th>Índice</th><th>Faixa</th><th>Tempo mediano</th><th>Término</th></tr></thead><tbody>' +
      Object.keys(M.GRUPOS).map(function (g) {
        var doGrupo = (r.areas || []).filter(function (a) { return a.grupo === g; });
        if (!doGrupo.length) return "";
        return '<tr><td colspan="10" style="background:#f3f8ff"><b>' + esc(M.GRUPOS[g]) + "</b></td></tr>" + doGrupo.map(function (a) { return "<tr><td><b>" + esc(a.nome) + "</b></td><td>" + esc(a.chc) + "</td><td>" + a.itens + "</td><td>" + a.acertos + "</td><td>" + (a.fixo ? "bloco fixo" : numero(a.nivel, 1)) + "</td><td>" + (a.idadeDesempenho == null ? "—" : "≈ " + numero(a.idadeDesempenho, 1) + " anos") + "</td><td><b>" + (a.indice == null ? "—" : a.indice) + "</b></td><td>" + esc(a.fixo ? "ver medidas abaixo" : a.faixa) + "</td><td>" + seg(a.tempoMedianoMs) + "</td><td class=\"small\">" + esc(NOME_FIM[a.motivoFim] || (a.terminado ? "concluída" : "não aplicada")) + "</td></tr>"; }).join("");
      }).join("") + "</tbody></table></div>";
    h += indicesHtml(r, sec);
    h += medidasHtml(r, sec);
    h += errosHtml(r, sec);
    h += medidasNovasHtml(r, s, sec);
    h += sec("Como a dificuldade evoluiu em cada área") + "<div class=\"ad-curvas\">" + s.escadas.filter(function (e) { return !e.fixo; }).map(function (e) { return '<div class="ad-curvabox"><b>' + esc(M.dominio(e.dominio).nome) + "</b>" + curva(e.itens, 300, 120) + "</div>"; }).join("") + "</div>";
    h += '<div id="ad-estim-link" class="no-print"></div><div id="ad-evolucao"></div><div id="ad-estimulacao"></div><div id="ad-questionarios"></div>';
    h += sec("Pontos fortes e frágeis (comparando a pessoa com ela mesma)") + "<div class=\"ad-ff\"><div><span>Mais fortes</span><b>" + esc((r.fortes || []).join(", ") || "nenhuma área se destacou") + "</b></div><div><span>Mais frágeis</span><b>" + esc((r.fracos || []).join(", ") || "nenhuma área ficou abaixo do restante") + "</b></div></div>";
    h += sec("Comportamento e observações") + comportamentoHtml(s) + ((r.alertas || []).length ? (r.alertas || []).map(function (a) { return '<div class="notice">' + esc(a.texto) + "</div>"; }).join("") : '<p class="muted">Nenhum alerta automático.</p>') +
      ((s.observacoes || []).length ? "<ul class=\"ad-obs\">" + s.observacoes.map(function (o) { return "<li><b>" + dataHora(o.em) + (o.dominio ? " · " + esc(M.dominio(o.dominio).curto) : "") + ":</b> " + esc((o.flags || []).join(", ")) + (o.nota ? " — " + esc(o.nota) : "") + "</li>"; }).join("") + "</ul>" : "");
    var ajustes = s.escadas.filter(function (e) { return e.ajustesAvaliador; }).map(function (e) { return M.dominio(e.dominio).nome + " (" + e.ajustesAvaliador + "x)"; });
    if (ajustes.length) h += '<p class="small muted">O avaliador ajustou o nível manualmente em: ' + esc(ajustes.join(", ")) + ".</p>";
    h += sugestoesHtml(r, sec);
    h += sec("Síntese sugerida (para revisão do profissional)") + interpretacao(s, r, p).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("");
    h += sec("Parecer do profissional") + '<div class="no-print-if-empty">' + (s.parecer ? '<div class="ad-parecer-salvo"><b>' + esc(DECISAO[s.parecer.decisao]) + "</b> · " + esc(s.parecer.profissional) + (s.parecer.registro ? " · " + esc(s.parecer.registro) : "") + " · " + dataHora(s.parecer.em) + "<p>" + esc(s.parecer.texto || "").replace(/\n/g, "<br>") + "</p></div>" : "") +
      '<form id="ad-parecer" class="no-print ad-parecer"><div class="ad-dec">' + Object.keys(DECISAO).map(function (k) { return '<label><input type="radio" name="decisao" value="' + k + '"' + (s.parecer && s.parecer.decisao === k ? " checked" : "") + "> " + esc(DECISAO[k]) + "</label>"; }).join("") + "</div>" +
      '<textarea id="ad-par-texto" rows="5" placeholder="Parecer, hipóteses, encaminhamentos e o que foi confirmado com outros instrumentos…">' + esc(s.parecer ? s.parecer.texto : "") + "</textarea>" +
      '<div class="formgrid"><div class="field"><label>Profissional</label><input id="ad-par-prof" value="' + esc(s.parecer ? s.parecer.profissional : "") + '" placeholder="Nome"></div><div class="field"><label>Registro (CRP/CRM/CRFa)</label><input id="ad-par-reg" value="' + esc(s.parecer ? s.parecer.registro : "") + '" placeholder="Ex.: CRP 19/0000"></div></div>' +
      '<button type="submit" class="primary">Salvar parecer</button> <span id="ad-par-msg" class="small"></span></form></div>';
    h += sec("Base técnica e limites") + "<ul class=\"ad-base\"><li>Áreas organizadas pelo modelo CHC (Cattell-Horn-Carroll), referência das baterias modernas de inteligência.</li><li>Aplicação adaptativa em escada: todas as áreas começam no nível 1; acerto rápido sobe (de 2 em 2 até o primeiro erro), acerto lento mantém, erro desce. A área termina pelo limite de itens, por estabilizar, no piso ou no teto.</li><li>Primeira tarefa de cada área é treino, com retorno, e não entra no cálculo.</li><li>Tarefas originais geradas pelo programa: padrões e matrizes, quadrados que acendem, rotação de formas, busca visual, vocabulário por figuras, quantidades e números, categorias e analogias, números ouvidos (direta e inversa), memória de figuras com recordação tardia, peixes, toque ou não toque, atenção contínua, troca de regra, torre, ligar os pontos, caminhos, rimas e sons, leitura e emoções.</li><li>O QI estimado usa só as áreas de inteligência; atenção, funções executivas, aprendizagem e cognição social aparecem em quadros próprios, como nas baterias profissionais.</li><li>Idades de referência por nível são aproximadas e servem só para comparação; o resultado não substitui instrumentos padronizados.</li></ul>";
    h += "<details class=\"ad-itens\"><summary>Respostas item a item (" + itens.length + ")</summary><div class=\"tablewrap\"><table class=\"table\"><thead><tr><th>#</th><th>Área</th><th>Nível</th><th>Instrução</th><th>Resultado</th><th>Tempo</th></tr></thead><tbody>" +
      itens.map(function (x, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(M.dominio(x.dominio).curto) + "</td><td>" + x.nivel + "</td><td class=\"small\">" + esc(x.fala || "") + "</td><td>" + (x.correto ? (x.rapido ? "Acerto" : "Acerto lento") : x.esgotado ? "Tempo esgotado" : "Erro") + "</td><td>" + seg(x.tempoMs) + "</td></tr>"; }).join("") + "</tbody></table></div></details></div>";
    $("ad-relatorio").innerHTML = h;
    complementos(s, p, sec);
    ["ad-setup", "ad-lista-painel", "ad-aovivo"].forEach(function (x) { $(x).classList.add("hidden"); }); $("ad-relatorio").classList.remove("hidden");
    $("ad-rel-voltar").onclick = voltar;
    $("ad-rel-imprimir").onclick = function () { window.print(); };
    $("ad-rel-laudo").onclick = function () { mostrarLaudo(s); };
    $("ad-rel-devolutiva").onclick = function () { mostrarDevolutiva(s); };
    $("ad-rel-estim").onclick = function () { criarEstimulacao(s); };
    $("ad-rel-csv").onclick = function () {
      var rows = [["Sessão", "Participante", "Código", "Idade", "Área", "Nível", "Treino", "Resultado", "Tempo (s)", "Instrução", "Data"]].concat(s.historico.map(function (x) {
        return [s.id, p ? p.name : "", p ? p.code : "", numero(s.idadeAnos, 2), M.dominio(x.dominio).nome, x.nivel, x.treino ? "sim" : "não", x.correto ? (x.rapido ? "acerto" : "acerto lento") : x.esgotado ? "tempo esgotado" : "erro", numero(x.tempoMs / 1000, 2), x.fala || "", x.em];
      }));
      downloadCSV(rows, "NeuroTrilha-" + (p ? p.code : "sessao") + "-" + s.criadoEm.slice(0, 10) + ".csv");
    };
    $("ad-parecer").onsubmit = async function (ev) {
      ev.preventDefault(); var dec = (document.querySelector("#ad-parecer input[name=decisao]:checked") || {}).value, msg = $("ad-par-msg");
      if (!dec) { msg.textContent = "Escolha se aceita o resultado."; msg.style.color = "#b42318"; return; }
      try { var s2 = await api("/api/adaptativa/" + encodeURIComponent(s.id) + "/parecer", { method: "PUT", body: JSON.stringify({ decisao: dec, texto: $("ad-par-texto").value, profissional: $("ad-par-prof").value, registro: $("ad-par-reg").value }) }); toast("Parecer salvo."); mostrarRelatorio(s2); }
      catch (e) { msg.textContent = e.message; msg.style.color = "#b42318"; }
    };
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- ligações
  $("ad-participante").addEventListener("change", atualizarDica);
  $("ad-iniciar").addEventListener("click", iniciar);
  $("ad-flags").innerHTML = FLAGS.map(function (f) { return '<label class="ad-chip"><input type="checkbox" value="' + esc(f) + '"><span>' + esc(f) + "</span></label>"; }).join("");
  $("ad-obs-salvar").addEventListener("click", observar);
  $("ad-tarefa").addEventListener("click", cliquePontuar);
  $("ad-comp-campos").innerHTML = COMP.map(function (k) { return '<div class="ad-comp-linha"><span>' + esc(k[1]) + '</span><div class="ad-flags">' + Object.keys(COMP_NIVEL).map(function (v) { return '<label class="ad-chip"><input type="radio" name="comp-' + k[0] + '" value="' + v + '"><span>' + esc(COMP_NIVEL[v]) + "</span></label>"; }).join("") + "</div></div>"; }).join("");
  $("ad-comp-salvar").addEventListener("click", salvarComportamento);
  $("ad-c-encontro").addEventListener("click", function () { if (confirm("Encerrar o encontro de hoje? O paciente vê \"Por hoje é só!\" e, no próximo dia, a sessão continua de onde parou (toque em Continuar).")) controle("encontro"); });
  $("ad-copiar").addEventListener("click", function () { var i = $("ad-link"); i.select(); try { navigator.clipboard.writeText(i.value); } catch (e) { document.execCommand("copy"); } toast("Endereço copiado."); });
  $("ad-abrir-paciente").addEventListener("click", function () { if (st.sessao) window.open(linkPaciente(st.sessao), "neurotrilha_paciente", "width=1100,height=760"); });
  $("ad-ver-relatorio").addEventListener("click", function () { if (st.sessao) mostrarRelatorio(st.sessao); });
  $("ad-voltar").addEventListener("click", voltar);
  ["pausar", "continuar", "subir", "descer", "pular", "repetir"].forEach(function (a) { $("ad-c-" + a).addEventListener("click", function () { controle(a); }); });
  $("ad-c-encerrar").addEventListener("click", function () { if (confirm("Encerrar a sessão agora? O relatório usará o que já foi respondido.")) controle("encerrar"); });
  $("ad-lista").addEventListener("click", function (ev) { var b = ev.target.closest("[data-ad-abrir]"); if (b) abrirPorId(b.dataset.adAbrir, b.dataset.fim === "1"); });
  // ao abrir a tela (pelo menu ou por um atalho do painel) prepara a sessão e lista as anteriores
  var trocarTela = switchView;
  switchView = function (v) { trocarTela(v); if (v === "adaptive" && !st.sessao) { prepararSetup(); listar(); } };
  // quadro da Visão geral: média do índice por área nas aplicações concluídas (dados reais)
  window.NeuroTrilhaPainel = async function () {
    var host = $("dash-domains"); if (!host) return;
    try {
      var d = await api("/api/adaptativa"), soma = {}, qtd = {};
      (d.sessoes || []).forEach(function (x) { (x.areas || []).forEach(function (a) { if (a.indice != null) { soma[a.id] = (soma[a.id] || 0) + a.indice; qtd[a.id] = (qtd[a.id] || 0) + 1; } }); });
      host.innerHTML = M.DOMINIOS.map(function (dm) {
        var m = qtd[dm.id] ? Math.round(soma[dm.id] / qtd[dm.id]) : null;
        return '<div class="barrow"><span>' + esc(dm.nome) + '</span><div class="bartrack"><span style="width:' + (m == null ? 0 : Math.round((m - 40) / 120 * 100)) + '%"></span></div><span class="small muted">' + (m == null ? "sem dados" : m + " · " + qtd[dm.id] + "x") + "</span></div>";
      }).join("");
    } catch (e) { host.innerHTML = '<div class="small muted">Sem dados ainda.</div>'; }
  };
  if ($("ad-enviar")) $("ad-enviar").addEventListener("click", async function () {
    var codigo = $("ad-codigo").value.replace(/\D/g, "");
    if (codigo.length !== 6) { $("ad-parear-status").textContent = "O código tem 6 números."; return; }
    try { var s = await api("/api/adaptativa/" + encodeURIComponent(st.sessao.id) + "/enviar", { method: "POST", body: JSON.stringify({ codigo: codigo }) }); st.sessao = s; $("ad-codigo").value = ""; desenharAoVivo(s); toast("Teste enviado para o tablet."); }
    catch (e) { $("ad-parear-status").textContent = e.message; }
  });
  window.NeuroTrilhaAdaptativa = { prepararSetup: prepararSetup, listar: listar, abrirPorId: abrirPorId };
})();
