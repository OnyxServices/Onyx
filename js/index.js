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

async function inicializar() {
    const startTime = Date.now();

    try {
        // Obtener tasa y cuenta zelle de la tabla config
        const { data: config, error: errConfig } = await supabaseClient.from('config').select('*').limit(1).single();
        if (errConfig) throw errConfig;

        tasaCambio = config?.tasa_cambio || 0;
        cuentaZelle = config?.zelle_cuenta || "pago@fastcuba.com";
        
        // Actualizar elementos de la interfaz si existen
        if(document.getElementById('tasa-promo')) document.getElementById('tasa-promo').innerText = tasaCambio;
        if(document.getElementById('zelle-account')) document.getElementById('zelle-account').innerText = cuentaZelle;
        if(document.getElementById('home-tasa-val')) document.getElementById('home-tasa-val').innerText = tasaCambio + " CUP";

        // Obtener tramos de comisiones
        const { data: comisiones, error: errCom } = await supabaseClient.from('comisiones').select('*').order('monto_min',{ascending:true});
        if (errCom) throw errCom;
        tramosComision = comisiones || [];

    } catch (e) {
        console.error(" Error de carga:", e);
    } finally {
        // Quitar pantalla de carga tras al menos 2 segundos para elegancia
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(2000 - elapsed, 0); 

        setTimeout(() => {
            const loader = document.getElementById('loader-wrapper');
            if(loader) {
                loader.style.opacity = '0';
                setTimeout(() => loader.style.display = 'none', 1000);
            }
        }, remaining);
    }
}

// 4. Listeners para Calculadoras (Home y Modal)
function setupListeners() {
    // Calculadora del HOME
    const homeInput = document.getElementById('home-monto-usd');
    if (homeInput) {
        homeInput.addEventListener('input', (e) => {
            const monto = parseFloat(e.target.value) || 0;
            actualizarCalculosHome(monto);
        });
    }

    // Calculadora del MODAL (Paso 1)
    const modalInput = document.getElementById('monto_usd');
    if (modalInput) {
        modalInput.addEventListener('input', (e) => {
            const monto = parseFloat(e.target.value) || 0;
            const comision = obtenerComision(monto);
            document.getElementById('total_usd').innerText = `$${(monto + comision).toFixed(2)}`;
            document.getElementById('total_cup').innerText = `${(monto * tasaCambio).toLocaleString('es-CU')} CUP`;
        });
    }
}

function obtenerComision(monto) {
    const tramo = tramosComision.find(t => monto >= t.monto_min && monto <= t.monto_max);
    return tramo ? parseFloat(tramo.comision) : 0;
}

function actualizarCalculosHome(monto) {
    const comision = obtenerComision(monto);
    const totalPagar = monto + comision;
    const recibenCup = monto * tasaCambio;

    if(document.getElementById('home-monto-cup')) 
        document.getElementById('home-monto-cup').value = recibenCup.toLocaleString('es-CU') + " CUP";
    
    if(document.getElementById('home-comision-val')) 
        document.getElementById('home-comision-val').innerText = `$${comision.toFixed(2)}`;
    
    if(document.getElementById('home-total-pagar')) 
        document.getElementById('home-total-pagar').innerText = `$${totalPagar.toFixed(2)}`;

    // Sincronizar con el input del modal automáticamente
    const modalInput = document.getElementById('monto_usd');
    if(modalInput) modalInput.value = monto;
}

// 5. Funciones de Navegación del Modal
function abrirModal() {
    const notification = document.getElementById('fab-notification');
    if(notification) notification.style.display = 'none';

    const modal = document.getElementById('modalTransferencia');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function cerrarModal() {
    const modal = document.getElementById('modalTransferencia');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    resetForm();
}

function nextStep(step) {
    // Validación de campos antes de avanzar
    const activeStepDiv = document.querySelector('.step.active');
    if (activeStepDiv && parseInt(activeStepDiv.id.split('-')[1]) < step) {
        const inputs = activeStepDiv.querySelectorAll('input[required]');
        for (let input of inputs) {
            if (!input.value.trim()) {
                Swal.fire({ icon: 'warning', title: 'Falta información', text: 'Por favor rellena los campos marcados.', background: '#24243e', color: '#fff' });
                return;
            }
        }
    }

    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${step}`).classList.add('active');
}

function iniciarConMonto() {
    const monto = parseFloat(document.getElementById('home-monto-usd')?.value) || 0;
    if (monto < 50) {
        Swal.fire({ icon: 'warning', title: 'Monto mínimo', text: 'El envío mínimo es de $50 USD', background: '#1e2332', color: '#fff' });
        return;
    }
    abrirModal();
    nextStep(1); 
}

function copiarZelle() {
    const texto = document.getElementById('zelle-account').innerText;
    navigator.clipboard.writeText(texto).then(() => {
        Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Copiado!', showConfirmButton: false, timer: 1500 });
    });
}

function resetForm() {
    document.getElementById('form-transaccion').reset();
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById('step-0').classList.add('active');
}

// Funciones para el Modal de Tracking
function abrirModalTracking() {
    document.getElementById('modalTracking').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function cerrarModalTracking() {
    document.getElementById('modalTracking').style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('tracking-results').style.display = 'none';
    document.getElementById('search-input').value = '';
}

async function buscarTransaccion() {
    const busqueda = document.getElementById('search-input').value.trim();
    const resultsContainer = document.getElementById('tracking-results');
    
    if (!busqueda) {
        Swal.fire({ icon: 'info', title: 'Atención', text: 'Ingresa tu número de WhatsApp.', background: '#1e2332', color: '#fff' });
        return;
    }

    resultsContainer.innerHTML = '<p style="text-align:center;">Buscando...</p>';
    resultsContainer.style.display = 'block';

    try {
        // Intentamos la consulta SIN el .order() para evitar el error de columna inexistente
        const { data, error } = await supabaseClient
            .from('transacciones')
            .select('*')
            .eq('remitente_whatsapp', busqueda)
            .limit(5); // Traemos los últimos 5 encontrados

        if (error) {
            console.error("Detalle del error Supabase:", error);
            throw error;
        }

        if (!data || data.length === 0) {
            resultsContainer.innerHTML = '<p style="color:var(--error); text-align:center;">No se encontraron envíos con este número.</p>';
            return;
        }

        resultsContainer.innerHTML = '<h4 style="margin-bottom:15px; border-bottom: 1px solid #333; padding-bottom:5px;">Envíos encontrados:</h4>';
        
        data.forEach(tr => {
            // Intentamos obtener una fecha, si no existe created_at usamos "Reciente"
            const fechaFormateada = tr.created_at ? new Date(tr.created_at).toLocaleDateString() : 'Reciente';
            
            const card = `
                <div class="tracking-card">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <div>
                            <small style="color:var(--text-secondary)">${fechaFormateada}</small>
                            <div style="font-weight:700;">Para: ${tr.beneficiario_nombre || 'No indicado'}</div>
                        </div>
                        <span class="status-pill status-${(tr.estado || 'pendiente').toLowerCase()}">${tr.estado || 'Pendiente'}</span>
                    </div>
                    <div class="tracking-info">
                        <span>Enviado: $${tr.monto_usd} USD</span>
                        <strong style="color:var(--primary)">${(tr.monto_usd * (tr.tasa_cambio || 0)).toLocaleString()} CUP</strong>
                    </div>
                </div>
            `;
            resultsContainer.innerHTML += card;
        });

    } catch (err) {
        console.error("Error completo:", err);
        resultsContainer.innerHTML = `<p style="color:var(--error); font-size:0.8rem;">Error: ${err.message || 'Consulta fallida'}. Verifica que la columna 'remitente_whatsapp' exista.</p>`;
    }
}

// Exponer funciones al objeto window
window.abrirModalTracking = abrirModalTracking;
window.cerrarModalTracking = cerrarModalTracking;
window.buscarTransaccion = buscarTransaccion;

// 6. Envío de Datos a Supabase
async function subirImagen(file) {
    if(!file) return null;
    const carpeta = new Date().toISOString().split('T')[0];
    const extension = file.name.split('.').pop();
    const ruta = `${carpeta}/${Date.now()}.${extension}`;
    
    const { data, error } = await supabaseClient.storage.from('comprobantes').upload(ruta, file);
    if (error) return null;
    return supabaseClient.storage.from('comprobantes').getPublicUrl(ruta).data.publicUrl;
}

document.getElementById('form-transaccion').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById('btn-enviar');
    const fileInput = document.getElementById('comprobante');

    if (fileInput.files.length === 0) {
        Swal.fire({ icon: 'warning', title: 'Comprobante requerido', text: 'Sube la captura de tu pago Zelle.', background: '#24243e', color: '#fff' });
        return;
    }

    btn.disabled = true;
    btn.innerText = "Procesando...";

    Swal.fire({ title: 'Enviando...', text: 'Estamos registrando tu operación', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    try {
        const url = await subirImagen(fileInput.files[0]);
        if(!url) throw new Error("No se pudo subir la imagen.");

        const monto = parseFloat(document.getElementById('monto_usd').value);
        const data = {
            monto_usd: monto,
            comision_usd: obtenerComision(monto),
            tasa_cambio: tasaCambio,
            remitente_nombre: document.getElementById('remitente_nombre').value,
            remitente_whatsapp: document.getElementById('remitente_whatsapp').value,
            beneficiario_nombre: document.getElementById('beneficiario_nombre').value,
            beneficiario_provincia: document.getElementById('beneficiario_provincia').value,
            beneficiario_whatsapp: document.getElementById('beneficiario_whatsapp').value,
            comprobante_url: url,
            estado: 'pendiente'
        };

        const { error } = await supabaseClient.from('transacciones').insert([data]);
        if(error) throw error;

        Swal.fire({ icon: 'success', title: '¡Éxito!', text: 'Recibimos tu solicitud. Te contactaremos pronto.', background: '#24243e', color: '#fff' });
        cerrarModal();

    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    } finally {
        btn.disabled = false;
        btn.innerText = "Finalizar Envío";
    }
});

// Exponer funciones globales para los botones HTML (onclick)
window.copiarZelle = copiarZelle;
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.nextStep = nextStep;
window.iniciarConMonto = iniciarConMonto;