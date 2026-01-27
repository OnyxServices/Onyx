const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
let segundosParaRefresco = 15;
let configId = 1;

// --- NAVEGACIÓN ---
const abrirModal = (id) => { 
    document.getElementById(id).style.display = "block"; 
    if(id === 'modal-comisiones') cargarComisiones();
    if(id === 'modal-conciliacion') cargarConciliacion();
    if(id === 'modal-logs') cargarLogs();
};
const cerrarModal = (id) => document.getElementById(id).style.display = "none";
window.onclick = (e) => { if(e.target.className === 'modal') e.target.style.display = "none"; };

// --- ACTUALIZACIÓN GLOBAL ---
async function refreshAll() {
    await cargarTransacciones();
    await cargarMetricas();
}

// --- CONFIGURACIÓN (TASA Y ZELLE) ---
async function cargarTasa() {
    const { data } = await supabaseClient.from('config').select('*').limit(1).single();
    if (data) {
        document.getElementById('tasa_cambio').value = data.tasa_cambio;
        document.getElementById('zelle_cuenta').value = data.zelle_cuenta || '';
        configId = data.id;
    }
}

async function actualizarConfig() {
    const tasa = parseFloat(document.getElementById('tasa_cambio').value);
    const zelle = document.getElementById('zelle_cuenta').value;
    const { error } = await supabaseClient.from('config').update({ tasa_cambio: tasa, zelle_cuenta: zelle }).eq('id', configId);
    
    if (error) Toast.fire({ icon: 'error', title: 'Error al actualizar' });
    else { Toast.fire({ icon: 'success', title: 'Configuración guardada' }); refreshAll(); }
}

// --- GESTIÓN DE TRANSACCIONES ---
async function cargarTransacciones() {
    const { data: config } = await supabaseClient.from('config').select('tasa_cambio').single();
    const { data: txs, error } = await supabaseClient.from('transacciones').select('*').order('fecha_creacion', {ascending: false});
    
    if (error) return;
    const tbody = document.querySelector("#tabla-transacciones tbody");
    const tasa = config?.tasa_cambio || 0;

    tbody.innerHTML = txs.map(tx => {
        const cup = (tx.monto_usd * tasa).toLocaleString('es-CU');
        const esPendiente = tx.estado === 'pendiente';
        
        // Limpiamos el número para el enlace (quitando espacios o caracteres especiales)
        const waLink = tx.beneficiario_whatsapp ? tx.beneficiario_whatsapp.replace(/\D/g, '') : '';

        return `
            <tr class="${esPendiente ? 'fila-pendiente' : ''}">
                <td>${tx.remitente_nombre}</td>
                <td><b>${tx.beneficiario_nombre}</b><br><small>${tx.beneficiario_provincia}</small></td>
                
                <!-- CELDA DE WHATSAPP MEJORADA -->
                <td>
                    ${tx.beneficiario_whatsapp 
                        ? `<a href="https://wa.me/${waLink}" target="_blank" style="text-decoration:none; color: #25D366; font-weight:bold;">
                            📱 ${tx.beneficiario_whatsapp}
                           </a>` 
                        : '<span style="color:var(--text-muted)">-</span>'}
                </td>

                <td>$${tx.monto_usd}</td>
                <td style="color:green; font-weight:bold">${cup} CUP</td>
                <td>
    <button onclick="verRecibo('${tx.comprobante_url}')" style="cursor:pointer; background:#f1f5f9; border:1px solid var(--border); padding:5px 10px; border-radius:6px;">
        👁️ Ver
    </button>
</td><td><span class="badge badge-${tx.estado}">${tx.estado.toUpperCase()}</span></td>
                <td>
                    ${esPendiente ? `
                        <button onclick="cambiarEstado(${tx.id}, 'confirmado')" style="cursor:pointer; border:none; background:none;">✅</button>
                        <button onclick="cambiarEstado(${tx.id}, 'rechazado')" style="cursor:pointer; border:none; background:none;">❌</button>
                    ` : '---'}
                </td>
            </tr>
        `;
    }).join('');
}

async function cambiarEstado(id, nuevoEstado) {
    const { error } = await supabaseClient.from('transacciones').update({estado: nuevoEstado}).eq('id', id);
    if(!error) {
        await supabaseClient.from('logs_operacion').insert([{
            transaccion_id: id,
            accion: `Estado: ${nuevoEstado}`,
            usuario_admin: 'Admin',
            comentario: `Marcada como ${nuevoEstado} manualmente`
        }]);
        Toast.fire({ icon: 'success', title: `Transacción ${nuevoEstado}` });
        refreshAll();
    }
}

// --- COMISIONES ---
async function cargarComisiones() {
    const { data } = await supabaseClient.from('comisiones').select('*').order('monto_min', { ascending: true });
    const tbody = document.getElementById("cuerpo-comisiones");
    tbody.innerHTML = data.map(c => `
        <tr>
            <td><input type="number" value="${c.monto_min}" id="min-${c.id}" style="width:60px"></td>
            <td><input type="number" value="${c.monto_max}" id="max-${c.id}" style="width:60px"></td>
            <td><input type="number" value="${c.comision}" id="com-${c.id}" style="width:60px"></td>
            <td>
                <button onclick="guardarComision(${c.id})">💾</button>
                <button onclick="eliminarComision(${c.id})">🗑️</button>
            </td>
        </tr>
    `).join('');
}

async function guardarComision(id) {
    const payload = {
        monto_min: parseFloat(document.getElementById(`min-${id}`).value),
        monto_max: parseFloat(document.getElementById(`max-${id}`).value),
        comision: parseFloat(document.getElementById(`com-${id}`).value)
    };
    await supabaseClient.from('comisiones').update(payload).eq('id', id);
    Toast.fire({ icon: 'success', title: 'Tramo actualizado' });
}

async function agregarFilaComision() {
    await supabaseClient.from('comisiones').insert([{ monto_min: 0, monto_max: 0, comision: 0 }]);
    cargarComisiones();
}

async function eliminarComision(id) {
    if(confirm("¿Eliminar tramo?")) {
        await supabaseClient.from('comisiones').delete().eq('id', id);
        cargarComisiones();
    }
}

// --- MÉTRICAS ---
async function cargarMetricas() {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const { data: txs } = await supabaseClient.from('transacciones').select('monto_usd, comision_usd, tasa_cambio').eq('estado', 'confirmado').gte('fecha_creacion', hoy.toISOString());

    if (!txs) return;
    let usd = 0, com = 0, cup = 0;
    txs.forEach(tx => {
        usd += parseFloat(tx.monto_usd) || 0;
        com += parseFloat(tx.comision_usd) || 0;
        cup += (parseFloat(tx.monto_usd) || 0) * (parseFloat(tx.tasa_cambio) || 0);
    });

    document.getElementById('m-cantidad').innerText = txs.length;
    document.getElementById('m-usd-recibido').innerText = `$${usd.toFixed(2)}`;
    document.getElementById('m-comisiones').innerText = `$${com.toFixed(2)}`;
    document.getElementById('m-cup-entregado').innerText = cup.toLocaleString('es-CU') + " CUP";
}

// --- CONCILIACIÓN ---
async function cargarConciliacion() {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const { data: txs } = await supabaseClient.from('transacciones').select('monto_usd').eq('estado', 'confirmado').gte('fecha_creacion', hoy.toISOString());
    const totalSistema = txs.reduce((acc, curr) => acc + (parseFloat(curr.monto_usd) || 0), 0);
    document.getElementById('conc-confirmado').value = totalSistema.toFixed(2);

    const { data: registros } = await supabaseClient.from('conciliacion_diaria').select('*').order('fecha', { ascending: false });
    document.getElementById("cuerpo-conciliacion").innerHTML = registros.map(r => `
        <tr>
            <td>${r.fecha}</td>
            <td>$${r.total_confirmado}</td>
            <td>$${r.total_banco}</td>
            <td style="color:${r.diferencia < 0 ? 'red' : 'green'}">$${r.diferencia}</td>
            <td><small>${r.observaciones || '-'}</small></td>
        </tr>
    `).join('');
}

async function guardarConciliacion() {
    const payload = {
        fecha: new Date().toISOString().split('T')[0],
        total_confirmado: parseFloat(document.getElementById('conc-confirmado').value),
        total_banco: parseFloat(document.getElementById('conc-banco').value),
        observaciones: document.getElementById('conc-obs').value
    };
    payload.diferencia = payload.total_banco - payload.total_confirmado;
    await supabaseClient.from('conciliacion_diaria').upsert(payload);
    Toast.fire({ icon: 'success', title: 'Día cerrado' });
    cargarConciliacion();
}

// --- AUDITORÍA (LOGS) ---
async function cargarLogs() {
    const { data } = await supabaseClient.from('logs_operacion').select('*').order('fecha', { ascending: false }).limit(30);
    document.getElementById("cuerpo-logs").innerHTML = data.map(l => `
        <tr>
            <td>${new Date(l.fecha).toLocaleString()}</td>
            <td>#${l.transaccion_id}</td>
            <td>${l.accion}</td>
            <td>${l.usuario_admin}</td>
            <td>${l.comentario}</td>
        </tr>
    `).join('');
}

// --- REAL-TIME ---
// --- CONFIGURACIÓN DE NOTIFICACIÓN (SÓLO SCRIPT) ---
const sonidoNotificacion = new Audio("https://onyxservices.github.io/fastcuba/sound/notification.wav");
sonidoNotificacion.preload = "auto";


// Listener global que desbloquea el audio tras la primera interacción
document.addEventListener('click', () => {
sonidoNotificacion.play().catch(() => {});
}, { once: true });

function notificarNuevaTransaccion(datos) {
    // 1. Reproducir sonido (manejando restricción de navegador)
    sonidoNotificacion.currentTime = 0;
    sonidoNotificacion.play().catch(() => console.log("Esperando interacción del usuario para activar sonido."));

    // 2. Lanzar alerta visual
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        iconColor: '#25D366', // Color estilo WhatsApp/Dinero
        title: '¡NUEVA TRANSACCIÓN!',
        html: `
            <div style="text-align: left; font-size: 0.9rem;">
                Enviado por: <b>${datos.remitente_nombre}</b><br>
                Monto: <span style="color: #166534; font-weight: bold;">$${datos.monto_usd} USD</span>
            </div>
        `,
        showConfirmButton: false,
        timer: 10000,
        timerProgressBar: true,
        background: document.body.classList.contains('dark') ? '#1e293b' : '#ffffff',
        color: document.body.classList.contains('dark') ? '#f1f5f9' : '#1e293b',
        didOpen: (toast) => {
            // Esto asegura que esté por encima de CUALQUIER modal
            toast.parentElement.style.zIndex = "10000";
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });
}

// --- ACTUALIZACIÓN DEL CANAL REAL-TIME ---
supabaseClient.channel('cambios')
    .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'transacciones' 
    }, (payload) => {
        notificarNuevaTransaccion(payload.new);
        refreshAll(); // Refresca tablas y métricas
    })
    .subscribe();

// --- TIMER Y CARGA INICIAL ---
setInterval(() => {
    segundosParaRefresco--;
    if (segundosParaRefresco <= 0) { refreshAll(); segundosParaRefresco = 15; }
    document.getElementById('update-timer').innerText = `Actualizando en: ${segundosParaRefresco}s`;
}, 1000);

document.addEventListener('DOMContentLoaded', () => {
    cargarTasa();
    refreshAll();
});

// --- EXPORTAR ---
async function exportarCSV() {
    const { data } = await supabaseClient.from('transacciones').select('*').eq('estado', 'confirmado');
    let csv = "Fecha,Remitente,Beneficiario,Monto USD\n";
    data.forEach(r => csv += `${r.fecha_creacion},${r.remitente_nombre},${r.beneficiario_nombre},${r.monto_usd}\n`);
    const link = document.createElement("a");
    link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
    link.download = "reporte.csv";
    link.click();
}

async function borrarTodasTransacciones() {
    if(!confirm("⚠️ ¿Eliminar todo el historial?")) return;
    await supabaseClient.from('transacciones').delete().neq('id', 0);
    Toast.fire({ icon: 'success', title: 'Base de datos limpia' });
    refreshAll();
}

// Función para mostrar el recibo en un modal tipo Lightbox
function verRecibo(url) {
    if (!url || url === 'undefined' || url === '') {
        Toast.fire({ icon: 'error', title: 'No hay imagen disponible' });
        return;
    }

    Swal.fire({
        imageUrl: url,
        imageAlt: 'Comprobante de transferencia',
        showCloseButton: true,
        showConfirmButton: false,
        width: 'auto',
        maxHeight: '90vh',
        background: 'rgba(255, 255, 255, 0.9)',
        backdrop: `rgba(15, 23, 42, 0.8)`, // Efecto desenfocado oscuro de fondo
        customClass: {
            image: 'img-recibo-modal'
        }
    });
}

let paginaActual = 0;
const itemsPorPagina = 10;

// Reiniciar a página 0 cuando se filtra
function resetYPaginación() {
    paginaActual = 0;
    cargarTransacciones();
}

function cambiarPagina(delta) {
    paginaActual += delta;
    if (paginaActual < 0) paginaActual = 0;
    cargarTransacciones();
}

async function cargarTransacciones() {
    const { data: config } = await supabaseClient.from('config').select('tasa_cambio').single();
    const tasa = config?.tasa_cambio || 0;

    // --- CONSTRUCCIÓN DE LA QUERY CON FILTROS ---
    let query = supabaseClient
        .from('transacciones')
        .select('*', { count: 'exact' });

    // Filtro de Búsqueda (Nombre remitente o beneficiario)
    const search = document.getElementById('f-search').value;
    if (search) {
        query = query.or(`remitente_nombre.ilike.%${search}%,beneficiario_nombre.ilike.%${search}%`);
    }

    // Filtro de Estado
    const estado = document.getElementById('f-estado').value;
    if (estado !== 'todos') {
        query = query.eq('estado', estado);
    }

    // Filtro de Fechas
    const inicio = document.getElementById('f-inicio').value;
    const fin = document.getElementById('f-fin').value;
    if (inicio) query = query.gte('fecha_creacion', inicio);
    if (fin) query = query.lte('fecha_creacion', fin + 'T23:59:59');

    // Paginación
    const desde = paginaActual * itemsPorPagina;
    const hasta = desde + itemsPorPagina - 1;
    
    const { data: txs, count, error } = await query
        .order('fecha_creacion', { ascending: false })
        .range(desde, hasta);

    if (error) return;

    // Actualizar Info de Paginación
    document.getElementById('page-info').innerText = `Página ${paginaActual + 1} de ${Math.ceil(count / itemsPorPagina) || 1}`;
    document.getElementById('btn-prev').disabled = paginaActual === 0;
    document.getElementById('btn-next').disabled = hasta >= count - 1;

    // Renderizar Tabla (mantén tu lógica de renderizado anterior pero con las mejoras ya hechas)
    const tbody = document.querySelector("#tabla-transacciones tbody");
    tbody.innerHTML = txs.map(tx => {
        const cup = (tx.monto_usd * (tx.tasa_cambio || tasa)).toLocaleString('es-CU');
        const waLink = tx.beneficiario_whatsapp ? tx.beneficiario_whatsapp.replace(/\D/g, '') : '';
        
        return `
            <tr class="${tx.estado === 'pendiente' ? 'fila-pendiente' : ''}">
                <td>${tx.remitente_nombre}</td>
                <td><b>${tx.beneficiario_nombre}</b><br><small>${tx.beneficiario_provincia}</small></td>
                <td>
                    <a href="https://wa.me/${waLink}" target="_blank" style="text-decoration:none; color:#25D366; font-weight:bold;">
                        📱 ${tx.beneficiario_whatsapp || '-'}
                    </a>
                </td>
                <td>$${tx.monto_usd}</td>
                <td style="color:green; font-weight:bold">${cup} CUP</td>
                <td><button onclick="verRecibo('${tx.comprobante_url}')" class="btn-ver">👁️ Ver</button></td>
                <td><span class="badge badge-${tx.estado}">${tx.estado.toUpperCase()}</span></td>
                <td>
                    ${tx.estado === 'pendiente' ? `
                        <button onclick="cambiarEstado(${tx.id}, 'confirmado')">✅</button>
                        <button onclick="cambiarEstado(${tx.id}, 'rechazado')">❌</button>
                    ` : '---'}
                </td>
            </tr>
        `;
    }).join('');
}

// Lógica de Modo Oscuro
function toggleDarkMode() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('dark-mode', isDark);
    document.getElementById('dark-mode-btn').innerText = isDark ? '☀️' : '🌙';
}

// Cargar preferencia al iniciar
if (localStorage.getItem('dark-mode') === 'true') {
    document.body.classList.add('dark');
    document.getElementById('dark-mode-btn').innerText = '☀️';
}