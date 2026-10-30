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
      }).join("") + '<div class="ad-atalhos"><button type="button" class="quiet" data-marcar="rec">Recomendadas para a idade</button><button type="button" class="quiet" data-marcar="qi">Só as do QI</button><button type="button" class="quiet" data-marcar="todas">Todas</button><button type="button" class="quiet" data-marcar="nenhuma">Nenhuma</button></div><p class="small muted" id="ad-duracao"></p>';
      $("ad-dominios").addEventListener("click", function (ev) { var b = ev.target.closest("[data-marcar]"); if (b) marcar(b.dataset.marcar); });
      $("ad-dominios").addEventListener("change", duracao);
      $("ad-itens").addEventListener("change", duracao);
    }
    atualizarDica();
  }
  function idadeEscolhida() { var p = pessoa($("ad-participante").value), a = p ? ageForParticipant(p) : null; return a ? a.years + a.months / 12 : 8; }
  // marca as áreas: recomendadas para a idade, só as do QI, todas ou nenhuma (o profissional pode ajustar depois)
  function marcar(modo) {
    var idade = idadeEscolhida(), rec = M.recomendadas(idade);
    document.querySelectorAll("#ad-dominios input[type=checkbox]").forEach(function (x) {
      var d = M.dominio(x.value), cabe = idade >= d.idades[0] && idade <= d.idades[1];
      x.checked = modo === "rec" ? rec.indexOf(d.id) >= 0 : modo === "qi" ? d.qi && cabe : modo === "todas" ? cabe : false;
    });
    duracao();
  }
  function duracao() {
    var marcadas = [].slice.call(document.querySelectorAll("#ad-dominios input:checked")).map(function (x) { return M.dominio(x.value); });
    var itens = Number($("ad-itens").value) || 10, seg = marcadas.reduce(function (t, d) { return t + (d.fixo ? 120 : (itens + 1) * (d.grupo === "inteligencia" ? 13 : 9)); }, 0);
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
      var s = await api("/api/adaptativa", { method: "POST", body: JSON.stringify({ participantId: pid, dominios: doms, maxItens: Number($("ad-itens").value), leitor: leitor === "auto" ? undefined : leitor === "sim" }) });
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
    ["pausar", "continuar", "subir", "descer", "pular", "repetir", "encerrar"].forEach(function (a) { var b = $("ad-c-" + a); if (b) b.disabled = fim; });
    $("ad-c-pausar").classList.toggle("hidden", s.status === "pausada"); $("ad-c-continuar").classList.toggle("hidden", s.status !== "pausada");
    $("ad-ver-relatorio").classList.toggle("hidden", !fim);
    // tarefa da vez (com a resposta certa marcada, só para o avaliador)
    var it = s.item, area = it ? M.dominio(it.dominio) : null;
    $("ad-tarefa").innerHTML = !it ? '<div class="empty"><b>' + (fim ? "Sessão terminada" : "Sem tarefa agora") + "</b>" + (fim ? "Abra o relatório completo." : "") + "</div>" :
      '<div class="ad-tarefa-cab"><span class="pill">' + esc(area.nome) + "</span><span>Nível <b>" + it.nivel + "</b> de 16" + (it.treino ? " · <b>treino</b> (não conta)" : "") + "</span></div>" +
      '<p class="ad-fala">🗣️ “' + esc(it.fala) + "”</p>" + espelho(it) + '<p class="small muted">Contorno verde = resposta certa' + (it.limiteMs ? " · tempo limite " + seg(it.limiteMs) : "") + ".</p>";
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
    if (it.tipo === "gonogo") return '<div class="ad-linha">' + mini(it.estimulo[0], it.certo ? "certa" : "") + '</div><p><b>' + (it.certo ? "Certo: TOCAR" : "Certo: NÃO tocar") + "</b> · limite " + seg(it.limiteMs) + "</p>";
    if (it.tipo === "digitos") return '<p class="ad-fala" style="font-size:22px;letter-spacing:.2em"><b>' + it.sequencia.join(" ") + "</b></p><p>" + (it.inverso ? "De trás para frente: <b>" + it.certo.join(" ") + "</b>" : "Na mesma ordem") + "</p>";
    if (it.tipo === "torre") return '<div class="ad-linha">' + mini({ torre: { pinos: it.inicio, caps: it.capacidades } }) + '<span style="align-self:center">→</span>' + mini({ torre: { pinos: it.meta, caps: it.capacidades } }, "certa") + "</div><p>Mínimo de <b>" + it.minimo + "</b> jogada(s).</p>";
    if (it.tipo === "pontos") return "<p>Ordem certa: <b>" + it.certo.join(" → ") + "</b></p>";
    if (it.tipo === "reconhecer") return (it.tardia ? "<p><b>Recordação do fim da sessão</b> (figuras do começo).</p>" : "") + '<div class="ad-linha">' + it.opcoes.map(function (o) { return mini(o.fig, it.certo.indexOf(o.id) >= 0 ? "certa" : ""); }).join("") + "</div>";
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
        return "<tr><td><b>" + esc(p ? p.name : "—") + '</b><br><span class="small muted">' + esc(p ? p.code : "") + "</span></td><td>" + dataHora(x.criadoEm) + "</td><td>" + esc(NOME_STATUS[x.status] || x.status) + "</td><td>" + (x.dominios || []).length +
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

  // ---------------------------------------------------------------- relatório
  function interpretacao(s, r, p) {
    if (r.qiEstimado == null) return ["Não há respostas suficientes para uma estimativa."];
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
      var d = await api("/api/adaptativa?participante=" + encodeURIComponent(s.participantId)), lista = (d.sessoes || []).filter(function (x) { return x.qiEstimado != null; }).reverse();
      if (lista.length >= 2) $("ad-evolucao").innerHTML = "<h3>Evolução entre avaliações</h3>" + graficoEvolucao(lista) + '<div class="tablewrap"><table class="table"><thead><tr><th>Data</th><th>QI estimado</th>' +
        M.DOMINIOS.filter(function (dm) { return lista.some(function (x) { return (x.areas || []).some(function (a) { return a.id === dm.id && a.indice != null; }); }); }).map(function (dm) { return "<th>" + esc(dm.curto) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        lista.map(function (x) { return "<tr><td>" + dataHora(x.criadoEm) + (x.id === s.id ? " <b>(esta)</b>" : "") + "</td><td><b>" + x.qiEstimado + "</b></td>" + M.DOMINIOS.filter(function (dm) { return lista.some(function (y) { return (y.areas || []).some(function (a) { return a.id === dm.id && a.indice != null; }); }); }).map(function (dm) { var a = (x.areas || []).filter(function (z) { return z.id === dm.id; })[0]; return "<td>" + (a && a.indice != null ? a.indice : "—") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    } catch (e) { /* sem evolução */ }
    try {
      var q = await api("/api/questionarios?participante=" + encodeURIComponent(s.participantId));
      var resp = (q.questionarios || []).filter(function (x) { return x.respondidoEm; }), pend = (q.questionarios || []).length - resp.length;
      $("ad-questionarios").innerHTML = "<h3>Questionário dos pais e professores (SNAP-IV)</h3>" +
        '<div class="ad-qbotoes no-print"><button type="button" class="secondary" data-questionario="pais">Gerar link para os pais</button><button type="button" class="secondary" data-questionario="professor">Gerar link para o professor</button></div><div id="ad-qlink" class="no-print"></div>' +
        (resp.length && window.NeuroTrilhaQuestionario ? resp.map(window.NeuroTrilhaQuestionario.resumoHtml).join("") : '<p class="small muted">' + (pend ? pend + " link(s) enviado(s), aguardando resposta." : "Nenhum questionário respondido ainda.") + "</p>");
      $("ad-questionarios").querySelectorAll("[data-questionario]").forEach(function (b) { b.addEventListener("click", async function () {
        try {
          var r = await api("/api/questionarios", { method: "POST", body: JSON.stringify({ participantId: s.participantId, respondente: b.dataset.questionario }) });
          var link = location.href.replace(/[?#].*$/, "").replace(/[^/]*$/, "") + "questionario.html?q=" + encodeURIComponent(r.token);
          var texto = "Olá! Por favor, responda este questionário sobre " + (p ? (p.preferredName || p.name || "").split(" ")[0] : "a criança") + " pedido pelo(a) profissional (leva cerca de 5 minutos): " + link;
          $("ad-qlink").innerHTML = '<p class="small">Envie este link para ' + (b.dataset.questionario === "professor" ? "o(a) professor(a)" : "os pais ou responsáveis") + ':</p><input class="ad-qlink" readonly value="' + esc(link) + '"> <a class="secondary" style="display:inline-block;margin-top:6px;padding:9px 12px;border-radius:10px;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(texto) + '">Enviar pelo WhatsApp</a>';
        } catch (e) { toast(e.message); }
      }); });
    } catch (e) { /* sem questionário */ }
  }
  function graficoEvolucao(lista) {
    var w = 560, h = 160, x = function (i) { return 40 + i * ((w - 60) / Math.max(1, lista.length - 1)); }, y = function (v) { return h - 20 - (Math.max(40, Math.min(160, v)) - 40) * ((h - 40) / 120); };
    var guia = [70, 100, 130].map(function (v) { return '<line x1="34" x2="' + (w - 10) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + (v === 100 ? "#2f6fe4" : "#e4ebf3") + '"/><text x="4" y="' + (y(v) + 4) + '" font-size="11" fill="#6b7b90">' + v + "</text>"; }).join("");
    var linha = lista.map(function (s2, i) { return (i ? "L" : "M") + x(i) + " " + y(s2.qiEstimado); }).join(" ");
    return '<svg viewBox="0 0 ' + w + " " + h + '" class="ad-barras" role="img" aria-label="Evolução do QI estimado">' + guia + '<path d="' + linha + '" fill="none" stroke="#17a895" stroke-width="3"/>' +
      lista.map(function (s2, i) { return '<circle cx="' + x(i) + '" cy="' + y(s2.qiEstimado) + '" r="5" fill="#17a895"/><text x="' + x(i) + '" y="' + (y(s2.qiEstimado) - 10) + '" font-size="11" text-anchor="middle">' + s2.qiEstimado + '</text><text x="' + x(i) + '" y="' + (h - 4) + '" font-size="10" text-anchor="middle" fill="#6b7b90">' + new Date(s2.criadoEm).toLocaleDateString("pt-BR") + "</text>"; }).join("") + "</svg>";
  }

  function mostrarRelatorio(s) {
    clearInterval(st.timer); st.sessao = s;
    var p = pessoa(s.participantId), r = s.resultado || {}, itens = s.historico.filter(function (h) { return !h.treino; });
    var ini = s.historico.length ? s.historico[0].em : s.criadoEm, fimT = s.historico.length ? s.historico[s.historico.length - 1].em : s.atualizadoEm;
    var dur = Math.max(0, Math.round((Date.parse(fimT) - Date.parse(ini)) / 60000));
    var num = 0, sec = function (titulo) { num++; return "<h3>" + num + ". " + titulo + "</h3>"; };
    var h = '<div class="ad-rel-cab no-print"><button class="quiet" id="ad-rel-voltar">← Voltar</button><div class="actions"><button class="secondary" id="ad-rel-csv">Exportar respostas (CSV)</button><button class="primary" id="ad-rel-imprimir">Imprimir / salvar PDF</button></div></div>';
    h += '<div class="panel ad-rel"><div class="ad-rel-topo"><div><div class="ad-marca">NeuroTrilha</div><h2>Relatório de avaliação cognitiva adaptativa</h2><p class="muted">Instrumento experimental de apoio ao profissional · desenvolvido por RMD</p></div><div class="ad-rel-id">Sessão ' + esc(s.id.slice(0, 11)) + "<br>" + dataHora(s.criadoEm) + "</div></div>";
    h += sec("Identificação") + '<div class="ad-ficha">' + [["Nome", p ? p.name : "—"], ["Código", p ? p.code : "—"], ["Nascimento", p ? p.birthDate.split("-").reverse().join("/") : "—"], ["Idade na aplicação", idadeTexto(s.idadeAnos)],
      ["Sexo", p && p.sex || "—"], ["Escolaridade", p && p.education || "—"], ["Avaliador", s.avaliador || "—"], ["Duração aproximada", dur + " min"], ["Situação", NOME_STATUS[s.status] || s.status], ["Forma de aplicação", s.leitor ? "instruções escritas e faladas" : "instruções só faladas, respostas por figuras"]]
      .map(function (x) { return "<div><span>" + esc(x[0]) + "</span><b>" + esc(x[1]) + "</b></div>"; }).join("") + "</div>";
    if (p && p.anamnese) h += anamneseHtml(p.anamnese);
    h += sec("Resultado geral estimado") + '<p class="small muted">O QI estimado usa só as áreas de inteligência (raciocínio, memória, visuoespacial, rapidez, vocabulário, números e categorias). Atenção, emoções, leitura e rimas aparecem em quadros próprios.</p>';
    h += r.qiEstimado == null ? '<div class="empty">Sem respostas suficientes para estimar.</div>' : '<div class="ad-resumo"><div class="ad-qi grande"><span>QI estimado</span><b>' + r.qiEstimado + "</b><small>faixa provável (95%): " + r.intervalo[0] + "–" + r.intervalo[1] + "</small></div>" +
      '<div class="ad-fatos"><div><span>Classificação descritiva</span><b>' + esc(r.faixa) + "</b></div><div><span>Idade de desempenho</span><b>≈ " + numero(r.idadeDesempenho, 1) + " anos</b></div><div><span>Nível médio alcançado</span><b>" + numero(r.nivelGeral, 1) + " de 16</b></div><div><span>Nível esperado para a idade</span><b>" + numero(r.nivelEsperado, 1) + "</b></div></div></div>";
    h += '<div class="notice"><b>Importante:</b> o QI aqui é uma <b>estimativa experimental</b>, calculada pela distância entre o nível alcançado e o nível esperado para a idade (referências aproximadas da literatura, desvio-padrão assumido de 15 pontos). O instrumento <b>não tem normas brasileiras e não é aprovado no SATEPSI</b>; pela Resolução CFP 31/2022, decisões de avaliação psicológica devem se apoiar em testes com parecer favorável, entrevista e observação. Use como informação complementar.</div>';
    var comIndice = (r.areas || []).filter(function (a) { return a.indice != null; });
    h += sec("Perfil por área") + barrasIndices(comIndice) +
      '<div class="tablewrap"><table class="table"><thead><tr><th>Área</th><th>CHC</th><th>Itens</th><th>Acertos</th><th>Nível alcançado</th><th>Idade de desempenho</th><th>Índice</th><th>Faixa</th><th>Tempo mediano</th><th>Término</th></tr></thead><tbody>' +
      Object.keys(M.GRUPOS).map(function (g) {
        var doGrupo = (r.areas || []).filter(function (a) { return a.grupo === g; });
        if (!doGrupo.length) return "";
        return '<tr><td colspan="10" style="background:#f3f8ff"><b>' + esc(M.GRUPOS[g]) + "</b></td></tr>" + doGrupo.map(function (a) { return "<tr><td><b>" + esc(a.nome) + "</b></td><td>" + esc(a.chc) + "</td><td>" + a.itens + "</td><td>" + a.acertos + "</td><td>" + (a.fixo ? "bloco fixo" : numero(a.nivel, 1)) + "</td><td>" + (a.idadeDesempenho == null ? "—" : "≈ " + numero(a.idadeDesempenho, 1) + " anos") + "</td><td><b>" + (a.indice == null ? "—" : a.indice) + "</b></td><td>" + esc(a.fixo ? "ver medidas abaixo" : a.faixa) + "</td><td>" + seg(a.tempoMedianoMs) + "</td><td class=\"small\">" + esc(NOME_FIM[a.motivoFim] || (a.terminado ? "concluída" : "não aplicada")) + "</td></tr>"; }).join("");
      }).join("") + "</tbody></table></div>";
    h += medidasHtml(r, sec);
    h += sec("Como a dificuldade evoluiu em cada área") + "<div class=\"ad-curvas\">" + s.escadas.filter(function (e) { return !e.fixo; }).map(function (e) { return '<div class="ad-curvabox"><b>' + esc(M.dominio(e.dominio).nome) + "</b>" + curva(e.itens, 300, 120) + "</div>"; }).join("") + "</div>";
    h += '<div id="ad-evolucao"></div><div id="ad-questionarios"></div>';
    h += sec("Pontos fortes e frágeis (comparando a pessoa com ela mesma)") + "<div class=\"ad-ff\"><div><span>Mais fortes</span><b>" + esc((r.fortes || []).join(", ") || "nenhuma área se destacou") + "</b></div><div><span>Mais frágeis</span><b>" + esc((r.fracos || []).join(", ") || "nenhuma área ficou abaixo do restante") + "</b></div></div>";
    h += sec("Comportamento e observações") + ((r.alertas || []).length ? (r.alertas || []).map(function (a) { return '<div class="notice">' + esc(a.texto) + "</div>"; }).join("") : '<p class="muted">Nenhum alerta automático.</p>') +
      ((s.observacoes || []).length ? "<ul class=\"ad-obs\">" + s.observacoes.map(function (o) { return "<li><b>" + dataHora(o.em) + (o.dominio ? " · " + esc(M.dominio(o.dominio).curto) : "") + ":</b> " + esc((o.flags || []).join(", ")) + (o.nota ? " — " + esc(o.nota) : "") + "</li>"; }).join("") + "</ul>" : "");
    var ajustes = s.escadas.filter(function (e) { return e.ajustesAvaliador; }).map(function (e) { return M.dominio(e.dominio).nome + " (" + e.ajustesAvaliador + "x)"; });
    if (ajustes.length) h += '<p class="small muted">O avaliador ajustou o nível manualmente em: ' + esc(ajustes.join(", ")) + ".</p>";
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
