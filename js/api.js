/* ═══════════════════════════════════════════════════════════════
   ProspectIA v4 — api.js
   Contém: CONFIG, Supabase (sb), callWebhook, helpers globais
   Funções: getUser, getCarteira, refreshUser, refreshCarteira,
            showToast, renderLimitBar, updateFinPill, checkPlano,
            showModalUpgrade, nav, startQRPolling, desconectarWA
   ═══════════════════════════════════════════════════════════════ */

// ── CONFIG ────────────────────────────────────────────────────
const CONFIG = {
  SB_URL: 'https://wyqnqiowxhamvxtzedth.supabase.co',
  SB_KEY: 'sb_publishable_gi8vIle37pdLK7Mta1gHPg_DlW947e1',
  BACKEND_URL: 'http://localhost:5000',

  // N8N — base e endpoints mapeados do fluxo
  N8N:            'https://painel.prospectia.space/webhook/',
  N8N_CADASTRO:   'https://painel.prospectia.space/webhook/cadastro-prospectia',
  N8N_PAGAMENTO:  'https://painel.prospectia.space/webhook/asaas-pagamento-prospectia',
  N8N_ASAAS:      'https://painel.prospectia.space/webhook/webhook-asaas-prospect-ia',
  N8N_RECARGA:    'https://painel.prospectia.space/webhook/solicitar-recarga-prospect',
  N8N_DISPARO:    'https://painel.prospectia.space/webhook/prospect-ia-disparo',
  N8N_CAMPANHA:   'https://painel.prospectia.space/webhook/campanha-disparo-massa',
  N8N_CNPJ:       'https://painel.prospectia.space/webhook/consulta-cnpj',
  N8N_WA_ENTRADA: 'https://painel.prospectia.space/webhook/evolution-whatsapp-in',

  // Evolution API (WhatsApp)
  EV_URL: 'http://168.119.154.223:8080',
  EV_KEY: 'MinhaChave123',

  // Limites por plano
  PLAN_LIMITS: {
    start:         { leads_mes: 100,  prosp_dia: 30,  bonus_sms: 0,   bonus_voz: 0   },
    pro:           { leads_mes: 800,  prosp_dia: 60,  bonus_sms: 50,  bonus_voz: 5   },
    business:      { leads_mes: 2000, prosp_dia: 120, bonus_sms: 200, bonus_voz: 30  },
    personalizado: { leads_mes: 9999, prosp_dia: 999, bonus_sms: 999, bonus_voz: 999 }
  }
};

// ── ESTADO GLOBAL ─────────────────────────────────────────────
window.S = window.S || { user: null, carteira: null, leads: [], unread: 0 };

// ── MAPA DE TABELAS — todas MAIÚSCULAS no Supabase ────────────
const TABLES = {
  USUARIOS:    'USUARIOS',
  MARKETPLACE: 'MARKETPLACE',
  CONVERSAS:   'CONVERSAS',
  CARTEIRA:    'CARTEIRA',
  LEADS:       'MARKETPLACE',  // alias
  CAMPANHAS:   'CAMPANHAS',
  MAPA_DDD:    'MAPA_DDD',
};

// ── SUPABASE REST ─────────────────────────────────────────────
const sb = {
  _headers() {
    return {
      'Content-Type':  'application/json',
      'apikey':        CONFIG.SB_KEY,
      'Authorization': 'Bearer ' + CONFIG.SB_KEY,
      'Prefer':        'return=representation'
    };
  },

  _url(table, query) {
    const t = TABLES[table] || TABLES[table?.toUpperCase()] || table;
    return `${CONFIG.SB_URL}/rest/v1/${t}${query ? '?' + query : ''}`;
  },

  async get(table, query) {
    const r = await fetch(sb._url(table, query), { headers: sb._headers() });
    if (!r.ok) throw new Error(`GET ${table} ${r.status}: ${await r.text()}`);
    return r.json();
  },

  async post(table, data) {
    const r = await fetch(sb._url(table), {
      method:  'POST',
      headers: sb._headers(),
      body:    JSON.stringify(data)
    });
    if (!r.ok) throw new Error(`POST ${table} ${r.status}: ${await r.text()}`);
    return r.json();
  },

  async patch(table, query, data) {
    const r = await fetch(sb._url(table, query), {
      method:  'PATCH',
      headers: sb._headers(),
      body:    JSON.stringify(data)
    });
    if (!r.ok) throw new Error(`PATCH ${table} ${r.status}: ${await r.text()}`);
    return r.json();
  },

  async delete(table, query) {
    const r = await fetch(sb._url(table, query), {
      method:  'DELETE',
      headers: { ...sb._headers(), Prefer: 'return=minimal' }
    });
    if (!r.ok) throw new Error(`DELETE ${table} ${r.status}: ${await r.text()}`);
    return true;
  }
};

// ── WEBHOOK N8N ───────────────────────────────────────────────
async function callWebhook(endpoint, payload) {
  const url = endpoint.startsWith('http')
    ? endpoint
    : CONFIG.N8N + endpoint;

  const r = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });

  const text = await r.text();
  try { return text ? JSON.parse(text) : { ok: true }; }
  catch { return { ok: r.ok, raw: text }; }
}

// ── GETTERS DO ESTADO ─────────────────────────────────────────
function getUser()     { return window.S?.user     || null; }
function getCarteira() { return window.S?.carteira || null; }

// ── REFRESH USER ──────────────────────────────────────────────
async function refreshUser() {
  const u = getUser();
  if (!u?.id) return;
  try {
    const rows = await sb.get('USUARIOS', `id=eq.${u.id}&select=*&limit=1`);
    if (rows?.[0]) {
      window.S.user = rows[0];
      try { sessionStorage.setItem('pia_u', JSON.stringify(rows[0])); } catch {}
    }
  } catch(e) { console.error('refreshUser', e); }
}

// ── REFRESH CARTEIRA ──────────────────────────────────────────
async function refreshCarteira() {
  const u = getUser();
  if (!u?.id) return;
  try {
    const rows = await sb.get('CARTEIRA', `usuario_id=eq.${u.id}&select=*&limit=1`);
    if (rows?.[0]) {
      window.S.carteira = rows[0];
      updateFinPill();
    }
  } catch(e) { console.error('refreshCarteira', e); }
}

// ── CHECK SESSION ─────────────────────────────────────────────
function checkSession() {
  const stored = sessionStorage.getItem('pia_u');
  if (stored) {
    try {
      const u = JSON.parse(stored);
      if (!window.S.user) window.S.user = u;
      return true;
    } catch {}
  }
  return !!window.S.user;
}

// ── LOAD UNREAD ───────────────────────────────────────────────
async function loadUnread() {
  const u = getUser();
  if (!u?.id) return;
  try {
    const rows = await sb.get('CONVERSAS',
      `usuario_id=eq.${u.id}&lida=eq.false&origem=eq.cliente&select=id`
    );
    const count = (rows || []).length;
    window.S.unread = count;
    const badge = document.getElementById('badgeConversas');
    if (badge) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? '' : 'none';
    }
  } catch(e) { console.error('loadUnread', e); }
}

// ── UPDATE FIN PILL ───────────────────────────────────────────
function updateFinPill() {
  const c = getCarteira();
  const u = getUser();
  const saldo = c?.saldo_reais        || 0;
  const sms   = u?.bonus_sms_restante || 0;
  const voz   = u?.bonus_voz_restante || 0;

  const pill    = document.getElementById('finPill');
  const smsEl   = document.getElementById('finSMS');
  const vozEl   = document.getElementById('finVoz');
  const saldoEl = document.getElementById('finSaldo');

  if (pill)    pill.textContent = `R$ ${saldo.toFixed(2).replace('.', ',')}`;
  if (saldoEl) saldoEl.innerHTML = `R$ <strong>${saldo.toFixed(2).replace('.', ',')}</strong>`;
  if (smsEl)   { smsEl.innerHTML = `SMS <strong>${sms}</strong>`; smsEl.className = `fin-item${sms > 0 ? ' has-val' : ''}`; }
  if (vozEl)   { vozEl.innerHTML = `Voz <strong>${voz}</strong>`; vozEl.className = `fin-item${voz > 0 ? ' has-val' : ''}`; }
}

// ── RENDER LIMIT BAR ──────────────────────────────────────────
function renderLimitBar(usado, limite, label) {
  const pct   = limite > 0 ? Math.min(Math.round(usado / limite * 100), 100) : 0;
  const color = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--yellow)' : 'var(--green)';
  return `
    <div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:12px;color:var(--tx-3)">${label}</span>
        <span style="font-size:12px;font-weight:600;color:${color}">${usado.toLocaleString('pt-BR')} / ${limite.toLocaleString('pt-BR')}</span>
      </div>
      <div class="limit-bar" style="height:5px;background:var(--border);border-radius:99px;overflow:hidden">
        <div class="limit-fill" style="height:100%;width:${pct}%;background:${color};border-radius:99px;transition:width .4s"></div>
      </div>
    </div>`;
}

// ── GET PLAN LIMIT ────────────────────────────────────────────
function getPlanLimit(key) {
  const u = getUser();
  const plano = (u?.plano || 'start').toLowerCase();
  return CONFIG.PLAN_LIMITS[plano]?.[key] || CONFIG.PLAN_LIMITS.start[key];
}

// ── CHECK PLANO ───────────────────────────────────────────────
const MENSAGENS = {
  sdr:      'O Agente SDR está disponível nos planos Pro e Business.',
  sms_lote: 'O disparo em lote de SMS está disponível nos planos Pro e Business.',
  voz_lote: 'O disparo em lote de Ligações está disponível nos planos Pro e Business.',
  campanhas:'Campanhas avançadas estão disponíveis nos planos Pro e Business.'
};

function checkPlano(recurso) {
  const u = getUser();
  const plano = (u?.plano || 'start').toLowerCase();
  if (plano === 'start') {
    showModalUpgrade(MENSAGENS[recurso] || 'Este recurso não está disponível no seu plano.');
    return false;
  }
  return true;
}

function showModalUpgrade(msg) {
  document.querySelectorAll('.upgrade-modal-overlay').forEach(el => el.remove());
  const overlay = document.createElement('div');
  overlay.className = 'upgrade-modal-overlay overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-head">
        <h3>Upgrade necessário</h3>
        <button class="modal-close" onclick="this.closest('.upgrade-modal-overlay').remove()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="alert alert-info" style="margin-bottom:16px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>${msg}</span>
        </div>
        <p style="font-size:13px;color:var(--tx-3)">Faça upgrade para desbloquear este e outros recursos avançados.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="this.closest('.upgrade-modal-overlay').remove()">Fechar</button>
        <button class="btn btn-primary" onclick="this.closest('.upgrade-modal-overlay').remove();nav('planos')">Ver planos</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3500) {
  document.querySelectorAll('.toast-msg').forEach(el => el.remove());
  const colors = { success:'#10B981', error:'#EF4444', warning:'#F59E0B', info:'#3B82F6' };
  const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
  const toast  = document.createElement('div');
  toast.className = 'toast-msg';
  toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(10px);
    background:${colors[type]||colors.info};color:white;
    padding:10px 18px;border-radius:10px;font-size:13px;font-weight:500;
    box-shadow:0 4px 20px rgba(0,0,0,.2);z-index:9999;
    display:flex;align-items:center;gap:8px;
    opacity:0;transition:opacity .2s,transform .2s;max-width:420px;text-align:center`;
  toast.innerHTML = `<span style="font-size:15px">${icons[type]||icons.info}</span><span>${msg}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// ── SALVAR PERFIL ─────────────────────────────────────────────
async function salvarPerfil() {
  const u = getUser();
  if (!u?.id) return;
  const nome       = (document.getElementById('cfgNome')?.value     || '').trim();
  const senhaNova  =  document.getElementById('cfgSenhaNova')?.value || '';
  const senhaConf  =  document.getElementById('cfgSenhaConf')?.value || '';
  if (senhaNova && senhaNova !== senhaConf) { showToast('As senhas não conferem', 'warning'); return; }
  try {
    const payload = {};
    if (nome)      payload.nome_cliente = nome;
    if (senhaNova) payload.senha = senhaNova;
    if (Object.keys(payload).length) {
      await sb.patch('USUARIOS', `id=eq.${u.id}`, payload);
      await refreshUser();
      showToast('Dados atualizados!', 'success');
    } else {
      showToast('Nenhuma alteração detectada', 'info');
    }
  } catch(e) {
    showToast('Erro ao salvar: ' + e.message, 'error');
    console.error('salvarPerfil', e);
  }
}

// ── NAV FALLBACK ──────────────────────────────────────────────
if (typeof nav === 'undefined') {
  window.nav = function(page) {
    console.warn('nav() não definida — fallback para:', page);
    if (typeof window.navigateTo === 'function') window.navigateTo(page);
  };
}

// ── QR CODE POLLING ───────────────────────────────────────────
let _qrPollTimer = null;

function startQRPolling() {
  if (_qrPollTimer) clearInterval(_qrPollTimer);
  let tentativas = 0;
  _qrPollTimer = setInterval(async () => {
    tentativas++;
    if (tentativas > 30) { clearInterval(_qrPollTimer); return; }
    try {
      const u = getUser();
      if (!u?.evolution_url || !u?.instancia_whatsapp) return;
      const r = await fetch(
        `${u.evolution_url}/instance/connectionState/${u.instancia_whatsapp}`,
        { headers: { apikey: u.evolution_key || CONFIG.EV_KEY } }
      );
      const d = await r.json();
      if (d?.instance?.state === 'open') {
        clearInterval(_qrPollTimer);
        const qrCard = document.getElementById('qrCard');
        if (qrCard) qrCard.style.display = 'none';
        if (typeof checkWABadge === 'function') checkWABadge();
        showToast('WhatsApp conectado com sucesso!', 'success', 4000);
      }
    } catch(e) { /* silencioso */ }
  }, 5000);
}

// ── DESCONECTAR WA ────────────────────────────────────────────
async function desconectarWA() {
  const u = getUser();
  if (!u?.evolution_url || !u?.instancia_whatsapp) { showToast('Nenhuma instância configurada', 'warning'); return; }
  if (!confirm('Desconectar o WhatsApp? Você precisará escanear o QR novamente.')) return;
  try {
    await fetch(`${u.evolution_url}/instance/logout/${u.instancia_whatsapp}`, {
      method: 'DELETE', headers: { apikey: u.evolution_key || CONFIG.EV_KEY }
    });
    showToast('WhatsApp desconectado', 'info', 3000);
    if (typeof checkWABadge === 'function') checkWABadge();
  } catch(e) {
    showToast('Erro ao desconectar', 'error');
    console.error('desconectarWA', e);
  }
}

console.log('[ProspectIA] api.js v4 carregado ✓');