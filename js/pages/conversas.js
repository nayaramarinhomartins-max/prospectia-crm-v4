let _allConvs    = [];
let _activePhone = null;
let _allLeads    = {};
let _modeFilter  = 'todos';
let _pollInterval = null;
let _botPatterns = ['atendimento automatizado','bot','aguarde','chatbot','assistente virtual','resposta automática'];

async function init_conversas() {
  clearInterval(_pollInterval);
  await loadAllLeads();
  await loadConversas();
  if (window._navPhone) { openChat(window._navPhone); window._navPhone = null; }
  _pollInterval = setInterval(loadConversas, 15000);
}

async function loadAllLeads() {
  const u = getUser();
  try {
    const rows = await sb.get('MARKETPLACE',
      `usuario_id=eq.${u.id}&select=telefone,empresa,pushname,cidade,score,status_crm,modo_atendimento,anotacoes,bot_detectado,canal_resposta,motivo_perda`
    );
    _allLeads = {};
    (rows||[]).forEach(l => { _allLeads[cleanPhone(l.telefone)] = l; });
  } catch(e){ console.error('leads', e); }
}

async function loadConversas() {
  const u = getUser();
  try {
    // ✅ FIX: limit reduzido de 2000 para 300 para evitar travamento
    const msgs = await sb.get('CONVERSAS',
      `usuario_id=eq.${u.id}&select=id,telefone,mensagem,origem,created_at,lida,nome_contato&order=created_at.asc&limit=300`
    );
    const map = {};
    (msgs||[]).forEach(m => {
      if (!m.telefone) return;
      const key = cleanPhone(m.telefone);
      if (!map[key]) map[key] = { telefone: key, msgs: [], unread: 0 };
      map[key].msgs.push(m);
      if (!m.lida && m.origem === 'cliente') map[key].unread++;
    });
    _allConvs = Object.values(map).map(c => {
      const lead = _allLeads[c.telefone] || {};
      const nome = resolveNome(lead, c.msgs[c.msgs.length-1]);
      const lastMsg = c.msgs[c.msgs.length-1];
      return { ...c, nome, lastMsg, score: parseInt(lead.score)||0, status: lead.status_crm||'Lead', modo: lead.modo_atendimento||'ia', botDetectado: lead.bot_detectado||false };
    }).sort((a,b) => new Date(b.lastMsg?.created_at||0) - new Date(a.lastMsg?.created_at||0));

    renderConvList();
    _allConvs.forEach(c => checkBotLoop(c));

    // ✅ FIX: atualiza badge de não lidas no menu lateral
    const totalUnread = _allConvs.reduce((acc, c) => acc + (c.unread || 0), 0);
    const badge = document.getElementById('badgeConversas');
    if (badge) {
      if (totalUnread > 0) {
        badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }

    if (_activePhone) {
      renderMessages(_activePhone);
      const anotEl = document.getElementById('anotacaoTxt');
      if (anotEl && document.activeElement !== anotEl) {
        const lead = _allLeads[_activePhone];
        anotEl.value = lead?.anotacoes || '';
      }
    }
  } catch(e){ console.error('conversas', e); }
}

function resolveNome(lead, lastMsg) {
  const candidates = [lead?.empresa, lead?.pushname, lastMsg?.nome_contato];
  for (const c of candidates) {
    if (c && c.length > 1 && !c.includes('$') && !c.includes('{{')) return c;
  }
  return formatPhone(lastMsg?.telefone || '');
}

// ── BOT LOOP DETECTION ──
async function checkBotLoop(conv) {
  if (conv.botDetectado) return;
  const msgs = conv.msgs || [];
  if (msgs.length < 3) return;

  const recent = msgs.slice(-5).filter(m => m.origem === 'cliente');
  if (recent.length < 2) return;

  const temPalavraBot = recent.some(m =>
    _botPatterns.some(p => (m.mensagem||'').toLowerCase().includes(p))
  );

  let respostasRapidas = 0;
  for (let i=1; i<recent.length; i++) {
    const diff = (new Date(recent[i].created_at) - new Date(recent[i-1].created_at)) / 1000;
    if (diff < 5) respostasRapidas++;
  }

  const textos = recent.map(m => m.mensagem?.trim().toLowerCase());
  const haDuplicata = new Set(textos).size < textos.length;

  if (temPalavraBot || respostasRapidas >= 2 || haDuplicata) {
    await handleBotDetectado(conv.telefone);
  }
}

async function handleBotDetectado(telefone) {
  const u = getUser();
  try {
    await sb.patch('MARKETPLACE', `usuario_id=eq.${u.id}&telefone=eq.${telefone}`, {
      modo_atendimento: 'humano', bot_detectado: true
    });
    const msgEncerramento = 'Obrigado pelo contato! Um atendente humano irá continuar essa conversa em breve. 😊';
    if (u.instancia_whatsapp && u.evolution_url) {
      await fetch(`${u.evolution_url}/message/sendText/${u.instancia_whatsapp}`, {
        method: 'POST',
        headers: { apikey: u.evolution_key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: telefone, text: msgEncerramento })
      }).catch(()=>{});
    }
    await sb.post('CONVERSAS', {
      usuario_id: u.id, telefone, mensagem: msgEncerramento,
      origem: 'sistema', lida: true
    });
    const lead = _allLeads[telefone];
    if (lead) { lead.modo_atendimento = 'humano'; lead.bot_detectado = true; }
    const conv = _allConvs.find(c => c.telefone === telefone);
    if (conv) { conv.modo = 'humano'; conv.botDetectado = true; }
    showToast(`Bot detectado em ${telefone.slice(-4)} — IA desligada`, 'warning', 5000);
  } catch(e){ console.error('bot-detect', e); }
}

// ── RENDER LIST ──
function renderConvList() {
  const el = document.getElementById('convList');
  if (!el) return;
  const search = document.getElementById('convSearch')?.value?.toLowerCase() || '';

  let list = _allConvs.filter(c => {
    if (search && !c.nome.toLowerCase().includes(search) && !c.telefone.includes(search)) return false;
    if (_modeFilter === 'nao_lidas' && c.unread === 0) return false;
    if (_modeFilter === 'humano' && c.modo !== 'humano') return false;
    return true;
  });

  if (!list.length) {
    el.innerHTML = `<div class="empty" style="padding:32px 16px"><p>Nenhuma conversa encontrada</p></div>`;
    return;
  }

  el.innerHTML = list.map(c => {
    const isActive = c.telefone === _activePhone;
    const lastTxt = truncate(c.lastMsg?.mensagem || '', 42);
    const isBot = ['ia','bot'].includes(c.lastMsg?.origem);
    const canalUltima = c.lastMsg?.canal || 'whatsapp';
    const temSMS = c.msgs?.some(m => m.canal === 'sms');
    const temVoz = c.msgs?.some(m => m.canal === 'voz');
    const scoreColor = c.score>=70?'var(--green)':c.score>=40?'var(--yellow)':'var(--tx-4)';

    const canalBadge = temSMS
      ? `<span style="font-size:9px;font-weight:700;color:var(--tx-4);background:var(--surface-3);border:1px solid var(--border);padding:1px 5px;border-radius:4px;flex-shrink:0">SMS</span>`
      : temVoz
      ? `<span style="font-size:9px;font-weight:700;color:var(--tx-4);background:var(--surface-3);border:1px solid var(--border);padding:1px 5px;border-radius:4px;flex-shrink:0">VOZ</span>`
      : '';

    return `<div style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);background:${isActive?'var(--blue-50)':'transparent'};transition:background .12s;"
      onclick="openChat('${c.telefone}')"
      onmouseenter="if('${c.telefone}'!=='${_activePhone}')this.style.background='var(--surface-2)'"
      onmouseleave="if('${c.telefone}'!=='${_activePhone}')this.style.background=''">
      <div class="flex items-center gap-10">
        <div style="position:relative">
          <div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,var(--blue-600),var(--blue-800));color:white;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0">${escHtml(c.nome.charAt(0).toUpperCase())}</div>
          ${c.unread>0?`<div style="position:absolute;top:-4px;right:-4px;width:17px;height:17px;background:var(--red);border-radius:50%;font-size:9px;font-weight:700;color:white;display:flex;align-items:center;justify-content:center">${c.unread}</div>`:''}
          ${c.botDetectado?`<div title="Bot detectado" style="position:absolute;bottom:-3px;right:-3px;width:13px;height:13px;background:var(--orange);border-radius:50%;border:2px solid var(--surface)"></div>`:''}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-center">
            <span style="font-size:13px;font-weight:${c.unread>0?'700':'600'};color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px">${escHtml(c.nome)}</span>
            <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">${canalBadge}<span style="font-size:10px;color:var(--tx-4)">${formatTime(c.lastMsg?.created_at)}</span></div>
          </div>
          <div class="flex justify-between items-center" style="margin-top:2px">
            <span style="font-size:11px;color:var(--tx-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px">${isBot?'<span style="color:var(--blue-500)">IA:</span> ':''}${escHtml(lastTxt)}</span>
            <div style="width:7px;height:7px;border-radius:50%;background:${scoreColor};flex-shrink:0"></div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── OPEN CHAT ──
async function openChat(telefone) {
  _activePhone = telefone;
  renderConvList();

  const conv  = _allConvs.find(c => c.telefone === telefone);
  const lead  = _allLeads[telefone] || {};
  const score = conv?.score || 0;
  const scoreColor = score>=70?'var(--green)':score>=40?'var(--yellow)':'var(--red)';

  document.getElementById('chatHeader').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
      <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,var(--blue-600),var(--blue-800));color:white;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0">${escHtml((conv?.nome||'?').charAt(0).toUpperCase())}</div>
      <div class="flex-1 min-w-0">
        <div style="font-size:14px;font-weight:700;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(conv?.nome||telefone)}</div>
        <div style="font-size:11px;color:var(--tx-3)">${formatPhone(telefone)}${lead.cidade?' · '+lead.cidade:''}${lead.categoria?' · '+lead.categoria:''}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
      ${conv?.botDetectado?`<span class="badge b-orange" style="font-size:10px">Bot detectado</span>`:''}
      <div style="text-align:right">
        <div style="font-size:13px;font-weight:800;color:${scoreColor}">Score ${score}</div>
        <div><span class="badge b-gray" style="font-size:10px">${escHtml(conv?.status||'Lead')}</span></div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="nav('leads')" title="Ver lead" style="padding:4px 8px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </button>
    </div>`;

  document.getElementById('chatInputArea').style.display = 'flex';

  const statusEl = document.getElementById('painelStatus');
  if (statusEl) { statusEl.value = lead.status_crm || 'novo'; onPainelStatusChange(statusEl.value); }
  const motivoEl = document.getElementById('painelMotivo');
  if (motivoEl) motivoEl.value = lead.motivo_perda || '';
  document.querySelectorAll('.canal-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.canal === (lead.canal_resposta || null));
  });
  const anotEl = document.getElementById('anotacaoTxt');
  if (anotEl) anotEl.value = lead.anotacoes || '';

  const modoToggle = document.getElementById('modoToggle');
  if (modoToggle) modoToggle.checked = conv?.modo === 'ia';

  try { await sb.patch('CONVERSAS', `usuario_id=eq.${getUser().id}&telefone=eq.${telefone}&lida=eq.false`, { lida: true }); } catch(e){}

  renderMessages(telefone);
}

// ── RENDER MESSAGES ──
function renderMessages(telefone) {
  const conv = _allConvs.find(c => c.telefone === telefone);
  const el   = document.getElementById('chatMessages');
  if (!conv?.msgs?.length) {
    el.innerHTML = `<div class="empty" style="padding:60px 20px"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>Nenhuma mensagem ainda</p></div>`;
    return;
  }

  let lastDate = '';
  el.innerHTML = conv.msgs.map(m => {
    const isMe    = m.origem !== 'cliente';
    const isIA    = m.origem === 'ia';
    const isSMS   = m.canal === 'sms';
    const isVoz   = m.canal === 'voz';
    const isSistema = m.origem === 'sistema';

    const tipoMsg = m.tipo_mensagem || 'text';
    const isAudio = tipoMsg === 'audio' || (m.mensagem||'').startsWith('[🎤');
    const isImg   = tipoMsg === 'image'  || (m.mensagem||'').startsWith('[📷');

    const bg     = isMe ? 'linear-gradient(135deg,var(--blue-600),var(--blue-700))' : 'var(--surface-2)';
    const color  = isMe ? 'white' : 'var(--tx)';
    const align  = isMe ? 'flex-end' : 'flex-start';
    const radius = isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px';

    const d = new Date(m.created_at);
    const dateStr = d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
    let dateSep = '';
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      dateSep = `<div style="text-align:center;margin:12px 0"><span style="font-size:11px;color:var(--tx-4);background:var(--surface-3);padding:3px 10px;border-radius:20px">${dateStr}</span></div>`;
    }

    const labelIA      = isIA      ? `<div style="font-size:10px;color:rgba(255,255,255,.6);margin-bottom:3px;font-weight:600">IA</div>` : '';
    const labelSMS     = isSMS     ? `<div style="font-size:10px;color:rgba(255,255,255,.6);margin-bottom:3px;font-weight:600">SMS</div>` : '';
    const labelVoz     = isVoz     ? `<div style="font-size:10px;color:rgba(255,255,255,.6);margin-bottom:3px;font-weight:600">VOZ</div>` : '';
    const labelSistema = isSistema ? `<div style="font-size:10px;color:rgba(255,255,255,.6);margin-bottom:3px;font-weight:600">SISTEMA</div>` : '';

    let content = '';
    if (isImg && m.mensagem?.startsWith('data:image')) {
      content = `<img src="${m.mensagem}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;cursor:pointer;display:block" onclick="openImgModal('${m.mensagem}')">`;
    } else if (isAudio) {
      content = `<span style="display:inline-flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>${escHtml(m.mensagem||'')}</span>`;
    } else {
      content = escHtml(m.mensagem||'');
    }

    return `${dateSep}<div style="display:flex;justify-content:${align};margin-bottom:4px">
      <div style="max-width:72%;background:${bg};color:${color};padding:8px 12px;border-radius:${radius};font-size:13px;line-height:1.55">
        ${labelIA}${labelSMS}${labelVoz}${labelSistema}${content}
        <div style="font-size:10px;opacity:.5;margin-top:4px;text-align:right">${formatTime(m.created_at)}</div>
      </div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

// ── SEND ──
async function sendMsg() {
  const u = getUser();
  if (!_activePhone) return;
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  if (!u?.instancia_whatsapp) { showToast('Configure o WhatsApp nas configurações','warning'); return; }

  input.value = ''; input.style.height='36px';
  try {
    await fetch(`${u.evolution_url}/message/sendText/${u.instancia_whatsapp}`, {
      method:'POST', headers:{ apikey:u.evolution_key,'Content-Type':'application/json' },
      body: JSON.stringify({ number: _activePhone, text: msg })
    });
    await sb.post('CONVERSAS',{ usuario_id:u.id, telefone:_activePhone, mensagem:msg, origem:'humano', lida:true });
    await loadConversas();
    showToast('Enviado','success',1500);
  } catch(e){ showToast('Erro ao enviar','error'); console.error(e); }
}

async function sendSMS() {
  const u = getUser(); const c = getCarteira();
  if (!_activePhone) return;
  if (!checkPlano('sms')) return;
  const sms = u.bonus_sms_restante||0, saldo = c?.saldo_reais||0;
  if (sms===0 && saldo<=0){ showToast('Sem saldo para SMS. Recarregue na Carteira.','warning'); nav('carteira'); return; }
  const msg = document.getElementById('chatInput').value.trim();
  if (!msg){ showToast('Escreva a mensagem antes de enviar','warning'); return; }
  const custo = c?.valor_venda_sms||0.25;
  if (!confirm(`Enviar SMS para ${_activePhone}?\nCusto: R$ ${custo.toFixed(2)} ${sms>0?'(bônus)':'(saldo)'}`)) return;
  try {
    await callWebhook('prospect-ia-disparo',{ tipo:'sms', telefone:_activePhone, mensagem:msg, usuario_id:u.id });
    if (sms>0){ await sb.patch('USUARIOS',`id=eq.${u.id}`,{bonus_sms_restante:sms-1}); window.S.user.bonus_sms_restante=sms-1; }
    await sb.post('CONVERSAS',{ usuario_id:u.id, telefone:_activePhone, mensagem:msg, origem:'sms', lida:true });
    document.getElementById('chatInput').value='';
    updateFinPill(); await loadConversas();
    showToast('SMS enviado!','success');
  } catch(e){ showToast('Erro ao enviar SMS','error'); }
}

async function sendVoz() {
  const u = getUser(); const c = getCarteira();
  if (!_activePhone) return;
  if (!checkPlano('voz')) return;
  const voz = u.bonus_voz_restante||0, saldo = c?.saldo_reais||0;
  if (voz===0&&saldo<=0){ showToast('Sem saldo para ligações.','warning'); nav('carteira'); return; }
  const custo = ((c?.valor_venda_minuto||0.5)*Math.ceil((c?.limite_segundos_ligacao||60)/60)).toFixed(2);
  if (!confirm(`Iniciar ligação para ${_activePhone}?\nCusto: R$ ${custo} ${voz>0?'(bônus)':'(saldo)'}`)) return;
  try {
    await callWebhook('prospect-ia-disparo',{ tipo:'voz', telefone:_activePhone, usuario_id:u.id });
    if (voz>0){ await sb.patch('USUARIOS',`id=eq.${u.id}`,{bonus_voz_restante:voz-1}); window.S.user.bonus_voz_restante=voz-1; }
    await sb.post('CONVERSAS',{ usuario_id:u.id, telefone:_activePhone, mensagem:'[Ligação iniciada]', origem:'voz', lida:true });
    updateFinPill(); await loadConversas();
    showToast('Ligação iniciada!','success');
  } catch(e){ showToast('Erro ao iniciar ligação','error'); }
}

async function salvarAnotacao() {
  if (!_activePhone) return;
  const u = getUser();
  const phone = cleanPhone(_activePhone);

  const nota    = document.getElementById('anotacaoTxt')?.value.trim() || '';
  const status  = document.getElementById('painelStatus')?.value || 'novo';
  const motivo  = document.getElementById('painelMotivo')?.value || null;
  const canal   = document.querySelector('.canal-btn.active')?.dataset.canal || null;

  const payload = { anotacoes: nota, status_crm: status };
  if (canal)  payload.canal_resposta = canal;
  if (motivo) payload.motivo_perda   = motivo;

  try {
    await sb.patch('MARKETPLACE', `usuario_id=eq.${u.id}&telefone=eq.${phone}`, payload);
    const lead = _allLeads[phone];
    if (lead) Object.assign(lead, payload);
    const conv = _allConvs.find(c => c.telefone === phone);
    if (conv) conv.status = status;

    const btn = document.getElementById('btnSalvarNota');
    if (btn) {
      btn.textContent = 'Salvo ✓';
      btn.style.background = 'var(--green)';
      setTimeout(() => { btn.textContent = 'Salvar'; btn.style.background = ''; }, 2000);
    }
  } catch(e) { showToast('Erro ao salvar', 'error'); }
}

async function toggleModo(isIA) {
  if (!_activePhone) return;
  const u = getUser();
  try {
    await sb.patch('MARKETPLACE',`usuario_id=eq.${u.id}&telefone=eq.${_activePhone}`,{ modo_atendimento: isIA?'ia':'humano' });
    const conv = _allConvs.find(c => c.telefone===_activePhone);
    if (conv) conv.modo = isIA?'ia':'humano';
    const lead = _allLeads[_activePhone];
    if (lead) lead.modo_atendimento = isIA?'ia':'humano';
    showToast(isIA?'IA ativada':'Modo humano ativado','info',2000);
  } catch(e){ console.error(e); }
}

function updateCanalBtns() {
  const u = getUser(); const c = getCarteira();
  const sms = u?.bonus_sms_restante||0, voz = u?.bonus_voz_restante||0, saldo = c?.saldo_reais||0;
  const t1 = document.getElementById('btnSMSTxt'), t2 = document.getElementById('btnVozTxt');
  if (!t1) return;
  t1.textContent = sms>0?`SMS (${sms} bônus)`:saldo>0?'SMS (saldo)':'SMS ⚠';
  t2.textContent = voz>0?`Ligação (${voz} bônus)`:saldo>0?'Ligação (saldo)':'Ligação ⚠';
}

function openImgModal(src) {
  const m = document.createElement('div');
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  m.innerHTML=`<img src="${src}" style="max-width:90vw;max-height:90vh;border-radius:8px">`;
  m.onclick=()=>document.body.removeChild(m);
  document.body.appendChild(m);
}

function onPainelStatusChange(valor) {
  const wrap = document.getElementById('painelMotivoWrap');
  if (wrap) wrap.style.display = valor === 'Perdido' ? '' : 'none';
}

function selecionarCanal(btn) {
  document.querySelectorAll('.canal-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function filterConversas() { renderConvList(); }
function filterMode(mode, el) {
  _modeFilter = mode;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderConvList();
}
function handleChatKey(e) { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendMsg(); } }
function autoResize(el){ el.style.height='36px'; el.style.height=Math.min(el.scrollHeight,100)+'px'; }
function cleanPhone(t='')  { return (t||'').replace(/\D/g,''); }
function formatPhone(t='') { const n=cleanPhone(t); if(n.length>=11)return`(${n.slice(-11,-9)}) ${n.slice(-9,-4)}-${n.slice(-4)}`; return t; }
function formatTime(iso)   { if(!iso)return''; const d=new Date(iso),now=new Date(),diff=(now-d)/60000; if(isNaN(diff))return''; if(diff<1)return'agora'; if(diff<60)return`${Math.floor(diff)}min`; if(diff<1440)return`${Math.floor(diff/60)}h`; return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}); }
function truncate(s,n)     { return s.length>n?s.substring(0,n)+'…':s; }
function escHtml(s='')     { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }