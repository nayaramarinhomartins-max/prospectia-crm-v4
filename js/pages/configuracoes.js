const ICON_DISCONNECTED = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.1"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>`;
const ICON_CONNECTED = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
const ICON_RESTRICTED = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

const PLANOS_COM_SDR = ['pro', 'business'];

let _qrPollingInterval = null;
let _qrPollingIntervalSDR = null;

async function init_configuracoes() {
  const u = getUser();
  if (!u) return;

  const setV = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
  const setT = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val || '0'; };

  setT('userId', u.id);
  setV('cfgNome', u.nome_cliente);
  setV('cfgEmail', u.email);
  setT('userLimiteLeads', u.limite_leads_mensal);
  setT('userLimiteProspecao', u.limite_prospecao);

  const cpfEl = document.getElementById('cfgCpf');
  if (cpfEl) {
    if (u.cpf) cpfEl.value = formatarCpf(u.cpf);
    else cpfEl.placeholder = 'Não informado';
  }

  setV('cfgEvUrl', u.evolution_url);
  setV('cfgInstancia', u.instancia_whatsapp);
  setV('cfgEvKey', u.evolution_key);

  await checkWAStatus('prospeccao');

  const planoAtual = (u.plano || 'start').toLowerCase();
  const temSDR = PLANOS_COM_SDR.includes(planoAtual);

  const sdrCard  = document.getElementById('sdrCard');
  const sdrLock  = document.getElementById('sdrLock');
  const sdrBadge = document.getElementById('waStatusBadgeSDR');

  if (temSDR) {
    if (sdrCard)  sdrCard.style.display  = 'block';
    if (sdrLock)  sdrLock.style.display  = 'none';
    if (sdrBadge) sdrBadge.style.display = 'inline-flex';
    await checkWAStatus('sdr');
  } else {
    if (sdrCard)  sdrCard.style.display  = 'none';
    if (sdrLock)  sdrLock.style.display  = 'block';
    if (sdrBadge) sdrBadge.style.display = 'none';
  }
}

function formatarCpf(cpf) {
  const s = (cpf || '').replace(/\D/g, '');
  if (s.length !== 11) return cpf;
  return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function navegarParaPlanos() {
  const menuItem = document.querySelector('[data-page="planos"], [href*="planos"], [onclick*="planos"]');
  if (menuItem) { menuItem.click(); return; }
  window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'planos' } }));
}

async function checkWAStatus(tipo) {
  const u = getUser();
  const isSDR = tipo === 'sdr';

  const instancia = isSDR ? u.instancia_sdr : u.instancia_whatsapp;
  const badgeId   = isSDR ? 'waStatusBadgeSDR' : 'waStatusBadge';
  const visualId  = isSDR ? 'statusVisualSDR'  : 'statusVisual';
  const textId    = isSDR ? 'statusTextSDR'    : 'statusText';

  const badge  = document.getElementById(badgeId);
  const visual = document.getElementById(visualId);
  const txt    = document.getElementById(textId);

  if (!instancia || !u.evolution_url) {
    if (badge) { badge.textContent = 'Não configurado'; badge.className = 'badge b-gray'; }
    if (txt)   txt.textContent = 'Instância não configurada. Entre em contato com o suporte.';
    // ✅ Atualiza header como desconectado
    if (!isSDR) _updateHeaderWA(false);
    return;
  }

  try {
    const r = await fetch(`${u.evolution_url}/instance/connectionState/${instancia}`, {
      headers: { apikey: u.evolution_key }
    });
    const d = await r.json();
    const state = d?.instance?.state;

    if (state === 'open') {
      if (badge)  { badge.textContent = 'Conectado'; badge.className = 'badge b-green'; }
      if (visual) visual.innerHTML = ICON_CONNECTED;
      if (txt)    { txt.textContent = 'Dispositivo pareado com sucesso!'; txt.style.color = '#10b981'; }
      // ✅ Atualiza header como conectado
      if (!isSDR) _updateHeaderWA(true);
    } else if (state === 'connecting') {
      if (badge)  { badge.textContent = 'Conectando...'; badge.className = 'badge b-yellow'; }
      if (visual) visual.innerHTML = ICON_RESTRICTED;
      if (txt)    { txt.textContent = 'Aguardando conexão. Escaneie o QR Code abaixo.'; txt.style.color = '#f59e0b'; }
      if (!isSDR) _updateHeaderWA(false, 'Conectando...');
    } else if (state === 'close') {
      if (badge)  { badge.textContent = 'Desconectado'; badge.className = 'badge b-red'; }
      if (visual) visual.innerHTML = ICON_DISCONNECTED;
      if (txt)    { txt.textContent = 'Sessão encerrada. Clique em "Parear Dispositivo" para reconectar.'; txt.style.color = 'var(--tx-3)'; }
      if (!isSDR) _updateHeaderWA(false);
    } else {
      if (badge)  { badge.textContent = 'Desconectado'; badge.className = 'badge b-red'; }
      if (visual) visual.innerHTML = ICON_DISCONNECTED;
      if (txt)    { txt.textContent = 'Conexão perdida. Isso pode ocorrer por inatividade ou restrição do WhatsApp. Reconecte abaixo.'; txt.style.color = 'var(--tx-3)'; }
      if (!isSDR) _updateHeaderWA(false);
    }
  } catch(e) {
    if (badge) { badge.textContent = 'Indisponível'; badge.className = 'badge b-gray'; }
    if (txt)   txt.textContent = 'Não foi possível verificar o status. Verifique sua conexão.';
    if (!isSDR) _updateHeaderWA(false, 'Indisponível');
  }
}

// ✅ NOVO: Atualiza o badge de WhatsApp no header do app
function _updateHeaderWA(conectado, textoCustom) {
  const waStatus = document.getElementById('waStatus');
  const waPill   = document.getElementById('waPill');
  if (!waStatus) return;

  if (conectado) {
    waStatus.textContent = 'Conectado';
    if (waPill) {
      waPill.style.background = 'var(--green-50, #f0fdf4)';
      waPill.style.borderColor = '#10b981';
      const dot = waPill.querySelector('.dot');
      if (dot) dot.style.background = '#10b981';
    }
  } else {
    waStatus.textContent = textoCustom || 'Desconectado';
    if (waPill) {
      waPill.style.background = '';
      waPill.style.borderColor = '';
      const dot = waPill.querySelector('.dot');
      if (dot) dot.style.background = '#ef4444';
    }
  }
}

function renderQRCode(base64, qrWrap) {
  const src = base64.startsWith('data:image') ? base64 : `data:image/png;base64,${base64}`;
  const qrImg = new Image();
  qrImg.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = qrImg.width;
    canvas.height = qrImg.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(qrImg, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
      const bw = avg < 128 ? 0 : 255;
      data[i] = data[i+1] = data[i+2] = bw;
      data[i+3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    const bwUrl = canvas.toDataURL('image/png');
    if (qrWrap) qrWrap.innerHTML = `<img src="${bwUrl}" style="width:220px;height:220px;display:block;border-radius:4px;filter:none;background:#fff">`;
  };
  qrImg.onerror = () => {
    if (qrWrap) qrWrap.innerHTML = '<span style="color:#f87171;font-size:13px">Erro ao processar QR Code.</span>';
  };
  qrImg.src = src;
}

async function conectarWA(tipo) {
  const u = getUser();
  const isSDR = tipo === 'sdr';

  const url       = u.evolution_url;
  const key       = u.evolution_key;
  const instancia = isSDR ? u.instancia_sdr : u.instancia_whatsapp;

  const qrCardId = isSDR ? 'qrCardSDR' : 'qrCard';
  const qrWrapId = isSDR ? 'qrWrapSDR' : 'qrWrap';

  if (!url || !instancia) { showToast('Dados de instância não encontrados.', 'warning'); return; }

  const qrCard = document.getElementById(qrCardId);
  const qrWrap = document.getElementById(qrWrapId);

  if (qrCard) qrCard.style.display = 'block';
  if (qrWrap) qrWrap.innerHTML = '<span style="color:#888;font-size:13px">Gerando QR Code...</span>';

  try {
    const r = await fetch(`${url}/instance/connect/${instancia}`, { headers: { apikey: key } });
    const d = await r.json();

    const base64 = d?.base64 || d?.qrcode?.base64 || d?.code;

    if (!base64) {
      if (qrWrap) qrWrap.innerHTML = '<span style="color:#f87171;font-size:13px">QR Code não disponível. Tente novamente.</span>';
      showToast('Não foi possível gerar o QR Code. A instância pode estar em uso.', 'warning');
      return;
    }

    renderQRCode(base64, qrWrap);
    startQRPolling(tipo);

  } catch(e) {
    if (qrWrap) qrWrap.innerHTML = '<span style="color:#f87171;font-size:13px">Erro ao conectar com o servidor.</span>';
    showToast('Erro ao conectar com servidor', 'error');
  }
}

function startQRPolling(tipo) {
  const isSDR = tipo === 'sdr';
  if (isSDR && _qrPollingIntervalSDR) clearInterval(_qrPollingIntervalSDR);
  if (!isSDR && _qrPollingInterval) clearInterval(_qrPollingInterval);

  const interval = setInterval(async () => {
    const u = getUser();
    const instancia = isSDR ? u.instancia_sdr : u.instancia_whatsapp;
    try {
      const r = await fetch(`${u.evolution_url}/instance/connectionState/${instancia}`, {
        headers: { apikey: u.evolution_key }
      });
      const d = await r.json();
      if (d?.instance?.state === 'open') {
        clearInterval(interval);
        const qrCard = document.getElementById(isSDR ? 'qrCardSDR' : 'qrCard');
        if (qrCard) qrCard.style.display = 'none';
        await checkWAStatus(tipo);
        showToast('WhatsApp conectado com sucesso! ✅', 'success');
      }
    } catch(e) {}
  }, 3000);

  if (isSDR) _qrPollingIntervalSDR = interval;
  else _qrPollingInterval = interval;

  setTimeout(() => {
    clearInterval(interval);
    const qrWrap = document.getElementById(isSDR ? 'qrWrapSDR' : 'qrWrap');
    if (qrWrap && qrWrap.querySelector('img')) {
      qrWrap.innerHTML = '<span style="color:#f87171;font-size:13px">QR Code expirado. Clique em "Parear Dispositivo" novamente.</span>';
    }
  }, 120000);
}

async function desconectarWA(tipo) {
  const u = getUser();
  const isSDR = tipo === 'sdr';
  const instancia = isSDR ? u.instancia_sdr : u.instancia_whatsapp;

  if (!confirm('Deseja realmente desconectar o WhatsApp?')) return;

  try {
    await fetch(`${u.evolution_url}/instance/logout/${instancia}`, {
      method: 'DELETE',
      headers: { apikey: u.evolution_key }
    });
    await checkWAStatus(tipo);
    showToast('WhatsApp desconectado.', 'info');
  } catch(e) {
    showToast('Erro ao desconectar.', 'error');
  }
}

async function salvarPerfil() {
  const u = getUser();
  const senhaAtual = document.getElementById('cfgSenhaAtual').value;
  const senhaNova  = document.getElementById('cfgSenhaNova').value;
  const senhaConf  = document.getElementById('cfgSenhaConf').value;

  const data = { nome_cliente: document.getElementById('cfgNome').value.trim() };

  if (senhaNova) {
    if (senhaNova !== senhaConf) { showToast('As senhas não conferem.', 'warning'); return; }
    if (!senhaAtual) { showToast('Informe a senha atual.', 'warning'); return; }
    data.senha = senhaNova;
  }

  try {
    await sb.patch('USUARIOS', `id=eq.${u.id}`, data);
    Object.assign(window.S.user, data);
    showToast('Dados atualizados!', 'success');
  } catch(e) {
    showToast('Erro ao salvar.', 'error');
  }
}

// ✅ Chamado ao carregar o app para já mostrar o status correto no header
async function checkWABadge() {
  await checkWAStatus('prospeccao');
}