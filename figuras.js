/* NeuroTrilha (RMD) — figuras iguais em todos os aparelhos.
   Cada celular, tablet e computador desenha os emojis de um jeito (às vezes bem diferente). Este arquivo troca, na tela,
   cada emoji pelo mesmo desenho guardado no sistema. Primeiro a figura 3D, mais realista e fácil de reconhecer
   (figuras3d/: Fluent Emoji 3D da Microsoft, licença MIT); se não houver, o desenho plano (figuras/: Twemoji, CC-BY 4.0).
   Créditos nos Termos de uso. Se a figura não existir ou o arquivo não carregar, o emoji do aparelho continua aparecendo. */
(function () {
  "use strict";
  var BASE = "figuras/", BASE3D = "figuras3d/", SVG = "http://www.w3.org/2000/svg", tem = null, tem3d = new Set();
  function arquivo(c) { return tem3d.has(c) ? BASE3D + c + ".webp" : BASE + c + ".svg"; }
  var EMO = /\p{Extended_Pictographic}/u, PULAR = /^(SCRIPT|STYLE|TEXTAREA|OPTION|TITLE|INPUT)$/;
  var seg = window.Intl && Intl.Segmenter ? new Intl.Segmenter("pt", { granularity: "grapheme" }) : null;
  function partes(t) { return seg ? Array.from(seg.segment(t), function (x) { return x.segment; }) : Array.from(t); }
  // nome do arquivo no padrão Twemoji: códigos em hexadecimal separados por "-" (sem o fe0f, exceto nas sequências com 200d)
  function codigo(s) {
    var c = Array.from(s).map(function (x) { return x.codePointAt(0).toString(16); });
    if (s.indexOf("‍") < 0) c = c.filter(function (x) { return x !== "fe0f"; });
    return c.join("-");
  }
  // emoji sozinho num <text> dos desenhos das tarefas: vira <image> do mesmo tamanho e no mesmo lugar
  function trocarNoDesenho(el) {
    var t = el.textContent.trim(), c = codigo(t); if (!tem.has(c)) return;
    var fs = parseFloat(el.getAttribute("font-size")) || 16, x = parseFloat(el.getAttribute("x")) || 0, y = parseFloat(el.getAttribute("y")) || 0;
    var img = document.createElementNS(SVG, "image"), svg = el.ownerSVGElement;
    // figura sozinha no cartão: um pouco maior, para ocupar bem o espaço (a letra do emoji deixava muita sobra)
    var s = svg && svg.querySelectorAll("text,image").length <= 1 ? fs * 1.3 : fs;
    var cx = el.getAttribute("text-anchor") === "middle" ? x : x + fs / 2, cy = y - fs * 0.36;
    img.setAttribute("href", arquivo(c));
    img.setAttribute("x", cx - s / 2); img.setAttribute("y", cy - s / 2); img.setAttribute("width", s); img.setAttribute("height", s);
    el.parentNode.replaceChild(img, el);
  }
  // emoji no meio de um texto normal: vira <img class="emo"> (tamanho acompanha a letra)
  function trocarNoTexto(no) {
    var frag = document.createDocumentFragment(), buf = "", mudou = false;
    partes(no.nodeValue).forEach(function (s) {
      var c = EMO.test(s) ? codigo(s) : null;
      if (c && tem.has(c)) {
        if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ""; }
        var i = document.createElement("img"); i.src = arquivo(c); i.alt = s; i.className = "emo"; i.draggable = false;
        frag.appendChild(i); mudou = true;
      } else buf += s;
    });
    if (!mudou) return;
    if (buf) frag.appendChild(document.createTextNode(buf));
    no.parentNode.replaceChild(frag, no);
  }
  function emojiSozinho(t) { t = t.trim(); return !!t && EMO.test(t) && partes(t).length === 1; }
  function varrer(raiz) {
    if (!tem || !raiz || !raiz.parentNode && raiz !== document.body) return;
    if (raiz.nodeType === 3) {
      var p = raiz.parentNode; if (!p || PULAR.test(p.nodeName) || !EMO.test(raiz.nodeValue)) return;
      if (p.namespaceURI === SVG) { if (p.nodeName === "text" && emojiSozinho(p.textContent)) trocarNoDesenho(p); } else trocarNoTexto(raiz);
      return;
    }
    if (raiz.nodeType !== 1) return;
    if (raiz.nodeName === "text" && raiz.namespaceURI === SVG) { if (emojiSozinho(raiz.textContent)) trocarNoDesenho(raiz); return; }
    Array.prototype.slice.call(raiz.getElementsByTagNameNS(SVG, "text")).forEach(function (el) { if (emojiSozinho(el.textContent)) trocarNoDesenho(el); });
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
      var p = n.parentNode; return p && p.namespaceURI !== SVG && !PULAR.test(p.nodeName) && EMO.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    } });
    var nos = []; while (w.nextNode()) nos.push(w.currentNode);
    nos.forEach(trocarNoTexto);
  }
  var lerIndice = function (u) { return fetch(u).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }); };
  Promise.all([lerIndice(BASE + "indice.json"), lerIndice(BASE3D + "indice.json")]).then(function (l) {
    tem3d = new Set(l[1]); tem = new Set(l[0].concat(l[1])); if (!tem.size) return;
    varrer(document.body);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { if (m.type === "characterData") varrer(m.target); else Array.prototype.forEach.call(m.addedNodes, varrer); });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }).catch(function () { /* sem as figuras: fica o emoji do aparelho */ });
})();
