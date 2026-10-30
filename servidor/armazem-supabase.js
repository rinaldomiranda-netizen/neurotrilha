// NeuroTrilha — armazém da nuvem: guarda e lê no banco (tabelas nt_*), usando a chave de serviço da função.
// As contas dos profissionais usam e-mail interno que não existe (usuario@neurotrilha.invalid): nenhum e-mail é enviado.
export const DOMINIO_EMAIL = 'neurotrilha.invalid';

export function criarArmazem(sb) {
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  return {
    async conta(id) { return ok(await sb.from('nt_contas').select('*').eq('user_id', id).maybeSingle()); },
    async contas() { return ok(await sb.from('nt_contas').select('user_id,usuario,nome,papel,ativo,senha_provisoria,mfa,criado_em').order('papel').order('usuario')); },
    async criarConta({ usuario, nome, papel, senha }) {
      const { data, error } = await sb.auth.admin.createUser({ email: usuario + '@' + DOMINIO_EMAIL, password: senha, email_confirm: true, user_metadata: { usuario, nome, app: 'neurotrilha' } });
      if (error || !data || !data.user) throw new Error(error ? error.message : 'conta não criada');
      const r = await sb.from('nt_contas').insert({ user_id: data.user.id, usuario, nome, papel, ativo: true, senha_provisoria: true }).select().single();
      if (r.error) { await sb.auth.admin.deleteUser(data.user.id); throw new Error(r.error.message); }  // não deixa conta solta
      return r.data;
    },
    async atualizarConta(id, campos) { ok(await sb.from('nt_contas').update(campos).eq('user_id', id)); },
    async trocarSenha(id, senha) { const { error } = await sb.auth.admin.updateUserById(id, { password: senha }); if (error) throw new Error(error.message); },

    async participantes(dono) {
      let q = sb.from('nt_participantes').select('dados').order('criado_em', { ascending: false }).limit(2000);
      if (dono) q = q.eq('dono', dono);
      return ok(await q).map((r) => r.dados);
    },
    async participante(id) { return ok(await sb.from('nt_participantes').select('id,dono,dados').eq('id', id).maybeSingle()); },
    async criarParticipante(reg) {
      const codigo = ok(await sb.rpc('nt_proximo_codigo'));
      reg.dados.code = codigo;
      ok(await sb.from('nt_participantes').insert({ id: reg.id, dono: reg.dono, codigo, nome_busca: reg.nome_busca, nascimento: reg.nascimento, dados: reg.dados }));
      return reg.dados;
    },
    async atualizarParticipante(id, campos) { ok(await sb.from('nt_participantes').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', id)); return campos.dados; },

    async sessao(id) { return ok(await sb.from('nt_sessoes').select('id,dono,participante,status,dados').eq('id', id).maybeSingle()); },
    async sessaoPorToken(token) { const r = ok(await sb.from('nt_sessoes').select('dados').eq('token', token).maybeSingle()); return r ? r.dados : null; },
    async criarSessao(reg) { ok(await sb.from('nt_sessoes').insert(reg)); },
    async salvarSessao(id, status, dados) { ok(await sb.from('nt_sessoes').update({ status, dados, atualizado_em: new Date().toISOString() }).eq('id', id)); },
    async sessoes(dono, participante) {
      let q = sb.from('nt_sessoes').select('id,participante,status,dados').order('criado_em', { ascending: false }).limit(300);
      if (dono) q = q.eq('dono', dono);
      if (participante) q = q.eq('participante', participante);
      return ok(await q);
    },

    async criarQuestionario(reg) { ok(await sb.from('nt_questionarios').insert(reg)); },
    async questionarioPorToken(token) { return ok(await sb.from('nt_questionarios').select('id,participante,dono,dados').eq('token', token).maybeSingle()); },
    async salvarQuestionario(id, dados) { ok(await sb.from('nt_questionarios').update({ dados, respondido_em: dados.respondidoEm || null }).eq('id', id)); },
    async questionarios(participante) { return ok(await sb.from('nt_questionarios').select('id,dados').eq('participante', participante).order('criado_em', { ascending: false })); },

    // LGPD: registro de acessos, exclusão completa de uma pessoa e verificação em duas etapas
    async registrar(reg) { try { await sb.from('nt_auditoria').insert(reg); } catch (e) { /* o registro nunca derruba o atendimento */ } },
    async auditoria(limite) { return ok(await sb.from('nt_auditoria').select('em,usuario,acao,alvo,detalhe,ip').order('id', { ascending: false }).limit(limite)).map((r) => ({ at: r.em, username: r.usuario, action: r.acao, target: r.alvo, detail: r.detalhe, ip: r.ip })); },
    async apagarParticipante(id) {
      const tokens = ok(await sb.from('nt_sessoes').select('token').eq('participante', id)).map((r) => r.token);
      if (tokens.length) ok(await sb.from('nt_estacoes').update({ sessao_token: null }).in('sessao_token', tokens));
      ok(await sb.from('nt_questionarios').delete().eq('participante', id));
      ok(await sb.from('nt_sessoes').delete().eq('participante', id));
      ok(await sb.from('nt_participantes').delete().eq('id', id));
    },
    async limparMfa(id) {
      const { data } = await sb.auth.admin.mfa.listFactors({ userId: id });
      for (const f of (data && data.factors) || []) await sb.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
    },

    async criarEstacao(reg) { ok(await sb.from('nt_estacoes').insert(reg)); },
    async estacaoPorCodigo(codigo) { return ok(await sb.from('nt_estacoes').select('*').eq('codigo', codigo).maybeSingle()); },
    async estacaoPorChave(chave) { return ok(await sb.from('nt_estacoes').select('*').eq('chave', chave).maybeSingle()); },
    async salvarEstacao(chave, campos) { ok(await sb.from('nt_estacoes').update(campos).eq('chave', chave)); },
  };
}
