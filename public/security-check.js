// security-check.js — logica estratta da security-check.html per
// consentire una CSP restrittiva (nessun "unsafe-inline" su script-src).

const tests = [
  {
    name: 'GET /api/auth senza login',
    detail: 'Deve rispondere 401 (nessuna sessione), non 200.',
    run: async () => {
      const res = await fetch('/api/auth', { credentials: 'omit' });
      return { pass: res.status === 401, info: `HTTP ${res.status}` };
    },
  },
  {
    name: 'GET /api/links senza login',
    detail: 'La lista dei link salvati non deve essere leggibile senza autenticazione.',
    run: async () => {
      const res = await fetch('/api/links', { credentials: 'omit' });
      return { pass: res.status === 401, info: `HTTP ${res.status}` };
    },
  },
  {
    name: 'POST /api/links senza login',
    detail: 'Non deve essere possibile aggiungere un link senza autenticazione.',
    run: async () => {
      const res = await fetch('/api/links', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/test-non-autorizzato.ics', label: 'test sicurezza' }),
      });
      return { pass: res.status === 401, info: `HTTP ${res.status}` };
    },
  },
  {
    name: 'PUT /api/links senza login',
    detail: 'La modifica di un link non deve essere possibile senza autenticazione.',
    run: async () => {
      const res = await fetch('/api/links', {
        method: 'PUT',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'non-esiste', url: 'https://example.com', label: '' }),
      });
      return { pass: res.status === 401, info: `HTTP ${res.status}` };
    },
  },
  {
    name: 'DELETE /api/links senza login',
    detail: 'L\'eliminazione di un link non deve essere possibile senza autenticazione.',
    run: async () => {
      const res = await fetch('/api/links?id=non-esiste', { method: 'DELETE', credentials: 'omit' });
      return { pass: res.status === 401, info: `HTTP ${res.status}` };
    },
  },
  {
    name: 'GET /api/fetch-ical senza login',
    detail: 'Il proxy di download non deve funzionare senza autenticazione.',
    run: async () => {
      const res = await fetch('/api/fetch-ical?url=https://example.com/test.ics', { credentials: 'omit' });
      return { pass: res.status === 401, info: `HTTP ${res.status}` };
    },
  },
  {
    name: 'Nessun cookie di sessione residuo',
    detail: 'Il sistema non deve più usare cookie custom (app_session): l\'autenticazione è solo Bearer JWT di Netlify Identity.',
    run: async () => {
      const hasLegacyCookie = document.cookie.split(';').some(c => c.trim().startsWith('app_session='));
      return { pass: !hasLegacyCookie, info: hasLegacyCookie ? 'Trovato cookie app_session residuo' : 'Nessun cookie app_session' };
    },
  },
];

const testListEl = document.getElementById('testList');
const summaryEl = document.getElementById('summary');
const runBtn = document.getElementById('runBtn');
const afterPassEl = document.getElementById('afterPass');

function renderPending(){
  testListEl.innerHTML = tests.map(t => `
    <div class="test" data-name="${t.name}">
      <div class="desc">
        <div class="name">${t.name}</div>
        <div class="detail">${t.detail}</div>
      </div>
      <span class="badge pending">In attesa</span>
    </div>
  `).join('');
}
renderPending();

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  summaryEl.className = 'summary pending';
  summaryEl.textContent = 'Test in corso…';
  const rows = testListEl.querySelectorAll('.test');
  let allPass = true;

  for(let i = 0; i < tests.length; i++){
    const badge = rows[i].querySelector('.badge');
    badge.textContent = '…';
    try{
      const { pass, info } = await tests[i].run();
      badge.textContent = pass ? 'PASS' : 'FAIL';
      badge.className = 'badge ' + (pass ? 'pass' : 'fail');
      rows[i].querySelector('.detail').textContent = tests[i].detail + ' — ' + info;
      if(!pass) allPass = false;
    }catch(err){
      badge.textContent = 'ERRORE';
      badge.className = 'badge fail';
      rows[i].querySelector('.detail').textContent = tests[i].detail + ' — errore: ' + (err?.message || err);
      allPass = false;
    }
  }

  if(allPass){
    summaryEl.className = 'summary pass';
    summaryEl.textContent = 'Tutti i test sono passati: nessun accesso non autorizzato rilevato.';
    afterPassEl.style.display = 'block';
    sessionStorage.setItem('securityCheckPassed', '1');
  } else {
    summaryEl.className = 'summary fail';
    summaryEl.textContent = 'Attenzione: almeno un test è fallito. Non considerare il sistema sicuro finché non viene corretto.';
  }
  runBtn.disabled = false;
});

// Se in questa sessione del browser i test erano già passati, non
// ripresentare i controlli attivi: la pagina si "auto-disattiva" a
// livello di sessione (resta comunque necessario rimuovere il file dal
// deploy per un vero smaltimento, vedi nota sopra).
if(sessionStorage.getItem('securityCheckPassed') === '1'){
  document.querySelector('.wrap').innerHTML = `
    <h1>Verifica di sicurezza — completata</h1>
    <p class="lead">I test sono già stati eseguiti con successo in questa sessione del browser.</p>
    <div class="note">Ricordati di rimuovere <code>public/security-check.html</code> dal progetto e rifare il deploy.</div>
  `;
}
