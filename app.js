import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, addDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCTVY6ogF-o7pGuDeHPYCkGfrkeLTvpjKU",
  authDomain: "projeto-01-63111.firebaseapp.com",
  projectId: "projeto-01-63111",
  storageBucket: "projeto-01-63111.firebasestorage.app",
  messagingSenderId: "484791910480",
  appId: "1:484791910480:web:644bb77a68487c79881155"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

window.firebaseAuth = auth;
window.firebaseDb = db;

const CODIGO_SECRETO_LOJISTA = "PRIME.PARCEIRO20";
let pixCopiaColaAtual = "";
let codigoCupomAtual = "";
let currentAuthTab = "login";
let intervalPixCheck = null;
let economiaTotal = parseFloat(localStorage.getItem('clube_econ') || '0.00');

let unsubscribeUser = null;
let unsubscribeCupons = null;
let unsubscribeMerchantCupons = null;

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('clube_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeBtn = document.querySelector('.theme-toggle-btn');
  if (themeBtn) themeBtn.innerText = savedTheme === 'dark' ? '☀️' : '🌙';
  atualizarCarteiraUI();
  escutarBannerGlobal();
  escutarBannerLojista();
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userDocRef = doc(db, "usuarios", user.uid);

    unsubscribeUser = onSnapshot(userDocRef, async (snapshot) => {
      let data = null;
      if (snapshot.exists()) {
        data = snapshot.data();
      } else {
        data = {
          nome: user.displayName || "Cliente Clube PRIME",
          email: user.email.toLowerCase(),
          fotoUrl: user.photoURL || null,
          funcao: "cliente",
          vip: false,
          vipExpiraEm: null,
          criadoEm: new Date().toISOString()
        };
        await setDoc(userDocRef, data);
      }

      window.currentUserData = data;
      
      if (data.funcao === "admin") {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen-admin').classList.add('active');
        document.querySelector('.bottom-nav').style.display = 'none';
        carregarPainelAdmin();
        return;
      }

      if (data.funcao === "lojista") {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen-merchant').classList.add('active');
        document.querySelector('.bottom-nav').style.display = 'none';
        
        const nomeEmpresa = data.empresaNome || "Empresa Parceira";
        const enderecoEmpresa = data.empresaEndereco || "Pelotas / RS";
        const telefoneEmpresa = data.empresaTelefone || "";

        document.getElementById('merchant-store-name').innerText = nomeEmpresa;
        if (document.getElementById('merchant-edit-name')) document.getElementById('merchant-edit-name').value = nomeEmpresa;
        if (document.getElementById('merchant-edit-address')) document.getElementById('merchant-edit-address').value = enderecoEmpresa;
        if (document.getElementById('merchant-edit-phone')) document.getElementById('merchant-edit-phone').value = telefoneEmpresa;

        carregarEstatisticasLojista(user.uid);
        carregarCuponsDoLojista(user.uid);
        return;
      }

      try {
        await fetch(`https://webhook-clubprime.vercel.app/api/checar-pix?email=${encodeURIComponent(user.email)}&userId=${user.uid}`);
      } catch (err) {}

      if (data.vip && data.vipExpiraEm) {
        const expiraData = new Date(data.vipExpiraEm);
        if (new Date() > expiraData) {
          data.vip = false;
          await updateDoc(userDocRef, { vip: false, vipExpiraEm: null });
        }
      }

      document.getElementById('user-name-display').innerText = data.nome || user.displayName || "Cliente";
      document.getElementById('profile-name').innerText = data.nome || user.displayName || "Cliente";
      document.getElementById('profile-email').innerText = data.email || user.email;
      
      const avatarImg = document.getElementById('profile-avatar');
      const fotoFinal = user.photoURL || data.fotoUrl;
      if (fotoFinal) {
        avatarImg.src = fotoFinal;
      } else {
        avatarImg.src = "https://ui-avatars.com/api/?name=" + encodeURIComponent(data.nome || user.displayName || 'User') + "&background=2563eb&color=fff";
      }

      const dataCriado = data.criadoEm ? new Date(data.criadoEm).toLocaleDateString('pt-BR') : 'Hoje';
      document.getElementById('profile-joined-date').innerText = dataCriado;

      if (data.vip) {
        window.isVipUser = true;
        document.querySelectorAll('.status-badge').forEach(b => {
          b.innerText = "ASSINANTE VIP";
          b.className = "status-badge vip";
        });
        document.getElementById('banner-assinatura').style.display = 'none';
        document.getElementById('profile-vip-card').style.display = 'block';
        
        if (data.vipExpiraEm) {
          const expiraStr = new Date(data.vipExpiraEm).toLocaleDateString('pt-BR');
          document.getElementById('profile-vip-expira').innerText = expiraStr;
        }
        fecharModal('modal-pix');
      } else {
        window.isVipUser = false;
        document.querySelectorAll('.status-badge').forEach(b => {
          b.innerText = "PLANO GRATUITO";
          b.className = "status-badge free";
        });
        document.getElementById('banner-assinatura').style.display = 'block';
        document.getElementById('profile-vip-card').style.display = 'none';
      }
    });

    carregarCuponsVitrine();

    document.getElementById('screen-auth').classList.remove('active');
    document.getElementById('screen-home').classList.add('active');
    document.querySelector('.bottom-nav').style.display = 'flex';
  } else {
    if (unsubscribeUser) unsubscribeUser();
    if (unsubscribeCupons) unsubscribeCupons();
    if (unsubscribeMerchantCupons) unsubscribeMerchantCupons();

    window.isVipUser = false;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-auth').classList.add('active');
    document.querySelector('.bottom-nav').style.display = 'none';
  }
});

function escutarBannerGlobal() {
  const bannerRef = doc(db, "configuracoes", "banner_global");
  onSnapshot(bannerRef, (docSnap) => {
    const bannerEl = document.getElementById('client-global-banner');
    const contentEl = document.getElementById('client-global-banner-content');
    const adminInput = document.getElementById('admin-global-banner-text');

    if (docSnap.exists() && docSnap.data().texto) {
      const texto = docSnap.data().texto;
      if (bannerEl && contentEl) {
        contentEl.innerText = texto;
        bannerEl.style.display = 'block';
      }
      if (adminInput) adminInput.value = texto;
    } else {
      if (bannerEl) bannerEl.style.display = 'none';
    }
  });
}

function escutarBannerLojista() {
  const bannerRef = doc(db, "configuracoes", "banner_lojistas");
  onSnapshot(bannerRef, (docSnap) => {
    const bannerEl = document.getElementById('merchant-banner-notice');
    const contentEl = document.getElementById('merchant-banner-content');
    const adminInput = document.getElementById('admin-merchant-banner-text');

    if (docSnap.exists() && docSnap.data().texto) {
      const texto = docSnap.data().texto;
      if (bannerEl && contentEl) {
        contentEl.innerText = texto;
        bannerEl.style.display = 'block';
      }
      if (adminInput) adminInput.value = texto;
    } else {
      if (bannerEl) bannerEl.style.display = 'none';
    }
  });
}

window.salvarBannerGlobalAdmin = async function() {
  const texto = document.getElementById('admin-global-banner-text').value.trim();
  try {
    await setDoc(doc(db, "configuracoes", "banner_global"), { texto: texto });
    mostrarAviso("Atualizado! 📢", "Aviso de clientes publicado.", "✅");
  } catch (err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

window.salvarBannerLojistaAdmin = async function() {
  const texto = document.getElementById('admin-merchant-banner-text').value.trim();
  try {
    await setDoc(doc(db, "configuracoes", "banner_lojistas"), { texto: texto });
    mostrarAviso("Atualizado! 🏢", "Recado para lojistas publicado.", "✅");
  } catch (err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

function carregarCuponsVitrine() {
  const q = query(collection(db, "cupons"), where("ativo", "==", true));
  unsubscribeCupons = onSnapshot(q, (snapshot) => {
    const container = document.getElementById('stores-list-dynamic');
    if (!container) return;
    
    let cuponsArray = [];
    snapshot.forEach((docSnap) => {
      cuponsArray.push({ id: docSnap.id, ...docSnap.data() });
    });

    cuponsArray.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

    let html = '';
    cuponsArray.forEach((cupom) => {
      let imgHtml = cupom.imagem ? `<img src="${cupom.imagem}" alt="Foto" style="width:100%; height:120px; object-fit:cover; border-radius:12px; margin-bottom:10px;">` : '';
      const limiteTxt = cupom.limite === 'daily' ? '1 por dia' : cupom.limite === 'once' ? 'Uso único' : 'Ilimitado';

      html += `
        <div class="company-card" data-cat="${cupom.categoria}" data-name="${cupom.titulo.toLowerCase()} ${cupom.empresaNome.toLowerCase()}" data-id="${cupom.id}">
          ${imgHtml}
          <div class="company-header">
            <div>
              <div class="company-title">${cupom.empresaNome}</div>
              <div class="company-meta">
                <span>📍 ${cupom.endereco || 'Pelotas / RS'}</span>
                <span style="color:var(--accent);">⭐ 5.0</span>
              </div>
            </div>
            <div class="discount-badge">${cupom.descontoBadge || 'OFERTA'}</div>
          </div>
          <h4 style="font-size:0.95rem; font-weight:800; margin-bottom:4px;">${cupom.titulo}</h4>
          <p style="font-size:0.8rem; color:var(--muted); margin-bottom:6px;">${cupom.descricao}</p>
          <p style="font-size:0.7rem; color:var(--primary); font-weight:700; margin-bottom:14px;">Regra: ${limiteTxt}</p>
          <button class="btn btn-cyan" onclick="clicarElesResgatar('${cupom.id}', '${cupom.empresaId}', '${cupom.empresaNome}', '${cupom.titulo}', '${cupom.codigo || 'PRIME'}', ${cupom.valorEconomia || 10.00}, '${cupom.endereco || 'Pelotas / RS'}', '${cupom.telefone || ''}', '${cupom.regras || ''}', '${cupom.limite || 'daily'}')">
            🎟️ Resgatar Cupom
          </button>
        </div>
      `;
    });

    if (html !== '') {
      container.innerHTML = html;
    } else {
      container.innerHTML = `<p style="font-size:0.8rem; color:var(--muted); text-align:center; padding:20px;">Nenhum cupom ativo no momento.</p>`;
    }
  });
}

window.clicarElesResgatar = async function(cupomId, empresaId, empresaNome, titulo, prefixoCodigo, econ, endereco, telefone, regras, limite) {
  const user = auth.currentUser;
  if (!user) return mostrarAviso("Atenção", "Faça login para resgatar.", "⚠️");

  if (limite !== 'unlimited') {
    try {
      const qCheck = query(
        collection(db, "logs_resgates"),
        where("usuarioUid", "==", user.uid),
        where("cupomId", "==", cupomId)
      );
      const snapCheck = await getDocs(qCheck);

      if (!snapCheck.empty) {
        if (limite === 'once') {
          return mostrarAviso("Cupom Já Utilizado! ⚠️", "Esta oferta é de USO ÚNICO e você já a resgatou anteriormente.", "🔒");
        } else if (limite === 'daily') {
          const hojeStr = new Date().toISOString().split('T')[0];
          let jaUsouHoje = false;
          snapCheck.forEach(docSnap => {
            const dataUso = docSnap.data().dataHora || '';
            if (dataUso.startsWith(hojeStr)) jaUsouHoje = true;
          });
          if (jaUsouHoje) {
            return mostrarAviso("Limite Diário Atingido! ⏳", "Você já resgatou este cupom hoje. Tente novamente amanhã!", "📅");
          }
        }
      }
    } catch(e) {}
  }

  try {
    await updateDoc(doc(db, "cupons", cupomId), {
      cliquesCount: increment(1)
    });
  } catch(e) {}

  resgatarCupomReal(cupomId, empresaId, empresaNome, titulo, prefixoCodigo, econ, endereco, telefone, regras);
};

async function carregarEstatisticasLojista(empresaUid) {
  try {
    const q = query(collection(db, "cupons"), where("empresaId", "==", empresaUid));
    const snap = await getDocs(q);
    let totalCliques = 0;
    snap.forEach(d => {
      totalCliques += (d.data().cliquesCount || 0);
    });
    document.getElementById('merchant-stat-clicks').innerText = totalCliques;

    const qValid = query(collection(db, "logs_resgates"), where("empresaId", "==", empresaUid), where("status", "==", "usado"));
    const snapValid = await getDocs(qValid);
    document.getElementById('merchant-stat-validations').innerText = snapValid.size;
  } catch(e) {}
}

function carregarCuponsDoLojista(empresaUid) {
  const q = query(collection(db, "cupons"), where("empresaId", "==", empresaUid));
  unsubscribeMerchantCupons = onSnapshot(q, (snapshot) => {
    const container = document.getElementById('merchant-offers-list');
    if (!container) return;

    if (snapshot.empty) {
      container.innerHTML = `<p style="font-size:0.8rem; color:var(--muted); text-align:center; padding:10px;">Você ainda não cadastrou nenhuma oferta.</p>`;
      return;
    }

    let html = '';
    snapshot.forEach((docSnap) => {
      const cupom = docSnap.data();
      const docId = docSnap.id;
      const statusText = cupom.ativo ? "🟢 ATIVA" : "🔴 PAUSADA";
      const btnPausaText = cupom.ativo ? "Pausar" : "Ativar";
      const cliques = cupom.cliquesCount || 0;

      html += `
        <div style="background:var(--card); border:1px solid var(--card-border); padding:14px; border-radius:16px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4 style="font-size:0.9rem; font-weight:800;">${cupom.titulo}</h4>
            <span style="font-size:0.7rem; font-weight:800;">${statusText}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--muted); margin:4px 0;">Prefixo: <strong>${cupom.codigo || 'PRIME'}</strong> | Cliques: <strong>${cliques}</strong></p>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
            <button class="btn btn-outline btn-small" onclick="toggleStatusCupom('${docId}', ${cupom.ativo})">⏸️ ${btnPausaText}</button>
            <button class="btn btn-outline btn-small" onclick="abrirModalEditarOferta('${docId}', '${encodeURIComponent(cupom.titulo)}', '${encodeURIComponent(cupom.descricao)}', '${encodeURIComponent(cupom.regras || '')}', '${cupom.categoria}', '${encodeURIComponent(cupom.descontoBadge || '')}', ${cupom.valorEconomia || 10}, '${cupom.codigo || 'PRIME'}', '${encodeURIComponent(cupom.imagem || '')}', '${cupom.limite || 'daily'}')">✏️ Editar</button>
            <button class="btn btn-outline btn-small" style="color:var(--danger); border-color:#ef444455;" onclick="excluirCupom('${docId}')">🗑️ Excluir</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  });
}

// ABAS DO PAINEL ADMIN
window.switchAdminTab = function(tabName) {
  document.getElementById('adm-tab-cupons').classList.toggle('active', tabName === 'cupons');
  document.getElementById('adm-tab-clientes').classList.toggle('active', tabName === 'clientes');
  document.getElementById('adm-tab-empresas').classList.toggle('active', tabName === 'empresas');

  document.getElementById('adm-section-cupons').style.display = tabName === 'cupons' ? 'block' : 'none';
  document.getElementById('adm-section-clientes').style.display = tabName === 'clientes' ? 'block' : 'none';
  document.getElementById('adm-section-empresas').style.display = tabName === 'empresas' ? 'block' : 'none';
};

async function carregarPainelAdmin() {
  try {
    const snapUsers = await getDocs(collection(db, "usuarios"));
    let totalUsers = 0;
    let totalVips = 0;
    let totalMerchants = 0;
    let listUsersHtml = '';
    let listMerchantsHtml = '';

    snapUsers.forEach(docSnap => {
      totalUsers++;
      const u = docSnap.data();
      const uid = docSnap.id;
      if (u.vip) totalVips++;
      if (u.funcao === "lojista") totalMerchants++;

      const badgeVipTxt = u.vip ? "👑 VIP" : "👤 Free";
      const btnVipActionText = u.vip ? "Remover VIP" : "Tornar VIP";
      const nextVipState = !u.vip;

      const criadoEmData = u.criadoEm ? new Date(u.criadoEm).toLocaleDateString('pt-BR') : 'Não registrada';
      const expiraDataStr = u.vipExpiraEm ? new Date(u.vipExpiraEm).toLocaleDateString('pt-BR') : (u.vip ? 'Ativo (Ilimitado)' : 'Não assinante');

      listUsersHtml += `
        <div style="background:var(--card); border:1px solid var(--card-border); padding:16px; border-radius:18px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div>
              <div style="font-size:0.95rem; font-weight:900;">${u.nome || 'Usuário'} <span style="font-size:0.75rem; color:var(--muted);">(${u.funcao})</span></div>
              <div style="font-size:0.78rem; color:var(--muted); margin-top:2px;">📧 ${u.email}</div>
            </div>
            <span style="font-weight:800; font-size:0.75rem; padding:4px 10px; border-radius:12px; background:var(--secondary); color:var(--primary);">${badgeVipTxt}</span>
          </div>
          <div style="font-size:0.75rem; background:var(--secondary); padding:10px; border-radius:12px; margin:8px 0; display:flex; flex-direction:column; gap:4px;">
            <div>📅 <strong>Membro Desde:</strong> ${criadoEmData}</div>
            <div>⏳ <strong>Validade VIP:</strong> <span style="color:var(--accent); font-weight:700;">${expiraDataStr}</span></div>
          </div>
          <button class="btn btn-outline btn-small" style="width:100%; margin-top:4px;" onclick="adminAlternarVip('${uid}', ${nextVipState})">${btnVipActionText}</button>
        </div>
      `;

      if (u.funcao === "lojista") {
        listMerchantsHtml += `
          <div style="background:var(--card); border:1px solid var(--card-border); padding:16px; border-radius:18px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <h4 style="font-size:1rem; font-weight:900; color:var(--text);">🏢 ${u.empresaNome || 'Empresa Sem Nome'}</h4>
              <span class="status-badge lojista">PARCEIRO</span>
            </div>
            <p style="font-size:0.78rem; color:var(--muted); margin-bottom:4px;">👤 <strong>Responsável:</strong> ${u.nome || '-'}</p>
            <p style="font-size:0.78rem; color:var(--muted); margin-bottom:4px;">📍 <strong>Endereço:</strong> ${u.empresaEndereco || 'Pelotas / RS'}</p>
            <p style="font-size:0.78rem; color:var(--muted);">📞 <strong>Contato:</strong> ${u.empresaTelefone || 'Não informado'}</p>
          </div>
        `;
      }
    });

    const snapCuponsAll = await getDocs(collection(db, "cupons"));
    let allCuponsHtml = '';
    let totalCuponsAtivos = 0;

    snapCuponsAll.forEach(docSnap => {
      const c = docSnap.data();
      const docId = docSnap.id;
      if (c.ativo) totalCuponsAtivos++;
      const statusText = c.ativo ? "🟢 ATIVA" : "🔴 PAUSADA";
      const btnPausaText = c.ativo ? "Pausar" : "Ativar";

      allCuponsHtml += `
        <div style="background:var(--card); border:1px solid var(--card-border); padding:12px; border-radius:14px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:0.85rem; font-weight:800;">${c.titulo} <span style="color:var(--muted); font-weight:600;">(${c.empresaNome})</span></div>
            <span style="font-size:0.7rem; font-weight:800;">${statusText}</span>
          </div>
          <div style="font-size:0.72rem; color:var(--muted); margin-top:2px;">Prefixo: <strong>${c.codigo || 'PRIME'}</strong> | Ordem: <strong>${c.ordem || 0}</strong></div>
          <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
            <button class="btn btn-outline btn-small" onclick="toggleStatusCupom('${docId}', ${c.ativo})">⏸️ ${btnPausaText}</button>
            <button class="btn btn-outline btn-small" onclick="abrirModalEditarOferta('${docId}', '${encodeURIComponent(c.titulo)}', '${encodeURIComponent(c.descricao)}', '${encodeURIComponent(c.regras || '')}', '${c.categoria}', '${encodeURIComponent(c.descontoBadge || '')}', ${c.valorEconomia || 10}, '${c.codigo || 'PRIME'}', '${encodeURIComponent(c.imagem || '')}', '${c.limite || 'daily'}', ${c.ordem || 0})">✏️ Editar</button>
            <button class="btn btn-outline btn-small" style="color:var(--danger); border-color:#ef444455;" onclick="excluirCupom('${docId}')">🗑️ Excluir</button>
          </div>
        </div>
      `;
    });

    const snapLogs = await getDocs(collection(db, "logs_resgates"));
    let logsHtml = '';
    snapLogs.forEach(logSnap => {
      const l = logSnap.data();
      const statusColor = l.status === "usado" ? "#10b981" : "#f59e0b";
      logsHtml += `
        <div style="background:var(--card); border:1px solid var(--card-border); padding:10px 12px; border-radius:10px; margin-bottom:6px; font-size:0.75rem;">
          <div><strong>${l.usuarioNome || 'Cliente'}</strong> [${l.codigoGerado}] - <span style="color:${statusColor}; font-weight:800;">${(l.status || 'gerado').toUpperCase()}</span></div>
          <div style="color:var(--muted); font-size:0.68rem; margin-top:2px;">${l.cupomTitulo} em <em>${l.empresaNome}</em> • ${new Date(l.dataHora).toLocaleString('pt-BR')}</div>
        </div>
      `;
    });

    document.getElementById('admin-count-users').innerText = totalUsers;
    document.getElementById('admin-count-vips').innerText = totalVips;
    document.getElementById('admin-count-merchants').innerText = totalMerchants;
    document.getElementById('admin-count-offers').innerText = totalCuponsAtivos;

    document.getElementById('admin-all-coupons-list').innerHTML = allCuponsHtml || '<p style="font-size:0.8rem; color:var(--muted);">Nenhum cupom registado.</p>';
    document.getElementById('admin-users-list').innerHTML = listUsersHtml || '<p style="font-size:0.8rem; color:var(--muted);">Nenhum utilizador encontrado.</p>';
    document.getElementById('admin-merchants-list').innerHTML = listMerchantsHtml || '<p style="font-size:0.8rem; color:var(--muted);">Nenhuma empresa parceira registrada.</p>';
    document.getElementById('admin-logs-list').innerHTML = logsHtml || '<p style="font-size:0.8rem; color:var(--muted);">Ainda não há resgates registados.</p>';
  } catch (err) {
    console.error("Erro admin:", err);
  }
}

window.toggleStatusCupom = async function(docId, estadoAtual) {
  try {
    await updateDoc(doc(db, "cupons", docId), { ativo: !estadoAtual });
    mostrarAviso("Sucesso", "Status alterado.", "✅");
    if (window.currentUserData?.funcao === "admin") carregarPainelAdmin();
  } catch (err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

window.excluirCupom = async function(docId) {
  if (confirm("Deseja realmente excluir esta oferta?")) {
    try {
      await deleteDoc(doc(db, "cupons", docId));
      mostrarAviso("Excluído", "Oferta removida.", "🗑️");
      if (window.currentUserData?.funcao === "admin") carregarPainelAdmin();
    } catch (err) {
      mostrarAviso("Erro", err.message, "❌");
    }
  }
};

window.salvarDadosEmpresaLojista = async function() {
  const user = auth.currentUser;
  if (!user) return;
  const novoNome = document.getElementById('merchant-edit-name').value.trim();
  const novoEndereco = document.getElementById('merchant-edit-address').value.trim();
  const novoTelefone = document.getElementById('merchant-edit-phone').value.trim();

  if (!novoNome) return mostrarAviso("Atenção", "Informe o nome da empresa.", "⚠️");

  try {
    await updateDoc(doc(db, "usuarios", user.uid), {
      empresaNome: novoNome,
      empresaEndereco: novoEndereco || 'Pelotas / RS',
      empresaTelefone: novoTelefone || ''
    });

    window.currentUserData.empresaNome = novoNome;
    window.currentUserData.empresaEndereco = novoEndereco;
    window.currentUserData.empresaTelefone = novoTelefone;

    document.getElementById('merchant-store-name').innerText = novoNome;
    mostrarAviso("Sucesso! 🏢", "Informações da empresa salvas com sucesso.", "✅");
  } catch (err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

window.abrirModalCriarOferta = function() {
  document.getElementById('modal-offer-heading').innerText = "➕ Nova Oferta";
  document.getElementById('edit-offer-id').value = "";
  document.getElementById('offer-title').value = "";
  document.getElementById('offer-desc').value = "";
  document.getElementById('offer-rules').value = "";
  document.getElementById('offer-image').value = "";
  document.getElementById('offer-badge').value = "";
  document.getElementById('offer-econ').value = "";
  document.getElementById('offer-code').value = "";
  document.getElementById('offer-limit').value = "daily";

  const boxAdmin = document.getElementById('box-admin-order');
  if (boxAdmin) {
    boxAdmin.style.display = window.currentUserData?.funcao === "admin" ? "block" : "none";
  }

  document.getElementById('modal-add-offer').classList.add('active');
};

window.abrirModalEditarOferta = function(id, titulo, desc, regras, cat, badge, econ, codigo, imagem, limite = 'daily', ordem = 0) {
  document.getElementById('modal-offer-heading').innerText = "✏️ Editar Oferta";
  document.getElementById('edit-offer-id').value = id;
  document.getElementById('offer-title').value = decodeURIComponent(titulo);
  document.getElementById('offer-desc').value = decodeURIComponent(desc);
  document.getElementById('offer-rules').value = decodeURIComponent(regras);
  document.getElementById('offer-image').value = decodeURIComponent(imagem || '');
  document.getElementById('offer-cat').value = cat;
  document.getElementById('offer-badge').value = decodeURIComponent(badge);
  document.getElementById('offer-econ').value = econ;
  document.getElementById('offer-code').value = codigo;
  document.getElementById('offer-limit').value = limite;

  const boxAdmin = document.getElementById('box-admin-order');
  if (boxAdmin) {
    if (window.currentUserData?.funcao === "admin") {
      boxAdmin.style.display = "block";
      document.getElementById('offer-order').value = ordem;
    } else {
      boxAdmin.style.display = "none";
    }
  }

  document.getElementById('modal-add-offer').classList.add('active');
};

window.salvarOfertaGeral = async function() {
  const editId = document.getElementById('edit-offer-id').value;
  const titulo = document.getElementById('offer-title').value;
  const desc = document.getElementById('offer-desc').value;
  const regras = document.getElementById('offer-rules').value;
  const imagem = document.getElementById('offer-image').value;
  const cat = document.getElementById('offer-cat').value;
  const badge = document.getElementById('offer-badge').value || 'OFERTA';
  const econ = parseFloat(document.getElementById('offer-econ').value) || 10.00;
  const codigo = document.getElementById('offer-code').value.toUpperCase().trim() || 'PRIME';
  const limite = document.getElementById('offer-limit').value || 'daily';

  if (!titulo || !desc) return mostrarAviso("Atenção", "Preencha o título e a descrição.", "⚠️");

  const user = auth.currentUser;
  if (!user) return mostrarAviso("Erro", "Não autenticado.", "❌");

  try {
    const dadosCupom = {
      titulo: titulo,
      descricao: desc,
      regras: regras || 'Sem restrições',
      imagem: imagem || '',
      categoria: cat,
      descontoBadge: badge,
      valorEconomia: econ,
      codigo: codigo,
      limite: limite
    };

    if (window.currentUserData?.funcao === "admin") {
      const ordemInput = document.getElementById('offer-order');
      if (ordemInput) dadosCupom.ordem = parseInt(ordemInput.value) || 0;
    }

    if (editId) {
      await updateDoc(doc(db, "cupons", editId), dadosCupom);
      mostrarAviso("Atualizado! 🚀", "Oferta modificada com sucesso.", "✅");
    } else {
      dadosCupom.empresaId = user.uid;
      dadosCupom.empresaNome = window.currentUserData?.empresaNome || 'Parceiro Local Pelotas';
      dadosCupom.endereco = window.currentUserData?.empresaEndereco || 'Pelotas / RS';
      dadosCupom.telefone = window.currentUserData?.empresaTelefone || '';
      dadosCupom.ativo = true;
      dadosCupom.cliquesCount = 0;
      dadosCupom.criadoEm = new Date().toISOString();
      dadosCupom.ordem = 0;
      await addDoc(collection(db, "cupons"), dadosCupom);
      mostrarAviso("Publicado! 🎉", "Promoção ativa na vitrine.", "✅");
    }

    fecharModal('modal-add-offer');
    if (window.currentUserData?.funcao === "admin") carregarPainelAdmin();
  } catch (err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

window.adminAlternarVip = async function(userId, novoEstado) {
  try {
    const expiraEm = novoEstado ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
    await updateDoc(doc(db, "usuarios", userId), { vip: novoEstado, vipExpiraEm: expiraEm });
    mostrarAviso("Atualizado!", "Status VIP alterado.", "👑");
    carregarPainelAdmin();
  } catch (err) { mostrarAviso("Erro", err.message, "❌"); }
};

window.validarCupomTextoLojista = async function() {
  const codigoDigitado = document.getElementById('input-validar-codigo').value.trim().toUpperCase();
  if (!codigoDigitado) return mostrarAviso("Atenção", "Digite o código único do cliente.", "⚠️");

  const user = auth.currentUser;
  if (!user) return mostrarAviso("Erro", "Sessão expirada.", "❌");

  try {
    const qCode = query(
      collection(db, "logs_resgates"),
      where("codigoGerado", "==", codigoDigitado),
      where("empresaId", "==", user.uid)
    );
    const snapCode = await getDocs(qCode);

    if (snapCode.empty) {
      return mostrarAviso("Código Inválido ❌", `O código "${codigoDigitado}" não foi encontrado para a sua loja.`, "⚠️");
    }

    let cupomDocRef = null;
    let cupomData = null;

    snapCode.forEach(docSnap => {
      cupomDocRef = doc(db, "logs_resgates", docSnap.id);
      cupomData = docSnap.data();
    });

    if (cupomData.status === "usado") {
      return mostrarAviso("CUPOM JÁ UTILIZADO 🚫", `O código "${codigoDigitado}" já foi validado em ${new Date(cupomData.dataValidacao).toLocaleString('pt-BR')}.`, "❌");
    }

    await updateDoc(cupomDocRef, {
      status: "usado",
      dataValidacao: new Date().toISOString()
    });

    dispararConfetes();
    mostrarAviso("✅ DESCONTO APLICADO!", `O cupom "${codigoDigitado}" foi validado e marcado como UTILIZADO!`, "🎉");
    document.getElementById('input-validar-codigo').value = '';
    carregarEstatisticasLojista(user.uid);
  } catch (err) {
    mostrarAviso("Erro na validação", err.message, "❌");
  }
};

window.toggleTheme = function() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('clube_theme', next);
  document.querySelector('.theme-toggle-btn').innerText = next === 'dark' ? '☀️' : '🌙';
};

window.dispararConfetes = function() {
  if (typeof confetti === 'function') confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
};

window.atualizarCarteiraUI = function() {
  const el = document.getElementById('wallet-economy');
  if (el) el.innerText = `R$ ${economiaTotal.toFixed(2).replace('.', ',')}`;
};

window.toggleMerchantFields = function(checked) {
  document.getElementById('merchant-fields').style.display = checked ? 'block' : 'none';
};

window.mostrarAviso = function(titulo, mensagem, icone = "⚡") {
  document.getElementById('alert-icon').innerText = icone;
  document.getElementById('alert-title').innerText = titulo;
  document.getElementById('alert-msg').innerText = mensagem;
  document.getElementById('modal-alert').classList.add('active');
};

window.fecharModal = function(modalId) {
  document.getElementById(modalId).classList.remove('active');
  if (modalId === 'modal-pix') pararChecagemAutomatica();
};

function iniciarChecagemAutomatica() {
  pararChecagemAutomatica();
  intervalPixCheck = setInterval(() => { checarPixSilencioso(); }, 5000);
}

function pararChecagemAutomatica() {
  if (intervalPixCheck) { clearInterval(intervalPixCheck); intervalPixCheck = null; }
}

async function checarPixSilencioso() {
  const user = auth.currentUser;
  if (!user || !user.email) return;
  try {
    const response = await fetch(`https://webhook-clubprime.vercel.app/api/checar-pix?email=${encodeURIComponent(user.email)}&userId=${user.uid}`);
    const data = await response.json();
    if (data.success && data.vip) {
      pararChecagemAutomatica();
      fecharModal('modal-pix');
      dispararConfetes();
      mostrarAviso("VIP Ativado! 🎉", data.message, "👑");
      window.isVipUser = true;
      document.querySelectorAll('.status-badge').forEach(b => { b.innerText = "ASSINANTE VIP"; b.className = "status-badge vip"; });
      document.getElementById('banner-assinatura').style.display = 'none';
      document.getElementById('profile-vip-card').style.display = 'block';
    }
  } catch (err) {}
}

window.switchAuthTab = function(type) {
  currentAuthTab = type;
  document.getElementById('tab-login').classList.toggle('active', type === 'login');
  document.getElementById('tab-signup').classList.toggle('active', type === 'signup');
  document.getElementById('group-name').style.display = type === 'signup' ? 'block' : 'none';
  document.getElementById('box-merchant-options').style.display = type === 'signup' ? 'block' : 'none';
  document.getElementById('box-esqueci').style.display = type === 'login' ? 'block' : 'none';
  document.getElementById('btn-auth-submit').innerText = type === 'login' ? 'Entrar na Conta' : 'Criar Conta';
};

window.navTo = function(screenId, btn) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + screenId).classList.add('active');
  if (btn) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
};

window.filterCat = function(cat, btn) {
  document.querySelectorAll('.category-pill').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
  const cards = document.querySelectorAll('.company-card');
  cards.forEach(card => {
    if (cat === 'all') card.style.display = 'block';
    else card.style.display = card.dataset.cat === cat ? 'block' : 'none';
  });
};

window.filterStores = function(term) {
  term = term.toLowerCase();
  const cards = document.querySelectorAll('.company-card');
  cards.forEach(card => {
    const name = card.dataset.name || '';
    card.style.display = name.includes(term) ? 'block' : 'none';
  });
};

window.fazerLoginGoogle = async function() {
  try { await signInWithPopup(auth, googleProvider); } catch (err) { mostrarAviso("Erro", err.message, "❌"); }
};

window.executarAuth = async function() {
  if (currentAuthTab === 'signup') {
    const nome = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const isMerchant = document.getElementById('chk-is-merchant').checked;
    const storeName = document.getElementById('reg-store-name')?.value;
    const storeAddress = document.getElementById('reg-store-address')?.value || 'Pelotas / RS';
    const storePhone = document.getElementById('reg-store-phone')?.value || '';
    const storeCode = document.getElementById('reg-store-code')?.value;

    if (!email || !pass || !nome) return mostrarAviso("Atenção", "Preencha todos os campos.", "⚠️");
    let userRole = "cliente";
    if (isMerchant) {
      if (storeCode !== CODIGO_SECRETO_LOJISTA) return mostrarAviso("Erro", "Código de parceiro incorreto.", "❌");
      if (!storeName) return mostrarAviso("Atenção", "Informe o nome da empresa.", "⚠️");
      userRole = "lojista";
    }

    try {
      const res = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
      const userData = {
        nome: nome,
        email: email.trim().toLowerCase(),
        funcao: userRole,
        vip: false,
        criadoEm: new Date().toISOString()
      };

      if (isMerchant) {
        userData.empresaNome = storeName;
        userData.empresaEndereco = storeAddress;
        userData.empresaTelefone = storePhone;
      }

      await setDoc(doc(db, "usuarios", res.user.uid), userData);
      mostrarAviso("Sucesso! 🎉", "Conta criada com sucesso!", "🎉");
    } catch (err) { mostrarAviso("Erro", err.message, "❌"); }
  } else {
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    if (!email || !pass) return mostrarAviso("Atenção", "Preencha e-mail e senha.", "⚠️");
    try { await signInWithEmailAndPassword(auth, email, pass); } catch (err) { mostrarAviso("Erro", err.message, "❌"); }
  }
};

window.recuperarSenha = async function() {
  const email = document.getElementById('reg-email').value;
  if (!email || !email.includes('@')) return mostrarAviso("Atenção", "Digite seu e-mail.", "✉️");
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    mostrarAviso("Enviado!", "Verifique seu e-mail.", "📧");
  } catch (err) { mostrarAviso("Erro", err.message, "❌"); }
};

window.deslogar = async function() {
  pararChecagemAutomatica();
  if (auth.currentUser) await signOut(auth);
};

window.gerarPixMercadoPago = async function() {
  const user = auth.currentUser;
  const emailPix = user ? user.email : "teste@clubprime.com";
  const btn = document.getElementById('btn-gerar-pix');
  if (btn) { btn.innerHTML = `<span class="spinner"></span> Gerando Pix...`; btn.style.opacity = "0.7"; btn.style.pointerEvents = "none"; }
  try {
    const response = await fetch('https://webhook-clubprime.vercel.app/api/criar-pix', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailPix.toLowerCase(), nome: window.currentUserData?.nome || 'Membro' })
    });
    const data = await response.json();
    if (data.success && data.qrCodeBase64) {
      document.getElementById('pix-qr-img').src = data.qrCodeBase64;
      pixCopiaColaAtual = data.qrCodeCopiaCola;
      fecharModal('modal-coupon');
      document.getElementById('modal-pix').classList.add('active');
      iniciarChecagemAutomatica();
    } else { mostrarAviso("Erro", data.error || "Não foi possível gerar o Pix.", "❌"); }
  } catch (err) { mostrarAviso("Erro", err.message, "❌"); }
  finally { if (btn) { btn.innerHTML = `⚡ Ativar VIP por R$ 19,90 via PIX`; btn.style.opacity = "1"; btn.style.pointerEvents = "auto"; } }
};

window.copiarPixCode = function() {
  if (!pixCopiaColaAtual) return;
  navigator.clipboard.writeText(pixCopiaColaAtual);
  mostrarAviso("Copiado!", "Código Pix Copia e Cola copiado.", "📋");
};

window.verificarStatusVipManual = async function() {
  const user = auth.currentUser;
  if (!user || !user.email) return mostrarAviso("Atenção", "Faça login.", "⚠️");
  const btn = document.getElementById('btn-checar-vip');
  btn.innerHTML = `<span class="spinner"></span> Verificando...`;
  try {
    const response = await fetch(`https://webhook-clubprime.vercel.app/api/checar-pix?email=${encodeURIComponent(user.email)}&userId=${user.uid}`);
    const data = await response.json();
    if (data.success && data.vip) {
      pararChecagemAutomatica();
      fecharModal('modal-pix');
      dispararConfetes();
      mostrarAviso("VIP Ativado! 🎉", data.message, "👑");
    } else { mostrarAviso("Aguardando ⏳", data.message || "Pagamento não compensado.", "ℹ️"); }
  } catch (err) { mostrarAviso("Erro", err.message, "❌"); }
  finally { btn.innerHTML = `🔄 Já Paguei / Checar Agora`; }
};

window.resgatarCupomReal = async function(cupomId, empresaId, empresaNome, titulo, prefixo, valorEconomia = 10.00, endereco = 'Pelotas / RS', telefone = '', regras = '') {
  document.getElementById('modal-title').innerText = titulo;
  document.getElementById('modal-disc').innerText = empresaNome;
  document.getElementById('modal-address').innerText = endereco || 'Pelotas / RS';
  document.getElementById('modal-phone').innerText = telefone || 'Não informado';
  document.getElementById('modal-rules').innerText = regras || 'Sem restrições';

  if (window.isVipUser) {
    document.getElementById('box-blocked').style.display = 'none';
    document.getElementById('box-unlocked').style.display = 'block';

    const sufixoAleatorio = Math.random().toString(36).substring(2, 6).toUpperCase();
    const prefixoLimpo = (prefixo || 'PRIME').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const codigoUnico = `${prefixoLimpo}-${sufixoAleatorio}`;

    codigoCupomAtual = codigoUnico;
    document.getElementById('modal-code').innerText = codigoUnico;

    economiaTotal += valorEconomia;
    localStorage.setItem('clube_econ', economiaTotal.toFixed(2));
    atualizarCarteiraUI();

    try {
      await addDoc(collection(db, "logs_resgates"), {
        usuarioUid: auth.currentUser?.uid || 'anonimo',
        usuarioEmail: auth.currentUser?.email || 'desconhecido',
        usuarioNome: window.currentUserData?.nome || 'Membro VIP',
        cupomId: cupomId,
        cupomTitulo: titulo,
        empresaId: empresaId,
        empresaNome: empresaNome,
        codigoGerado: codigoUnico,
        status: "gerado",
        dataHora: new Date().toISOString()
      });
    } catch(e) {}
  } else {
    document.getElementById('box-blocked').style.display = 'block';
    document.getElementById('box-unlocked').style.display = 'none';
  }

  document.getElementById('modal-coupon').classList.add('active');
};

window.copiarCodigoCupom = function() {
  if (!codigoCupomAtual) return;
  navigator.clipboard.writeText(codigoCupomAtual);
  mostrarAviso("Copiado!", "Código único copiado!", "📋");
};