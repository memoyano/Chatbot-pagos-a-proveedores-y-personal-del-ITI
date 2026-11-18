(() => {
  const today = new Date();
  const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const state = {
    user: null,
    challengeId: null,
    view: 'overview',
    period: currentPeriod,
    page: 1,
  };

  const $ = (id) => document.getElementById(id);
  const loginView = $('login-view');
  const appView = $('app-view');
  const content = $('content');
  const title = $('view-title');
  const periodInput = $('period');
  const globalMessage = $('global-message');

  const titles = {
    overview: 'Resumen operativo', solicitudes: 'Solicitudes de pago', comprobantes: 'Comprobantes',
    eventos: 'Eventos institucionales', caja: 'Caja chica', docentes: 'Roles y facturas docentes',
    ia: 'IA documental', auditoria: 'Auditoría', proveedores: 'Proveedores', sistema: 'Estado del sistema',
  };

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  const money = (value) => Number(value || 0).toLocaleString('es-EC', { style: 'currency', currency: 'USD' });
  const date = (value) => value ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`)) : '—';
  const dateTime = (value) => value ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Guayaquil' }).format(new Date(value)) : '—';

  function badge(value) {
    const v = String(value || 'sin_estado');
    const ok = ['pagada','validado','reembolsado','aprobado','aprobada','aprobado_programacion','completado','recibida','enviado','rol_elaborado','documentacion_revisada'].includes(v);
    const bad = ['rechazada','rechazado','error','con_error'].includes(v);
    const warn = ['pendiente','pendiente_revision','pendiente_liquidacion','correccion_requerida','observado','rezagada','pendiente_autorizacion_excepcional','preparacion','facturas_solicitadas'].includes(v);
    const cls = ok ? 'ok' : bad ? 'bad' : warn ? 'warn' : 'info';
    return `<span class="badge ${cls}">${esc(v.replaceAll('_', ' '))}</span>`;
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/dashboard${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      credentials: 'same-origin',
      ...options,
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (response.status === 401) {
      showLogin();
      throw new Error(data.message || 'Tu sesión expiró.');
    }
    if (!response.ok) throw new Error(data.message || data.code || `Error HTTP ${response.status}`);
    return data;
  }

  function showMessage(text, kind = 'info') {
    globalMessage.textContent = text;
    globalMessage.classList.remove('hidden');
    if (kind === 'error') {
      globalMessage.style.background = '#fff0ef';
      globalMessage.style.color = '#8f1d16';
      globalMessage.style.borderColor = '#f0c3bf';
    } else {
      globalMessage.removeAttribute('style');
    }
  }

  function hideMessage() { globalMessage.classList.add('hidden'); globalMessage.textContent = ''; globalMessage.removeAttribute('style'); }
  function loading() { content.innerHTML = '<div class="panel"><p class="muted">Cargando información…</p></div>'; }
  function errorView(error) { content.innerHTML = `<div class="panel"><h2>No se pudo cargar la información</h2><p class="muted">${esc(error.message)}</p></div>`; }

  function showLogin() {
    state.user = null;
    appView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }

  function showApp(user) {
    state.user = user;
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    $('user-card').innerHTML = `<strong>${esc(user.nombre)}</strong>${esc(user.rol.replaceAll('_', ' '))}`;
    periodInput.value = state.period;
  }

  async function checkSession() {
    try {
      const data = await api('/auth/me');
      showApp(data.user);
      await loadView();
    } catch (_) {
      showLogin();
    }
  }

  $('request-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('login-error').textContent = '';
    try {
      const data = await api('/auth/request-otp', {
        method: 'POST', body: JSON.stringify({ cedulaRuc: $('cedula').value.trim() }),
      });
      state.challengeId = data.challengeId;
      $('otp-message').textContent = `Enviamos el código a ${data.correoEnmascarado}. Expira en ${data.expiresInMinutes} minutos.`;
      $('request-form').classList.add('hidden');
      $('verify-form').classList.remove('hidden');
      $('otp').focus();
    } catch (error) { $('login-error').textContent = error.message; }
  });

  $('verify-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('login-error').textContent = '';
    try {
      const data = await api('/auth/verify-otp', {
        method: 'POST', body: JSON.stringify({ challengeId: state.challengeId, otp: $('otp').value.trim() }),
      });
      showApp(data.user);
      await loadView();
    } catch (error) { $('login-error').textContent = error.message; }
  });

  $('back-login').addEventListener('click', () => {
    state.challengeId = null;
    $('otp').value = '';
    $('request-form').classList.remove('hidden');
    $('verify-form').classList.add('hidden');
    $('login-error').textContent = '';
  });

  $('logout').addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch (_) {}
    showLogin();
  });

  $('nav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    state.view = button.dataset.view;
    state.page = 1;
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b === button));
    loadView();
  });

  periodInput.addEventListener('change', () => {
    if (periodInput.value) state.period = periodInput.value;
    state.page = 1;
    loadView();
  });
  $('refresh').addEventListener('click', () => loadView(true));

  function pagerHtml(p) {
    if (!p) return '';
    return `<div class="pager"><span>Página ${p.page} de ${p.pages} · ${p.total} registros</span><div class="pager-actions"><button type="button" class="btn ghost" data-page="${Math.max(1, p.page - 1)}" ${p.page <= 1 ? 'disabled' : ''}>Anterior</button><button type="button" class="btn ghost" data-page="${Math.min(p.pages, p.page + 1)}" ${p.page >= p.pages ? 'disabled' : ''}>Siguiente</button></div></div>`;
  }

  function bindPager() {
    content.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => {
      state.page = Number(button.dataset.page || 1);
      loadView();
    }));
  }

  function bindFilters(reload) {
    const form = $('filters');
    if (!form) return;
    form.addEventListener('submit', (event) => { event.preventDefault(); state.page = 1; reload(); });
    const reset = $('reset-filters');
    if (reset) reset.addEventListener('click', () => { form.reset(); state.page = 1; reload(); });
  }

  function queryFromFilters() {
    const form = $('filters');
    const params = new URLSearchParams({ period: state.period, page: String(state.page), limit: '25' });
    if (form) {
      new FormData(form).forEach((value, key) => { if (String(value).trim()) params.set(key, String(value).trim()); });
    }
    return params;
  }

  function metricRows(entries) {
    const max = Math.max(1, ...entries.map((e) => Number(e[1] || 0)));
    return `<div class="metric-list">${entries.map(([label, value]) => `<div class="metric-row"><span>${esc(label)}</span><div class="bar"><i style="width:${Math.round((Number(value || 0) / max) * 100)}%"></i></div><strong>${Number(value || 0)}</strong></div>`).join('')}</div>`;
  }

  async function overviewView() {
    const { overview: o } = await api(`/overview?period=${encodeURIComponent(state.period)}`);
    content.innerHTML = `
      <div class="kpi-grid">
        <article class="kpi"><div class="label">Solicitudes</div><div class="value">${o.pagos.total}</div><div class="sub">${o.pagos.pendientes} pendientes · ${o.pagos.pagadas} pagadas</div></article>
        <article class="kpi"><div class="label">Monto registrado</div><div class="value">${money(o.pagos.montoRegistrado)}</div><div class="sub">Pagado aprox. ${money(o.pagos.montoPagadoAproximado)}</div></article>
        <article class="kpi"><div class="label">Documentos pendientes</div><div class="value">${o.documentos.pendientes + o.documentos.correccionRequerida}</div><div class="sub">${o.documentos.validados} validados</div></article>
        <article class="kpi"><div class="label">Pendientes críticos</div><div class="value">${o.pendientesCriticos}</div><div class="sub">Operación del período ${esc(o.periodo)}</div></article>
      </div>
      <div class="grid-2">
        <section class="panel"><h2>Flujo de solicitudes</h2>${metricRows([['Pendientes',o.pagos.pendientes],['En proceso',o.pagos.enProceso],['Pagadas',o.pagos.pagadas],['Rechazadas',o.pagos.rechazadas]])}</section>
        <section class="panel"><h2>Documentación</h2>${metricRows([['Validados',o.documentos.validados],['Pendientes revisión',o.documentos.pendientesRevision],['Pendientes liquidación',o.documentos.pendientesLiquidacion],['Corrección requerida',o.documentos.correccionRequerida],['Rechazados',o.documentos.rechazados]])}</section>
        <section class="panel"><h2>Procesos institucionales</h2>${metricRows([['Caja chica pendientes',o.cajaChica.pendientesRevision],['Caja chica reembolsados',o.cajaChica.reembolsados],['Eventos pendientes',o.eventos.pendientesRevision],['Eventos aprobados',o.eventos.aprobados],['Facturas docentes pendientes',o.docentes.facturasPendientes],['Facturas docentes rezagadas',o.docentes.facturasRezagadas]])}</section>
        <section class="panel"><h2>IA y operación</h2>${metricRows([['Análisis IA',o.ia.total],['IA requiere revisión',o.ia.revisar],['Errores IA',o.ia.errores],['Notificaciones fallidas',o.operacion.notificacionesFallidas],['Updates Telegram fallidos',o.operacion.telegramUpdatesFallidos],['Eventos de auditoría',o.trazabilidad.auditorias]])}</section>
      </div>`;
  }

  function filtersHtml(states = [], types = []) {
    return `<form id="filters" class="toolbar">
      <label class="field search"><span>Buscar</span><input name="search" placeholder="Nombre, observación o identificador" /></label>
      ${states.length ? `<label class="field"><span>Estado</span><select name="estado"><option value="">Todos</option>${states.map((x) => `<option value="${esc(x)}">${esc(x.replaceAll('_',' '))}</option>`).join('')}</select></label>` : ''}
      ${types.length ? `<label class="field"><span>Tipo</span><select name="tipo"><option value="">Todos</option>${types.map((x) => `<option value="${esc(x)}">${esc(x.replaceAll('_',' '))}</option>`).join('')}</select></label>` : ''}
      <button class="btn secondary" type="submit">Filtrar</button><button id="reset-filters" class="btn ghost" type="button">Limpiar</button>
    </form>`;
  }

  async function solicitudesView() {
    content.innerHTML = filtersHtml(['pendiente_autorizacion_excepcional','pendiente','rechazada','verificada','reporte_generado','orden_transferencia','aprobada','pagada'], ['normal','anticipo_gira','urgente','excepcional_mismo_dia']) + '<div id="table-target"></div>';
    const reload = async () => {
      const target = $('table-target'); target.innerHTML = '<div class="panel"><p class="muted">Cargando…</p></div>';
      try {
        const d = await api(`/solicitudes?${queryFromFilters()}`);
        target.innerHTML = `<div class="table-panel"><div class="table-scroll"><table><thead><tr><th>ID</th><th>Solicitante</th><th>Tipo</th><th>Estado</th><th>Monto</th><th>Fechas</th><th>Documentos</th></tr></thead><tbody>${d.items.map((r) => `<tr><td class="id-cell">#${r.id}</td><td>${esc(r.solicitanteNombre)}</td><td>${esc(r.tipo.replaceAll('_',' '))}</td><td>${badge(r.estado)}</td><td>${money(r.montoAproximado)}</td><td>Solicitud: ${date(r.fechaSolicitud)}<span class="small-text">Requerida: ${date(r.fechaDesembolsoRequerida)} · Programada: ${date(r.fechaProgramadaPago)}</span></td><td>${r.documentos.total} total<span class="small-text">${r.documentos.validados} validados · ${r.documentos.pendientes} pendientes</span></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin registros para los filtros seleccionados.</td></tr>'}</tbody></table></div>${pagerHtml(d.pagination)}</div>`;
        bindPager();
      } catch (e) { target.innerHTML = `<div class="panel"><p class="muted">${esc(e.message)}</p></div>`; }
    };
    bindFilters(reload); await reload();
  }

  async function comprobantesView() {
    content.innerHTML = filtersHtml(['recibido','pendiente_revision','pendiente_liquidacion','correccion_requerida','validado','rechazado'], ['factura','liquidacion_compra','nota_venta']) + '<div id="table-target"></div>';
    const reload = async () => {
      const d = await api(`/comprobantes?${queryFromFilters()}`);
      $('table-target').innerHTML = `<div class="table-panel"><div class="table-scroll"><table><thead><tr><th>ID</th><th>Solicitud</th><th>Solicitante</th><th>Tipo</th><th>Validación</th><th>Política</th><th>IA</th><th>Fecha</th></tr></thead><tbody>${d.items.map((r) => `<tr><td class="id-cell">#${r.id}</td><td>${r.solicitudPagoId ? `#${r.solicitudPagoId}` : '—'}</td><td>${esc(r.solicitanteNombre)}</td><td>${esc(r.tipo.replaceAll('_',' '))}</td><td>${badge(r.estadoValidacion)}</td><td>${r.cumplePoliticaAutomatica ? '<span class="badge ok">Cumple</span>' : '<span class="badge warn">Revisar</span>'}</td><td>${r.ia ? `${badge(r.ia.recomendacion || r.ia.estado)}<span class="small-text">Conf. ${Math.round((r.ia.confianza || 0)*100)}% · ${r.ia.alertas} alertas</span>` : '—'}</td><td>${date(r.fechaEnvio)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Sin comprobantes.</td></tr>'}</tbody></table></div>${pagerHtml(d.pagination)}</div>`;
      bindPager();
    };
    bindFilters(reload); await reload();
  }

  async function genericTableView(endpoint, states, headers, rowFn) {
    content.innerHTML = filtersHtml(states, []) + '<div id="table-target"></div>';
    const reload = async () => {
      const d = await api(`/${endpoint}?${queryFromFilters()}`);
      $('table-target').innerHTML = `<div class="table-panel"><div class="table-scroll"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${d.items.map(rowFn).join('') || `<tr><td colspan="${headers.length}" class="empty">Sin registros.</td></tr>`}</tbody></table></div>${pagerHtml(d.pagination)}</div>`;
      bindPager();
    };
    bindFilters(reload); await reload();
  }

  async function eventosView() {
    return genericTableView('eventos', ['pendiente_revision','observado','aprobado_programacion','rechazado'], ['ID','Evento','Unidad','Fecha evento','Monto','Anticipación','Estado','Solicitante'], (r) => `<tr><td class="id-cell">#${r.id}</td><td>${esc(r.nombre)}<span class="small-text">${esc(r.tipo.replaceAll('_',' '))}</span></td><td>${esc(r.unidadOrganizadora)}</td><td>${date(r.fechaEvento)}</td><td>${money(r.montoEstimado)}</td><td>${r.diasAnticipacion} días ${r.cumpleAnticipacion ? '<span class="badge ok">cumple</span>' : '<span class="badge warn">fuera de plazo</span>'}</td><td>${badge(r.estado)}</td><td>${esc(r.solicitanteNombre)}</td></tr>`);
  }

  async function cajaView() {
    return genericTableView('caja-chica', ['pendiente_revision','observado','aprobado','rechazado','reembolsado'], ['ID','Descripción','Monto','Presentación','Período','Plazo','Estado','Solicitante'], (r) => `<tr><td class="id-cell">#${r.id}</td><td>${esc(r.descripcion)}</td><td>${money(r.montoTotal)}</td><td>${date(r.fechaPresentacion)}</td><td>${esc(r.periodoPresentacion)} → ${esc(r.periodoProcesamiento)}</td><td>${r.diferido ? '<span class="badge warn">diferido</span>' : '<span class="badge ok">en plazo</span>'}</td><td>${badge(r.estado)}</td><td>${esc(r.solicitanteNombre)}</td></tr>`);
  }

  async function docentesView() {
    const d = await api(`/docentes?period=${encodeURIComponent(state.period)}&page=${state.page}&limit=25`);
    const roles = d.data.roles || [];
    const f = d.data.facturas;
    content.innerHTML = `<div class="panel" style="margin-bottom:16px"><h2>Roles del período</h2>${roles.length ? metricRows(roles.slice(0,8).map((r) => [`Rol #${r.id} · ${r.estado.replaceAll('_',' ')}`, 1])) : '<p class="muted">No hay roles registrados en el período.</p>'}</div>
      <div class="table-panel"><div class="table-scroll"><table><thead><tr><th>ID</th><th>Rol</th><th>Docente</th><th>Monto solicitado</th><th>Plazo</th><th>Correo</th><th>Estado</th><th>IA</th></tr></thead><tbody>${f.items.map((r) => `<tr><td class="id-cell">#${r.id}</td><td>#${r.rolPagoId}</td><td>${esc(r.docente?.nombre || r.docenteCedula)}<span class="small-text">${esc(r.docente?.correoElectronico || '')}</span></td><td>${money(r.montoSolicitado)}</td><td>${date(r.fechaLimiteFactura)}</td><td>${badge(r.correoEstado)}</td><td>${badge(r.estado)}</td><td>${r.ia ? `${badge(r.ia.recomendacion || r.ia.estado)}<span class="small-text">${r.ia.alertas} alertas</span>` : '—'}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Sin facturas docentes.</td></tr>'}</tbody></table></div>${pagerHtml(f.pagination)}</div>`;
    bindPager();
  }

  async function iaView() {
    return genericTableView('ia', ['pendiente','completado','error'], ['ID','Entidad','Proveedor / modelo','Estado','Recomendación','Confianza','Alertas','Fecha'], (r) => `<tr><td class="id-cell">#${r.id}</td><td>${esc(r.entidadTipo)} ${r.entidadId ? `#${r.entidadId}` : ''}</td><td>${esc(r.proveedor)}<span class="small-text">${esc(r.modelo || '')}</span></td><td>${badge(r.estado)}</td><td>${r.recomendacion ? badge(r.recomendacion) : '—'}</td><td>${r.confianza == null ? '—' : `${Math.round(r.confianza*100)}%`}</td><td>${r.alertasCount}</td><td>${dateTime(r.createdAt)}</td></tr>`);
  }

  async function auditoriaView() {
    return genericTableView('auditoria', [], ['ID','Entidad','Acción','Cambio de estado','Actor','Rol','Origen','Fecha'], (r) => `<tr><td class="id-cell">#${r.id}</td><td>${esc(r.entidad)} ${r.entidadId ? `#${esc(r.entidadId)}` : ''}</td><td>${esc(r.accion)}</td><td>${esc(r.estadoAnterior || '—')} → ${esc(r.estadoNuevo || '—')}</td><td>${esc(r.actorNombre)}</td><td>${esc(r.actorRol)}</td><td>${badge(r.origen)}</td><td>${dateTime(r.createdAt)}</td></tr>`);
  }

  async function proveedoresView() {
    return genericTableView('proveedores', [], ['ID','Titular','RUC / cédula','Institución financiera','Tipo cuenta','Correo','Registro'], (r) => `<tr><td class="id-cell">#${r.id}</td><td>${esc(r.nombreTitularCuenta)}</td><td>${esc(r.rucCedula)}</td><td>${esc(r.institucionFinanciera)}</td><td>${esc(r.tipoCuenta)}</td><td>${esc(r.correoElectronico)}</td><td>${dateTime(r.createdAt)}</td></tr>`);
  }

  async function sistemaView() {
    const d = await api('/system');
    const s = d.system;
    content.innerHTML = `<div class="status-grid">
      <article class="status-card"><strong><span class="status-dot"></span>Base de datos</strong><span class="muted">${s.runtime.databaseConnected ? 'Conectada' : 'No conectada'}</span></article>
      <article class="status-card"><strong><span class="status-dot"></span>Esquema</strong><span class="muted">${s.runtime.schemaReady ? 'Listo' : 'Pendiente'}</span></article>
      <article class="status-card"><strong><span class="status-dot"></span>Telegram</strong><span class="muted">${s.runtime.telegramReady ? 'Webhook listo' : 'No listo'}</span></article>
      <article class="status-card"><strong><span class="status-dot"></span>Jobs</strong><span class="muted">${s.runtime.jobsStarted ? 'Iniciados' : 'No iniciados'}</span></article>
      <article class="status-card"><strong>Última consulta</strong><span class="muted">${dateTime(s.timestamp)}</span></article>
    </div>
    <div class="table-panel" style="margin-top:16px"><div class="table-scroll"><table><thead><tr><th>Job</th><th>Programación</th><th>Activo</th><th>Último inicio</th><th>Último éxito</th><th>Error</th></tr></thead><tbody>${s.jobs.map((j) => `<tr><td>${esc(j.nombre)}</td><td>${esc(j.schedule)}</td><td>${j.enabled ? '<span class="badge ok">sí</span>' : '<span class="badge">no</span>'}</td><td>${dateTime(j.lastStartedAt)}</td><td>${dateTime(j.lastSuccessAt)}</td><td>${j.lastError ? `<span class="badge bad">${esc(j.lastError)}</span>` : '<span class="badge ok">sin error</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  const loaders = {
    overview: overviewView, solicitudes: solicitudesView, comprobantes: comprobantesView,
    eventos: eventosView, caja: cajaView, docentes: docentesView, ia: iaView,
    auditoria: auditoriaView, proveedores: proveedoresView, sistema: sistemaView,
  };

  async function loadView(manual = false) {
    hideMessage();
    title.textContent = titles[state.view] || 'Dashboard';
    loading();
    try {
      await loaders[state.view]();
      if (manual) showMessage('Información actualizada.');
    } catch (error) { errorView(error); }
  }

  checkSession();
})();
