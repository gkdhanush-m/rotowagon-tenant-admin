/**
 * Tenant Admin Console Application Controller (RotoWagon Equipment)
 * Powered by PlatformStore, RBAC Security, FileVault, and Full-Spec QRCodeEngine
 */
(function (global) {
  'use strict';

  const LANDING_TEMPLATES = [
    { id: 'tpl1', layout: 'corporate', name: 'Executive Digital Suite', desc: 'Corporate executive profile with verified badge and all 6 interactive enterprise passes.', badge: 'Corporate' },
    { id: 'tpl2', layout: 'industrial', name: 'B2B Machinery Catalog', desc: 'Product showcase with category filter chips, spec highlights, and quotation form.', badge: 'B2B / OEM' },
    { id: 'tpl3', layout: 'exhibition', name: 'Exhibition Visual Pass', desc: 'High-contrast curved banner with inline scannable QR code for trade shows.', badge: 'Events' }
  ];

  const UI = {
    currentView: 'view-dashboard',
    kpiRange: '30d',
    activeLeadFilter: 'All',
    productWizardStep: 0,
    draftProduct: null,
    editingProductId: null,
    boothCount: 0
  };

  function db() { return global.PlatformStore.load(); }
  function esc(s) { return global.Security.escapeHTML(s); }

  let toastTimer = null;
  function showToast(msg) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    if (toastTimer) clearTimeout(toastTimer);
    c.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    c.appendChild(t);
    toastTimer = setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 250);
    }, 2200);
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const TenantAdminApp = {
    init: function () {
      TenantAdminApp.checkAccess();
      TenantAdminApp.applyThemeAndAccent();
      TenantAdminApp.updateSidebarBadges();

      if (window.innerWidth > 1024) {
        try {
          if (localStorage.getItem('admin_sidebar_collapsed') === '1') {
            const layout = document.getElementById('admin-layout') || document.querySelector('.admin-layout');
            if (layout) layout.classList.add('collapsed');
            document.body.classList.add('sidebar-collapsed');
            const topToggle = document.getElementById('btn-sidebar-toggle');
            if (topToggle) {
              topToggle.setAttribute('title', 'Expand sidebar');
              topToggle.setAttribute('aria-label', 'Expand sidebar');
              topToggle.classList.add('collapsed');
            }
          }
        } catch (e) {}
      }

      document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          const inp = document.getElementById('topbar-global-search');
          if (inp) inp.focus();
        }
      });

      // Render initial dashboard view
      TenantAdminApp.renderDashboard();
      TenantAdminApp.initBoothForm();

      // Subscribe to changes in PlatformStore
      global.PlatformStore.subscribe(function () {
        TenantAdminApp.checkAccess();
        TenantAdminApp.applyThemeAndAccent();
        TenantAdminApp.updateSidebarBadges();
        TenantAdminApp.renderActiveView();
      });

      // Close sidebar on mobile when clicking or tapping outside
      document.addEventListener('click', function (e) {
        const sidebar = document.getElementById('admin-sidebar');
        const hamburger = document.querySelector('.hamburger-btn');
        if (!sidebar || !sidebar.classList.contains('open')) return;
        if (!sidebar.contains(e.target) && (!hamburger || !hamburger.contains(e.target))) {
          TenantAdminApp.closeSidebar();
        }
      }, true);

      document.addEventListener('touchstart', function (e) {
        const sidebar = document.getElementById('admin-sidebar');
        const hamburger = document.querySelector('.hamburger-btn');
        if (!sidebar || !sidebar.classList.contains('open')) return;
        if (!sidebar.contains(e.target) && (!hamburger || !hamburger.contains(e.target))) {
          TenantAdminApp.closeSidebar();
        }
      }, { passive: true });
    },

    checkAccess: function () {
      const session = global.RBAC.getSession();
      const isAuthorized = session && (session.role === 'tenant_admin' || session.role === 'master_admin' || session.role === 'card_user');

      if (!isAuthorized) {
        window.location.replace('tenant-login.html');
        return false;
      }

      const meta = global.RBAC.getRoleMeta(session.role);
      const guard = document.getElementById('rbac-guard-overlay');
      if (guard) {
        guard.style.display = 'none';
      }

      // Update Top Nav and Sidebar User display
      const roleDot = document.getElementById('admin-role-dot');
      const roleLabel = document.getElementById('admin-role-label');
      const sideName = document.getElementById('sidebar-user-name');
      const sideRole = document.getElementById('sidebar-user-role');
      const sideAvatar = document.getElementById('sidebar-user-avatar');

      if (roleDot) roleDot.style.background = meta.color;
      if (roleLabel) roleLabel.textContent = meta.label;
      if (sideName) sideName.textContent = session.name || 'User';
      if (sideRole) sideRole.textContent = meta.label;
      if (sideAvatar) sideAvatar.textContent = (session.name || 'RS').split(' ').map(function(w){return w[0];}).join('').slice(0, 2).toUpperCase();
    },

    applyThemeAndAccent: function () {
      const store = db();
      const accent = store.enterpriseCard.accent || '#b8501e';
      document.documentElement.setAttribute('data-theme', store.uiTheme || 'light');
      document.documentElement.style.setProperty('--accent', accent);
      const clean = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#b8501e';
      const r = parseInt(clean.slice(1, 3), 16), g = parseInt(clean.slice(3, 5), 16), b = parseInt(clean.slice(5, 7), 16);
      document.documentElement.style.setProperty('--accent-rgb', r + ', ' + g + ', ' + b);
      document.documentElement.style.setProperty('--accent-light', 'rgba(' + r + ',' + g + ',' + b + ',0.12)');

      const topName = document.getElementById('top-brand-name');
      const topMark = document.getElementById('top-brand-mark');
      if (topName) topName.textContent = (store.enterpriseCard.company || 'RotoWagon').split(' ')[0];
      if (topMark) topMark.textContent = store.enterpriseCard.brandShort || 'RW';

      const tpTenantName = document.getElementById('tp-tenant-name');
      if (tpTenantName) tpTenantName.textContent = store.enterpriseCard.company || 'RotoWagon Equipment Pvt. Ltd.';
    },

    toggleTheme: function () {
      const store = db();
      const next = (store.uiTheme || 'light') === 'light' ? 'dark' : 'light';
      store.uiTheme = next;
      global.PlatformStore.save();
      TenantAdminApp.applyThemeAndAccent();
      showToast('Theme switched to ' + next + ' mode');
    },

    toggleSidebar: function () {
      const isMobile = window.innerWidth <= 1024;
      const sidebar = document.getElementById('admin-sidebar');
      const layout = document.getElementById('admin-layout') || document.querySelector('.admin-layout');
      const backdrop = document.getElementById('sidebar-backdrop');
      const topToggle = document.getElementById('btn-sidebar-toggle');
      if (!sidebar) return;

      if (isMobile) {
        const isOpen = sidebar.classList.contains('open');
        if (isOpen) {
          TenantAdminApp.closeSidebar();
        } else {
          sidebar.classList.add('open');
          document.body.classList.add('mobile-sidebar-open');
          if (topToggle) {
            topToggle.classList.add('is-open');
            topToggle.setAttribute('title', 'Close navigation menu');
            topToggle.setAttribute('aria-label', 'Close navigation menu');
          }
          if (backdrop) {
            backdrop.classList.add('open');
            backdrop.classList.add('active');
          }
        }
      } else {
        if (layout) {
          const isCollapsed = layout.classList.toggle('collapsed');
          document.body.classList.toggle('sidebar-collapsed', isCollapsed);
          const tip = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
          if (topToggle) {
            topToggle.setAttribute('title', tip);
            topToggle.setAttribute('aria-label', tip);
            topToggle.classList.toggle('collapsed', isCollapsed);
          }
          try {
            localStorage.setItem('admin_sidebar_collapsed', isCollapsed ? '1' : '0');
          } catch (e) {}
        }
      }
    },

    closeSidebar: function () {
      const sidebar = document.getElementById('admin-sidebar');
      const backdrop = document.getElementById('sidebar-backdrop');
      const topToggle = document.getElementById('btn-sidebar-toggle');
      if (sidebar) sidebar.classList.remove('open');
      document.body.classList.remove('mobile-sidebar-open');
      if (topToggle) {
        topToggle.classList.remove('is-open');
        topToggle.setAttribute('title', 'Open navigation menu');
        topToggle.setAttribute('aria-label', 'Open navigation menu');
      }
      if (backdrop) {
        backdrop.classList.remove('open');
        backdrop.classList.remove('active');
      }
    },

    showView: function (viewId) {
      UI.currentView = viewId;
      TenantAdminApp.closeSidebar();

      document.querySelectorAll('.view-section').forEach(function (s) {
        s.classList.remove('active');
        s.style.display = 'none';
      });

      const target = document.getElementById(viewId);
      if (target) {
        target.classList.add('active');
        target.style.display = 'block';
      }

      document.querySelectorAll('#tenant-sidebar-nav .sidebar-item').forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-view') === viewId);
      });

      TenantAdminApp.renderActiveView();
      const main = document.querySelector('.admin-main');
      if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
    },

    handleGlobalSearch: function (query) {
      const q = (query || '').trim().toLowerCase();
      if (!q) {
        TenantAdminApp.renderActiveView();
        return;
      }
      if (UI.currentView === 'view-products') {
        const rows = document.querySelectorAll('#products-table-body tr');
        rows.forEach(function (r) {
          const txt = r.textContent.toLowerCase();
          r.style.display = txt.includes(q) ? '' : 'none';
        });
      } else if (UI.currentView === 'view-leads') {
        const rows = document.querySelectorAll('#leads-table-body tr');
        rows.forEach(function (r) {
          const txt = r.textContent.toLowerCase();
          r.style.display = txt.includes(q) ? '' : 'none';
        });
      } else if (UI.currentView === 'view-categories') {
        const cards = document.querySelectorAll('#categories-grid-container .category-card');
        cards.forEach(function (c) {
          const txt = c.textContent.toLowerCase();
          c.style.display = txt.includes(q) ? '' : 'none';
        });
      } else if (UI.currentView === 'view-events') {
        const cards = document.querySelectorAll('#events-list-container .event-card');
        cards.forEach(function (c) {
          const txt = c.textContent.toLowerCase();
          c.style.display = txt.includes(q) ? '' : 'none';
        });
      }
    },

    renderActiveView: function () {
      switch (UI.currentView) {
        case 'view-dashboard':
          TenantAdminApp.renderDashboard();
          break;
        case 'view-company':
          TenantAdminApp.renderCompanyProfile();
          break;
        case 'view-products':
          TenantAdminApp.renderProducts();
          break;
        case 'view-categories':
          TenantAdminApp.renderCategories();
          break;
        case 'view-catalogues':
          TenantAdminApp.renderCatalogues();
          break;
        case 'view-events':
          TenantAdminApp.renderEvents();
          break;
        case 'view-qr':
          TenantAdminApp.renderQRCodes();
          break;
        case 'view-templates':
          TenantAdminApp.renderLandingTemplates();
          break;
        case 'view-leads':
          TenantAdminApp.renderLeads();
          break;
        case 'view-analytics':
          TenantAdminApp.renderAnalytics();
          break;
        case 'view-tenant-permissions':
          TenantAdminApp.renderTenantPermissions();
          break;
      }
    },

    updateSidebarBadges: function () {
      const store = db();
      const set = function (id, val) { const el = document.getElementById(id); if (el) el.textContent = String(val); };
      set('badge-products', (store.products || []).length);
      set('badge-catalogues', (store.catalogues || []).length);
      set('badge-events', (store.events || []).length);
      set('badge-qr', (store.qrCodes || []).length);
      set('badge-leads', (store.leads || []).length);
    },

    setTimeRange: function (range) {
      UI.kpiRange = range;
      document.querySelectorAll('.range-group .range-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-range') === range);
      });
      TenantAdminApp.renderDashboard();
      showToast('Dashboard metrics filtered: ' + range);
    },

    // ------------------------------------------------------------------------
    // VIEW 1: DASHBOARD
    // ------------------------------------------------------------------------
    renderDashboard: function () {
      const store = db();
      const kpisEl = document.getElementById('dashboard-kpis');
      if (!kpisEl) return;

      const leadsCount = (store.leads || []).length;
      const prodsCount = (store.products || []).filter(function(p){ return p.status === 'Active'; }).length;
      const catsCount = (store.categories || []).length;
      const scansEst = leadsCount * 14 + 182;

      let leadsMetric = leadsCount;
      let scansMetric = scansEst;
      let leadsTrend = '+18%';
      let scansTrend = '+32%';
      let leadsSub = 'Commercial buyer leads captured';
      let scansSub = 'Camera & QR engagement';

      if (UI.kpiRange === '7d') {
        leadsMetric = Math.max(1, Math.round(leadsCount * 0.35));
        scansMetric = Math.max(12, Math.round(scansEst * 0.28));
        leadsTrend = '+12% this week';
        scansTrend = '+19% this week';
        leadsSub = 'Leads captured in last 7 days';
        scansSub = 'Scans in last 7 days';
      } else if (UI.kpiRange === '90d') {
        leadsMetric = Math.round(leadsCount * 2.85);
        scansMetric = Math.round(scansEst * 2.75);
        leadsTrend = '+44% this quarter';
        scansTrend = '+52% this quarter';
        leadsSub = 'Quarterly leads pipeline';
        scansSub = '90-day scan volume';
      } else {
        leadsMetric = leadsCount;
        scansMetric = scansEst;
        leadsTrend = '+18% this month';
        scansTrend = '+32% this month';
        leadsSub = 'Commercial buyer leads (30d)';
        scansSub = 'Camera & QR engagement (30d)';
      }
      const conversionRate = ((leadsMetric / Math.max(scansMetric, 1)) * 100).toFixed(1);

      kpisEl.innerHTML = `
        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">Active Machines</span>
            <span class="kpi-trend up">+2</span>
          </div>
          <div class="kpi-val">${prodsCount}</div>
          <div class="kpi-sub">Across ${catsCount} equipment categories</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">Inquiries &amp; Leads</span>
            <span class="kpi-trend up">${leadsTrend}</span>
          </div>
          <div class="kpi-val">${leadsMetric}</div>
          <div class="kpi-sub">${leadsSub}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">vCard Scans</span>
            <span class="kpi-trend up">${scansTrend}</span>
          </div>
          <div class="kpi-val">${scansMetric}</div>
          <div class="kpi-sub">${scansSub}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">Conversion Rate</span>
            <span class="kpi-trend up">+4.2%</span>
          </div>
          <div class="kpi-val">${conversionRate}%</div>
          <div class="kpi-sub">Scan to inquiry ratio</div>
        </div>
      `;

      // Recent leads table
      const recentEl = document.getElementById('dashboard-recent-leads');
      if (recentEl) {
        const top5 = (store.leads || []).slice(0, 5);
        if (top5.length === 0) {
          recentEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-soft);">No inquiries captured yet.</div>';
        } else {
          let h = '<table class="data-table"><thead><tr><th>Customer</th><th>Product</th><th>Status</th></tr></thead><tbody>';
          top5.forEach(function (l) {
            h += `<tr>
              <td><strong style="font-size:13.5px;color:var(--text-main);">${esc(l.customer)}</strong><br><span style="font-size:12px;color:var(--text-soft);display:inline-block;margin-top:2px;">${esc(l.company || 'Direct')}</span></td>
              <td style="font-size:13px;color:var(--text-main);">${esc(l.product || 'General')}</td>
              <td><span class="badge ${l.status==='Won'?'badge-won':l.status==='Qualified'?'badge-qualified':'badge-active'}" style="font-size:12px;padding:4px 10px;">${esc(l.status)}</span></td>
            </tr>`;
          });
          h += '</tbody></table>';
          recentEl.innerHTML = h;
        }
      }

      // Products peek
      const prodPeekEl = document.getElementById('dashboard-products-peek');
      if (prodPeekEl) {
        const prods = (store.products || []).slice(0, 4);
        let ph = '<div style="display:flex;flex-direction:column;gap:10px;">';
        prods.forEach(function (p) {
          ph += `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg-card);border-radius:10px;border:1px solid var(--border);">
            <div><strong style="font-size:14px;color:var(--text-main);">${esc(p.name)}</strong><br><span style="font-size:12px;color:var(--text-soft);display:inline-block;margin-top:2px;">${esc(p.code)} &middot; ${esc(p.category)}</span></div>
            <span class="badge ${p.status==='Active'?'badge-active':'badge-draft'}" style="font-size:12px;padding:4px 10px;">${esc(p.status)}</span>
          </div>`;
        });
        ph += '</div>';
        prodPeekEl.innerHTML = ph;
      }
    },

    // ------------------------------------------------------------------------
    // VIEW 2: COMPANY PROFILE
    // ------------------------------------------------------------------------
    renderCompanyProfile: function () {
      const store = db();
      const card = store.enterpriseCard || {};
      const set = function (id, v) { const el = document.getElementById(id); if (el) el.value = v || ''; };

      set('cmp-name', card.company);
      set('cmp-short', card.brandShort || 'RW');
      set('cmp-rep-name', card.name);
      set('cmp-rep-role', card.role);
      set('cmp-email', card.email);
      set('cmp-phone', card.phone);
      set('cmp-wa', card.whatsapp);
      set('cmp-web', card.website);
      set('cmp-tagline', card.tagline);
      set('cmp-location', card.location);
      set('cmp-accent', card.accent || '#b8501e');
      set('cmp-accent-hex', card.accent || '#b8501e');
    },

    saveCompanyProfile: function (e) {
      e.preventDefault();
      const get = function (id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
      const updates = {
        company: get('cmp-name'),
        brandShort: get('cmp-short') || 'RW',
        name: get('cmp-rep-name'),
        role: get('cmp-rep-role'),
        email: get('cmp-email'),
        phone: get('cmp-phone'),
        whatsapp: get('cmp-wa'),
        website: get('cmp-web'),
        tagline: get('cmp-tagline'),
        location: get('cmp-location'),
        accent: get('cmp-accent-hex') || '#b8501e'
      };

      global.PlatformStore.updateCompany(updates);
      TenantAdminApp.applyThemeAndAccent();
      showToast('Company profile & branding saved successfully!');
    },

    // ------------------------------------------------------------------------
    // VIEW 3: PRODUCTS & CATALOG + 5-STEP WIZARD
    // ------------------------------------------------------------------------
    renderProducts: function () {
      const store = db();
      const tbody = document.getElementById('products-table-body');
      if (!tbody) return;

      const prods = store.products || [];
      if (prods.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-soft);">No equipment listed. Click "+ Add New Product" to launch the wizard.</td></tr>';
        return;
      }

      let h = '';
      prods.forEach(function (p) {
        const specsText = (p.specs || []).map(function (s) { return s.k + ': ' + s.v; }).join(' &middot; ') || 'Standard specs';
        h += `<tr>
          <td>
            <strong>${esc(p.name)}</strong><br>
            <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-soft);">${esc(p.code)}</span>
          </td>
          <td>${esc(p.category || 'General')}</td>
          <td><span class="badge ${p.status==='Active'?'badge-active':'badge-draft'}">${esc(p.status)}</span></td>
          <td style="font-size:12px;color:var(--text-muted);max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(specsText)}</td>
          <td style="text-align:right;">
            <button class="btn-secondary-sm" onclick="TenantAdminApp.editProduct('${esc(p.id)}')" style="margin-right:6px;">Edit</button>
            <button class="btn-secondary-sm" onclick="TenantAdminApp.deleteProduct('${esc(p.id)}')" style="color:#ef4444;">Delete</button>
          </td>
        </tr>`;
      });
      tbody.innerHTML = h;
    },

    startProductWizard: function (editId) {
      UI.editingProductId = editId || null;
      UI.productWizardStep = 0;

      const store = db();
      if (editId) {
        const found = store.products.find(function (p) { return p.id === editId; });
        UI.draftProduct = JSON.parse(JSON.stringify(found || {}));
      } else {
        UI.draftProduct = {
          name: '',
          code: 'RW-' + Math.floor(100 + Math.random() * 900),
          category: (store.categories && store.categories[0] && store.categories[0].name) || 'Ovens',
          brand: 'RotoWagon',
          tagline: '',
          sku: '',
          qtyUnit: 'Unit',
          qtyMin: 1,
          qtyMax: 10,
          status: 'Active',
          specs: [
            { k: 'Capacity', v: 'Standard' },
            { k: 'Power', v: '415V, 3-Phase' }
          ]
        };
      }

      // Populate Categories select
      const catSelect = document.getElementById('pw-cat');
      if (catSelect) {
        catSelect.innerHTML = (store.categories || []).map(function (c) {
          return `<option value="${esc(c.name)}">${esc(c.name)}</option>`;
        }).join('');
      }

      // Show wizard view
      document.querySelectorAll('.view-section').forEach(function (s) { s.style.display = 'none'; });
      const pwView = document.getElementById('product-wizard-view');
      if (pwView) pwView.style.display = 'block';

      TenantAdminApp.loadDraftIntoStep();
      TenantAdminApp.updateWizardStepUI();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    loadDraftIntoStep: function () {
      const d = UI.draftProduct;
      const set = function (id, v) { const el = document.getElementById(id); if (el) el.value = v !== undefined ? v : ''; };
      set('pw-name', d.name);
      set('pw-code', d.code);
      set('pw-cat', d.category);
      set('pw-brand', d.brand || 'RotoWagon');
      set('pw-tagline', d.tagline);
      set('pw-sku', d.sku);
      set('pw-unit', d.qtyUnit || 'Unit');
      set('pw-min', d.qtyMin || 1);
      set('pw-max', d.qtyMax || 10);
      set('pw-status', d.status || 'Active');

      // Build spec builder list
      const specList = document.getElementById('spec-builder-list');
      if (specList) {
        specList.innerHTML = '';
        (d.specs || []).forEach(function (s) {
          TenantAdminApp.addSpecRow(s.k, s.v);
        });
        if (!d.specs || d.specs.length === 0) {
          TenantAdminApp.addSpecRow('Capacity', '');
        }
      }
    },

    saveStepIntoDraft: function () {
      const d = UI.draftProduct;
      const get = function (id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
      if (UI.productWizardStep === 0) {
        d.name = get('pw-name');
        d.code = get('pw-code');
        d.category = get('pw-cat');
        d.brand = get('pw-brand');
        d.tagline = get('pw-tagline');
      } else if (UI.productWizardStep === 1) {
        d.sku = get('pw-sku');
        d.qtyUnit = get('pw-unit') || 'Unit';
        d.qtyMin = parseInt(get('pw-min'), 10) || 1;
        d.qtyMax = parseInt(get('pw-max'), 10) || 10;
      } else if (UI.productWizardStep === 2) {
        const rows = document.querySelectorAll('#spec-builder-list .spec-input-row');
        d.specs = [];
        rows.forEach(function (r) {
          const k = r.querySelector('.spec-k').value.trim();
          const v = r.querySelector('.spec-v').value.trim();
          if (k || v) d.specs.push({ k: k, v: v });
        });
      } else if (UI.productWizardStep === 3) {
        d.status = get('pw-status');
      }
    },

    updateWizardStepUI: function () {
      const step = UI.productWizardStep;
      const nodes = document.querySelectorAll('.wizard-step-node');
      nodes.forEach(function (n, idx) {
        n.classList.toggle('active', idx === step);
        n.classList.toggle('completed', idx < step);
      });

      const bodies = document.querySelectorAll('#product-wizard .wizard-step-body');
      bodies.forEach(function (b, idx) {
        b.classList.toggle('active', idx === step);
        b.style.display = idx === step ? 'block' : 'none';
      });

      const btnBack = document.getElementById('pw-btn-back');
      const btnNext = document.getElementById('pw-btn-next');
      const btnPublish = document.getElementById('pw-btn-publish');
      const errBox = document.getElementById('pw-error-banner');
      if (errBox) errBox.style.display = 'none';

      if (btnBack) btnBack.style.visibility = step === 0 ? 'hidden' : 'visible';
      if (btnNext) btnNext.style.display = step === 4 ? 'none' : 'inline-flex';
      if (btnPublish) btnPublish.style.display = step === 4 ? 'inline-flex' : 'none';

      if (step === 4) {
        TenantAdminApp.renderProductReview();
      }
    },

    nextProductWizardStep: function () {
      const errBox = document.getElementById('pw-error-banner');
      if (errBox) errBox.style.display = 'none';

      if (UI.productWizardStep === 0) {
        const name = (document.getElementById('pw-name').value || '').trim();
        const code = (document.getElementById('pw-code').value || '').trim();
        if (!name || !code) {
          if (errBox) {
            errBox.textContent = 'Please provide both Machine Name and Model Code to proceed.';
            errBox.style.display = 'block';
          }
          return;
        }
      }

      TenantAdminApp.saveStepIntoDraft();
      if (UI.productWizardStep < 4) {
        UI.productWizardStep++;
        TenantAdminApp.updateWizardStepUI();
      }
    },

    prevProductWizardStep: function () {
      TenantAdminApp.saveStepIntoDraft();
      if (UI.productWizardStep > 0) {
        UI.productWizardStep--;
        TenantAdminApp.updateWizardStepUI();
      }
    },

    addSpecRow: function (k, v) {
      const list = document.getElementById('spec-builder-list');
      if (!list) return;
      const row = document.createElement('div');
      row.className = 'spec-input-row';
      row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
      row.innerHTML = `
        <input class="form-control spec-k" type="text" placeholder="Spec Key (e.g. Capacity)" value="${esc(k || '')}" style="flex:1;">
        <input class="form-control spec-v" type="text" placeholder="Value (e.g. 16 Trays)" value="${esc(v || '')}" style="flex:1;">
        <button type="button" class="btn-secondary-sm" onclick="this.parentElement.remove()" style="color:#ef4444;">&times;</button>
      `;
      list.appendChild(row);
    },

    renderProductReview: function () {
      const rev = document.getElementById('product-review-summary');
      if (!rev) return;
      TenantAdminApp.saveStepIntoDraft();
      const d = UI.draftProduct;

      let sh = '<div style="background:var(--bg-card);padding:16px;border-radius:10px;border:1px solid var(--border);">';
      sh += `<h4 style="margin-bottom:8px;font-size:16px;font-weight:700;">${esc(d.name)} (${esc(d.code)})</h4>`;
      sh += `<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Category: <strong>${esc(d.category)}</strong> &middot; Status: <strong>${esc(d.status)}</strong></div>`;
      if (d.specs && d.specs.length > 0) {
        sh += '<div style="font-size:12px;font-weight:600;margin-bottom:6px;">Technical Specs:</div><ul style="padding-left:18px;font-size:12px;color:var(--text-muted);margin:0;">';
        d.specs.forEach(function (s) { sh += `<li>${esc(s.k)}: ${esc(s.v)}</li>`; });
        sh += '</ul>';
      }
      sh += '</div>';
      rev.innerHTML = sh;
    },

    publishDraftProduct: function () {
      TenantAdminApp.saveStepIntoDraft();
      const d = UI.draftProduct;
      if (!d.name || !d.code) {
        showToast('Error: Product Name and Code are required.');
        return;
      }

      if (UI.editingProductId) {
        global.PlatformStore.updateProduct(UI.editingProductId, d);
        showToast('Product ' + d.name + ' updated successfully!');
      } else {
        global.PlatformStore.addProduct(d);
        showToast('Product ' + d.name + ' published to catalog!');
      }

      TenantAdminApp.showView('view-products');
    },

    editProduct: function (id) {
      TenantAdminApp.startProductWizard(id);
    },

    deleteProduct: function (id) {
      if (confirm('Are you sure you want to remove this product from the catalog?')) {
        global.PlatformStore.deleteProduct(id);
        TenantAdminApp.renderProducts();
        TenantAdminApp.updateSidebarBadges();
        showToast('Product deleted.');
      }
    },

    // ------------------------------------------------------------------------
    // VIEW 4: CATEGORIES
    // ------------------------------------------------------------------------
    renderCategories: function () {
      const store = db();
      const grid = document.getElementById('categories-grid');
      if (!grid) return;

      const cats = store.categories || [];
      let h = '';
      cats.forEach(function (c) {
        const count = (store.products || []).filter(function (p) { return p.category === c.name; }).length;
        h += `<div class="admin-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <h3 style="font-size:16px;font-weight:700;">${esc(c.name)}</h3>
            <span class="badge badge-active">${count} items</span>
          </div>
          <p style="font-size:13px;color:var(--text-muted);min-height:38px;margin-bottom:12px;">${esc(c.desc || 'Equipment line')}</p>
          <div style="display:flex;justify-content:flex-end;gap:8px;">
            <button class="btn-secondary-sm" onclick="TenantAdminApp.deleteCategory('${esc(c.id || c.name)}')" style="color:#ef4444;">Delete</button>
          </div>
        </div>`;
      });
      grid.innerHTML = h;
    },

    openCategoryModal: function () {
      document.getElementById('cat-name-inp').value = '';
      document.getElementById('cat-desc-inp').value = '';
      document.getElementById('modal-category').style.display = 'flex';
    },

    saveCategory: function (e) {
      e.preventDefault();
      const name = document.getElementById('cat-name-inp').value.trim();
      const desc = document.getElementById('cat-desc-inp').value.trim();
      if (!name) return;

      const store = db();
      if (!Array.isArray(store.categories)) store.categories = [];
      store.categories.push({ id: 'cat-' + Date.now(), name: name, desc: desc });
      global.PlatformStore.logAudit('Category Created', 'Added ' + name);
      global.PlatformStore.save();

      TenantAdminApp.closeModal('modal-category');
      TenantAdminApp.renderCategories();
      showToast('Category ' + name + ' created.');
    },

    deleteCategory: function (catId) {
      if (confirm('Delete this category?')) {
        const store = db();
        store.categories = (store.categories || []).filter(function (c) { return c.id !== catId && c.name !== catId; });
        global.PlatformStore.save();
        TenantAdminApp.renderCategories();
        showToast('Category removed.');
      }
    },

    // ------------------------------------------------------------------------
    // VIEW 5: CATALOGUES & BROCHURES (IndexedDB FileVault)
    // ------------------------------------------------------------------------
    renderCatalogues: function () {
      const store = db();
      const list = document.getElementById('catalogues-list');
      if (!list) return;

      const docs = store.catalogues || [];
      if (docs.length === 0) {
        list.innerHTML = '<div class="admin-card" style="text-align:center;padding:32px;color:var(--text-soft);">No catalogues uploaded yet. Click "+ Add Document" to upload a PDF brochure.</div>';
        return;
      }

      let h = '<div class="cards-auto-grid">';
      docs.forEach(function (d) {
        h += `<div class="admin-card">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <div style="width:40px;height:40px;border-radius:8px;background:var(--accent-light);color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:bold;">PDF</div>
            <div style="flex:1;overflow:hidden;">
              <strong style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${esc(d.title || d.name)}</strong>
              <span style="font-size:11px;color:var(--text-soft);">${esc(d.size || 'PDF Document')} &middot; ${esc(d.date || 'Active')}</span>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;">
            <button class="btn-secondary-sm" onclick="TenantAdminApp.downloadCatalogue('${esc(d.id)}')">Download</button>
            <button class="btn-secondary-sm" onclick="TenantAdminApp.deleteCatalogue('${esc(d.id)}')" style="color:#ef4444;">Delete</button>
          </div>
        </div>`;
      });
      h += '</div>';
      list.innerHTML = h;
    },

    openCatalogueModal: function () {
      document.getElementById('doc-name-inp').value = '';
      document.getElementById('doc-url-inp').value = '';
      document.getElementById('doc-pages-inp').value = '';
      const dropTitle = document.getElementById('doc-dropzone-title');
      if (dropTitle) dropTitle.textContent = 'Click to choose a file from your device';
      document.getElementById('modal-catalogue').style.display = 'flex';
    },

    handleCatalogueFilePick: function (inp) {
      if (inp.files && inp.files[0]) {
        const file = inp.files[0];
        const titleInp = document.getElementById('doc-name-inp');
        if (titleInp && !titleInp.value) {
          titleInp.value = file.name.replace(/\.[^/.]+$/, '');
        }
        const dropTitle = document.getElementById('doc-dropzone-title');
        if (dropTitle) {
          dropTitle.textContent = 'Selected: ' + file.name + ' (' + global.FileVault.formatSize(file.size) + ')';
        }
      }
    },

    saveCatalogue: function (e) {
      e.preventDefault();
      const title = document.getElementById('doc-name-inp').value.trim();
      const extUrl = document.getElementById('doc-url-inp').value.trim();
      const notes = document.getElementById('doc-pages-inp').value.trim();
      const fileInp = document.getElementById('doc-file-inp');
      const file = fileInp && fileInp.files && fileInp.files[0];

      if (!title) return;

      const store = db();
      if (!Array.isArray(store.catalogues)) store.catalogues = [];

      const docId = 'doc-' + Date.now();
      const entry = {
        id: docId,
        title: title,
        name: title,
        url: extUrl || '#',
        size: file ? global.FileVault.formatSize(file.size) : 'Online Document',
        date: global.Security.formatDateShort(),
        notes: notes
      };

      if (file && global.FileVault) {
        global.FileVault.saveFile(docId, file).then(function () {
          store.catalogues.unshift(entry);
          global.PlatformStore.logAudit('Catalogue Uploaded', 'Stored ' + title + ' in local FileVault');
          global.PlatformStore.save();
          TenantAdminApp.closeModal('modal-catalogue');
          TenantAdminApp.renderCatalogues();
          TenantAdminApp.updateSidebarBadges();
          showToast('Catalogue brochure uploaded securely!');
        }).catch(function (err) {
          console.error(err);
          store.catalogues.unshift(entry);
          global.PlatformStore.save();
          TenantAdminApp.closeModal('modal-catalogue');
          TenantAdminApp.renderCatalogues();
          showToast('Catalogue metadata saved.');
        });
      } else {
        store.catalogues.unshift(entry);
        global.PlatformStore.save();
        TenantAdminApp.closeModal('modal-catalogue');
        TenantAdminApp.renderCatalogues();
        TenantAdminApp.updateSidebarBadges();
        showToast('Catalogue brochure saved.');
      }
    },

    downloadCatalogue: function (docId) {
      if (global.FileVault) {
        global.FileVault.getFile(docId).then(function (rec) {
          if (rec && rec.blob) {
            const url = URL.createObjectURL(rec.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = rec.name || 'Catalogue.pdf';
            a.click();
            URL.revokeObjectURL(url);
            showToast('Downloading ' + rec.name);
          } else {
            showToast('Document not found in local vault.');
          }
        }).catch(function () {
          showToast('Unable to open file vault.');
        });
      }
    },

    deleteCatalogue: function (docId) {
      if (confirm('Delete this catalogue?')) {
        const store = db();
        store.catalogues = (store.catalogues || []).filter(function (d) { return d.id !== docId; });
        if (global.FileVault) global.FileVault.deleteFile(docId);
        global.PlatformStore.save();
        TenantAdminApp.renderCatalogues();
        TenantAdminApp.updateSidebarBadges();
        showToast('Catalogue deleted.');
      }
    },

    // ------------------------------------------------------------------------
    // VIEW 6: EVENTS & CAMPAIGNS
    // ------------------------------------------------------------------------
    renderEvents: function () {
      const store = db();
      const container = document.getElementById('events-list');
      if (!container) return;

      const events = store.events || [];
      if (events.length === 0) {
        container.innerHTML = `
          <div class="empty-state-box" style="text-align:center;padding:48px 24px;background:var(--bg-card);border:1px dashed var(--border);border-radius:12px;">
            <div style="width:48px;height:48px;margin:0 auto 16px;border-radius:50%;background:var(--accent-light);display:flex;align-items:center;justify-content:center;color:var(--accent);">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:6px;">No Exhibition Events Configured</h3>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;max-width:420px;margin-left:auto;margin-right:auto;">Create and launch targeted trade show campaigns, set up booth lead forms, and track real-time exhibition engagement.</p>
            <button class="btn-primary" onclick="TenantAdminApp.openAddEventModal()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Create First Event</span>
            </button>
          </div>
        `;
        return;
      }

      let h = '<div class="cards-auto-grid">';
      events.forEach(function (ev) {
        const leadCount = ev.leadsCaptured !== undefined ? ev.leadsCaptured : (ev.leads || 0);
        const venue = ev.venue || ev.location || 'Trade Center';
        const dateStr = ev.dates || ev.date || 'Upcoming 2026';
        const boothStr = ev.booth || 'Main Pavilion';
        const status = ev.status || 'Active';

        h += `<div class="admin-card" style="display:flex;flex-direction:column;justify-content:space-between;">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
              <h3 style="font-size:16px;font-weight:700;line-height:1.3;">${esc(ev.name)}</h3>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <span class="badge ${status === 'Active' ? 'badge-active' : 'badge-draft'}">${esc(status)}</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--text-muted);margin-bottom:8px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>${esc(venue)} &middot; ${esc(dateStr)}</span>
            </div>
            <div style="font-size:12px;color:var(--text-soft);margin-bottom:10px;padding:8px 12px;background:var(--bg-main);border-radius:6px;border:1px solid var(--border);">
              Booth: <strong style="color:var(--text);">${esc(boothStr)}</strong> &middot; Leads Captured: <strong style="color:var(--accent);">${esc(leadCount)}</strong>
            </div>
            ${ev.description ? `<p style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:14px;">${esc(ev.description)}</p>` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">
            <button class="btn-secondary-sm" style="flex:1;" onclick="TenantAdminApp.showView('view-exhibition')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              Open Booth Kiosk
            </button>
            <button class="btn-icon" style="color:var(--danger, #dc2626);border-color:var(--border);" title="Delete Event" onclick="TenantAdminApp.deleteEvent('${esc(ev.id)}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>`;
      });
      h += '</div>';
      container.innerHTML = h;
    },

    openAddEventModal: function () {
      const form = document.querySelector('#modal-add-event form');
      if (form) form.reset();
      const modal = document.getElementById('modal-add-event');
      if (modal) modal.style.display = 'flex';
      setTimeout(function () {
        const firstInput = document.getElementById('ev-name-inp');
        if (firstInput) firstInput.focus();
      }, 50);
    },

    saveEvent: function (e) {
      if (e && e.preventDefault) e.preventDefault();
      const name = (document.getElementById('ev-name-inp')?.value || '').trim();
      const type = (document.getElementById('ev-type-inp')?.value || 'Trade Exhibition').trim();
      const dates = (document.getElementById('ev-dates-inp')?.value || '').trim();
      const venue = (document.getElementById('ev-venue-inp')?.value || '').trim();
      const booth = (document.getElementById('ev-booth-inp')?.value || '').trim();
      const desc = (document.getElementById('ev-desc-inp')?.value || '').trim();

      if (!name) {
        showToast('Please enter the event name');
        return;
      }
      if (!dates) {
        showToast('Please enter event dates');
        return;
      }
      if (!venue) {
        showToast('Please enter the venue/location');
        return;
      }

      global.PlatformStore.addEvent({
        name: name,
        type: type,
        dates: dates,
        date: dates,
        venue: venue,
        location: venue,
        booth: booth || 'Main Pavilion',
        description: desc,
        status: 'Active',
        leads: 0,
        leadsCaptured: 0
      });

      TenantAdminApp.closeModal('modal-add-event');
      TenantAdminApp.renderEvents();
      TenantAdminApp.updateSidebarBadges();
      showToast('Event "' + name + '" created successfully!');
    },

    deleteEvent: function (id) {
      if (!id) return;
      if (!confirm('Are you sure you want to delete this exhibition event?')) return;
      global.PlatformStore.deleteEvent(id);
      TenantAdminApp.renderEvents();
      TenantAdminApp.updateSidebarBadges();
      showToast('Event deleted successfully');
    },

    // ------------------------------------------------------------------------
    // VIEW 7: QR CODES STUDIO
    // ------------------------------------------------------------------------
    renderQRCodes: function () {
      const store = db();
      const grid = document.getElementById('qr-codes-grid');
      if (!grid) return;

      const origin = window.location.origin || 'https://rotowagon.com';
      const items = [
        { title: 'Public Visiting Card & Catalog', text: origin + '/index.html', desc: 'Direct scan to interactive 1:1 machinery card' },
        { title: 'Direct Contact vCard Save', text: 'BEGIN:VCARD\nVERSION:3.0\nN:Sharma;Rajesh;;;\nFN:Rajesh Sharma\nORG:RotoWagon Equipment Pvt. Ltd.\nTEL:+912266889900\nEMAIL:sales@rotowagon.com\nEND:VCARD', desc: 'Direct camera scan saves executive contact to phonebook' },
        { title: 'Exhibition Booth Lead QR', text: origin + '/index.html#enquiry-card', desc: 'Pre-fills inquiry form directly with product selector' },
        { title: '2026 Commercial Machinery Catalog', text: origin + '/index.html#catalog', desc: 'Direct link to PDF brochure downloads' }
      ];

      let h = '';
      items.forEach(function (item, idx) {
        const svg = global.QRCodeEngine.generateSVG(item.text, 140, 2, store.enterpriseCard.accent || '#b8501e');
        h += `<div class="admin-card" style="text-align:center;">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:6px;">${esc(item.title)}</h3>
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">${esc(item.desc)}</p>
          <div style="display:inline-flex;padding:12px;background:#ffffff;border-radius:10px;border:1px solid var(--border);margin-bottom:14px;">
            ${svg}
          </div>
          <div style="display:flex;gap:8px;justify-content:center;">
            <button class="btn-primary" onclick="TenantAdminApp.downloadQRSVG('${esc(item.title)}', '${encodeURIComponent(item.text)}')">Download SVG</button>
            <button class="btn-secondary" onclick="TenantAdminApp.previewQR('${esc(item.title)}', '${encodeURIComponent(item.text)}')">Preview</button>
          </div>
        </div>`;
      });
      grid.innerHTML = h;
    },

    downloadQRSVG: function (title, encodedText) {
      const store = db();
      const text = decodeURIComponent(encodedText);
      const svg = global.QRCodeEngine.generateSVG(text, 500, 3, store.enterpriseCard.accent || '#b8501e');
      downloadFile(title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-qr.svg', svg, 'image/svg+xml');
      showToast('Downloaded ' + title + ' (High-Res SVG)');
    },

    previewQR: function (title, encodedText) {
      const store = db();
      const text = decodeURIComponent(encodedText);
      const modal = document.getElementById('qr-preview-modal');
      const titleEl = document.getElementById('qr-modal-title');
      const box = document.getElementById('qr-modal-svg-box');
      const dlBtn = document.getElementById('qr-modal-dl-btn');

      if (titleEl) titleEl.textContent = title;
      if (box) box.innerHTML = global.QRCodeEngine.generateSVG(text, 260, 2, store.enterpriseCard.accent || '#b8501e');
      if (dlBtn) dlBtn.onclick = function () { TenantAdminApp.downloadQRSVG(title, encodedText); };
      if (modal) modal.style.display = 'flex';
    },

    // ------------------------------------------------------------------------
    // VIEW 8: LANDING TEMPLATES
    // ------------------------------------------------------------------------
    renderLandingTemplates: function () {
      const store = db();
      const grid = document.getElementById('landing-templates-grid');
      if (!grid) return;

      const activeTpl = store.activeLandingTemplate || 'tpl2';
      let h = '';
      LANDING_TEMPLATES.forEach(function (tpl) {
        const isSel = tpl.id === activeTpl;
        h += `<div class="admin-card" style="border:2px solid ${isSel?'var(--accent)':'var(--border)'};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <h3 style="font-size:16px;font-weight:700;">${esc(tpl.name)}</h3>
            <span class="badge ${isSel?'badge-active':'badge-draft'}">${isSel?'Active Default':esc(tpl.badge)}</span>
          </div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;min-height:36px;">${esc(tpl.desc)}</p>
          <button class="btn-${isSel?'primary':'secondary'}" onclick="TenantAdminApp.selectTemplate('${esc(tpl.id)}')">
            ${isSel?'Active Template':'Activate Template'}
          </button>
        </div>`;
      });
      grid.innerHTML = h;
    },

    selectTemplate: function (tplId) {
      const store = db();
      store.activeLandingTemplate = tplId;
      global.PlatformStore.save();
      TenantAdminApp.renderLandingTemplates();
      showToast('Activated layout template ' + tplId);
    },

    // ------------------------------------------------------------------------
    // VIEW 9: LEADS CRM
    // ------------------------------------------------------------------------
    renderLeads: function () {
      const store = db();
      const tbody = document.getElementById('leads-table-body');
      if (!tbody) return;

      let list = store.leads || [];
      const search = (document.getElementById('crm-search') ? document.getElementById('crm-search').value : '').toLowerCase().trim();

      if (UI.activeLeadFilter !== 'All') {
        list = list.filter(function (l) { return l.status === UI.activeLeadFilter; });
      }

      if (search) {
        list = list.filter(function (l) {
          return (l.customer && l.customer.toLowerCase().includes(search)) ||
                 (l.company && l.company.toLowerCase().includes(search)) ||
                 (l.phone && l.phone.includes(search)) ||
                 (l.product && l.product.toLowerCase().includes(search));
        });
      }

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-soft);">No inquiries matching the selected filter.</td></tr>';
        return;
      }

      let h = '';
      list.forEach(function (l) {
        h += `<tr>
          <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-soft);">${esc(l.id)}</td>
          <td>
            <strong>${esc(l.customer)}</strong><br>
            <span style="font-size:12px;color:var(--text-soft);">${esc(l.company || 'Individual')}</span>
          </td>
          <td>
            <a href="tel:${esc(l.phone)}" style="color:var(--accent);text-decoration:none;">${esc(l.phone)}</a><br>
            <span style="font-size:11px;color:var(--text-soft);">${esc(l.email || '')}</span>
          </td>
          <td>${esc(l.product || 'General Inquiry')}</td>
          <td>
            <select class="form-control" style="font-size:11px;padding:4px 8px;height:auto;" onchange="TenantAdminApp.updateLeadStatus('${esc(l.id)}', this.value)">
              <option ${l.status==='New'?'selected':''}>New</option>
              <option ${l.status==='Contacted'?'selected':''}>Contacted</option>
              <option ${l.status==='Qualified'?'selected':''}>Qualified</option>
              <option ${l.status==='Won'?'selected':''}>Won</option>
              <option ${l.status==='Lost'?'selected':''}>Lost</option>
            </select>
          </td>
          <td><span class="badge badge-active">${esc(l.score || 75)}/100</span></td>
          <td style="text-align:right;">
            <button class="btn-secondary-sm" onclick="TenantAdminApp.openLeadDetail('${esc(l.id)}')">Details &rarr;</button>
          </td>
        </tr>`;
      });
      tbody.innerHTML = h;
    },

    setLeadFilter: function (status) {
      UI.activeLeadFilter = status;
      document.querySelectorAll('#leads-status-filters .range-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-status') === status);
      });
      TenantAdminApp.renderLeads();
    },

    filterLeads: function () {
      TenantAdminApp.renderLeads();
    },

    updateLeadStatus: function (leadId, newStatus) {
      const store = db();
      const lead = (store.leads || []).find(function (l) { return l.id === leadId; });
      if (lead) {
        lead.status = newStatus;
        if (!Array.isArray(lead.timeline)) lead.timeline = [];
        lead.timeline.unshift({ time: global.Security.formatNow(), text: 'Status changed to ' + newStatus });
        global.PlatformStore.logAudit('Lead Status Changed', lead.customer + ' (' + leadId + ') -> ' + newStatus);
        global.PlatformStore.save();
        showToast('Lead ' + leadId + ' marked as ' + newStatus);
      }
    },

    openLeadDetail: function (leadId) {
      const store = db();
      const lead = (store.leads || []).find(function (l) { return l.id === leadId; });
      if (!lead) return;

      const body = document.getElementById('crm-drawer-body');
      const drawer = document.getElementById('crm-drawer');
      const backdrop = document.getElementById('drawer-backdrop');
      if (!body) return;

      let h = `
        <div style="margin-bottom:16px;">
          <h3 style="font-size:18px;font-weight:700;">${esc(lead.customer)}</h3>
          <div style="font-size:13px;color:var(--text-muted);">${esc(lead.company || '')} &middot; ${esc(lead.city || 'India')}</div>
        </div>
        <div class="admin-card" style="margin-bottom:16px;padding:14px;">
          <div style="font-size:12px;color:var(--text-soft);margin-bottom:4px;">Machine Interested</div>
          <div style="font-weight:700;font-size:15px;color:var(--accent);">${esc(lead.product || 'General')}</div>
          ${lead.quantity ? `<div style="font-size:12px;margin-top:4px;">Qty: <strong>${esc(lead.quantity)}</strong></div>` : ''}
        </div>
        <div class="admin-card" style="margin-bottom:16px;padding:14px;">
          <div style="font-size:12px;color:var(--text-soft);margin-bottom:4px;">Direct Contact</div>
          <div style="font-size:14px;margin-bottom:6px;">Phone: <a href="tel:${esc(lead.phone)}" style="color:var(--accent);font-weight:600;">${esc(lead.phone)}</a></div>
          ${lead.email ? `<div style="font-size:13px;">Email: <a href="mailto:${esc(lead.email)}" style="color:var(--accent);">${esc(lead.email)}</a></div>` : ''}
        </div>
        ${lead.notes ? `
          <div class="admin-card" style="margin-bottom:16px;padding:14px;">
            <div style="font-size:12px;color:var(--text-soft);margin-bottom:4px;">Customer Requirement / Notes</div>
            <div style="font-size:13px;line-height:1.5;">${esc(lead.notes)}</div>
          </div>
        ` : ''}
        <div>
          <h4 style="font-size:13px;font-weight:700;margin-bottom:10px;">Activity Timeline</h4>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;">
            ${(lead.timeline || []).map(function (t) {
              return `<div style="padding:8px 10px;background:var(--bg-card);border-radius:6px;border:1px solid var(--border);">
                <div style="color:var(--text-soft);font-size:11px;">${esc(t.time)}</div>
                <div>${esc(t.text)}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      `;

      body.innerHTML = h;
      if (drawer) drawer.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
    },

    closeLeadDrawer: function () {
      const drawer = document.getElementById('crm-drawer');
      const backdrop = document.getElementById('drawer-backdrop');
      if (drawer) drawer.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
    },

    exportLeadsCSV: function () {
      const store = db();
      const leads = store.leads || [];
      if (leads.length === 0) {
        showToast('No leads available to export.');
        return;
      }

      let csv = 'Lead ID,Date,Customer,Company,Phone,Email,Product,Quantity,Status,Score,Notes\n';
      leads.forEach(function (l) {
        csv += [
          global.Security.csvCell(l.id),
          global.Security.csvCell(l.date),
          global.Security.csvCell(l.customer),
          global.Security.csvCell(l.company),
          global.Security.csvCell(l.phone),
          global.Security.csvCell(l.email),
          global.Security.csvCell(l.product),
          global.Security.csvCell(l.quantity),
          global.Security.csvCell(l.status),
          global.Security.csvCell(l.score),
          global.Security.csvCell(l.notes)
        ].join(',') + '\n';
      });

      downloadFile('rotowagon-leads-' + new Date().toISOString().slice(0, 10) + '.csv', csv, 'text/csv;charset=utf-8;');
      showToast('Exported ' + leads.length + ' leads to CSV');
    },

    // ------------------------------------------------------------------------
    // VIEW 10: ANALYTICS
    // ------------------------------------------------------------------------
    renderAnalytics: function () {
      const store = db();
      const container = document.getElementById('analytics-container');
      if (!container) return;

      const prods = store.products || [];
      const leads = store.leads || [];

      let h = '<div class="dashboard-split-grid">';
      h += `<div class="admin-card">
        <h3 class="card-title" style="margin-bottom:14px;">Inquiries by Equipment Line</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">`;

      prods.forEach(function (p) {
        const count = leads.filter(function (l) { return l.product === p.name; }).length;
        const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
        h += `<div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span><strong>${esc(p.name)}</strong></span>
            <span>${count} inquiries (${pct}%)</span>
          </div>
          <div style="height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${Math.max(pct, 5)}%;background:var(--accent);border-radius:4px;"></div>
          </div>
        </div>`;
      });
      h += '</div></div>';

      h += `<div class="admin-card">
        <h3 class="card-title" style="margin-bottom:14px;">Lead Capture Channels</h3>
        <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;padding:10px;background:var(--bg-card);border-radius:8px;">
            <span>Mobile vCard Camera Scan</span>
            <strong>64%</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px;background:var(--bg-card);border-radius:8px;">
            <span>Trade Fair / Exhibition Booth</span>
            <strong>24%</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px;background:var(--bg-card);border-radius:8px;">
            <span>WhatsApp &amp; Direct Referral</span>
            <strong>12%</strong>
          </div>
        </div>
      </div>`;
      h += '</div>';

      container.innerHTML = h;
    },

    // ------------------------------------------------------------------------
    // VIEW 11: EXHIBITION BOOTH MODE
    // ------------------------------------------------------------------------
    initBoothForm: function () {
      const store = db();
      const sel = document.getElementById('bf-product');
      if (sel) {
        sel.innerHTML = '<option value="">-- Select Machine (Optional) --</option>' +
          (store.products || []).map(function (p) {
            return `<option value="${esc(p.name)}">${esc(p.name)} (${esc(p.code)})</option>`;
          }).join('');
      }
    },

    submitBoothLead: function (e) {
      e.preventDefault();
      const get = function (id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
      const name = get('bf-name');
      const phone = get('bf-phone');
      if (!name || !phone) return;

      const newLead = {
        customer: name,
        phone: phone,
        company: get('bf-company') || 'Trade Show Visitor',
        city: get('bf-city') || 'Exhibition Floor',
        product: get('bf-product') || 'General',
        notes: get('bf-notes'),
        source: 'Exhibition Booth Mode'
      };

      global.PlatformStore.addLead(newLead);
      TenantAdminApp.updateSidebarBadges();

      document.getElementById('booth-form').reset();
      showToast('Lead for ' + name + ' captured successfully!');
    },

    toggleFullscreen: function () {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function () {});
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    },

    // ------------------------------------------------------------------------
    // VIEW 12: TENANT PERMISSIONS
    // ------------------------------------------------------------------------
    renderTenantPermissions: function () {
      const container = document.getElementById('tenant-permissions-list');
      if (!container || !global.RBAC) return;

      const allPerms = global.RBAC.ALL_PERMISSIONS || [];
      const tenantPerms = new Set(global.RBAC.getRolePermissions('tenant_admin'));

      let h = '';
      allPerms.forEach(function (p) {
        const has = tenantPerms.has(p.id) || tenantPerms.has('*');
        h += `<div style="padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;display:flex;align-items:flex-start;gap:10px;">
          <div style="font-size:16px;line-height:1;margin-top:2px;color:${has?'#22c55e':'var(--text-soft)'};">${has?'✓':'✕'}</div>
          <div style="flex:1;">
            <strong style="font-size:13px;display:block;margin-bottom:2px;color:var(--text-main);">${esc(p.name)}</strong>
            <span style="font-size:11px;color:var(--text-soft);display:block;line-height:1.4;">${esc(p.desc)}</span>
            <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:var(--bg-input);margin-top:4px;display:inline-block;">${esc(p.module)}</span>
          </div>
        </div>`;
      });
      container.innerHTML = h;
    },

    // ------------------------------------------------------------------------
    // SESSION & AUTH
    // ------------------------------------------------------------------------
    switchRole: function (role) {
      const res = global.RBAC.switchQuickRole(role);
      if (res.ok) {
        TenantAdminApp.checkAccess();
        TenantAdminApp.closeModal('modal-admin-auth');
        showToast('Switched session to ' + global.RBAC.getRoleMeta(role).label);
        if (role === 'master_admin') {
          window.location.href = 'master-admin.html';
        } else if (role !== 'tenant_admin') {
          window.location.href = 'index.html';
        }
      }
    },

    signOut: function () {
      global.RBAC.logout();
      window.location.replace('login.html');
    },

    logout: function () {
      global.RBAC.logout();
      window.location.replace('tenant-login.html');
    },

    openAuthModal: function () {
      const s = global.RBAC.getSession();
      const meta = global.RBAC.getRoleMeta(s.role);
      const info = document.getElementById('admin-auth-info');
      if (info) {
        info.innerHTML = `<strong>Signed in as:</strong> ${esc(s.name)} (${esc(s.email)})<br><strong>Role:</strong> <span style="color:${meta.color};font-weight:bold;">${meta.label}</span> &middot; ${esc(s.tenant)}`;
      }
      document.getElementById('modal-admin-auth').style.display = 'flex';
    },

    closeModal: function (modalId) {
      const m = document.getElementById(modalId);
      if (m) m.style.display = 'none';
    }
  };

  global.TenantAdminApp = TenantAdminApp;
  window.addEventListener('DOMContentLoaded', TenantAdminApp.init);
})(typeof window !== 'undefined' ? window : globalThis);
