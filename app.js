/**
 * =============================================================================
 * 0. NÚCLEO GLOBAL (Variables, Autenticación y Utilidades) vsc
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
function clearAuth() {
  try {
    sessionStorage.removeItem('AUTH_TOKEN');
    sessionStorage.removeItem('AUTH_USER');
    sessionStorage.removeItem('AUTH_EXPIRE');
  } catch (e) {console.warn('Error al limpiar sesión:', e);}
}

// --- Identificación de Usuario Activo ---
window.usuarioActivo = window.usuarioActivo || (() => {
  try {
    return sessionStorage.getItem('AUTH_USER') || 'UNKNOWN';
  } catch (e) {return 'UNKNOWN_LOK';}
});

// Comprobación directa usando la fecha guardada previamente por tu sistema
function isSessionExpired() {
  const expire = sessionStorage.getItem('AUTH_EXPIRE');
  if (!expire) return true;
  return Date.now() > parseInt(expire, 10);
}

// --- Validación desde el Formulario conectada a tu Backend ---
function validarIngreso(event) {
  event.preventDefault();

  const userEl = document.getElementById("login-user");
  const passEl = document.getElementById("login-pass");
  const userInput = (userEl?.value || '').trim().toUpperCase();
  const passInput = (passEl?.value || '').trim();
  const errorMsg = document.getElementById("login-error");
  
  // Resguardo para encontrar el botón de envío
  const form = event.target;
  const btnSubmit = form.querySelector('button[type="submit"]') || form.querySelector('button') || document.getElementById('btnLogin');

  if (!userInput || !passInput) {
    if (errorMsg) {
      errorMsg.style.display = "flex";
      const txt = errorMsg.querySelector('span') || errorMsg;
      txt.textContent = "Ingrese usuario y contraseña.";
    }
    return;
  }

  // Estado de carga visual en el botón
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validando...';
  }
  if (errorMsg) errorMsg.style.display = "none";

  netRun()
    .withSuccessHandler(res => {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span>Iniciar Sesión</span> <i class="fa-solid fa-arrow-right"></i>';
      }

      if (res && res.ok && res.token) {
        // 1. Guardar Token
        setAuthToken(res.token);
        
        // 2. Guardar Usuario
        const usuarioFinal = res.user || userInput;
        setAuthUser(usuarioFinal);

        // 3. Establecer Expiración de 2 horas
        const expireTime = Date.now() + (7200 * 1000);
        sessionStorage.setItem('AUTH_EXPIRE', expireTime.toString());

        // 4. Limpiar campos al ingresar con éxito
        if (userEl) userEl.value = '';
        if (passEl) passEl.value = '';

        // 5. Ocultar Login y Mostrar App
        mostrarAplicacion();
      } else {
        // Error de credenciales
        if (errorMsg) {
          errorMsg.style.display = "flex";
          const txt = errorMsg.querySelector('span') || errorMsg;
          txt.textContent = res?.error || "Usuario | PIN  incorrectos.";
        }
        if (passEl) {
          passEl.value = '';
          passEl.focus();
        }
      }
    })
    .withFailureHandler(err => {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span>Iniciar Sesión</span> <i class="fa-solid fa-arrow-right"></i>';
      }

      console.error("❌ Error de red o servidor:", err);
      if (errorMsg) {
        errorMsg.style.display = "flex";
        const txt = errorMsg.querySelector('span') || errorMsg;
        txt.textContent = "Error de conexión con el servidor: " + (err?.message || String(err));
      }
      if (passEl) passEl.value = '';
    })
    // ✅ Se envían solo usuario y contraseña para la autenticación inicial
    .api_auth_check('', userInput, passInput);
}
    
// 3. Control de Vistas
function mostrarAplicacion() {
  const loginScreen = document.getElementById("login-screen");
  const appContainer = document.getElementById("app-container");
  if (loginScreen) loginScreen.style.display = "none";
  if (appContainer) appContainer.style.display = "block";
  if (typeof initApp === "function") {
    initApp();}
}

function cerrarSesion(forceReload = false) {
  clearAuth();
  const loginScreen = document.getElementById("login-screen");
  const appContainer = document.getElementById("app-container");
  if (appContainer) appContainer.style.display = "none";
  if (loginScreen) loginScreen.style.display = "flex";
  if (forceReload) {window.location.reload();}
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////

// URL pública de tu Web App en Google Apps Script COEXION AL SERVIDOR GAS
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwnuyIpmcEmz9f8bLyi7iLsl9ZqrMFM8tnONs71oXYH-EcG-ZA-tYwJr4S7TX3IpLQqHw/exec";

// --- Motor Principal netRun (Conexión Directa e Híbrida a Apps Script) ---
window.netRun = function () {
  let successFn = () => {};
  let failureFn = () => {};
  const proxy = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'withSuccessHandler') {
        return (fn) => { successFn = fn; return proxy; };
      }
      if (prop === 'withFailureHandler') {
        return (fn) => { failureFn = fn; return proxy; };
      }
      return (...args) => {
        if (typeof window.__NetState === 'object') window.__NetState.busy();

        // 1. Si estamos dentro del entorno nativo de Google Apps Script (HTML Service iframe)
        if (typeof google !== 'undefined' && google.script && google.script.run) {
          google.script.run
            .withSuccessHandler(res => {
              if (typeof window.__NetState === 'object') window.__NetState.idle();
              successFn(res);
            })
            .withFailureHandler(err => {
              if (typeof window.__NetState === 'object') window.__NetState.idle();
              failureFn(err);
            })[prop](...args);
        } else {
          // 2. Si estamos en GitHub Pages / Web externa, conectamos vía Fetch API
          fetch(GAS_API_URL, {
            method: "POST",
            redirect: "follow",
            headers: {
              "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify({
              functionName: prop,
              parameters: args
            })
          })
          .then(res => {
            if (!res.ok) throw new Error("HTTP error " + res.status);
            return res.json();
          })
          .then(res => {
            if (typeof window.__NetState === 'object') window.__NetState.idle();
            if (res && res.status === 'error') {
              failureFn(new Error(res.message || 'Error en servidor'));
            } else {
              successFn(res && 'result' in res ? res.result : res);
            }
          })
          .catch(err => {
            if (typeof window.__NetState === 'object') window.__NetState.idle();
            failureFn(err);
          });
        }
        return proxy;
      };
    }
  });
  return proxy;
};

window.eventosCache = [];
window.norm = window.norm || (s => String(s ?? '').trim().toUpperCase());
window.DEPA_SET = window.DEPA_SET || new Set();
window.SERV_SET = window.SERV_SET || new Set();
window.LISTAS = window.LISTAS || { depaIds: [], servIds: [] };

// --- Sistema de Autenticación de Usuario + Revalidación de Token ---
// se ejecuta antes de realizar acciones sensibles (como eliminar registros, generar reportes o guardar movimientos).
function ensureAuthTokenBanco(){
  return new Promise((resolve, reject) => {
    const existing = (typeof getAuthToken === 'function')
      ? getAuthToken() : (sessionStorage.getItem('AUTH_TOKEN') || '');
    
    const pulseUser = (user) => {
      const u = user || '';
      if (typeof setAuthUser === 'function') setAuthUser(u);
      else sessionStorage.setItem('AUTH_USER', u);
    };

    const saveToken = (token) => {
      if (typeof setAuthToken === 'function') setAuthToken(token);
      else sessionStorage.setItem('AUTH_TOKEN', token);
      
      const expireTime = Date.now() + (7200 * 1000); // 2 horas (7200s)
      sessionStorage.setItem('AUTH_EXPIRE', expireTime.toString());
    };

    // 1) Si no hay token → redirigir al formulario de login en pantalla
    const promptLogin = () => {
      clearAuth();
      const loginScreen = document.getElementById("login-screen");
      const appContainer = document.getElementById("app-container");
      // Transición de interfaz hacia la pantalla de acceso
      if (appContainer) appContainer.style.display = "none";
      if (loginScreen) loginScreen.style.display = "flex";
      return reject(new Error('session_required'));
    };
    if (!existing) return promptLogin();

    // 2) Hay token → revalidar con el backend
    netRun()
      .withSuccessHandler(res => {
        if (res && res.ok) {
          if (res.user) pulseUser(res.user);
          resolve(existing);
          return;
        }
        clearAuth();
        promptLogin();
      })
      .withFailureHandler(_ => {
        clearAuth();
        promptLogin();
      })
      .api_auth_check(existing);
  });
}

// --- Utilidades Generales de Interfaz ---
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
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(()=> t.classList.remove('show'), 4000);
}
  
// =========================================================================
// 1. ELIMINAR ÚLTIMO REGISTRO EN BANCO
// =========================================================================
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
    // A) Autenticación
    let token = null;
    try { token = await ensureAuthTokenBanco(); } catch { token = null; }
    if (!token) {
      restore();
      return;
    }

    // B) Estado de carga visual
    btn.disabled = true;
    btn.textContent = '⏳ Procesando...';
    btn.style.color = '#000';
    btn.style.background = '#FAD775';

    // C) Preparar eliminación en Backend
    netRun()
      .withSuccessHandler(async (res) => {
        // Alerta explícita del servidor
        if (res?.alert) {
          alert(res.alert);
          restore();
          return;
        }

        // Requiere código de confirmación
        if (res?.needCode) {
          btn.textContent = '⏳ Validando Código...';
          const ok = await pedirCodigoCliente(res.mensaje, res.code, res.maxAttempts || 3);
          if (!ok) {
            restore();
            return;
          }

          // Confirmación definitiva
          netRun()
            .withSuccessHandler((r2) => {
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
            .withFailureHandler((err) => {
              notificar('❌ Error al confirmar: ' + (err?.message || String(err)));
              restore();
            })
            .deleteRow({ 
              confirmed: true, 
              authToken: token,
              userAuth: window.usuarioActivo(),
              codeUsed: res.code 
            });
          return;
        }

        // Eliminación directa
        if (res?.ok) {
          notificar('✅ Registro eliminado correctamente.');
          document.getElementById('recibos-refresh')?.click();
          if (typeof reloadPage === 'function') reloadPage();
        } else { 
          notificar(res?.error || '⛔ No se pudo eliminar el Registro.');
        } 
        restore();
      })
      .withFailureHandler((err) => {
        notificar('❌ Error al preparar eliminación: ' + (err?.message || String(err)));
        restore();
      })
      .api_banco_delete_prepare({ authToken: token, userAuth: window.usuarioActivo() });

  } catch (e) {
    console.error('Error al Eliminar:', e);
    notificar('⚠️ Error al realizar esta acción.');
    restore();
  }
});

// =========================================================================
// 2. SETEAR METROS CÚBICOS (M3) EN BANCO
// =========================================================================
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
    // A) Capturar el valor PRIMERO (evita bloquear la UI antes del prompt)
    const raw = prompt('Ingrese los m3 indicados en el Recibo:');
    if (raw == null) return; // Usuario canceló

    const s = String(raw).trim().replace(/\s/g, '');
    const num = Number(s.replace(/,/g, ''));
    if (!isFinite(num)) {
      alert('Valor inválido. Ingrese un número (ej.: 1234.56 o 1,234.56).');
      return;
    }

    // B) Si el valor es válido, activamos el estado visual de carga
    btn.dataset._old = btn.textContent;
    btn.disabled = true;
    btn.style.background = '#FAD775';
    btn.style.color = '#000';
    btn.textContent = '⏳ Solicitando…';

    // C) Pintar celda localmente inmediatamente
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);

    if (typeof uiPaintCell === 'function') {
      uiPaintCell({
        row: 9 - 3, col: 16, text: formatted,
        color: '#333333', bg: '#AAAAAA', align: 'center', radius: 8
      });
    }

    // D) Enviar al backend
    netRun()
      .withSuccessHandler((res) => {
        if (res && res.ok) {
          if (window.toast) toast("✅ m3 REGISTRADO");
        } else {
          alert('Error: ' + (res?.error || 'No se pudo registrar m3'));
        }
        restore();
      })
      .withFailureHandler(err => {
        alert('Error al guardar M3: ' + (err?.message || String(err)));
        restore();
      })
      .api_banco_setM3({ value: num, userAuth: window.usuarioActivo() });

  } catch (e) {
    console.error('Error en M3:', e);
    if (window.toast) toast("⚠️ Error al realizar esta acción (⛔)");
    alert(e);
    restore();
  }
});
      
// ABRE FORMULARIO LECTURAS DESDE CONTOMETROS
async function abrirContometrosForm(){
  try {
    // 1. Validar/Obtener Token (redirige al login automáticamente si falla)
    const token = await ensureAuthTokenBanco();
    if (!token) return;
    // 2. Construir la URL e invocar el modal
    const user  = sessionStorage.getItem('AUTH_USER') || '';
    const dlg = document.getElementById('dlgContometros');
    const ifr = document.getElementById('frmContometros');
    const url = window.FORM_CONTOMETROS_URL + (window.FORM_CONTOMETROS_URL.includes('?') ? '&' : '?')
                  + 'token=' + encodeURIComponent(token)
                  + '&user=' + encodeURIComponent(user);
    ifr.src = url;
    dlg.showModal();
  } catch(e) { 
    console.error('No se abrió Contómetros:', e); 
    // Se captura silenciosamente el fallo/cancelación sin lanzar alertas molestas
  }
}

// CARGA PERIODO EN BANCO
// =========================================================================
// 1. CONSULTA DE PERIODO ESPECÍFICO
// =========================================================================
async function refreshBanco() {
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
    // A) Validar selección antes de deshabilitar
    if (!month || !year || Number.isNaN(month) || Number.isNaN(year)) {
      if (window.toast) toast("⚠️ Seleccione mes y año válidos");
      else alert('Seleccione mes y año válidos.');
      return;
    }

    setWorking();

    // B) Ejecución de petición al backend
    if (typeof netRun === 'function') {
      const user = window.usuarioActivo();

      netRun()
        .withSuccessHandler((data) => {
          try {
            banco_renderStyled(data);
          } catch(e) {
            console.error("Error al renderizar:", e);
          } finally {
            restore();
          }
        })
        .withFailureHandler((err) => {
          console.error("Error en servidor:", err);
          restore();
          if (window.toast) toast("🔴 Error al cargar periodo");
        })
        .api_banco_getDashboardData({ year, month, userAuth: user }); // 👈 Punto y coma asegurado
    } else {
      console.error("🔴 netRun no está disponible");
      restore();
    }
  } catch (e) {
    alert('⚠️ Error al Seleccionar Periodo: ' + e);
    restore();
  }
}

// =========================================================================
// 2. RECARGAR/ACTUALIZAR DATOS DEL PERIODO ACTUAL
// =========================================================================
function reloadPage() {
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

  if (btn) {
    btn.dataset._old = btn.textContent;
    btn.disabled = true;
    btn.style.background = '#FAD775';
    btn.style.color = '#000';
    btn.textContent = '⏳Espere...';
  }

  const month = Number(mSel?.value);
  const year  = Number(ySel?.value);
  const user  = window.usuarioActivo();

  netRun()
    .withSuccessHandler((data) => {
      try { 
        if (data && (data.ok === false || data.error)) {
          if (window.toast) toast("🔴 " + (data.error || "Error al actualizar"));
        } else {
          banco_renderStyled(data); 
        }
      } catch(e) {
        console.error("Error al renderizar:", e);
      } finally { 
        restore(); 
      }
    })
    .withFailureHandler((err) => {
      console.error("Error en servidor:", err);
      restore();
      if (window.toast) toast("🔴 Error al conectar con el servidor");
    })
    .api_banco_getDashboardData({ year, month, userAuth: user });
}

// Rellenar combos e iniciar carga del mes en curso
function initBancoCombosFromSheet(){
    const mSel = document.getElementById('banco-month');
    const ySel = document.getElementById('banco-year');
    if (!mSel || !ySel) return;

    netRun()
      .withSuccessHandler(({ months, years, current }) => {
        // 1. Inyectamos las opciones dinámicas
        mSel.innerHTML = months.map(m => `<option value="${m.n}">${m.name}</option>`).join('');
        ySel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

        // 2. Seleccionamos el mes y año actual
        mSel.value = current.month;
        ySel.value = current.year;
        reloadPage(); 
      })
      .withFailureHandler(err => console.error('api_banco_getOptions error:', err))
      .api_banco_getOptions();
}

// RECARGA RECIBOS  
function reloadRecibos(){
  const btn  = document.getElementById('recibos-refresh');
  if (!btn) return;
  // --- pintar estado trabajando
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
  // Observa cambios en la tabla para restaurar al terminar el render
  const tbl = document.getElementById('tabla-recibos');
  let obs;

  try {
    if (tbl) {
      const target = tbl.tBodies && tbl.tBodies[0] ? tbl.tBodies[0] : tbl;
      obs = new MutationObserver(() => {
        // desconecta y restaura tras el próximo frame
        obs.disconnect();
        requestAnimationFrame(safeRestore);
      });
      obs.observe(target, { childList: true, subtree: true });
    }
    setupRecibos();
    // Fallback: si nada cambió en 6s, restauramos igual
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
// ==========================
// Router con carga perezosa
// ==========================
function setupRouter(){
  const side = $$('.sidebar');
  if (!side) return;

  // banderas de inicialización por vista (una vez) – compatible (sin ||=)
  const loaded = (window.__viewsLoaded = window.__viewsLoaded || {
    banco:false, deudas:false, lecturas:false, consultas:false, recibo:false, comunal: false, servicios: false, eventos: false
  });

  function ensureInit(view) {
    try {  /*carga de modulos al ingresar por primera vez*/
      if (view === 'banco' && !loaded.banco) { loaded.banco = true; setupBanco?.(); }
      if (view === 'consultas') { setupConsultas(); }
      //if (view === 'servicios' && !loaded.servicios) { loaded.servicios = true; cargarModuloServicios?.(); }
      //if (view === 'comunal' && !loaded.comunal) { loaded.comunal = true; setupComuna?.(); }
      
      // ✅ Cierre de llaves corregido
      if (view === 'eventos') { cargarEventosLogger(); }
    } catch (e) { 
      console.error('[setupRouter] init error:', e); 
    }
  }
  // Navegación principal del Sidebar
  side.addEventListener('click', async e => {
    const a = e.target.closest('a[data-view]');
    if (!a) return;
    const v = a.getAttribute('data-view');
    // --- CAMBIO VISUAL DE VISTA ---
    $$$('.sidebar a').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
    $$$('.view').forEach(sec => sec.classList.remove('show'));
    const sec = $$('#view-' + v);
    if (sec) sec.classList.add('show');
    ensureInit(v);
  });

  // Inicializar la vista activa por defecto al cargar la app
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
// ====== Badge de estado servidor y User Logg ======
function getUserTag(){
  const user = sessionStorage.getItem('AUTH_USER') || 'unknonw';
  return '🧑-> ' + (user);
}
//función auxiliar para calcular el tiempo restante en formato MM:SS u HH:MM
function getTokenRemainingTime() {
  const expireStr = sessionStorage.getItem('AUTH_EXPIRE');
  if (!sessionStorage.getItem('AUTH_TOKEN') || !expireStr) return '00:00';
  const remainingMs = Number(expireStr) - Date.now();
  if (remainingMs <= 0) return '⛔Expired';
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  // Si le queda más de una hora, mostramos formato H:MM:SS
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  // Si queda menos de una hora, formato estándar MM:SS
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function statusLabel(state) {
  // 🛡️ Sincronización Maestra: Leemos la variable global 'prev' de tu sistema
  const estadoRealSistema = (typeof prev !== 'undefined') ? prev : state;
  // Forzamos los textos exactos que usa tu HTML y tus estilos CSS
  const base = (estadoRealSistema === 'BUSY') ? 'BUSY · Working' : 'IDLE -> OnLine';
  const timeRemaining = getTokenRemainingTime();
  return `${base} \u00A0 ${getUserTag()} \u00A0 ⏱️TimeSession-> ${timeRemaining}`;
}

window.getUserTag = getUserTag;
window.statusLabel = statusLabel;

// === Mini monitor de red + wrapper drop-in ===
let inflight = 0, prev = 'IDLE';

function setState(next){
  if (next === prev) return;
  prev = next;
    document.dispatchEvent(new CustomEvent('NET_STATE_CHANGED', { detail:{ state: next } })); // ✅
  // 1) Pill simple: #netStatePill
  const pill = document.getElementById('netStatePill');
  if (pill){
    const label = statusLabel(next);
    pill.textContent = label;
    pill.classList.toggle('busy', next === 'BUSY');
    pill.classList.toggle('idle', next === 'IDLE');
  }
  // 2) Badge anterior: #srvStatus (opcional)
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

document.addEventListener('NET_STATE_CHANGED', (e) => {
    const el = document.getElementById('srvStatus');
    if (!el) return;
    const s = e.detail?.state;
    el.className = 'srv-badge ' + (s === 'BUSY' ? 'srv-busy' : 'srv-idle');
    const t = el.querySelector('.txt');
    if (t) t.textContent = statusLabel(s);
  }); 

  // DEMO lecturas (utilidades de tabla simple)
  function renderTable({headers, rows}){
    const tbl = $$('#tabla');
    if (!tbl) return;
    if (!headers || !headers.length){
      tbl.innerHTML = '<thead><tr><th>Sin datos</th></tr></thead>';
      return;
    }
    const thead = '<thead><tr>' + headers.map(h => `<th>${escapeHTML(h)}</th>`).join('') + '</tr></thead>';
    const tbody = '<tbody>' + rows.map(r =>
      `<tr>${r.map(c => `<td>${c == null ? '' : escapeHTML(c)}</td>`).join('')}</tr>`
    ).join('') + '</tbody>';
    tbl.innerHTML = thead + tbody;
    const k1=$$('#kpi-registros'), k2=$$('#kpi-actualizado'), k3=$$('#kpi-estado');
    if (k1) k1.textContent = rows.length.toLocaleString();
    if (k2) k2.textContent = new Date().toLocaleString();
    if (k3) k3.textContent = 'OK';
  }

  function cargarTabla(){
    netRun()
    .withSuccessHandler(renderTable)
    .withFailureHandler(err => toast('Error: ' + (err?.message || err)))
    .getTabla();
  }
  function setupSearch(){
    const inp = $$('#buscar');
    if (!inp) return;
    inp.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      $$$('#tabla tbody tr').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  // Abre el formulario Contómetros en el modal-iframe
  function setupContometros(){
    // evita registrarlo dos veces si tu init corre más de una vez
    if (window.__setupContometrosReady) return;
    window.__setupContometrosReady = true;

    const btnNuevo = $$('#btnNuevo');
    const dlg      = $$('#dlgContometros');
    const iframe   = $$('#frmContometros');
    const btnClose = $$('#btnFormClose');
    if (!btnNuevo || !dlg || !iframe) return;

    // URL base desde GAS (via doGet) o constante
    const base = (window.FORM_CONTOMETROS_URL)
      || (window.WEBAPP_BASE ? (window.WEBAPP_BASE + '?page=contometros') : null);

    // Helper para armar URL con cache-buster seguro
    const buildFormUrl = () => {
      if (!base) return null;
      const u = new URL(base, window.location.href);
      u.searchParams.set('ts', Date.now().toString()); // bust cache
      return u.toString();
    };

    // (opcional) spinner / estado
    const showLoading = () => { iframe.style.opacity = '0'; };
    const hideLoading = () => { iframe.style.opacity = '1'; };

    iframe.addEventListener('load', hideLoading);

    // 💎 PROTEGIDO: Volvemos el listener asíncrono para evaluar las credenciales primero
    btnNuevo.addEventListener('click', async () => {
      
      // 1. Forzar validación obligatoria del token de acceso
      let token = null;
      try { 
        token = await ensureAuthTokenBanco(); 
      } catch (e) { 
        token = null; 
      }
      
      // 2. FRENO DE SEGURIDAD: Si no hay token, congelamos el flujo de inmediato
      if (!token) {
        if (window.toast) window.toast('🔐 Autenticación Fallida (⛔)');
        return; 
      }

      // 3. FLUJO AUTORIZADO: Si pasó la firma, recién monta el formulario
      const url = buildFormUrl();
      if (!url){ toast('URL del formulario no disponible'); return; }
      
      // Pequeña pausa opcional de 400ms para que se lea el toast centrado antes del modal
      setTimeout(() => {
        showLoading();
        iframe.src = 'about:blank'; 
        dlg.showModal();
        requestAnimationFrame(() => { iframe.src = url; });
      }, 400);
    });

    btnClose?.addEventListener('click', () => dlg.close());
  }

  function setupSync(){
    const btn = $$('#btnSync');
    if (!btn) return;
    btn?.addEventListener('click', cargarTabla);
  }

  window.$$ = s => document.querySelector(s);
  window.$$$ = s => Array.from(document.querySelectorAll(s));
  window.escapeHTML = function(x){
  return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
};

window.toast = function(msg) {
  const t = document.getElementById('toast');
  if (!t) {  
    return; 
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
};

/* =========================
  BANCO
  ========================= */
const BANCO_HIDDEN_COLS = [8, 9, 10];      // I, J, K ocultas
const BANCO_RIGHT_START = 11;              // L
const BANCO_RIGHT_HEAD_OMIT_ROWS = 2;      // omitir filas 1 y 2 SOLO en L:P
const BANCO_BODY_MERGES = [{ from: 1, to: 4, headerText: 'DESCRIPCIÓN', join: ' ' }]; // B..E combinadas

const BANCO_CENTER_COLS = new Set([7, 11, 12, 14]); // H, L, M, O centradas
const GAP_COLOR = '#566998'; // color del carril separador
const SEP_GAP = 55; // ancho de la “barra” separadora

// paleta zebra
const ZEBRA_LEFT_A  = '#0c1526';
const ZEBRA_LEFT_B  = '#0f1b31';
const ZEBRA_RIGHT_A = '#0c1526';
const ZEBRA_RIGHT_B = '#0f1b31';

// borde sutil en bloque derecho
const RIGHT_BORDER = 'rgba(255,255,255,.08)';

function findMerge(col){
  return BANCO_BODY_MERGES.find(m => col >= m.from && col <= m.to);
}

function buildColGroup(widths){
  if (!widths || !widths.length) return '';
  const cols = [];
  for (let i = 0; i < widths.length; i++){
    if (BANCO_HIDDEN_COLS.includes(i)) continue;        // oculta I,J,K
    if (i === BANCO_RIGHT_START){
      cols.push(`<col class="gap-col" style="width:${SEP_GAP}px">`);
    }
    const px = Math.max(40, Number(widths[i]) || 80);
    cols.push(`<col style="width:${px}px">`);
  }
  return '<colgroup>' + cols.join('') + '</colgroup>';
}

function applyMergesToMatrix(mat, merges){
  const H = mat.length; if (!H) return;
  (merges||[]).forEach(m=>{
    for (let r=m.row; r<m.row+m.rowSpan; r++){
      for (let c=m.col; c<m.col+m.colSpan; c++){
        if (r===m.row && c===m.col) continue;
        if (mat[r] && mat[r][c] != null) mat[r][c] = null;
      }
    }
  });
}

const tbBanco = document.getElementById('tabla-banco');
if (tbBanco) {
  tbBanco.setAttribute('aria-busy','true');
  tbBanco.innerHTML = `
  <tbody>
    <tr>
      <td colspan="100" class="loading-cell"
          style="padding:15px;font-size:18px;font-weight:600;display:flex;align-items:center;gap:8px;">
        <i class="fa-solid fa-hourglass-half fa-spin" aria-hidden="true"></i>
        <span class="tit-value">Cargando Información…</span>
      </td>
    </tr>
  </tbody>`;
}
// FUNCION PRINCIPAL DE CARGA DE ESTILOS A DATABANK
function banco_renderStyled(payload) {
  const tbl = document.getElementById('tabla-banco');
  try {
    const { data, kpis, header } = payload || {};
    if (!tbl || !data?.headers) return;

    const rawHeader = header?.values || [];
    const headers = data.headers || [];

    // ===== 1. DETECCIÓN DE ESTILO SEGÚN PERIODO =====
    const valG1 = rawHeader[0]?.[6] || '';
    let fila3Bg = '#000000';
    let fila3Color = '#ffffff';

    if (header?.esMesActual === false) {
      fila3Bg = '#F4BE3F';
      fila3Color = '#000000';
    } else if (header?.esMesActual === undefined && valG1) {
      const now = new Date();
      const mesesEsp = { enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6, julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12 };
      const tokens = valG1.split(/\s+/);
      const m = mesesEsp[tokens[0]?.toLowerCase()] || parseInt(valG1.split('/')[0], 10) || 0;
      const y = parseInt(tokens[1] || valG1.split('/')[1], 10) || 0;
      
      if (m > 0 && y > 0 && (m !== (now.getMonth() + 1) || y !== now.getFullYear())) {
        fila3Bg = '#D7C567';
        fila3Color = '#000000';
      }
    }

    // ===== 2. BUILD THEAD =====
    let headHtml = '<thead class="sheet-head">';
    
    // FILA 1
    headHtml += `<tr class="row1">
      <th class="head-r1-a">${escapeHTML(rawHeader[0]?.[0] || '')}</th>
      <th colspan="5" class="align-center head-r1-b">${escapeHTML(rawHeader[0]?.[1] || '')}</th>
      <th colspan="2" class="align-center head-r1-b">${escapeHTML(valG1)}</th>`;
    for (let c = 8; c < 18; c++) {
      if (BANCO_HIDDEN_COLS.includes(c)) continue;
      if (c === BANCO_RIGHT_START) headHtml += `<th class="gap-cell" aria-hidden="true"></th>`;
      headHtml += `<th class="head-empty-cell"></th>`;
    }
    headHtml += '</tr>';

    // FILA 2
    headHtml += `<tr class="row2">
      <th class="align-center head-r2-title">${escapeHTML(rawHeader[1]?.[0] || '')}</th>
      <th colspan="5" class="align-center head-r2-subtitle">${escapeHTML(rawHeader[1]?.[1] || '')}</th>
      <th class="align-center head-r2-title">${escapeHTML(rawHeader[1]?.[6] || '')}</th>
      <th class="align-center head-r2-title">${escapeHTML(rawHeader[1]?.[7] || '')}</th>`;
    for (let c = 8; c < 18; c++) {
      if (BANCO_HIDDEN_COLS.includes(c)) continue;
      if (c === BANCO_RIGHT_START) headHtml += `<th class="gap-cell" aria-hidden="true"></th>`;
      headHtml += `<th class="head-empty-cell"></th>`;
    }
    headHtml += '</tr>';

    // FILA 3
    headHtml += `<tr class="row3">
      <th colspan="8" class="align-center head-r3-main" style="background:${fila3Bg}; color:${fila3Color};">${escapeHTML(headers[0] || '')}</th>`;
    
    let colVisualIdx = 8;
    for (let c = 8; c < 18; c++) {
      if (BANCO_HIDDEN_COLS.includes(c)) continue;
      if (c === BANCO_RIGHT_START) headHtml += `<th class="gap-cell head-gap-black" aria-hidden="true"></th>`;

      if (colVisualIdx === 8) {
        headHtml += `<th class="align-center head-block-pmes">P.Mes</th>`;
        colVisualIdx += 1;
      } else if (colVisualIdx === 9) {
        headHtml += `<th colspan="3" class="align-center head-block-pagos">REGISTRO DE PAGOS</th>`;
        colVisualIdx += 3;
      } else if (colVisualIdx === 12) {
        headHtml += `<th class="align-center head-block-dots">...</th>`;
        colVisualIdx += 1;
      } else if (colVisualIdx === 13) {
        headHtml += `<th colspan="2" class="align-center head-block-servicios">PAGO DE SERVICIOS</th>`;
        colVisualIdx += 2;
      } else {
        headHtml += `<th class="align-center head-block-empty"></th>`;
        colVisualIdx += 1;
      }
    }
    headHtml += '</tr></thead>';

    // ===== 3. BUILD TBODY =====
    const rows = data?.rows || [];
    let bodyHtml = '<tbody>';
    const hasFindMerge = typeof findMerge === 'function';
    const hasNorm = typeof norm === 'function';
    const servSet = window.SERV_SET || new Set();
    const depaSet = window.DEPA_SET || new Set();
    const hasServSet = servSet && servSet.size > 0;
    const hasDepaSet = depaSet && depaSet.size > 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const isAlt = (i % 2) === 1;
      bodyHtml += '<tr>';

      for (let j = 0; j < r.length; j++) {
        if (BANCO_HIDDEN_COLS.includes(j)) continue;
        const isTail = j >= (r.length - 2);

        if (j === BANCO_RIGHT_START) {
          bodyHtml += `<td class="gap-cell" aria-hidden="true"><div class="gap-fill" style="background:${GAP_COLOR}"></div></td>`;
        }

        if (hasFindMerge) {
          const m = findMerge(j);
          if (m && j === m.from) {
            const mergedText = r.slice(m.from, m.to + 1).filter(Boolean).join(m.join || ' ');
            const bgBase = isTail ? 'transparent' : (m.from <= 7 ? (isAlt ? ZEBRA_LEFT_B : ZEBRA_LEFT_A) : (isAlt ? ZEBRA_RIGHT_B : ZEBRA_RIGHT_A));
            const borders = (m.from >= BANCO_RIGHT_START && !isTail) ? `border:1px solid ${RIGHT_BORDER};` : 'border:0;';
            bodyHtml += `<td class="align-left" colspan="${m.to - m.from + 1}" style="background:${bgBase};${borders}">${escapeHTML(mergedText)}</td>`;
            j = m.to;
            continue;
          }
        }

        const raw = r[j];
        const s = String(raw ?? '');
        const isNum = /^-?\d[\d.,]*$/.test(s);
        const isDate = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s);
        let cls = BANCO_CENTER_COLS.has(j) ? 'align-center' : (isNum ? 'align-right' : (isDate ? 'align-center' : 'align-left'));

        // Formato específico Columna F (5), Columna G (6) y H (7)
        if (j === 5) {
          cls += ' col-f';
        } else if (j === 6) {
          cls += ' col-g';
          const isSaldo = /SALDO/i.test(String(r[7] ?? ''));
          const n = parseFloat(s.replace(/[^\d.-]/g, ''));
          cls += isSaldo ? ' txt-blue' : ((!isNaN(n) && n < 0) ? ' neg' : ' pos');
        } else if (j === 7) {
          cls += ' col-h txt-boldd';
          const textH = hasNorm ? norm(raw) : s.trim().toUpperCase();
          const prevN = parseFloat(String(r[6] ?? '').replace(/[^\d.-]/g, ''));
        
          if (/SALDO/i.test(s)) cls += ' txt-blue';
          else if (hasServSet && servSet.has(textH)) cls += ' serv';
          else if (!isNaN(prevN) && prevN < 0) cls += ' gast';
          else if (!isNaN(prevN) && prevN > 0 && !(hasDepaSet && depaSet.has(textH))) cls += ' entris';
        }

        const bgBase = isTail ? 'transparent' : (j <= 7 ? (isAlt ? ZEBRA_LEFT_B : ZEBRA_LEFT_A) : (isAlt ? ZEBRA_RIGHT_B : ZEBRA_RIGHT_A));
        const borders = (j >= BANCO_RIGHT_START && !isTail) ? `border:1px solid ${RIGHT_BORDER};` : 'border:0;';

        // Estilos condicionales panel derecho mediante clases CSS
        if (i <= 74) {
          const n = parseFloat(s.replace(/[^\d.-]/g, ''));
          if (j === BANCO_RIGHT_START && !isNaN(n)) {
            cls += (n === 0) ? ' kpi-orange' : (n === 1) ? ' kpi-green' : (n > 1) ? ' kpi-blue' : '';
          } else if (j === BANCO_RIGHT_START + 1) cls += ' kpi-accent';
          else if (j === BANCO_RIGHT_START + 4) cls += ' kpi-brown';
        }
        bodyHtml += `<td class="${cls}" style="background:${bgBase};${borders}">${raw == null ? '' : escapeHTML(raw)}</td>`;
      }
      bodyHtml += '</tr>';
    }
    bodyHtml += '</tbody>';

    // ===== 4. ENSAMBLADO E INYECCIÓN ÚNICA =====
    tbl.classList.add('sheet-table', 'banco-table');
    const generatedWidths = Array(18).fill(100);
    generatedWidths[0] = 30; generatedWidths[4] = 5; generatedWidths[5] = 5;
    generatedWidths[10] = 35; generatedWidths[11] = 62; generatedWidths[12] = 64;
    generatedWidths[13] = 70; generatedWidths[14] = 63; generatedWidths[15] = 40; generatedWidths[16] = 40;

    tbl.innerHTML = (typeof buildColGroup === 'function' ? buildColGroup(generatedWidths) : '') + headHtml + bodyHtml;

    // ===== 5. INTERACTIVIDAD Y KPIS =====
    if (typeof uiPaintCell === 'function') {
      uiPaintCell({ row: 1, col: 15, color: '#995924', align: 'center' });
      uiPaintCell({ row: 2, col: 15, color: '#D36FC1', align: 'center' });
      uiPaintCell({ row: 3, col: 15, color: '#688E87', align: 'center' });
      uiPaintCell({ row: 4, col: 15, color: '#F4BE3F', align: 'center' });
      uiPaintCell({ row: 5, col: 15, color: '#4258FF', align: 'center' });
      uiPaintCell({ row: 6, col: 16, color: '#333333', bg: '#AAAAAA', align: 'center', radius: 8 });
      uiPaintCell({ row: 8, col: 15, color: '#989D9C', bg: '#970C1D', align: 'center', radius: 8 });
    }

    const kMov = document.getElementById('banco-kpi-mov');
    const kMon = document.getElementById('banco-kpi-monto');
    if (kMov) kMov.textContent = (kpis?.totalMov || 0).toLocaleString('es-PE');
    if (kMon) kMon.textContent = (kpis?.totalMonto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  } catch (err) {
    console.error('[BANCO] render error:', err?.stack || err);
    alert('Error render Banco: ' + (err?.message || err));
  } finally {
    document.getElementById('tabla-banco')?.removeAttribute('aria-busy');
  }
}

// fetchers + init
function banco_loadOptions(cb){
  netRun()
    .withSuccessHandler(cb)
    .withFailureHandler(err => toast('Error Opciones Banco: ' + (err?.message || err)))
    .api_banco_getOptions();
}

function banco_loadStyled(params, cb){
  netRun()
    .withSuccessHandler(cb)
    .withFailureHandler(err => toast('Error Banco Estilos: ' + (err?.message || err)))
    .api_banco_getDashboardData(params||{});
}

function setupBanco(){
  const selM = document.getElementById('banco-month');
  const selY = document.getElementById('banco-year');
  const btnR = document.getElementById('banco-buscar');
  if (!selM || !selY) return;

  banco_loadOptions(opts => {
    selM.innerHTML = (opts.months||[]).map(m => `<option value="${m.n}">${m.name}</option>`).join('');
    selY.innerHTML = (opts.years||[]).map(y => `<option value="${y}">${y}</option>`).join('');
    if (opts.current){
      if (String(opts.current.month)) selM.value = String(opts.current.month);
      if (String(opts.current.year))  selY.value = String(opts.current.year);
    }
    banco_loadStyled({ year:Number(selY.value), month:Number(selM.value) }, banco_renderStyled);
  });
}

// --- Helpers de columnas visibles (respetan colSpan) ---
function _getCellByVisIndex(tr, visCol1){
  let acc = 0;
  for (const td of tr.cells){
    const span = td.colSpan || 1;
    const start = acc + 1;
    const end   = acc + span;
    if (visCol1 >= start && visCol1 <= end) return td;
    acc = end;
  }
  return null;
}

// Pinta/edita una celda existente por índice de COLUMNA VISIBLE (1-based)
function uiPaintCell(opt){
  const {
    tableId='tabla-banco', section='tbody', row=1, col=1, rowSpan=1, colSpan=1,
    text, bg, color, align, bold=true, border, radius, padding
  } = opt || {};
  const tbl = document.getElementById(tableId);
  if (!tbl) return;
  const sec = section==='thead' ? tbl.tHead :section==='tfoot' ? tbl.tFoot  :(tbl.tBodies && tbl.tBodies[0]) || null;
  if (!sec) return;
  const tr = sec.rows[row-1];
  if (!tr) return;
  const cell = _getCellByVisIndex(tr, col);
  if (!cell) return;

  if (text   !== undefined) cell.textContent = text;
  if (bg     !== undefined) cell.style.background = bg;
  if (color  !== undefined) cell.style.color = color;
  if (align  !== undefined) cell.style.textAlign = align;
  if (bold   !== undefined) cell.style.fontWeight = bold ? '700' : '400';
  if (border !== undefined) cell.style.border = border;
  if (radius !== undefined) cell.style.borderRadius = (radius|0)+'px';
  if (padding!== undefined) cell.style.padding = padding;
  if (rowSpan && rowSpan > 1) cell.rowSpan = rowSpan;
  if (colSpan && colSpan > 1) cell.colSpan = colSpan;
}
window.uiPaintCell = uiPaintCell;

/// seccion Registro
function setupBancoFormModal(){
  const btn = document.getElementById('banco-nuevo');
  const dlg = document.getElementById('dlgBancoForm');
  const ifr = document.getElementById('frmBancoForm');
  const btnClose = document.getElementById('btnBancoFormClose');
  if (!btn || !dlg || !ifr) return;

  const buildUrl = () => {
    const base = window.FORM_BANCO_URL || (window.WEBAPP_BASE ? (window.WEBAPP_BASE + '?page=banco-form') : null);
    if (!base) return null;
    const u = new URL(base, location.href);
    u.searchParams.set('ts', Date.now().toString()); // cache-buster
    return u.toString();
  };

  function closeBancoForm(){
    if (dlg?.open) dlg.close();
    if (ifr) ifr.src = 'about:blank';
    // refresca Banco con el mes/año actuales
    try{
      const m = Number(document.getElementById('banco-month')?.value);
      const y = Number(document.getElementById('banco-year')?.value);
      if (!isNaN(m) && !isNaN(y) && typeof banco_loadStyled === 'function') {
        banco_loadStyled({ year:y, month:m }, banco_renderStyled);
      }
    }catch(e){}
  }
  window.closeBancoForm = closeBancoForm;
  
  // 💎 PROTEGIDO: Volvemos el listener asíncrono para evaluar el token primero
  btn.addEventListener('click', async () => {
    
    let token = null;
    try { 
      token = await ensureAuthTokenBanco(); 
    } catch (e) { 
      token = null; 
    }
    // 2. Freno si no se autoriza
    if (!token) {
      return; 
    }
    // 3. Apertura inmediata del formulario
    const url = buildUrl();
    if (!url) return;
    ifr.src = 'about:blank';
    dlg.showModal();
    requestAnimationFrame(() => { ifr.src = url; });
  });
  
  btnClose?.addEventListener('click', closeBancoForm);
}

/* =========================
  DEUDAS
  ========================= */
function deudas_loadData(params, cb){
  const tbl = document.getElementById('tabla-deudas');
  if (tbl) tbl.innerHTML = `
  <tbody>
    <tr>
      <td colspan="10" class="loading-cell">
        <i class="fa-solid fa-hourglass-half fa-spin" aria-hidden="true"></i>
        <span class="tit-value">Creando listado…</span>
      </td>
    </tr>
  </tbody>`;
  netRun()
    .withSuccessHandler(cb)
    .withFailureHandler(err => toast('Seccion Deudas error: ' + (err?.message || err)))
    .api_deudas_refreshAndGet(params || {});
}

function deu_formatNumber(n){
  const num = (typeof n === 'number') ? n : Number(n);
  return isNaN(num) ? (n==null?'':String(n)) : num.toLocaleString('es-PE', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function deu_formatDate(x) {
  if (!x) return '';
  const s = String(x).trim();
  // Si ya es un string tipo "03/08/2026" o "03-08-2026"
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yy = m[3].slice(-2); // Extrae los últimos 2 dígitos del año
    return `${dd}-${mm}-${yy}`;
  }
  // Si es un objeto Date o Timestamp
  const d = new Date(x);
  if (isNaN(d.getTime())) return s;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function deudas_render(payload) {
  try {
    const tbl = document.getElementById('tabla-deudas');
    if (!tbl) return;

    const { headers = [], rows = [], meta = {} } = payload || {};

    const colgroup = `
      <colgroup>
        <col style="width:9%">
        <col style="width:20%">
        <col style="width:11%">
        <col style="width:11%">
        <col style="width:12%">
        <col style="width:12%">
        <col style="width:12%">
        <col style="width:12%">
        <col style="width:12%">
        <col style="width:7%">
      </colgroup>`;

    // THEAD
    let thead = '<thead>';
    thead += `<tr><th colspan="10">${escapeHTML(meta.title || 'DEUDAS')}</th></tr>`;
    thead += '<tr>' + headers
      .map(h => `<th>${escapeHTML(h)}</th>`)
      .join('') + '</tr>';
    thead += '</thead>';

    // TBODY
    let tbody = '<tbody>';
    const n = rows.length;

    for (let i = 0; i < Math.max(0, n - 1); i++) {
      const r = rows[i];
      tbody += '<tr>';

      for (let j = 0; j < r.length; j++) {
        let val = r[j], html;
        let classes = [];

        // Alineaciones y Formatos
        if ([2, 3, 5, 6, 7, 8].includes(j)) {
          html = deu_formatNumber(val);
          classes.push('numeric');
        } else if (j === 4) {
          html = deu_formatDate(val);
        } else {
          html = (val == null ? '' : escapeHTML(val));
        }

        // Clases Estructurales y Colores por Columna
        if ([0, 5, 8].includes(j)) classes.push('bold');
        if (j === 1) { classes.push('text-left', 'col-titular'); }
        if (j === 3) { classes.push('col-4', 'col-blue-dark'); }
        if (j === 4) { classes.push('col-5', 'col-blue-dark'); }
        if (j === 5) { classes.push('col-6', 'col-red-light'); }
        if (j === 8) { classes.push('col-9', 'col-orange-dark'); }

        // Ocultar ceros exactos
        if (String(html).trim() === '0.00') html = '';

        const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
        tbody += `<td${classAttr}>${html}</td>`;
      }
      tbody += '</tr>';
    }

    // Fila TOTALES
    if (n > 0) {
      const last = rows[n - 1] || [];
      tbody += '<tr class="row-totales">';
      tbody += `<td colspan="5" class="label-totales">TOTALES:</td>`;

      for (let j = 5; j < 10; j++) {
        const v = last[j];
        let html;

        if (j === 9) {
          const num = Number(v);
          html = isNaN(num) ? '' : num.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        } else {
          html = deu_formatNumber(v);
          if (String(html).trim() === '0.00') html = '';
        }

        tbody += `<td class="numeric val-totales">${html}</td>`;
      }
      tbody += '</tr>';
    }

    tbody += '</tbody>';

    // Inyección en DOM
    tbl.innerHTML = colgroup + thead + tbody;

    // Actualización de KPIs
    const elCount = document.getElementById('deu-kpi-count');
    const elFecha = document.getElementById('deu-kpi-fecha');

    if (elCount) {
      const num = Number(meta.count);
      elCount.textContent = Number.isFinite(num) ? num.toLocaleString('es-PE') : (meta.count ?? '—');
    }
    if (elFecha) {
      elFecha.textContent = meta.fecha ? String(meta.fecha) : '—';
    }

  } catch (err) {
    console.error('[DEUDAS] render error:', err && err.stack || err);
    alert('Error render Deudas: ' + (err?.message || err));

    const tbl = document.getElementById('tabla-deudas');
    if (tbl) {
      const msg = escapeHTML(err?.message || String(err));
      // Estructura HTML válida dentro de una tabla
      tbl.innerHTML = `<tbody><tr><td colspan="10" class="error-cell">Error al renderizar Deudas: ${msg}</td></tr></tbody>`;
    }
  }
}

function setupDeudas() {
  const $min = document.getElementById('deu-min');
  const $btnR = document.getElementById('deu-refresh');

  const recargar = () => {
    const min = Number($min && $min.value);
    if (typeof deudas_loadData === 'function') {
      deudas_loadData({ minDebt: isNaN(min) ? 0 : min }, deudas_render);
    }
  };

  if ($btnR) {
    // Remover listener previo para evitar duplicaciones si se re-inicializa
    $btnR.removeEventListener('click', recargar);
    $btnR.addEventListener('click', recargar);
  }

  recargar();
}

/* ====================================
   LECTURAS / CONTÓMETROS 
   Render 1:1
   ==================================== */

function cont_buildColGroup(widths) {
  if (!Array.isArray(widths) || !widths.length) return '';
  const cols = widths.map(w => {
    const px = Number(w);
    const final = Number.isFinite(px) ? px : 81;
    return `<col style="width:${final}px">`;
  });
  return '<colgroup>' + cols.join('') + '</colgroup>';
}

function cont_applyMergesToMatrix(mat, merges) {
  if (!Array.isArray(mat) || !Array.isArray(merges)) return;
  const H = mat.length;
  if (!H) return;
  merges.forEach(m => {
    const rEnd = m.row + m.rowSpan;
    const cEnd = m.col + m.colSpan;
    for (let r = m.row; r < rEnd; r++) {
      for (let c = m.col; c < cEnd; c++) {
        if (r === m.row && c === m.col) continue;
        if (mat[r] && mat[r][c] != null) mat[r][c] = null;
      }
    }
  });
}

function cont_findTopLeftMerge(merges, r, c) {
  return (merges || []).find(m => m.row === r && m.col === c) || null;
}

function cont_alignClass(a) {
  const ha = String(a || 'left').toLowerCase();
  return ha === 'right' ? 'align-right' : (ha === 'center' ? 'align-center' : 'align-left');
}

const WRAP_COLS = new Set([1, 12, 13, 14, 15, 16]);
const CENTER_BODY_COLS = new Set([0, 10, 11, 12, 13, 14, 15, 16]);
const FONDOS_ULTIMOS = ['#b2d997', '#e79191', '#3c78d8', '#27ae60'];
function contometros_renderStyled(payload) {
  try {
    const tbl = document.getElementById('tabla');
    if (!tbl) return;

    const colWidths = payload?.colWidths || [];
    const header = payload?.header || {};
    const data = payload?.data || {};

    // ===== THEAD =====
    const Hvals = (header.values || []).map(r => r.slice());
    const Hmerg = header.merges || [];
    cont_applyMergesToMatrix(Hvals, Hmerg);
    const H = Hvals.length;
    const W = H ? (Hvals[0]?.length || 0) : ((data.values?.[0]?.length) || 0);

    let headHtml = '<thead class="sheet-head">';
    for (let r = 0; r < H; r++) {
      const rh = header.rowHeights?.[r];
      const trStyle = Number.isFinite(rh) ? ` style="height:${rh}px"` : '';
      headHtml += `<tr class="row${r + 1}"${trStyle}>`;

      for (let c = 0; c < W; c++) {
        const val = Hvals[r][c];
        if (val === null) continue;

        const merge = cont_findTopLeftMerge(Hmerg, r, c);
        const span = merge ? ` rowspan="${merge.rowSpan}" colspan="${merge.colSpan}"` : '';

        let bg = '#1a2230';
        let col = '#ffffff';
        let fw = 'bold';

        const textStr = String(val ?? '').trim();

        // Colores de Encabezado
        if (r === 1 && c === 0) { bg = '#F1C40F'; col = '#000000'; }
        else if (c === 3 && (r === 0 || r === 2)) { bg = '#3367D6'; col = '#ffffff'; }
        else if (r === 0 && c === 5) { bg = '#000000'; col = '#ffffff'; }
        else if (r === 0 && c === 8) { bg = '#E67E22'; col = '#ffffff'; }
        else if (textStr === 'Fecha') { bg = '#b5b8a4'; col = '#000000'; }
        else if (r === 2 && c === 8) { bg = '#E67E22'; col = '#ffffff'; }
        else if (r === 2 && c === 0) { bg = '#27ae60'; col = '#ffffff'; }
        else if (r === 2 && c === 10) { bg = '#ffffff'; col = '#2563eb'; }

        if (c >= 12 && c <= 15) {
          bg = FONDOS_ULTIMOS[c - 12];
          col = (c === 14) ? '#ffffff' : '#000000';
        }

        const needsWrap = WRAP_COLS.has(c);
        const cls = 'align-center' + (needsWrap ? ' wrap' : '');
        let styles = `background:${bg};color:${col};font-weight:${fw};`;

        if (needsWrap) {
          const w = colWidths?.[c];
          if (Number.isFinite(w)) styles += `max-width:${w}px;`;
        }

        const textOut = textStr
          .replace(/[\u00A0\u202F]/g, ' ')
          .replace(/\r?\n/g, ' ')
          .replace(/\s{2,}/g, ' ');

        headHtml += `<th class="${cls}" style="${styles}"${span}><div style="text-align:center;">${escapeHTML(textOut)}</div></th>`;
      }
      headHtml += '</tr>';
    }
    headHtml += '</thead>';

    // ===== TBODY =====
    const Bvals0 = (data.values || data.rows || []).map(r => r.slice());
    const Bmerg = data.merges || [];
    const Bvals = Bvals0.map(row => {
      const arr = Array.isArray(row) ? row.slice() : [];
      if (W && arr.length < W) arr.length = W;
      return arr;
    });
    cont_applyMergesToMatrix(Bvals, Bmerg);

    let bodyHtml = '<tbody>';
    for (let r = 0; r < Bvals.length; r++) {
      const baseRh = data.rowHeights?.[r];
      const rhBody = Number.isFinite(baseRh) ? Math.max(16, Math.round(baseRh * 0.40)) : null;
      bodyHtml += '<tr style="height: 60px;">';

      for (let c = 0; c < W; c++) {
        const val = Bvals[r][c];
        if (val === null) continue;
        const merge = cont_findTopLeftMerge(Bmerg, r, c);
        const span = merge ? ` rowspan="${merge.rowSpan}" colspan="${merge.colSpan}"` : '';

        let bg = (r % 2 === 0) ? '#111827' : '#1f2937';
        let col = '#e2e8f0';
        let fw = 'normal';

        if (c === 10) { bg = '#9e9c75'; col = '#000000'; fw = 'bold'; }
        else if (c === 11) { bg = '#000000'; col = '#000000'; }
        else if (c === 0) { bg = '#141d26'; col = '#ffffff'; fw = 'bold'; }
        else if (c === 3) { col = '#3498db'; fw = 'bold'; }
        else if (c === 8) { col = '#E67E22'; fw = 'bold'; }

        // Columnas M, N, O, P
        if (c === 12) {
          col = '#2ecc71';
        } else if (c === 13) {
          const valAlerta = String(val ?? '').trim();
          col = (valAlerta !== '-' && valAlerta !== '' && valAlerta !== '—') ? '#e74c3c' : '#95a5a6';
          fw = 'bold';
        } else if (c === 14) {
          col = '#ffffff';
        } else if (c === 15) {
          col = '#f39c12';
          fw = 'bold';
        }

        let ha = data.hAligns?.[r]?.[c] || 'left';
        if (c === 1) ha = 'left';
        else if (CENTER_BODY_COLS.has(c)) ha = 'center';

        const needsWrap = WRAP_COLS.has(c);
        const cls = (needsWrap ? 'wrap ' : '') + cont_alignClass(ha);
        let styles = `background:${bg};color:${col};font-weight:${fw};height:60px;line-height:14px;`;

        if (!needsWrap && Number.isFinite(rhBody)) {
          styles += `line-height:${Math.max(10, rhBody - 6)}px;`;
        }
        if (needsWrap) {
          const w = colWidths?.[c];
          if (Number.isFinite(w)) styles += `max-width:${w}px;`;
        }

        bodyHtml += `<td class="${cls}" style="${styles}"${span}><div style="text-align:${ha};">${val == null ? '' : escapeHTML(String(val))}</div></td>`;
      }
      bodyHtml += '</tr>';
    }
    bodyHtml += '</tbody>';

    // ===== CONTROL DE ANCHOS Y INYECCIÓN EN DOM =====
    const adjColWidths = Array.isArray(colWidths) ? colWidths.slice() : [];
    while (adjColWidths.length < W) adjColWidths.push(85);

    tbl.classList.add('sheet-table');
    tbl.innerHTML = cont_buildColGroup(adjColWidths) + headHtml + bodyHtml;

  } catch (err) {
    console.error('[LECTURAS] render error:', err);
  }
}

/** Llama al servidor (GAS) para traer formato+datos de Contómetros */
function contometros_loadStyled(params = {}, cb) {
  const tbl = document.getElementById('tabla');
  
  // Solo inserta el spinner dentro si la tabla está totalmente vacía o es la primera carga
  if (tbl && (!tbl.rows || tbl.rows.length === 0 || tbl.querySelector('.loading-cell'))) {
    tbl.classList.add('sheet-table');
    tbl.innerHTML = `
      <tbody>
        <tr>
          <td colspan="100" class="loading-cell">
            <i class="fa-solid fa-hourglass-half fa-spin" aria-hidden="true"></i>
            <span class="tit-value">Cargando Lecturas…</span>
          </td>
        </tr>
      </tbody>`;
  }

  netRun()
    .withSuccessHandler(payload => {
      if (!payload || payload.error) {
        if (tbl) {
          tbl.innerHTML = `<tbody><tr><td class="error-cell">Payload vacío (¿deployment viejo?).</td></tr></tbody>`;
        }
        return;
      }
      
      // Ejecuta la función de pintado que optimizamos anteriormente
      if (typeof cb === 'function') cb(payload);
    })
    .withFailureHandler(err => {
      console.error('[LECTURAS] GAS error:', err);
      if (window.toast) toast('Lecturas Server Error: ' + (err?.message || err));
      if (tbl) {
        tbl.innerHTML = `<tbody><tr><td class="error-cell">Error: ${escapeHTML(err?.message || String(err))}</td></tr></tbody>`;
      }
    })
    .api_contometros_getStyled(params); // 👈 Pasa 'params' al servidor en lugar de {}
}

function closeContometrosForm() {
  const dlg = document.getElementById('dlgContometros');
  const ifr = document.getElementById('frmContometros');
  if (dlg && dlg.open) dlg.close();
  if (ifr) ifr.src = 'about:blank';
  contometros_loadStyled({}, contometros_renderStyled);
}

/* =========================
   CONSULTAS - Lógica General
   ========================= */
function setupConsultasSelect() {
  const sel = document.getElementById('consulta-depa');
  if (!sel) return;

  const norm = window.norm || (s => String(s || '').trim().toUpperCase());

  // Helper para actualizar los Sets globales de la app
  const hidratarSetsGlobales = (depas, servs) => {
    if (Array.isArray(depas) && depas.length) {
      window.DEPA_SET = new Set(depas.map(norm));
    }
    if (Array.isArray(servs) && servs.length) {
      window.SERV_SET = new Set(servs.map(norm));
    }
  };

  const popularCombo = (depaIds) => {
    const items = Array.isArray(depaIds) ? depaIds.slice() : [];
    const seen = new Set();
    const uniques = [];
    for (const v of items) {
      const k = norm(v);
      if (k && !seen.has(k)) { 
        seen.add(k); 
        uniques.push(v); 
      }
    }
    uniques.sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' }));
    sel.innerHTML =
      `<option value="">Select Depa...</option>` +
      uniques.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
  };

  // 1. Si ya existe en memoria global, lo pinta e hidrata los Sets de inmediato
  if (typeof window.LISTAS !== 'undefined' && window.LISTAS?.depaIds?.length) {
    hidratarSetsGlobales(window.LISTAS.depaIds, window.LISTAS.servIds);
    popularCombo(window.LISTAS.depaIds);
    return;
  }

  // 2. Si no existe (en GitHub Pages), pide al backend y guarda en memoria global + Sets
  netRun()
    .withSuccessHandler((res) => {
      const depas = res?.depaIds || (Array.isArray(res) ? res : []);
      const servs = res?.servIds || [];

      window.LISTAS = window.LISTAS || {};
      window.LISTAS.depaIds = depas; // Guardar en caché global
      window.LISTAS.servIds = servs;

      // 👈 AQUÍ POBLAMOS LOS SETS PARA QUE BANCO_RENDERSTYLED TENGA ACCESO
      hidratarSetsGlobales(depas, servs);

      popularCombo(depas);
    })
    .withFailureHandler((err) => {
      console.error('Error al cargar lista de departamentos:', err);
    })
    .getListasIdBanco();
}

// HELPERS DE TABLA Y PARSEO
function cons_buildThead() {
  return `
    <thead>
      <tr>
        <th class="rec-header align-center" colspan="2">📑 RECIBOS EMITIDOS</th>
        <th class="mov-header align-center" colspan="3">🏦 MOVIMIENTOS BANCARIOS</th>
      </tr>
      <tr>
        <th class="rec-header">Fecha-Recibo</th>
        <th class="rec-header">Monto-Recibo</th>
        <th class="mov-header">Fecha-Pago</th>
        <th class="mov-header">Descripción</th>
        <th class="mov-header">Abono</th>
      </tr>
    </thead>`;
}

function cons_formatoPEN(n) {
  return Number(n || 0).toLocaleString('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
}

function cons_parseMontoCell(txt) {
  const raw = (txt ?? '').toString().replace(/\u00A0/g, '').trim();
  if (!raw) return 0;
  const neg = raw.includes('-');
  let s = raw.replace(/-/g, '').replace(/[^\d.,]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot   = s.lastIndexOf('.');
  const lastSep   = Math.max(lastComma, lastDot);

  if (lastSep >= 0) {
    const intPart = s.slice(0, lastSep).replace(/[^\d]/g, '');
    const decPart = s.slice(lastSep + 1).replace(/[^\d]/g, '');
    s = intPart + (decPart ? '.' + decPart : '');
  } else {
    s = s.replace(/[^\d]/g, '');
  }
  let n = s ? parseFloat(s) : 0;
  if (isNaN(n)) n = 0;
  return neg ? -n : n;
}

function cons_obtenerClaveMesAnio(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor)) {
    return valor.getFullYear() + "-" + (valor.getMonth() + 1);
  }
  const t = (valor ?? '').toString().trim();
  const m = t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let mes  = parseInt(m[2], 10);
    let anio = m[3];
    if (anio.length === 2) anio = "20" + anio;
    return anio + "-" + mes;
  }
  return null;
}

function cons_render(data) {
  if (data) window.lastDataConsultas = data;
  const tbl = document.getElementById('tabla-cons');
  if (!tbl) return;

  tbl.removeAttribute('aria-busy');

  const meta = document.getElementById('cons-meta');
  if (meta) {
    const depa = data?.activeValue ?? '—';
    const tit  = data?.titular ?? '—';
    meta.innerHTML = `<span class="label">Dpto:</span> <span class="value">${escapeHTML(depa)}</span> ·
      <span class="label">🧑:</span> <span class="value tit-value">${escapeHTML(tit)}</span>`;
  }

  const colgroup = `
    <colgroup>
      <col><col><col><col><col>
    </colgroup>`;

  // Si no hay datos para el departamento
  if (!data || (!data.movim?.length && !data.recibos?.length)) {
    if (meta) {
      const depa = data?.activeValue ?? '—';
      const tit  = data?.titular ?? '—';
      meta.innerHTML = `<span class="label">Dpto:</span> <span class="value">${escapeHTML(depa)}</span> ·
        <span class="label">Titular:</span> <span class="value tit-value">${escapeHTML(tit)}</span>`;
    }
    tbl.innerHTML = colgroup + cons_buildThead() +
      `<tbody><tr><td colspan="5" style="padding:10px; text-align:center;">Sin datos para el departamento seleccionado.</td></tr></tbody>`;
    
    document.getElementById('cons-totB').textContent = cons_formatoPEN(0);
    document.getElementById('cons-totE').textContent = cons_formatoPEN(0);
    const difEl = document.getElementById('cons-difBE');
    if (difEl) {
      difEl.textContent = cons_formatoPEN(0);
      difEl.classList.remove('m-pos', 'm-neg');
    }
    return;
  }

  const movim   = data.movim   || []; 
  const recibos = data.recibos || []; 
  const totalFilas = Math.max(movim.length, recibos.length);

  // Conteo por mes-año (para ícono de pagos múltiples)
  const mesAnioCounts = {};
  movim.forEach(m => {
    const valor = m && m[0];
    const key = cons_obtenerClaveMesAnio(valor);
    if (key) mesAnioCounts[key] = (mesAnioCounts[key] || 0) + 1;
  });

  // =========================================================================
  // PARSER SEGURO CON MARGEN DE TOLERANCIA DECIMAL (EPSILON = 0.01)
  // =========================================================================
  const parseSeguro = (valStr) => {
    if (valStr === null || valStr === undefined) return 0;
    const limpio = String(valStr).replace(/[^0-9.-]/g, '');
    const num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
  };

  // 🔴 LECTURA DIRECTA: Prioriza el valor enviado por el Backend en data.saldoDeudaRecibos
  let saldoDeudaRestante = data?.saldoDeudaRecibos !== undefined
    ? Math.round(Number(data.saldoDeudaRecibos) * 100) / 100
    : parseSeguro(document.getElementById('s-rec')?.textContent);

  const marcasRecibos = recibos.map(r => {
  const montoRecibo = parseSeguro(r[1]);
    
    if (montoRecibo <= 0 || saldoDeudaRestante <= 0) {
      return ''; // Sin marca (Pagado al 100%)
    }

    const dif = saldoDeudaRestante - montoRecibo;

    if (dif >= -0.01) {
      // Deuda cubre el 100% del recibo -> Pendiente Total
      saldoDeudaRestante = Math.max(0, dif);
      return ' <span title="Pendiente de Pago (100%)" style="cursor:help;">🔴</span>';
    } else {
    // Deuda cubre solo una parte -> La deuda restante es lo que falta de este recibo
    const faltaPagar = saldoDeudaRestante;
    saldoDeudaRestante = 0;

    const porcentajePagado = Math.round(((montoRecibo - faltaPagar) / montoRecibo) * 100);
    // Evaluamos si lo adeudado supera el 50% del valor del recibo
    const esDeudaMayor50 = faltaPagar > (montoRecibo * 0.50);
      

    if (esDeudaMayor50) {
      // Deuda > 50%: Suma al R.A. (Amarillo)
      return ` <span title="Pago Parcial del ${porcentajePagado}% (Falta: ${cons_formatoPEN(faltaPagar)})" style="cursor:help;">🟡</span>`;
    } else {
      // Deuda <= 50%: Abono fuerte / Saldo insignificante (Verde)
      return ` <span title="Pago Parcial del ${porcentajePagado}% (Falta: ${cons_formatoPEN(faltaPagar)})" style="cursor:help;">🟢</span>`;
    }
  }
  });
  // =========================================================================
  // =========================================================================

  let tbody = '';
  for (let i = 0; i < totalFilas; i++) {
    const rec = recibos[i] || ["", ""];
    const mov = movim[i]   || ["", "", ""];

    const aHTML = rec[0] != null ? escapeHTML(rec[0]) : '';
    let bHTML = rec[1] != null ? escapeHTML(rec[1]) : '';

    // Inyección visual de la marca
    if (bHTML && marcasRecibos[i]) {
      bHTML += marcasRecibos[i];
    }

    let cHTML = mov[0] != null ? escapeHTML(mov[0]) : '';
    const key = cons_obtenerClaveMesAnio(mov[0]);
    if (cHTML && key && mesAnioCounts[key] > 1) {
      cHTML += ' <span title="Mes con múltiples pagos" style="cursor:help;">ℹ️</span>';
    }
    const dHTML = mov[1] != null ? escapeHTML(mov[1]) : '';
    const eHTML = mov[2] != null ? escapeHTML(mov[2]) : '';

    tbody += `<tr>
      <td>${aHTML}</td>
      <td class="col-rec-monto">${bHTML}</td>
      <td>${cHTML}</td>
      <td>${dHTML}</td>
      <td class="col-mov-abono">${eHTML}</td>
    </tr>`;
  }

  tbl.innerHTML = colgroup + cons_buildThead() + `<tbody>${tbody}</tbody>`;

  // Cálculo de totales desde el DOM (sin alterar lógica ni resultados)
  const tb = tbl.tBodies[0];
  let sumB = 0, sumE = 0;
  for (const tr of tb.rows) {
    if (!tr.cells || tr.cells.length < 5) continue;
    sumB += cons_parseMontoCell(tr.cells[1].textContent);
    sumE += cons_parseMontoCell(tr.cells[4].textContent);
  }
  const diff = sumB - sumE;

  const put = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = cons_formatoPEN(val);
  };
  put('cons-totB', sumB);
  put('cons-totE', sumE);

  const difEl = document.getElementById('cons-difBE');
  if (difEl) {
    difEl.textContent = cons_formatoPEN(diff);
    difEl.classList.remove('m-pos', 'm-neg');
    if (diff < 0) difEl.classList.add('m-neg');
    else if (diff > 0) difEl.classList.add('m-pos');
  }
}

function cons_irARecibo(ref, mesTexto) {
  netRun()
    .withSuccessHandler(() => {
      if (window.toast) toast("Recibo Encontrado");
    })
    .seleccionarRecibo(ref, mesTexto);
}

function cons_resetTotales(placeholder = '—') {
  const put = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  put('cons-totB', placeholder);
  put('cons-totE', placeholder);
  const difEl = document.getElementById('cons-difBE');
  if (difEl) {
    difEl.textContent = placeholder;
    difEl.classList.remove('m-pos', 'm-neg');
  }
}

async function cons_consultar() {
  const sel = document.getElementById('consulta-depa');
  const val = (sel && sel.value || '').trim();
  const tbl = document.getElementById('tabla-cons');
  const btn = document.getElementById('cons-buscar');

  if (!val) {
    if (typeof window.toast === 'function') toast("⚠️ Selecciona el Departamento a Consultar (❓)");
    return;
  }

  // 1. Loader e interfaz inicial
  const panelSaldos = document.getElementById('panel-saldos-container');
  const loaderSaldos = document.getElementById('s-loader');
  if (panelSaldos) panelSaldos.style.display = 'block';
  if (loaderSaldos) loaderSaldos.classList.remove('hidden');

  ['s-depa', 's-rec', 's-acum', 's-mor', 's-mul', 's-act'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '...';
  });

  const prevTxt = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Espere…'; }

  const meta = document.getElementById('cons-meta');
  if (meta) {
    meta.innerHTML = `<span class="label">Dpto:</span> <span class="value">${escapeHTML(val)}</span> · <span class="label">Titular:</span> <em> -- </em>`;
  }

  if (tbl) {
    tbl.setAttribute('aria-busy', 'true');
    tbl.innerHTML = `
      <tbody>
        <tr>
          <td colspan="5" class="loading-cell" style="padding:15px;text-align:center;">
            <i class="fa-solid fa-hourglass-half fa-spin" aria-hidden="true"></i>
            <span class="tit-value"> Cargando Historial…</span>
          </td>
        </tr>
      </tbody>`;
  }

  if (typeof cons_resetTotales === 'function') cons_resetTotales();
  const resetBtn = () => { if (btn) { btn.disabled = false; btn.textContent = prevTxt || '🔎 Consultar'; } };

  // 2. Intento de autenticación seguro
  /*
  let token = null;
  try { 
    if (typeof ensureAuthTokenBanco === 'function') {
      token = await ensureAuthTokenBanco(); 
    }
  } catch (e) { 
    console.warn("Fallo en auth:", e);
    token = null; 
  }

  

  if (!token) {
    if (tbl) { tbl.removeAttribute('aria-busy'); tbl.innerHTML = ''; }
    resetBtn();
    if (typeof window.toast === 'function') toast("🔐 Autenticación Fallida (⛔)");
    return;
  }*/

  const userActivo = (typeof window.usuarioActivo === 'function') 
    ? window.usuarioActivo() 
    : (sessionStorage.getItem('AUTH_USER') || 'UNKNOWN');

  // 3. Petición 1: Historial de Recibos y Movimientos
  netRun()
    .withSuccessHandler((data) => {
      if (typeof cons_render === 'function') cons_render(data);
      tbl?.removeAttribute('aria-busy');
      resetBtn();
    })
    .withFailureHandler((err) => {
      console.error("Error getRecibosMovimientos:", err);
      if (meta) meta.textContent = 'No se pudo cargar el titular.';
      if (typeof cons_resetTotales === 'function') cons_resetTotales();
      if (tbl) {
        tbl.innerHTML = `<tbody><tr><td colspan="5" style="padding:12px;color:#fca5a5;text-align:center;">Error al cargar datos del servidor.</td></tr></tbody>`;
        tbl.removeAttribute('aria-busy');
      }
      resetBtn();
    })
    .getRecibosMovimientos(val, userActivo);

  // 4. Petición 2: Saldos del Departamento
  netRun()
    .withSuccessHandler((saldosData) => {
      cons_renderSaldos(saldosData);
    })
    .withFailureHandler((err) => {
      console.error("Error api_Saldos_Para_Modal:", err);
      document.getElementById("s-loader")?.classList.add("hidden");
    })
    .api_Saldos_Para_Modal(val);
}

function cons_renderSaldos(data) {
  if (!data) return;

  const cleanNum = (val) => {
    if (typeof val === 'number') return val;
    const n = parseFloat(String(val || 0).replace(/[^\d.-]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  try {
    document.getElementById("s-depa").textContent = data.depa || '';
    document.getElementById("s-rec").textContent  = cons_formatoPEN(cleanNum(data.rec));
    document.getElementById("s-mor").textContent  = cons_formatoPEN(cleanNum(data.mor));
    document.getElementById("s-mul").textContent  = cons_formatoPEN(cleanNum(data.mul));
    document.getElementById("s-acum").textContent = data.acum  || '0';
    document.getElementById("s-act").textContent  = cons_formatoPEN(cleanNum(data.act));
  } catch (e) {
    console.error("Error renderizando saldos:", e);
  }
  document.getElementById("s-loader")?.classList.add("hidden");
}

/* ==========================================================
VISUALIZACIÓN DE RECIBOS PDF
========================================================== */
async function cons_abrirReciboPDF() {
  const btn = document.getElementById('btn-ver-recibo');
  if (!btn) return;

  // 1. SI YA ESTÁ EN MODO LINK
  if (btn.getAttribute('data-estado') === 'link') {
    setTimeout(() => {
      btn.innerHTML = '📂 Buscar';
      btn.classList.remove('btn-pdf-success');
      btn.removeAttribute('data-estado');
      btn.disabled = false;
    }, 500);
    return;
  }

  // 2. MODO BÚSQUEDA
  const selDepa = document.getElementById('consulta-depa');
  const selMes  = document.getElementById('recibo-mes');
  const selAnio = document.getElementById('recibo-anio');

  const dpto = (selDepa?.value || '').trim();
  const mes  = selMes?.value;
  const anio = selAnio?.value;

  if (!dpto) {
    if (window.toast) toast("⚠️ Selecciona el Departamento a Consultar (❓)"); 
    return; 
  }
  /*
  let token = null;
  try { token = await ensureAuthTokenBanco(); } catch (e) { token = null; }
  if (!token) { 
    if (window.toast) toast("🔐 Autenticación Fallida (⛔)"); 
    return; 
  }*/

  btn.disabled = true;
  btn.textContent = '⏳ Espere...';

  netRun()
    .withSuccessHandler((res) => {
      btn.disabled = false;
      if (res?.status === "OK") {
        btn.setAttribute('data-estado', 'link'); 
        btn.classList.add('btn-pdf-success');
        btn.innerHTML = `<a href="${res.url}" target="_blank">📥 Ver Recibo</a>`;
        if (window.toast) toast("Recibo Cargado 📝");
      } else {
        btn.innerHTML = '📂 Buscar';
        alert(res?.msg || 'No se encontró el recibo.');
      }
    })
    .withFailureHandler((err) => {
      btn.disabled = false;
      btn.innerHTML = '📂 Buscar';
      alert('Error: ' + (err?.message || err));
    })
    .buscarRecibosPDF(dpto, mes, anio, window.usuarioActivo());
}

function setupConsultas() {
  setupConsultasSelect();
  const btnBusca     = document.getElementById('cons-buscar');
  const btnRecibo    = document.getElementById('btn-ver-recibo');
  const btnReciboAct = document.getElementById('btn-recibo-curso');
  if (btnBusca)     btnBusca.onclick     = cons_consultar;
  if (btnRecibo)    btnRecibo.onclick    = cons_abrirReciboPDF;
  if (btnReciboAct) btnReciboAct.onclick = cons_ReciboActualPDF;
}

async function cons_ReciboActualPDF() {
  const btn = document.getElementById('btn-recibo-curso');
  if (!btn) return;

  // 1. SI YA ESTÁ EN MODO LINK
  if (btn.getAttribute('data-estado') === 'link') {
    setTimeout(() => {
      btn.innerHTML = '📝 Recibo en Curso';
      btn.classList.remove('btn-pdf-success');
      btn.removeAttribute('data-estado');
      btn.disabled = false;
    }, 500);
    return;
  }

  // 2. MODO BÚSQUEDA
  const selDepa = document.getElementById('consulta-depa');

  const dpto = (selDepa?.value || '').trim();

  if (!dpto) {
    if (window.toast) toast("⚠️ Selecciona el Departamento a Consultar (❓)"); 
    return; 
  }
  /*
  let token = null;
  try { token = await ensureAuthTokenBanco(); } catch (e) { token = null; }
  if (!token) { 
    if (window.toast) toast("🔐 Autenticación Fallida (⛔)"); 
    return; 
  }*/

  btn.disabled = true;
  btn.textContent = '⏳ Espere...';

  netRun()
    .withSuccessHandler((res) => {
      btn.disabled = false;
      if (res?.status === "OK") {
        btn.setAttribute('data-estado', 'link'); 
        btn.classList.add('btn-pdf-success');
        btn.innerHTML = `<a href="${res.url}" target="_blank">📥 Abrir Recibo</a>`;
        if (window.toast) toast("Recibo Creado 📝");
      } else {
        btn.innerHTML = '📝 Recibo en Cursol';
        alert(res?.msg || 'No se encontró el recibo.');
      }
    })
    .withFailureHandler((err) => {
      btn.disabled = false;
      btn.innerHTML = '📝 Recibo en Curso';
      alert('Error: ' + (err?.message || err));
    })
    .generarPDFParaDepartamento(dpto);
}

/* ====================================
Control&Op. // (A1:Q77)
api_Recibos_getData(params)
==================================== */
function recibos_renderBody(payload){
  const tbl = document.getElementById('tabla-recibos');
  if (!tbl) return;
  const rows = (payload && payload.rows) || [];
  // Construimos SOLO el TBODY; conservamos <colgroup> y <thead>
  let tbody = '<tbody>';
  for (let r = 0; r < rows.length; r++){
    const row = rows[r] || [];
    tbody += '<tr>';
    for (let c = 0; c < row.length; c++){
    const raw = row[c];
    const txt = (raw == null ? '' : String(raw));
    // Un único atributo style acumulando reglas
    let style = '';
    if (c === 0) { style += 'font-weight:700;';}
    if (c === 6 || c === 7) {style += 'color:#D54A23;';}
    if (c === 10){
      let s = txt.replace(/\s/g,'');
      if (s.includes(',') && s.includes('.')) s = s.replace(/\./g,'').replace(',', '.');
      else s = s.replace(',', '.');
      const n = parseFloat(s.replace(/[^\d.-]/g,''));
      style += `color:${(Number.isFinite(n) && n > 0) ? '#D54A23' : '#444444'};`;
    }
    // L (índice 11): <0 => #FE9D01, si no => #FFFFFF
    if (c === 11){
      let s2 = txt.replace(/\s/g,'');
      if (s2.includes(',') && s2.includes('.')) s2 = s2.replace(/\./g,'').replace(',', '.');
      else s2 = s2.replace(',', '.');
      const n2 = parseFloat(s2.replace(/[^\d.-]/g,''));
      style += `color:${(Number.isFinite(n2) && n2 < 0) ? '#FE9D01' : '#FFFFFF'};`;
    }
    if (c === 12) {style += 'color:#CDC03D;';}
    if (c === 13) {style += 'color:#01F570;';}
    if (c === 15) {style += 'background-color:#4B4932;'; }
    if (c === 16) {style += 'color:#808888;';}
    const TOOLTIP_COLS = new Set([1, 14]);
    const titleAttr = (TOOLTIP_COLS.has(c) && txt)? ` title="${escapeHTML(txt)}"`: '';
    tbody += `<td${style ? ` style="${style}"` : ''}${titleAttr}>${escapeHTML(txt)}</td>`;
    }
    tbody += '</tr>';
  }
  tbody += '</tbody>';
  const colgroup = tbl.querySelector('colgroup')?.outerHTML || '';
  const thead    = tbl.tHead ? tbl.tHead.outerHTML : '';
  tbl.innerHTML  = colgroup + thead + tbody;
}

function setupRecibos(){
  const tbl = document.getElementById('tabla-recibos');
  if (!tbl) return;
  // 1) Mes/Año actual: "Agosto-2025"
  const now = new Date();
  const mes = now.toLocaleString('es-PE', { month: 'long' });
  const anio = now.getFullYear();
  const etiqueta = mes.charAt(0).toUpperCase() + mes.slice(1) + '-' + anio;
  const mesCell = document.getElementById('recibos-mes');
  if (mesCell) mesCell.textContent = etiqueta;
  // 2) Traer datos reales desde GAS (usa REG.RecibosEnExel por defecto)
  netRun()
    .withSuccessHandler(recibos_renderBody)
    .withFailureHandler(err => toast('Error Seccion Recibos: ' + (err?.message || err)))
    .api_recibos_getData({}); // ← sin params: lee sheet/range desde REG.RecibosEnExel
}

uiPaintCell({tableId: 'tabla-recibos',section: 'thead', row: 1,col: 1,bg:'#228447',align: 'center', radius:8});
uiPaintCell({tableId: 'tabla-recibos',section: 'thead', row: 1,col: 3, bg:'#44552A',color: '#A3D7FF', align: 'center', radius:8});
uiPaintCell({ tableId:'tabla-recibos', section:'thead', row:2, col:7,   color:'#FF7782' }); // G
uiPaintCell({ tableId:'tabla-recibos', section:'thead', row:2, col:8,   color:'#FF7782' }); // H
uiPaintCell({ tableId:'tabla-recibos', section:'thead', row:2, col:11,  color:'#FF7782' }); // K
uiPaintCell({ tableId:'tabla-recibos', section:'thead', row:2, col:13,   color:'#FECB01' }); // M
uiPaintCell({ tableId:'tabla-recibos', section:'thead', row:2, col:14,   color:'#9CF5CD',bg:'#3F5E44' }); // N
uiPaintCell({ tableId:'tabla-recibos', section:'thead', row:2, col:15,   color:'#9CF5CD',bg:'#3F5E44' }); // O


// 1. Funciónes para abrir el modal Exoneraciones & Reintegros Multas & Configuraciones  Globales
function abrirModalExon() {
  document.getElementById('modal-exon-desc').style.display = 'flex';
  document.getElementById('exon-concepto').value = ""; 
  document.getElementById('exon-monto').value = "";
  document.getElementById('exon-descrip').value = "";
  document.getElementById('exon-actual-moras-check').checked = false;
  document.getElementById('exon-moras-check').checked = false;
  document.getElementById('exon-actual-moras-check').checked = false;
  document.getElementById('exon-eliminar-check').checked = false;
  document.getElementById('exon-eliminar-check').disabled = true;

  // Limpiar el combo antes de cargar para evitar confusiones
  const select = document.getElementById('exon-depa');
  if (select.options.length <= 1) { 
    const depas = (typeof LISTAS !== 'undefined' && LISTAS.depaIds) ? LISTAS.depaIds : [];
    select.innerHTML = '<option value="">Seleccione Departamento...</option>';
    depas.forEach(id => {
      let opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      select.appendChild(opt);
    });
  }
}

// 2. Función para cerrar
function cerrarModalExon() {
  document.getElementById('modal-exon-desc').style.display = 'none';
  // Referencias a los elementos
  const combo = document.getElementById('exon-concepto');
  const monto = document.getElementById('exon-monto');
  const check = document.getElementById('exon-moras-check');
  const checkEliminar = document.getElementById('exon-eliminar-check');
  const depa = document.getElementById('exon-depa');
  const descrip = document.getElementById('exon-descrip');
  // Reset total de valores
  depa.value = "";
  combo.value = "";
  monto.value = "";
  descrip.value = "";
  check.checked = false;
  checkEliminar.checked = false;
  // Reset de estados físicos (IMPORTANTE)
  combo.disabled = false;
  monto.disabled = false;
  descrip.disabled = false;
  combo.style.backgroundColor = "#fff";
  monto.style.backgroundColor = "#fff";
}

// Listener para detectar cambio de departamento buscar exoneracion de moras y descripcion existente
document.getElementById('exon-depa')?.addEventListener('change', function() {
  const idDepa = this.value;
  if (!idDepa) return;
  // 1. BLOQUEAMOS EL BOTÓN DE INMEDIATO MIENTRAS CARGA LA RED
  const btnSave = document.getElementById('btn-save-exon');
  if (btnSave) {
    if (window.toast) toast("⏳ Cargando Informacion (Espere...)");
    btnSave.disabled = true;
    btnSave.textContent = "⏳ Espere...";
    btnSave.style.backgroundColor = "#e0e0e0"; // Gris claro clásico de deshabilitado
    btnSave.style.color = "#888888";           // Texto gris opaco
    btnSave.style.cursor = "not-allowed";
  }
  document.getElementById('exon-depa').removeAttribute('data-col7');
  const restaurarBoton = () => {
    if (btnSave) {
        btnSave.disabled = false;
        btnSave.textContent = "Registrar Evento"; // Texto original del modal
        btnSave.style.backgroundColor = "";
        btnSave.style.color = "";
        btnSave.style.cursor = "";
    }
  }
  netRun()
    .withSuccessHandler(res => {
      const checkMoras = document.getElementById('exon-moras-check');
      const actual = document.getElementById('exon-actual-moras-check');
      const checkEliminar = document.getElementById('exon-eliminar-check');
      const inputDescrip = document.getElementById('exon-descrip');
      const inputConcepto = document.getElementById('exon-concepto');
      const inputMonto = document.getElementById('exon-monto');
      checkEliminar.disabled = true;
      // Establecer los estados de los checks
      checkMoras.checked = !!res.tieneFormula;
      actual.checked = !!res.tieneExoneracion;
      // Disparar los eventos de interfaz
      checkMoras.dispatchEvent(new Event('change'));
      actual.dispatchEvent(new Event('change'));
      checkEliminar.dispatchEvent(new Event('change'));
      document.getElementById('exon-depa').setAttribute('data-col7', res.valColumna7 || 0);
      restaurarBoton ();
      if (res.tieneFormula || res.descripExistente.trim() !== "") {
        inputConcepto.value = "MORAS";
        inputMonto.value = res.montoExistente > 0 ? Number(res.montoExistente).toFixed(2) : "";
        if (window.toast) toast("ℹ️ Atencion! El Departamento " + idDepa + "\n Tiene una Exoneración Activa (💎)");
        inputConcepto.disabled = true;
        inputMonto.disabled = true;
        inputDescrip.disabled = true;
        actual.disabled = true;
        checkMoras.disabled = true;
        checkEliminar.disabled = false;
      } else {
        inputConcepto.value = (res.conceptoExistente && res.conceptoExistente !== "Select")
          ? res.conceptoExistente : "";                  
        inputMonto.value = res.montoExistente > 0 ? Number(res.montoExistente).toFixed(2) : "";
        inputConcepto.disabled = false;
        inputMonto.disabled = false;
        inputDescrip.disabled = false;
        actual.disabled = false;
        checkMoras.disabled = false;
      }
      inputDescrip.value = res.descripExistente || "";
    })
    .withFailureHandler(err => {
      restaurarBoton();
      // Usamos la función flash si la tienes, o una alerta limpia de error
      alert("❌ Error al conectar con el servidor: " + (err?.message || err));
    })
    .verificarFormulaDepa(idDepa);
}); 

// Ejecutar esto dentro de una etiqueta <script> o donde inicialices tus eventos
document.getElementById('exon-moras-check')?.addEventListener('change', function(e) {
  const inputCombo = document.getElementById('exon-concepto');
  const inputMonto = document.getElementById('exon-monto');
  const checkEliminar = document.getElementById('exon-eliminar-check');
  const checkActual = document.getElementById('exon-actual-moras-check');

  if (this.checked) {
    checkEliminar.checked = false;
    checkActual.checked = false;
    inputCombo.disabled = true;
    inputMonto.disabled = true;
    inputCombo.value = "MORAS";
    inputCombo.style.backgroundColor = "#e9ecef"; // Color gris de bloqueado
    inputMonto.style.backgroundColor = "#e9ecef"; // Color gris de bloqueado
  } else {
    inputCombo.disabled = false;
    inputMonto.disabled = false;
    inputCombo.style.backgroundColor = "#fff";
    inputMonto.style.backgroundColor = "#fff";
  }
});
// 2. Escuchador para el Check de ELIMINAR (Para que sea mutuo)
document.getElementById('exon-eliminar-check')?.addEventListener('change', function(e) {
  const checkMoras = document.getElementById('exon-moras-check');
  const checkActual = document.getElementById('exon-actual-moras-check');
  const inputCombo = document.getElementById('exon-concepto');
  const inputMonto = document.getElementById('exon-monto');
   
  if (this.checked) {
    // Si activo checkEliminar, desactivo checkMoras
    checkMoras.checked = false;
    checkActual.checked = false;
    inputCombo.disabled = true;
    inputMonto.disabled = true;
    inputCombo.style.backgroundColor = "#e9ecef";
    inputMonto.style.backgroundColor = "#e9ecef";
    } else {
    inputCombo.disabled = false;
    inputMonto.disabled = false;
    inputCombo.style.backgroundColor = "#fff";
    inputMonto.style.backgroundColor = "#fff";
    }
});

// 3. Escuchador para el Check de P.Actual (Para que sea mutuo)
document.getElementById('exon-actual-moras-check')?.addEventListener('change', function(e) {
  const checkMoras = document.getElementById('exon-moras-check');
  const checkEliminar = document.getElementById('exon-eliminar-check');
  const inputCombo = document.getElementById('exon-concepto');
  const inputMonto = document.getElementById('exon-monto');
   
  if (this.checked) {
    // Si activo checkEliminar, desactivo checkMoras
    checkMoras.checked = false;
    checkEliminar.checked = false;
    inputCombo.disabled = true;
    inputMonto.disabled = true;
    if (e.isTrusted) {inputCombo.value = "MORAS";}
    inputCombo.style.backgroundColor = "#e9ecef"; // Color gris de bloqueado
    inputMonto.style.backgroundColor = "#e9ecef"; // Color gris de bloqueado
    } else {
    inputCombo.disabled = false;
    inputMonto.disabled = false;
    inputCombo.style.backgroundColor = "#fff";
    inputMonto.style.backgroundColor = "#fff";
  }
});

document.getElementById('config-depa')?.addEventListener('change', function() {
  const idDepa = this.value;
  if (!idDepa) return;
  netRun()
    .withSuccessHandler(res => {
      if (res) {
        document.getElementById('config-cuota-extra').value = res.valorCuota;
        document.getElementById('config-descrip-cuota-extra').value = res.descriprCuota;
      } else {
        document.getElementById('config-cuota-extra').value = "";
        document.getElementById('config-descrip-cuota-extra').value = "";
      }
    })
    .withFailureHandler(err => {
      // Usamos la función flash si la tienes, o una alerta limpia de error
      alert("❌ Error al conectar con el servidor: " + (err?.message || err));
    })
    .obtenerConfiguracionIdDepa(idDepa);
})

// 3. Validaciones
function validarYGuardarExon() {
  const depaInput = document.getElementById('exon-depa');
  if (!depaInput) return;
  const depa = depaInput.value;
  const definitivo = document.getElementById('exon-moras-check').checked; // Congelar Moras Definitivo 
  const actual = document.getElementById('exon-actual-moras-check').checked;  // Eliminar Moras P. Actual
  const concepto = document.getElementById('exon-concepto').value;
  const montoRaw = document.getElementById('exon-monto').value;
  const monto = parseFloat(montoRaw) || 0;
  const descrip = (document.getElementById('exon-descrip').value || "");
  const eliminar = document.getElementById('exon-eliminar-check').checked; // Eliminar Exoneracion Actual
  if (!depa) return;

  // Variables que se enviarán al servidor
  let finalMonto = monto;
  let finalConcepto = concepto;
  let finalMoras = definitivo;
  let sinMoraActual = actual;
  let finalDescrip = descrip;
  let mensajeCuerpo = "";

  // --- LÓGICA DE VALIDACIÓN ---
  if (eliminar) {
    // 1. Confirmación específica de eliminación solicitada
    if (!confirm(` ❓ ¿Está seguro de ELIMINAR LA EXONERACIÓN ACTUAL para el departamento: ${depa}? \n⚠️ Esta Acción Será Irreversible`)) return;
    // Si es eliminar, preparamos valores de limpieza y saltamos las alertas
    finalMonto = 0;
    finalConcepto = "Select";
    finalMoras = false;
    sinMoraActual = false;
    finalDescrip = "";
    } else {
    const attrCol7 = depaInput.getAttribute('data-col7');
    const valorColumna7 = Number(attrCol7) || 0;
    // Tu validación estricta de pago:
    if ((concepto === "MORAS"||concepto ==="MULTAS"||concepto === "MORAS&MULTAS") && !definitivo && valorColumna7 < 5) {
      return alert(`🛑 No Puede Procesar esta Exoneración: \nEl Departamento ${depa} aun No Cancela su Recibo Actual. \nℹ️Solo Podrá Realizar Exoneraciones Previo al pago del Recibo Dentro del Periodo Actual.`);
    }
    const info = !actual && !eliminar && !definitivo && monto === 0 && ["", "Select"].includes(concepto);
    const avisoResponsabilidad = "\n⚠️ Por conformidad esta acción requiere prévia APROBACIÓN y autorización por parte de la actual Junta De Propietarios en funciones, caso contrario ud. como Administrador(a) asume la responsabilidad de realizar esta acción!! \n❓ ¿DESEA CONTINUAR?";
    const tieneConcepto = (concepto && concepto !== "Select");
    const tieneMonto = (monto > 0);
    if (actual){
        mensajeCuerpo = `ℹ️Tenga en cuenta que va a generar una ORDEN DE EXONERACION DE MORAS para el Departamento: ${depa} para el periodo del mes ACTUAL en curso`;
        finalConcepto = "MORAS";
        finalMonto = 0;
    }
    else if (definitivo) {
      mensajeCuerpo = `ℹ️Tenga en cuenta que va a generar una ORDEN DE CONGELAMIENTO DE MORAS para el Departamento: ${depa} de manera INDEFINIDA mientras esté activada esta opción.`;
      finalConcepto = "MORAS";
      finalMonto = 0;
    } else {
      if (tieneConcepto && !tieneMonto) {
          if (window.toast) toast("⚠️ Falta el Monto a Exonerar (❓)");
        return 
      } else if (!tieneConcepto && tieneMonto) {
          if (window.toast) toast("⚠️ Falta el Monto del Concepto a Aplicar (❓)");
        return 
      } else if (info){
          if (window.toast) toast("⚠️ Debe Completar la Informacion Requerida (❓)");
         return 
      } else {
        if (concepto === "REINTEGRO") {
          mensajeCuerpo = `ℹ️Tenga en cuenta que esta opción generará una ORDEN DE REINTEGRO que será acreditado al saldo del Departamento: ${depa}. Esto SOLO deberá aplicarse cuando el propietario haya realizado un pago Mayor al monto total de su recibo y este haya solicitado una devolucion por la diferencia de pagos. \n⚠️ Aplicar SOLO posterior a la ejecucion del reintegro y por el monto devuelto.`;
        } else if (["MORAS", "MULTAS", "MORAS&MULTAS"].includes(concepto)) {
          mensajeCuerpo = `ℹ️Tenga en cuenta que esta opcion generará una ORDEN DE EXONERACIÓN para las ${concepto} el cual sera acreditado al saldo del Departamento ${depa}. Esto SOLO debe aplicarse cuando el Propietario haya realizado una solicitud formal a la Junta actual de Propietarios.`;
        } else if (concepto === "RECIBOS") {
          mensajeCuerpo = `ℹ️Tenga en cuenta que esta opcion generará una ORDEN DE ACREDITACION DE SALDO A FAVOR para el RECIBO del Departamento: ${depa}. Esto SOLO debe aplicarse cuando el Propietario haya realizado un reclamo formal ante la Administracion o Junta de Propietarios por algun cobro indebido o por error en su facturación.`;
        }
      }
    }
        if (descrip.length < 6) {
        return alert("⚠️ La descripción del Motivo es muy simple. Detalle o indique el porque realiza esta acción o quien autoriza dicho evento, reintegro o congelamiento de moras.");
      }
    // Solo lanzamos la confirmación si hay un mensaje (no es eliminar)
    if (mensajeCuerpo && !confirm("⚠️⚠️⚠️ ATENCIÓN! \n" + mensajeCuerpo + avisoResponsabilidad)) return;
  }
  // --- PROCESO DE GUARDADO ---
  const restaurarBoton = () => {
      if (btnSave) {
          btnSave.disabled = false;
          btnSave.textContent = "Registrar Evento"; // Texto original del modal
          btnSave.style.backgroundColor = ""; 
          btnSave.style.color = "";
          btnSave.style.cursor = "";
      }
  };
  const btnSave = document.getElementById('btn-save-exon');
  const ejecutarGuardadoFinal = () => {
    btnSave.disabled = true;
    btnSave.textContent = "⏳ Espere...";
    btnSave.style.backgroundColor = "#0354f4";
    btnSave.style.color = "#ffffff";
    btnSave.style.cursor = "not-allowed";
    const user = sessionStorage.getItem('AUTH_USER') || 'unknonw';
    netRun()
      .withSuccessHandler((res) => {
        // Notificación de éxito
        if (window.toast) toast("Registro Procesado y Saldos Actualizados (✅)");
        // Cierre de modal y refresco
        restaurarBoton();
        cerrarModalExon();
        document.getElementById('recibos-refresh')?.click();
      })
      .withFailureHandler((error) => {
        alert("❌ Error al Guardar: " + (error.message || error));
        restaurarBoton();
      })
      .procesarGuardadoExon(depa, finalMonto, finalConcepto, finalMoras, sinMoraActual, finalDescrip, user);
  };
  // Solo validamos si NO es eliminar, NO es congelar moras y el concepto es de deuda
  if (!eliminar && !definitivo && ["MORAS", "MULTAS", "MORAS&MULTAS"].includes(concepto)) {
      btnSave.disabled = true;
      btnSave.textContent = "⏳ Validando...";

    netRun()
      .withSuccessHandler(res => {
        // Validación de seguridad si el servidor devuelve null
        if (!res) {
          alert("❌ Error: No se pudo obtener la deuda actual del departamento: " + depa);
        restaurarBoton();
          return;
        }
        let errorMonto = false;
        if (concepto === "MORAS" && monto > res.morNum) {
          alert(`⚠️ El Monto Introducido a Exonerar EXEDE la deuda total de MORAS para el departamento: ${depa} que actualmente es de: ${res.mor}. Corrija el Monto e Intente Nuevamente`);
          errorMonto = true;
        } 
        else if (concepto === "MULTAS" && monto > res.mulNum) {
          alert(`⚠️ El Monto Introducido a Exonerar EXEDE la deuda total de MULTAS para el departamento: ${depa} que actualmente es de: ${res.mul}. Corrija el Monto e Intente Nuevamente`);
          errorMonto = true;
        }
        else if (concepto === "MORAS&MULTAS") {
          const totalDeuda = res.morNum + res.mulNum;
          if (monto > totalDeuda) {
            alert(`⚠️ El Monto Introducido a Exonerar EXEDE la deuda total de (Moras: ${res.mor} + Multas: ${res.mul}) del departamento: ${depa} que hace un total de: ${totalDeuda.toFixed(2)}. Corrija el Monto e Intente Nuevamente`);
            errorMonto = true;
          }
        }
        if (errorMonto) {
          restaurarBoton();
          return; 
        }
        ejecutarGuardadoFinal();
      })
      .withFailureHandler(err => {
        alert("❌ Error de comunicación: " + err.message);
        restaurarBoton();
      })
      .api_Saldos_Para_Modal(depa);

  } else {
    // Si no requiere validación de montos, guarda directo
    ejecutarGuardadoFinal();
  }
}

// abrir el modal de Multas
function abrirModalMultas() {
  const modal = document.getElementById('modal-multas-sanciones');
  
  modal.style.display = 'flex';
  // Poblar el combo de departamentos de forma segura
  const selectDepa = document.getElementById('multas-depa');
  if (selectDepa && selectDepa.options.length <= 1) { // Solo si existe y no ha sido poblado
    const depas = (typeof window.LISTAS !== 'undefined' && window.LISTAS?.depaIds) ? window.LISTAS.depaIds : [];
    
    selectDepa.innerHTML = '<option value="">Seleccione Departamento...</option>';
    depas.forEach(id => {
      let opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      selectDepa.appendChild(opt);
    });
  }
}

// cerrar el modal de Multas
function validarYGuardarMulta() {
  const depa = document.getElementById('multas-depa').value;
  const tipo = document.getElementById('multas-tipo').value;
  const monto = document.getElementById('multas-monto').value;
  const btn = document.getElementById('btn-save-multas');

  if (!depa || !tipo || !monto) {
    if (window.toast) toast("⚠️ Seleccione Departamento, Tipo y Monto (❓)");
    return 
  }

  if (!confirm(`❓ ¿Confirma el registro de ${tipo} por S/. ${monto} al departamento: ${depa}?`)) return;
  const user = sessionStorage.getItem('AUTH_USER') || 'unknonw';

  btn.disabled = true;
  btn.textContent = "⏳ Espere...";
  btn.style.backgroundColor = "#0354f4"; // El azul de otros botones
  btn.style.color = "#ffffff";

  netRun()
  .withSuccessHandler((res) => {
    // 1. Cerramos el modal
    cerrarModalMultas(); 

    // 2. Avisamos al usuario
    if (window.toast) toast("Multa registrada correctamente (✅)");

    // 3. Refrescamos la tabla de recibos
    const btnRefresh = document.getElementById('recibos-refresh');
    if (btnRefresh) btnRefresh.click();

    // 4. Restauramos el botón
    btn.disabled = false;
    btn.textContent = "Registrar Multa";
    btn.style.backgroundColor = ""; 
    btn.style.color = "";
  })
  .withFailureHandler(err => {
    alert("❌ Error en el Servidor: " + (err.message || err));
    btn.disabled = false;
    btn.textContent = "Registrar Multa";
    btn.style.backgroundColor = ""; 
    btn.style.color = "";
  })
  .procesarMultas(depa, Math.abs(monto), tipo, user);
}
// session de Configuracion
function cerrarModalMultas() {
  const modal = document.getElementById('modal-multas-sanciones');
  if (modal) {
    modal.style.display = 'none';
  }
  // Limpieza segura (usando optional chaining o verificando que existan)
  const ids = ['multas-depa', 'multas-tipo', 'multas-monto'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function abrirModalConfig() {
  const modal = document.getElementById('modal-configuraciones');
  if (!modal) return;
  
  modal.style.display = 'flex';

  // 1. Poblar el combo de días del 1 al 20 (si está vacío)
  const selDia = document.getElementById('config-dia-pago');
  if (selDia && selDia.options.length === 0) {
    for (let i = 1; i <= 20; i++) {
      let opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i;
      selDia.appendChild(opt);
    }
  }

  // 2. Poblar el combo de departamentos (usando LISTAS que ya tienes)
  const selDepa = document.getElementById('config-depa');
  if (selDepa && selDepa.options.length <= 1) {
    const depas = (typeof LISTAS !== 'undefined' && LISTAS.depaIds) ? LISTAS.depaIds : [];
    selDepa.innerHTML = '<option value="">Seleccione Departamento...</option>';
    depas.forEach(id => {
      let opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      selDepa.appendChild(opt);
    });
  }

  // 3. Cargar valores actuales desde el servidor
  netRun()
    .withSuccessHandler(res => {
      if (res) {
        document.getElementById('config-dia-pago').value = res.diaLimite;
        document.getElementById('config-fondo').value = res.fondoContingencia;
        document.getElementById('config-porton-pct').value = res.portonPercent;
        document.getElementById("config-exonerados-text").value = res.exonerados || "";
        const checkSinMora = document.getElementById('config-sin-mora-check');
        checkSinMora.checked = (res.sinMorasDia === true);
        document.getElementById('config-sin-mora-check').value = res.sinMorasDia;
        document.getElementById("config-cuota-extra").value = res.montoExtra;
        document.getElementById("config-descrip-cuota-extra").value = res.descripMontoExtra;
        toggleSinMora(checkSinMora.checked);
      }
    })
    .obtenerConfiguracionesIniciales();
}

function cerrarModalConfig() {
  document.getElementById('modal-configuraciones').style.display = 'none';
  document.getElementById('config-cuota-extra').value = "";
  document.getElementById("config-descrip-cuota-extra").value = "";
  document.getElementById('config-todos-check').checked = false;
  document.getElementById('config-sin-mora-check').checked = false;
  document.getElementById('config-porton-check').checked = false;
  
  toggleCuotaExtra(false);
  toggleSinMora(false);
}
// check: Aplica a Todos
function toggleCuotaExtra(aplicarATodos) {
  const selDepa = document.getElementById('config-depa');
  const wrapDepa = document.getElementById('wrap-config-depa');
  const portonCheck = document.getElementById('config-porton-check');
  const pctInput = document.getElementById('config-porton-pct');
  if (aplicarATodos) {
    selDepa.disabled = true;
    selDepa.value = ""; // Limpiamos selección
    wrapDepa.style.opacity = "0.4"; // Efecto visual de deshabilitado
  } else {
    selDepa.disabled = false;
    wrapDepa.style.opacity = "1";
    if (portonCheck) {portonCheck.checked = false;
      if (pctInput) pctInput.disabled = true; // Deshabilitamos el % también
    }
  }
}
// check: Excluir Moras Diarias
function toggleSinMora(aplicaSinMoras) {
  const selDia = document.getElementById('config-dia-pago'); // combo de días
  const labelDia = document.querySelector('label[for="config-dia-pago"]');
  
  if (aplicaSinMoras) {// Efecto visual de deshabilitado
    selDia.disabled = true;
    labelDia.style.opacity = "0.4";
    labelDia.style.color = "#999";
  } else {
    selDia.disabled = false;
    labelDia.style.opacity = "1";
    labelDia.style.color = "";
  }
}
// check: Asignar cuota Mant. Correctivo Portón
function handlePortonToggle(checked) {
  const pctInput = document.getElementById('config-porton-pct');
  const todosCheck = document.getElementById('config-todos-check');
  // 1. Habilitar/Deshabilitar el campo de porcentaje
  pctInput.disabled = !checked;
  if (checked) {
    // 2. Forzar que "Aplicar a Todos" sea true
    if (todosCheck) {
      todosCheck.checked = true;
      // 3. Llamamos a tu función existente para que oculte/muestre el selector de depa
      toggleCuotaExtra(true);
    }
  }
}

function guardarConfiguraciones(esConfirmacion = false, userCache = "", passCache = "") {
  let dia = document.getElementById('config-dia-pago').value;
  const fondo = Number(document.getElementById('config-fondo').value) || 0;
  const cuota = Number(document.getElementById('config-cuota-extra').value) || 0; 
  let cuotaDescrip = document.getElementById("config-descrip-cuota-extra").value;
  const todos = document.getElementById('config-todos-check').checked;
  const sinMoras = document.getElementById('config-sin-mora-check').checked;
  const percent = document.getElementById('config-porton-pct').value;
  const porton = document.getElementById('config-porton-check').checked;
  const depa = document.getElementById('config-depa').value;
  const exonerados = document.getElementById('config-exonerados-text').value;
  const btn = document.getElementById('btn-save-config');

  // 1. Validaciones locales rápidas
  if (!esConfirmacion) {
    if (!todos && cuota > 0 && !depa && !porton) {
      if (window.toast) toast("⚠️ Debe seleccionar un departamento o marcar \n'Aplicar a Todos' para asignar la cuota extra (❓)");
      return;
    }
    if ((!cuotaDescrip || cuotaDescrip.trim().length < 10) && cuota > 0) {
      if (window.toast) toast("⚠️ Debe asignar una descripción que valide el monto de la cuota extra aplicada (❓)");
      return;
    }
    if (!confirm("❓ ¿Desea guardar los cambios en la configuración global y cuotas?")) return;
  }

  const AUTH_TOKEN = sessionStorage.getItem('AUTH_USER') || 'unknonw';
  if (cuota <= 0) { cuotaDescrip = ""; }

  btn.disabled = true;
  btn.textContent = "⏳ Validando...";
  btn.style.backgroundColor = "#647AEB";

  const restaurarBoton = () => {
    btn.disabled = false;
    btn.textContent = "💾 Guardar Configuración";
    btn.style.backgroundColor = "";
  };

  // 2. Ejecución en el servidor
  netRun()
    .withSuccessHandler((res) => {

      // A) Error de negocio/Portón activo
      if (res && res.ok === false && !res.requiereConfirmacion && !res.requiereAuth) {
        restaurarBoton();
        alert(res.mensaje || "⚠️ No se pudo completar la operación.");
        return;
      }

      // B) Requiere confirmación de borrado
      if (res && res.requiereConfirmacion) {
        restaurarBoton();
        if (confirm(res.mensaje)) {
          // Re-ejecuta indicando que ya confirmó para no repetir confirmación local
          guardarConfiguraciones(true, userCache, passCache);
        }
        return;
      }

      // C) El servidor validó el negocio y AHORA pide credenciales
      if (res && res.requiereAuth) {
        restaurarBoton();
        const user = prompt("🛡️ 👤 Ingrese User_Admin 🛡️");
        if (!user) return;
        const pass = prompt(" 🔑 Ingrese Password 🔏");
        if (!pass) return;

        // Re-ejecuta enviando credenciales y esConfirmacion = true para evitar el confirm() inicial
        guardarConfiguraciones(true, user, pass);
        return;
      }

      // D) Éxito final
      restaurarBoton();
      if (res && res.ok) {
        alert(res.mensaje || "✅ CONFIGURACIÓN APLICADA CON EXITO.");
        cerrarModalConfig();
        if (document.getElementById('recibos-refresh')) document.getElementById('recibos-refresh').click();
      }
    })
    .withFailureHandler(err => {
      restaurarBoton();
      alert("❌: " + err.message);
    })
    .superUsuario(
      userCache, passCache, dia, Math.abs(fondo), Math.abs(cuota), 
      cuotaDescrip.toUpperCase(), todos, depa, sinMoras, 
      porton, percent, exonerados, AUTH_TOKEN, esConfirmacion
    );
}

/* ====================================
COMUNA // (A1:N76) CLIENTES
api_Recibos_getData(params)
==================================== */
// --- Mapeo columnas por letra --> índice ---
const COL = { A:0, B:1, C:2, D:3, E:4, F:5, G:6, H:7, I:8, J:9, K:10, L:11, M:12, N:13 };
// --- Helpers de validación/formato ---
const clampLen = (str, max) => (str || '').toString().slice(0, max);
// Teléfono: acepta solo dígitos, 9 dígitos, y formatea 3-3-3
function normPhone(input){
  const digits = (input || '').replace(/\D+/g, '').slice(0, 9);
  return digits.replace(/(\d{3})(\d{3})(\d{0,3})/, (_,a,b,c) => c ? `${a}-${b}-${c}` : (b ? `${a}-${b}` : a));
}
// Acepta 1 o 2 teléfonos (9 dígitos c/u) separados por salto de línea
function formatPhones(raw){
  if (!raw) return '';
  const parts = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0,2);
  const cleaned = parts.map(normPhone).filter(p => p.length >= 11); // 999-999-999 => len 11
  return cleaned.join('\n');
}
function shortenEmail(email, maxLocal = 25, domainPrefix = 3){
  email = String(email || '').trim();
  if (!email) return '';
  const [local, domain = ''] = email.split('@');
  const l = local.length > maxLocal ? local.slice(0, maxLocal - 1) + '…' : local;
  const d = domain ? domain.slice(0, domainPrefix) + '..' : '';
  return domain ? `${l}@${d}` : l;
}
// --- Staging de cambios por (sheetRow, colIndex) -> value ---
const edits = new Map(); // key: `${row}:${col}` -> value
function stageEdit(sheetRow, colIndex, value){
  edits.set(`${sheetRow}:${colIndex}`, value);
}
// --- Guardar cambios (ejemplo): usa A como ID único ---
async function saveEdits(){
  // Agrupar cambios por fila
  const byRow = {};
  for (const [key, val] of edits.entries()){
    const [rowStr, colStr] = key.split(':');
    const r = Number(rowStr), c = Number(colStr);
    (byRow[r] ||= {})[c] = val;
  }
  // Construir payload por fila con ID (col A)
  const updates = Object.entries(byRow).map(([sheetRow, cells]) => {
    sheetRow = Number(sheetRow);
    // leer valor actual de A en la UI (input de la col A de esa fila)
    const tr = [...document.querySelectorAll('#tbl-clientes tbody tr')]
      .find(tr => (Number(tr.dataset.sheetRow) === sheetRow));
    // Si no guardas dataset, puedes reconstruir desde tus datos en memoria
    const id = getValueFromUI(sheetRow, COL.A); // implementa según tu estado

    return { sheetRow, id, cells }; // cells: {colIndex:value}
  });
  edits.clear();
}

// Si quieres marcar el dataset en cada fila para resolver fácil sheetRow:
function tagSheetRows(){
  const tbody = document.querySelector('#tbl-clientes tbody');
  if (!tbody) return;
  let i = 0;
  for (const tr of tbody.rows){
    const sheetRow = i + 2; // A2 => 2
    if (sheetRow === 44) { i++; continue; }
    tr.dataset.sheetRow = String(sheetRow);
    i++;
  }
}

function setupComuna(){
  const tbl = document.getElementById('tbl-clientes');
  if (!tbl) {
    console.warn('[Comuna] No existe #tbl-clientes');
    tbl.innerHTML = '<tbody><tr><td colspan="100" style="padding:20px; text-align:center;">⏳ Cargando datos seguros...</td></tr></tbody>';
    return;
  }
  // 1) COLGROUP (anchos fijos A..N)
  const COLW = [64,100,100,76,56,90,90,80,90,100,100,150,100,230]; // A..N
  const colgroup = document.createElement('colgroup');
  COLW.forEach(w => {
    const col = document.createElement('col');
    col.style.width = w + 'px';
    colgroup.appendChild(col);
  });
  // Limpiar y colocar colgroup
  tbl.replaceChildren();
  tbl.appendChild(colgroup);

  netRun()
    .withSuccessHandler(res => {
      if (!res) { toast?.('Sin respuesta de servidor'); return; }
      if (res.error) { console.error(res.error); toast?.('Error: '+res.error); return; }
      // Soporta res.header O res.headers (según cómo devuelva el GAS)
      const headers = res.header || res.headers;
      const rows    = res.rows;

      if (!Array.isArray(headers) || !Array.isArray(rows)) {
        console.error('[Comuna] Formato inválido. Esperaba {header(s):[], rows:[[]]}');
        toast?.('Formato de datos inválido');
        return;
      }

      // THEAD
      const thead = document.createElement('thead');
      const trh = document.createElement('tr');
      headers.forEach((h, i) => {
        const th = document.createElement('th');
        th.textContent = h ?? '';
        th.classList.add('col-' + String.fromCharCode(65 + i)); // A..N
        trh.appendChild(th);
      });
      thead.appendChild(trh);

      // TBODY
      const tbody = document.createElement('tbody');

      rows.forEach((row, rIdx) => {
        const sheetRow = rIdx + 1;    // A2 => 2
        if (sheetRow === 43) return;  // omite fila 44 DE LA HOJA
        const tr = document.createElement('tr');
        tr.dataset.sheetRow = String(sheetRow);

        row.forEach((cell, cIdx) => {
          const colLetter = String.fromCharCode(65 + cIdx); // A..N
          const td = document.createElement('td');
          td.classList.add('col-' + colLetter);
          let val = String(cell ?? '').trim();
          // recortes básicos
          if (['B','C','I'].includes(colLetter)) val = val.slice(0,20);
          else if (colLetter==='D') val = val.slice(0,9);
          else if (colLetter==='E') val = val.slice(0,2);
          else if (['F','G'].includes(colLetter)) val = val.slice(0,3);
          // columnas con clamp (2 líneas + tooltip)
          const CLAMP_COLS = new Set(['I','J','L','M','N']); // K va aparte

          // teléfonos J/M
          if (colLetter === 'J' || colLetter === 'M') {
            const nums = val.split(/\s+/).filter(Boolean);
            val = nums.map(n => n.replace(/(\d{3})(?=\d)/g,'$1 ')).join('\n');
          }
          if (colLetter === 'H') {
            if (val === 'PROPIETARIO')      td.classList.add('status-prop');
            else if (val === 'ALQUILADO')   td.classList.add('status-inq');
            else if (val === 'DESOCUPADO')  td.classList.add('status-des');
            td.textContent = val;
          }
          else if (colLetter === 'K') {
            const { shown, full } = displayForK(val);  // ← usa tu helper vigente
            const wrap = document.createElement('div');
            wrap.className = 'clamp2';
            wrap.textContent = shown;
            td.title = full;
            td.appendChild(wrap);
          }
          else if (CLAMP_COLS.has(colLetter)) {
            const wrap = document.createElement('div');
            wrap.className = 'clamp2';
            if (colLetter === 'M') wrap.style.whiteSpace = 'pre-line';
            wrap.textContent = val;
            td.title = val;
            td.appendChild(wrap);
          }
          else {
            td.textContent = val;
          }

          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      // Montaje
      tbl.appendChild(thead);
      tbl.appendChild(tbody);

      // Snapshot para edición
      if (Array.isArray(rows)) window.__comuna_snapshotRows__(rows);
    })
    .withFailureHandler(err => {
      console.error('api_comuna_getData error:', err);
      toast?.('Error al cargar Comuna');
    })
    .api_comuna_getData();
}

// Lógica para el buscador de la tabla
const searchInput = document.getElementById('comuna-search');

searchInput?.addEventListener('input', function() {
    const searchTerm = this.value.toLowerCase().trim();
    const table = document.getElementById('tbl-clientes');
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(row => {
        // Obtenemos todo el texto de la fila (todas sus celdas combinadas)
        const rowText = row.textContent.toLowerCase();
        
        // Si el término de búsqueda está en el texto de la fila, se muestra, si no, se oculta
        if (rowText.includes(searchTerm)) {
            row.style.display = ""; // Muestra la fila
        } else {
            row.style.display = "none"; // Oculta la fila
        }
    });
});

/* 
   COMUNA – Edición B..N por ID (A) – CONSOLIDADO
*/

/** Constantes y reglas */
const COL_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N'];
const EDITABLE_COLS = new Set(['B','C','D','E','F','G','H','I','J','K','L','M','N']); // B..N
// Opciones fijas para H (respetando tu ortografía exacta)
const H_OPTIONS = ['','PROPIETARIO','INQUILINO','DESOCUPADO'];
const MAXLEN = { B:20, C:20, D:9, E:2, F:3, G:3, I:20 };   // límites que ya usabas

/** Estado en memoria */
const COMUNA_SNAP = { rows: [], byId: new Map() };   // snapshot de datos
const PENDING = new Map(); // id -> { cells: {B:'...', C:'...'} }

/** Utilidades DOM */
const byId = id => document.getElementById(id);

/** Snapshot desde datos o desde el DOM (si no nos pasan filas) */
window.__comuna_snapshotRows__ = function(rowsOpt){
  COMUNA_SNAP.rows = [];
  COMUNA_SNAP.byId.clear();

  if (Array.isArray(rowsOpt) && rowsOpt.length){
    // rowsOpt: matriz A..N sin cabecera (A2:N…)
    COMUNA_SNAP.rows = rowsOpt.map(r => r.slice(0,14));
  } else {
    // reconstruir desde la tabla (menos preciso si hay formateos)
    const body = byId('tbl-clientes')?.tBodies?.[0];
    if (!body) return;
    for (const tr of body.rows){
      const row = COL_LETTERS.map((_,i) => (tr.cells[i]?.textContent ?? '').trim());
      COMUNA_SNAP.rows.push(row);
    }
  }

  // indexar por ID (col A)
  COMUNA_SNAP.rows.forEach((r, idx) => {
    const id = String(r[0] || '').trim();
    if (id) COMUNA_SNAP.byId.set(id, idx);
  });
};

/** Helper: mostrar/ocultar barra de guardar */
function refreshSavebar(){
  const bar = byId('comuna-savebar');
  if (!bar) return;
  bar.classList.toggle('show', PENDING.size > 0);
}

/** Helper: formateo teléfonos (J/M) solo para display */
function fmtPhonesForDisplay(v){
  const nums = String(v||'').split(/\s+/).filter(Boolean);
  return nums.map(n => n.replace(/(\d{3})(?=\d)/g,'$1 ')).join('\n');
}

/** Emails col K: 2 líneas máximo, cada email abreviado local@dom..  + tooltip completo */
function shortenEmail(email, maxLocal = 18, domainPrefix = 3){
  email = String(email || '').trim();
  const [local, domain = ''] = email.split('@');
  const l = local.length > maxLocal ? local.slice(0, maxLocal - 1) + '…' : local;
  const d = domain ? domain.slice(0, domainPrefix) + '..' : '';
  return domain ? `${l}@${d}` : l;
}
function displayForK(raw){
  const list = String(raw||'').split(/[\s,;]+/).filter(Boolean);
  const shown = list.slice(0,2).map(shortenEmail).join('\n'); // 2 líneas
  return { shown, full: list.join('\n') };
}

/** Pinta display en la celda según columna (sin tocar snapshot) */
function paintCell(td, colLetter, value){
  td.classList.remove('status-prop','status-inq','status-des');
  td.title = '';

  if (colLetter === 'J' || colLetter === 'M'){ // teléfonos
    const wrap = document.createElement('div');
    wrap.className = 'clamp2';
    wrap.style.whiteSpace = 'pre-line';
    wrap.textContent = fmtPhonesForDisplay(value);
    td.replaceChildren(wrap);
  } else if (colLetter === 'K'){ // emails
    const { shown, full } = displayForK(value);
    const wrap = document.createElement('div');
    wrap.className = 'clamp2';
    wrap.textContent = shown;
    td.title = full;
    td.replaceChildren(wrap);
  } else if (colLetter === 'H'){ // estado + color
    if (value === 'PROPIETARIO') td.classList.add('status-prop');
    else if (value === 'ALQUILADO') td.classList.add('status-inq');
    else if (value === 'DESOCUPADO') td.classList.add('status-des');
    td.textContent = value;
  } else {
    td.textContent = String(value ?? '');
  }
}

/** Abre un mini editor sobre la celda */
let editorEl = null;
let editingTd = null; 
function openEditor(td){
  const tr    = td.closest('tr');
  const table = byId('tbl-clientes');
  if (!tr || !table) return;

  const colIdx    = td.cellIndex;
  const colLetter = COL_LETTERS[colIdx];
  if (!EDITABLE_COLS.has(colLetter)) return;

  const id = (tr.cells[0]?.textContent || '').trim();
  if (!id) return;

  // Valor original desde snapshot (no el formateado del DOM)
  let rawVal = '';
  if (COMUNA_SNAP.byId.has(id)){
    const idx = COMUNA_SNAP.byId.get(id);
    rawVal = COMUNA_SNAP.rows[idx]?.[colIdx] ?? '';
  } else {
    rawVal = td.title || td.textContent || '';
  }

  // Cerrar editor anterior y limpiar highlight previo
  if (editorEl) { editorEl.remove(); editorEl = null; }
  if (editingTd) editingTd.classList.remove('cell-editing');

  // Marcar esta celda como “en edición”
  editingTd = td;
  editingTd.classList.add('cell-editing');

  // Construir editor flotante
  editorEl = document.createElement('div');
  editorEl.className = 'cell-editor';

  const box = document.createElement('div');
  box.className = 'cell-editor-box';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'cell-editor-input';

  let input;
  if (colLetter === 'H'){
    input = document.createElement('select');
    H_OPTIONS.forEach(opt => {
      const o = document.createElement('option');
      o.value = o.textContent = opt;
      if ((rawVal || '').trim().toLowerCase() === opt.toLowerCase()) o.selected = true;
      input.appendChild(o);
    });
  } else if (['J','K','L','M','N','I'].includes(colLetter)){
    input = document.createElement('textarea');
    input.rows  = 3;
    input.value = rawVal;
  } else {
    input = document.createElement('input');
    input.type  = 'text';
    input.value = rawVal;
  }
  inputWrap.appendChild(input);

  const act = document.createElement('div');
  act.className = 'cell-editor-actions';

  const btnCancel = document.createElement('button');
  btnCancel.className = 'btn btn-redd';
  btnCancel.textContent = 'Cancelar';

  const btnOk = document.createElement('button');
  btnOk.className = 'btn-orange';
  btnOk.textContent = 'Aceptar';

  act.appendChild(btnCancel);
  act.appendChild(btnOk);

  box.appendChild(inputWrap);
  box.appendChild(act);
  editorEl.appendChild(box);
  document.body.appendChild(editorEl);

  // Posicionar debajo de la celda
  const r = td.getBoundingClientRect();
  editorEl.style.left = (window.scrollX + r.left)   + 'px';
  editorEl.style.top  = (window.scrollY + r.bottom + 6) + 'px';

  // Cerrar editor (única función close)
  const close = () => {
    editorEl?.remove();
    editorEl = null;
    editingTd?.classList.remove('cell-editing');
    editingTd = null;
  };

  btnCancel.onclick = close;

  btnOk.onclick = () => {
    let v = input.value ?? '';
    // clamp por columnas
    const lim = MAXLEN[colLetter];
    if (lim) v = String(v).slice(0, lim);

    const valorNuevoNorm = String(v).trim().toLowerCase();

    // --- VALIDACIÓN ESTRICTA DE DUPLICADOS PARA F y G o B,C,D,J,K,L,M ---
    if (colLetter === 'F' || colLetter === 'G') {
        if (valorNuevoNorm !== "") {
            let idEnConflicto = null;
            const idxF = 5; // Columna F
            const idxG = 6; // Columna G

            for (const [idExistente, idxFila] of COMUNA_SNAP.byId) {
                if (idExistente === id) continue;
                let valF = COMUNA_SNAP.rows[idxFila][idxF];
                let valG = COMUNA_SNAP.rows[idxFila][idxG];
                if (PENDING.has(idExistente)) {
                    const p = PENDING.get(idExistente).cells;
                    if (p['F'] !== undefined) valF = p['F'];
                    if (p['G'] !== undefined) valG = p['G'];
                }
                if (String(valF || '').trim().toLowerCase() === valorNuevoNorm || 
                    String(valG || '').trim().toLowerCase() === valorNuevoNorm) {
                    idEnConflicto = idExistente;
                    break; 
                }
            }

            if (idEnConflicto) {
                alert(`❌ ¡VALOR DUPLICADO!\n\nEl numero de ESTAC. "${v}" ya esta vinculado al DEPA-ID👉 ${idEnConflicto}.\n\n⚠️ No puede registrar un valor ya asignado.`);
                return;
            }
        }
    }

    // --- 2. VALIDACIÓN INDIVIDUAL ( D, J, K, L, M) ---
    const columnasIndividuales = {
        'D': 3, 'J': 9, 'K': 10, 'L': 11, 'M': 12
    };
    if (columnasIndividuales[colLetter] !== undefined) {
        if (valorNuevoNorm !== "") {
            const idxCol = columnasIndividuales[colLetter];
            let idEnConflicto = null;

            for (const [idExistente, idxFila] of COMUNA_SNAP.byId) {
                if (idExistente === id) continue;

                // Obtener valor actual de la columna específica
                let valExistente = COMUNA_SNAP.rows[idxFila][idxCol];

                // Verificar si hay cambios pendientes para esa celda
                if (PENDING.has(idExistente)) {
                    const p = PENDING.get(idExistente).cells;
                    if (p[colLetter] !== undefined) valExistente = p[colLetter];
                }

                if (String(valExistente || '').trim().toLowerCase() === valorNuevoNorm) {
                    idEnConflicto = idExistente;
                    break;
                }
            }
            if (idEnConflicto) {
               alert(`❌ ¡VALOR DUPLICADO!\n\nEl valor "${v}" ya existe en esta columna y hace referencia al DEPA-ID👉 ${idEnConflicto}.\n\n⚠️ No se permiten datos duplicados.`);
                return;
            }
        }
    }
    // --- FIN VALIDACIÓN ---

    // Pintar DOM según reglas
    paintCell(td, colLetter, v);
    // Marcar “dirty”
    td.classList.add('cell-dirty');
    // Stage pendiente por ID
    const current = PENDING.get(id) || { id, cells: {} };
    current.cells[colLetter] = v;
    PENDING.set(id, current);
    refreshSavebar();

    close();
  };

  // Atajos
  input.onkeydown = (e) => {
    if (e.key === 'Escape'){ e.preventDefault(); close(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
      e.preventDefault(); btnOk.click();
    }
  };

  input.focus();
  if (input.select) input.select();
}

/** Listeners tabla y barra */
document.addEventListener('DOMContentLoaded', () => {
  const tbl = byId('tbl-clientes');
  if (tbl){
    tbl.addEventListener('dblclick', (ev) => {
      const td = ev.target.closest('td');
      if (!td || !td.parentElement) return;
      openEditor(td);
    });
  }
  byId('btnComunaSave')?.addEventListener('click', () => {
    if (!PENDING.size) return;
    const updates = Array.from(PENDING.values()).map(x => ({ id: x.id, cells: x.cells }));
    netRun()
      .withSuccessHandler(res => {
        if (res?.ok){
          toast?.('✅ Cambios guardados');
          PENDING.clear();
          refreshSavebar();
          document.querySelectorAll('#tbl-clientes td.cell-dirty').forEach(td => td.classList.remove('cell-dirty'));
        } else {
          alert('No se pudo guardar: ' + (res?.error || 'Error desconocido'));
        }
      })
      .withFailureHandler(err => alert('Error de red: ' + (err?.message || err)))
      .api_comuna_updateRows({ updates: updates }, window.usuarioActivo());
  });

  byId('btnComunaDiscard')?.addEventListener('click', () => {
    if (!PENDING.size) return;
    if (!confirm('¿Descartar todos los cambios no guardados?')) return;
    PENDING.clear();
    refreshSavebar();
    setupComuna(); // recarga
  });

  // Inicial: por si quieres forzar que se oculte/actualice estado
  refreshSavebar();
});

// si queremos salir y no se ha gurdado los cambios
function hasUnsavedComuna(){ return PENDING && PENDING.size > 0; }
window.addEventListener('beforeunload', (e) => {
  if (!hasUnsavedComuna()) return;
  // Navegadores modernos requieren asignar returnValue para mostrar prompt
  e.preventDefault();
  e.returnValue = '';
});

function confirmLeaveComuna(){
  return confirm('Tienes cambios sin guardar en Comuna. ¿Descartar y salir?');
}

// Delegado global para enlaces/botones de navegación
document.addEventListener('click', (e) => {
  const el = e.target.closest(
    '.nav-link, [data-nav], [data-view], a[href^="#"], button[data-go]'
  );
  if (!el) return;

  if (hasUnsavedComuna()){
    // Si el usuario presiona CANCELAR (!confirmLeaveComuna)
    if (!confirmLeaveComuna()){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    } else {
      // Si aceptan salir, limpia estado visual opcionalmente:
      PENDING.clear();
      refreshSavebar();
      document.querySelectorAll('#tbl-clientes td.cell-dirty')
        .forEach(td => td.classList.remove('cell-dirty'));
    }
  }
}, true);

/* ===========================
   SERVICIOS HIST. – INFORMATIVO
   =========================== */
// Variable global para almacenar los datos temporalmente y poder filtrarlos localmente sin recargar
let cacheServicios = [];

/**
 * Llama al backend en GAS y trae los datos
 */
function cargarModuloServicios() {
  netRun()
    .withSuccessHandler(function(response) {
      if (response.success) {
        // La fila 2 de tu excel son los encabezados (Índice 0 de los datos devueltos)
        cacheServicios = response.datos;
        renderizarTablaServicios(cacheServicios);
      } else {
        alert("❌ Error al cargar servicios: " + response.error);
      }
    })
    .withFailureHandler(function(err) {
      alert("❌ Error crítico del servidor: " + err);
    })
    .api_Servicios_Hist();
}

/**
 * Renderiza los elementos en el DOM de forma óptima
 */
function renderizarTablaServicios(matrizDatos) {
  const tabla = document.getElementById("tabla-servicios");
  if (!tabla) return;

  const thead = tabla.querySelector("thead");
  const tbody = tabla.querySelector("tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  if (!matrizDatos || matrizDatos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-msg">No hay datos disponibles.</td></tr>`;
    return;
  }
  // 1. Encabezados
  const cabeceras = matrizDatos[0];
  let htmlHead = "<tr>";
  cabeceras.forEach((col, indexCol) => {
    const alignClass = indexCol === 0 ? "col-periodo" : "col-monto";
    htmlHead += `<th class="${alignClass}">${col}</th>`;
  });
  htmlHead += "</tr>";
  thead.innerHTML = htmlHead;

  // 2. Filas de datos
  const filasDeDatos = matrizDatos.slice(1).reverse();
  let htmlBody = "";

  filasDeDatos.forEach((fila, indexFila) => {
    const classFila = indexFila === 0 ? "row-latest" : "";
    htmlBody += `<tr class="${classFila}">`;

    fila.forEach((celda, indexCol) => {
      let valorTxt = (celda === "" || celda === null) ? "—" : celda;
      let esValorFaltante = false;

      // Formateo numérico a partir de la columna B
      if (indexCol >= 1 && celda !== "" && celda !== null) {
        const numero = Number(celda);
        if (!isNaN(numero)) {
          valorTxt = numero.toFixed(2);
          if (numero < 0.1) {
            esValorFaltante = true;
          }
        }
      }

      const contenidoCelda = esValorFaltante 
        ? `<span class="badge-missing">${valorTxt}</span>` 
        : valorTxt;

      const alignClass = indexCol === 0 ? "col-periodo" : "col-monto";
      htmlBody += `<td class="${alignClass}">${contenidoCelda}</td>`;
    });

    htmlBody += "</tr>";
  });

  tbody.innerHTML = htmlBody;
}

/**
 * Filtra la caché en el cliente para no golpear al servidor en cada tecla pulsada
 */
function filtrarYMostrarServicios(termino) {
  if (!cacheServicios || cacheServicios.length === 0) return;
  // Mantenemos la cabecera fija (índice 0)
  const cabecera = cacheServicios[0];
  if (termino === "") {
    renderizarTablaServicios(cacheServicios);
    return;
  }
  // Filtramos el resto de filas
  const filasFiltradas = cacheServicios.slice(1).filter(fila => {
    return fila.some(celda => {
      if (celda === null || celda === "") return false;
      return celda.toString().toLowerCase().includes(termino);
    });
  });
  // Re-ensamblamos matriz con su cabecera para renderizar
  renderizarTablaServicios([cabecera, ...filasFiltradas]);
}

/* ===========================
   EVENTOS LOGGER. – INFORMATIVO
   =========================== */
/**
 * Consulta la base de datos y renderiza la tabla de Eventos del Sistema
 */
function cargarEventosLogger() {
  const tbl = document.getElementById('tbl-eventos');
  if (!tbl) return;

  // Estado de carga visual
  tbl.innerHTML = `
    <tbody>
      <tr>
        <td colspan="5" style="text-align:center; padding:20px; color:#A4E3FF;">
          <i class="fa-solid fa-spinner fa-spin" style="margin-right:8px;"></i> Cargando registro de eventos...
        </td>
      </tr>
    </tbody>`;

  netRun()
  .withSuccessHandler((data) => {
      // Guardar en caché y renderizar de más reciente a más antiguo
      window.eventosCache = Array.isArray(data) ? data.reverse() : [];
      renderTablaEventos(window.eventosCache);
    })
    .withFailureHandler((err) => {
      tbl.innerHTML = `<tbody><tr><td colspan="5" style="text-align:center; color:#fca5a5; padding:15px;">❌ Error al cargar logs: ${err.message || err}</td></tr></tbody>`;
    })
    .api_LOGGER_LOG_Firebase();
}

/**
 * Pinta la estructura de la tabla con los datos del array
 */
function renderTablaEventos(lista) {
  const tbl = document.getElementById('tbl-eventos');
  if (!tbl) return;

  const thead = `
    <thead>
      <tr>
        <th style="width:140px;">📅 FECHA</th>
        <th style="width:120px;">👤 USUARIO</th>
        <th style="width:200px;">⚙️ MÓDULO</th>
        <th>📜 EVENTO / DETALLE</th>
        <th style="width:90px; text-align:center;">ESTADO</th>
      </tr>
    </thead>`;

  if (!lista || lista.length === 0) {
    tbl.innerHTML = thead + `<tbody><tr><td colspan="5" style="text-align:center; padding:15px;">No hay eventos registrados.</td></tr></tbody>`;
    return;
  }

  const tbody = lista.map(item => {
    const fecha  = escapeHTML(item["1-FECHA"] || '—');
    const user   = escapeHTML(item["2-USER"] || '—');
    const modulo = escapeHTML(item["3-MODULO"] || '—');
    const evento = escapeHTML(item["4-EVENTO"] || '—');
    const status = escapeHTML(item["5-STATUS"] || '—');

    return `
      <tr>
        <td style="white-space:nowrap; font-weight:600;">${fecha}</td>
        <td style="white-space:nowrap;">${user}</td>
        <td><small style="color:#a5f3fc;">${modulo}</small></td>
        <td style="word-break:break-word;">${evento}</td>
        <td style="text-align:center;">${status}</td>
      </tr>`;
  }).join('');

  tbl.innerHTML = thead + `<tbody>${tbody}</tbody>`;
}

// Escuchador para búsqueda en tiempo real sobre la caja de texto
document.addEventListener('DOMContentLoaded', () => {
  const inputSearch = document.getElementById('eventos-search');
  if (inputSearch) {
    inputSearch.addEventListener('input', (e) => {
      const term = (e.target.value || '').trim().toLowerCase();
      if (!term) {
        renderTablaEventos(window.eventosCache);
        return;
      }
      // Filtrar por cualquier coincidencia en fecha, usuario, módulo o evento
      const filtrados = window.eventosCache.filter(item => {
        const txtFecha  = String(item["1-FECHA"] || '').toLowerCase();
        const txtUser   = String(item["2-USER"] || '').toLowerCase();
        const txtModulo = String(item["3-MODULO"] || '').toLowerCase();
        const txtEvento = String(item["4-EVENTO"] || '').toLowerCase();
        return txtFecha.includes(term) || txtUser.includes(term) || txtModulo.includes(term) || txtEvento.includes(term);
      });
      renderTablaEventos(filtrados);
    });
  }
  // 🚀 Carga los eventos de Firebase en segundo plano al abrir la app
  cargarEventosLogger(); 
});


/* ====================================================================
   Helpers UI genéricos (añaden estilo sin re-render de tu tabla actual)
   ==================================================================== */
function uiAddBanner(opt){
  const {
    tableId='tabla-banco', section='tbody', beforeRow=null, startCol=1, colSpan=null,
    text='', bg='#0E3A5A', color='#FFFFFF', align='center', bold=true,
    border='1px solid #1f2937', radius=5, padding='0px 0px', gapLeft=0
  } = opt || {};
  const tbl = document.getElementById(tableId);
  if (!tbl) return;

  const sec = section==='thead' ? tbl.tHead :
              section==='tfoot' ? tbl.tFoot  :
              (tbl.tBodies && tbl.tBodies[0]) || null;
  if (!sec) return;

  const sampleRow = sec.rows[0] || (tbl.tBodies[0] && tbl.tBodies[0].rows[0]) || null;
  const totalCols = sampleRow ? sampleRow.cells.length : 0;
  if (!totalCols) return;

  const row = document.createElement('tr');

  for (let c=1; c<startCol; c++){
    row.appendChild(document.createElement('td'));
  }

  const td = document.createElement('td');
  td.colSpan = colSpan == null ? (totalCols - startCol + 1)
                              : Math.max(1, Math.min(colSpan, totalCols - startCol + 1));
  td.textContent = text;
  td.style.background = bg;
  td.style.color = color;
  td.style.textAlign = ['left','center','right'].includes(align) ? align : 'center';
  td.style.fontWeight = bold ? '700' : '400';
  td.style.border = border;
  td.style.borderRadius = (radius|0)+'px';
  td.style.padding = padding;
  if (gapLeft > 0){
    td.style.borderLeft = `${gapLeft}px solid transparent`;
    td.style.boxShadow  = `-${gapLeft}px 0 0 rgba(11,16,32,1) inset`;
  }
  row.appendChild(td);

  if (beforeRow == null || beforeRow > sec.rows.length) {
    sec.appendChild(row);
  } else {
    sec.insertBefore(row, sec.rows[beforeRow-1]);
  }
}

function _visColsInSection(sectionEl){
    const firstRow = sectionEl && sectionEl.querySelector('tr');
    if (!firstRow) return 0;
    let total = 0;
    for (const td of firstRow.cells) total += (td.colSpan || 1);
    return total;
}

document.addEventListener('DOMContentLoaded', () => {
  const tz = 'America/Lima';
  const timeFmt = new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: tz
  });
  const dateFmt = new Intl.DateTimeFormat('es-PE', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    timeZone: tz
  });
 
  
  const updateClocks = () => {
  // 🛡️ 1. Control de Expiración de Sesión en Tiempo Real
  const token = getAuthToken();
  if (token && typeof isSessionExpired === 'function' && isSessionExpired()) {
    if (typeof cerrarSesion === 'function') {
      cerrarSesion();
    } else {
      clearAuth();
      const loginScreen = document.getElementById("login-screen");
      const appContainer = document.getElementById("app-container");
      if (appContainer) appContainer.style.display = "none";
      if (loginScreen) loginScreen.style.display = "flex";
    }
    return; // Detiene la ejecución del reloj si expiró
  }

  // 2. Reloj de hora y fecha local
  const now = new Date();
  const text = `${dateFmt.format(now)} · ${timeFmt.format(now)}`;
  document.querySelectorAll('.clock-24h').forEach(el => { el.textContent = text; });
  
  // 3. Leemos la variable 'prev' de tu motor NetState
  const estadoActual = (typeof prev !== 'undefined') ? prev : 'IDLE';

  // 🛡️ Si el sistema está procesando (BUSY), NetState tiene el control y no sobreescribimos
  if (estadoActual === 'BUSY') return;

  // 4. Si está en IDLE, actualizamos el texto dinámico y mantenemos la clase verde (.srv-idle)
  if (typeof statusLabel === 'function') {
    const textoActualizado = statusLabel('IDLE');

    // Píldora #netStatePill
    const pill = document.getElementById('netStatePill');
    if (pill) {
      pill.textContent = textoActualizado;
      pill.classList.remove('busy');
      pill.classList.add('idle');
    }

    // Badge #srvStatus
    const srv = document.getElementById('srvStatus');
    if (srv) {
      srv.className = 'srv-badge srv-idle';
      const t = srv.querySelector('.txt');
      if (t) t.textContent = textoActualizado;
    }
  }
};

// Reinicio limpio del intervalo único
if (window.__clockInterval) clearInterval(window.__clockInterval);
updateClocks();
window.__clockInterval = setInterval(updateClocks, 1000);
});

// Función para ejecutar calSaldosNew en el backend de GAS al abrir la App
async function ejecutarCalculoSaldosInicial() {

  try {
    const response = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        functionName: 'calSaldosNew',
        parameters: []
      })
    });
    
    const data = await response.json();
    if (data.status === 'success') {
      console.log('Saldos recalculados correctamente al iniciar.');
    } else {
      console.error('Error al recalcular saldos:', data.message);
    }
  } catch (err) {
    console.error('Error en la comunicación con GAS:', err);
  }
}

// =========================================================================
// BLOQUE ÚNICO DE INICIALIZACIÓN DE LA APLICACIÓN
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {

  // 1. Verificación de Sesión al cargar
  const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
  if (token && typeof isSessionExpired === 'function' && !isSessionExpired()) {
    if (typeof mostrarAplicacion === 'function') mostrarAplicacion();
  } else {
    if (typeof clearAuth === 'function') clearAuth();
  }

  // 1. Modales y Vistas Iniciales
  setupRouter();
  setupDeudas?.();
  setupComuna?.();
  setupFullscreen();
  setupSearch();
  contometros_loadStyled({}, contometros_renderStyled);
  setupContometros();
  setupSync();
  setupBancoFormModal?.();
  setupRecibos?.();
  cargarModuloServicios?.();
  ejecutarCalculoSaldosInicial();
  netRun().calSaldosNew();

  // 2. Modales y Navegación
  document.getElementById('btnFormClose')?.addEventListener('click', () => closeForm('contometros'));
  document.getElementById('btnBancoFormClose')?.addEventListener('click', () => closeForm('banco'));
  document.getElementById('banco-refresh')?.addEventListener('click', reloadPage);
  document.getElementById('banco-buscar')?.addEventListener('click', refreshBanco);
  document.getElementById('recibos-refresh')?.addEventListener('click', reloadRecibos);
  document.getElementById('servicios-refresh')?.addEventListener('click', cargarModuloServicios);
  document.getElementById('comuna-refresh')?.addEventListener('click', setupComuna);

  // 3. Buscador en tiempo real de servicios
  document.getElementById('servicios-search')?.addEventListener('input', (e) => {
    const termino = e.target.value.toLowerCase().trim();
    filtrarYMostrarServicios(termino);
  });

  // 4. Recarga de Contómetros
  document.getElementById('btnRecargarConto')?.addEventListener('click', () => {
    const b = document.getElementById('btnRecargarConto');
    const old = b.textContent;
    b.disabled = true;
    b.textContent = 'Actualizando…';
    try {
      contometros_loadStyled({}, data => {
        contometros_renderStyled(data);
        b.disabled = false;
        b.textContent = old;
      });
    } catch (e) {
      b.disabled = false;
      b.textContent = old;
      alert(e);
    }
  });

  // 5. Botones de Reportes (Mantienen tu código actual intacto)
  document.getElementById('btnRepGen')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRepGen');
    const linksDiv = document.getElementById('reportLinks');
    if (!btn || !linksDiv) return;

    if (!btn.dataset._old) btn.dataset._old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Generando Reporte…';
    linksDiv.innerHTML = '';

    let token = null;
    try { token = await ensureAuthTokenBanco(); } catch { token = null; }
    if (!token) {
      btn.disabled = false;
      btn.textContent = btn.dataset._old;
      return;
    }

    netRun()
      .withSuccessHandler(res => {
        btn.disabled = false;
        btn.textContent = '✅ Reporte Generado';
        if (res?.user) sessionStorage.setItem('AUTH_USER', res.user);
        if (res?.ok && res?.urlPDF) {
          linksDiv.innerHTML = getBtnPDF(res);
        } else {
          linksDiv.textContent = '❌ ' + (res?.error || 'No se pudo generar el reporte PDF');
        }
      })
      .withFailureHandler(err => {
        btn.disabled = false;
        btn.textContent = btn.dataset._old;
        linksDiv.textContent = 'Error: ' + (err?.message || String(err));
      })
      .reporteGeneral_web({
        authToken: token,
        userAuth: typeof window.usuarioActivo === 'function' ? window.usuarioActivo() : ''
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
    netRun()
      .withSuccessHandler(res => {
        btn.disabled = false;
        btn.textContent = '✅ Lista Generada';
        if (res?.urlDrive) {
          linksDiv.innerHTML = getBtnPDF(res);
        } else {
          linksDiv.textContent = "❌ No se pudo generar el reporte";
        }
      })
      .withFailureHandler(err => {
        btn.disabled = false;
        btn.textContent = '📊 Listar Deudas';
        linksDiv.textContent = "Error: " + (err.message || err);
      })
      .generarReporteDeudas_web(window.usuarioActivo(), valorMin);
  });

  document.getElementById('btnRecExel')?.addEventListener('click', () => {
    const btn = document.getElementById('btnRecExel');
    const linksDiv = document.getElementById('exportLinks');
    btn.disabled = true;
    btn.textContent = '⏳ Generando Recibos...';
    linksDiv.innerHTML = "";
    netRun()
      .withSuccessHandler(res => {
        btn.disabled = false;
        btn.textContent = '✅ Recibos Procesados';
        if (res?.urlDrive) {
          linksDiv.innerHTML = getBtnDrive(res) + getBtnExcel(res);
        } else {
          linksDiv.textContent = "❌ No se pudo generar el archivo";
        }
      })
      .withFailureHandler(err => {
        btn.disabled = false;
        btn.textContent = '📤 Recibos en Excel';
        linksDiv.textContent = "Error: " + (err.message || err);
      })
      .downloadSheetAsXlsx_web(window.usuarioActivo());
  });

  document.getElementById('btnRepAguas')?.addEventListener('click', () => {
    const btn = document.getElementById('btnRepAguas');
    const linksDiv = document.getElementById('aguasLinks');
    btn.disabled = true;
    btn.textContent = '⏳ Generando Reportes...';
    linksDiv.innerHTML = '';

    const setError = (err) => {
      btn.disabled = false;
      btn.textContent = '📤 Generar Reportes';
      linksDiv.textContent = 'Error: ' + (err?.message || err);
    };

    netRun()
      .withSuccessHandler((resXlsx) => {
        netRun()
          .withSuccessHandler((resPdf) => {
            btn.disabled = false;
            btn.textContent = '✅ Reportes Generados';
            const parts = [];
            if (resXlsx?.urlDrive) parts.push(getBtnDrive(resXlsx));
            if (resXlsx?.urlDownload) parts.push(getBtnExcel(resXlsx));
            if (resPdf?.urlPDF) parts.push(getBtnPDF(resPdf));
            linksDiv.innerHTML = parts.join('') || '❌ No se pudo generar el archivo';
          })
          .withFailureHandler(setError)
          .reporteAguasPDF_Web();
      })
      .withFailureHandler(setError)
      .downloadComtometsXlsx_web(window.usuarioActivo());
  });

  // 6. Listener Unificado de Mensajes
  window.addEventListener('message', (ev) => {
    const d = ev?.data;
    if (!d) return;

    // 1. Mensajes simples en formato texto (Strings)
    if (d === 'contometros-close') closeContometrosForm?.();
    if (d === 'banco-form-close' || d === 'closeBancoForm') closeBancoForm?.();

    // 2. Mensajes en formato Objeto { type, message, ... }
    if (typeof d === 'object') {
      // Cierre de modales/diálogos
      if (d.type === 'contometros-close') closeContometrosForm?.();
      if (d.type === 'banco-form-close' || d.type === 'closeBancoForm') closeBancoForm?.();
      if (d.type === 'closeContometros') closeContometrosForm?.();

      // Notificaciones Toast
      if (d.type === 'toast') toast?.(String(d.message || ''));

      // Expiración de sesión
      if (d.type === 'contometros-auth-expired' || d.type === 'banco-auth-expired') {
        if (typeof cerrarSesion === 'function') {
          cerrarSesion();
        } else {
          if (typeof clearAuth === 'function') clearAuth();
          else {
            sessionStorage.removeItem('AUTH_TOKEN');
            sessionStorage.removeItem('AUTH_USER');
            sessionStorage.removeItem('AUTH_EXPIRE');
          }
          const loginScreen = document.getElementById("login-screen");
          const appContainer = document.getElementById("app-container");
          if (appContainer) appContainer.style.display = "none";
          if (loginScreen) loginScreen.style.display = "flex";
        }
      }
    }
  });

  
});

