/* ═══════════════════════════════════════
   ProspectIA — App Init
   ═══════════════════════════════════════ */

async function initApp() {
  // Verifica sessão
  if (!checkSession()) { window.location.href = 'index.html'; return; }

  const u = getUser();

  // Atualiza sidebar footer
  document.getElementById('sAvatar').textContent = (u.nome_cliente||'?').charAt(0).toUpperCase();
  document.getElementById('sUserName').textContent = u.nome_cliente || u.email;
  const chip = document.getElementById('sPlanChip');
  chip.textContent = (u.plano||'start').charAt(0).toUpperCase() + (u.plano||'start').slice(1);
  chip.className = `plan-chip ${u.plano||'start'}`;

  // Carrega carteira
  try {
    const rows = await sb.get('CARTEIRA', `usuario_id=eq.${u.id}&select=*`);
    window.S.carteira = rows?.[0] || null;
  } catch(e) { console.error('carteira', e); }

  updateFinPill();
  await checkWAStatus();

  // Conta não lidas
  loadUnread();

  // Mostra botão do chat de suporte
  const chatBtn = document.getElementById('supportChatBtn');
  if (chatBtn) chatBtn.style.display = 'flex';

  // Navega para página inicial (ou hash)
  const hash = window.location.hash.replace('#','');
  await nav(PAGES[hash] ? hash : 'dashboard');

  // ✅ FIX: inclui checkWAStatus no refresh
  setInterval(async () => { await refreshUser(); updateFinPill(); loadUnread(); checkWAStatus(); }, 30000);
}

/* ── Finance Pill ── */
function updateFinPill() {
  const u = getUser();
  const c = getCarteira();
  if (!u) return;

  const sms = u.bonus_sms_restante || 0;
  const voz = u.bonus_voz_restante || 0;
  const saldo = c?.saldo_reais || 0;

  const smsEl = document.getElementById('finSMS');
  const vozEl = document.getElementById('finVoz');
  const saldoEl = document.getElementById('finSaldo');

  smsEl.innerHTML = `SMS <strong>${sms}</strong>`;
  vozEl.innerHTML = `Voz <strong>${voz}</strong>`;
  saldoEl.innerHTML = `R$ <strong>${saldo.toFixed(2).replace('.',',')}</strong>`;

  smsEl.className = `fin-item${sms > 0 ? ' has-val' : ''}`;
  vozEl.className = `fin-item${voz > 0 ? ' has-val' : ''}`;
}

/* ── WA Status ── */
// ✅ FIX: usa evolution_url e evolution_key do próprio usuário
async function checkWAStatus() {
  const u = getUser();
  if (!u?.instancia_whatsapp || !u?.evolution_url) return;
  try {
    const r = await fetch(`${u.evolution_url}/instance/connectionState/${u.instancia_whatsapp}`, {
      headers: { apikey: u.evolution_key }
    });
    const data = await r.json();
    const connected = data?.instance?.state === 'open';
    const pill = document.getElementById('waPill');
    const lbl  = document.getElementById('waStatus');
    if (pill) pill.className = `wa-pill${connected ? ' on' : ''}`;
    if (lbl)  lbl.textContent = connected ? 'WhatsApp conectado' : 'Desconectado';
  } catch(e) { /* silencioso */ }
}

/* ── Refresh Carteira ── */
async function refreshCarteira() {
  const u = getUser();
  try {
    const rows = await sb.get('CARTEIRA', `usuario_id=eq.${u.id}&select=*`);
    window.S.carteira = rows?.[0] || null;
    updateFinPill();
  } catch(e) { console.error('refreshCarteira', e); }
}

/* ── Unread conversations ── */
async function loadUnread() {
  const u = getUser(); if (!u) return;
  try {
    const rows = await sb.get('CONVERSAS', `usuario_id=eq.${u.id}&lida=eq.false&origem=eq.cliente&select=id`);
    const count = rows?.length || 0;
    window.S.unread = count;
    const b = document.getElementById('badgeConversas');
    if (b) {
      if (count > 0) { b.textContent = count > 99 ? '99+' : count; b.style.display = ''; }
      else { b.style.display = 'none'; }
    }
  } catch(e){}
}

/* ── Plan limit helper ── */
function getPlanLimit(key) {
  const u = getUser();
  const plano = (u?.plano || 'start').toLowerCase();
  return CONFIG.PLAN_LIMITS[plano]?.[key] || CONFIG.PLAN_LIMITS.start[key];
}

function renderLimitBar(used, total, label) {
  const pct = total > 0 ? Math.min(100, Math.round(used / total * 100)) : 0;
  const cls = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : '';
  return `
    <div class="limit-bar-wrap">
      <div class="limit-bar"><div class="limit-fill ${cls}" style="width:${pct}%"></div></div>
      <div class="limit-meta ${cls}">
        <span>${label}: ${used.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}</span>
        <span class="lm-pct">${pct}%</span>
      </div>
    </div>`;
}

// Boot
document.addEventListener('DOMContentLoaded', initApp);

/* ── checkPlano — controle de acesso por plano ── */
function checkPlano(recurso) {
  const u = getUser();
  const plano = (u?.plano || 'start').toLowerCase();

  const BLOQUEIOS = {
    start: ['sdr', 'sms_lote', 'voz_lote', 'campanhas_disparo'],
  };

  const MENSAGENS = {
    sdr:              'O Agente SDR está disponível nos planos Pro e Business.',
    sms_lote:         'Disparo em lote de SMS está disponível nos planos Pro e Business.',
    voz_lote:         'Disparo em lote de Ligações está disponível nos planos Pro e Business.',
    campanhas_disparo:'Disparo em massa por campanha está disponível nos planos Pro e Business.',
  };

  const bloqueado = (BLOQUEIOS[plano] || []).includes(recurso);
  if (bloqueado) {
    showModalUpgrade(MENSAGENS[recurso] || 'Este recurso não está disponível no seu plano.');
    return false;
  }
  return true;
}

function showModalUpgrade(mensagem) {
  const u = getUser();
  const plano = (u?.plano || 'start').toLowerCase();
  const proximo = plano === 'start' ? 'Pro' : 'Business';
  const m = document.createElement('div');
  m.className = 'overlay open';
  m.innerHTML = `<div class="modal" style="max-width:400px">
    <div class="modal-head"><h3>Recurso bloqueado</h3><button class="modal-close" onclick="this.closest('.overlay').remove()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
    <div class="modal-body">
      <div style="text-align:center;padding:8px 0 16px">
        <div style="font-size:32px;margin-bottom:12px">🔒</div>
        <div class="fw-600 text-base" style="margin-bottom:8px">${mensagem}</div>
        <div class="text-sm tx-3">Você está no plano <strong>${plano.charAt(0).toUpperCase()+plano.slice(1)}</strong>. Faça upgrade para o plano <strong>${proximo}</strong> para desbloquear.</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="this.closest('.overlay').remove()">Fechar</button>
      <button class="btn btn-primary" onclick="this.closest('.overlay').remove();nav('planos')">Ver planos</button>
    </div>
  </div>`;
  document.body.appendChild(m);
}

/* ── Floating support button ── */
function initSupportBtn() {
  const paginaAtual = window.location.hash.replace('#','');
  if (paginaAtual === 'ajuda') return;
  if (document.getElementById('floatSupportBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'floatSupportBtn';
  btn.title = 'Precisa de ajuda?';
  btn.style.cssText = 'position:fixed;bottom:24px;right:24px;width:44px;height:44px;border-radius:50%;background:var(--blue-600);color:white;border:none;cursor:pointer;box-shadow:var(--shadow-lg);display:flex;align-items:center;justify-content:center;z-index:800;transition:transform .15s';
  btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  btn.onmouseenter = () => btn.style.transform = 'scale(1.1)';
  btn.onmouseleave = () => btn.style.transform = '';
  btn.onclick = () => nav('ajuda');
  document.body.appendChild(btn);
}