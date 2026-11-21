// Clube Prime: multi-cidade, favoritos, "Como chegar" e indicação de amigos.
// Carregado por app.js. Expõe window.Cidades.
import { collection, getDocs, addDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Lista padrão (funciona sem configurar nada). Se existir a coleção "cidades" no Firestore, ela substitui esta.
const PADRAO = [
  { id: 'pelotas-rs', nome: 'Pelotas', uf: 'RS', lat: -31.7654, lon: -52.3376, ativa: true },
  { id: 'rio-grande-rs', nome: 'Rio Grande', uf: 'RS', lat: -32.035, lon: -52.0986, ativa: true },
  { id: 'porto-alegre-rs', nome: 'Porto Alegre', uf: 'RS', lat: -30.0346, lon: -51.2177, ativa: false },
  { id: 'santa-maria-rs', nome: 'Santa Maria', uf: 'RS', lat: -29.6842, lon: -53.8069, ativa: false }
];
let lista = [...PADRAO];
const LS = 'clube_cidade', FV = 'clube_favs', REF = 'clube_ref';
const lerLS = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const gravaLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const aviso = (t, m, i) => window.mostrarAviso ? window.mostrarAviso(t, m, i) : alert(t + '\n' + m);
const usuario = () => window.firebaseAuth?.currentUser || null;

const INDICACAO_ATIVA = false; // "Indique e ganhe" em pausa: mude para true para voltar

let favs = []; try { favs = JSON.parse(lerLS(FV) || '[]'); } catch (e) {}
let soFav = false;
const atual = () => lista.find(c => c.id === lerLS(LS)) || lista[0];

// Troca "Pelotas" pelo nome da cidade escolhida em todos os textos da tela (guarda o original para poder trocar de novo)
function textos() {
  const c = atual();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentNode;
    if (!p || /SCRIPT|STYLE/.test(p.tagName)) continue;
    if (n.__o === undefined) {
      // Rodapé "Prime Labs • Pelotas" é a sede da desenvolvedora: não muda
      n.__o = (/Pelotas/.test(n.nodeValue) && !/Prime Labs/.test(p.textContent)) ? n.nodeValue : null;
    }
    if (n.__o === null) continue;
    n.nodeValue = n.__o.replace(/Pelotas(\s*\/\s*RS|,\s*RS)?/g, (m, s) => s ? c.nome + (s.includes('/') ? ' / ' : ', ') + c.uf : c.nome);
  }
  document.title = 'CLUBE PRIME - ' + c.nome + ' / ' + c.uf;
}

// Seletor de cidade do cadastro (só cidades ativas), sempre alinhado com a cidade do topo
function preencherSelect() {
  const s = document.getElementById('reg-cidade');
  if (!s) return;
  s.innerHTML = lista.filter(c => c.ativa).map(c => `<option value="${esc(c.id)}">${esc(c.nome)} / ${esc(c.uf)}</option>`).join('');
  s.value = atual().id;
  const f = document.getElementById('adm-filtro-cidade');
  if (f) {
    const v = window.admCidadeFiltro || 'todas';
    f.innerHTML = '<option value="todas">🌎 Todas as cidades</option>' + lista.map(c => `<option value="${esc(c.id)}">${esc(c.nome)} / ${esc(c.uf)}</option>`).join('');
    f.value = v;
  }
}

// Depois do login, a cidade da conta manda. Empresa fica presa à cidade dela (só o admin muda)
function sincronizar() {
  const d = window.currentUserData;
  const b = document.querySelector('.location-badge');
  if (!d) return;
  if (d.cidadeId && d.cidadeId !== lerLS(LS) && lista.some(c => c.id === d.cidadeId)) {
    gravaLS(LS, d.cidadeId); textos(); preencherSelect();
    window.recarregarVitrine && window.recarregarVitrine();
  }
  if (b) {
    const trava = d.funcao === 'lojista';
    b.onclick = trava ? null : modal;
    b.style.cursor = trava ? 'default' : 'pointer';
  }
}

function fechar() { document.getElementById('modal-cidade')?.remove(); }

function modal() {
  let m = document.getElementById('modal-cidade');
  if (!m) {
    m = document.createElement('div');
    m.id = 'modal-cidade';
    m.style.cssText = 'position:fixed;inset:0;z-index:6000;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center';
    m.onclick = e => { if (e.target === m) fechar(); };
    document.body.appendChild(m);
  }
  const a = atual();
  m.innerHTML = `<div style="background:var(--card,#fff);color:var(--text,#0f172a);width:100%;max-width:480px;border-radius:24px 24px 0 0;padding:20px;max-height:80vh;overflow:auto">
    <h3 style="font-weight:900;font-size:1.2rem;margin-bottom:4px">📍 Escolha sua cidade</h3>
    <p style="font-size:.78rem;color:var(--muted);margin-bottom:12px">Veja os parceiros e cupons da sua região.</p>
    <button class="btn btn-outline" style="margin-bottom:12px" onclick="Cidades.gps()">🎯 Usar minha localização</button>
    ${lista.map(c => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px;border:1px solid ${c.id === a.id ? 'var(--primary)' : 'var(--card-border)'};border-radius:14px;margin-bottom:8px">
      <div><strong>${esc(c.nome)}</strong> <span style="color:var(--muted);font-size:.75rem">${esc(c.uf)}</span>${c.ativa ? '' : '<div style="font-size:.7rem;color:var(--muted)">Em breve</div>'}</div>
      <button class="btn ${c.ativa ? 'btn-cyan' : 'btn-outline'} btn-small" onclick="Cidades.${c.ativa ? 'set' : 'espera'}('${esc(c.id)}')">${c.ativa ? (c.id === a.id ? '✓ Atual' : 'Escolher') : '🔔 Avise-me'}</button>
    </div>`).join('')}
  </div>`;
}

function escolher(id) {
  gravaLS(LS, id);
  fechar();
  textos();
  preencherSelect();
  window.recarregarVitrine && window.recarregarVitrine();
  const u = usuario();
  if (u && window.currentUserData?.funcao === 'cliente') {
    updateDoc(doc(window.firebaseDb, 'usuarios', u.uid), { cidadeId: id }).catch(() => {});
  }
}

async function espera(id) {
  try {
    const u = usuario();
    await addDoc(collection(window.firebaseDb, 'lista_espera'), { cidadeId: id, email: u?.email || '', criadoEm: new Date().toISOString() });
    aviso('Combinado! 🔔', 'Avisaremos você quando o Clube Prime chegar na sua cidade.', '✅');
  } catch (e) {
    aviso('Ops', 'Não foi possível registrar agora. Tente novamente mais tarde.', '⚠️');
  }
}

function distKm(a, b, c, d) {
  const r = x => x * Math.PI / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function gps() {
  if (!navigator.geolocation) return aviso('GPS indisponível', 'Escolha sua cidade na lista.', '⚠️');
  navigator.geolocation.getCurrentPosition(p => {
    const ativas = lista.filter(c => c.ativa && c.lat != null);
    const ord = ativas.map(c => ({ c, d: distKm(p.coords.latitude, p.coords.longitude, c.lat, c.lon) })).sort((x, y) => x.d - y.d);
    if (ord.length && ord[0].d < 60) escolher(ord[0].c.id);
    else aviso('Ainda não chegamos aí', 'Não há parceiros perto de você ainda. Escolha uma cidade da lista ou toque em "Avise-me".', '📍');
  }, () => aviso('Sem permissão', 'Não consegui usar o GPS. Escolha sua cidade na lista.', '⚠️'), { timeout: 10000 });
}

// Favoritos
function favoritar(k) {
  favs = favs.includes(k) ? favs.filter(x => x !== k) : [...favs, k];
  gravaLS(FV, JSON.stringify(favs));
  pos();
  const u = usuario();
  if (u) updateDoc(doc(window.firebaseDb, 'usuarios', u.uid), { favoritos: favs }).catch(() => {});
}

// Chamado após cada renderização da vitrine: coração, "Como chegar" e filtro de favoritos
function pos() {
  const box = document.getElementById('stores-list-dynamic');
  if (!box) return;
  let bf = document.getElementById('btn-fav-filtro');
  if (!bf) {
    bf = document.createElement('button');
    bf.id = 'btn-fav-filtro';
    bf.className = 'btn btn-outline btn-small';
    bf.style.cssText = 'margin-bottom:12px;max-width:220px';
    bf.onclick = () => { soFav = !soFav; pos(); };
    box.parentNode.insertBefore(bf, box);
  }
  bf.textContent = soFav ? '❤️ Mostrando favoritos' : '🤍 Só favoritos';
  box.querySelectorAll('.company-card').forEach(card => {
    const k = card.dataset.key, f = favs.includes(k);
    card.style.display = soFav && !f ? 'none' : '';
    let h = card.querySelector('.btn-heart');
    if (!h) {
      h = document.createElement('button');
      h.className = 'btn-heart';
      h.style.cssText = 'background:none;border:none;font-size:1.1rem;cursor:pointer;padding:0 6px 0 0';
      h.onclick = () => favoritar(k);
      card.querySelector('h3')?.insertAdjacentElement('afterbegin', h);
    }
    h.textContent = f ? '❤️' : '🤍';
    if (card.dataset.lat && card.dataset.lon && !card.querySelector('.btn-rota')) {
      const a = document.createElement('a');
      a.className = 'btn-rota';
      a.href = `https://www.google.com/maps/dir/?api=1&destination=${card.dataset.lat},${card.dataset.lon}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = '🗺️ Como chegar';
      a.style.cssText = 'display:block;margin-top:4px;font-size:.72rem;font-weight:800;color:var(--primary)';
      card.querySelector('.distancia-badge')?.parentNode.appendChild(a);
    }
  });
}

// Indique e ganhe: mostra código e link no perfil do cliente
function indicacao(u) {
  const s = document.getElementById('screen-profile');
  if (!s) return;
  let c = document.getElementById('card-indicacao');
  if (!INDICACAO_ATIVA || !u || window.currentUserData?.funcao === 'lojista' || window.currentUserData?.funcao === 'admin') { c && c.remove(); return; }
  const code = u.uid.slice(0, 6).toUpperCase(), link = location.origin + '/?ref=' + code;
  if (!c) { c = document.createElement('div'); c.id = 'card-indicacao'; s.prepend(c); }
  c.style.cssText = 'background:var(--secondary);border:1px dashed var(--primary);border-radius:16px;padding:14px;margin-bottom:14px';
  c.innerHTML = `<div style="font-weight:900">🎁 Indique e ganhe</div>
    <div style="font-size:.75rem;color:var(--muted);margin:4px 0 10px">Seu código: <strong>${code}</strong>. Cada amigo que criar conta pelo seu link conta como indicação.</div>
    <button class="btn btn-cyan btn-small" id="btn-indicar">📤 Convidar amigos</button>`;
  c.querySelector('#btn-indicar').onclick = async () => {
    const t = 'Economize com cupons exclusivos no Clube Prime! ' + link;
    try {
      if (navigator.share) await navigator.share({ title: 'Clube Prime', text: t, url: link });
      else { await navigator.clipboard.writeText(t); aviso('Link copiado! 📋', 'Cole no WhatsApp para convidar seus amigos.', '✅'); }
    } catch (e) {}
  };
}

window.Cidades = {
  lista: () => lista,
  id: () => atual().id,
  nome: () => atual().nome,
  rotulo: () => atual().nome + ' / ' + atual().uf,
  rotuloDe: id => { const c = lista.find(x => x.id === id) || atual(); return c.nome + ' / ' + c.uf; },
  ref: () => lerLS(REF) || '',
  abrir: modal, set: escolher, espera, gps, pos,
  recarregar: async () => { await carregarLista(); textos(); preencherSelect(); },
  filtrar: arr => arr.filter(c => (c.cidadeId || 'pelotas-rs') === atual().id) // cupons antigos sem cidadeId = Pelotas
};

// Guarda o código de quem indicou (?ref=ABC123)
const r = new URLSearchParams(location.search).get('ref');
if (r) gravaLS(REF, r.toUpperCase().slice(0, 12));

// Lê as cidades do Firestore (coleção "cidades"). Se estiver vazia ou sem permissão, fica a lista padrão.
async function carregarLista() {
  try {
    const snap = await getDocs(collection(window.firebaseDb, 'cidades'));
    const fs = snap.docs.map(d => ({ id: d.id, ...d.data(), ativa: d.data().ativa !== false })).filter(c => c.nome);
    fs.sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999)); // Pelotas (ordem 0) continua sendo a primeira/padrão
    if (fs.length) lista = fs;
  } catch (e) { /* sem coleção ou sem permissão: usa a lista padrão */ }
}

window.addEventListener('load', async () => {
  const b = document.querySelector('.location-badge');
  if (b) { b.style.cursor = 'pointer'; b.insertAdjacentHTML('beforeend', ' ▾'); b.onclick = modal; }
  await carregarLista();
  textos();
  preencherSelect();
  if (!lerLS(LS)) modal();
  onAuthStateChanged(window.firebaseAuth, u => { indicacao(u); [1500, 3500].forEach(t => setTimeout(() => { sincronizar(); indicacao(usuario()); }, t)); });
});
