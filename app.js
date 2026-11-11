// Registo do Service Worker para permitir a instalação como App PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('Service Worker registado com sucesso:', reg.scope);
      })
      .catch((err) => {
        console.log('Falha ao registar o Service Worker:', err);
      });
  });
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, updatePassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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

const CODIGOS_SECRETOS_LOJISTA = [
  "PRIME.PARCEIRO20",
  "PARCEIRO.PELOTAS",
  "CLUBE.LOJA2026",
  "PRIME.VIP2026"
];

let pixCopiaColaAtual = "";
let codigoCupomAtual = "";
let currentAuthTab = "login";
let intervalPixCheck = null;
let html5QrCodeScanner = null;

let unsubscribeUser = null;
let unsubscribeCupons = null;
let unsubscribeMerchantCupons = null;

let cachePagamentosPix = [];
let cacheTodosUsuarios = [];
let cacheLogsClientePerfil = [];

const PRECO_VIP = 19.90;
let pixChecadoParaUid = null;
let pixPollingInicio = 0;

// Variáveis temporárias para validação com cálculo de desconto
let cupomEmValidacao = null;
let valorServicoCalculado = 0;
let valorDescontoCalculado = 0;
let valorFinalCalculado = 0;
let descontoPctCalculado = 0;

// DETECÇÃO DE MODO OFFLINE / ONLINE
function checarStatusConexao() {
  const offlineScreen = document.getElementById('offline-screen');
  if (offlineScreen) {
    if (!navigator.onLine) {
      offlineScreen.style.display = 'flex';
    } else {
      offlineScreen.style.display = 'none';
    }
  }
}

window.addEventListener('online', checarStatusConexao);
window.addEventListener('offline', checarStatusConexao);

document.addEventListener('DOMContentLoaded', () => {
  checarStatusConexao();

  const savedTheme = localStorage.getItem('clube_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeBtn = document.querySelector('.theme-toggle-btn');
  if (themeBtn) {
    const icones = { light: '🌙', dark: '🌿', emerald: '🔮', purple: '🌅', sunset: '🌌', midnight: '☀️' };
    themeBtn.innerText = icones[savedTheme] || '🌙';
  }
  escutarBannerGlobal();
  escutarBannerLojista();
  escutarLeilaoPatrocinado();
});

function resetarEstadoUI() {
  window.currentUserData = null;
  window.isVipUser = false;
  window._vipAnterior = undefined;
  window._vipExpiraAnterior = null;
  pixChecadoParaUid = null;
  pararChecagemAutomatica();
  
  if (unsubscribeUser) { unsubscribeUser(); unsubscribeUser = null; }
  if (unsubscribeCupons) { unsubscribeCupons(); unsubscribeCupons = null; }
  if (unsubscribeMerchantCupons) { unsubscribeMerchantCupons(); unsubscribeMerchantCupons = null; }
  
  const boxVoltar = document.getElementById('box-voltar-admin');
  if (boxVoltar) boxVoltar.style.display = 'none';

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
}

function celebrarVip(msg) {
  if (Date.now() - (window._ultimaCelebracaoVip || 0) < 15000) return;
  window._ultimaCelebracaoVip = Date.now();
  fecharModal('modal-pix');
  dispararConfetes();
  mostrarAviso("VIP Ativado! 🎉", msg || "Seu acesso VIP foi liberado.", "👑");
}

onAuthStateChanged(auth, async (user) => {
  resetarEstadoUI();

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
          whatsapp: "",
          fotoUrl: user.photoURL || null,
          funcao: "cliente",
          vip: false,
          vipExpiraEm: null,
          criadoEm: new Date().toISOString()
        };
        await setDoc(userDocRef, data);
      }

      window.currentUserData = data;
      
      if (data.funcao === "lojista" && data.ativo === false) {
        document.getElementById('modal-empresa-desativada').classList.add('active');
      }

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
        const instagramEmpresa = data.empresaInstagram || "";

        document.getElementById('merchant-store-name').innerText = nomeEmpresa;
        if (document.getElementById('merchant-edit-name')) document.getElementById('merchant-edit-name').value = nomeEmpresa;
        if (document.getElementById('merchant-edit-address')) document.getElementById('merchant-edit-address').value = enderecoEmpresa;
        if (document.getElementById('merchant-edit-phone')) document.getElementById('merchant-edit-phone').value = telefoneEmpresa;
        if (document.getElementById('merchant-edit-instagram')) document.getElementById('merchant-edit-instagram').value = instagramEmpresa;

        carregarEstatisticasLojista(user.uid);
        carregarCuponsDoLojista(user.uid);
        carregarLogsDoLojista(user.uid);
        return;
      }

      // Checa pagamento pendente só uma vez por login e só se ainda não é VIP (antes isso gerava um loop com o onSnapshot)
      if (!data.vip && pixChecadoParaUid !== user.uid) {
        pixChecadoParaUid = user.uid;
        fetch(`https://webhook-clubprime.vercel.app/api/checar-pix?email=${encodeURIComponent(user.email)}&userId=${user.uid}`)
          .catch((err) => console.error('Checagem de Pix:', err));
      }

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
      
      const whatsappEl = document.getElementById('profile-whatsapp');
      if (whatsappEl) {
        whatsappEl.innerText = data.whatsapp ? `📱 WhatsApp: ${data.whatsapp}` : "📱 WhatsApp: Não cadastrado";
      }

      const avatarImg = document.getElementById('profile-avatar');
      const fotoFinal = user.photoURL || data.fotoUrl;
      if (fotoFinal) {
        avatarImg.src = fotoFinal;
      } else {
        avatarImg.src = "https://ui-avatars.com/api/?name=" + encodeURIComponent(data.nome || user.displayName || 'User') + "&background=2563eb&color=fff";
      }

      const dataCriado = data.criadoEm ? new Date(data.criadoEm).toLocaleDateString('pt-BR') : 'Hoje';
      document.getElementById('profile-joined-date').innerText = dataCriado;

      calcularEconomiaNivelUsuario(user.uid);
      carregarHistoricoClientePerfil(user.uid);

      const vipExpiringAlert = document.getElementById('vip-expiring-alert');

      if (data.vip) {
        window.isVipUser = true;
        document.querySelectorAll('.status-badge').forEach(b => {
          b.innerText = "ASSINANTE VIP";
          b.className = "status-badge vip";
        });
        document.getElementById('banner-assinatura').style.display = 'none';
        document.getElementById('profile-vip-card').style.display = 'block';
        
        if (data.vipExpiraEm) {
          const expiraDate = new Date(data.vipExpiraEm);
          const expiraStr = expiraDate.toLocaleDateString('pt-BR');
          document.getElementById('profile-vip-expira').innerText = expiraStr;

          const diffTime = expiraDate - new Date();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const countdownEl = document.getElementById('profile-vip-countdown');
          const renewBox = document.getElementById('box-renew-vip');

          if (diffDays > 0) {
            countdownEl.innerText = `Faltam ${diffDays} dia(s) para vencer.`;
          } else {
            countdownEl.innerText = `Expira hoje!`;
          }

          if (diffDays <= 3 && diffDays >= 1) {
            if (vipExpiringAlert) {
              document.getElementById('vip-expiring-msg').innerText = `Seu VIP vence em ${diffDays} dia(s)! Renove agora e garanta seus descontos.`;
              vipExpiringAlert.style.display = 'block';
            }
          } else {
            if (vipExpiringAlert) vipExpiringAlert.style.display = 'none';
          }

          if (diffDays <= 5 && diffDays >= 0) {
            if (renewBox) renewBox.style.display = 'block';
          } else {
            if (renewBox) renewBox.style.display = 'none';
          }
        }

        const virouVip = window._vipAnterior === false;
        const renovou = window._vipAnterior === true && window._vipExpiraAnterior && data.vipExpiraEm
          && new Date(data.vipExpiraEm) > new Date(window._vipExpiraAnterior);
        if (virouVip || renovou) celebrarVip("Pagamento confirmado! Seu acesso VIP está ativo.");
        window._vipAnterior = true;
        window._vipExpiraAnterior = data.vipExpiraEm || null;
      } else {
        window.isVipUser = false;
        window._vipAnterior = false;
        window._vipExpiraAnterior = null;
        if (vipExpiringAlert) vipExpiringAlert.style.display = 'none';
        document.querySelectorAll('.status-badge').forEach(b => {
          b.innerText = "PLANO GRATUITO";
          b.className = "status-badge free";
        });
        document.getElementById('banner-assinatura').style.display = 'block';
        document.getElementById('profile-vip-card').style.display = 'none';
      }
    });

    carregarCuponsVitrine();
    carregarParceirosCliente();

    document.getElementById('screen-auth').classList.remove('active');
    document.getElementById('screen-home').classList.add('active');
    document.querySelector('.bottom-nav').style.display = 'flex';
  } else {
    document.getElementById('screen-auth').classList.add('active');
    document.querySelector('.bottom-nav').style.display = 'none';
  }
});

// FUNÇÃO DE GEOLOCALIZAÇÃO / GPS PARA EMPRESAS PRÓXIMAS
window.ativarBuscaProximidadeGps = function() {
  if (!navigator.geolocation) {
    return mostrarAviso("GPS Indisponível", "Seu navegador não suporta geolocalização.", "⚠️");
  }

  mostrarAviso("Localizando...", "Buscando parceiros próximos de você...", "📍");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latUsuario = position.coords.latitude;
      const lonUsuario = position.coords.longitude;
      fecharModal('modal-alert');
      mostrarAviso("GPS Ativo! 🎯", "Filtro por proximidade ativado com sucesso.", "✅");
      // Aqui as empresas podem ser ordenadas por proximidade se houver lat/lon salvas.
    },
    (error) => {
      fecharModal('modal-alert');
      mostrarAviso("Erro no GPS", "Não foi possível obter sua localização. Verifique as permissões.", "❌");
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
};

window.abrirModalEditarCliente = function() {
  if (!window.currentUserData) return;
  document.getElementById('edit-client-name').value = window.currentUserData.nome || '';
  document.getElementById('edit-client-whatsapp').value = window.currentUserData.whatsapp || '';
  document.getElementById('edit-client-pass').value = '';
  document.getElementById('modal-edit-client').classList.add('active');
};

window.salvarAlteracoesCliente = async function() {
  const user = auth.currentUser;
  if (!user) return;

  const novoNome = document.getElementById('edit-client-name').value.trim();
  const novoWhatsapp = document.getElementById('edit-client-whatsapp').value.trim();
  const novaSenha = document.getElementById('edit-client-pass').value.trim();

  if (!novoNome) return mostrarAviso("Atenção", "O nome não pode ficar em branco.", "⚠️");

  try {
    await updateDoc(doc(db, "usuarios", user.uid), {
      nome: novoNome,
      whatsapp: novoWhatsapp
    });

    if (novaSenha && novaSenha.length >= 6) {
      await updatePassword(user, novaSenha);
    } else if (novaSenha && novaSenha.length < 6) {
      return mostrarAviso("Atenção", "A senha deve ter pelo menos 6 caracteres.", "⚠️");
    }

    fecharModal('modal-edit-client');
    mostrarAviso("Sucesso! 🎉", "Seus dados foram atualizados com sucesso.", "✅");
  } catch (err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

window.abrirModalNiveis = function() {
  document.getElementById('modal-niveis').classList.add('active');
};

window.renovarVipAcumulado = async function() {
  const user = auth.currentUser;
  if (!user || !window.currentUserData) return;
  gerarPixMercadoPago();
};

window.resgatarCupomVipAdm = async function() {
  const user = auth.currentUser;
  if (!user) return mostrarAviso("Atenção", "Faça login para resgatar o cupom.", "⚠️");
  const codigoDigitado = document.getElementById('input-cupom-vip-adm').value.trim().toUpperCase();
  if (!codigoDigitado) return mostrarAviso("Atenção", "Digite o código do cupom VIP.", "⚠️");

  try {
    const qCupom = query(collection(db, "cupons_vip_adm"), where("codigo", "==", codigoDigitado), where("usado", "==", false));
    const snap = await getDocs(qCupom);

    if (snap.empty) {
      return mostrarAviso("Cupom Inválido ❌", "Este código VIP não existe ou já foi utilizado.", "⚠️");
    }

    let cupomDocId = null;
    snap.forEach(d => { cupomDocId = d.id; });

    await updateDoc(doc(db, "cupons_vip_adm", cupomDocId), {
      usado: true,
      usadoPorUid: user.uid,
      usadoPorEmail: user.email,
      dataUso: new Date().toISOString()
    });

    const userRef = doc(db, "usuarios", user.uid);
    const userSnap = await getDoc(userRef);
    let uData = userSnap.data();

    let baseDate = new Date();
    if (uData.vip && uData.vipExpiraEm) {
      const currentExp = new Date(uData.vipExpiraEm);
      if (currentExp > baseDate) baseDate = currentExp;
    }
    const novaExpiraEm = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await updateDoc(userRef, {
      vip: true,
      vipExpiraEm: novaExpiraEm,
      origemVip: "cupom_adm"
    });

    document.getElementById('input-cupom-vip-adm').value = '';
    dispararConfetes();
    mostrarAviso("VIP Ativado! 🎉", "Parabéns! Você ganhou 30 dias de acesso VIP ao Clube Prime!", "👑");
  } catch(err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

window.gerar40CuponsVipAdmin = async function() {
  if (!confirm("Deseja gerar 40 cupons de uso único de 30 dias VIP?")) return;
  try {
    const batchPromises = [];
    for (let i = 1; i <= 40; i++) {
      const sufixo = Math.random().toString(36).substring(2, 8).toUpperCase();
      const codigoCupom = `PRIME-VIP30-${sufixo}`;
      batchPromises.push(addDoc(collection(db, "cupons_vip_adm"), {
        codigo: codigoCupom,
        dias: 30,
        usado: false,
        criadoEm: new Date().toISOString()
      }));
    }
    await Promise.all(batchPromises);
    mostrarAviso("Sucesso! 🎁", "40 cupons VIP de 30 dias gerados com sucesso!", "✅");
    carregarPainelAdmin();
  } catch(err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

async function carregarCuponsVipAdminList() {
  const container = document.getElementById('admin-vip-coupons-list');
  if (!container) return;
  try {
    const snap = await getDocs(collection(db, "cupons_vip_adm"));
    if (snap.empty) {
      container.innerHTML = `<p style="color:var(--muted);">Nenhum cupom gerado.</p>`;
      return;
    }
    let html = '';
    snap.forEach(d => {
      const c = d.data();
      const statusColor = c.usado ? "#ef4444" : "#10b981";
      const statusText = c.usado ? "🔴 UTILIZADO" : "🟢 DISPONÍVEL";
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--card); padding:6px 8px; border-radius:8px; margin-bottom:4px; border:1px solid var(--card-border);">
          <span style="font-weight:800; font-family:monospace;">${c.codigo}</span>
          <span style="color:${statusColor}; font-weight:800; font-size:0.68rem;">${statusText}</span>
        </div>
      `;
    });
    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = `<p style="color:var(--muted);">Erro ao carregar cupons.</p>`;
  }
}

async function carregarParceirosCliente() {
  const container = document.getElementById('partners-list-all');
  if (!container) return;

  try {
    const qLojistas = query(
      collection(db, "usuarios"), 
      where("funcao", "==", "lojista")
    );
    
    const snapLojistas = await getDocs(qLojistas);

    if (snapLojistas.empty) {
      container.innerHTML = `<p style="font-size:0.8rem; color:var(--muted); text-align:center; padding:20px;">Nenhum parceiro cadastrado no momento.</p>`;
      return;
    }

    let partnersClientHtml = '';
    snapLojistas.forEach(docSnap => {
      const u = docSnap.data();
      if (u.ativo === false) return;

      const foneLimpo = (u.empresaTelefone || '').replace(/\D/g, '');
      const wppLink = foneLimpo ? `https://wa.me/55${foneLimpo}?text=Olá,%20vim%20pelo%20Clube%20Prime!` : '#';
      const instaLink = u.empresaInstagram ? `https://instagram.com/${u.empresaInstagram.replace('@', '')}` : '#';

      partnersClientHtml += `
        <div style="background:var(--card); border:1px solid var(--card-border); padding:16px; border-radius:18px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <h4 style="font-size:1rem; font-weight:900;">🏢 ${u.empresaNome || 'Empresa'}</h4>
            <span style="font-size:0.7rem; font-weight:800; color:var(--primary);">${u.empresaCategoria || 'Parceiro'}</span>
          </div>
          <p style="font-size:0.78rem; color:var(--muted); margin-bottom:4px;">📍 <strong>Endereço:</strong> ${u.empresaEndereco || 'Pelotas / RS'}</p>
          <p style="font-size:0.78rem; color:var(--muted); margin-bottom:4px;">📞 <strong>Contato:</strong> ${u.empresaTelefone || 'Não informado'}</p>
          ${u.empresaInstagram ? `<p style="font-size:0.78rem; color:var(--muted); margin-bottom:10px;">📸 <strong>Instagram:</strong> ${u.empresaInstagram}</p>` : ''}
          <div style="display:flex; gap:8px; margin-top:10px;">
            ${foneLimpo ? `<a href="${wppLink}" target="_blank" class="btn btn-cyan" style="flex:1; padding:8px; font-size:0.78rem; text-decoration:none; text-align:center;">💬 WhatsApp</a>` : ''}
            ${u.empresaInstagram ? `<a href="${instaLink}" target="_blank" class="btn btn-cyan" style="flex:1; padding:8px; font-size:0.78rem; text-decoration:none; text-align:center; background:linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);">📸 Instagram</a>` : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = partnersClientHtml || `<p style="font-size:0.8rem; color:var(--muted); text-align:center; padding:20px;">Nenhum parceiro ativo no momento.</p>`;
  } catch (err) {
    container.innerHTML = `<p style="font-size:0.8rem; color:var(--muted); text-align:center; padding:20px;">Erro ao carregar lista de parceiros.</p>`;
  }
}

function escutarLeilaoPatrocinado() {
  const leilaoRef = doc(db, "configuracoes", "leilao_patrocinado");
  onSnapshot(leilaoRef, (docSnap) => {
    const sponsoredBanner = document.getElementById('client-sponsored-banner');
    const sponsoredNameEl = document.getElementById('client-sponsored-name');
    const sponsoredLegendEl = document.getElementById('client-sponsored-legend-text');
    const wppBtn = document.getElementById('client-sponsored-wpp-btn');
    const instaBtn = document.getElementById('client-sponsored-insta-btn');
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      const vencedor = data.vencedorNome;
      const legenda = data.legenda || "Destaque especial da semana no Clube Prime!";
      const whatsapp = data.whatsapp || "";
      const instagram = data.instagram || "";

      if (vencedor && sponsoredBanner && sponsoredNameEl) {
        sponsoredNameEl.innerText = vencedor;
        if (sponsoredLegendEl) sponsoredLegendEl.innerText = legenda;

        if (whatsapp) {
          const foneLimpo = whatsapp.replace(/\D/g, '');
          wppBtn.href = `https://wa.me/55${foneLimpo}?text=Olá,%20vi%20vocês%20no%20destaque%20do%20Clube%20Prime!`;
          wppBtn.style.display = 'inline-flex';
        } else {
          wppBtn.style.display = 'none';
        }

        if (instagram) {
          instaBtn.href = `https://instagram.com/${instagram.replace('@', '')}`;
          instaBtn.style.display = 'inline-flex';
        } else {
          instaBtn.style.display = 'none';
        }

        sponsoredBanner.style.display = 'block';
      } else if (sponsoredBanner) {
        sponsoredBanner.style.display = 'none';
      }
    }
  });
}

window.abrirModalPatrocinarEmpresa = function(uid, nomeEncoded, wppEncoded, instaEncoded) {
  const nome = decodeURIComponent(nomeEncoded);
  const wpp = decodeURIComponent(wppEncoded);
  const insta = decodeURIComponent(instaEncoded);

  document.getElementById('patrocinar-empresa-uid').value = uid;
  document.getElementById('patrocinar-empresa-nome').value = nome;
  document.getElementById('patrocinar-empresa-wpp').value = wpp;
  document.getElementById('patrocinar-empresa-insta').value = insta;

  document.getElementById('patrocinar-empresa-nome-label').innerText = `🏢 ${nome}`;
  document.getElementById('patrocinar-empresa-legenda').value = `Destaque exclusivo da semana com ${nome}!`;
  
  document.getElementById('modal-patrocinar-empresa').classList.add('active');
};

window.salvarPatrocinadoDaSemana = async function() {
  const uid = document.getElementById('patrocinar-empresa-uid').value;
  const nome = document.getElementById('patrocinar-empresa-nome').value;
  const whatsapp = document.getElementById('patrocinar-empresa-wpp').value;
  const instagram = document.getElementById('patrocinar-empresa-insta').value;
  const legenda = document.getElementById('patrocinar-empresa-legenda').value.trim();

  if (!legenda) {
    return mostrarAviso("Atenção", "Escreva uma breve legenda para o destaque.", "⚠️");
  }

  try {
    await setDoc(doc(db, "configuracoes", "leilao_patrocinado"), {
      vencedorUid: uid,
      vencedorNome: nome,
      legenda: legenda,
      whatsapp: whatsapp,
      instagram: instagram,
      maiorLance: 0,
      atualizadoEm: new Date().toISOString()
    }, { merge: true });

    fecharModal('modal-patrocinar-empresa');
    dispararConfetes();
    mostrarAviso("Sucesso! ⭐", `A empresa "${nome}" agora é a Patrocinada da Semana no aplicativo!`, "✅");
  } catch(err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

async function calcularEconomiaNivelUsuario(uid) {
  try {
    const qLogs = query(collection(db, "logs_resgates"), where("usuarioUid", "==", uid), where("status", "==", "usado"));
    const snapLogs = await getDocs(qLogs);
    let totalEcon = 0;
    const totalUsados = snapLogs.size;

    snapLogs.forEach(docSnap => {
      const d = docSnap.data();
      totalEcon += (d.valorDescontado || d.valorEconomia || 12.00);
    });

    const elEcon = document.getElementById('user-economy-display');
    if (elEcon) elEcon.innerText = `R$ ${totalEcon.toFixed(2).replace('.', ',')}`;

    const elProfileEcon = document.getElementById('profile-total-economy-val');
    if (elProfileEcon) elProfileEcon.innerText = `R$ ${totalEcon.toFixed(2).replace('.', ',')}`;

    let nivelTxt = "🥉 Bronze";
    let nivelIcon = "🥉";
    let nivelName = "Bronze";

    if (totalUsados >= 10) {
      nivelTxt = "🥇 Ouro"; nivelIcon = "🥇"; nivelName = "Ouro";
    } else if (totalUsados >= 4) {
      nivelTxt = "🥈 Prata"; nivelIcon = "🥈"; nivelName = "Prata";
    }

    const elLvl = document.getElementById('user-level-display');
    if (elLvl) elLvl.innerText = nivelTxt;

    const badgeCount = document.getElementById('badge-resgates-count');
    if (badgeCount) badgeCount.innerText = totalUsados;

    const badgeIcon = document.getElementById('badge-level-icon');
    if (badgeIcon) badgeIcon.innerText = nivelIcon;

    const badgeTitle = document.getElementById('badge-level-title');
    if (badgeTitle) badgeTitle.innerText = nivelName;

  } catch (e) { console.error(e); }
}

async function carregarHistoricoClientePerfil(uidTarget = null) {
  const user = auth.currentUser;
  const uid = uidTarget || user?.uid;
  if (!uid) return;

  const container = document.getElementById('client-history-list');
  if (!container) return;

  try {
    const qLogs = query(collection(db, "logs_resgates"), where("usuarioUid", "==", uid), where("status", "==", "usado"));
    const snap = await getDocs(qLogs);

    cacheLogsClientePerfil = [];
    snap.forEach(d => {
      cacheLogsClientePerfil.push({ id: d.id, ...d.data() });
    });

    renderizarHistoricoClientePerfil();
  } catch (e) { console.error(e); }
}

window.renderizarHistoricoClientePerfil = function() {
  const container = document.getElementById('client-history-list');
  const filtro = document.getElementById('filter-client-history')?.value || 'todos';
  if (!container) return;

  if (cacheLogsClientePerfil.length === 0) {
    container.innerHTML = `<p style="color:var(--muted); text-align:center;">Nenhum cupom resgatado ainda.</p>`;
    return;
  }

  const agora = new Date();
  let filtrados = cacheLogsClientePerfil.filter(l => {
    const dt = new Date(l.dataValidacao || l.dataHora);
    if (filtro === 'mes') {
      return dt.getMonth() === agora.getMonth() && dt.getFullYear() === agora.getFullYear();
    } else if (filtro === 'ano') {
      return dt.getFullYear() === agora.getFullYear();
    }
    return true;
  });

  if (filtrados.length === 0) {
    container.innerHTML = `<p style="color:var(--muted); text-align:center;">Nenhum resgate neste período.</p>`;
    return;
  }

  let html = '';
  filtrados.forEach(l => {
    const dtStr = new Date(l.dataValidacao || l.dataHora).toLocaleString('pt-BR');
    const desc = l.valorDescontado ? `R$ ${l.valorDescontado.toFixed(2).replace('.', ',')}` : 'Desconto aplicado';
    const pct = l.descontoPct ? `(${l.descontoPct}%)` : '';

    html += `
      <div style="background:var(--secondary); border:1px solid var(--card-border); padding:10px; border-radius:12px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:0.82rem; color:var(--text);">🏢 ${l.empresaNome || 'Loja'}</strong>
          <span style="font-size:0.75rem; font-weight:900; color:#10b981;">-${desc} ${pct}</span>
        </div>
        <div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">🎟️ ${l.cupomTitulo}</div>
        <div style="font-size:0.68rem; color:var(--muted); margin-top:4px;">🕒 ${dtStr}</div>
      </div>
    `;
  });

  container.innerHTML = html;
};

// CORREÇÃO DA CÂMERA DO QR CODE (FORÇANDO A CÂMERA TRASEIRA)
window.abrirLeitorQrCode = function() {
  const container = document.getElementById('reader-container');
  container.style.display = 'block';

  if (!html5QrCodeScanner) {
    html5QrCodeScanner = new Html5QrcodeScanner("qr-reader", { 
      fps: 10, 
      qrbox: 250,
      aspectRatio: 1.0,
      videoConstraints: {
        facingMode: "environment" // Força a câmera traseira do celular
      }
    });
  }

  html5QrCodeScanner.render((decodedText) => {
    const val = decodedText.trim().toUpperCase();
    document.getElementById('input-validar-codigo').value = val;
    fecharLeitorQrCode();
    verificarCodigoDigitadoLojista(val);
  }, (error) => {});
};

window.fecharLeitorQrCode = function() {
  if (html5QrCodeScanner) {
    html5QrCodeScanner.clear().catch(e => {});
  }
  document.getElementById('reader-container').style.display = 'none';
};

window.verificarCodigoDigitadoLojista = async function(codigo) {
  const codLimpo = (codigo || document.getElementById('input-validar-codigo').value).trim().toUpperCase();
  const boxCalculo = document.getElementById('box-calculo-validacao');
  const btnValidar = document.getElementById('btn-validar-baixa-final');

  if (!codLimpo || codLimpo.length < 5) {
    boxCalculo.style.display = 'none';
    btnValidar.disabled = true;
    btnValidar.style.opacity = "0.5";
    btnValidar.style.pointerEvents = "none";
    cupomEmValidacao = null;
    return;
  }

  const user = auth.currentUser;
  if (!user) return;

  try {
    const qCode = query(
      collection(db, "logs_resgates"),
      where("codigoGerado", "==", codLimpo),
      where("empresaId", "==", user.uid)
    );
    const snapCode = await getDocs(qCode);

    if (snapCode.empty) {
      boxCalculo.style.display = 'none';
      btnValidar.disabled = true;
      btnValidar.style.opacity = "0.5";
      btnValidar.style.pointerEvents = "none";
      cupomEmValidacao = null;
      return;
    }

    let cupomDocRef = null;
    let cupomData = null;

    snapCode.forEach(docSnap => {
      cupomDocRef = doc(db, "logs_resgates", docSnap.id);
      cupomData = { id: docSnap.id, ...docSnap.data() };
    });

    if (cupomData.status === "usado") {
      boxCalculo.style.display = 'none';
      btnValidar.disabled = true;
      btnValidar.style.opacity = "0.5";
      btnValidar.style.pointerEvents = "none";
      mostrarAviso("CUPOM JÁ UTILIZADO 🚫", `O código "${codLimpo}" já foi validado em ${new Date(cupomData.dataValidacao).toLocaleString('pt-BR')}.`, "❌");
      return;
    }

    let pctDesconto = cupomData.descontoPct || 10;
    if (!cupomData.descontoPct && cupomData.cupomId) {
      const cSnap = await getDoc(doc(db, "cupons", cupomData.cupomId));
      if (cSnap.exists()) {
        pctDesconto = cSnap.data().descontoPct || 10;
      }
    }

    cupomEmValidacao = {
      docRef: cupomDocRef,
      data: cupomData,
      descontoPct: pctDesconto
    };

    descontoPctCalculado = pctDesconto;

    document.getElementById('val-CupomNome').innerText = cupomData.cupomTitulo || 'Cupom PRIME';
    document.getElementById('val-DescontoPct').innerText = `${pctDesconto}% OFF`;

    document.getElementById('input-valor-servico').value = '';
    calcularValoresBaixa(0);

    boxCalculo.style.display = 'block';

  } catch (e) { console.error(e); }
};

window.calcularValoresBaixa = function(valorStr) {
  const valOriginal = parseFloat(valorStr) || 0;
  const btnValidar = document.getElementById('btn-validar-baixa-final');

  if (valOriginal <= 0 || !cupomEmValidacao) {
    document.getElementById('res-val-original').innerText = 'R$ 0,00';
    document.getElementById('res-val-pct').innerText = `${descontoPctCalculado}%`;
    document.getElementById('res-val-desconto').innerText = 'R$ 0,00';
    document.getElementById('res-val-final').innerText = 'R$ 0,00';
    btnValidar.disabled = true;
    btnValidar.style.opacity = "0.5";
    btnValidar.style.pointerEvents = "none";
    return;
  }

  valorServicoCalculado = valOriginal;
  valorDescontoCalculado = valOriginal * (descontoPctCalculado / 100);
  valorFinalCalculado = valOriginal - valorDescontoCalculado;

  document.getElementById('res-val-original').innerText = `R$ ${valOriginal.toFixed(2).replace('.', ',')}`;
  document.getElementById('res-val-pct').innerText = `${descontoPctCalculado}%`;
  document.getElementById('res-val-desconto').innerText = `R$ ${valorDescontoCalculado.toFixed(2).replace('.', ',')}`;
  document.getElementById('res-val-final').innerText = `R$ ${valorFinalCalculado.toFixed(2).replace('.', ',')}`;

  btnValidar.disabled = false;
  btnValidar.style.opacity = "1";
  btnValidar.style.pointerEvents = "auto";
};

window.alternarVisaoCliente = function() {
  if (window.currentUserData?.funcao !== "admin") return;
  
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-home').classList.add('active');
  document.querySelector('.bottom-nav').style.display = 'flex';
  
  const boxVoltar = document.getElementById('box-voltar-admin');
  if (boxVoltar) boxVoltar.style.display = 'block';
};

window.voltarAoAdminDesdeCliente = function() {
  if (window.currentUserData?.funcao !== "admin") return;

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-admin').classList.add('active');
  document.querySelector('.bottom-nav').style.display = 'none';
  
  const boxVoltar = document.getElementById('box-voltar-admin');
  if (boxVoltar) boxVoltar.style.display = 'none';
};

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

    let empresasGrouped = {};
    cuponsArray.forEach(cupom => {
      const key = cupom.empresaId || cupom.empresaNome;
      if (!empresasGrouped[key]) {
        empresasGrouped[key] = {
          nome: cupom.empresaNome,
          endereco: cupom.endereco || 'Pelotas / RS',
          telefone: cupom.telefone || '',
          categoria: cupom.categoria || 'gastronomia',
          imagem: cupom.imagem || '',
          cupons: []
        };
      }
      if (empresasGrouped[key].cupons.length < 3) {
        empresasGrouped[key].cupons.push(cupom);
      }
    });

    let html = '';
    for (const [key, emp] of Object.entries(empresasGrouped)) {
      let imgHtml = emp.imagem ? `<img src="${emp.imagem}" alt="Logo/Foto" style="width:100%; height:130px; object-fit:cover; border-radius:14px; margin-bottom:12px;">` : '';
      
      html += `
        <div class="company-card" data-cat="${emp.categoria}" data-name="${emp.nome.toLowerCase()}" style="background:var(--card); border:1px solid var(--card-border); padding:16px; border-radius:20px; margin-bottom:16px;">
          ${imgHtml}
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div>
              <h3 style="font-size:1.1rem; font-weight:900; color:var(--text);">🏢 ${emp.nome}</h3>
              <div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">📍 ${emp.endereco}</div>
            </div>
            <span style="font-size:0.7rem; font-weight:800; color:var(--primary); background:var(--secondary); padding:4px 8px; border-radius:10px;">${emp.cupons.length} Oferta(s)</span>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px; margin-top:12px;">
      `;

      emp.cupons.forEach(cupom => {
        const limiteTxt = cupom.limite === 'daily' ? '1 por dia' : cupom.limite === 'once' ? 'Uso único' : 'Ilimitado';
        const pctTxt = cupom.descontoPct ? `${cupom.descontoPct}% OFF` : (cupom.descontoBadge || 'OFERTA');

        html += `
          <div style="background:var(--secondary); border:1px solid var(--card-border); padding:12px; border-radius:14px; display:flex; justify-content:space-between; align-items:center;">
            <div style="flex:1; padding-right:8px;">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                <span style="font-size:0.85rem; font-weight:800; color:var(--text);">${cupom.titulo}</span>
                <button style="background:none; border:none; color:var(--primary); font-size:0.9rem; cursor:pointer; padding:0 4px;" title="Ver Regras" onclick="abrirModalRegrasCupom('${encodeURIComponent(cupom.titulo)}', '${encodeURIComponent(emp.nome)}', '${encodeURIComponent(cupom.regras || 'Sem restrições')}')">ℹ️</button>
              </div>
              <div style="font-size:0.75rem; color:var(--muted);">${cupom.descricao}</div>
              <div style="font-size:0.68rem; color:var(--primary); font-weight:700; margin-top:4px;">Regra: ${limiteTxt}</div>
            </div>

            <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
              <span class="discount-badge" style="font-size:0.72rem; padding:3px 8px;">${pctTxt}</span>
              <button class="btn btn-cyan btn-small" style="padding:6px 10px; font-size:0.75rem;" onclick="clicarElesResgatar('${cupom.id}', '${cupom.empresaId}', '${cupom.empresaNome}', '${cupom.titulo}', '${cupom.codigo || 'PRIME'}', ${cupom.valorEconomia || 10.00}, '${cupom.endereco || 'Pelotas / RS'}', '${cupom.telefone || ''}', '${cupom.regras || ''}', '${cupom.limite || 'daily'}', ${cupom.descontoPct || 10})">
                🎟️ Resgatar
              </button>
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    if (html !== '') {
      container.innerHTML = html;
    } else {
      container.innerHTML = `<p style="font-size:0.8rem; color:var(--muted); text-align:center; padding:20px;">Nenhum cupom ativo no momento.</p>`;
    }
  });
}

window.abrirModalRegrasCupom = function(titulo, loja, regras) {
  document.getElementById('modal-regra-titulo').innerText = decodeURIComponent(titulo);
  document.getElementById('modal-regra-loja').innerText = `🏢 ${decodeURIComponent(loja)}`;
  document.getElementById('modal-regra-texto').innerText = decodeURIComponent(regras) || 'Sem restrições adicionais.';
  document.getElementById('modal-regras-cupom').classList.add('active');
};

window.clicarElesResgatar = async function(cupomId, empresaId, empresaNome, titulo, prefixoCodigo, econ, endereco, telefone, regras, limite, descontoPct = 10) {
  const user = auth.currentUser;
  if (!user) return mostrarAviso("Atenção", "Faça login para resgatar.", "⚠️");

  if (limite !== 'unlimited') {
    try {
      const qCheck = query(
        collection(db, "logs_resgates"),
        where("usuarioUid", "==", user.uid),
        where("cupomId", "==", cupomId),
        where("status", "==", "usado")
      );
      const snapCheck = await getDocs(qCheck);

      if (!snapCheck.empty) {
        if (limite === 'once') {
          return mostrarAviso("Cupom Já Utilizado! ⚠️", "Esta oferta é de USO ÚNICO e você já a utilizou anteriormente.", "🔒");
        } else if (limite === 'daily') {
          const hoje = new Date().toDateString();
          let jaUsouHoje = false;
          snapCheck.forEach(docSnap => {
            const d = docSnap.data();
            const quando = new Date(d.dataValidacao || d.dataHora);
            if (!isNaN(quando.getTime()) && quando.toDateString() === hoje) jaUsouHoje = true;
          });
          if (jaUsouHoje) {
            return mostrarAviso("Limite Diário Atingido! ⏳", "Você já utilizou este cupom hoje. Tente novamente amanhã!", "📅");
          }
        }
      }
    } catch(e) { console.error(e); }
  }

  try {
    await updateDoc(doc(db, "cupons", cupomId), {
      cliquesCount: increment(1)
    });
  } catch (e) { console.error(e); }

  resgatarCupomReal(cupomId, empresaId, empresaNome, titulo, prefixoCodigo, econ, endereco, telefone, regras, descontoPct);
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
  } catch (e) { console.error(e); }
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
      const pctDescontoStr = cupom.descontoPct ? `${cupom.descontoPct}%` : 'Não def.';

      html += `
        <div style="background:var(--card); border:1px solid var(--card-border); padding:14px; border-radius:16px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h4 style="font-size:0.9rem; font-weight:800;">${cupom.titulo}</h4>
            <span style="font-size:0.7rem; font-weight:800;">${statusText}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--muted); margin:4px 0;">Desconto: <strong>${pctDescontoStr}</strong> | Prefixo: <strong>${cupom.codigo || 'PRIME'}</strong> | Cliques: <strong>${cliques}</strong></p>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
            <button class="btn btn-outline btn-small" onclick="toggleStatusCupom('${docId}', ${cupom.ativo})">⏸️ ${btnPausaText}</button>
            <button class="btn btn-outline btn-small" onclick="abrirModalEditarOferta('${docId}', '${encodeURIComponent(cupom.titulo)}', '${encodeURIComponent(cupom.descricao)}', '${encodeURIComponent(cupom.regras || '')}', '${cupom.categoria}', '${encodeURIComponent(cupom.descontoBadge || '')}', ${cupom.valorEconomia || 10}, '${cupom.codigo || 'PRIME'}', '${encodeURIComponent(cupom.imagem || '')}', '${cupom.limite || 'daily'}', ${cupom.ordem || 0}, ${cupom.descontoPct || 10})">✏️ Editar</button>
            <button class="btn btn-outline btn-small" style="color:var(--danger); border-color:#ef444455;" onclick="excluirCupom('${docId}')">🗑️ Excluir</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  });
}

function carregarLogsDoLojista(empresaUid) {
  const q = query(collection(db, "logs_resgates"), where("empresaId", "==", empresaUid));
  onSnapshot(q, (snapshot) => {
    const container = document.getElementById('merchant-logs-list');
    if (!container) return;

    if (snapshot.empty) {
      container.innerHTML = `<p style="font-size:0.8rem; color:var(--muted); text-align:center; padding:10px;">Sem resgates registrados para a sua empresa.</p>`;
      return;
    }

    let logsHtml = '';
    snapshot.forEach(logSnap => {
      const l = logSnap.data();
      const statusColor = l.status === "usado" ? "#10b981" : "#f59e0b";
      const wppStr = l.usuarioWhatsapp ? `📱 <a href="https://wa.me/55${l.usuarioWhatsapp.replace(/\D/g, '')}" target="_blank" style="color:var(--primary); text-decoration:underline;">${l.usuarioWhatsapp}</a>` : '📱 Zap não informado';
      
      let detalhesValores = '';
      if (l.status === "usado" && l.valorOriginal) {
        detalhesValores = `
          <div style="margin-top:4px; font-weight:700; color:var(--text); border-top:1px dashed var(--card-border); padding-top:4px;">
            <span>Orig: R$ ${l.valorOriginal.toFixed(2).replace('.', ',')}</span> | 
            <span style="color:var(--accent);">Desc (${l.descontoPct}%): -R$ ${l.valorDescontado.toFixed(2).replace('.', ',')}</span> | 
            <span style="color:#10b981;">Pago: R$ ${l.valorFinal.toFixed(2).replace('.', ',')}</span>
          </div>
        `;
      }

      logsHtml += `
        <div style="background:var(--card); border:1px solid var(--card-border); padding:10px 12px; border-radius:10px; margin-bottom:6px; font-size:0.75rem;">
          <div style="display:flex; justify-content:space-between;">
            <strong>${l.usuarioNome || 'Cliente'}</strong>
            <span style="color:${statusColor}; font-weight:800;">${(l.status || 'gerado').toUpperCase()}</span>
          </div>
          <div style="color:var(--muted); font-size:0.7rem; margin-top:2px;">[${l.codigoGerado}] • ${wppStr}</div>
          <div style="color:var(--muted); font-size:0.68rem; margin-top:2px;">${l.cupomTitulo} • ${new Date(l.dataHora).toLocaleString('pt-BR')}</div>
          ${detalhesValores}
        </div>
      `;
    });
    container.innerHTML = logsHtml;
  });
}

window.switchAdminTab = function(tabName) {
  document.getElementById('adm-tab-dash').classList.toggle('active', tabName === 'dash');
  document.getElementById('adm-tab-cupons').classList.toggle('active', tabName === 'cupons');
  document.getElementById('adm-tab-clientes').classList.toggle('active', tabName === 'clientes');
  document.getElementById('adm-tab-empresas').classList.toggle('active', tabName === 'empresas');

  document.getElementById('adm-section-dash').style.display = tabName === 'dash' ? 'block' : 'none';
  document.getElementById('adm-section-cupons').style.display = tabName === 'cupons' ? 'block' : 'none';
  document.getElementById('adm-section-clientes').style.display = tabName === 'clientes' ? 'block' : 'none';
  document.getElementById('adm-section-empresas').style.display = tabName === 'empresas' ? 'block' : 'none';
};

window.switchDashSubTab = function(subTab) {
  const btnOverview = document.getElementById('btn-subtab-overview');
  const btnFinance = document.getElementById('btn-subtab-finance');
  const secOverview = document.getElementById('dash-sub-overview');
  const secFinance = document.getElementById('dash-sub-finance');

  if (subTab === 'overview') {
    btnOverview.className = "btn btn-cyan btn-small";
    btnFinance.className = "btn btn-outline btn-small";
    secOverview.style.display = 'block';
    secFinance.style.display = 'none';
  } else {
    btnOverview.className = "btn btn-outline btn-small";
    btnFinance.className = "btn btn-cyan btn-small";
    secOverview.style.display = 'none';
    secFinance.style.display = 'block';
  }
};

let cacheLogsAdmin = [];
let cacheEmpresasAdmin = [];

async function carregarPainelAdmin() {
  try {
    const snapUsers = await getDocs(collection(db, "usuarios"));
    let totalUsers = 0;
    let totalVipsReais = 0;
    let totalFree = 0;
    let totalMerchants = 0;
    let listUsersHtml = '';
    let listMerchantsHtml = '';
    
    cacheEmpresasAdmin = [];
    cacheTodosUsuarios = [];
    cachePagamentosPix = [];

    try {
      const snapPix = await getDocs(collection(db, "pagamentos_pix"));
      snapPix.forEach(d => {
        cachePagamentosPix.push({ id: d.id, ...d.data() });
      });
    } catch (e) { console.error(e); }

    snapUsers.forEach(docSnap => {
      const u = docSnap.data();
      const uid = docSnap.id;
      cacheTodosUsuarios.push({ id: uid, ...u });

      if (u.funcao === "cliente") {
        totalUsers++;
        if (u.vip) {
          totalVipsReais++;
          if (cachePagamentosPix.length === 0 && u.origemVip !== "cupom_adm") {
            cachePagamentosPix.push({
              id: uid,
              nome: u.nome || "Cliente VIP",
              email: u.email || "Não informado",
              whatsapp: u.whatsapp || "Não cadastrado",
              valor: PRECO_VIP,
              dataHora: u.vipAtivadoEm || u.criadoEm || new Date().toISOString()
            });
          }
        } else {
          totalFree++;
        }

        const badgeVipTxt = u.vip ? "👑 VIP" : "👤 Free";
        const btnVipActionText = u.vip ? "Remover VIP" : "Tornar VIP";
        const nextVipState = !u.vip;

        const criadoEmData = u.criadoEm ? new Date(u.criadoEm).toLocaleDateString('pt-BR') : 'Não registrada';
        const expiraDataStr = u.vipExpiraEm ? new Date(u.vipExpiraEm).toLocaleDateString('pt-BR') : (u.vip ? 'Ativo (Ilimitado)' : 'Não assinante');
        const whatsappUserStr = u.whatsapp ? `💬 ${u.whatsapp}` : '💬 Zap não informado';

        listUsersHtml += `
          <div style="background:var(--card); border:1px solid var(--card-border); padding:14px; border-radius:16px; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
              <div>
                <div style="font-size:0.9rem; font-weight:900;">${u.nome || 'Usuário'}</div>
                <div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">📧 ${u.email}</div>
                <div style="font-size:0.75rem; color:var(--primary); margin-top:2px; font-weight:700;">${whatsappUserStr}</div>
              </div>
              <span style="font-weight:800; font-size:0.7rem; padding:3px 8px; border-radius:10px; background:var(--secondary); color:var(--primary);">${badgeVipTxt}</span>
            </div>
            <div style="font-size:0.72rem; background:var(--secondary); padding:8px; border-radius:10px; margin:6px 0; display:flex; flex-direction:column; gap:2px;">
              <div>📅 <strong>Membro Desde:</strong> ${criadoEmData}</div>
              <div>⏳ <strong>Validade VIP:</strong> <span style="color:var(--accent); font-weight:700;">${expiraDataStr}</span></div>
            </div>
            <div style="display:flex; gap:6px; margin-top:6px;">
              <button class="btn btn-outline btn-small" style="flex:1;" onclick="adminAlternarVip('${uid}', ${nextVipState})">${btnVipActionText}</button>
              <button class="btn btn-outline btn-small" style="color:var(--danger); border-color:#ef444455;" onclick="confirmarExclusaoCliente('${uid}', '${encodeURIComponent(u.nome || 'Cliente')}')">🗑️ Excluir</button>
            </div>
          </div>
        `;
      } else if (u.funcao === "lojista") {
        totalMerchants++;
        const empNome = u.empresaNome || u.nome || 'Empresa';
        cacheEmpresasAdmin.push({ id: uid, nome: empNome, data: u });
      }
    });

    cacheEmpresasAdmin.forEach(emp => {
      const u = emp.data;
      const uid = emp.id;
      const empresaCadastradaEm = u.criadoEm ? new Date(u.criadoEm).toLocaleDateString('pt-BR') : 'Não registrada';
      const statusAtivo = u.ativo !== false;
      const statusBadgeTxt = statusAtivo ? "🟢 ATIVA" : "🔴 DESATIVADA";
      const btnToggleTxt = statusAtivo ? "Desativar" : "Ativar";

      const empNomeEncoded = encodeURIComponent(u.empresaNome || 'Empresa');
      const empWppEncoded = encodeURIComponent(u.empresaTelefone || '');
      const empInstaEncoded = encodeURIComponent(u.empresaInstagram || '');

      listMerchantsHtml += `
        <div style="background:var(--card); border:1px solid var(--card-border); padding:14px; border-radius:16px; margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <h4 style="font-size:0.95rem; font-weight:900; color:var(--text);">🏢 ${u.empresaNome || 'Empresa Sem Nome'}</h4>
            <span style="font-size:0.68rem; font-weight:800;">${statusBadgeTxt}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--muted); margin-bottom:2px;">👤 <strong>Responsável:</strong> ${u.nome || '-'}</p>
          <p style="font-size:0.75rem; color:var(--muted); margin-bottom:2px;">📧 <strong>E-mail:</strong> ${u.email || '-'}</p>
          <p style="font-size:0.75rem; color:var(--muted); margin-bottom:2px;">📍 <strong>Endereço:</strong> ${u.empresaEndereco || 'Pelotas / RS'}</p>
          <p style="font-size:0.75rem; color:var(--muted); margin-bottom:2px;">📞 <strong>Contato:</strong> ${u.empresaTelefone || 'Não informado'}</p>
          ${u.empresaInstagram ? `<p style="font-size:0.75rem; color:var(--muted); margin-bottom:2px;">📸 <strong>Instagram:</strong> ${u.empresaInstagram}</p>` : ''}
          <p style="font-size:0.75rem; color:var(--muted); margin-bottom:6px;">📅 <strong>Cadastrado em:</strong> <span style="color:var(--primary); font-weight:700;">${empresaCadastradaEm}</span></p>

          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
            <button class="btn btn-outline btn-small" style="color:#7c3aed; border-color:#7c3aed55;" onclick="abrirModalPatrocinarEmpresa('${uid}', '${empNomeEncoded}', '${empWppEncoded}', '${empInstaEncoded}')">⭐ Patrocinar</button>
            <button class="btn btn-outline btn-small" onclick="abrirModalAdminEmpresa('${uid}', '${empNomeEncoded}', '${encodeURIComponent(u.email || '')}', '${encodeURIComponent(u.empresaDescricao || '')}', '${encodeURIComponent(u.empresaEndereco || '')}', '${empWppEncoded}', '${empInstaEncoded}', '${u.empresaCategoria || 'gastronomia'}', '${encodeURIComponent(u.fotoUrl || '')}')">✏️ Editar</button>
            <button class="btn btn-outline btn-small" onclick="toggleStatusEmpresaAdmin('${uid}', ${statusAtivo})">⏸️ ${btnToggleTxt}</button>
            <button class="btn btn-outline btn-small" style="color:var(--danger); border-color:#ef444455;" onclick="excluirEmpresaAdmin('${uid}', '${empNomeEncoded}')">🗑️ Excluir</button>
          </div>
        </div>
      `;
    });

    atualizarSelectFiltroEmpresas();

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
        <div style="background:var(--card); border:1px solid var(--card-border); padding:10px 12px; border-radius:12px; margin-bottom:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:0.8rem; font-weight:800;">${c.titulo} <span style="color:var(--muted); font-weight:600;">(${c.empresaNome})</span></div>
            <span style="font-size:0.68rem; font-weight:800;">${statusText}</span>
          </div>
          <div style="font-size:0.7rem; color:var(--muted); margin-top:2px;">Desconto: <strong>${c.descontoPct || 10}%</strong> | Prefixo: <strong>${c.codigo || 'PRIME'}</strong> | Ordem: <strong>${c.ordem || 0}</strong></div>
          <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
            <button class="btn btn-outline btn-small" onclick="toggleStatusCupom('${docId}', ${c.ativo})">⏸️ ${btnPausaText}</button>
            <button class="btn btn-outline btn-small" onclick="abrirModalEditarOferta('${docId}', '${encodeURIComponent(c.titulo)}', '${encodeURIComponent(c.descricao)}', '${encodeURIComponent(c.regras || '')}', '${c.categoria}', '${encodeURIComponent(c.descontoBadge || '')}', ${c.valorEconomia || 10}, '${c.codigo || 'PRIME'}', '${encodeURIComponent(c.imagem || '')}', '${c.limite || 'daily'}', ${c.ordem || 0}, ${c.descontoPct || 10})">✏️ Editar</button>
            <button class="btn btn-outline btn-small" style="color:var(--danger); border-color:#ef444455;" onclick="excluirCupom('${docId}')">🗑️ Excluir</button>
          </div>
        </div>
      `;
    });

    const snapLogs = await getDocs(collection(db, "logs_resgates"));
    cacheLogsAdmin = [];
    let countCuponsUsados = 0;

    snapLogs.forEach(logSnap => {
      const dataLog = logSnap.data();
      if (dataLog.status === "usado") countCuponsUsados++;
      cacheLogsAdmin.push({ id: logSnap.id, ...dataLog });
    });

    renderizarLogsAdminFiltrados();
    carregarCuponsVipAdminList();

    const taxaConversao = totalUsers > 0 ? ((totalVipsReais / totalUsers) * 100).toFixed(1) : "0.0";

    document.getElementById('admin-count-users').innerText = totalUsers;
    document.getElementById('admin-count-vips').innerText = totalVipsReais;
    document.getElementById('admin-vip-conversion-rate').innerText = `${taxaConversao}%`;
    document.getElementById('admin-count-free').innerText = totalFree;
    document.getElementById('admin-count-merchants').innerText = totalMerchants;
    document.getElementById('admin-count-offers').innerText = totalCuponsAtivos;
    document.getElementById('admin-count-coupons-used').innerText = countCuponsUsados;
    document.getElementById('admin-count-payments-approved').innerText = cachePagamentosPix.length;

    document.getElementById('admin-all-coupons-list').innerHTML = allCuponsHtml || '<p style="font-size:0.8rem; color:var(--muted);">Nenhum cupom registrado.</p>';
    document.getElementById('admin-users-list').innerHTML = listUsersHtml || '<p style="font-size:0.8rem; color:var(--muted);">Nenhum cliente encontrado.</p>';
    document.getElementById('admin-merchants-list').innerHTML = listMerchantsHtml || '<p style="font-size:0.8rem; color:var(--muted);">Nenhuma empresa parceira registrada.</p>';

    renderizarGraficosAdmin(totalFree, totalVipsReais);
    renderizarGraficoCrescimentoClientes();
    renderizarRelatorioFinanceiro('hoje');

  } catch (err) { console.error(err); }
}

window.confirmarExclusaoCliente = function(uid, nomeEncoded) {
  const nomeDecoded = decodeURIComponent(nomeEncoded);
  document.getElementById('delete-user-uid').value = uid;
  document.getElementById('delete-user-name').innerText = nomeDecoded;
  document.getElementById('modal-confirm-delete-user').classList.add('active');
};

window.executarExclusaoCliente = async function() {
  const uid = document.getElementById('delete-user-uid').value;
  if (!uid) return;

  try {
    await deleteDoc(doc(db, "usuarios", uid));
    fecharModal('modal-confirm-delete-user');
    mostrarAviso("Excluído 🗑️", "Cadastro do cliente removido com sucesso.", "✅");
    carregarPainelAdmin();
  } catch(err) {
    fecharModal('modal-confirm-delete-user');
    mostrarAviso("Erro", err.message, "❌");
  }
};

window.confirmarZerarHistoricoPix = async function() {
  if (confirm("⚠️ Tem certeza que deseja ZERAR o histórico de Pix? Isso limpará todas as entradas financeiras registradas de teste.")) {
    try {
      const snapPix = await getDocs(collection(db, "pagamentos_pix"));
      const batchPromises = [];
      snapPix.forEach(d => {
        batchPromises.push(deleteDoc(doc(db, "pagamentos_pix", d.id)));
      });
      await Promise.all(batchPromises);

      cachePagamentosPix = [];
      mostrarAviso("Histórico Zerado! 🧹", "O histórico de leitura de Pix foi resetado com sucesso.", "✅");
      carregarPainelAdmin();
    } catch(err) {
      mostrarAviso("Erro ao zerar", err.message, "❌");
    }
  }
};

window.copiarListaWhatsAppClientes = function() {
  const zapList = cacheTodosUsuarios
    .filter(u => u.funcao === "cliente" && u.whatsapp)
    .map(u => u.whatsapp.replace(/\D/g, ''))
    .filter(w => w.length >= 10);

  if (zapList.length === 0) {
    return mostrarAviso("Aviso", "Nenhum cliente cadastrou o WhatsApp ainda.", "ℹ️");
  }

  const textoFinal = zapList.join("\n");
  navigator.clipboard.writeText(textoFinal);
  mostrarAviso("Copiado! 📱", `${zapList.length} número(s) de WhatsApp copiados para a área de transferência.`, "📋");
};

window.aplicarFiltroDataCustomizada = function() {
  const dtInicio = document.getElementById('filter-date-start').value;
  const dtFim = document.getElementById('filter-date-end').value;

  if (!dtInicio || !dtFim) {
    return mostrarAviso("Atenção", "Selecione as datas de início e fim para filtrar.", "⚠️");
  }

  renderizarRelatorioFinanceiro('custom', new Date(dtInicio + 'T00:00:00'), new Date(dtFim + 'T23:59:59'));
};

window.filtrarFinanceiroPeriodo = function(periodo, btn) {
  if (btn) {
    document.querySelectorAll('.filter-period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  renderizarRelatorioFinanceiro(periodo);
};

function renderizarRelatorioFinanceiro(periodo = 'hoje', customStart = null, customEnd = null) {
  const container = document.getElementById('admin-pix-payments-list');
  const revenueTotalEl = document.getElementById('admin-total-revenue');
  if (!container) return;

  const agora = new Date();
  let pagamentosFiltrados = cachePagamentosPix.filter(p => {
    const dataP = new Date(p.dataHora);
    if (isNaN(dataP.getTime())) return true;

    if (periodo === 'hoje') {
      return dataP.toDateString() === agora.toDateString();
    } else if (periodo === 'semana') {
      const umaSemanaAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
      return dataP >= umaSemanaAtras;
    } else if (periodo === 'mes') {
      return dataP.getMonth() === agora.getMonth() && dataP.getFullYear() === agora.getFullYear();
    } else if (periodo === 'custom' && customStart && customEnd) {
      return dataP >= customStart && dataP <= customEnd;
    }
    return true;
  });

  const totalFaturado = pagamentosFiltrados.reduce((acc, curr) => acc + (curr.valor || PRECO_VIP), 0);
  if (revenueTotalEl) {
    revenueTotalEl.innerText = `R$ ${totalFaturado.toFixed(2).replace('.', ',')}`;
  }

  if (pagamentosFiltrados.length === 0) {
    container.innerHTML = `<p style="font-size:0.78rem; color:var(--muted); text-align:center; padding:12px;">Nenhum pagamento Pix compensado neste período.</p>`;
    renderizarGraficoFaturamentoDiario([]);
    return;
  }

  let htmlTable = `
    <table style="width:100%; border-collapse:collapse; font-size:0.73rem; text-align:left;">
      <thead>
        <tr style="border-bottom:1px solid var(--card-border); color:var(--muted);">
          <th style="padding:6px;">Cliente</th>
          <th style="padding:6px;">WhatsApp</th>
          <th style="padding:6px;">Valor</th>
          <th style="padding:6px;">Data / Hora</th>
        </tr>
      </thead>
      <tbody>
  `;

  pagamentosFiltrados.forEach(p => {
    const dataStr = new Date(p.dataHora).toLocaleString('pt-BR');
    const wppStr = p.whatsapp ? p.whatsapp : '-';
    htmlTable += `
      <tr style="border-bottom:1px solid var(--card-border);">
        <td style="padding:8px 6px;">
          <div style="font-weight:800;">${p.nome}</div>
          <div style="font-size:0.65rem; color:var(--muted);">${p.email}</div>
        </td>
        <td style="padding:8px 6px; font-weight:700; color:var(--primary);">${wppStr}</td>
        <td style="padding:8px 6px; font-weight:900; color:#10b981;">R$ ${(p.valor || PRECO_VIP).toFixed(2).replace('.', ',')}</td>
        <td style="padding:8px 6px; font-size:0.68rem; color:var(--muted);">${dataStr}</td>
      </tr>
    `;
  });

  htmlTable += `</tbody></table>`;
  container.innerHTML = htmlTable;

  renderizarGraficoFaturamentoDiario(pagamentosFiltrados);
}

function renderizarGraficoFaturamentoDiario(pagamentos) {
  const ctx = document.getElementById('chartRevenueDay');
  if (!ctx) return;
  if (window.myRevenueChart) window.myRevenueChart.destroy();

  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const contagemDias = [0, 0, 0, 0, 0, 0, 0];

  pagamentos.forEach(p => {
    const d = new Date(p.dataHora);
    if (!isNaN(d.getTime())) {
      contagemDias[d.getDay()] += (p.valor || PRECO_VIP);
    }
  });

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#1e293b' : '#f1f5f9';

  window.myRevenueChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: diasSemana,
      datasets: [{
        label: 'Faturamento Real (R$)',
        data: contagemDias,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#10b981'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Faturamento: R$ ${context.parsed.y.toFixed(2).replace('.', ',')}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { size: 10, weight: 'bold' } }
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { size: 9 },
            callback: function(value) { return 'R$ ' + value; }
          }
        }
      }
    }
  });
}

function renderizarGraficoCrescimentoClientes() {
  const ctx = document.getElementById('chartUsersGrowth');
  if (!ctx) return;
  if (window.myGrowthChart) window.myGrowthChart.destroy();

  const ultimosDiasLabels = [];
  const contagemCadastros = [];
  const hoje = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    const dStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    ultimosDiasLabels.push(dStr);

    const totalNoDia = cacheTodosUsuarios.filter(u => {
      if (!u.criadoEm) return false;
      const uDate = new Date(u.criadoEm);
      return uDate.toDateString() === d.toDateString();
    }).length;

    contagemCadastros.push(totalNoDia);
  }

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#1e293b' : '#f1f5f9';

  window.myGrowthChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ultimosDiasLabels,
      datasets: [{
        label: 'Novos Clientes',
        data: contagemCadastros,
        backgroundColor: '#2563eb',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor, font: { size: 9 } } },
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, precision: 0, font: { size: 9 } } }
      }
    }
  });
}

window.abrirModalAdminEmpresa = function(id = '', nome = '', email = '', desc = '', endereco = '', telefone = '', instagram = '', cat = 'gastronomia', logo = '') {
  document.getElementById('modal-admin-empresa-title').innerText = id ? "✏️ Editar Empresa" : "➕ Nova Empresa Parceira";
  document.getElementById('admin-empresa-id').value = id;
  document.getElementById('adm-emp-nome').value = decodeURIComponent(nome);
  document.getElementById('adm-emp-email').value = decodeURIComponent(email);
  document.getElementById('adm-emp-email').disabled = !!id;
  document.getElementById('adm-emp-desc').value = decodeURIComponent(desc);
  document.getElementById('adm-emp-endereco').value = decodeURIComponent(endereco);
  document.getElementById('adm-emp-telefone').value = decodeURIComponent(telefone);
  document.getElementById('adm-emp-instagram').value = decodeURIComponent(instagram);
  document.getElementById('adm-emp-cat').value = cat;
  document.getElementById('adm-emp-logo').value = decodeURIComponent(logo);
  document.getElementById('modal-admin-empresa').classList.add('active');
};

window.salvarEmpresaPeloAdmin = async function() {
  const id = document.getElementById('admin-empresa-id').value;
  const nome = document.getElementById('adm-emp-nome').value.trim();
  const email = document.getElementById('adm-emp-email').value.trim().toLowerCase();
  const desc = document.getElementById('adm-emp-desc').value.trim();
  const endereco = document.getElementById('adm-emp-endereco').value.trim();
  const telefone = document.getElementById('adm-emp-telefone').value.trim();
  const instagram = document.getElementById('adm-emp-instagram').value.trim();
  const categoria = document.getElementById('adm-emp-cat').value;
  const logo = document.getElementById('adm-emp-logo').value.trim();

  if (!nome || !email) return mostrarAviso("Atenção", "Preencha o nome e o e-mail da empresa.", "⚠️");

  try {
    if (id) {
      await updateDoc(doc(db, "usuarios", id), {
        empresaNome: nome,
        empresaDescricao: desc,
        empresaEndereco: endereco || 'Pelotas / RS',
        empresaTelefone: telefone,
        empresaInstagram: instagram,
        empresaCategoria: categoria,
        fotoUrl: logo || null
      });
      mostrarAviso("Sucesso! 🏢", "Empresa atualizada com sucesso.", "✅");
    } else {
      const novoDocRef = doc(collection(db, "usuarios"));
      await setDoc(novoDocRef, {
        nome: nome,
        email: email,
        funcao: "lojista",
        vip: false,
        ativo: true,
        empresaNome: nome,
        empresaDescricao: desc,
        empresaEndereco: endereco || 'Pelotas / RS',
        empresaTelefone: telefone,
        empresaInstagram: instagram,
        empresaCategoria: categoria,
        fotoUrl: logo || null,
        criadoEm: new Date().toISOString()
      });
      mostrarAviso("Sucesso! 🎉", "Nova empresa cadastrada com sucesso.", "✅");
    }
    fecharModal('modal-admin-empresa');
    carregarPainelAdmin();
  } catch (err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

window.toggleStatusEmpresaAdmin = async function(uid, estadoAtual) {
  try {
    await updateDoc(doc(db, "usuarios", uid), { ativo: !estadoAtual });
    mostrarAviso("Sucesso", "Status da empresa alterado.", "✅");
    carregarPainelAdmin();
  } catch (err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

window.excluirEmpresaAdmin = async function(uid, nomeEmpresa) {
  const nomeLimpo = decodeURIComponent(nomeEmpresa);
  if (confirm(`Tem certeza que deseja excluir a empresa "${nomeLimpo}"? Esta ação removerá o cadastro do parceiro.`)) {
    try {
      await deleteDoc(doc(db, "usuarios", uid));
      mostrarAviso("Excluído 🗑️", `A empresa ${nomeLimpo} foi removida.`, "✅");
      carregarPainelAdmin();
    } catch (err) {
      mostrarAviso("Erro", err.message, "❌");
    }
  }
};

function renderizarGraficosAdmin(freeUsers, vipUsers) {
  const ctx = document.getElementById('chartUsersVip');
  if (!ctx) return;
  if (window.myAdminChart) window.myAdminChart.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#1e293b' : '#f1f5f9';

  window.myAdminChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Free', 'VIP'],
      datasets: [{
        label: 'Usuários',
        data: [freeUsers, vipUsers],
        backgroundColor: [
          'rgba(100, 116, 139, 0.85)',
          'rgba(249, 115, 22, 0.85)'
        ],
        borderColor: [
          '#64748b',
          '#f97316'
        ],
        borderWidth: 1,
        borderRadius: 6,
        barThickness: 30
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { size: 11, weight: 'bold' },
          bodyFont: { size: 10 },
          padding: 8,
          cornerRadius: 6
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { weight: '600', size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor, precision: 0, font: { size: 10 } }
        }
      }
    }
  });
}

function atualizarSelectFiltroEmpresas() {
  const selectEl = document.getElementById('admin-filter-empresa');
  if (!selectEl) return;
  let html = `<option value="all">Todas as Empresas</option>`;
  cacheEmpresasAdmin.forEach(emp => {
    html += `<option value="${emp.id}">${emp.nome}</option>`;
  });
  selectEl.innerHTML = html;
}

window.filtrarLogsAdminPorEmpresa = function() {
  renderizarLogsAdminFiltrados();
};

function renderizarLogsAdminFiltrados() {
  const selectEl = document.getElementById('admin-filter-empresa');
  const empresaIdFiltro = selectEl ? selectEl.value : 'all';
  const container = document.getElementById('admin-logs-list');
  if (!container) return;

  let logsFiltrados = cacheLogsAdmin;
  if (empresaIdFiltro !== 'all') {
    logsFiltrados = cacheLogsAdmin.filter(l => l.empresaId === empresaIdFiltro);
  }

  if (logsFiltrados.length === 0) {
    container.innerHTML = `<p style="font-size:0.8rem; color:var(--muted); text-align:center; padding:10px;">Ainda não há resgates registrados para esta empresa.</p>`;
    return;
  }

  let logsGrouped = {};
  logsFiltrados.forEach(l => {
    const empNome = l.empresaNome || "Empresa Não Informada";
    if (!logsGrouped[empNome]) {
      logsGrouped[empNome] = { empresaId: l.empresaId, logs: [] };
    }
    logsGrouped[empNome].logs.push(l);
  });

  let logsHtml = '';
  for (const [empresa, dataObj] of Object.entries(logsGrouped)) {
    logsHtml += `
      <div style="margin-bottom:10px; background:var(--secondary); border:1px solid var(--card-border); padding:8px; border-radius:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <h4 style="font-size:0.8rem; font-weight:900; color:var(--primary);">🏢 ${empresa} (${dataObj.logs.length})</h4>
          <button class="btn btn-outline btn-small" style="color:var(--danger); border-color:#ef444455; padding:3px 6px; font-size:0.65rem;" onclick="limparLogsEmpresaAdmin('${dataObj.empresaId}', '${empresa}')">🗑️ Limpar</button>
        </div>
    `;
    dataObj.logs.forEach(l => {
      const statusColor = l.status === "usado" ? "#10b981" : "#f59e0b";
      logsHtml += `
        <div style="background:var(--card); border:1px solid var(--card-border); padding:6px 8px; border-radius:6px; margin-bottom:4px; font-size:0.72rem;">
          <div><strong>${l.usuarioNome || 'Cliente'}</strong> [${l.codigoGerado}] - <span style="color:${statusColor}; font-weight:800;">${(l.status || 'gerado').toUpperCase()}</span></div>
          <div style="color:var(--muted); font-size:0.65rem; margin-top:2px;">${l.cupomTitulo} • ${new Date(l.dataHora).toLocaleString('pt-BR')}</div>
        </div>
      `;
    });
    logsHtml += `</div>`;
  }
  container.innerHTML = logsHtml;
}

window.limparLogsEmpresaAdmin = async function(empresaId, empresaNome) {
  if (confirm(`Deseja realmente excluir/limpar todos os logs de resgate da empresa "${empresaNome}"?`)) {
    try {
      const qLogs = query(collection(db, "logs_resgates"), where("empresaId", "==", empresaId));
      const snap = await getDocs(qLogs);
      const promessas = [];
      snap.forEach(docSnap => {
        promessas.push(deleteDoc(doc(db, "logs_resgates", docSnap.id)));
      });
      await Promise.all(promessas);
      mostrarAviso("Limpeza Concluída 🗑️", `Os logs da empresa ${empresaNome} foram removidos.`, "✅");
      carregarPainelAdmin();
    } catch (err) { console.error(err); }
  }
};

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
  const novoInstagram = document.getElementById('merchant-edit-instagram').value.trim();

  if (!novoNome) return mostrarAviso("Atenção", "Informe o nome da empresa.", "⚠️");

  try {
    await updateDoc(doc(db, "usuarios", user.uid), {
      empresaNome: novoNome,
      empresaEndereco: novoEndereco || 'Pelotas / RS',
      empresaTelefone: novoTelefone || '',
      empresaInstagram: novoInstagram || ''
    });

    window.currentUserData.empresaNome = novoNome;
    window.currentUserData.empresaEndereco = novoEndereco;
    window.currentUserData.empresaTelefone = novoTelefone;
    window.currentUserData.empresaInstagram = novoInstagram;

    document.getElementById('merchant-store-name').innerText = novoNome;
    mostrarAviso("Sucesso! 🏢", "Informações da empresa salvas com sucesso.", "✅");
  } catch (err) {
    mostrarAviso("Erro", err.message, "❌");
  }
};

window.abrirModalCriarOferta = async function() {
  const user = auth.currentUser;
  if (user && window.currentUserData?.funcao === "lojista") {
    const qCount = query(collection(db, "cupons"), where("empresaId", "==", user.uid));
    const snapCount = await getDocs(qCount);
    if (snapCount.size >= 3) {
      return mostrarAviso("Limite Atingido ⚠️", "Sua empresa já possui o limite máximo de 3 promoções ativas cadastradas.", "🔒");
    }
  }

  document.getElementById('modal-offer-heading').innerText = "➕ Nova Oferta";
  document.getElementById('edit-offer-id').value = "";
  document.getElementById('offer-title').value = "";
  document.getElementById('offer-desc').value = "";
  document.getElementById('offer-rules').value = "";
  document.getElementById('offer-desconto-pct').value = "";
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

window.abrirModalEditarOferta = function(id, titulo, desc, regras, cat, badge, econ, codigo, imagem, limite = 'daily', ordem = 0, descontoPct = 10) {
  document.getElementById('modal-offer-heading').innerText = "✏️ Editar Oferta";
  document.getElementById('edit-offer-id').value = id;
  document.getElementById('offer-title').value = decodeURIComponent(titulo);
  document.getElementById('offer-desc').value = decodeURIComponent(desc);
  document.getElementById('offer-rules').value = decodeURIComponent(regras);
  document.getElementById('offer-desconto-pct').value = descontoPct;
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
  const descontoPct = parseFloat(document.getElementById('offer-desconto-pct').value) || 10;
  const imagem = document.getElementById('offer-image').value;
  const cat = document.getElementById('offer-cat').value;
  const badge = document.getElementById('offer-badge').value || `${descontoPct}% OFF`;
  const econ = parseFloat(document.getElementById('offer-econ').value) || 10.00;
  const codigo = document.getElementById('offer-code').value.toUpperCase().trim() || 'PRIME';
  const limite = document.getElementById('offer-limit').value || 'daily';

  if (!titulo || !desc) return mostrarAviso("Atenção", "Preencha o título e a descrição.", "⚠️");
  if (isNaN(descontoPct) || descontoPct <= 0 || descontoPct > 100) {
    return mostrarAviso("Atenção", "Informe uma porcentagem válida de desconto (1 a 100%).", "⚠️");
  }

  const user = auth.currentUser;
  if (!user) return mostrarAviso("Erro", "Não autenticado.", "❌");

  try {
    const dadosCupom = {
      titulo: titulo,
      descricao: desc,
      regras: regras || 'Sem restrições',
      descontoPct: descontoPct,
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
    const updateObj = { vip: novoEstado, vipExpiraEm: expiraEm };
    if (novoEstado) {
      updateObj.origemVip = "concessao_adm";
    }

    await updateDoc(doc(db, "usuarios", userId), updateObj);
    mostrarAviso("Atualizado!", "Status VIP alterado.", "👑");
    carregarPainelAdmin();
  } catch (err) { console.error(err); }
};

window.validarCupomTextoLojista = async function() {
  if (!cupomEmValidacao || valorServicoCalculado <= 0) {
    return mostrarAviso("Atenção ⚠️", "Informe o valor total do serviço ou da venda para calcular o desconto.", "⚠️");
  }

  const user = auth.currentUser;
  if (!user) return mostrarAviso("Erro", "Sessão expirada.", "❌");

  try {
    await updateDoc(cupomEmValidacao.docRef, {
      status: "usado",
      valorOriginal: valorServicoCalculado,
      descontoPct: descontoPctCalculado,
      valorDescontado: valorDescontoCalculado,
      valorFinal: valorFinalCalculado,
      usuarioWhatsapp: cupomEmValidacao.data.usuarioWhatsapp || window.currentUserData?.whatsapp || '',
      dataValidacao: new Date().toISOString()
    });

    dispararConfetes();
    mostrarAviso("✅ DESCONTO APLICADO!", `Cupom validado!\nValor Pago pelo cliente: R$ ${valorFinalCalculado.toFixed(2).replace('.', ',')} (Economia de R$ ${valorDescontoCalculado.toFixed(2).replace('.', ',')})`, "🎉");
    
    document.getElementById('input-validar-codigo').value = '';
    document.getElementById('box-calculo-validacao').style.display = 'none';
    
    const btnValidar = document.getElementById('btn-validar-baixa-final');
    btnValidar.disabled = true;
    btnValidar.style.opacity = "0.5";
    btnValidar.style.pointerEvents = "none";

    cupomEmValidacao = null;

    carregarEstatisticasLojista(user.uid);
    carregarLogsDoLojista(user.uid);
  } catch (err) { console.error(err); }
};

window.toggleTheme = function() {
  const temas = ['light', 'dark', 'emerald', 'purple', 'sunset', 'midnight'];
  const atual = document.documentElement.getAttribute('data-theme') || 'light';
  const proximoIndice = (temas.indexOf(atual) + 1) % temas.length;
  const proximoTema = temas[proximoIndice];
  
  document.documentElement.setAttribute('data-theme', proximoTema);
  localStorage.setItem('clube_theme', proximoTema);
  
  const icones = {
    light: '🌙',
    dark: '🌿',
    emerald: '🔮',
    purple: '🌅',
    sunset: '🌌',
    midnight: '☀️'
  };
  
  const themeBtn = document.querySelector('.theme-toggle-btn');
  if (themeBtn) {
    themeBtn.innerText = icones[proximoTema] || '🎨';
  }
};

window.dispararConfetes = function() {
  if (typeof confetti === 'function') confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
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
  pixPollingInicio = Date.now();
  intervalPixCheck = setInterval(() => {
    if (Date.now() - pixPollingInicio > 10 * 60 * 1000) return pararChecagemAutomatica();
    checarPixSilencioso();
  }, 15000);
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
      celebrarVip(data.message);
      window.isVipUser = true;
      document.querySelectorAll('.status-badge').forEach(b => { b.innerText = "ASSINANTE VIP"; b.className = "status-badge vip"; });
      document.getElementById('banner-assinatura').style.display = 'none';
      document.getElementById('profile-vip-card').style.display = 'block';
    }
  } catch (err) { console.error(err); }
}

window.switchAuthTab = function(type) {
  currentAuthTab = type;
  document.getElementById('tab-login').classList.toggle('active', type === 'login');
  document.getElementById('tab-signup').classList.toggle('active', type === 'signup');
  document.getElementById('group-name').style.display = type === 'signup' ? 'block' : 'none';
  document.getElementById('group-whatsapp').style.display = type === 'signup' ? 'block' : 'none';
  document.getElementById('box-merchant-options').style.display = type === 'signup' ? 'block' : 'none';
  document.getElementById('box-privacy-terms').style.display = type === 'signup' ? 'block' : 'none';
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

  if (screenId === 'search') {
    carregarParceirosCliente();
  } else if (screenId === 'profile') {
    carregarHistoricoClientePerfil();
  }
};

window.filterCat = function(cat, btn) {
  document.querySelectorAll('.category-pill').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
  const cards = document.querySelectorAll('.company-card');
  cards.forEach(card => {
    if (cat === 'all') {
      card.style.display = 'block';
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
  try { await signInWithPopup(auth, googleProvider); } catch (err) { mostrarAviso("Erro", err.message, "❌"); }
};

window.executarAuth = async function() {
  if (currentAuthTab === 'signup') {
    const nome = document.getElementById('reg-name').value;
    const whatsapp = document.getElementById('reg-whatsapp')?.value.trim() || '';
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const acceptTerms = document.getElementById('chk-privacy-terms').checked;
    const isMerchant = document.getElementById('chk-is-merchant').checked;
    const storeName = document.getElementById('reg-store-name')?.value;
    const storeAddress = document.getElementById('reg-store-address')?.value || 'Pelotas / RS';
    const storePhone = document.getElementById('reg-store-phone')?.value || '';
    const storeInstagram = document.getElementById('reg-store-instagram')?.value.trim() || '';
    const storeCode = document.getElementById('reg-store-code')?.value.trim().toUpperCase();

    if (!email || !pass || !nome) return mostrarAviso("Atenção", "Preencha todos os campos.", "⚠️");
    if (!acceptTerms) return mostrarAviso("Atenção", "Você precisa aceitar os Termos de Privacidade.", "📜");

    let userRole = "cliente";
    if (isMerchant) {
      if (!CODIGOS_SECRETOS_LOJISTA.includes(storeCode)) {
        return mostrarAviso("Erro", "Código de ativação de parceiro incorreto.", "❌");
      }
      if (!storeName) return mostrarAviso("Atenção", "Informe o nome da empresa.", "⚠️");
      userRole = "lojista";
    }

    try {
      const res = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), pass);
      const userData = {
        nome: nome,
        email: email.trim().toLowerCase(),
        whatsapp: whatsapp,
        funcao: userRole,
        vip: false,
        criadoEm: new Date().toISOString()
      };

      if (isMerchant) {
        userData.empresaNome = storeName;
        userData.empresaEndereco = storeAddress;
        userData.empresaTelefone = storePhone;
        userData.empresaInstagram = storeInstagram;
        userData.ativo = true;
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

window.abrirTermosPrivacidade = function() {
  document.getElementById('modal-terms').classList.add('active');
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
  resetarEstadoUI();
  if (auth.currentUser) await signOut(auth);
};

window.gerarPixMercadoPago = async function() {
  const user = auth.currentUser;
  const emailPix = user ? user.email : "teste@clubprime.com";
  const btn = document.getElementById('btn-gerar-pix');
  if (btn) { btn.innerHTML = `<span class="spinner"></span> Gerando Pix...`; btn.style.opacity = "0.7"; btn.style.pointerEvents = "none"; }
  try {
    const response = await fetch('https://webhook-clubprime.vercel.app/api/criar-pix', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailPix.toLowerCase(), nome: window.currentUserData?.nome || 'Membro', userId: user ? user.uid : undefined })
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
      celebrarVip(data.message);
    } else { mostrarAviso("Aguardando ⏳", data.message || "Pagamento não compensado.", "ℹ️"); }
  } catch (err) { mostrarAviso("Erro", err.message, "❌"); }
  finally { btn.innerHTML = `🔄 Já Paguei / Checar Agora`; }
};

window.resgatarCupomReal = async function(cupomId, empresaId, empresaNome, titulo, prefixo, valorEconomia = 10.00, endereco = 'Pelotas / RS', telefone = '', regras = '', descontoPct = 10) {
  document.getElementById('modal-title').innerText = titulo;
  document.getElementById('modal-disc').innerText = empresaNome;
  document.getElementById('modal-address').innerText = endereco || 'Pelotas / RS';
  
  const phoneContainer = document.getElementById('modal-phone');
  if (telefone) {
    const foneLimpo = telefone.replace(/\D/g, '');
    phoneContainer.innerHTML = `<a href="https://wa.me/55${foneLimpo}?text=Olá,%20vi%20sua%20oferta%20no%20Clube%20Prime!" target="_blank" style="color:var(--primary); text-decoration:underline; font-weight:700;">${telefone} 📱 (Chamar no Zap)</a>`;
  } else {
    phoneContainer.innerText = 'Não informado';
  }

  document.getElementById('modal-rules').innerText = regras || 'Sem restrições';

  if (window.isVipUser) {
    document.getElementById('box-blocked').style.display = 'none';
    document.getElementById('box-unlocked').style.display = 'block';

    const user = auth.currentUser;
    const uidResgate = user?.uid || 'anonimo';
    let codigoUnico = null;

    // Se já existe um código gerado e ainda não usado para este cupom, reaproveita em vez de criar outro log
    try {
      const qExistente = query(
        collection(db, "logs_resgates"),
        where("usuarioUid", "==", uidResgate),
        where("cupomId", "==", cupomId),
        where("status", "==", "gerado")
      );
      const snapExistente = await getDocs(qExistente);
      if (!snapExistente.empty) codigoUnico = snapExistente.docs[0].data().codigoGerado || null;
    } catch(e) { console.error(e); }

    if (!codigoUnico) {
      const sufixoAleatorio = Math.random().toString(36).substring(2, 6).toUpperCase();
      const prefixoLimpo = (prefixo || 'PRIME').toUpperCase().replace(/[^A-Z0-9]/g, '');
      codigoUnico = `${prefixoLimpo}-${sufixoAleatorio}`;

      try {
        await addDoc(collection(db, "logs_resgates"), {
          usuarioUid: uidResgate,
          usuarioEmail: user?.email || 'desconhecido',
          usuarioNome: window.currentUserData?.nome || 'Membro VIP',
          usuarioWhatsapp: window.currentUserData?.whatsapp || '',
          cupomId: cupomId,
          cupomTitulo: titulo,
          descontoPct: descontoPct,
          empresaId: empresaId,
          empresaNome: empresaNome,
          codigoGerado: codigoUnico,
          status: "gerado",
          dataHora: new Date().toISOString()
        });
      } catch(e) { console.error(e); }
    }

    codigoCupomAtual = codigoUnico;
    document.getElementById('modal-code').innerText = codigoUnico;

    const qrContainer = document.getElementById('qrcode-canvas');
    if (qrContainer) {
      qrContainer.innerHTML = "";
      new QRCode(qrContainer, { text: codigoUnico, width: 120, height: 120 });
    }
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