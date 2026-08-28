const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyBsNAr-lhawIfuGNAsY2ZsnbySmcNF3EaGMpoJHYNHTw-_rUvbRbaRas7KnffIxB_C/exec";

function ejecutarServidor(nombreFuncion, ...parametros) {
  return fetch(GAS_API_URL, {
    method: "POST",
    body: JSON.stringify({
      functionName: nombreFuncion,
      parameters: parametros
    })
  })
  .then(res => res.json())
  .then(res => {
    if (res.status === 'error') throw new Error(res.message);
    return res.result;
  });
}

/**
 * =============================================================================
 * 0. NÚCLEO GLOBAL (Variables, Autenticación y Utilidades)
 * Funciones transversales que afectan a todo el sistema.
 * =============================================================================
 */
const DEBUG = true;
if (DEBUG) {
  window.addEventListener('error', (e) => {
    console.error('[GLOBAL ERROR]', e.message, e.filename, e.lineno + ':' + e.colno, e.error?.stack || '');
    if (window.toast) toast("⚠️ JS error: " + e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[PROMISE REJECTION]', e.reason);
    if (window.toast) toast("⚠️ Acción rechazada: " + (e.reason?.message || e.reason));
  });
}

// --- Gestión de Sesión y Token (sessionStorage) ---
function getAuthToken(){ return sessionStorage.getItem('AUTH_TOKEN') || ''; }
function setAuthToken(t){ if (t) sessionStorage.setItem('AUTH_TOKEN', t); }
function setAuthUser(u){ if (u) sessionStorage.setItem('AUTH_USER', u); }
function clearAuth(){
  sessionStorage.removeItem('AUTH_TOKEN');
  sessionStorage.removeItem('AUTH_USER');
}

// --- Identificación de Usuario Activo ---
window.usuarioActivo = window.usuarioActivo || (() => {
  try {
    return sessionStorage.getItem('AUTH_USER') || sessionStorage.getItem('AUTH_EMAIL') || 'UNKNOWN';
  } catch (e) {
    return 'UNKNOWN_LOK';
  }
});
window.eventosCache = [];

// --- Sistema de Autenticación de Usuario + Revalidación de Token ---
function ensureAuthTokenBanco(){
  return new Promise((resolve, reject) => {
    const existing = (typeof getAuthToken === 'function')
      ? getAuthToken() : (sessionStorage.getItem('AUTH_TOKEN') || '');
    const pulseUser = (user) => {
      const u = user || '';
      (typeof setAuthUser === 'function')
        ? setAuthUser(u) : sessionStorage.setItem('AUTH_USER', u);
      if (typeof refreshStatusUI === 'function') refreshStatusUI();
    };
    const saveToken = (token) => {
      (typeof setAuthToken === 'function') ? setAuthToken(token)
              : sessionStorage.setItem('AUTH_TOKEN', token);
      const expireTime = Date.now() + (7200 * 1000);
      sessionStorage.setItem('AUTH_EXPIRE', expireTime.toString());
      if (typeof refreshStatusUI === 'function') refreshStatusUI();
    };
    const clearAuthSafe = () => {
      try { if (typeof clearAuth === 'function') clearAuth(); } catch(_) {}
      sessionStorage.removeItem('AUTH_TOKEN');
      sessionStorage.removeItem('AUTH_USER');
      sessionStorage.removeItem('AUTH_EXPIRE');
      if (typeof refreshStatusUI === 'function') refreshStatusUI();
    };

    const promptLogin = () => {
      const user = (prompt('🧑 USUARIO: email, username')|| '').trim().toUpperCase();
      if (!user) return reject(new Error('cancelado'));
      const pin  = (prompt('🔑 Clave-PIN de acceso:')|| '').trim();
      if (!pin) return reject(new Error('cancelado'));

      ejecutarServidor('api_auth_check', '', user, pin)
        .then(res => {
          if (res && res.ok && res.token) {
            saveToken(res.token);
            pulseUser(res.user || user);
            resolve(res.token);
          } else {
            reject(new Error('login_failed'));
          }
        })
        .catch(err => reject(err));
    };

    if (!existing) return promptLogin();

    ejecutarServidor('api_auth_check', existing)
      .then(res => {
        if (res && res.ok) {
          if (res.user) pulseUser(res.user);
          return resolve(existing);
        }
        clearAuthSafe();
        return promptLogin();
      })
      .catch(_ => {
        clearAuthSafe();
        return promptLogin();
      });
  });
}

// --- Utilidades Generales de Interfaz ---
(function(){
  const $$  = s => document.querySelector(s);
  const $$$ = s => Array.from(document.querySelectorAll(s));

  function escapeHTML(x){
    return String(x)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function toast(msg){
    const t = $$('#toast');
    if (!t) { console.log('Toast:', msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(()=> t.classList.remove('show'), 4000);
  }
  
  async function setupRecibosConAuth() {
    let token = null;
    try { 
      token = await ensureAuthTokenBanco(); 
    } catch (e) { 
      token = null; 
    } 
    if (token && typeof token === 'string' && token.trim() !== '') {
      window.__viewsLoaded.recibo = true;
      setupRecibos();
      if (window.toast) toast("🔓 Acceso Autorizado (✅)");
    } else {
      window.__viewsLoaded.recibo = false;
      if (window.toast) toast("⚠️Sesión Expirada / Acceso Denegado (⛔)");
      const btnBanco = document.querySelector('.sidebar a[data-view="banco"]');
      if (btnBanco) btnBanco.click(); 
    }
  }

  document.getElementById('banco-eliminar')?.addEventListener('click', async () => {
    const btn = document.getElementById('banco-eliminar');
    if (!btn) return;
    
    const oldText = btn.textContent;
    
    const restore = () => {
      btn.disabled = false;
      btn.textContent = oldText;
      btn.removeAttribute("style");
      btn.className = "btn-redd";
    };

    const notificar = (msg) => {
      if (window.toast) window.toast(msg);
      else alert(msg);
    };

    try {
      let token = null;
      try { token = await ensureAuthTokenBanco(); } catch { token = null; }
      
      if (!token) {
        notificar('🔐 Autenticación Fallida (⛔)');
        return;
      }

      btn.disabled = true;
      btn.textContent = '⏳ Procesando...';
      btn.style.color = '#000';
      btn.style.background = '#FAD775';

      ejecutarServidor('api_banco_delete_prepare', token)
        .then(async (res) => {
          if (res?.alert) {
            alert(res.alert);
            return restore();
          }

          if (res?.needCode) {
            btn.textContent = '⏳ Validando Código...';
            const ok = await pedirCodigoCliente(res.mensaje, res.code, res.maxAttempts || 3);
            if (!ok) return restore();

            ejecutarServidor('deleteRow', { 
              confirmed: true, 
              authToken: window.usuarioActivo(), 
              codeUsed: res.code 
            })
            .then((r2) => {
              if (r2?.ok) {
                notificar('✅ Registro eliminado correctamente.');
                document.getElementById('recibos-refresh')?.click();
                document.getElementById("servicios-refresh")?.click();
                if (typeof reloadPage === 'function') reloadPage();
              } else {
                notificar(r2?.error || '⛔ No se pudo eliminar el Registro.');
              }
              restore();
            })
            .catch((err) => {
              notificar('❌ Error al confirmar: ' + (err?.message || err));
              restore();
            });

            return;
          }

          if (res?.ok) {
            notificar('✅ Registro eliminado correctamente.');
            document.getElementById('recibos-refresh')?.click();
            if (typeof reloadPage === 'function') reloadPage();
          } else {
            notificar(res?.error || '⛔ No se pudo eliminar el Registro.');
          }
          restore();
        })
        .catch((err) => {
          notificar('❌ Error al preparar eliminación: ' + (err?.message || err));
          restore();
        });

    } catch (e) {
      console.error('Error al Eliminar:', e);
      notificar('⚠️ Error al realizar esta acción.');
      restore();
    }
  });

  async function refreshBanco(){
    const btn  = document.getElementById('banco-buscar');
    const mSel = document.getElementById('banco-month');
    const ySel = document.getElementById('banco-year');
    const month = Number(mSel?.value);
    const year  = Number(ySel?.value);

    const restore = () => {
      if (!btn) return;
      btn.disabled = false;
      btn.textContent = btn.dataset._old || '📅 Ver Periodo';
      btn.removeAttribute('style');
      btn.className = 'btn-orange';
    };

    const setWorking = () => {
      if (!btn) return;
      btn.dataset._old = btn.textContent;
      btn.disabled = true;
      btn.style.background = '#FAD775';
      btn.style.color = '#000';
      btn.textContent = '⏳Actualizando…';
    };

    try {
      if (!month || !year || Number.isNaN(month) || Number.isNaN(year)) {
        if (window.toast) toast("⚠️ Seleccione mes y año válidos");
        else alert('Seleccione mes y año válidos.');
        return;
      }
      let token = null;
      try { token = await ensureAuthTokenBanco(); } catch { token = null; }
      if (!token) {
        if (window.toast) toast("🔐 Autenticación Fallida (⛔)");
        return;
      }
      setWorking();
      
      ejecutarServidor('api_banco_getDashboardData', { year, month, userAuth: window.usuarioActivo() })
        .then((data) => {
          try {
            banco_renderStyled(data);
          } catch(e) {
            console.error("Error al renderizar:", e);
          } finally {
            restore();
          }
        })
        .catch((err) => {
          console.error("Error en servidor:", err);
          restore();
        });
    } catch (e) {
      alert('⚠️ Error al Seleccionar Periodo: ' + e);
      restore();
    }
  }

  function reloadPage(){
    const btn  = document.getElementById('banco-refresh');
    const mSel = document.getElementById('banco-month');
    const ySel = document.getElementById('banco-year');
    
    const restore = () => {
      if (!btn) return;
      btn.disabled = false;
      btn.textContent = btn.dataset._old || '🔄 Actualizar';
      btn.removeAttribute('style');
      btn.className = 'btn-blue';
    };
    if (btn){
      btn.dataset._old = btn.textContent;
      btn.disabled = true;
      btn.style.background = '#FAD775';
      btn.style.color= '#000';
      btn.textContent = '⏳Espere...';
    }
    const month = Number(mSel?.value);
    const year  = Number(ySel?.value);

    ejecutarServidor('api_banco_getDashboardData', { year, month })
      .then((data) => {
        try { 
          banco_renderStyled(data); 
        } catch(e) {
          console.error("Error al renderizar:", e);
        } finally { 
          restore(); 
        }
      })
      .catch((err) => {
        console.error("Error en servidor:", err);
        restore();
      });
  }

  document.getElementById('btn-m3')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-m3');
    if (!btn) return;
    const restore = () => {
      btn.disabled = false;
      btn.textContent = btn.dataset._old || 'M3';
      btn.style.removeProperty('background');
      btn.style.removeProperty('color');
    };
    try {
      btn.dataset._old = btn.textContent;
      btn.disabled = true;
      btn.style.background = '#FAD775';
      btn.style.color = '#000';
      btn.textContent = '⏳ Solicitando…';
      let token = null;
      try { token = await ensureAuthTokenBanco(); } catch { token = null; }
      if (!token) {
        if (window.toast) toast("🔐 Autenticación Fallida (⛔)");
        return;
      }
      const raw = prompt('Ingrese lo m3. Indicados en el Recibo');
      if (raw == null) return;
      const s = String(raw).trim().replace(/\s/g, '');
      const num = Number(s.replace(/,/g, ''));
      if (!isFinite(num)) {
        alert('Valor inválido. Ingrese un número (ej.: 1234.56 o 1,234.56).');
        return;
      }
      const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(num);
      uiPaintCell({
        row: 9 - 3, col: 16, text: formatted,
        color:'#333333', bg:'#AAAAAA', align:'center', radius:8
      });

      ejecutarServidor('api_banco_setM3', { value: num }, window.usuarioActivo())
        .then(() => { if (window.toast) toast("✅ m3 REGISTRADO"); })
        .catch(err => { alert('Error al guardar M3: ' + (err?.message || err)); });
    } catch (e) {
      console.error('Error en M3:', e);
      if (window.toast) toast("⚠️ Error al realizar esta acción (⛔)");
      alert(e);
    } finally {
      restore();
    }
  });

  async function abrirContometrosForm(){
    try{
      const token = await ensureAuthTokenBanco();
      if (!token) {
        if (window.toast) toast("⚠️ Autenticación Fallida (⛔)");
        return;
      }
      const user = sessionStorage.getItem('AUTH_USER') || '';
      const dlg = document.getElementById('dlgContometros');
      const ifr = document.getElementById('frmContometros');
      const url = "Contometros.html?token=" + encodeURIComponent(token) + '&user=' + encodeURIComponent(user);
      ifr.src = url;
      dlg.showModal();
    } catch(e){ 
      console.error('No se abrió Contómetros:', e); 
      alert(e);
    }
  }

  document.getElementById('btnFormClose')?.addEventListener('click', () => closeForm('contometros'));
  document.getElementById('btnBancoFormClose')?.addEventListener('click', () => closeForm('banco'));
  document.getElementById('banco-refresh')?.addEventListener('click', reloadPage);
  document.getElementById('banco-buscar')?.addEventListener('click', refreshBanco);
  document.getElementById('recibos-refresh')?.addEventListener('click', reloadRecibos);

  window.addEventListener('message', ev => {
    if (ev?.data?.type === 'contometros-auth-expired' || ev?.data?.type === 'banco-auth-expired') {
      sessionStorage.removeItem('AUTH_TOKEN');
      sessionStorage.removeItem('AUTH_USER');
      refreshStatusUI();
      if (window.toast) toast("🧑 Sesión expirada (⛔)");
    }
  });

  document.getElementById('nav-eventos')?.addEventListener('click', () => {
    cargarEventosLogger();
  });

  function initBancoCombosFromSheet(){
    const mSel = document.getElementById('banco-month');
    const ySel = document.getElementById('banco-year');
    if (!mSel || !ySel) return;

    ejecutarServidor('api_banco_getOptions')
      .then(({ months, years, current }) => {
        mSel.innerHTML = months.map(m => `<option value="${m.n}">${m.name}</option>`).join('');
        ySel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        mSel.value = current.month;
        ySel.value = current.year;
        reloadPage(); 
      })
      .catch(err => console.error('api_banco_getOptions error:', err));
  }

  function reloadRecibos(){
    const btn = document.getElementById('recibos-refresh');
    if (!btn) return;
    if (!btn.dataset._old) btn.dataset._old = btn.textContent;
    btn.disabled = true;
    btn.style.background = '#FAD775';
    btn.style.color= '#000';
    btn.textContent = '⏳Actualizando...';
    const restore = () => {
      btn.disabled = false;
      btn.textContent = btn.dataset._old || '🔄 Actualizar';
      btn.style.background = '';
      btn.style.color = '';
      btn.className = 'btn-blue';
    };
    let restored = false;
    const safeRestore = () => {
      if (restored) return;
      restored = true;
      restore();
    };

    const tbl = document.getElementById('tabla-recibos');
    let obs;
    try {
      if (tbl) {
        const target = tbl.tBodies && tbl.tBodies[0] ? tbl.tBodies[0] : tbl;
        obs = new MutationObserver(() => {
          obs.disconnect();
          requestAnimationFrame(safeRestore);
        });
        obs.observe(target, { childList: true, subtree: true });
      }
      setupRecibos();
      setTimeout(safeRestore, 6000);
    } catch (e){
      console.error('reloadRecibos error:', e);
      if (obs) obs.disconnect();
      safeRestore();
      toast?.('Error al recargar Recibos');
    }
  }

  function pedirCodigoCliente(mensaje, code, maxAttempts){
    const intentosMax = Math.max(1, Number(maxAttempts) || 1);
    const promptMsg = (mensaje ? mensaje + '\n\n' : '') +
      '🔒 Código de validación: ' + String(code) + '\n' +
      'Introduzca el Código Para Validar esta Operación:';
    for (let i = 0; i < intentosMax; i++){
      const ingreso = window.prompt(promptMsg, '');
      if (ingreso === null){
        if (window.toast) toast("⚠️ Operación cancelada (🛑)");
        return false;
      }
      if (String(ingreso).trim() === String(code)){
        return true;
      }
      const restantes = intentosMax - i - 1;
      if (restantes > 0){
        window.alert(`⛔ Código incorrecto. Intentos restantes: ${restantes}`);
      } else {
        if (window.toast) toast("⚠️ Maximo de intentos Permitidos. Operación cancelada (🛑)");
      }
    }
    return false;
  }

  async function setupComunaConAuth() {
    let token = null;
    try { 
      token = await ensureAuthTokenBanco(); 
    } catch (e) { 
      token = null; 
    }
    if (token && typeof token === 'string' && token.trim() !== '') {
      window.__viewsLoaded.comunal = true;
      setupComuna();
      if (window.toast) toast("🔓 Acceso Autorizado");
    } else {
      window.__viewsLoaded.comunal = false;
      if (window.toast) toast("⛔ Sesión expirada / acceso denegado");
      const btnBanco = document.querySelector('.sidebar a[data-view="banco"]');
      if (btnBanco) { btnBanco.click(); }
    }
  }

  document.getElementById('btnRepGen')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRepGen');
    const linksDiv = document.getElementById('reportLinks');
    if (!btn || !linksDiv) return;
    const setWorking = () => {
      btn.disabled = true;
      btn.textContent = '⏳ Generando Reporte…';
    };
    const restore = () => {
      btn.disabled = false;
      btn.textContent = btn.dataset._old || '📤 Reporte General';
    };
    linksDiv.innerHTML = '';
    let token = null;
    try { token = await ensureAuthTokenBanco(); } catch { token = null; }
    if (!token) {
      if (window.toast) toast("🔐 Autenticación Fallida (⛔)");
      return; 
    }
    setWorking();

    ejecutarServidor('reporteGeneral_web', window.usuarioActivo())
      .then(res => {
        btn.disabled = false;
        btn.textContent = '✅ Reporte Generado';
        if (res?.user) {
          sessionStorage.setItem('AUTH_USER', res.user);
          refreshStatusUI();
        }
        if (res?.ok && res?.urlPDF) {
          linksDiv.innerHTML = getBtnPDF(res); 
        } else {
          linksDiv.textContent = '❌ No se pudo generar el reporte PDF';
        }
      })
      .catch(err => {
        restore();
        linksDiv.textContent = 'Error: ' + (err?.message || err);
      });
  });

  document.getElementById('btnDeudas')?.addEventListener('click', () => {
    const btn = document.getElementById('btnDeudas');
    const linksDiv = document.getElementById('deudasLinks');
    const $minInput = document.getElementById('deu-min'); 
    const valorMin = $minInput ? Number($minInput.value) : 15;
    btn.disabled = true;
    btn.textContent = '⏳ Generando Lista...';
    linksDiv.innerHTML = "";

    ejecutarServidor('generarReporteDeudas_web', window.usuarioActivo(), valorMin)
      .then(res => {
        btn.disabled = false;
        btn.textContent = '✅ Lista Generada';
        if (res?.urlDrive) {
          linksDiv.innerHTML = getBtnPDF(res);
        } else {
          linksDiv.textContent = "❌ No se pudo generar el reporte";
        }
      })
      .catch(err => {
        btn.disabled = false;
        btn.textContent = '📊 Listar Deudas';
        linksDiv.textContent = "Error: " + (err.message || err);
      });
  });

  document.getElementById('btnRecExel')?.addEventListener('click', () => {
    const btn = document.getElementById('btnRecExel');
    const linksDiv = document.getElementById('exportLinks');
    btn.disabled = true;
    btn.textContent = '⏳ Generando Recibos...';
    linksDiv.innerHTML = "";

    ejecutarServidor('downloadSheetAsXlsx_web', window.usuarioActivo())
      .then(res => {
        btn.disabled = false;
        btn.textContent = '✅ Recibos Prosesados';
        if (res?.urlDrive) {
          linksDiv.innerHTML = getBtnDrive(res) + getBtnExcel(res);
        } else {
          linksDiv.textContent = "❌ No se pudo generar el archivo";
        }
      })
      .catch(err => {
        btn.disabled = false;
        btn.textContent = '📤 Recibos en Excel';
        linksDiv.textContent = "Error: " + (err.message || err);
      });
  });

  document.getElementById('btnRepAguas')?.addEventListener('click', () => {
    const btn = document.getElementById('btnRepAguas');
    const linksDiv = document.getElementById('aguasLinks');
    const setWorking = () => {
      btn.disabled = true;
      btn.textContent = '⏳ Generando Reportes...';
      linksDiv.innerHTML = '';
    };
    const setDone = () => {
      btn.disabled = false;
      btn.textContent = '✅ Reportes Generados';
    };
    const setError = (err) => {
      btn.disabled = false;
      btn.textContent = '📤 Generar Reportes';
      linksDiv.textContent = 'Error: ' + (err?.message || err);
    };
    setWorking();

    ejecutarServidor('downloadComtometsXlsx_web', window.usuarioActivo())
      .then((resXlsx) => {
        ejecutarServidor('reporteAguasPDF_Web')
          .then((resPdf) => {
            setDone();
            const parts = [];
            if (resXlsx?.urlDrive)    parts.push(getBtnDrive(resXlsx));
            if (resXlsx?.urlDownload) parts.push(getBtnExcel(resXlsx));
            if (resPdf?.urlPDF)       parts.push(getBtnPDF(resPdf));
            linksDiv.innerHTML = parts.join('') || '❌ No se pudo generar el archivo';
          })
          .catch(setError);
      })
      .catch(setError);
  });

  function setupRouter(){
    const side = $$('.sidebar');
    if (!side) return;
    const loaded = (window.__viewsLoaded = window.__viewsLoaded || {
      banco:false, deudas:false, lecturas:false, consultas:false, recibo:false, comunal: false
    });
    function ensureInit(view) {
      try {
        if (view === 'banco' && !loaded.banco) { loaded.banco = true; setupBanco?.(); }
      } catch (e) { 
        console.error('[setupRouter] init error:', e); 
      }
    }

    side.addEventListener('click', async e => {
      const a = e.target.closest('a[data-view]');
      if (!a) return;

      const v = a.getAttribute('data-view');
      const tieneTokenLocal = !!(typeof getAuthToken === 'function' ? getAuthToken() : sessionStorage.getItem('AUTH_TOKEN'));
      if (!tieneTokenLocal) {
        loaded.comunal = false;
        loaded.recibo = false;
        if (typeof window.__viewsLoaded === 'object') {
          window.__viewsLoaded.comunal = false;
          window.__viewsLoaded.recibo = false;
        }
      }

      if ((v === 'comunal' && !loaded.comunal) || (v === 'recibo' && !loaded.recibo)) {
        if (v === 'comunal') await setupComunaConAuth();
        if (v === 'recibo')  await setupRecibosConAuth(); 
        if (typeof window.__viewsLoaded === 'object') {
          loaded.comunal = window.__viewsLoaded.comunal;
          loaded.recibo = window.__viewsLoaded.recibo;
        }
        if (!loaded[v]) return; 
      }

      $$$('.sidebar a').forEach(x => x.classList.remove('active'));
      a.classList.add('active');

      $$$('.view').forEach(sec => sec.classList.remove('show'));
      const sec = $$('#view-' + v);
      if (sec) sec.classList.add('show');
      ensureInit(v);
    });

    const current = side.querySelector('a.active')?.getAttribute('data-view');
    if (current) ensureInit(current);
  }

  function setupFullscreen(){
    const btn = $$('#btnFull');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try{
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      }catch(e){}
    });
  }

  function getUserTag(){
    const u = sessionStorage.getItem('AUTH_USER') || sessionStorage.getItem('AUTH_EMAIL') || '';
    return '🧑-> ' + (u || 'LogOff');
  }

  function getTokenRemainingTime() {
    const expireStr = sessionStorage.getItem('AUTH_EXPIRE');
    if (!sessionStorage.getItem('AUTH_TOKEN') || !expireStr) return '00:00';
    const remainingMs = Number(expireStr) - Date.now();
    if (remainingMs <= 0) return '⛔Expired';
    const totalSeconds = Math.floor(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  function statusLabel(state) {
    const estadoRealSistema = (typeof prev !== 'undefined') ? prev : state;
    const base = (estadoRealSistema === 'BUSY') ? 'BUSY · Working' : 'IDLE -> OnLine';
    const timeRemaining = getTokenRemainingTime();
    return `${base} \u00A0 ${getUserTag()} \u00A0 ⏱️TimeSession-> ${timeRemaining}`;
  }

  function refreshStatusUI(){
    const current = (typeof prev !== 'undefined' && prev) ? prev : 'IDLE';
    document.dispatchEvent(new CustomEvent('NET_STATE_CHANGED', { detail:{ state: current } }));
  }

  window.getUserTag = getUserTag;
  window.statusLabel = statusLabel;

  (function () {
    let inflight = 0, prev = 'IDLE';

    function setState(next){
      if (next === prev) return;
      console.log(`Net state changed from ${prev} to ${next}`);
      prev = next;
      document.dispatchEvent(new CustomEvent('NET_STATE_CHANGED', { detail:{ state: next } }));

      const pill = document.getElementById('netStatePill');
      if (pill){
        const label = statusLabel(next);
        pill.textContent = label;
        pill.classList.toggle('busy', next === 'BUSY');
        pill.classList.toggle('idle', next === 'IDLE');
      }

      const srv = document.getElementById('srvStatus');
      if (srv){
        srv.classList.remove('srv-busy','srv-idle');
        srv.classList.add(next === 'BUSY' ? 'srv-busy' : 'srv-idle');
        const t = srv.querySelector('.txt');
        if (t) t.textContent = statusLabel(next);
      }
    }

    const Net = {
      busy(){ if (++inflight === 1) setState('BUSY'); },
      idle(){ if (inflight > 0 && --inflight === 0) setState('IDLE'); },
      getState(){ return prev; } 
    };
    window.__NetState = Net;
  })();

  document.addEventListener('NET_STATE_CHANGED', (e) => {
    const el = document.getElementById('srvStatus');
    if (!el) return;
    const s = e.detail?.state;
    el.className = 'srv-badge ' + (s === 'BUSY' ? 'srv-busy' : 'srv-idle');
    const t = el.querySelector('.txt');
    if (t) t.textContent = statusLabel(s);
  }); 

  function setupNuevo(){
    if (window.__setupNuevoReady) return;
    window.__setupNuevoReady = true;

    const btnNuevo = $$('#btnNuevo');
    const dlg      = $$('#dlgContometros');
    const iframe   = $$('#frmContometros');
    const btnClose = $$('#btnFormClose');
    if (!btnNuevo || !dlg || !iframe) return;

    btnNuevo.addEventListener('click', async () => {
      let token = null;
      try { 
        token = await ensureAuthTokenBanco(); 
      } catch (e) { 
        token = null; 
      }
      
      if (!token) {
        if (window.toast) window.toast('🔐 Autenticación Fallida (⛔)');
        return; 
      }

      setTimeout(() => {
        iframe.src = 'about:blank'; 
        dlg.showModal();
        requestAnimationFrame(() => { iframe.src = 'Contometros.html?token=' + encodeURIComponent(token); });
      }, 400);
    });

    btnClose?.addEventListener('click', () => dlg.close());

    window.addEventListener('message', (ev) => {
      const d = ev?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'closeContometros') dlg.close();
      if (d.type === 'toast') toast(String(d.message || ''));
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    setupRouter();
    setupFullscreen();
    setupNuevo();
    if (window.refreshStatusUI) window.refreshStatusUI();
  });

  window.$$ = $$; window.$$$ = $$$; window.escapeHTML = escapeHTML; window.toast = toast;
})();

/* =========================
  BANCO / CONSULTAS / CONTOMETROS (RENDER & LOGIC)
  ========================= */

function setupBanco(){
  const selM = document.getElementById('banco-month');
  const selY = document.getElementById('banco-year');
  if (!selM || !selY) return;

  ejecutarServidor('api_banco_getOptions')
    .then(opts => {
      selM.innerHTML = (opts.months||[]).map(m => `<option value="${m.n}">${m.name}</option>`).join('');
      selY.innerHTML = (opts.years||[]).map(y => `<option value="${y}">${y}</option>`).join('');
      if (opts.current){
        if (String(opts.current.month)) selM.value = String(opts.current.month);
        if (String(opts.current.year))  selY.value = String(opts.current.year);
      }
      ejecutarServidor('api_banco_getDashboardData', { year:Number(selY.value), month:Number(selM.value) })
        .then(data => banco_renderStyled(data));
    });
}

function setupLecturas() {
  ejecutarServidor('api_contometros_getStyled')
    .then(data => contometros_renderStyled(data))
    .catch(err => toast?.('Lecturas Server Error: ' + (err?.message || err)));
}

function setupRecibos(){
  ejecutarServidor('api_recibos_getData')
    .then(data => recibos_renderBody(data))
    .catch(err => toast('Error Seccion Recibos: ' + (err?.message || err)));
}

function cargarModuloServicios() {
  ejecutarServidor('api_Servicios_Hist')
    .then(response => {
      if (response.success) {
        cacheServicios = response.datos;
        renderizarTablaServicios(cacheServicios);
      } else {
        alert("❌ Error al cargar servicios: " + response.error);
      }
    })
    .catch(err => alert("❌ Error crítico del servidor: " + err));
}

function cargarEventosLogger() {
  ejecutarServidor('api_LOGGER_LOG_Firebase')
    .then(data => {
      window.eventosCache = Array.isArray(data) ? data.reverse() : [];
      renderTablaEventos(window.eventosCache);
    })
    .catch(err => console.error("Error al cargar eventos:", err));
}

// Reloj continuo
document.addEventListener('DOMContentLoaded', () => {
  const updateClocks = () => {
    const now = new Date();
    const tz = 'America/Lima';
    const text = now.toLocaleString('es-PE', { timeZone: tz });
    document.querySelectorAll('.clock-24h').forEach(el => { el.textContent = text; });
  };
  setInterval(updateClocks, 1000);
});