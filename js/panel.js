const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 });
let segundosParaRefresco = 15;

// --- FUNCIONES DE MODALES ---
function abrirModal(id) { document.getElementById(id).style.display = "block"; }
function cerrarModal(id) { document.getElementById(id).style.display = "none"; }
window.onclick = (e) => { if(e.target.className === 'modal') e.target.style.display = "none"; }

// --- NOTIFICACIONES EN TIEMPO REAL ---

function notificarNuevaTransaccion(payload) {
    const nuevaTx = payload.new;
    
    // 1. Reproducir Sonido
    const sonido = document.getElementById('notificacion-sound');
    if (sonido) {
        sonido.play().catch(error => {
            console.log("El navegador bloqueó el sonido hasta que el usuario interactúe con la página.");
        });
    }

    // 2. Notificación Visual (Se verá encima de cualquier modal)
    Swal.fire({
        title: '¡Nueva Transacción!',
        text: `De: ${nuevaTx.remitente_nombre} por $${nuevaTx.monto_usd} USD`,
        icon: 'info',
        toast: true,
        position: 'top-end',
        showConfirmButton: true,
        confirmButtonText: 'Ver ahora',
        timer: 10000,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer)
            toast.addEventListener('mouseleave', Swal.resumeTimer)
        }
    }).then((result) => {
        if (result.isConfirmed) {
            abrirModal('modal-transacciones');
            cargarTransacciones(); // Refrescar la tabla
        }
    });

    // 3. Refrescar datos del panel automáticamente
    cargarTransacciones();
    cargarMetricas();
}

// Inicializar la escucha de Supabase
const suscripcionTransacciones = supabaseClient
    .channel('cambios-transacciones')
    .on(
        'postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'transacciones' }, 
        (payload) => {
            notificarNuevaTransaccion(payload);
        }
    )
    .subscribe();
    
// --- LÓGICA DE CONFIGURACIÓN (TASA) ---
async function cargarTasa() {
    // Usamos .limit(1) sin .single() para evitar errores si la tabla está vacía
    const { data, error } = await supabaseClient.from('config').select('*').limit(1);
    if (data && data.length > 0) {
        document.getElementById('tasa_cambio').value = data[0].tasa_cambio;
        // Guardamos el ID real para las actualizaciones
        window.configId = data[0].id;
    }
}

async function actualizarTasa() {
    const v = parseFloat(document.getElementById('tasa_cambio').value);
    const id = window.configId || 1; // Usa el ID detectado o 1 por defecto
    const { error } = await supabaseClient.from('config').update({tasa_cambio: v}).eq('id', id);
    
    if (error) {
        Toast.fire({ icon: 'error', title: 'Error: ' + error.message });
    } else {
        Toast.fire({ icon: 'success', title: 'Tasa actualizada' });
        cargarTransacciones();
    }
}

// --- LÓGICA DE TRANSACCIONES ---
async function cargarTransacciones() {
    const { data: config } = await supabaseClient.from('config').select('tasa_cambio').limit(1).single();
    const { data: txs, error } = await supabaseClient
        .from('transacciones')
        .select('*')
        .order('fecha_creacion', {ascending: false});
    
    if (error) return console.error("Error TXs:", error);
    
    const tbody = document.querySelector("#tabla-transacciones tbody");
    const tasa = config?.tasa_cambio || 0;

    tbody.innerHTML = txs.map(tx => {
        const cup = (tx.monto_usd * tasa).toLocaleString('es-CU');
        const esPendiente = tx.estado === 'pendiente';
        
        return `
            <tr class="${esPendiente ? 'fila-pendiente' : ''}">
                <td>${tx.remitente_nombre}</td>
                <td><b>${tx.beneficiario_nombre}</b><br><small>${tx.beneficiario_provincia}</small></td>
                <td>${tx.beneficiario_whatsapp || 'N/A'}</td>
                <td>$${tx.monto_usd}</td>
                <td style="color:green"><b>${cup} CUP</b></td>
                <td><a href="${tx.comprobante_url}" target="_blank" class="btn-view">👁️ Ver</a></td>
                <td><span class="badge badge-${tx.estado}">${tx.estado}</span></td>
                <td>
                    ${esPendiente ? `
                        <button class="confirm" onclick="cambiarEstado(${tx.id}, 'confirmado')">✅</button>
                        <button class="reject" onclick="cambiarEstado(${tx.id}, 'rechazado')">❌</button>
                    ` : '---'}
                </td>
            </tr>
        `;
    }).join('');
}

async function cambiarEstado(id, nuevoEstado) {
    const { error } = await supabaseClient.from('transacciones').update({estado: nuevoEstado}).eq('id', id);
    if(!error) {
        Toast.fire({ icon: 'success', title: `Transacción ${nuevoEstado}` });
        cargarTransacciones();
        cargarMetricas();
    }
}

// --- LÓGICA DE COMISIONES (UNIFICADA) ---
async function cargarComisiones() {
    const { data: comisiones, error } = await supabaseClient
        .from('comisiones')
        .select('*')
        .order('monto_min', { ascending: true });

    if (error) return console.error("Error Comisiones:", error);

    const tbody = document.getElementById("cuerpo-comisiones");
    if (!comisiones || comisiones.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">No hay tramos.</td></tr>`;
        return;
    }

    tbody.innerHTML = comisiones.map(c => `
        <tr>
            <td><input type="number" value="${c.monto_min}" id="min-${c.id}" style="width:80px;"></td>
            <td><input type="number" value="${c.monto_max}" id="max-${c.id}" style="width:80px;"></td>
            <td><input type="number" value="${c.comision}" id="com-${c.id}" style="width:80px;"></td>
            <td>
                <button onclick="guardarComision(${c.id})" style="background:#28a745; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">💾</button>
                <button onclick="eliminarComision(${c.id})" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">🗑️</button>
            </td>
        </tr>
    `).join('');
}

async function guardarComision(id) {
    const monto_min = parseFloat(document.getElementById(`min-${id}`).value);
    const monto_max = parseFloat(document.getElementById(`max-${id}`).value);
    const comision = parseFloat(document.getElementById(`com-${id}`).value);

    // ASEGÚRATE QUE ESTOS NOMBRES SEAN IGUALES A TU TABLA EN SUPABASE
    const { error } = await supabaseClient
        .from('comisiones')
        .update({ monto_min, monto_max, comision }) 
        .eq('id', id);

    if (error) {
        Toast.fire({ icon: 'error', title: 'Error: ' + error.message });
    } else {
        Toast.fire({ icon: 'success', title: 'Actualizado' });
        cargarComisiones();
    }
}

async function agregarFilaComision() {
    const { error } = await supabaseClient
        .from('comisiones')
        .insert([{ monto_min: 0, monto_max: 0, comision: 0 }]);

    if (error) {
        Toast.fire({ icon: 'error', title: 'Error al crear' });
    } else {
        cargarComisiones();
    }
}

async function eliminarComision(id) {
    if(!confirm("¿Eliminar este tramo?")) return;
    const { error } = await supabaseClient.from('comisiones').delete().eq('id', id);
    if (!error) cargarComisiones();
}

// --- LÓGICA DE MÉTRICAS ---
async function cargarMetricas() {
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    const hoyISO = hoy.toISOString();

    const { data: txs, error } = await supabaseClient
        .from('transacciones')
        .select('monto_usd, comision_usd, tasa_cambio')
        .eq('estado', 'confirmado')
        .gte('fecha_creacion', hoyISO);

    if (error) return;

    let totalUsd = 0, totalComis = 0, totalCup = 0;
    txs.forEach(tx => {
        totalUsd += parseFloat(tx.monto_usd) || 0;
        totalComis += parseFloat(tx.comision_usd) || 0;
        totalCup += (parseFloat(tx.monto_usd) || 0) * (parseFloat(tx.tasa_cambio) || 0);
    });

    document.getElementById('m-cantidad').innerText = txs.length;
    document.getElementById('m-usd-recibido').innerText = `$${totalUsd.toFixed(2)}`;
    document.getElementById('m-comisiones').innerText = `$${totalComis.toFixed(2)}`;
    document.getElementById('m-cup-entregado').innerText = totalCup.toLocaleString('es-CU') + " CUP";
}

// --- LÓGICA DE CONCILIACIÓN ---
async function cargarConciliacion() {
    // 1. Calcular el total confirmado de HOY para el input
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    const { data: txsHoy } = await supabaseClient.from('transacciones')
        .select('total_usd')
        .eq('estado', 'confirmado')
        .gte('fecha_creacion', hoy.toISOString());
    
    const totalSistema = txsHoy.reduce((acc, curr) => acc + (parseFloat(curr.total_usd) || 0), 0);
    document.getElementById('conc-confirmado').value = totalSistema.toFixed(2);

    // 2. Cargar historial de conciliaciones
    const { data: registros } = await supabaseClient.from('conciliacion_diaria')
        .select('*').order('fecha', { ascending: false });

    const tbody = document.getElementById("cuerpo-conciliacion");
    tbody.innerHTML = registros.map(r => `
        <tr>
            <td>${r.fecha}</td>
            <td>$${r.total_confirmado}</td>
            <td>$${r.total_banco}</td>
            <td style="color: ${r.diferencia < 0 ? 'red' : 'green'}; font-weight: bold;">$${r.diferencia}</td>
            <td><small>${r.observaciones || '-'}</small></td>
        </tr>
    `).join('');
}

async function guardarConciliacion() {
    const total_confirmado = parseFloat(document.getElementById('conc-confirmado').value);
    const total_banco = parseFloat(document.getElementById('conc-banco').value);
    const observaciones = document.getElementById('conc-obs').value;
    const fecha = new Date().toISOString().split('T')[0];

    const { error } = await supabaseClient.from('conciliacion_diaria').upsert({
        fecha, total_confirmado, total_banco, 
        diferencia: (total_banco - total_confirmado), 
        observaciones
    });

    if (error) Toast.fire({ icon: 'error', title: 'Error al conciliar' });
    else {
        Toast.fire({ icon: 'success', title: 'Cierre de día guardado' });
        cargarConciliacion();
    }
}

// --- LÓGICA DE LOGS (Auditoría) ---
async function cargarLogs() {
    const { data: logs } = await supabaseClient.from('logs_operacion')
        .select('*').order('fecha', { ascending: false }).limit(50);

    const tbody = document.getElementById("cuerpo-logs");
    tbody.innerHTML = logs.map(l => `
        <tr>
            <td>${new Date(l.fecha).toLocaleString()}</td>
            <td>#${l.transaccion_id}</td>
            <td><b>${l.accion}</b></td>
            <td>${l.usuario_admin || 'Admin'}</td>
            <td>${l.comentario || ''}</td>
        </tr>
    `).join('');
}

// --- EXPORTACIÓN ---
async function exportarCSV() {
    const { data } = await supabaseClient.from('transacciones')
        .select('fecha_creacion, remitente_nombre, beneficiario_nombre, monto_usd, estado')
        .eq('estado', 'confirmado');
    
    let csvContent = "data:text/csv;charset=utf-8,Fecha,Remitente,Beneficiario,Monto USD,Estado\n";
    data.forEach(r => {
        csvContent += `${r.fecha_creacion},${r.remitente_nombre},${r.beneficiario_nombre},${r.monto_usd},${r.estado}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_fastcuba_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
}

// --- MODIFICAR LA FUNCIÓN CAMBIAR ESTADO EXISTENTE ---
// Actualiza tu función cambiarEstado para que inserte un log automáticamente
async function cambiarEstado(id, nuevoEstado) {
    const { error } = await supabaseClient.from('transacciones').update({estado: nuevoEstado}).eq('id', id);
    
    if(!error) {
        // INSERTAR LOG DE OPERACIÓN
        await supabaseClient.from('logs_operacion').insert([{
            transaccion_id: id,
            accion: `Cambio de estado a ${nuevoEstado}`,
            usuario_admin: 'Admin Principal',
            comentario: `Transacción marcada como ${nuevoEstado}`
        }]);

        Toast.fire({ icon: 'success', title: `Transacción ${nuevoEstado}` });
        cargarTransacciones();
        cargarMetricas();
    }
}

// --- TEMPORIZADOR ---
setInterval(() => {
    segundosParaRefresco--;
    if (segundosParaRefresco <= 0) {
        cargarTransacciones();
        cargarMetricas();
        segundosParaRefresco = 15;
    }
    const timerLabel = document.getElementById('update-timer');
    if (timerLabel) timerLabel.innerText = `Actualizando en: ${segundosParaRefresco}s`;
}, 1000);

window.onload = () => {
    cargarTasa();
    cargarComisiones();
    cargarTransacciones();
    cargarMetricas();    
};