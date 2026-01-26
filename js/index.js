// 1. Configuración de Alertas (Toast)
const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2000,
    timerProgressBar: true,
    background: '#1e2332',
    color: '#fff',
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer)
        toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
});

// 2. Variables Globales
let tasaCambio = 0;
let tramosComision = [];
let cuentaZelle = "";

// 3. Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    inicializar();
    setupListeners(); 
});

// --- FUNCIONES DEL LOADER ---
function actualizarLoader(progreso, mensaje) {
    const bar = document.getElementById('main-progress-bar');
    const percentText = document.getElementById('progress-percent');
    const statusText = document.getElementById('loader-status-text');

    if(bar) bar.style.width = `${progreso}%`;
    if(percentText) percentText.innerText = `${progreso}%`;
    if(statusText && mensaje) statusText.innerText = mensaje;
}

function rotarTips() {
    const tips = document.querySelectorAll('.tip-item');
    if(!tips.length) return null;
    let currentTip = 0;
    tips[currentTip].classList.add('active');

    return setInterval(() => {
        tips[currentTip].classList.remove('active');
        currentTip = (currentTip + 1) % tips.length;
        tips[currentTip].classList.add('active');
    }, 2500);
}

// --- INICIALIZAR TODO ---
async function inicializar() {
    const startTime = Date.now();
    const tipInterval = rotarTips();

    const quitarLoader = () => {
        const loader = document.getElementById('loader-wrapper');
        if(!loader) return;
        loader.style.opacity = '0';
        loader.style.pointerEvents = 'none';
        setTimeout(() => loader.remove(), 800);
    };

    try {
        actualizarLoader(15, "Iniciando protocolos de seguridad...");

        if(typeof supabaseClient === 'undefined') {
            throw new Error("supabaseClient no definido. Revisa la carga de la librería Supabase.");
        }

        await new Promise(r => setTimeout(r, 600)); // Delay estético
        actualizarLoader(45, "Sincronizando con base de datos...");

        // Consultas en paralelo
        const [configResult, comisionesResult] = await Promise.all([
            supabaseClient.from('config').select('*').limit(1).single(),
            supabaseClient.from('comisiones').select('*').order('monto_min', { ascending: true })
        ]);

        if(configResult.error) throw configResult.error;
        if(comisionesResult.error) throw comisionesResult.error;

        actualizarLoader(80, "Actualizando tasas y comisiones...");

        // Guardar datos globales
        const config = configResult.data ?? {};
        tasaCambio = config.tasa_cambio ?? 0;
        cuentaZelle = config.zelle_cuenta ?? 'pago@fastcuba.com';
        tramosComision = comisionesResult.data ?? [];

        // Actualizar DOM
        const tasaPromo = document.getElementById('tasa-promo');
        const zelleAcc = document.getElementById('zelle-account');
        const homeTasaVal = document.getElementById('home-tasa-val');

        if(tasaPromo) tasaPromo.textContent = tasaCambio;
        if(zelleAcc) zelleAcc.textContent = cuentaZelle;
        if(homeTasaVal) homeTasaVal.textContent = `${tasaCambio} CUP`;

        // Actualizar calculadora HOME
        const homeInput = document.getElementById('home-monto-usd');
        if(homeInput) {
            const montoInicial = parseFloat(homeInput.value) || 0;
            actualizarCalculosHome(montoInicial);
        }

        actualizarLoader(100, "Sistema listo para operar");

    } catch(error) {
        console.error('❌ Error al inicializar:', error);
        const statusText = document.getElementById('loader-status-text');
        if(statusText) {
            statusText.style.color = 'var(--error)';
            statusText.innerText = "Error de conexión. Reintente.";
        }
    } finally {
        const elapsed = Date.now() - startTime;
        const delay = Math.max(4000, 6000 - elapsed); // Asegura que se vea 100% un momento
        setTimeout(() => {
            clearInterval(tipInterval);
            quitarLoader();
        }, delay);
    }
}

// --- LISTENERS DE CALCULADORAS ---
function setupListeners() {
    const homeInput = document.getElementById('home-monto-usd');
    if(homeInput) homeInput.addEventListener('input', e => {
        const monto = parseFloat(e.target.value) || 0;
        actualizarCalculosHome(monto);
    });

    const modalInput = document.getElementById('monto_usd');
    if(modalInput) modalInput.addEventListener('input', e => {
        const monto = parseFloat(e.target.value) || 0;
        const comision = obtenerComision(monto);
        const totalUsd = document.getElementById('total_usd');
        const totalCup = document.getElementById('total_cup');

        if(totalUsd) totalUsd.innerText = `$${(monto + comision).toFixed(2)}`;
        if(totalCup) totalCup.innerText = `${(monto * tasaCambio).toLocaleString('es-CU')} CUP`;
    });
}

// --- CALCULOS ---
function obtenerComision(monto) {
    const tramo = tramosComision.find(t => monto >= t.monto_min && monto <= t.monto_max);
    return tramo ? parseFloat(tramo.comision) : 0;
}

function actualizarCalculosHome(monto) {
    const comision = obtenerComision(monto);
    const totalPagar = monto + comision;
    const recibenCup = monto * tasaCambio;

    const inputCup = document.getElementById('home-monto-cup');
    if(inputCup) inputCup.value = `${recibenCup.toLocaleString('es-CU')} CUP`;

    const comisionVal = document.getElementById('home-comision-val');
    if(comisionVal) comisionVal.innerText = `$${comision.toFixed(2)}`;

    const totalPagarEl = document.getElementById('home-total-pagar');
    if(totalPagarEl) totalPagarEl.innerText = `$${totalPagar.toFixed(2)}`;

    const modalInput = document.getElementById('monto_usd');
    if(modalInput) modalInput.value = monto;
}

// --- FUNCIONES DE MODAL Y BOTONES ---
function abrirModal() {
    const notification = document.getElementById('fab-notification');
    if(notification) notification.style.display = 'none';

    const modal = document.getElementById('modalTransferencia');
    if(modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function cerrarModal() {
    const modal = document.getElementById('modalTransferencia');
    if(modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    resetForm();
}

function nextStep(step) {
    const activeStepDiv = document.querySelector('.step.active');
    
    // Obtener el número del paso actual desde el ID (ej: "step-1" -> 1)
    const currentStepNum = parseInt(activeStepDiv.id.split('-')[1]);

    // SOLO validamos si el usuario intenta ir hacia ADELANTE
    if (step > currentStepNum) {
        const inputs = activeStepDiv.querySelectorAll('input[required]');
        let hayCamposVacios = false;

        inputs.forEach(input => {
            if (!input.value.trim()) {
                hayCamposVacios = true;
                input.style.borderColor = 'var(--error)'; // Feedback visual en rojo
            } else {
                input.style.borderColor = 'var(--glass-border)'; // Restaurar color
            }
        });

        if (hayCamposVacios) {
            Swal.fire({ 
                icon: 'warning', 
                title: 'Falta información', 
                text: 'Por favor rellena todos los campos obligatorios para continuar.', 
                background: '#1e2332', 
                color: '#fff',
                confirmButtonColor: 'var(--primary)'
            });
            return; // Detiene la ejecución, no cambia de paso
        }

        // Validación extra para el monto mínimo en el Paso 1
        if (currentStepNum === 1) {
            const monto = parseFloat(document.getElementById('monto_usd').value);
            if (monto < 50) {
                Swal.fire({ 
                    icon: 'warning', 
                    title: 'Monto insuficiente', 
                    text: 'El envío mínimo permitido es de $50 USD.', 
                    background: '#1e2332', 
                    color: '#fff' 
                });
                document.getElementById('monto_usd').style.borderColor = 'var(--error)';
                return;
            }
        }
    }

    // Si pasó las validaciones o va hacia atrás, cambiamos de paso
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    const nextDiv = document.getElementById(`step-${step}`);
    if (nextDiv) {
        nextDiv.classList.add('active');
        // Opcional: Scrollear al inicio del modal por si el contenido es largo
        document.querySelector('.modal-content').scrollTop = 0;
    }
}

function iniciarConMonto() {
    const monto = parseFloat(document.getElementById('home-monto-usd')?.value) || 0;
    if(monto < 50){
        Swal.fire({ icon: 'warning', title: 'Monto mínimo', text: 'El envío mínimo es de $50 USD', background: '#1e2332', color: '#fff' });
        return;
    }
    abrirModal();
    nextStep(1);
}

function copiarZelle() {
    const texto = document.getElementById('zelle-account')?.innerText;
    if(texto) navigator.clipboard.writeText(texto).then(() => {
        Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Copiado!', showConfirmButton: false, timer: 1500 });
    });
}

function resetForm() {
    const form = document.getElementById('form-transaccion');
    if(form) form.reset();

    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    const step0 = document.getElementById('step-0');
    if(step0) step0.classList.add('active');
}

// --- Funciones de Rastreo Corregidas ---

function abrirModalTracking() {
    const modal = document.getElementById('modalTracking');
    modal.classList.add('active'); // Usamos clases para la animación
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function cerrarModalTracking() {
    const modal = document.getElementById('modalTracking');
    modal.classList.remove('active');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
    document.body.style.overflow = 'auto';
    document.getElementById('tracking-results').style.display = 'none';
    document.getElementById('search-input').value = '';
}

async function buscarTransaccion() {
    const busqueda = document.getElementById('search-input').value.trim();
    const resultsContainer = document.getElementById('tracking-results');
    
    if (!busqueda) {
        Swal.fire({ icon: 'warning', title: 'Atención', text: 'Ingresa tu número de WhatsApp.', background: '#1e2332', color: '#fff' });
        return;
    }

    resultsContainer.innerHTML = '<p style="text-align:center; padding:20px;">Buscando...</p>';
    resultsContainer.style.display = 'block';

    try {
        // 1. ELIMINAMOS el .order('created_at') para que no de error
        const { data, error } = await supabaseClient
            .from('transacciones')
            .select('*')
            .eq('remitente_whatsapp', busqueda)
            .limit(5); 

        if (error) throw error;

        if (!data || data.length === 0) {
            resultsContainer.innerHTML = `
                <div style="text-align:center; padding: 20px; border: 1px dashed rgba(255,255,255,0.2); border-radius:15px;">
                    <p style="color:var(--text-secondary); margin:0;">No se encontraron envíos para este número.</p>
                </div>`;
            return;
        }

        resultsContainer.innerHTML = '<h4 style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:15px;">ENVÍOS ENCONTRADOS:</h4>';
        
        data.forEach(tr => {
            // 2. USAMOS UNA FECHA ALTERNATIVA: 
            // Si created_at no existe, intentamos usar otra columna o ponemos "Reciente"
            const fechaLabel = tr.created_at ? new Date(tr.created_at).toLocaleDateString() : 'Envío Reciente';
            const estado = (tr.estado || 'pendiente').toLowerCase();
            const cupRecibe = (tr.monto_usd * (tr.tasa_cambio || tasaCambio)).toLocaleString();

            const card = `
                <div class="tracking-card">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <div>
                            <small style="color:var(--text-secondary); font-size:0.7rem;">${fechaLabel}</small>
                            <div style="font-weight:700; font-size:0.9rem;">${tr.beneficiario_nombre || 'Sin nombre'}</div>
                        </div>
                        <span class="status-pill status-${estado}">${estado}</span>
                    </div>
                    <div class="tracking-info" style="margin-top:10px; display:flex; justify-content:space-between;">
                        <span style="opacity:0.7">$${tr.monto_usd} USD</span>
                        <strong style="color:var(--primary)">${cupRecibe} CUP</strong>
                    </div>
                </div>`;
            resultsContainer.innerHTML += card;
        });

    } catch (err) {
        console.error("Error detallado:", err);
        resultsContainer.innerHTML = `<p style="color:var(--error); font-size:0.8rem; text-align:center;">Error al consultar la base de datos.</p>`;
    }
}

// --- EXPONER FUNCIONES GLOBALES ---
window.copiarZelle = copiarZelle;
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.nextStep = nextStep;
window.iniciarConMonto = iniciarConMonto;