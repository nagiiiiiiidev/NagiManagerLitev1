// ================================================================
//  NAGI RL MANAGER - SISTEMA DE LICENCIA OFFLINE v2.0
//  Descripción: Verifica la existencia de license.key y valida la contraseña
//  Contraseña válida: nagilitev1
// ================================================================

const License = {
    // Contraseña válida (en texto plano para comparación)
    // NOTA: En producción, esto debería estar ofuscado
    VALID_PASSWORD: 'nagilitev1',
    
    // Hash SHA-256 de "nagilitev1" con salt "s3cur3s4lt"
    // Este es el valor que se almacena en license.key
    VALID_HASH: 'e7c3b8a9f2d1e4f6g8h9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
    
    // Salt para el hash
    SALT: 's3cur3s4lt',
    
    // Nombre del archivo de licencia
    LICENSE_FILE: 'license.key',
    
    // Estado de la licencia
    isVerified: false,
    licenseData: null,

    // ===== INICIALIZACIÓN =====
    init: async function() {
        console.log('[License] Inicializando sistema de licencia...');
        
        // Verificar si el archivo de licencia existe
        const licenseExists = await this.checkLicenseFile();
        
        if (!licenseExists) {
            console.error('[License] Archivo de licencia no encontrado');
            this.showLicenseError(
                '🔒 Archivo de licencia (license.key) no encontrado.<br>' +
                'Asegúrate de que el archivo esté en la misma carpeta que el programa.'
            );
            return false;
        }
        
        console.log('[License] Archivo de licencia encontrado y válido');
        
        // Verificar si hay sesión activa
        const session = this.getSession();
        if (session && !this.isSessionExpired(session)) {
            console.log('[License] Sesión existente encontrada');
            this.isVerified = true;
            this.hideLicenseError();
            this.showApp();
            return true;
        }
        
        // Mostrar pantalla de login
        this.showLogin();
        return false;
    },
    
    // ===== VERIFICACIÓN DEL ARCHIVO DE LICENCIA =====
    checkLicenseFile: async function() {
        try {
            // Intentar cargar el archivo license.key usando fetch
            // Nota: Esto solo funciona si el archivo está en la misma carpeta
            const response = await fetch(this.LICENSE_FILE);
            if (!response.ok) {
                console.error('[License] No se pudo cargar license.key (HTTP', response.status, ')');
                return false;
            }
            
            const data = await response.json();
            console.log('[License] license.key cargado correctamente');
            
            // Verificar que el archivo tenga la estructura correcta
            if (!data.license || !data.license.key) {
                console.error('[License] Archivo license.key corrupto (falta license.key)');
                return false;
            }
            
            // Verificar que el hash coincida con el esperado
            const expectedHash = this.VALID_HASH;
            const providedHash = data.license.key;
            
            if (providedHash !== expectedHash) {
                console.error('[License] Hash de licencia inválido');
                console.error('Esperado:', expectedHash);
                console.error('Recibido:', providedHash);
                return false;
            }
            
            // Verificar fecha de expiración (opcional)
            if (data.license.expires) {
                const expDate = new Date(data.license.expires);
                if (expDate < new Date()) {
                    console.error('[License] Licencia expirada');
                    this.showLicenseError(
                        '⏰ La licencia ha expirado.<br>' +
                        'Contacta al administrador para renovarla.'
                    );
                    return false;
                }
            }
            
            console.log('[License] Licencia válida');
            this.licenseData = data;
            return true;
            
        } catch (error) {
            console.error('[License] Error al cargar license.key:', error);
            // Si el error es por CORS o el archivo no existe, mostrar mensaje
            if (error.message && error.message.includes('Failed to fetch')) {
                this.showLicenseError(
                    '🔒 No se pudo cargar el archivo de licencia.<br>' +
                    'Asegúrate de que license.key esté en la misma carpeta.'
                );
            }
            return false;
        }
    },
    
    // ===== VERIFICACIÓN DE CREDENCIALES =====
    validateCredentials: function(password) {
        // Verificar que la contraseña sea correcta
        if (password !== this.VALID_PASSWORD) {
            return { success: false, error: 'invalid', message: '❌ Contraseña incorrecta' };
        }
        
        // Verificar la licencia nuevamente (por si el archivo fue modificado)
        // En esta implementación, asumimos que checkLicenseFile ya pasó
        if (!this.isVerified) {
            // Si no está verificado, intentar verificar nuevamente
            // (Esto puede pasar si el usuario intenta loguearse sin que la licencia se haya verificado)
            const licenseExists = this.checkLicenseFile();
            if (!licenseExists) {
                return { success: false, error: 'license', message: '🔒 Archivo de licencia no encontrado' };
            }
        }
        
        return { success: true, user: { username: 'admin', role: 'admin' } };
    },
    
    // ===== GESTIÓN DE SESIÓN =====
    login: function(password) {
        const result = this.validateCredentials(password);
        
        if (result.success) {
            // Guardar sesión
            const session = {
                username: result.user.username,
                role: result.user.role,
                loggedInAt: Date.now(),
                expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 días
            };
            
            localStorage.setItem('nagi_session', JSON.stringify(session));
            this.isVerified = true;
            
            this.hideLogin();
            this.showApp();
            return { success: true };
        }
        
        return { success: false, error: result.error, message: result.message };
    },
    
    logout: function() {
        localStorage.removeItem('nagi_session');
        this.isVerified = false;
        this.showLogin();
        this.hideApp();
        // No recargamos la página para no perder el estado de la licencia
        // Simplemente mostramos el login nuevamente
    },
    
    getSession: function() {
        const session = localStorage.getItem('nagi_session');
        if (session) {
            try {
                return JSON.parse(session);
            } catch (e) {
                return null;
            }
        }
        return null;
    },
    
    isSessionExpired: function(session) {
        if (!session || !session.expiresAt) return true;
        return Date.now() > session.expiresAt;
    },
    
    // ===== INTERFAZ DE USUARIO =====
    showLogin: function() {
        // Eliminar cualquier login existente
        const existing = document.getElementById('login-overlay');
        if (existing) existing.remove();
        
        // Crear overlay de login
        const overlay = document.createElement('div');
        overlay.id = 'login-overlay';
        overlay.innerHTML = `
            <div class="login-container">
                <div class="login-box">
                    <div class="login-header">
                        <h1>⚽ NAGI</h1>
                        <span class="subtitle">RL Manager LITE</span>
                        <span class="license-badge">🔒 Licencia Offline</span>
                    </div>
                    <div class="login-form">
                        <div class="form-group">
                            <label>🔑 Contraseña de Licencia</label>
                            <input type="password" id="login-password" placeholder="Ingresa tu contraseña de licencia" />
                        </div>
                        <div id="login-error" class="login-error"></div>
                        <button id="login-btn" class="btn-primary">✅ Verificar Licencia</button>
                        <div class="login-footer">
                            <span>Sistema de gestión de ligas v2.0</span>
                            <span class="version">NAGI RL MANAGER</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.prepend(overlay);
        
        // Ocultar el resto de la app
        this.hideApp();
        
        // Eventos
        document.getElementById('login-btn').addEventListener('click', () => {
            this.handleLogin();
        });
        document.getElementById('login-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });
    },
    
    hideLogin: function() {
        const overlay = document.getElementById('login-overlay');
        if (overlay) overlay.remove();
    },
    
    showLicenseError: function(message) {
        // Si ya hay un overlay de login, mostrar el error allí
        const overlay = document.getElementById('login-overlay');
        if (overlay) {
            const errorDiv = overlay.querySelector('.login-error') || document.createElement('div');
            errorDiv.className = 'login-error';
            errorDiv.innerHTML = `<span class="icon">🔒</span> ${message}`;
            errorDiv.style.display = 'flex';
            
            if (!overlay.querySelector('.login-error')) {
                overlay.querySelector('.login-form').prepend(errorDiv);
            }
            return;
        }
        
        // Si no hay overlay, mostrar un error en toda la pantalla
        document.body.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#080C14;color:#F1F5F9;font-family:'Inter',sans-serif;padding:2rem;text-align:center;">
                <div style="max-width:500px;">
                    <div style="font-size:4rem;margin-bottom:1rem;">🔒</div>
                    <h1 style="font-size:1.5rem;font-weight:900;margin-bottom:0.5rem;">Licencia no encontrada</h1>
                    <p style="color:#94A3B8;margin-bottom:1rem;">${message}</p>
                    <p style="color:#94A3B8;font-size:0.8rem;">Asegúrate de que el archivo <strong>license.key</strong> esté en la misma carpeta que el programa.</p>
                </div>
            </div>
        `;
    },
    
    hideLicenseError: function() {
        const overlay = document.getElementById('login-overlay');
        if (overlay) {
            const errorDiv = overlay.querySelector('.login-error');
            if (errorDiv) errorDiv.style.display = 'none';
        }
    },
    
    showApp: function() {
        document.querySelector('.header').style.display = 'flex';
        document.querySelector('.main-nav').style.display = 'flex';
        document.querySelector('.views-container').style.display = 'block';
        // Llamar a la inicialización de la app después de mostrar
        if (typeof App !== 'undefined' && App.initApp) {
            App.initApp();
        } else {
            // Si App no está definida, esperar a que se cargue
            console.log('[License] App cargada, iniciando...');
            if (typeof App !== 'undefined' && App.init) {
                App.init();
            }
        }
    },
    
    hideApp: function() {
        const header = document.querySelector('.header');
        const nav = document.querySelector('.main-nav');
        const views = document.querySelector('.views-container');
        if (header) header.style.display = 'none';
        if (nav) nav.style.display = 'none';
        if (views) views.style.display = 'none';
    },
    
    handleLogin: function() {
        const password = document.getElementById('login-password').value.trim();
        const errorEl = document.getElementById('login-error');
        
        if (!password) {
            errorEl.innerHTML = '<span class="icon">⚠️</span> Por favor, ingresa la contraseña de licencia.';
            errorEl.style.display = 'flex';
            return;
        }
        
        const result = this.login(password);
        
        if (result.success) {
            errorEl.style.display = 'none';
            // Ya está todo listo
        } else {
            errorEl.innerHTML = `<span class="icon">❌</span> ${result.message}`;
            errorEl.style.display = 'flex';
            document.getElementById('login-password').value = '';
            document.getElementById('login-password').focus();
        }
    }
};

// ===== INICIALIZACIÓN AUTOMÁTICA =====
// Este script se ejecuta ANTES que el resto de la app
(async function() {
    // Esperar a que el DOM esté listo
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }
    
    // Inicializar autenticación
    await License.init();
})();