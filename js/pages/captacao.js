async function init_captacao() {
  const u = getUser();
  const plano = (u.plano||'start').toLowerCase();
  const limites = CONFIG.PLAN_LIMITS[plano] || CONFIG.PLAN_LIMITS.start;

  const captados = u.leads_captados_mes || 0;
  document.getElementById('captLimitBar').innerHTML = renderLimitBar(captados, limites.leads_mes, 'Leads captados');
  document.getElementById('captLimitInfo').textContent = `Plano ${plano}: ${limites.leads_mes.toLocaleString('pt-BR')} leads/mês`;

  document.getElementById('captAtivo').checked = u.captacao_ativa || false;
  document.getElementById('captNicho').value   = u.nicho_padrao || '';
  document.getElementById('captDelayMin').value= u.delay_min || 30;
  document.getElementById('captDelayMax').value= u.delay_max || 90;

  // Templates de mensagem
  document.getElementById('captTemplate').value  = u.mensagem_template   || '';
  document.getElementById('captTemplate2').value = u.mensagem_template_2 || '';
  document.getElementById('captTemplate3').value = u.mensagem_template_3 || '';
  document.getElementById('captTemplate4').value = u.mensagem_template_4 || '';
  document.getElementById('captTemplate5').value = u.mensagem_template_5 || '';

  // Segmentação: DDD ou Cidade
  if (u.cidades_alvo && !u.ddd_alvo) {
    document.getElementById('segCidade').checked = true;
    toggleSegMode('cidade');
    document.getElementById('captCidades').value = u.cidades_alvo || '';
  } else {
    document.getElementById('segDDD').checked = true;
    toggleSegMode('ddd');
    document.getElementById('captDDD').value = u.ddd_alvo || '';
  }

  // Dias da semana
  const diasSalvos = (u.dias_prospecao || '1,2,3,4,5').split(',').map(d => d.trim());
  document.querySelectorAll('input[name="diasSemana"]').forEach(cb => {
    cb.checked = diasSalvos.includes(cb.value);
  });

  // Horas
  if (u.hora_inicio) {
    const sel = document.getElementById('captHoraInicio');
    for (const opt of sel.options) { if (parseInt(opt.value)===parseInt(u.hora_inicio)){ opt.selected=true; break; } }
  }
  if (u.hora_fim) {
    const sel = document.getElementById('captHoraFim');
    for (const opt of sel.options) { if (parseInt(opt.value)===parseInt(u.hora_fim)){ opt.selected=true; break; } }
  }

  // Stats do dia
  try {
    const hoje = new Date().toISOString().slice(0,10);
    const rows = await sb.get('MARKETPLACE',
      `usuario_id=eq.${u.id}&select=mensagem_enviada_em&mensagem_enviada_em=gte.${hoje}T00:00:00`
    );
    const total = (rows||[]).length;
    const prospectados = (rows||[]).filter(r => r.mensagem_enviada_em).length;
    document.getElementById('captHoje').textContent  = total;
    document.getElementById('captProsp').textContent = prospectados;
  } catch(e){ console.error('captacao stats', e); }
}

function toggleSegMode(mode) {
  const showDDD    = mode === 'ddd';
  document.getElementById('campoSegDDD').style.display    = showDDD ? '' : 'none';
  document.getElementById('campoSegCidade').style.display = showDDD ? 'none' : '';
}

async function salvarCaptacao() {
  const u = getUser();
  const segMode = document.querySelector('input[name="segMode"]:checked')?.value || 'ddd';
  const diasSelecionados = Array.from(document.querySelectorAll('input[name="diasSemana"]:checked'))
    .map(cb => cb.value).join(',') || '1,2,3,4,5';

  const data = {
    captacao_ativa:    document.getElementById('captAtivo').checked,
    nicho_padrao:      document.getElementById('captNicho').value.trim(),
    ddd_alvo:          segMode==='ddd' ? parseInt(document.getElementById('captDDD').value)||null : null,
    cidades_alvo:      segMode==='cidade' ? document.getElementById('captCidades').value.trim() : '',
    hora_inicio:       parseInt(document.getElementById('captHoraInicio').value),
    hora_fim:          parseInt(document.getElementById('captHoraFim').value),
    delay_min:         parseInt(document.getElementById('captDelayMin').value)||30,
    delay_max:         parseInt(document.getElementById('captDelayMax').value)||90,
    dias_prospecao:    diasSelecionados,
  };
  try {
    await sb.patch('USUARIOS', `id=eq.${u.id}`, data);
    Object.assign(window.S.user, data);
    showToast('Configurações salvas!','success');
  } catch(e){ showToast('Erro ao salvar','error'); }
}

async function salvarTemplates() {
  const u = getUser();
  const t1 = document.getElementById('captTemplate').value.trim();

  if (!t1) {
    showToast('A mensagem 1 é obrigatória!', 'warning');
    return;
  }

  const data = {
    mensagem_template:   t1,
    mensagem_template_2: document.getElementById('captTemplate2').value.trim() || null,
    mensagem_template_3: document.getElementById('captTemplate3').value.trim() || null,
    mensagem_template_4: document.getElementById('captTemplate4').value.trim() || null,
    mensagem_template_5: document.getElementById('captTemplate5').value.trim() || null,
  };

  try {
    await sb.patch('USUARIOS', `id=eq.${u.id}`, data);
    Object.assign(window.S.user, data);
    showToast('Mensagens salvas!', 'success');
  } catch(e){ showToast('Erro ao salvar mensagens','error'); }
}

// Mantido para compatibilidade caso seja chamado em outro lugar
async function salvarTemplate() {
  await salvarTemplates();
}

async function toggleCaptacao(val) {
  const u = getUser();
  if (val) {
    const plano = (u.plano||'start').toLowerCase();
    const limites = CONFIG.PLAN_LIMITS[plano] || CONFIG.PLAN_LIMITS.start;
    const captados = u.leads_captados_mes || 0;
    if (captados >= limites.leads_mes) {
      document.getElementById('captAtivo').checked = false;
      showToast('Limite de leads atingido. Faça upgrade do plano.','warning');
      return;
    }
  }
  try {
    await sb.patch('USUARIOS', `id=eq.${u.id}`, { captacao_ativa: val });
    window.S.user.captacao_ativa = val;
    showToast(val ? 'Captação ativada' : 'Captação pausada', val ? 'success' : 'info', 2000);
  } catch(e){ showToast('Erro ao atualizar','error'); }
}

// ── Captação manual ───────────────────────────────────────

let _captJobId    = null;
let _captPollTimer = null;

async function iniciarCaptacao() {
  const u = getUser();
  const nicho = (document.getElementById('captNicho')?.value || '').trim();
  const cidadeAgora = (document.getElementById('captCidadeAgora')?.value || '').trim();

  let cidade = cidadeAgora;
  if (!cidade) {
    const segMode = document.querySelector('input[name="segMode"]:checked')?.value || 'ddd';
    if (segMode === 'cidade') {
      cidade = (document.getElementById('captCidades')?.value || '').split(',')[0].trim();
    } else {
      const ddd = document.getElementById('captDDD')?.value || '';
      cidade = ddd ? 'DDD ' + ddd : '';
    }
  }

  if (!nicho)  { showToast('Configure o nicho antes de captar.', 'warning'); return; }
  if (!cidade) { showToast('Informe a cidade para esta busca.', 'warning'); return; }

  const maxLeads = parseInt(document.getElementById('captMaxLeads')?.value) || 60;

  try {
    const hc = await fetch(CONFIG.BACKEND_URL + '/api/health', { signal: AbortSignal.timeout(3000) });
    if (!hc.ok) throw new Error();
  } catch {
    showToast('Backend offline. Rode: python backend/server.py', 'error', 6000);
    return;
  }

  const btn = document.getElementById('btnCaptar');
  btn.disabled = true;
  btn.textContent = 'Iniciando...';

  try {
    const res  = await fetch(CONFIG.BACKEND_URL + '/api/captar/iniciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nicho, cidade, max_leads: maxLeads, usuario_id: u.id })
    });
    const data = await res.json();
    if (!res.ok || !data.job_id) throw new Error(data.erro || 'Erro ao iniciar');

    _captJobId = data.job_id;
    _captSetRunning(true, maxLeads);
    _captPoll(maxLeads);
    showToast('Captando "' + nicho + '" em ' + cidade + '...', 'info', 3000);
  } catch(e) {
    showToast('Erro: ' + e.message, 'error');
    _captSetRunning(false, 0);
  }
}

async function pararCaptacao() {
  if (!_captJobId) return;
  try {
    await fetch(CONFIG.BACKEND_URL + '/api/captar/parar/' + _captJobId, { method: 'POST' });
  } catch {}
  _captSetRunning(false, 0);
  showToast('Captação interrompida.', 'info');
}

function _captSetRunning(rodando, total) {
  const btn   = document.getElementById('btnCaptar');
  const stop  = document.getElementById('btnPararCapt');
  const panel = document.getElementById('captProgressPanel');

  if (rodando) {
    btn.disabled = true;
    btn.textContent = 'Captando...';
    if (stop)  stop.style.display  = '';
    if (panel) panel.style.display = '';
    const lbl = document.getElementById('captProgressLabel');
    const cnt = document.getElementById('captProgressCount');
    const bar = document.getElementById('captProgressBar');
    const log = document.getElementById('captLogBox');
    if (lbl) lbl.textContent = 'Buscando leads...';
    if (cnt) cnt.textContent = '0 / ' + total;
    if (bar) { bar.style.width = '0%'; bar.style.background = ''; }
    if (log) log.textContent = '';
  } else {
    btn.disabled = false;
    btn.textContent = 'Captar Agora';
    if (stop) stop.style.display = 'none';
    if (_captPollTimer) { clearTimeout(_captPollTimer); _captPollTimer = null; }
  }
}

function _captPoll(total) {
  if (!_captJobId) return;
  _captPollTimer = setTimeout(async () => {
    try {
      const res  = await fetch(CONFIG.BACKEND_URL + '/api/captar/status/' + _captJobId);
      const data = await res.json();

      const coletado = data.coletado || 0;
      const pct = total > 0 ? Math.min(Math.round(coletado / total * 100), 100) : 0;

      const lbl = document.getElementById('captProgressLabel');
      const cnt = document.getElementById('captProgressCount');
      const bar = document.getElementById('captProgressBar');
      const log = document.getElementById('captLogBox');

      if (cnt) cnt.textContent = coletado + ' / ' + total + ' leads';
      if (bar) bar.style.width = pct + '%';

      if (log && data.logs && data.logs.length) {
        log.textContent = '';
        data.logs.forEach(function(l) {
          const div = document.createElement('div');
          div.textContent = '> ' + l;
          log.appendChild(div);
        });
        log.scrollTop = log.scrollHeight;
      }

      if (data.status === 'rodando') {
        if (lbl) lbl.textContent = 'Coletando leads...';
        _captPoll(total);
      } else if (data.status === 'concluido') {
        if (lbl) lbl.textContent = 'Concluido — ' + coletado + ' leads captados';
        if (bar) bar.style.background = 'var(--green)';
        _captSetRunning(false, 0);
        showToast(coletado + ' leads adicionados ao CRM!', 'success', 5000);
        const u = getUser();
        const hoje = new Date().toISOString().slice(0, 10);
        sb.get('MARKETPLACE', 'usuario_id=eq.' + u.id + '&select=id&criado_em=gte.' + hoje + 'T00:00:00')
          .then(function(rows) {
            const el = document.getElementById('captHoje');
            if (el) el.textContent = (rows || []).length;
          }).catch(function() {});
      } else {
        if (lbl) lbl.textContent = data.status === 'parado' ? 'Interrompido' : ('Erro: ' + (data.erro || 'desconhecido'));
        _captSetRunning(false, 0);
      }
    } catch(e) {
      const lbl = document.getElementById('captProgressLabel');
      if (lbl) lbl.textContent = 'Sem resposta do backend.';
      _captSetRunning(false, 0);
    }
  }, 3000);
}

function explicarCaptacao() {
  const u = getUser();
  const ativa = u.captacao_ativa;

  if (!ativa) {
    showToast(
      'Ative a captação para começar. O sistema buscará leads automaticamente todo dia útil, das 8h às 16h.',
      'info',
      6000
    );
    return;
  }

  showToast(
    'Captação ativa ✓ — O sistema busca leads no Google Maps todo dia útil, das 8h às 16h, e envia a mensagem de prospecção automaticamente pelo seu WhatsApp.',
    'success',
    7000
  );
}