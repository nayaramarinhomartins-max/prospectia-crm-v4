let _pipeLeads = [];
let _dragPhone = null;
let _dragStatus = null;

const PIPE_COLS = [
  { k:'Lead',          label:'Lead',          color:'var(--tx-4)' },
  { k:'Contato Feito', label:'Contato Feito', color:'var(--blue-500)' },
  { k:'Interesse',     label:'Interesse',     color:'var(--yellow)' },
  { k:'Proposta',      label:'Proposta',      color:'var(--orange)' },
  { k:'Fechado',       label:'Fechado',       color:'var(--green)' },
];

// Mapeamento de status do n8n para CRM
function normStatus(s) {
  if (!s) return 'Lead';
  if (s === 'novo')     return 'Lead';
  if (s === 'abordado') return 'Contato Feito';
  return s;
}

async function init_pipeline() {
  const u = getUser();
  try {
    const rows = await sb.get('MARKETPLACE',
      `usuario_id=eq.${u.id}&select=telefone,empresa,pushname,score,status_crm,cidade,categoria,ultima_interacao&order=score.desc`
    );
    _pipeLeads = (rows||[]).map(l => ({ ...l, _normStatus: normStatus(l.status_crm) }));
    document.getElementById('pipeTotal').textContent = `${_pipeLeads.length} leads`;
    renderPipeline();
  } catch(e) { console.error(e); }
}

function renderPipeline() {
  const board = document.getElementById('pipelineBoard');
  board.innerHTML = PIPE_COLS.map(col => {
    const cards = _pipeLeads.filter(l => l._normStatus === col.k);
    return `<div class="pipe-col" data-col="${col.k}">
      <div class="pipe-col-head">
        <div class="flex items-center gap-8">
          <div style="width:8px;height:8px;border-radius:50%;background:${col.color};flex-shrink:0"></div>
          <span class="fw-700 text-sm">${col.label}</span>
        </div>
        <span class="badge b-gray" style="font-size:10px">${cards.length}</span>
      </div>
      <div class="pipe-col-body"
        ondragover="pipeDragOver(event,this)"
        ondragleave="pipeDragLeave(this)"
        ondrop="pipeDrop(event,'${col.k}')">
        ${cards.length === 0
          ? `<div style="padding:20px 0;text-align:center;font-size:11px;color:var(--tx-4)">Nenhum lead</div>`
          : cards.map(l => renderPipeCard(l)).join('')}
      </div>
    </div>`;
  }).join('');
}

function renderPipeCard(l) {
  const nome = l.empresa || l.pushname || formatPhone(l.telefone||'');
  const score = parseInt(l.score||0);
  // Score 0 = cinza neutro, não vermelho
  const sc = score === 0 ? 'var(--tx-4)' : score>=70?'var(--green)':score>=40?'var(--yellow)':'var(--red)';

  // Último contato
  let ultimoContato = '';
  if (l.ultima_interacao) {
    const dias = Math.floor((new Date() - new Date(l.ultima_interacao)) / 86400000);
    ultimoContato = dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `${dias}d atrás`;
  }

  return `<div class="pipe-card"
    draggable="true"
    ondragstart="pipeDragStart(event,'${l.telefone}','${l._normStatus}')"
    ondragend="pipeDragEnd(event)">
    <div class="fw-600 text-sm truncate" style="margin-bottom:3px">${escHtml(nome)}</div>
    ${l.cidade?`<div class="text-xs tx-4" style="margin-bottom:6px">${escHtml(l.cidade)}</div>`:''}
    <div class="flex justify-between items-center">
      <span style="font-size:11px;font-weight:700;color:${sc}">${score>0?`Score ${score}`:'Novo'}</span>
      ${ultimoContato?`<span style="font-size:10px;color:var(--tx-4)">${ultimoContato}</span>`:''}
    </div>
    <button style="width:100%;margin-top:8px;font-size:10px;color:var(--blue-600);background:var(--blue-50);border:none;border-radius:4px;padding:3px 0;cursor:pointer"
      onclick="event.stopPropagation();goToPipeChat('${l.telefone}')">Ver chat →</button>
  </div>`;
}

function pipeDragStart(e, phone, status) { _dragPhone=phone; _dragStatus=status; e.target.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; }
function pipeDragEnd(e) { e.target.classList.remove('dragging'); }
function pipeDragOver(e, col) { e.preventDefault(); e.dataTransfer.dropEffect='move'; col.classList.add('drag-over'); }
function pipeDragLeave(col) { col.classList.remove('drag-over'); }

async function pipeDrop(e, novoStatus) {
  e.preventDefault();
  document.querySelectorAll('.pipe-col-body').forEach(c => c.classList.remove('drag-over'));
  if (!_dragPhone || _dragStatus === novoStatus) return;
  const u = getUser();
  const lead = _pipeLeads.find(l => l.telefone === _dragPhone);
  if (!lead) return;

  const oldStatus = lead._normStatus;
  lead._normStatus = novoStatus;
  lead.status_crm  = novoStatus;
  renderPipeline();

  try {
    await sb.patch('MARKETPLACE', `usuario_id=eq.${u.id}&telefone=eq.${_dragPhone}`, { status_crm: novoStatus });
    showToast(`Lead movido para ${novoStatus}`, 'success', 2000);
  } catch(e) {
    lead._normStatus = oldStatus;
    lead.status_crm  = oldStatus;
    renderPipeline();
    showToast('Erro ao mover lead','error');
  }
  _dragPhone = null; _dragStatus = null;
}

function goToPipeChat(phone) { window._navPhone=phone; nav('conversas'); }
function formatPhone(t='') { const n=t.replace(/\D/g,''); if(n.length>=11)return`(${n.slice(-11,-9)}) ${n.slice(-9,-4)}-${n.slice(-4)}`; return t; }
function escHtml(s='')     { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
