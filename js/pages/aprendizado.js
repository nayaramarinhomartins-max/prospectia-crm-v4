async function init_aprendizado() {
  const u = getUser();
  let regras = [];

  // FIX: colunas corretas no Supabase
  try { regras = JSON.parse(u.followup_rules || '[]'); } catch { regras = []; }

  document.getElementById('aprRoteiro').value   = u.roteiro_agente        || '';
  document.getElementById('aprPerguntas').value = u.perguntas_obrigatorias || '';

  renderRegras(regras);

  // Pendentes — FIX: filtra pelo menor limiar das regras, não 1 dia fixo
  try {
    const el = document.getElementById('followupPendentes');

    if (!regras.length) {
      el.innerHTML = `<div style="padding:14px 20px;font-size:13px;color:var(--tx-3)">Nenhuma regra de follow-up configurada.</div>`;
      return;
    }

    const menorDias = Math.min(...regras.map(r => parseInt(r.dias) || 1));
    const limiar = new Date();
    limiar.setDate(limiar.getDate() - menorDias);

    const rows = await sb.get('MARKETPLACE',
      `usuario_id=eq.${u.id}&status_crm=neq.Fechado&status_crm=neq.Perdido&ultima_interacao=lt.${limiar.toISOString()}&select=empresa,pushname,telefone,status_crm,ultima_interacao&limit=20`
    );

    if (!rows || !rows.length) {
      el.innerHTML = `<div style="padding:14px 20px;font-size:13px;color:var(--tx-3)">Nenhum follow-up pendente hoje 🎉</div>`;
      return;
    }

    const regrasOrdenadas = [...regras].sort((a, b) => a.dias - b.dias);
    const canalLabel = { whatsapp: 'WhatsApp', sms: 'SMS', ligacao: 'Ligação' };

    el.innerHTML = rows.map(l => {
      const nome = l.empresa || l.pushname || l.telefone;
      const dias = l.ultima_interacao
        ? Math.floor((new Date() - new Date(l.ultima_interacao)) / 86400000)
        : '?';
      // Regra mais avançada que se aplica ao lead
      const regra = regrasOrdenadas.filter(r => r.dias <= dias).pop();
      const canal = regra ? (canalLabel[regra.canal] || regra.canal || '—') : '—';
      return `
        <div style="padding:10px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="nav('conversas')">
          <div>
            <div class="fw-600 text-sm">${escHtml(nome)}</div>
            <div class="text-xs tx-3">${l.status_crm} · ${canal}</div>
          </div>
          <span class="badge b-orange">${dias}d sem interação</span>
        </div>`;
    }).join('');
  } catch(e) { console.error('pendentes', e); }
}

// ── Régua ──────────────────────────────────────────────────────
let _regras = [];

function renderRegras(regras) {
  _regras = regras.length ? regras : [
    { dias: 3, mensagem: 'Olá! Passando para verificar se recebeu nossa mensagem.', canal: 'whatsapp' },
    { dias: 7, mensagem: 'Oi! Conseguiu analisar nossa proposta?', canal: 'whatsapp' },
  ];
  const el = document.getElementById('followupRules');
  el.innerHTML = _regras.map((r, i) => `
    <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r);padding:12px;display:flex;flex-direction:column;gap:8px">
      <div class="g2" style="gap:8px">
        <div>
          <label class="lbl" style="font-size:10px">Após X dias sem resposta</label>
          <input type="number" class="inp" style="height:30px;font-size:12px" value="${r.dias}" min="1"
            onchange="_regras[${i}].dias=parseInt(this.value)">
        </div>
        <div>
          <label class="lbl" style="font-size:10px">Canal</label>
          <select class="inp" style="height:30px;font-size:12px" onchange="_regras[${i}].canal=this.value">
            <option value="whatsapp" ${r.canal==='whatsapp'?'selected':''}>WhatsApp</option>
            <option value="sms"      ${r.canal==='sms'     ?'selected':''}>SMS</option>
            <option value="ligacao"  ${r.canal==='ligacao' ?'selected':''}>Ligação</option>
          </select>
        </div>
      </div>
      <div>
        <label class="lbl" style="font-size:10px">Mensagem de follow-up</label>
        <textarea class="inp" style="height:54px;font-size:12px"
          onchange="_regras[${i}].mensagem=this.value">${escHtml(r.mensagem)}</textarea>
      </div>
      <button class="btn btn-danger btn-sm" style="align-self:flex-end"
        onclick="removerRegra(${i})">Remover</button>
    </div>`).join('');
}

function adicionarRegra() {
  _regras.push({ dias: 3, mensagem: '', canal: 'whatsapp' });
  renderRegras(_regras);
}
function removerRegra(i) { _regras.splice(i, 1); renderRegras(_regras); }

// ── Salvar roteiro (FIX: colunas corretas + refreshUser) ───────
async function salvarAprendizado() {
  const u = getUser();
  if (!u) return;
  try {
    await sb.patch('USUARIOS', `id=eq.${u.id}`, {
      roteiro_agente:         document.getElementById('aprRoteiro').value.trim(),
      perguntas_obrigatorias: document.getElementById('aprPerguntas').value.trim()
    });
    await refreshUser();
    showToast('Roteiro salvo!', 'success');
  } catch(e) {
    console.error('salvarAprendizado', e);
    showToast('Erro ao salvar roteiro: ' + e.message, 'error');
  }
}

// ── Salvar régua ───────────────────────────────────────────────
async function salvarReguas() {
  const u = getUser();
  if (!u) return;
  try {
    await sb.patch('USUARIOS', `id=eq.${u.id}`, {
      followup_rules: JSON.stringify(_regras)
    });
    await refreshUser();
    showToast('Régua salva!', 'success');
  } catch(e) {
    console.error('salvarReguas', e);
    showToast('Erro ao salvar régua: ' + e.message, 'error');
  }
}

// ── Salvar tudo ────────────────────────────────────────────────
async function salvarTudo() {
  const u = getUser();
  if (!u) return;
  try {
    await sb.patch('USUARIOS', `id=eq.${u.id}`, {
      roteiro_agente:         document.getElementById('aprRoteiro').value.trim(),
      perguntas_obrigatorias: document.getElementById('aprPerguntas').value.trim(),
      followup_rules:         JSON.stringify(_regras)
    });
    await refreshUser();
    showToast('Tudo salvo com sucesso!', 'success');
  } catch(e) {
    console.error('salvarTudo', e);
    showToast('Erro ao salvar: ' + e.message, 'error');
  }
}

function escHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}