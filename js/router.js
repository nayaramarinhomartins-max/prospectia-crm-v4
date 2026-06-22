/* ═══════════════════════════════════════
   ProspectIA — Router
   ═══════════════════════════════════════ */

const PAGES = {
  dashboard:    { label:'Dashboard',           file:'pages/dashboard.html',    init:'init_dashboard' },
  conversas:    { label:'Conversas',           file:'pages/conversas.html',    init:'init_conversas' },
  leads:        { label:'Leads',              file:'pages/leads.html',        init:'init_leads' },
  pipeline:     { label:'Pipeline',            file:'pages/pipeline.html',     init:'init_pipeline' },
  captacao:     { label:'Captação de Leads',   file:'pages/captacao.html',     init:'init_captacao' },
  cnpj:         { label:'Consulta CNPJ',        file:'pages/cnpj.html',         init:'init_cnpj' },
  campanhas:    { label:'Campanhas',           file:'pages/campanhas.html',    init:'init_campanhas' },
  sdr:          { label:'Agente SDR',          file:'pages/sdr.html',          init:'init_sdr' },
  carteira:     { label:'Carteira',            file:'pages/carteira.html',     init:'init_carteira' },
  sms:          { label:'SMS',                 file:'pages/sms.html',          init:'init_sms' },
  ligacoes:     { label:'Ligações',            file:'pages/ligacoes.html',     init:'init_ligacoes' },
  aprendizado:  { label:'Aprendizado',         file:'pages/aprendizado.html',  init:'init_aprendizado' },
  graficos:     { label:'Relatórios',          file:'pages/graficos.html',     init:'init_graficos' },
  planos:       { label:'Planos',              file:'pages/planos.html',       init:'init_planos' },
  configuracoes:{ label:'Configurações',       file:'pages/configuracoes.html',init:'init_configuracoes' },
  ajuda:        { label:'Ajuda',         file:'pages/ajuda.html',        init:'init_ajuda' },
};

let _cur = null;
const _scripts = new Set();

async function nav(page, el) {
  if (!PAGES[page] || _cur === page) return;
  _cur = page;

  // Update active nav item
  document.querySelectorAll('.s-item').forEach(i => i.classList.remove('active'));
  const target = el || document.querySelector(`[data-page="${page}"]`);
  if (target) target.classList.add('active');

  // Breadcrumb
  document.getElementById('breadcrumb').textContent = PAGES[page].label;

  // Loading state
  const c = document.getElementById('pageContent');
  c.innerHTML = `<div style="padding:0">
    <div class="skel" style="height:22px;width:200px;margin-bottom:6px"></div>
    <div class="skel" style="height:13px;width:140px;margin-bottom:24px"></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px">
      ${Array(4).fill('<div class="skel" style="height:88px;border-radius:10px"></div>').join('')}
    </div>
    <div class="skel" style="height:320px;border-radius:10px"></div>
  </div>`;

  try {
    const r = await fetch(PAGES[page].file + '?v=' + Date.now());
    if (!r.ok) throw new Error(`Página não encontrada (${r.status})`);
    c.innerHTML = await r.text();

    // Load page script if not yet loaded
    const jsFile = `js/pages/${page}.js`;
    if (!_scripts.has(page)) {
      await new Promise((res) => {
        const s = document.createElement('script');
        s.src = jsFile + '?v=' + Date.now();
        s.onload = res;
        s.onerror = res; // silently ignore missing scripts
        document.head.appendChild(s);
      });
      _scripts.add(page);
    }

    // Call page init
    const fn = window[PAGES[page].init];
    if (typeof fn === 'function') await fn();

  } catch(e) {
    c.innerHTML = `<div class="empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <h4>Erro ao carregar</h4><p>${e.message}</p>
    </div>`;
  }
}

function closeImgModal(e) {
  if (!e || e.target.id === 'imgModal') {
    document.getElementById('imgModal').classList.remove('open');
  }
}
function openImgModal(src) {
  document.getElementById('imgModalSrc').src = src;
  document.getElementById('imgModal').classList.add('open');
}