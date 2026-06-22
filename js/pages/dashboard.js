/* ═══════════════════════════════════════
   ProspectIA v2 — Dashboard
   Corrigido: campos reais do Supabase
   MARKETPLACE não tem created_at
   usa: mensagem_enviada_em, ultima_interacao
   ═══════════════════════════════════════ */

async function init_dashboard() {
  const u = getUser();
  if (!u) return;

  // Saudação
  const h = new Date().getHours();
  const greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('dashGreet').textContent = `${greet}, ${(u.nome_cliente||'').split(' ')[0]} 👋`;

  // Plano
  const plano = (u.plano || 'start').toLowerCase();
  const chip = document.getElementById('dashPlanChip');
  chip.textContent = plano.charAt(0).toUpperCase() + plano.slice(1);
  chip.className = `plan-chip ${plano}`;

  const limites = CONFIG.PLAN_LIMITS[plano] || CONFIG.PLAN_LIMITS.start;

  // Barras de uso (imediato com dados do sessionStorage)
  document.getElementById('dashBarLeads').innerHTML = renderLimitBar(
    u.leads_captados_mes || 0, limites.leads_mes, 'Leads captados'
  );
  document.getElementById('dashBarProsp').innerHTML = renderLimitBar(
    u.limite_prospecao || 0, limites.prosp_dia, 'Prospecção (diária)'
  );

  // Vencimento do plano
  if (u.data_vencimento_plano) {
    const venc = new Date(u.data_vencimento_plano);
    const dias = Math.ceil((venc - new Date()) / 86400000);
    document.getElementById('dashPlanVenc').textContent =
      dias > 0 ? `Vence em ${dias} dias` : 'Plano vencido';
  }

  // Créditos bônus — valor imediato enquanto API carrega
  document.getElementById('dSMS').textContent = u.bonus_sms_restante ?? 0;
  document.getElementById('dVoz').textContent = u.bonus_voz_restante ?? 0;

  // ── Busca paralela no Supabase ──
  try {
    const hoje     = new Date().toISOString().slice(0, 10); // "2025-02-21"
    const mesAtual = new Date().toISOString().slice(0, 7);  // "2025-02"

    const [todosLeads, conversas, leadsRecentes, carteiraRows] = await Promise.all([

      // MARKETPLACE: sem created_at — usa mensagem_enviada_em para filtros de data
      sb.get('MARKETPLACE',
        `usuario_id=eq.${u.id}` +
        `&select=telefone,score,status_lead,mensagem_enviada_em,ultima_interacao`
      ),

      // CONVERSAS: tem created_at ✓
      sb.get('CONVERSAS',
        `usuario_id=eq.${u.id}` +
        `&select=telefone,mensagem,created_at,origem,nome_contato` +
        `&order=created_at.desc&limit=5`
      ),

      // MARKETPLACE recentes para lista: ordena por mensagem_enviada_em
      sb.get('MARKETPLACE',
        `usuario_id=eq.${u.id}` +
        `&select=telefone,nome,cidade,score,status_lead,mensagem_enviada_em` +
        `&order=mensagem_enviada_em.desc.nullslast&limit=5`
      ),

      // CARTEIRA: saldo e totais
      sb.get('CARTEIRA',
        `usuario_id=eq.${u.id}` +
        `&select=saldo_reais,total_gasto_acumulado,lucro_acumulado`
      )
    ]);

    const leads = todosLeads || [];

    // ── KPI 1: Leads captados no mês ──
    // Fonte 1: campo leads_captados_mes do usuário (mais confiável — atualizado pelo backend)
    // Fonte 2: filtra por mensagem_enviada_em do mês atual (fallback)
    let leadsDoMes = u.leads_captados_mes || 0;
    if (!leadsDoMes && leads.length) {
      leadsDoMes = leads.filter(l =>
        (l.mensagem_enviada_em || '').startsWith(mesAtual)
      ).length;
    }
    document.getElementById('dLeads').textContent = leadsDoMes.toLocaleString('pt-BR');
    // Atualiza barra com dado real
    document.getElementById('dashBarLeads').innerHTML = renderLimitBar(
      leadsDoMes, limites.leads_mes, 'Leads captados'
    );

    // ── KPI 2: Prospecções hoje ──
    const prospecHoje = leads.filter(l =>
      (l.mensagem_enviada_em || '').startsWith(hoje)
    ).length;
    document.getElementById('dProsp').textContent = prospecHoje;
    document.getElementById('dashBarProsp').innerHTML = renderLimitBar(
      prospecHoje, limites.prosp_dia, 'Prospecção (diária)'
    );

    // ── KPI 3: Conversas ativas (telefones únicos) ──
    const uniquePhones = [...new Set((conversas || []).map(c => c.telefone).filter(Boolean))];
    document.getElementById('dConversas').textContent = uniquePhones.length;

    // ── KPI 4: Score médio ──
    const scores = leads.map(l => parseInt(l.score) || 0).filter(s => s > 0);
    const avgScore = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
    document.getElementById('dScore').textContent = avgScore || '—';

    // ── KPI 5 & 6: Bônus SMS e Voz (do USUARIOS via sessionStorage) ──
    document.getElementById('dSMS').textContent = u.bonus_sms_restante ?? 0;
    document.getElementById('dVoz').textContent = u.bonus_voz_restante ?? 0;

    // Atualiza carteira no estado global
    if (carteiraRows?.[0]) {
      window.S.carteira = carteiraRows[0];
      updateFinPill();
    }

    // ── Mini pipeline ──
    renderDashPipeline(leads);

    // ── Listas ──
    renderDashConversas(conversas || []);
    renderDashLeads(leadsRecentes || []);

  } catch(e) {
    console.error('Dashboard erro:', e);
    // Garante que KPIs não fiquem presos em "—"
    ['dLeads','dProsp','dConversas','dScore'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.textContent === '—') el.textContent = '0';
    });
  }
}

/* ════════════════════════════════════════
   Mini Pipeline
════════════════════════════════════════ */
function renderDashPipeline(leads) {
  const cols = [
    { k: 'Lead',          label: 'Lead',         color: 'var(--tx-4)'      },
    { k: 'Contato Feito', label: 'Contato Feito', color: 'var(--blue-500)'  },
    { k: 'Interesse',     label: 'Interesse',     color: 'var(--yellow)'    },
    { k: 'Proposta',      label: 'Proposta',      color: 'var(--orange)'    },
    { k: 'Fechado',       label: 'Fechado',       color: 'var(--green)'     },
  ];
  const total = leads.length || 1;
  document.getElementById('dashPipeline').innerHTML = cols.map(col => {
    const count = leads.filter(l => (l.status_lead || 'Lead') === col.k).length;
    const pct   = Math.round(count / total * 100);
    return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-lg);padding:12px 14px;cursor:pointer" onclick="nav('pipeline')">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <div style="width:8px;height:8px;border-radius:50%;background:${col.color};flex-shrink:0"></div>
        <span style="font-size:11px;font-weight:700;color:var(--tx-3)">${col.label}</span>
      </div>
      <div style="font-size:22px;font-weight:800;color:var(--tx);line-height:1">${count}</div>
      <div style="font-size:10px;color:var(--tx-4);margin-top:2px">${pct}% do total</div>
    </div>`;
  }).join('');
}

/* ════════════════════════════════════════
   Lista de Conversas
════════════════════════════════════════ */
function renderDashConversas(rows) {
  const el = document.getElementById('dashConversas');
  if (!rows.length) {
    el.innerHTML = `<div class="empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p>Nenhuma conversa ainda</p>
    </div>`;
    return;
  }
  el.innerHTML = rows.map(c => {
    const leadInfo = (window.S.leads || []).find(l => l.telefone && l.telefone.replace(/\D/g,'') === (c.telefone||'').replace(/\D/g,''));
    const nome     = leadInfo?.nome || c.nome_contato || formatPhoneDash(c.telefone);
    const msg      = (c.mensagem || '').substring(0, 55) + ((c.mensagem || '').length > 55 ? '…' : '');
    const time     = formatTimeDash(c.created_at);
    const isClient = c.origem === 'cliente';
    return `<div class="flex items-center gap-12" style="padding:10px 20px;border-bottom:1px solid var(--border);cursor:pointer" onclick="nav('conversas')" onmouseenter="this.style.background='var(--surface-2)'" onmouseleave="this.style.background=''">
      <div style="width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,var(--blue-600),var(--blue-800));color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${escHtmlDash(nome).charAt(0).toUpperCase()}</div>
      <div class="flex-1 min-w-0">
        <div class="flex justify-between">
          <span class="fw-600 text-sm" style="color:var(--tx)">${escHtmlDash(nome)}</span>
          <span class="text-xs tx-4">${time}</span>
        </div>
        <div class="text-xs tx-3 truncate">${isClient ? '' : 'Você: '}${escHtmlDash(msg)}</div>
      </div>
    </div>`;
  }).join('');
}

/* ════════════════════════════════════════
   Lista de Leads Recentes
════════════════════════════════════════ */
function renderDashLeads(leads) {
  const el = document.getElementById('dashLeadsList');
  if (!leads.length) {
    el.innerHTML = `<div class="empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      <p>Nenhum lead ainda</p>
    </div>`;
    return;
  }
  el.innerHTML = leads.map(l => {
    const nome  = l.nome || formatPhoneDash(l.telefone);
    const score = parseInt(l.score) || 0;
    const sc    = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--yellow)' : 'var(--red)';
    const time  = formatTimeDash(l.mensagem_enviada_em);
    return `<div class="flex items-center gap-12" style="padding:10px 20px;border-bottom:1px solid var(--border);cursor:pointer" onclick="nav('leads')" onmouseenter="this.style.background='var(--surface-2)'" onmouseleave="this.style.background=''">
      <div style="width:8px;height:8px;border-radius:50%;background:${sc};flex-shrink:0;margin-top:2px"></div>
      <div class="flex-1 min-w-0">
        <div class="flex justify-between">
          <span class="fw-600 text-sm truncate" style="color:var(--tx)">${escHtmlDash(nome)}</span>
          <span class="text-xs tx-4">${time}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-xs tx-3">${escHtmlDash(l.cidade || '')}</span>
          <span class="badge b-gray text-xs">${escHtmlDash(l.status_lead || 'Lead')}</span>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:8px">
        <div class="text-sm fw-700" style="color:${sc}">${score}</div>
        <div class="text-xs tx-4">score</div>
      </div>
    </div>`;
  }).join('');
}

/* ════════════════════════════════════════
   Helpers
════════════════════════════════════════ */
function formatPhoneDash(t = '') {
  const n = (t||'').replace(/\D/g, '');
  if (n.length >= 11) return `(${n.slice(-11,-9)}) ${n.slice(-9,-4)}-${n.slice(-4)}`;
  return t;
}

function formatTimeDash(iso) {
  if (!iso) return '';
  const d    = new Date(iso);
  const now  = new Date();
  const diff = (now - d) / 60000;
  if (isNaN(diff))  return '';
  if (diff < 1)     return 'agora';
  if (diff < 60)    return `${Math.floor(diff)}min`;
  if (diff < 1440)  return `${Math.floor(diff / 60)}h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function escHtmlDash(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
