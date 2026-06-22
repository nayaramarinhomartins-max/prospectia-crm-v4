// ── Graficos v3 Premium ──

async function init_graficos() {
  const u = getUser();
  const c = getCarteira();
  const dias = parseInt(document.getElementById('grafPeriodo')?.value || '30');

  document.getElementById('gAlertas').style.display = 'none';
  ['gTotalLeads','gLeadsQual','gFechou','gTaxaConv'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '—';
  });

  try {
    const [leads, conversas] = await Promise.all([
      sb.get('MARKETPLACE',
        `usuario_id=eq.${u.id}&select=telefone,empresa,cidade,status_crm,score,categoria,mensagem_enviada_em,ultima_interacao`
      ),
      sb.get('CONVERSAS',
        `usuario_id=eq.${u.id}&select=created_at,origem,telefone,lida&order=created_at.asc&limit=5000`
      )
    ]);

    const allLeads = leads || [];
    const allConvs = conversas || [];
    const cutoff   = dias > 0 ? new Date(Date.now() - dias * 86400000) : new Date(0);
    const normS    = s => s === 'novo' ? 'Lead' : s === 'abordado' ? 'Contato Feito' : (s || 'Lead');

    const filtered = allLeads.filter(l => {
      const d = l.mensagem_enviada_em || l.ultima_interacao;
      return d ? new Date(d) >= cutoff : true;
    });

    const convsFiltered = allConvs.filter(m => new Date(m.created_at) >= cutoff);

    const total    = filtered.length;
    const quentes  = filtered.filter(l => parseInt(l.score || 0) >= 70).length;
    const fechados = filtered.filter(l => normS(l.status_crm) === 'Fechado').length;
    const taxa     = total > 0 ? Math.round(fechados / total * 100) : 0;

    document.getElementById('gTotalLeads').textContent = total;
    document.getElementById('gLeadsQual').textContent  = quentes;
    document.getElementById('gFechou').textContent     = fechados;
    document.getElementById('gTaxaConv').textContent   = taxa + '%';

    renderAlertas(filtered, allLeads, c, u);
    renderByStatus(filtered, normS);
    renderByCategoria(filtered);
    renderLinhaEvolucao(convsFiltered);
    renderFunilContinuo(filtered, normS);
    renderCanais(convsFiltered);
    renderOrigens(convsFiltered);
    renderTaxaResposta(filtered, allConvs);

  } catch(e) {
    console.error('graficos', e);
    showToast('Erro ao carregar relatórios.', 'error');
  }
}

// ── ALERTAS ──
function renderAlertas(filtered, todos, c, u) {
  const alertas = [];
  const normS = s => s === 'novo' ? 'Lead' : s === 'abordado' ? 'Contato Feito' : (s || 'Lead');

  const comResp = filtered.filter(l => l.ultima_interacao).length;
  if (filtered.length >= 20 && comResp > 0 && comResp / filtered.length < 0.1)
    alertas.push({ tipo:'warning', msg:'Taxa de retorno baixa. Considere mudar a mensagem de abordagem.', acao:'Editar mensagem', fn:"nav('captacao')" });

  const plano = (u.plano || 'start').toLowerCase();
  const limites = (typeof CONFIG !== 'undefined' && CONFIG.PLAN_LIMITS?.[plano]) || { leads_mes: 100 };
  const captados = u.leads_captados_mes || 0;
  if (limites.leads_mes > 0 && captados / limites.leads_mes >= 0.8)
    alertas.push({ tipo:'info', msg:`Você está em ${Math.round(captados/limites.leads_mes*100)}% do limite de leads do plano.`, acao:'Ver planos', fn:"nav('planos')" });

  const sete = new Date(Date.now() - 7 * 86400000);
  const parados = todos.filter(l => normS(l.status_crm) === 'Lead' && (!l.ultima_interacao || new Date(l.ultima_interacao) < sete));
  if (todos.length > 0 && parados.length / todos.length >= 0.8)
    alertas.push({ tipo:'warning', msg:`${parados.length} leads sem follow-up há mais de 7 dias.`, acao:'Criar campanha', fn:"nav('campanhas')" });

  const saldo = c?.saldo_reais || 0;
  if (saldo < 5 && saldo >= 0)
    alertas.push({ tipo:'error', msg:`Saldo baixo: R$ ${saldo.toFixed(2).replace('.', ',')}. Recarregue para continuar.`, acao:'Recarregar', fn:"nav('carteira')" });

  const el = document.getElementById('gAlertas');
  if (!el) return;
  if (!alertas.length) { el.style.display = 'none'; return; }

  const ICONS = {
    warning: `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 1L14 13H1L7.5 1z"/><line x1="7.5" y1="6" x2="7.5" y2="9"/><circle cx="7.5" cy="11.5" r=".5" fill="currentColor" stroke="none"/></svg>`,
    info:    `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="7.5" r="6.5"/><line x1="7.5" y1="5" x2="7.5" y2="5.5"/><line x1="7.5" y1="7" x2="7.5" y2="11"/></svg>`,
    error:   `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="7.5" r="6.5"/><line x1="5" y1="5" x2="10" y2="10"/><line x1="10" y1="5" x2="5" y2="10"/></svg>`,
  };

  el.style.display = 'flex';
  el.innerHTML = alertas.map(a =>
    `<div class="alert alert-${a.tipo}">
      <span class="alert-icon">${ICONS[a.tipo] || ICONS.info}</span>
      <span class="alert-msg">${a.msg}</span>
      <button class="btn btn-sm btn-ghost alert-action" onclick="${a.fn}">${a.acao}</button>
    </div>`
  ).join('');
}

// ── STATUS BARS ──
function renderByStatus(filtered, normS) {
  const total = filtered.length;
  const COLS   = ['Lead','Contato Feito','Interesse','Proposta','Fechado','Perdido'];
  const COLORS = { 'Lead':'#94A3B8','Contato Feito':'#3B82F6','Interesse':'#F59E0B','Proposta':'#F97316','Fechado':'#10B981','Perdido':'#EF4444' };
  const map = {};
  filtered.forEach(l => { const k = normS(l.status_crm); map[k] = (map[k]||0) + 1; });
  const sorted = COLS.map(k => ({ k, v: map[k]||0 })).filter(x => x.v > 0);

  document.getElementById('gByStatus').innerHTML = sorted.length
    ? sorted.map(({ k, v }) => {
        const pct = total > 0 ? Math.round(v/total*100) : 0;
        return `<div class="sb-item">
          <div class="sb-row">
            <span class="sb-name"><span class="sb-dot" style="background:${COLORS[k]||'#94A3B8'}"></span>${k}</span>
            <span><span class="sb-count">${v}</span><span class="sb-pct">${pct}%</span></span>
          </div>
          <div class="sb-track"><div class="sb-fill" style="width:${pct}%;background:${COLORS[k]||'#94A3B8'}"></div></div>
        </div>`;
      }).join('')
    : '<div class="text-sm" style="color:var(--tx-4)">Sem dados no período</div>';
}

// ── CATEGORIA ──
function renderByCategoria(filtered) {
  const map = {};
  filtered.forEach(l => {
    const k = l.categoria || 'Sem categoria';
    if (!map[k]) map[k] = { count:0, total:0 };
    map[k].count++; map[k].total += parseInt(l.score||0);
  });
  const sorted = Object.entries(map)
    .map(([k,v]) => ({ k, avg: Math.round(v.total/v.count), count: v.count }))
    .sort((a,b) => b.avg - a.avg).slice(0,8);

  document.getElementById('gByCategoria').innerHTML = sorted.length
    ? sorted.map(({ k, avg, count }, i) => {
        const color = avg >= 70 ? '#10B981' : avg >= 40 ? '#F59E0B' : '#EF4444';
        return `<div class="cat-item">
          <span class="cat-rank">${i+1}</span>
          <span class="cat-name" title="${escHtml(k)}">${escHtml(k)}</span>
          <div class="cat-bar"><div class="cat-fill" style="width:${avg}%;background:${color}"></div></div>
          <span class="cat-val" style="color:${color}">${avg}</span>
          <span style="font-size:10px;color:var(--tx-4);width:38px;text-align:right;flex-shrink:0">${count}x</span>
        </div>`;
      }).join('')
    : '<div class="text-sm" style="color:var(--tx-4)">Sem dados</div>';
}

// ── GRÁFICO DE LINHA ──
function renderLinhaEvolucao(msgs) {
  const svg    = document.getElementById('gLineChart');
  const totalEl = document.getElementById('gEvolTotal');
  if (!svg) return;

  const enviadas = msgs.filter(m => m.origem !== 'cliente');
  if (!enviadas.length) {
    svg.parentElement.innerHTML = '<div style="text-align:center;padding:40px;font-size:13px;color:var(--tx-4)">Sem dados no período</div>';
    return;
  }

  const semanas = {};
  enviadas.forEach(m => {
    const d = new Date(m.created_at);
    const ini = new Date(d); ini.setDate(d.getDate() - d.getDay());
    const key = ini.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
    semanas[key] = (semanas[key]||0) + 1;
  });

  const entries = Object.entries(semanas).slice(-10);
  if (totalEl) totalEl.textContent = `${enviadas.length} total`;

  const W = 560, H = 130, PL = 30, PR = 12, PT = 12, PB = 24;
  const vals = entries.map(e => e[1]);
  const maxV = Math.max(...vals, 1);
  const xStep = (W - PL - PR) / Math.max(entries.length - 1, 1);
  const yOf  = v => PT + (H - PT - PB) * (1 - v / maxV);
  const pts  = entries.map(([, v], i) => ({ x: PL + i * xStep, y: yOf(v), v }));

  const area = `M${pts[0].x},${H-PB} ` + pts.map(p=>`L${p.x},${p.y}`).join(' ') + ` L${pts[pts.length-1].x},${H-PB} Z`;
  const line = `M${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p=>`L${p.x},${p.y}`).join(' ');

  const grid = [0,.33,.66,1].map(t => {
    const y = PT + (H-PT-PB)*t;
    const v = Math.round(maxV*(1-t));
    return `<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>
            <text x="${PL-4}" y="${y+4}" text-anchor="end" font-size="9" fill="var(--tx-4)">${v}</text>`;
  }).join('');

  const labsX = entries.map(([sem],i) => {
    const x = PL + i * xStep;
    return (entries.length <= 6 || i%2===0)
      ? `<text x="${x}" y="${H-PB+14}" text-anchor="middle" font-size="9" fill="var(--tx-4)">${sem}</text>` : '';
  }).join('');

  const dots = pts.map((p,i) =>
    `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#3B82F6" stroke="var(--surface)" stroke-width="2">
      <title>${entries[i][0]}: ${p.v}</title>
    </circle>`
  ).join('');

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <defs>
      <linearGradient id="lgrd" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3B82F6" stop-opacity=".18"/>
        <stop offset="100%" stop-color="#3B82F6" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#lgrd)"/>
    <path d="${line}" fill="none" stroke="#3B82F6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${labsX}
    ${dots}`;
}

// ── FUNIL CONTÍNUO SVG ──
function renderFunilContinuo(filtered, normS) {
  const el = document.getElementById('gFunil');
  if (!el) return;

  const ALL_ETAPAS = ['Lead','Contato Feito','Interesse','Proposta','Fechado'];
  const ALL_COLORS = ['#64748B','#3B82F6','#F59E0B','#F97316','#10B981'];

  const map = {};
  filtered.forEach(l => { const k = normS(l.status_crm); map[k] = (map[k]||0) + 1; });

  const active = ALL_ETAPAS
    .map((k, i) => ({ k, v: map[k]||0, color: ALL_COLORS[i] }))
    .filter(e => e.v > 0);

  if (!active.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px 0;font-size:13px;color:var(--tx-4)">Sem dados no período</div>';
    return;
  }

  const total = active[0].v;
  const W = 520, stH = 64, H = active.length * stH;
  const MAXW = W * 0.82, MINW = W * 0.12, cx = W / 2;
  const maxV = Math.max(...active.map(e => e.v), 1);
  const widths = active.map(e => MINW + (MAXW - MINW) * (e.v / maxV));

  let defs = '', paths = '', labels = '', drops = '';

  active.forEach((etapa, i) => {
    const tW = widths[i], bW = i < active.length - 1 ? widths[i+1] : widths[i] * 0.82;
    const y = i * stH, mid = y + stH / 2;
    const tl = cx-tW/2, tr = cx+tW/2, bl = cx-bW/2, br = cx+bW/2, r = 5;

    const p = `M${tl+r},${y} L${tr-r},${y} Q${tr},${y} ${tr},${y+r}
               L${br},${y+stH-r} Q${br},${y+stH} ${br-r},${y+stH}
               L${bl+r},${y+stH} Q${bl},${y+stH} ${bl},${y+stH-r}
               L${tl},${y+r} Q${tl},${y} ${tl+r},${y} Z`;

    const gId = `fg${i}`;
    defs += `<linearGradient id="${gId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${etapa.color}" stop-opacity=".9"/>
      <stop offset="100%" stop-color="${etapa.color}" stop-opacity=".65"/>
    </linearGradient>`;

    paths += `<path d="${p}" fill="url(#${gId})"/>
              <path d="${p}" fill="none" stroke="white" stroke-opacity=".1" stroke-width="1"/>`;

    const pct = Math.round(etapa.v / total * 100);
    labels += `
      <text x="${cx}" y="${mid-6}" text-anchor="middle" font-size="11" font-weight="700" fill="white" opacity=".85">${etapa.k}</text>
      <text x="${cx}" y="${mid+12}" text-anchor="middle" font-size="18" font-weight="900" fill="white">${etapa.v}</text>
      <text x="${cx}" y="${mid+26}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,.6)">${pct}% do total</text>`;

    if (i > 0) {
      const queda = Math.round((1 - etapa.v / active[i-1].v) * 100);
      drops += `<text x="${cx + widths[i-1]/2 + 12}" y="${y+10}" font-size="10" font-weight="700" fill="#F87171">-${queda}%</text>`;
    }
  });

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-height:${H}px;display:block" preserveAspectRatio="xMidYMid meet">
      <defs>${defs}</defs>
      ${paths}${labels}${drops}
    </svg>
    <div class="funil-legend">
      ${active.map(e => `
        <div class="funil-leg-item">
          <div class="funil-leg-dot" style="background:${e.color}"></div>
          <span class="funil-leg-lbl">${e.k} (${e.v})</span>
        </div>`).join('')}
    </div>`;
}

// ── CANAIS ──
function renderCanais(msgs) {
  const el = document.getElementById('gCanais');
  if (!el) return;

  const LABELS = { whatsapp: 'WhatsApp', sms: 'SMS', voz: 'Voz' };
  const COLORS = { whatsapp: '#10B981', sms: '#3B82F6', voz: '#8B5CF6' };

  const map = {};
  msgs.forEach(m => {
    const k = m.canal || 'whatsapp';
    map[k] = (map[k]||0) + 1;
  });

  const total = Object.values(map).reduce((a,b) => a+b, 0);
  const sorted = Object.entries(map).sort((a,b) => b[1]-a[1]);

  el.innerHTML = sorted.length
    ? sorted.map(([k, v]) => {
        const pct = total > 0 ? Math.round(v/total*100) : 0;
        const label = LABELS[k] || k;
        const color = COLORS[k] || '#94A3B8';
        return `<div class="sb-item">
          <div class="sb-row">
            <span class="sb-name"><span class="sb-dot" style="background:${color}"></span>${label}</span>
            <span><span class="sb-count">${v}</span><span class="sb-pct">${pct}%</span></span>
          </div>
          <div class="sb-track"><div class="sb-fill" style="width:${pct}%;background:${color}"></div></div>
        </div>`;
      }).join('')
    : '<div class="text-sm" style="color:var(--tx-4)">Sem dados no período</div>';
}

// ── ORIGENS ──
function renderOrigens(msgs) {
  const el = document.getElementById('gOrigens');
  if (!el) return;

  const LABELS = {
    prospeccao: 'Prospecção auto',
    campanha:   'Campanha',
    cliente:    'Resposta do lead',
    ia:         'Resposta IA',
    sms:        'SMS enviado',
    voz:        'Ligação',
    humano:     'Atendente humano',
    sistema:    'Sistema',
  };
  const COLORS = {
    prospeccao: '#8B5CF6',
    campanha:   '#3B82F6',
    cliente:    '#F97316',
    ia:         '#10B981',
    sms:        '#06B6D4',
    voz:        '#EC4899',
    humano:     '#F59E0B',
    sistema:    '#94A3B8',
  };

  const map = {};
  msgs.forEach(m => { const k = m.origem || 'desconhecido'; map[k] = (map[k]||0) + 1; });

  const total = Object.values(map).reduce((a,b) => a+b, 0);
  const sorted = Object.entries(map).sort((a,b) => b[1]-a[1]);

  el.innerHTML = sorted.length
    ? sorted.map(([k, v]) => {
        const pct = total > 0 ? Math.round(v/total*100) : 0;
        const label = LABELS[k] || k;
        const color = COLORS[k] || '#94A3B8';
        return `<div class="sb-item">
          <div class="sb-row">
            <span class="sb-name"><span class="sb-dot" style="background:${color}"></span>${label}</span>
            <span><span class="sb-count">${v}</span><span class="sb-pct">${pct}%</span></span>
          </div>
          <div class="sb-track"><div class="sb-fill" style="width:${pct}%;background:${color}"></div></div>
        </div>`;
      }).join('')
    : '<div class="text-sm" style="color:var(--tx-4)">Sem dados no período</div>';
}

// ── TAXA DE RESPOSTA REAL ──
function renderTaxaResposta(leads, allConvs) {
  const el = document.getElementById('gTaxaResposta');
  if (!el) return;

  // Leads que receberam mensagem
  const abordados = leads.filter(l => l.mensagem_enviada_em);
  // Telefones que responderam (origem=cliente)
  const responderam = new Set(
    allConvs.filter(m => m.origem === 'cliente').map(m => m.telefone?.replace(/\D/g,''))
  );

  const totalAbord = abordados.length;
  const totalResp  = abordados.filter(l => responderam.has((l.telefone||'').replace(/\D/g,''))).length;
  const pctResp    = totalAbord > 0 ? Math.round(totalResp / totalAbord * 100) : 0;
  const naoResp    = totalAbord - totalResp;
  const pctNao     = totalAbord > 0 ? 100 - pctResp : 0;

  const items = [
    { label: 'Responderam', v: totalResp,  pct: pctResp, color: '#10B981' },
    { label: 'Sem resposta', v: naoResp,   pct: pctNao,  color: '#EF4444' },
  ];

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <span style="font-family:'DM Mono',monospace;font-size:28px;font-weight:500;color:var(--tx)">${pctResp}%</span>
      <span style="font-size:11px;color:var(--tx-4);line-height:1.4">de ${totalAbord} leads<br>abordados responderam</span>
    </div>
    ${items.map(item => `
      <div class="sb-item">
        <div class="sb-row">
          <span class="sb-name"><span class="sb-dot" style="background:${item.color}"></span>${item.label}</span>
          <span><span class="sb-count">${item.v}</span><span class="sb-pct">${item.pct}%</span></span>
        </div>
        <div class="sb-track"><div class="sb-fill" style="width:${item.pct}%;background:${item.color}"></div></div>
      </div>`).join('')}`;
}

function escHtml(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }