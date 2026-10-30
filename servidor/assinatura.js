/* NeuroTrilha (RMD) — termo de consentimento com assinatura na tela (dedo ou caneta). Usado no programa do computador e na nuvem.
   Guarda: nome de quem assinou, a assinatura (imagem PNG), a data e a versão do termo. A conferência do formato é feita também no servidor. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.NeuroTrilhaAssinatura = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSAO = 'NT-TCLE-1';
  var TERMO = 'Autorizo a avaliação das funções cognitivas (atenção, memória, raciocínio e outras) pelo(a) profissional responsável, com o uso do NeuroTrilha. ' +
    'Fui informado(a) de que: (1) os dados serão usados só para esta avaliação e guardados com sigilo, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018); ' +
    '(2) posso pedir, a qualquer momento, uma cópia dos dados ou que eles sejam apagados; (3) os resultados do NeuroTrilha são experimentais e complementam — não substituem — a avaliação do profissional; ' +
    '(4) posso interromper a avaliação quando quiser, sem prejuízo.';
  var MAX = 200000;
  // conferência do servidor: devolve o termo limpo ou null
  function limpar(t) {
    if (!t || typeof t !== 'object') return null;
    var img = String(t.assinatura || '');
    if (img.length > MAX || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(img)) return null;
    var nome = String(t.nome || '').trim().slice(0, 120); if (nome.length < 3) return null;
    var em = String(t.em || ''); if (isNaN(Date.parse(em))) em = new Date().toISOString();
    return { nome: nome, assinatura: img, versao: VERSAO, em: em.slice(0, 40) };
  }
  // tela: termo + campo do nome + quadro para assinar
  function montar(host, opcoes) {
    opcoes = opcoes || {};
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    host.innerHTML = '<div class="nt-termo"><p class="small" style="margin:0 0 8px">' + esc(TERMO) + '</p>' +
      '<div class="nt-termo-salvo hidden"><img alt="Assinatura" style="max-width:100%;height:90px;border:1px solid #d6e1ee;border-radius:10px;background:#fff"><p class="small"></p><button type="button" class="quiet" data-nova>Assinar de novo</button></div>' +
      '<div class="nt-termo-novo"><label class="small">Nome de quem assina (paciente ou responsável)<input data-nome maxlength="120" style="width:100%;padding:9px;border:1px solid #cbd6e3;border-radius:10px;font:inherit"></label>' +
      '<canvas data-quadro style="display:block;width:100%;height:160px;margin-top:8px;border:2px dashed #9fb4cc;border-radius:12px;background:#fff;touch-action:none"></canvas>' +
      '<div class="small" style="display:flex;justify-content:space-between;margin-top:4px"><span>Assine com o dedo ou o mouse no quadro acima.</span><button type="button" class="quiet" data-limpar>Limpar</button></div></div></div>';
    var cv = host.querySelector('[data-quadro]'), ctx = cv.getContext('2d'), riscos = 0, desenhando = false, ultimo = null, salvo = null;
    function ajustar() { var r = cv.getBoundingClientRect(); if (!r.width) return; cv.width = Math.round(r.width * 2); cv.height = Math.round(r.height * 2); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#172438'; riscos = 0; }
    function ponto(ev) { var r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * cv.width / r.width, y: (ev.clientY - r.top) * cv.height / r.height }; }
    cv.addEventListener('pointerdown', function (ev) { if (!cv.width || cv.width < 10) ajustar(); desenhando = true; ultimo = ponto(ev); try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* sem captura */ } ev.preventDefault(); });
    cv.addEventListener('pointermove', function (ev) { if (!desenhando) return; var p = ponto(ev); ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ultimo = p; riscos++; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { cv.addEventListener(n, function () { desenhando = false; }); });
    host.querySelector('[data-limpar]').addEventListener('click', ajustar);
    host.querySelector('[data-nova]').addEventListener('click', function () { salvo = null; mostrar(); });
    function mostrar() {
      host.querySelector('.nt-termo-salvo').classList.toggle('hidden', !salvo); host.querySelector('.nt-termo-novo').classList.toggle('hidden', !!salvo);
      if (salvo) { host.querySelector('.nt-termo-salvo img').src = salvo.assinatura; host.querySelector('.nt-termo-salvo p').textContent = 'Assinado por ' + salvo.nome + ' em ' + new Date(salvo.em).toLocaleString('pt-BR') + ' (termo ' + salvo.versao + ').'; }
      else setTimeout(ajustar, 0);
    }
    host.querySelector('[data-nome]').value = opcoes.nome || '';
    mostrar();
    return {
      carregar: function (t, nome) { salvo = t && t.assinatura ? t : null; host.querySelector('[data-nome]').value = nome || ''; mostrar(); },
      // devolve o termo assinado (o já salvo ou um novo); null se não houver assinatura
      obter: function () {
        if (salvo) return salvo;
        var nome = host.querySelector('[data-nome]').value.trim();
        if (riscos < 8 || nome.length < 3) return null;
        return { nome: nome, assinatura: cv.toDataURL('image/png'), versao: VERSAO, em: new Date().toISOString() };
      }
    };
  }
  return { VERSAO: VERSAO, TERMO: TERMO, limpar: limpar, montar: montar };
});
