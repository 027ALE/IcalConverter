// app.js — logica applicativa estratta da index.html per consentire una
// Content-Security-Policy restrittiva (script-src senza "unsafe-inline").
// Nessuna modifica di comportamento rispetto allo script inline originale.

const fileInput = document.getElementById('fileInput');
const summaryEl = document.getElementById('summary');
const outputEl = document.getElementById('output');
const statusEl = document.getElementById('status');
const saveHtmlBtn = document.getElementById('saveHtmlBtn');
const pdfBtn = document.getElementById('pdfBtn');
const linkSelect = document.getElementById('linkSelect');
const linkUrlInput = document.getElementById('linkUrlInput');
const linkLabelInput = document.getElementById('linkLabelInput');
const searchLinkBtn = document.getElementById('searchLinkBtn');
const saveLinkBtn = document.getElementById('saveLinkBtn');
const authScreen = document.getElementById('authScreen');
const authLoginBtn = document.getElementById('authLoginBtn');
const authMsg = document.getElementById('authMsg');
const appShell = document.getElementById('appShell');
const logoutBtn = document.getElementById('logoutBtn');
const userPill = document.getElementById('userPill');
const userEmailLabel = document.getElementById('userEmailLabel');
const userRoleBadge = document.getElementById('userRoleBadge');
const adminSection = document.getElementById('adminSection');
const linksAdminMsg = document.getElementById('linksAdminMsg');
const adminLinksList = document.getElementById('adminLinksList');
const adminNewUrl = document.getElementById('adminNewUrl');
const adminNewLabel = document.getElementById('adminNewLabel');
const adminAddBtn = document.getElementById('adminAddBtn');
let currentModel = null;
// currentSession = { email, role, isAdmin } oppure null.
// È l'UNICA fonte di verità sul "chi sono / cosa posso fare" lato client,
// e viene sempre ricostruita a partire dalla risposta di GET /api/auth,
// che a sua volta legge solo il JWT di Netlify Identity (ruolo nativo
// app_metadata.roles). Niente stato duplicato, niente rami che bypassano
// il controllo server-side.
let currentSession = null;
const TRAVEL_KEYWORDS =
    '(?:percorrenza|tempo\\s+di\\s+percorrenza|tempo\\s+viaggio|durata\\s+trasferimento)';
function setStatus(msg, warn=false){statusEl.textContent=msg;statusEl.className='status'+(warn?' warn':'');statusEl.style.display='block';}
function clearStatus(){statusEl.style.display='none';statusEl.textContent='';}
function showAuthMessage(msg, warn=false){authMsg.textContent=msg;authMsg.className='status'+(warn?' warn':'');authMsg.style.display='block';}
function clearAuthMessage(){authMsg.style.display='none';authMsg.textContent='';}

// Ottiene un JWT valido di Netlify Identity per l'utente corrente, oppure
// null se nessuno ha effettuato il login. netlifyIdentity gestisce da solo
// il refresh del token quando è scaduto.
async function getIdentityJwt(){
    const user = window.netlifyIdentity?.currentUser?.();
    if(!user) return null;
    try{
        return await user.jwt();
    }catch(err){
        console.error('Impossibile ottenere il token Identity', err);
        return null;
    }
}

// Unico punto da cui l'app chiama le nostre API: allega sempre
// Authorization: Bearer <jwt-identity> quando disponibile. Nessun cookie,
// nessuna sessione custom.
async function apiFetch(url, options={}){
    const jwt = await getIdentityJwt();
    const headers = Object.assign({}, options.headers || {});
    if(jwt) headers['Authorization'] = `Bearer ${jwt}`;
    return fetch(url, Object.assign({}, options, { headers, credentials: 'omit' }));
}

// Interroga /api/auth (che legge solo il JWT Identity) per sapere ruolo e
// permessi correnti. Ritorna null se non autenticato o non autorizzato.
async function refreshSession(){
    const jwt = await getIdentityJwt();
    if(!jwt){
        currentSession = null;
        applySessionToUI();
        return null;
    }
    try{
        const res = await apiFetch('/api/auth');
        const data = await res.json().catch(() => ({}));
        if(res.ok && data.ok){
            currentSession = { email: data.user.email, role: data.role, isAdmin: data.isAdmin };
            applySessionToUI();
            return currentSession;
        }
        currentSession = null;
        applySessionToUI();
        if(data.error) showAuthMessage(data.error, true);
        return null;
    }catch(err){
        console.error(err);
        currentSession = null;
        applySessionToUI();
        showAuthMessage('Impossibile verificare l\'accesso. Controlla la connessione e riprova.', true);
        return null;
    }
}

// Da chiamare prima di ogni azione che usa le API protette. Se la sessione
// non è ancora nota la ricalcola; se non c'è login valido, blocca l'azione
// con un messaggio chiaro invece di lasciare il pulsante "girare a vuoto".
async function ensureAuthenticated(){
    if(currentSession) return currentSession;
    const session = await refreshSession();
    if(!session){ setStatus('Accedi prima di usare il servizio.', true); return null; }
    return session;
}
function applySessionToUI(){
    if(currentSession){
        authScreen.classList.add('hidden');
        appShell.classList.remove('hidden');
        logoutBtn.style.display='inline-flex';
        userPill.hidden = false;
        userEmailLabel.textContent = currentSession.email;
        userRoleBadge.textContent = currentSession.role;
        userRoleBadge.className = 'role-badge' + (currentSession.isAdmin ? ' admin' : '');
        adminSection.hidden = !currentSession.isAdmin;
        clearAuthMessage();
    } else {
        authScreen.classList.remove('hidden');
        appShell.classList.add('hidden');
        logoutBtn.style.display='none';
        userPill.hidden = true;
        adminSection.hidden = true;
        clearStatus();
    }
}
function esc(s=''){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function unescapeICS(v=''){return v.replace(/\\n/g,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\');}
function unfold(text){return text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\n[ \t]/g,'');}
function parseDate(v){

    if(!v) return null;

    // Evento UTC
    const utc = v.match(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z$/
    );

    if(utc){
        return new Date(Date.UTC(
            +utc[1],
            +utc[2]-1,
            +utc[3],
            +utc[4],
            +utc[5],
            +(utc[6] || 0)
        ));
    }

    // Evento con orario locale
    const local = v.match(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/
    );

    if(local){
        return new Date(
            +local[1],
            +local[2]-1,
            +local[3],
            +local[4],
            +local[5],
            +(local[6] || 0)
        );
    }

    // Evento "all day"
    const allDay = v.match(
        /^(\d{4})(\d{2})(\d{2})$/
    );

    if(allDay){
        return new Date(
            +allDay[1],
            +allDay[2]-1,
            +allDay[3],
            0,
            0,
            0
        );
    }

    return null;
}


function fmtDate(d){return new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(d);}
function fmtShortDate(d){return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d);}
function fmtTime(d){return new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(d);}
function cleanGeoLabel(v=''){return v.replace(/^"|"$/g,'').replace(/::geo:.+$/,'').replace(/:geo:.+$/,'').trim();}
function splitProp(line){const idx=line.indexOf(':'); if(idx<0) return null; return {left:line.slice(0,idx), value:line.slice(idx+1)};}
function parseTravelAndDuration(line = '') {

    const extract = (...keys) => {

        for (const key of keys) {

            const re = new RegExp(
                `(?:^|;)${key}=("(?:[^"]*)"|[^;]*)`,
                'i'
            );

            const m = line.match(re);

            if (!m) continue;

            const value = m[1]
                .replace(/^"|"$/g, '')
                .trim();

            if (value) {
                return value;
            }
        }

        return '';
    };

    const fromTitle = cleanGeoLabel(
        unescapeICS(
            extract(
                'X-TITLE',
                'TITLE'
            )
        )
    );

    const fromAddress = cleanGeoLabel(
        unescapeICS(
            extract(
                'X-ADDRESS',
                'ADDRESS'
            )
        )
    );

    let durationRaw = unescapeICS(
        extract(
            'TRAVEL-DURATION',
            'X-APPLE-TRAVEL-DURATION',
            'DURATION'
        )
    ).trim();

    // fallback: prova a trovare una durata direttamente nella riga
    if (!durationRaw) {

        const fallback = line.match(
            /\b(?:PT\d+H\d*M?|PT\d+M|PT\d+H)\b/i
        );


        if (fallback) {
            durationRaw = fallback[0];
        }
    }

    return {
        fromTitle,
        fromAddress,
        durationRaw,
        duration: normalizeDuration(durationRaw)
    };
}

function normalizeDuration(raw = '') {

    const v = (raw || '').trim();

    if (!v) return '';

    // PT1H20M
    // PT1H
    // PT45M
    if (/^PT/i.test(v)) {

        const h = parseInt(
            (v.match(/(\d+)H/i) || [])[1] || 0,
            10
        );

        const min = parseInt(
            (v.match(/(\d+)M/i) || [])[1] || 0,
            10
        );

        if (h && min) {
            return `${h}h ${min}min`;
        }

        if (h) {
            return `${h}h`;
        }

        if (min) {
            return `${min} min`;
        }

        return '';
    }

    // numero puro = minuti
    // 45 → 45 min
    // 90 → 1h 30min
    if (/^\d+$/.test(v)) {

        const totalMinutes = parseInt(v, 10);

        if (totalMinutes < 60) {
            return `${totalMinutes} min`;
        }

        const h = Math.floor(totalMinutes / 60);
        const min = totalMinutes % 60;

        return min
            ? `${h}h ${min}min`
            : `${h}h`;
    }

    let m;

    // 1 ora e 30 minuti
    m = v.match(
        /^(\d+)\s*or[ae]\b\s*(?:e\s*)?(\d+)\s*(?:m|min|minuti)?$/i
    );

    if (m) {

        const h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);

        return min > 0
            ? `${h}h ${min}min`
            : `${h}h`;
    }

    // 1h30
    // 1h30m
    // 1 h 30
    // 1 h 30 min
    m = v.match(
        /^(\d+)\s*h\s*(\d+)\s*(?:m|min|minuti)?$/i
    );

    if (m) {

        const h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);

        return min > 0
            ? `${h}h ${min}min`
            : `${h}h`;
    }

    // 1 ora
    // 2 ore
    m = v.match(
        /^(\d+)\s*or[ae]\b$/i
    );

    if (m) {
        return `${parseInt(m[1], 10)}h`;
    }

    // 1h
    // 1 h
    m = v.match(
        /^(\d+)\s*h$/i
    );

    if (m) {
        return `${parseInt(m[1], 10)}h`;
    }

    // 45m
    // 45 min
    // 45 minuti
    m = v.match(
        /^(\d+)\s*(?:m|min|minuti)$/i
    );

    if (m) {
        return `${parseInt(m[1], 10)} min`;
    }

    return v;
}

function findManualTravelTime(obj) {

    const text = (obj.description || '').trim();

    if (!text) return '';

    const re = new RegExp(

        `${TRAVEL_KEYWORDS}\\s*[:\\-]?\\s*` +

        '(' +

            // 1 ora e 30 minuti
            '\\d+\\s*or[ae]\\b\\s*(?:e\\s*)?\\d+\\s*(?:m|min|minuti)?' +

            '|' +

            // 1h30 / 1 h 30 min
            '\\d+\\s*h\\s*\\d+\\s*(?:m|min|minuti)?' +

            '|' +

            // 2 ore / 1 ora
            '\\d+\\s*or[ae]\\b' +

            '|' +

            // 1h
            '\\d+\\s*h\\b' +

            '|' +

            // 45 min
            '\\d+\\s*(?:m|min|minuti)\\b' +

        ')',

        'i'
    );

    const match = text.match(re);

    if (!match) {
        return '';
    }

    const value = match[1].trim();

    return normalizeDuration(value);
}

function removeTravelTimeFromDescription(text = '') {

    if (!text) return '';

    const travelRegex = new RegExp(

        `${TRAVEL_KEYWORDS}\\s*[:\\-]?\\s*` +

        '(?:' +

        // 1 ora e 30 minuti
        '\\d+\\s*or[ae]\\b\\s*(?:e\\s*)?\\d+\\s*(?:m|min|minuti)' +

        '|' +

        // 1h30, 1h30m, 1 h 30 min
        '\\d+\\s*h\\s*\\d+\\s*(?:m|min|minuti)?' +

        '|' +

        // 2 ore
        '\\d+\\s*or[ae]\\b' +

        '|' +

        // 1h
        '\\d+\\s*h\\b' +

        '|' +

        // 90 min
        '\\d+\\s*(?:m|min|minuti)' +

        ')',

        'i'
    );

    const cleanedLines = text
        .split('\n')
        .map(line => {

            let cleaned = line.replace(travelRegex, '');

            cleaned = cleaned
                .replace(/^[\s\-–—,:;]+/, '')
                .replace(/[\s\-–—,:;]+$/, '')
                .replace(/\s{2,}/g, ' ')
                .trim();

            if (/^in$/i.test(cleaned)) {
                return '';
            }

            return cleaned;

        })
        .filter(Boolean);

    return cleanedLines.join('\n');
}

function parseICS(raw){
    const text = unfold(raw);
    const lines = text.split('\n');

    let calName = 'Programma di viaggio';
    const events = [];
    let current = null;

    for(const rawLine of lines){
        const line = rawLine.trimEnd();

        if(line === 'BEGIN:VEVENT'){
            current = [];
            continue;
        }

        if(line === 'END:VEVENT'){
            if(current) events.push(current);
            current = null;
            continue;
        }

        if(!current){
            if(line.startsWith('X-WR-CALNAME:')){
                calName =
                    unescapeICS(
                        line.slice('X-WR-CALNAME:'.length)
                    ).trim() || calName;
            }
            continue;
        }

        current.push(line);
    }

    const parsed = events.map(lines => {

        const obj = {
            summary: 'Senza titolo',
            location: '',
            url: '',
            description: '',
            uid: '',
            start: null,
            end: null,
            travel: null,
            travelTime: '',
            isAllDay: false,
            isAllDayEnd: false
        };


        for(const line of lines){

            const prop = splitProp(line);
            if(!prop) continue;

            const name = prop.left.split(';')[0];
            const val = unescapeICS(prop.value.trim());

            if(name === 'SUMMARY'){
                obj.summary = val || obj.summary;
            }
            else if(name === 'LOCATION'){
                obj.location = val;
            }
            else if(name === 'URL'){
                obj.url = val;
            }
            else if(name === 'DESCRIPTION'){
                obj.description = val;
            }
            else if(name === 'UID'){
                obj.uid = val;
            }
            else if(name === 'DTSTART'){
                obj.start = parseDate(val);
                obj.isAllDay = /^\d{8}$/.test(val);
            }
            else if(name === 'DTEND'){
                obj.end = parseDate(val);
                obj.isAllDayEnd = /^\d{8}$/.test(val);
            }
            else if(name === 'X-APPLE-TRAVEL-START'){
                obj.travel = parseTravelAndDuration(line);
            }
            else if(/TRAVEL-DURATION|X-APPLE-TRAVEL-DURATION/i.test(name)){
                obj.travelTime = normalizeDuration(val);
            }
        }

        if (
            obj.isAllDay &&
            obj.isAllDayEnd &&
            obj.end
        ) {
            obj.end = new Date(obj.end);
            obj.end.setDate(obj.end.getDate() - 1);
        }

        obj.dayKey = obj.start
            ? `${obj.start.getFullYear()}-${String(obj.start.getMonth()+1).padStart(2,'0')}-${String(obj.start.getDate()).padStart(2,'0')}`
            : '';

        obj.placeLabel = (obj.location || obj.summary)
            .split('\n')[0]
            .trim();

        // Recupera eventuale percorrenza presente nel DESCRIPTION
        const travelFromDescription = findManualTravelTime(obj);

        // Recupera eventuale percorrenza Apple
        const travelFromApple =
            obj.travel?.duration || '';


        // Priorità:
        // 1. TRAVEL-DURATION
        // 2. X-APPLE-TRAVEL-START
        // 3. DESCRIPTION
        obj.travelTime =
            obj.travelTime ||
            travelFromApple ||
            travelFromDescription ||
            '';

        // Se è stata trovata una percorrenza,
        // rimuove eventuali righe duplicate dalla descrizione
        if(obj.travelTime){
            obj.description =
                removeTravelTimeFromDescription(obj.description);
        }

        return obj;

    }).filter(
        e => e.start instanceof Date &&
             !isNaN(e.start)
    );

    parsed.sort((a,b) => a.start - b.start);

    return {
        calName,
        events: parsed
    };
}
function groupByDay(events){const map=new Map(); for(const ev of events){ if(!map.has(ev.dayKey)) map.set(ev.dayKey,[]); map.get(ev.dayKey).push(ev);} return [...map.entries()].map(([key,items])=>({key,items}));}
function buildSummary(model){const {calName,events}=model; summaryEl.innerHTML=''; if(!events.length) return; const first=events[0].start; const lastEnd=events.reduce((m,e)=>e.end&&e.end>m?e.end:m,events[0].end||events[0].start); const days=new Set(events.map(e=>e.dayKey)).size; const stops=new Set(events.map(e=>e.placeLabel).filter(Boolean)).size; const travelTimes=events.filter(e=>e.travelTime).length; const cards=[['Titolo',calName],['Periodo',`${fmtShortDate(first)} - ${fmtShortDate(lastEnd)}`],['Giorni',String(days)],['Eventi',String(events.length)],['Tappe',String(stops)],['Percorrenze',String(travelTimes)]]; summaryEl.innerHTML=cards.map(([k,v])=>`<div class="stat"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('');}
function labelForUrl(url){
    try{
        const u = new URL(url.replace(/^webcal:\/\//i, 'https://'));
        return u.hostname + (u.pathname !== '/' ? u.pathname : '');
    }catch{
        return url;
    }
}
function renderLinkSelect(links, selectedUrl=''){
    linkSelect.innerHTML = '<option value="">— Link salvati —</option>' +
        links.slice().sort((a,b)=>(b.savedAt||0)-(a.savedAt||0)).map(l =>
            `<option value="${esc(l.url)}">${esc(l.label ? l.label : labelForUrl(l.url))}</option>`
        ).join('');
    if(selectedUrl) linkSelect.value = selectedUrl;
}
async function loadSavedLinks(){
    if(!await ensureAuthenticated()) return;
    try{
        const res = await apiFetch('/api/links');
        if(!res.ok) return;
        const data = await res.json();
        renderLinkSelect(data.links || []);
        if(currentSession?.isAdmin) renderAdminLinks(data.links || []);
    }catch(err){
        console.error(err);
    }
}
async function saveLinkPublic(url, label){
    if(!await ensureAuthenticated()) return;
    try{
        const res = await apiFetch('/api/links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, label }),
        });
        const data = await res.json().catch(() => ({}));
        if(!res.ok){
            setStatus(data.error || 'Impossibile salvare il link.', true);
            return;
        }
        renderLinkSelect(data.links || [], url);
        if(currentSession?.isAdmin) renderAdminLinks(data.links || []);
        setStatus('Link salvato.');
    }catch(err){
        console.error(err);
        setStatus('Errore di rete durante il salvataggio del link.', true);
    }
}
async function fetchAndLoadLink(url){
    if(!await ensureAuthenticated()) return;
    if(!url){
        setStatus('Inserisci o seleziona un link.', true);
        return;
    }
    clearStatus();
    searchLinkBtn.disabled = true;
    setStatus('Recupero calendario in corso…');
    try{
        const res = await apiFetch(`/api/fetch-ical?url=${encodeURIComponent(url)}`);
        if(!res.ok){
            let msg = `Errore HTTP ${res.status}`;
            try{
                const errBody = await res.json();
                if(errBody && errBody.error) msg = errBody.error;
            }catch{}
            setStatus(msg, true);
            return;
        }
        const text = await res.text();
        const model = parseICS(text);
        renderModel(model);
        setStatus(`Calendario caricato: ${model.events.length} eventi trovati.`);
    }catch(err){
        console.error(err);
        setStatus('Errore di rete durante il recupero del calendario.', true);
    }finally{
        searchLinkBtn.disabled = false;
    }
}

// --- Amministrazione link salvati (visibile solo al ruolo admin) ---
function showMsg(el, text, type){
    el.textContent = text;
    el.className = 'status' + (type === 'error' ? ' warn' : '');
    el.style.display = 'block';
}
function renderAdminLinks(links){
    if(!currentSession?.isAdmin) return;
    adminLinksList.innerHTML = '';
    if(!links.length){
        adminLinksList.innerHTML = '<div class="small">Nessun link salvato.</div>';
        return;
    }
    links.slice().sort((a,b)=>(b.savedAt||0)-(a.savedAt||0)).forEach(link => {
        const row = document.createElement('div');
        row.className = 'link-admin-row';
        row.innerHTML = `
            <label>URL</label>
            <input type="text" class="admin-url-input" value="${esc(link.url)}" />
            <label>Etichetta</label>
            <input type="text" class="admin-label-input" value="${esc(link.label || '')}" />
            <div class="row-buttons">
                <button type="button" class="secondary admin-save-btn">Salva</button>
                <button type="button" class="danger admin-delete-btn">Elimina</button>
            </div>
        `;
        const urlInput = row.querySelector('.admin-url-input');
        const labelInput = row.querySelector('.admin-label-input');
        row.querySelector('.admin-save-btn').addEventListener('click', () => editSavedLink(link.id, urlInput.value, labelInput.value));
        row.querySelector('.admin-delete-btn').addEventListener('click', () => deleteSavedLink(link.id));
        adminLinksList.appendChild(row);
    });
}
async function editSavedLink(id, url, label){
    try{
        const res = await apiFetch('/api/links', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, url, label }),
        });
        const data = await res.json().catch(() => ({}));
        if(!res.ok){
            showMsg(linksAdminMsg, data.error || 'Impossibile modificare il link.', 'error');
            return;
        }
        renderAdminLinks(data.links || []);
        renderLinkSelect(data.links || []);
        showMsg(linksAdminMsg, 'Link aggiornato.', 'success');
    }catch(err){
        console.error(err);
        showMsg(linksAdminMsg, 'Errore di rete durante la modifica.', 'error');
    }
}
async function deleteSavedLink(id){
    if(!confirm('Eliminare questo link?')) return;
    try{
        const res = await apiFetch(`/api/links?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if(!res.ok){
            showMsg(linksAdminMsg, data.error || 'Impossibile eliminare il link.', 'error');
            return;
        }
        renderAdminLinks(data.links || []);
        renderLinkSelect(data.links || []);
        showMsg(linksAdminMsg, 'Link eliminato.', 'success');
    }catch(err){
        console.error(err);
        showMsg(linksAdminMsg, 'Errore di rete durante l\'eliminazione.', 'error');
    }
}
async function addSavedLinkFromAdmin(){
    const url = adminNewUrl.value.trim();
    const label = adminNewLabel.value.trim();
    if(!url) return;
    adminAddBtn.disabled = true;
    try{
        const res = await apiFetch('/api/links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, label }),
        });
        const data = await res.json().catch(() => ({}));
        if(!res.ok){
            showMsg(linksAdminMsg, data.error || 'Impossibile aggiungere il link.', 'error');
            return;
        }
        adminNewUrl.value = '';
        adminNewLabel.value = '';
        renderAdminLinks(data.links || []);
        renderLinkSelect(data.links || []);
        showMsg(linksAdminMsg, 'Link aggiunto.', 'success');
    }catch(err){
        console.error(err);
        showMsg(linksAdminMsg, 'Errore di rete durante l\'aggiunta.', 'error');
    }finally{
        adminAddBtn.disabled = false;
    }
}

function resetToEmptyState(){
    currentModel = null;
    summaryEl.innerHTML = '';
    outputEl.innerHTML = '<div class="empty">Carica un file iCal per generare il programma.</div>';
    saveHtmlBtn.disabled = true;
    pdfBtn.disabled = true;
    clearStatus();
}
function renderModel(model) {

    currentModel = model;

    buildSummary(model);

    const hasEvents = model.events.length > 0;

    saveHtmlBtn.disabled = !hasEvents;
    pdfBtn.disabled = !hasEvents;

    if (!hasEvents) {

        outputEl.innerHTML = `
            <div class="empty">
                Nessun evento valido trovato.
            </div>
        `;

        return;
    }

    const groups = groupByDay(model.events);

    const firstEvent = model.events[0];

    const lastEvent =
        model.events[model.events.length - 1];

    const tripStart = firstEvent.start;

    const tripEnd =
        lastEvent.end instanceof Date
            ? lastEvent.end
            : lastEvent.start;

    const cover = `
        <section class="cover card">
            <h2>${esc(model.calName)}</h2>

            <div class="muted">
                Dal ${esc(fmtDate(tripStart))}
                al ${esc(fmtDate(tripEnd))}
            </div>
        </section>
    `;

    const daysHtml = groups.map(({ items }) => {

        const dayDate = items[0].start;

        const rows = items.map(ev => {

            const timeLabel =
                ev.isAllDay
                    ? 'Intera giornata'
                    : esc(fmtTime(ev.start));

            const endLabel =
                ev.end && !ev.isAllDay
                    ? `
                        <div class="small">
                            fino ${esc(fmtTime(ev.end))}
                        </div>
                    `
                    : '';

            const travelLabel =
                ev.travelTime
                    ? `
                        <div class="travel-meta">
                            Trasferimento:
                            ${esc(ev.travelTime)}
                            da tappa precedente
                        </div>
                    `
                    : '';

            const description =
                ev.description
                    ? `
                        <div class="small">
                            ${esc(ev.description)}
                        </div>
                    `
                    : '';

            const location =
                ev.location
                    ? esc(ev.location).replace(/\n/g, '<br>')
                    : '<span class="small">—</span>';

            return `
                <tr>

                    <td class="time">
                        ${timeLabel}
                        ${endLabel}
                    </td>

                    <td>

                        <div class="ev-title">
                            ${esc(ev.summary)}
                        </div>

                        ${travelLabel}

                        ${description}

                        ${ev.url
                        ? `
                            <div class="small">
                                ${esc(ev.url)}
                            </div>
                        `
                        : ''
                    }
                    </td>

                    <td>
                        ${location}
                    </td>

                </tr>
            `;
        }).join('');

        return `
            <section class="day">

                <div class="day-head">

                    <h2>
                        ${esc(fmtDate(dayDate))}
                    </h2>

                    <div class="meta">
                        ${items.length} attività
                    </div>

                </div>

                <div class="table-wrap">

                    <table>

                        <colgroup>
                            <col style="width:110px">
                            <col>
                            <col class="place-col">
                        </colgroup>

                        <thead>
                            <tr>
                                <th>Orario</th>
                                <th>Attività</th>
                                <th class="place-col">Luogo</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${rows}
                        </tbody>

                    </table>

                </div>

            </section>
        `;

    }).join('');

    outputEl.innerHTML = cover + daysHtml;
}
function buildStaticDocument(){const styles=document.querySelector('style').textContent; const title=currentModel?.calName || 'Programma di viaggio'; return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${styles}</style></head><body><div class="wrap"><div class="toolbar"><div class="title"><h1>${esc(title)}</h1><p></p></div><div class="grid">${summaryEl.innerHTML}</div></div><div class="sheet">${outputEl.innerHTML}</div></div></body></html>`;}
function saveStaticHTML(){ if(!currentModel) return; try{ const blob=new Blob([buildStaticDocument()],{type:'text/html;charset=utf-8'}); const a=document.createElement('a'); const url=URL.createObjectURL(blob); a.href=url; a.download=(currentModel.calName||'itinerario').replace(/[\\/:*?"<>|]+/g,'-')+'-finale.html'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500); setStatus('Pagina finale salvata.'); }catch(err){ console.error(err); setStatus('Salvataggio non riuscito in questo browser.', true); }}
function generatePdf(){ if(!currentModel) return; const w=window.open('','_blank'); if(!w){ setStatus('Popup bloccato: usa Safari e abilita la nuova finestra.', true); return; } const doc=buildStaticDocument(); w.document.open(); w.document.write(doc); w.document.close(); setTimeout(()=>{ try{ w.focus(); w.print(); } catch(e){ setStatus('Stampa non disponibile in questo browser.', true); } }, 600);} 
fileInput.addEventListener('change', async e=>{const f=e.target.files && e.target.files[0]; if(!f) return; if(!await ensureAuthenticated()) return; clearStatus(); linkSelect.value=''; linkUrlInput.value=''; try{ const txt=await f.text(); const model=parseICS(txt); renderModel(model); setStatus(`Importazione completata: ${model.events.length} eventi letti da ${f.name}.`); } catch(err){ console.error(err); setStatus('Errore durante la lettura del file iCal.', true); }});
saveHtmlBtn.addEventListener('click', saveStaticHTML);
pdfBtn.addEventListener('click', generatePdf);

searchLinkBtn.addEventListener('click', async () => {
    if(!await ensureAuthenticated()) return;
    const url = (linkUrlInput.value || linkSelect.value || '').trim();
    if(!url){
        setStatus('Inserisci un link webcal o https, oppure selezionane uno salvato.', true);
        return;
    }
    fileInput.value = '';
    if(linkSelect.value !== url) linkSelect.value = '';
    fetchAndLoadLink(url);
});
saveLinkBtn.addEventListener('click', async () => {
    if(!await ensureAuthenticated()) return;
    const url = (linkUrlInput.value || linkSelect.value || '').trim();
    if(!url){
        setStatus('Inserisci un link da salvare.', true);
        return;
    }
    const label = linkLabelInput.value.trim();
    saveLinkPublic(url, label);
});
linkSelect.addEventListener('change', async () => {
    if(!await ensureAuthenticated()) return;
    const url = linkSelect.value;
    if(url){
        fileInput.value = '';
        linkUrlInput.value = url;
        fetchAndLoadLink(url);
    }else{
        linkUrlInput.value = '';
        resetToEmptyState();
    }
});

adminAddBtn.addEventListener('click', addSavedLinkFromAdmin);

// --- Login/logout: affidati SOLO al widget nativo di Netlify Identity. ---
// Nessun form custom, nessuna chiamata a endpoint di provider specifici:
// il widget mostra login/registrazione via email+password e, se
// configurati in Netlify (Site settings → Identity → External providers),
// anche i pulsanti OAuth (es. Google). Qui ci limitiamo ad apire/chiudere
// il modal e a reagire agli eventi che il widget stesso emette.
authLoginBtn.addEventListener('click', () => {
    if(!window.netlifyIdentity){
        showAuthMessage('Netlify Identity non è ancora pronto: riprova in un istante.', true);
        return;
    }
    window.netlifyIdentity.open('login');
});
logoutBtn.addEventListener('click', () => {
    window.netlifyIdentity?.logout();
});

function initAuthFlow(){
    if(!window.netlifyIdentity){
        window.setTimeout(initAuthFlow, 200);
        return;
    }

    window.netlifyIdentity.init();

    window.netlifyIdentity.on('login', async () => {
        clearAuthMessage();
        const session = await refreshSession();
        if(session){
            setStatus('Accesso eseguito.');
            loadSavedLinks();
        } else {
            showAuthMessage('Accesso Netlify riuscito, ma non è stato possibile verificare la sessione. Riprova.', true);
        }
    });
    window.netlifyIdentity.on('logout', () => {
        currentSession = null;
        applySessionToUI();
        clearStatus();
        showAuthMessage('Hai effettuato il logout. Accedi di nuovo per usare il servizio.', false);
    });
    window.netlifyIdentity.on('error', err => {
        console.error('Netlify Identity error', err);
        showAuthMessage('Si è verificato un errore con Netlify Identity. Riprova più tardi.', true);
    });

    // All'avvio verifichiamo sempre lo stato reale interrogando /api/auth
    // (che si basa solo sul JWT), invece di fidarci ciecamente di un
    // eventuale utente Identity già in cache: così la UI riflette sempre
    // la verità server-side su ruolo e permessi.
    refreshSession().then(session => { if(session) loadSavedLinks(); });
    window.addEventListener('pageshow', () => { refreshSession(); });
}
initAuthFlow();
