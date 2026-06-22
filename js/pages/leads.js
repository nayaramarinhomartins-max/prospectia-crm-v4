let _allLeadsData = [];
let _activeLead = null;

async function init_leads() {
  await loadLeads();
}

async function loadLeads() {
  const u = getUser();
  try {
    const rows = await sb.get('MARKETPLACE', `usuario_id=eq.${u.id}&select=*&order=mensagem_enviada_em.desc.nullslast`);
    _allLeadsData = rows || [];
    window.S.leads = _allLeadsData;
    filterLeads();
  } catch(e) { console.error('leads', e); showToast('Erro ao carregar leads','error'); }
}

function normStatus(s) {
  if (!s) return 'Lead';
  if (s === 'novo') return 'Lead';
  if (s === 'abordado') return 'Contato Feito';
  return s;
}

function filterLeads() {
  const search = document.getElementById('leadSearch').value.toLowerCase();
  const status = document.getElementById('fStatus').value;
  const scoreF = document.getElementById('fScore').value;

  let list = _allLeadsData.filter(l => {
    const nome = (l.empresa||l.pushname||l.telefone||'').toLowerCase();
    if (search && !nome.includes(search) && !(l.telefone||'').includes(search) && !(l.cidade||'').toLowerCase().includes(search)) return false;
    const st = normStatus(l.status_crm);
    if (status && st !== status) return false;
    if (scoreF) {
      const s = parseInt(l.score)||0;
      if (scoreF==='hot' && s<70) return false;
      if (scoreF==='warm' && (s<40||s>=70)) return false;
      if (scoreF==='cold' && s>=40) return false;
    }
    return true;
  });

  document.getElementById('leadsCount').textContent = `${list.length} lead${list.length!==1?'s':''}`;
  renderLeadsTable(list);
}

function renderLeadsTable(list) {
  const tbody = document.getElementById('leadsTbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--tx-3)">Nenhum lead encontrado</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(l => {
    const nome = l.empresa || l.pushname || formatPhone(l.telefone||'');
    const score = parseInt(l.score)||0;
    const scoreColor = score>=70?'var(--green)':score>=40?'var(--yellow)':score>0?'var(--red)':'var(--tx-4)';
    const st = normStatus(l.status_crm);
    const statusClass = {'Lead':'b-gray','Contato Feito':'b-blue','Interesse':'b-yellow','Proposta':'b-orange','Fechado':'b-green','Perdido':'b-red'}[st]||'b-gray';
    return `<tr>
      <td><div style="font-weight:600;color:var(--tx)">${escHtml(nome)}</div>${l.categoria?`<div style="font-size:11px;color:var(--tx-4)">${escHtml(l.categoria)}</div>`:''}</td>
      <td style="font-size:12px;color:var(--tx-3)">${formatPhone(l.telefone||'')}</td>
      <td style="font-size:12px">${escHtml(l.cidade||'—')}</td>
      <td style="font-size:12px">${escHtml(l.campanha||'—')}</td>
      <td><div style="display:flex;align-items:center;gap:6px"><div style="width:7px;height:7px;border-radius:50%;background:${scoreColor}"></div><span style="font-weight:700;font-size:13px;color:${scoreColor}">${score||'—'}</span></div></td>
      <td><span class="badge ${statusClass}">${st}</span></td>
      <td style="font-size:11px;color:var(--tx-4)">${l.ultima_interacao?new Date(l.ultima_interacao).toLocaleDateString('pt-BR'):'—'}</td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="openLead('${l.telefone}')" title="Detalhes"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="goToChatPhone('${l.telefone}')" title="Conversa"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
      </div></td>
    </tr>`;
  }).join('');
}

function openLead(telefone) {
  const l = _allLeadsData.find(x => x.telefone === telefone);
  if (!l) return;
  _activeLead = l;
  const st = normStatus(l.status_crm);
  document.getElementById('leadModalTitle').textContent = l.empresa || l.pushname || formatPhone(l.telefone);
  document.getElementById('leadModalBody').innerHTML = `
    <div class="g2" style="gap:14px">
      <div class="fg"><label class="lbl">Status CRM</label>
        <select class="inp" id="lmStatus">${['Lead','Contato Feito','Interesse','Proposta','Fechado','Perdido'].map(s=>`<option${s===st?' selected':''}>${s}</option>`).join('')}</select>
      </div>
      <div class="fg"><label class="lbl">Score (0-100)</label>
        <input type="number" class="inp" id="lmScore" value="${l.score||0}" min="0" max="100">
      </div>
    </div>
    <div class="g2" style="gap:14px;margin-top:14px">
      <div><div class="lbl" style="margin-bottom:3px">Empresa</div><div style="color:var(--tx)">${escHtml(l.empresa||'—')}</div></div>
      <div><div class="lbl" style="margin-bottom:3px">Telefone</div><div style="color:var(--tx)">${formatPhone(l.telefone||'')}</div></div>
      <div><div class="lbl" style="margin-bottom:3px">Cidade</div><div style="color:var(--tx)">${escHtml(l.cidade||'—')}</div></div>
      <div><div class="lbl" style="margin-bottom:3px">Categoria</div><div style="color:var(--tx)">${escHtml(l.categoria||'—')}</div></div>
    </div>
    <div class="fg" style="margin-top:14px"><label class="lbl">Anotações</label>
      <textarea class="inp" id="lmNota" rows="3">${escHtml(l.anotacoes||'')}</textarea>
    </div>`;
  document.getElementById('leadModal').classList.add('open');
}

async function saveLeadModal() {
  if (!_activeLead) return;
  const u = getUser();
  const status = document.getElementById('lmStatus').value;
  const score  = document.getElementById('lmScore').value;
  const nota   = document.getElementById('lmNota').value;
  try {
    await sb.patch('MARKETPLACE', `usuario_id=eq.${u.id}&telefone=eq.${_activeLead.telefone}`, { status_crm: status, score, anotacoes: nota });
    const idx = _allLeadsData.findIndex(x => x.telefone === _activeLead.telefone);
    if (idx>=0){ _allLeadsData[idx].status_crm=status; _allLeadsData[idx].score=score; _allLeadsData[idx].anotacoes=nota; }
    closeLeadModal(); filterLeads();
    showToast('Lead atualizado!','success');
  } catch(e){ showToast('Erro ao salvar','error'); }
}

// ── NOVO LEAD ──
function abrirNovoLead() {
  _activeLead = null;
  document.getElementById('newLeadModal').classList.add('open');
}
function fecharNovoLead() {
  document.getElementById('newLeadModal').classList.remove('open');
  document.getElementById('newLeadForm').reset();
}
async function salvarNovoLead() {
  const u = getUser();
  const empresa  = document.getElementById('nlEmpresa').value.trim();
  const telefone = document.getElementById('nlTelefone').value.trim().replace(/\D/g,'');
  const cidade   = document.getElementById('nlCidade').value.trim();
  const cat      = document.getElementById('nlCategoria').value.trim();
  const end      = document.getElementById('nlEndereco').value.trim();
  const nota     = document.getElementById('nlAnotacoes').value.trim();

  if (!telefone){ showToast('Telefone é obrigatório','warning'); return; }
  try {
    await sb.post('MARKETPLACE',{ usuario_id:u.id, empresa, telefone, cidade, categoria:cat, endereco:end, anotacoes:nota, status_crm:'Lead', score:0 });
    fecharNovoLead();
    await loadLeads();
    showToast('Lead adicionado!','success');
  } catch(e){ showToast('Erro ao salvar lead','error'); console.error(e); }
}

// ── IMPORTAR PLANILHA ──
function abrirImportModal() {
  document.getElementById('importModal').classList.add('open');
}
function fecharImportModal() {
  document.getElementById('importModal').classList.remove('open');
  document.getElementById('importFile').value='';
  document.getElementById('importPreview').innerHTML='';
}
function baixarModelo() {
  const csv = 'empresa,telefone,cidade,categoria,endereco,anotacoes\nPetshop Exemplo,11999998888,São Paulo,Petshop,Rua A 123,Lead qualificado';
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='modelo_importacao.csv'; a.click();
}
async function processarImport() {
  const file = document.getElementById('importFile').files[0];
  if (!file){ showToast('Selecione um arquivo','warning'); return; }
  const u = getUser();
  const text = await file.text();
  const linhas = text.trim().split('\n');
  if (linhas.length < 2){ showToast('Arquivo vazio ou sem dados','warning'); return; }

  const header = linhas[0].toLowerCase().replace(/"/g,'').split(',').map(h => h.trim());
  const colEmpresa  = header.findIndex(h => h.includes('empresa'));
  const colTelefone = header.findIndex(h => h.includes('telefone') || h.includes('fone'));
  const colCidade   = header.findIndex(h => h.includes('cidade'));
  const colCat      = header.findIndex(h => h.includes('categoria'));
  const colEnd      = header.findIndex(h => h.includes('ender'));
  const colNota     = header.findIndex(h => h.includes('anota') || h.includes('obs'));

  if (colTelefone < 0){ showToast('Coluna "telefone" não encontrada','error'); return; }

  const dados = linhas.slice(1).map(l => {
    const cols = l.replace(/\r/g,'').split(',').map(c => c.replace(/"/g,'').trim());
    return {
      usuario_id: u.id,
      empresa:    colEmpresa>=0  ? cols[colEmpresa]  : '',
      telefone:   cols[colTelefone]?.replace(/\D/g,''),
      cidade:     colCidade>=0   ? cols[colCidade]   : '',
      categoria:  colCat>=0      ? cols[colCat]      : '',
      endereco:   colEnd>=0      ? cols[colEnd]      : '',
      anotacoes:  colNota>=0     ? cols[colNota]     : '',
      status_crm: 'Lead', score: 0
    };
  }).filter(d => d.telefone && d.telefone.length >= 8);

  if (!dados.length){ showToast('Nenhum lead válido encontrado','warning'); return; }

  document.getElementById('importPreview').innerHTML = `<div class="alert alert-info mt-8">Importando ${dados.length} leads...</div>`;

  let ok = 0, err = 0;
  for (const d of dados) {
    try { await sb.post('MARKETPLACE', d); ok++; } catch(e){ err++; }
  }

  fecharImportModal();
  await loadLeads();
  showToast(`${ok} leads importados${err>0?`, ${err} com erro`:''}!`, ok>0?'success':'warning');
}

function closeLeadModal() { document.getElementById('leadModal').classList.remove('open'); }
function goToChat()        { closeLeadModal(); if(_activeLead){ window._navPhone=_activeLead.telefone; nav('conversas'); } }
function goToChatPhone(t)  { window._navPhone=t; nav('conversas'); }

function exportarLeads() {
  if (!_allLeadsData.length){ showToast('Nenhum lead para exportar','warning'); return; }
  const header = 'empresa,telefone,cidade,categoria,score,status_crm,criado_em';
  const rows = _allLeadsData.map(l =>
    [l.empresa,l.telefone,l.cidade,l.categoria,l.score,l.status_crm,l.created_at]
    .map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`)
    .join(',')
  );
  const csv = [header,...rows].join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`leads_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  showToast('CSV exportado!','success');
}

function formatPhone(t='') { const n=t.replace(/\D/g,''); if(n.length>=11)return`(${n.slice(-11,-9)}) ${n.slice(-9,-4)}-${n.slice(-4)}`; return t; }
function escHtml(s='')     { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
