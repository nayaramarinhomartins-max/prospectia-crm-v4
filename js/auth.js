/* ═══════════════════════════════════════
   ProspectIA — Auth
   ═══════════════════════════════════════ */

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPass').value.trim();
  const btn   = document.getElementById('loginBtn');
  const err   = document.getElementById('loginErr');

  err.style.display = 'none';
  if (!email || !pass) { showErr('Preencha e-mail e senha.'); return; }

  btn.disabled = true;
  document.getElementById('loginBtnTxt').textContent = 'Entrando...';

  try {
    const rows = await sb.get('USUARIOS', `email=eq.${encodeURIComponent(email)}&select=*`);
    if (!rows?.length) { showErr('E-mail ou senha incorretos.'); return; }
    const u = rows[0];
    if (u.senha !== pass) { showErr('E-mail ou senha incorretos.'); return; }
    if (u.status === 'pendente') { showErr('Conta pendente de ativação. Verifique seu e-mail.'); return; }
    if (u.status === 'inativo')  { showErr('Conta inativa. Contate o suporte.'); return; }

    sessionStorage.setItem('pia_u', JSON.stringify(u));
    window.location.href = 'app.html';
  } catch(e) {
    showErr('Erro de conexão. Tente novamente.');
    console.error(e);
  } finally {
    btn.disabled = false;
    document.getElementById('loginBtnTxt').textContent = 'Entrar na plataforma';
  }
}

function showErr(msg) {
  const e = document.getElementById('loginErr');
  e.textContent = msg; e.style.display = 'block';
}

function doLogout() {
  sessionStorage.removeItem('pia_u');
  window.S.user = null;
  window.location.href = 'index.html';
}

function checkSession() {
  const s = sessionStorage.getItem('pia_u');
  if (s) { try { window.S.user = JSON.parse(s); return true; } catch{} }
  return false;
}

async function refreshUser() {
  const u = getUser(); if (!u) return;
  try {
    const rows = await sb.get('USUARIOS', `id=eq.${u.id}&select=*`);
    if (rows?.[0]) {
      window.S.user = rows[0];
      sessionStorage.setItem('pia_u', JSON.stringify(rows[0]));
    }
  } catch(e){ console.error('refreshUser', e); }
}
