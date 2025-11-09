/* app.js - Pokémon Bank V2 (Fase 2)
   Tecnologías: JS vanilla + SweetAlert2 + Validate.js + Chart.js + jsPDF + localStorage
*/

// --------------------- Utils ---------------------
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const money = (n) => `$${(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2})}`;

// --------------------- Estado ---------------------
const STORAGE_KEY = 'pkbank_v2_state';
const SESSION_KEY = 'pkbank_v2_logged';

const defaultState = {
  user:  { name: 'Ash Ketchum', account: '0987654321', pin: '1234' },
  balance: 500.00,
  moves: [], // {date, type: 'Depósito'|'Retiro'|'Pago', detail, amount} (amount signed)
  counts: { deposit: 0, withdraw: 0, payment: 0 } // para gráfico (cantidad por tipo)
};

let state = loadState() || defaultState;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// --------------------- Render base ---------------------
function renderHeader() {
  $('#saldoHeader').textContent = `Saldo: ${money(state.balance)}`;
}
function renderUser() {
  $('#userName').textContent    = `Titular: ${state.user.name}`;
  $('#userAccount').textContent = `Cuenta: ${state.user.account}`;
}
function fillAcciones(msg='Seleccione una acción desde el menú lateral') {
  $('#acciones').innerHTML = `<h5 class="text-muted">${msg}</h5>`;
}

// --------------------- Login ---------------------
function showLogin() {
  $('#loginSection').classList.remove('d-none');
  $('#dashboardSection').classList.add('d-none');
  $('.sidebar').classList.add('d-none'); // Ocultar el panel lateral al cerrar sesión
}
function showDashboard() {
  $('#loginSection').classList.add('d-none');
  $('#dashboardSection').classList.remove('d-none');
  $('.sidebar').classList.remove('d-none'); // Mostrar el panel lateral al iniciar sesión
  renderUser();
  renderHeader();
  hideSections();
  fillAcciones();
  renderChart(); // prepara instancia del gráfico
}

$('#btnLogin')?.addEventListener('click', (e) => {
  e.preventDefault();
  const pin = $('#inputPIN').value.trim();

  // Validate.js
  const constraints = {
    pin: {
      presence: { allowEmpty: false, message: '^Ingresa tu PIN.' },
      format: { pattern: /^\d{4}$/, message: '^El PIN debe tener 4 dígitos.' }
    }
  };
  const errors = validate({ pin }, constraints);
  if (errors) {
    Swal.fire({ icon:'error', title:'PIN inválido', text: errors.pin?.[0] || 'Verifica tu PIN.' });
    return;
  }

  if (pin !== state.user.pin) {
    Swal.fire({ icon:'error', title:'PIN incorrecto', text:'Vuelve a intentarlo.' });
    return;
  }

  sessionStorage.setItem(SESSION_KEY, '1');
  Swal.fire({ icon:'success', title:'Bienvenido', timer: 1000, showConfirmButton:false })
      .then(showDashboard);
});

// Si estaba logueado en esta sesión, entra directo
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem(SESSION_KEY) === '1') showDashboard();
  else showLogin();
});

// --------------------- Sidebar: vistas ---------------------
$('#btnSalir')?.addEventListener('click', () => {
  Swal.fire({
    title: '¿Salir?',
    text: 'Se cerrará la sesión actual.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Sí, salir',
    cancelButtonText: 'Cancelar'
  }).then(r => {
    if (r.isConfirmed) {
      sessionStorage.removeItem(SESSION_KEY);
      showLogin();
      $('#inputPIN').value = '';
    }
  });
});

$('#btnHistorial')?.addEventListener('click', () => {
  hideSections();
  $('#historialSection').classList.remove('d-none');
  renderHistorial();
});

$('#btnGrafico')?.addEventListener('click', () => {
  hideSections();
  $('#graficoSection').classList.remove('d-none');
  updateChartCounts();
});

// --------------------- Formularios en #acciones ---------------------
$('#btnDeposito')?.addEventListener('click', () => {
  hideSections();
  renderFormDeposito();
});
$('#btnRetiro')?.addEventListener('click', () => {
  hideSections();
  renderFormRetiro();
});
$('#btnPago')?.addEventListener('click', () => {
  hideSections();
  renderFormPago();
});
$('#btnPDF')?.addEventListener('click', () => generarPDF());

// Oculta secciones secundarias dentro del dashboard
function hideSections() {
  $('#graficoSection')?.classList.add('d-none');
  $('#historialSection')?.classList.add('d-none');
}

// --------------------- Movimientos y lógica ---------------------
function addMove(type, detail, signedAmount) {
  state.moves.unshift({
    date: new Date().toLocaleString(),
    type, detail,
    amount: Number(signedAmount)
  });
  // contador por tipo
  if (type === 'Depósito') state.counts.deposit++;
  if (type === 'Retiro')   state.counts.withdraw++;
  if (type === 'Pago')     state.counts.payment++;
}

function deposit(amount, detail='Depósito') {
  state.balance += amount;
  addMove('Depósito', detail, +amount);
  saveState();
  renderHeader();
  renderHistorial();
  updateChartCounts();
}

function withdraw(amount, detail='Retiro') {
  if (amount > state.balance) {
    Swal.fire({ icon:'error', title:'Saldo insuficiente', text:'No puedes retirar más del saldo disponible.' });
    return false;
  }
  state.balance -= amount;
  addMove('Retiro', detail, -amount);
  saveState();
  renderHeader();
  renderHistorial();
  updateChartCounts();
  return true;
}

function pay(service, amount) {
  if (amount > state.balance) {
    Swal.fire({ icon:'error', title:'Saldo insuficiente', text:'No puedes pagar un monto mayor a tu saldo.' });
    return false;
  }
  state.balance -= amount;
  addMove('Pago', service, -amount);
  saveState();
  renderHeader();
  renderHistorial();
  updateChartCounts();
  return true;
}

// --------------------- Historial ---------------------
function renderHistorial() {
  const tbody = $('#tablaHistorial');
  if (!tbody) return;
  if (!state.moves.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Sin movimientos</td></tr>`;
    return;
  }
  tbody.innerHTML = state.moves.map(m => `
    <tr>
      <td>${m.date}</td>
      <td>${m.type}</td>
      <td>${m.detail || '-'}</td>
      <td class="${m.amount<0?'text-danger':'text-success'}">${money(m.amount)}</td>
    </tr>
  `).join('');
}

// --------------------- Chart.js: cantidad por tipo ---------------------
let chartRef = null;

function getCounts() {
  const { deposit, withdraw, payment } = state.counts;
  return [deposit, withdraw, payment];
}

function renderChart() {
  const ctx = $('#chartTransacciones')?.getContext('2d');
  if (!ctx || typeof Chart === 'undefined') return;
  const data = getCounts();
  if (chartRef) { chartRef.destroy(); }

  chartRef = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Depósitos', 'Retiros', 'Pagos'],
      datasets: [{ label: 'Cantidad de transacciones', data, borderWidth: 1 }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, precision: 0 } },
      plugins: { legend: { display: false } }
    }
  });
}

function updateChartCounts() {
  if (!chartRef) { renderChart(); return; }
  const data = getCounts();
  chartRef.data.datasets[0].data = data;
  chartRef.update();
}

// --------------------- jsPDF: comprobante ---------------------
function generarPDF() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    Swal.fire({ icon:'error', title:'PDF no disponible', text:'No se pudo cargar jsPDF.' });
    return;
  }
  if (!state.moves.length) {
    Swal.fire({ icon:'info', title:'Sin movimientos', text:'Realiza una transacción para generar comprobante.' });
    return;
  }

  // último movimiento
  const m = state.moves[0];
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const margin = 50;
  let y = margin;

  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text('Pokémon Bank - Comprobante de Transacción', margin, y); y+=24;

  doc.setFont('helvetica','normal'); doc.setFontSize(11);
  doc.text(`Titular: ${state.user.name}`, margin, y); y+=16;
  doc.text(`Cuenta: ${state.user.account}`, margin, y); y+=16;
  doc.text(`Fecha:  ${m.date}`, margin, y); y+=24;

  doc.setFont('helvetica','bold');
  doc.text('Detalle de la operación', margin, y); y+=14;
  doc.setLineWidth(0.5); doc.line(margin, y, 545, y); y+=12;

  doc.setFont('helvetica','normal');
  doc.text(`Tipo:    ${m.type}`, margin, y); y+=16;
  doc.text(`Detalle: ${m.detail || '-'}`, margin, y); y+=16;
  doc.text(`Monto:   ${money(m.amount)}`, margin, y); y+=16;
  doc.text(`Saldo actual: ${money(state.balance)}`, margin, y); y+=24;

  doc.setFont('helvetica','italic'); doc.setFontSize(10);
  doc.text('Este comprobante es parte de un proyecto académico (versión de prueba).', margin, y);

  const fname = `Comprobante_${m.type}_${Date.now()}.pdf`;
  doc.save(fname);
}

// --------------------- Formularios dinámicos ---------------------
function renderFormDeposito() {
  $('#acciones').innerHTML = `
    <div class="card p-3">
      <h5>Depósito</h5>
      <form id="frmDeposito">
        <div class="form-group">
          <label for="depMonto">Monto</label>
          <input id="depMonto" class="form-control" type="number" min="0.01" step="any" placeholder="0.00">
        </div>
        <div class="form-group">
          <label for="depDetalle">Detalle (opcional)</label>
          <input id="depDetalle" class="form-control" type="text" placeholder="Ej.: Sueldo">
        </div>
        <button class="btn btn-success" type="submit">Depositar</button>
      </form>
    </div>
  `;

  $('#frmDeposito').addEventListener('submit', (e) => {
    e.preventDefault();
    const depMonto = Number($('#depMonto').value);
    const depDetalle = $('#depDetalle').value.trim();

    const errors = validate({ depMonto }, {
      depMonto: {
        presence: { allowEmpty:false, message: '^Ingresa un monto.' },
        numericality: { greaterThan: 0, message: '^El monto debe ser mayor que 0.' }
      }
    });
    if (errors) { Swal.fire({ icon:'error', title:'Datos inválidos', text: errors.depMonto[0] }); return; }

    deposit(depMonto, depDetalle || 'Depósito');
    Swal.fire({ icon:'success', title:'Depósito registrado', timer: 1200, showConfirmButton:false });
  });
}

function renderFormRetiro() {
  $('#acciones').innerHTML = `
    <div class="card p-3">
      <h5>Retiro</h5>
      <form id="frmRetiro">
        <div class="form-group">
          <label for="retMonto">Monto</label>
          <input id="retMonto" class="form-control" type="number" min="0.01" step="any" placeholder="0.00">
        </div>
        <div class="form-group">
          <label for="retDetalle">Detalle (opcional)</label>
          <input id="retDetalle" class="form-control" type="text" placeholder="Ej.: ATM / Efectivo">
        </div>
        <button class="btn btn-danger" type="submit">Retirar</button>
      </form>
    </div>
  `;

  $('#frmRetiro').addEventListener('submit', (e) => {
    e.preventDefault();
    const retMonto = Number($('#retMonto').value);
    const retDetalle = $('#retDetalle').value.trim();

    const errors = validate({ retMonto }, {
      retMonto: {
        presence: { allowEmpty:false, message: '^Ingresa un monto.' },
        numericality: { greaterThan: 0, message: '^El monto debe ser mayor que 0.' }
      }
    });
    if (errors) { Swal.fire({ icon:'error', title:'Datos inválidos', text: errors.retMonto[0] }); return; }

    if (withdraw(retMonto, retDetalle || 'Retiro')) {
      Swal.fire({ icon:'success', title:'Retiro realizado', timer: 1200, showConfirmButton:false });
    }
  });
}

function renderFormPago() {
  $('#acciones').innerHTML = `
    <div class="card p-3">
      <h5>Pago de servicios</h5>
      <form id="frmPago">
        <div class="form-group">
          <label for="pagServicio">Servicio</label>
          <select id="pagServicio" class="form-control">
            <option>Electricidad</option>
            <option>Internet</option>
            <option>Telefonía</option>
            <option>Agua</option>
            <option>Seguros</option>
          </select>
        </div>
        <div class="form-group">
          <label for="pagMonto">Monto</label>
          <input id="pagMonto" class="form-control" type="number" min="0.01" step="any" placeholder="0.00">
        </div>
        <button class="btn btn-warning" type="submit">Pagar</button>
      </form>
    </div>
  `;

  $('#frmPago').addEventListener('submit', (e) => {
    e.preventDefault();
    const servicio = $('#pagServicio').value;
    const pagMonto = Number($('#pagMonto').value);

    const errors = validate({ pagMonto }, {
      pagMonto: {
        presence: { allowEmpty:false, message: '^Ingresa un monto.' },
        numericality: { greaterThan: 0, message: '^El monto debe ser mayor que 0.' }
      }
    });
    if (errors) { Swal.fire({ icon:'error', title:'Datos inválidos', text: errors.pagMonto[0] }); return; }

    if (pay(servicio, pagMonto)) {
      Swal.fire({ icon:'success', title:`Pago de ${servicio} registrado`, timer: 1300, showConfirmButton:false });
    }
  });
}