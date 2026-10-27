import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
let favoritos = JSON.parse(localStorage.getItem('clube_favs') || '[]');
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
  atualizarFavoritosUI();
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
        document.getElementById('merchant-store-name').innerText = data.empresaNome || "Empresa Parceira";
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

function carregarCuponsVitrine() {
  const q = query(collection(db, "cupons"), where("ativo", "==", true));
  unsubscribeCupons = onSnapshot(q, (snapshot) => {
    const container = document.getElementById('stores-list-dynamic');
    if (!container) return;
    
    let html = '';
    snapshot.forEach((docSnap) => {
      const cupom = docSnap.data();
      const docId = docSnap.id;

      html += `
        <div class="company-card" data-cat="${cupom.categoria}" data-name="${cupom.titulo.toLowerCase()} ${cupom.empresaNome.toLowerCase()}" data-id="${docId}">
          <div class="favorite-btn" onclick="toggleFavorite('${docId}', this)">🤍</div>
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
          <p style="font-size:0.8rem; color:var(--muted); margin-bottom:14px;">${cupom.descricao}</p>
          <button class="btn btn-cyan" onclick="resgatarCupomReal('${cupom.empresaNome}', '${cupom.titulo}', '${cupom.codigo}', ${cupom.valorEconomia || 10.00}, '${cupom.endereco || ''}', '${cupom.telefone || ''}', '${cupom.regras || ''}')">
            🎟️ Resgatar Cupom
          </button>
        </div>
      `;
    });

    if (html !== '') {
      container.innerHTML = html;
      atualizarFavoritosUI();
    }
  });
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

      html += `
        <div style="background:var(--card); border:1px solid var(--card-border); padding:14px; border-radius:16px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4 style="font-size:0.9rem; font-weight:800;">${cupom.titulo}</h4>
            <span style="font-size:0.7rem; font-weight:800;">${statusText}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--muted); margin:4px 0;">Código: <strong>${cupom.codigo}</strong> | Economia: R$ ${cupom.valorEconomia}</p>
          <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="btn btn-outline btn-small" onclick="toggleStatusCupomLojista('${docId}', ${cupom.ativo})">⏸️ ${btnPausaText}</button>
            <button class="btn btn-outline btn-small" style="color:var(--danger); border-color:#ef444455;" onclick="excluirCupomLojista('${docId}')">🗑️ Excluir</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  });
}

window.toggleStatusCupomLojista = async function(docId, estadoAtual) {
  try {
    await updateDoc(doc(db, "cupons", docId), { ativo: !estadoAtual });
  } catch (err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

window.excluirCupomLojista = async function(docId) {
  if (confirm("Deseja realmente excluir esta oferta definitivamente?")) {
    try {
      await deleteDoc(doc(db, "cupons", docId));
      mostrarAviso("Excluído", "A oferta foi removida da plataforma.", "🗑️");
    } catch (err) {
      mostrarAviso("Erro ao excluir", err.message, "❌");
    }
  }
};

async function carregarPainelAdmin() {
  try {
    const snapUsers = await getDocs(collection(db, "usuarios"));
    let totalUsers = 0;
    let totalVips = 0;
    let totalMerchants = 0;
    let listMerchantsHtml = '';

    snapUsers.forEach(docSnap => {
      totalUsers++;
      const u = docSnap.data();
      if (u.vip) totalVips++;
      if (u.funcao === "lojista") {
        totalMerchants++;
        listMerchantsHtml += `
          <div style="background:var(--card); border:1px solid var(--card-border); padding:10px 14px; border-radius:12px; margin-bottom:6px; font-size:0.8rem;">
            <strong>${u.empresaNome || 'Sem Nome'}</strong> (${u.email})
          </div>
        `;
      }
    });

    const snapCupons = await getDocs(query(collection(db, "cupons"), where("ativo", "==", true)));

    document.getElementById('admin-count-users').innerText = totalUsers;
    document.getElementById('admin-count-vips').innerText = totalVips;
    document.getElementById('admin-count-merchants').innerText = totalMerchants;
    document.getElementById('admin-count-offers').innerText = snapCupons.size;

    document.getElementById('admin-merchants-list').innerHTML = listMerchantsHtml || '<p style="font-size:0.8rem; color:var(--muted);">Nenhum parceiro cadastrado.</p>';
  } catch (err) {
    console.error("Erro admin:", err);
  }
}

window.publicarNovaOfertaLojista = async function() {
  const titulo = document.getElementById('offer-title').value;
  const desc = document.getElementById('offer-desc').value;
  const endereco = document.getElementById('offer-address').value;
  const telefone = document.getElementById('offer-phone').value;
  const regras = document.getElementById('offer-rules').value;
  const cat = document.getElementById('offer-cat').value;
  const badge = document.getElementById('offer-badge').value || 'OFERTA';
  const econ = parseFloat(document.getElementById('offer-econ').value) || 10.00;
  const codigo = document.getElementById('offer-code').value || 'PRIME10';

  if (!titulo || !desc) return mostrarAviso("Atenção", "Preencha o título e a descrição da oferta.", "⚠️");

  const user = auth.currentUser;
  if (!user) return mostrarAviso("Erro", "Usuário não autenticado.", "❌");

  try {
    await addDoc(collection(db, "cupons"), {
      empresaId: user.uid,
      empresaNome: window.currentUserData?.empresaNome || 'Parceiro Local Pelotas',
      titulo: titulo,
      descricao: desc,
      endereco: endereco || 'Pelotas / RS',
      telefone: telefone || '',
      regras: regras || 'Sem restrições',
      categoria: cat,
      descontoBadge: badge,
      valorEconomia: econ,
      codigo: codigo,
      ativo: true,
      criadoEm: new Date().toISOString()
    });

    mostrarAviso("Oferta Publicada! 🎉", "A sua promoção já está visível na vitrine de Pelotas.", "✅");
    fecharModal('modal-add-offer');
    
    document.getElementById('offer-title').value = '';
    document.getElementById('offer-desc').value = '';
    document.getElementById('offer-address').value = '';
    document.getElementById('offer-phone').value = '';
    document.getElementById('offer-rules').value = '';
    document.getElementById('offer-badge').value = '';
    document.getElementById('offer-econ').value = '';
    document.getElementById('offer-code').value = '';
  } catch (err) {
    mostrarAviso("Erro ao Publicar", err.message, "❌");
  }
};

window.validarCupomTextoLojista = function() {
  const codigoDigitado = document.getElementById('input-validar-codigo').value.trim();
  if (!codigoDigitado) {
    return mostrarAviso("Atenção", "Digite o código informado pelo cliente.", "⚠️");
  }

  dispararConfetes();
  mostrarAviso("✅ CUPOM VALIDADO!", `O código "${codigoDigitado.toUpperCase()}" foi conferido com sucesso!`, "🎉");
  document.getElementById('input-validar-codigo').value = '';
};

window.toggleTheme = function() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('clube_theme', next);
  document.querySelector('.theme-toggle-btn').innerText = next === 'dark' ? '☀️' : '🌙';
};

window.dispararConfetes = function() {
  if (typeof confetti === 'function') {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
  }
};

window.atualizarCarteiraUI = function() {
  const el = document.getElementById('wallet-economy');
  if (el) el.innerText = `R$ ${economiaTotal.toFixed(2).replace('.', ',')}`;
};

window.toggleFavorite = function(id, btn) {
  const index = favoritos.indexOf(id);
  if (index > -1) {
    favoritos.splice(index, 1);
    btn.innerText = '🤍';
  } else {
    favoritos.push(id);
    btn.innerText = '❤️';
  }
  localStorage.setItem('clube_favs', JSON.stringify(favoritos));
};

window.atualizarFavoritosUI = function() {
  document.querySelectorAll('.company-card').forEach(card => {
    const id = card.dataset.id;
    const btn = card.querySelector('.favorite-btn');
    if (btn && favoritos.includes(id)) {
      btn.innerText = '❤️';
    }
  });
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
  if (modalId === 'modal-pix') {
    pararChecagemAutomatica();
  }
};

function iniciarChecagemAutomatica() {
  pararChecagemAutomatica();
  intervalPixCheck = setInterval(() => {
    checarPixSilencioso();
  }, 5000);
}

function pararChecagemAutomatica() {
  if (intervalPixCheck) {
    clearInterval(intervalPixCheck);
    intervalPixCheck = null;
  }
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
      document.querySelectorAll('.status-badge').forEach(b => {
        b.innerText = "ASSINANTE VIP";
        b.className = "status-badge vip";
      });
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
    if (cat === 'all') {
      card.style.display = 'block';
    } else if (cat === 'favoritos') {
      card.style.display = favoritos.includes(card.dataset.id) ? 'block' : 'none';
    } else {
      card.style.display = card.dataset.cat === cat ? 'block' : 'none';
    }
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
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    mostrarAviso("Erro no Google", err.message, "❌");
  }
};

window.executarAuth = async function() {
  if (currentAuthTab === 'signup') {
    const nome = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const isMerchant = document.getElementById('chk-is-merchant').checked;
    const storeName = document.getElementById('reg-store-name').value;
    const storeCode = document.getElementById('reg-store-code').value;

    if (!email || !pass || !nome) return mostrarAviso("Campos Incompletos", "Preencha todos os campos para se cadastrar.", "⚠️");

    let userRole = "cliente";
    if (isMerchant) {
      if (storeCode !== CODIGO_SECRETO_LOJISTA) {
        return mostrarAviso("Código Inválido", "O código de ativação de parceiro está incorreto.", "❌");
      }
      if (!storeName) {
        return mostrarAviso("Nome da Empresa", "Informe o nome da sua empresa.", "⚠️");
      }
      userRole = "lojista";
    }

    try {
      const res = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
      await setDoc(doc(db, "usuarios", res.user.uid), {
        nome: nome,
        email: email.trim().toLowerCase(),
        funcao: userRole,
        empresaNome: isMerchant ? storeName : null,
        vip: false,
        criadoEm: new Date().toISOString()
      });

      mostrarAviso("Sucesso! 🎉", isMerchant ? "Sua conta de Lojista foi criada!" : "Sua conta foi criada!", "🎉");
    } catch (err) {
      mostrarAviso("Erro no Cadastro", err.message, "❌");
    }
  } else {
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;

    if (!email || !pass) return mostrarAviso("Atenção", "Preencha e-mail e senha para entrar!", "⚠️");

    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      mostrarAviso("Erro ao Entrar", err.message, "❌");
    }
  }
};

window.recuperarSenha = async function() {
  const email = document.getElementById('reg-email').value;
  if (!email || !email.includes('@')) {
    return mostrarAviso("E-mail Necessário", "Digite seu e-mail para enviarmos o link.", "✉️");
  }

  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    mostrarAviso("E-mail Enviado!", "Verifique a caixa de entrada.", "📧");
  } catch (err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

window.deslogar = async function() {
  pararChecagemAutomatica();
  if (auth.currentUser) {
    await signOut(auth);
  }
};

window.gerarPixMercadoPago = async function() {
  const user = auth.currentUser;
  const emailPix = user ? user.email : "teste@clubprime.com";

  const btn = document.getElementById('btn-gerar-pix');
  if (btn) {
    btn.innerHTML = `<span class="spinner"></span> Gerando Pix...`;
    btn.style.opacity = "0.7";
    btn.style.pointerEvents = "none";
  }

  try {
    const response = await fetch('https://webhook-clubprime.vercel.app/api/criar-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailPix.toLowerCase(),
        nome: window.currentUserData?.nome || 'Membro PRIME'
      })
    });

    const data = await response.json();

    if (data.success && data.qrCodeBase64) {
      document.getElementById('pix-qr-img').src = data.qrCodeBase64;
      pixCopiaColaAtual = data.qrCodeCopiaCola;
      fecharModal('modal-coupon');
      document.getElementById('modal-pix').classList.add('active');

      iniciarChecagemAutomatica();
    } else {
      mostrarAviso("Erro", data.error || "Não foi possível gerar o Pix.", "❌");
    }
  } catch (err) {
    mostrarAviso("Erro de Conexão", err.message, "❌");
  } finally {
    if (btn) {
      btn.innerHTML = `⚡ Ativar VIP por R$ 19,90 via PIX`;
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    }
  }
};

window.copiarPixCode = function() {
  if (!pixCopiaColaAtual) return;
  navigator.clipboard.writeText(pixCopiaColaAtual);
  mostrarAviso("Copiado!", "Código Pix Copia e Cola copiado.", "📋");
};

window.verificarStatusVipManual = async function() {
  const user = auth.currentUser;
  if (!user || !user.email) return mostrarAviso("Atenção", "Faça login para verificar.", "⚠️");

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
    } else {
      mostrarAviso("Aguardando Pagamento ⏳", data.message || "Pagamento ainda não compensado.", "ℹ️");
    }
  } catch (err) {
    mostrarAviso("Erro de Conexão", err.message, "❌");
  } finally {
    btn.innerHTML = `🔄 Já Paguei / Checar Agora`;
  }
};

window.resgatarCupomReal = function(titulo, desconto, codigo, valorEconomia = 10.00, endereco = '', telefone = '', regras = '') {
  document.getElementById('modal-title').innerText = titulo;
  document.getElementById('modal-disc').innerText = desconto;
  document.getElementById('modal-address').innerText = endereco || 'Pelotas / RS';
  document.getElementById('modal-phone').innerText = telefone || 'Não informado';
  document.getElementById('modal-rules').innerText = regras || 'Sem restrições adicionais';
  codigoCupomAtual = codigo;

  if (window.isVipUser) {
    document.getElementById('box-blocked').style.display = 'none';
    document.getElementById('box-unlocked').style.display = 'block';
    document.getElementById('modal-code').innerText = codigo;

    economiaTotal += valorEconomia;
    localStorage.setItem('clube_econ', economiaTotal.toFixed(2));
    atualizarCarteiraUI();
  } else {
    document.getElementById('box-blocked').style.display = 'block';
    document.getElementById('box-unlocked').style.display = 'none';
  }

  document.getElementById('modal-coupon').classList.add('active');
};

window.copiarCodigoCupom = function() {
  if (!codigoCupomAtual) return;
  navigator.clipboard.writeText(codigoCupomAtual);
  mostrarAviso("Copiado!", "Código promocional copiado!", "📋");
};

window.abrirModalCriarOferta = function() {
  document.getElementById('modal-add-offer').classList.add('active');
};