let _campanhas   = [];
let _campAtiva   = null;
let _campLeads   = [];
let _campLeadsFiltrados = [];

async function init_campanhas() {
  await carregarCampanhas();
}

async function carregarCampanhas() {
  const u = getUser();
  try {
    const rows = await sb.get('MARKETPLACE',
      `usuario_id=eq.${u.id}&select=campanha,status_crm,score,created_at,mensagem_enviada_em&not.campanha.is.null`
    );

    const map = {};
    (rows || []).forEach(l => {
      const k = l.campanha || 'Sem campanha';
      if (!map[k]) map[k] = { nome: k, total: 0, fechados: 0, quentes: 0, status: 'ativa', created_at: l.mensagem_enviada_em || l.created_at };
      map[k].total++;
      const st = normCampStatus(l.status_crm);
      if (st === 'Fechado') map[k].fechados++;
      if (parseInt(l.score || 0) >= 70) map[k].quentes++;
      if (l.mensagem_enviada_em && (!map[k].created_at || l.mensagem_enviada_em < map[k].created_at)) {
        map[k].created_at = l.mensagem_enviada_em;
      }
    });

    let saved = [];
    try { saved = JSON.parse(u.campanhas_config || '[]'); } catch {}
    saved.forEach(c => {
      if (!map[c.nome]) map[c.nome] = { total: 0, fechados: 0, quentes: 0 };
      map[c.nome] = { ...map[c.nome], ...c };
    });

    _campanhas = Object.values(map);
    renderCampanhas(_campanhas);
  } catch(e) {
    console.error(e);
    renderCampanhas([]);
  }
}

function normCampStatus(s) {
  if (!s) return 'Lead';
  if (s === 'novo') return 'Lead';
  if (s === 'abordado') return 'Contato Feito';
  return s;
}

function renderCampanhas(list) {
  const el = document.getElementById('campGrid');
  if (!list.length) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1;padding:80px">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      <h4>Nenhuma campanha ainda</h4>
      <p>Clique em "Nova campanha" para criar sua primeira campanha segmentada.</p>
    </div>`;
    return;
  }

  el.innerHTML = list.map((c, i) => {
    const taxa      = c.total > 0 ? Math.round(c.fechados / c.total * 100) : 0;
    const barWidth  = Math.min(taxa * 2, 100);
    const statusCls = c.status === 'ativa' ? 'b-green' : c.status === 'pausada' ? 'b-yellow' : 'b-gray';
    const statusLabel = { ativa: 'Ativa', pausada: 'Pausada', concluida: 'Concluída' }[c.status] || 'Ativa';
    const dataStr   = c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—';

    return `<div class="card" style="cursor:pointer;position:relative" onclick="verLeadsCampanha(${i})">
      <div class="cp">
        <div class="flex justify-between items-start" style="margin-bottom:10px">
          <div class="fw-700 text-base truncate" style="max-width:65%">${escHtml(c.nome)}</div>
          <span class="badge ${statusCls}">${statusLabel}</span>
        </div>
        <div class="text-xs tx-4" style="margin-bottom:12px">📅 Criada em ${dataStr}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
          <div style="text-align:center">
            <div class="fw-800 text-xl" style="color:var(--tx)">${c.total}</div>
            <div class="text-xs tx-4">leads</div>
          </div>
          <div style="text-align:center">
            <div class="fw-800 text-xl" style="color:var(--green)">${c.fechados}</div>
            <div class="text-xs tx-4">fechados</div>
          </div>
          <div style="text-align:center">
            <div class="fw-800 text-xl" style="color:var(--yellow)">${c.quentes}</div>
            <div class="text-xs tx-4">quentes</div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-xs tx-3" style="margin-bottom:4px">
            <span>Taxa de conversão</span>
            <span class="fw-600" style="color:${taxa>=10?'var(--green)':taxa>=5?'var(--yellow)':'var(--red)'}">${taxa}%</span>
          </div>
          <div class="limit-bar">
            <div class="limit-fill" style="width:${barWidth}%;background:${taxa>=10?'var(--green)':taxa>=5?'var(--yellow)':'var(--red)'}"></div>
          </div>
        </div>
        ${c.nicho ? `<div class="text-xs tx-4" style="margin-top:10px">Nicho: ${escHtml(c.nicho)}${c.cidades?' · '+escHtml(c.cidades):''}</div>` : ''}
        <div class="flex gap-6" style="margin-top:12px" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" style="flex:1;font-size:11px" onclick="editarCampanha(${i})">✏ Editar</button>
          ${c.status === 'ativa'
            ? `<button class="btn btn-ghost btn-sm" style="flex:1;font-size:11px;color:var(--yellow)" onclick="mudarStatusCamp(${i},'pausada')">⏸ Pausar</button>`
            : `<button class="btn btn-ghost btn-sm" style="flex:1;font-size:11px;color:var(--green)" onclick="mudarStatusCamp(${i},'ativa')">▶ Ativar</button>`
          }
          <button class="btn btn-ghost btn-sm" style="flex:1;font-size:11px;color:var(--red)" onclick="excluirCampanha(${i})">🗑 Excluir</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function verLeadsCampanha(i) {
  const c = _campanhas[i];
  _campAtiva = i;
  const u = getUser();

  document.getElementById('campLeadsModal').classList.add('open');
  document.getElementById('campLeadsNome').textContent = c.nome;
  document.getElementById('campLeadsBody').innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--tx-3)">Carregando leads...</td></tr>`;
  document.getElementById('campLeadsCount').textContent = '';

  try {
    const rows = await sb.get('MARKETPLACE',
      `usuario_id=eq.${u.id}&campanha=eq.${encodeURIComponent(c.nome)}&select=telefone,empresa,pushname,cidade,score,status_crm,ultima_interacao,categoria&order=score.desc`
    );
    _campLeads = (rows || []).map(l => ({ ...l, _normStatus: normCampStatus(l.status_crm) }));
    _campLeadsFiltrados = [..._campLeads];
    renderCampLeadsTable(_campLeadsFiltrados);
  } catch(e) {
    document.getElementById('campLeadsBody').innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--red)">Erro ao carregar leads</td></tr>`;
  }
}

function renderCampLeadsTable(list) {
  document.getElementById('campLeadsCount').textContent = `${list.length} lead${list.length !== 1 ? 's' : ''}`;
  const tbody = document.getElementById('campLeadsBody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--tx-3)">Nenhum lead nesta campanha</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(l => {
    const nome  = l.empresa || l.pushname || formatCampPhone(l.telefone || '');
    const score = parseInt(l.score || 0);
    const sc    = score === 0 ? 'var(--tx-4)' : score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)';
    const statusClass = { 'Lead':'b-gray','Contato Feito':'b-blue','Interesse':'b-yellow','Proposta':'b-orange','Fechado':'b-green','Perdido':'b-red' }[l._normStatus] || 'b-gray';
    const ultimo = l.ultima_interacao ? new Date(l.ultima_interacao).toLocaleDateString('pt-BR') : '—';
    return `<tr>
      <td class="fw-600 text-sm">${escHtml(nome)}</td>
      <td class="text-sm tx-3">${formatCampPhone(l.telefone || '')}</td>
      <td class="text-sm">${escHtml(l.cidade || '—')}</td>
      <td><span style="font-weight:700;color:${sc}">${score || '—'}</span></td>
      <td><span class="badge ${statusClass}" style="font-size:10px">${l._normStatus}</span></td>
      <td class="text-xs tx-4">${ultimo}</td>
    </tr>`;
  }).join('');
}

function filtrarCampLeads() {
  const status = document.getElementById('campLeadsFiltroStatus').value;
  const score  = document.getElementById('campLeadsFiltroScore').value;
  _campLeadsFiltrados = _campLeads.filter(l => {
    if (status && l._normStatus !== status) return false;
    const s = parseInt(l.score || 0);
    if (score === 'hot'  && s < 70) return false;
    if (score === 'warm' && (s < 40 || s >= 70)) return false;
    return true;
  });
  renderCampLeadsTable(_campLeadsFiltrados);
}

function fecharCampLeads() {
  document.getElementById('campLeadsModal').classList.remove('open');
  _campLeads = [];
  _campLeadsFiltrados = [];
}

function abrirDispararCamp() {
  if (!_campLeadsFiltrados.length) { showToast('Nenhum lead para disparar', 'warning'); return; }
  const c = _campanhas[_campAtiva];
  document.getElementById('campDispModal').classList.add('open');
  document.getElementById('campDispResumo').innerHTML = `Envio via <strong>WhatsApp</strong> para <strong>${_campLeadsFiltrados.length} lead${_campLeadsFiltrados.length !== 1 ? 's' : ''}</strong> filtrados.`;
  document.getElementById('campDispMsg').value = c.mensagem || '';
  document.getElementById('campDispPreview').style.display = 'none';
}

function fecharDispModal() {
  document.getElementById('campDispModal').classList.remove('open');
}

async function confirmarDisparo() {
  const u   = getUser();
  const c   = _campanhas[_campAtiva];
  const msg = document.getElementById('campDispMsg').value.trim();
  if (!msg) { showToast('Escreva a mensagem', 'warning'); return; }

  const prev = document.getElementById('campDispPreview');
  prev.style.display = '';
  prev.innerHTML = `Enviando ${_campLeadsFiltrados.length} leads ao servidor...`;

  const btn = document.querySelector('#campDispModal .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Disparando...'; }

  try {
    const payload = {
      usuario_id:     u.id,
      campanha:       c.nome,
      mensagem:       msg,
      delay_segundos: u.delay_min || 5,
      leads: _campLeadsFiltrados.map(l => ({
        telefone:         l.telefone,
        empresa:          l.empresa  || l.pushname || '',
        cidade:           l.cidade   || '',
        categoria:        l.categoria || '',
        modo_atendimento: l.modo_atendimento || 'ia'
      }))
    };

    const result = await callWebhook('campanha-disparo-massa', payload);

    if (result?.ok !== false) {
      prev.innerHTML = `✅ ${_campLeadsFiltrados.length} disparos enviados!`;
      showToast(`Campanha disparada para ${_campLeadsFiltrados.length} leads!`, 'success');
      setTimeout(() => { fecharDispModal(); fecharCampLeads(); carregarCampanhas(); }, 1500);
    } else {
      prev.innerHTML = `❌ Erro: ${result?.mensagem || 'Falha no disparo'}`;
      showToast('Erro ao disparar campanha', 'error');
    }
  } catch(e) {
    console.error(e);
    prev.innerHTML = '❌ Erro de conexão com o servidor.';
    showToast('Erro de conexão', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar disparo'; }
  }
}

async function mudarStatusCamp(i, novoStatus) {
  event.stopPropagation();
  const u = getUser();
  _campanhas[i].status = novoStatus;
  try {
    await sb.patch('USUARIOS', `id=eq.${u.id}`, {
      campanhas_config: JSON.stringify(_campanhas.map(c => ({
        nome: c.nome, nicho: c.nicho, cidades: c.cidades,
        ddd: c.ddd, mensagem: c.mensagem, limite: c.limite, status: c.status
      })))
    });
    await refreshUser();
    renderCampanhas(_campanhas);
    showToast(`Campanha ${novoStatus}`, 'success', 2000);
  } catch(e) { showToast('Erro ao atualizar', 'error'); }
}

async function excluirCampanha(i) {
  event.stopPropagation();
  const c = _campanhas[i];
  if (!confirm(`Excluir a campanha "${c.nome}"?\n\nOs leads vinculados não serão apagados.`)) return;
  const u = getUser();
  _campanhas.splice(i, 1);
  try {
    await sb.patch('USUARIOS', `id=eq.${u.id}`, {
      campanhas_config: JSON.stringify(_campanhas.map(c => ({
        nome: c.nome, nicho: c.nicho, cidades: c.cidades,
        ddd: c.ddd, mensagem: c.mensagem, limite: c.limite, status: c.status
      })))
    });
    await refreshUser();
    renderCampanhas(_campanhas);
    showToast('Campanha excluída', 'info', 2000);
  } catch(e) {
    showToast('Erro ao excluir', 'error');
    await carregarCampanhas();
  }
}

function abrirNovaCampanha() {
  _campAtiva = null;
  document.getElementById('campModalTitulo').textContent = 'Nova Campanha';
  ['campNome','campNicho','campCidades','campDDD','campMensagem','campLimite'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('campStatus').value = 'ativa';
  document.getElementById('campModal').classList.add('open');
}

function editarCampanha(i) {
  event.stopPropagation();
  const c = _campanhas[i];
  _campAtiva = i;
  document.getElementById('campModalTitulo').textContent = 'Editar Campanha';
  document.getElementById('campNome').value     = c.nome     || '';
  document.getElementById('campNicho').value    = c.nicho    || '';
  document.getElementById('campCidades').value  = c.cidades  || '';
  document.getElementById('campDDD').value      = c.ddd      || '';
  document.getElementById('campMensagem').value = c.mensagem || '';
  document.getElementById('campLimite').value   = c.limite   || '';
  document.getElementById('campStatus').value   = c.status   || 'ativa';
  document.getElementById('campModal').classList.add('open');
}

async function salvarCampanha() {
  const u = getUser();
  const nova = {
    nome:     document.getElementById('campNome').value.trim(),
    nicho:    document.getElementById('campNicho').value.trim(),
    cidades:  document.getElementById('campCidades').value.trim(),
    ddd:      document.getElementById('campDDD').value.trim(),
    mensagem: document.getElementById('campMensagem').value.trim(),
    limite:   parseInt(document.getElementById('campLimite').value) || 0,
    status:   document.getElementById('campStatus').value,
    total: 0, fechados: 0, quentes: 0
  };

  if (!nova.nome) { showToast('Digite o nome da campanha', 'warning'); return; }

  if (_campAtiva !== null) {
    _campanhas[_campAtiva] = { ..._campanhas[_campAtiva], ...nova };
  } else {
    _campanhas.push(nova);
  }

  try {
    await sb.patch('USUARIOS', `id=eq.${u.id}`, {
      campanhas_config: JSON.stringify(_campanhas.map(c => ({
        nome: c.nome, nicho: c.nicho, cidades: c.cidades,
        ddd: c.ddd, mensagem: c.mensagem, limite: c.limite, status: c.status
      })))
    });
    await refreshUser();
    fecharCampModal();
    await carregarCampanhas();
    showToast('Campanha salva!', 'success');
  } catch(e) {
    showToast('Erro ao salvar', 'error');
    console.error(e);
  }
}

function filtrarCampanhas() {
  const search = document.getElementById('campSearch').value.toLowerCase();
  const status = document.getElementById('campFiltroStatus').value;
  const list = _campanhas.filter(c => {
    if (search && !c.nome.toLowerCase().includes(search)) return false;
    if (status && (c.status || 'ativa') !== status) return false;
    return true;
  });
  renderCampanhas(list);
}

function fecharCampModal() { document.getElementById('campModal').classList.remove('open'); }
function formatCampPhone(t = '') { const n = t.replace(/\D/g,''); if (n.length >= 11) return `(${n.slice(-11,-9)}) ${n.slice(-9,-4)}-${n.slice(-4)}`; return t; }
function escHtml(s = '') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }