/**
 * ECO Chat Widget — eco-col.com
 * 
 * Instrucciones WordPress:
 * 1. Sube este archivo a tu servidor o usa la URL del servidor ECO
 * 2. En WordPress > Apariencia > Editor de temas (o con un plugin de snippets HTML):
 *    Agrega antes del </body>:
 *    <script src="https://eco-social-posts.replit.app/eco-chat-widget.js"></script>
 *
 * Personalización opcional (antes del script):
 * <script>window.ECO_CHAT_CONFIG = { apiUrl: "...", primaryColor: "#0077FF" };</script>
 */
(function () {
  const CONFIG = Object.assign({
    apiUrl: "https://eco-social-posts.replit.app/api/chatbot/message",
    primaryColor: "#0077FF",
    accentColor: "#00C2FF",
    botName: "ECO Asistente",
    welcomeMessage: "¡Hola! Soy el asistente virtual de ECO ☀️\n\n¿En qué te puedo ayudar? Puedo responder tus preguntas sobre energía solar, instalaciones, beneficios tributarios, o cuánto puedes ahorrar.",
    placeholder: "Escribe tu pregunta...",
  }, window.ECO_CHAT_CONFIG || {});

  // ── Session ID ──
  let sessionId = localStorage.getItem("eco_chat_session");
  if (!sessionId) {
    sessionId = "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("eco_chat_session", sessionId);
  }

  // ── Styles ──
  const style = document.createElement("style");
  style.textContent = `
    #eco-chat-bubble { position:fixed; bottom:24px; right:24px; z-index:99999; font-family:'Poppins','Segoe UI',sans-serif; }
    #eco-chat-toggle {
      width:60px; height:60px; border-radius:50%; background:linear-gradient(135deg,${CONFIG.primaryColor},${CONFIG.accentColor});
      border:none; cursor:pointer; box-shadow:0 4px 16px rgba(0,119,255,.4);
      display:flex; align-items:center; justify-content:center; transition:transform .2s;
    }
    #eco-chat-toggle:hover { transform:scale(1.08); }
    #eco-chat-toggle svg { width:28px; height:28px; fill:white; }
    #eco-chat-badge {
      position:absolute; top:-4px; right:-4px; background:#FF3B30; color:white;
      border-radius:50%; width:20px; height:20px; font-size:11px; font-weight:700;
      display:none; align-items:center; justify-content:center;
    }
    #eco-chat-box {
      display:none; position:fixed; bottom:96px; right:24px; width:360px; max-height:560px;
      background:#fff; border-radius:20px; box-shadow:0 8px 40px rgba(0,0,0,.18);
      flex-direction:column; overflow:hidden; z-index:99999;
    }
    #eco-chat-box.open { display:flex; }
    #eco-chat-header {
      background:linear-gradient(135deg,${CONFIG.primaryColor},${CONFIG.accentColor});
      padding:16px 18px; display:flex; align-items:center; gap:12px; color:white;
    }
    #eco-chat-header .avatar {
      width:40px; height:40px; border-radius:50%; background:rgba(255,255,255,.2);
      display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;
    }
    #eco-chat-header .info { flex:1; }
    #eco-chat-header .name { font-weight:700; font-size:15px; }
    #eco-chat-header .status { font-size:12px; opacity:.85; }
    #eco-chat-close { background:none; border:none; color:white; cursor:pointer; font-size:20px; padding:4px; opacity:.8; }
    #eco-chat-close:hover { opacity:1; }
    #eco-chat-messages {
      flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px;
      background:#f7f9fb; min-height:200px;
    }
    .eco-msg { max-width:85%; word-break:break-word; animation:ecofadeIn .25s ease; }
    @keyframes ecofadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    .eco-msg.bot { align-self:flex-start; }
    .eco-msg.user { align-self:flex-end; }
    .eco-msg .bubble {
      padding:10px 14px; border-radius:18px; font-size:14px; line-height:1.5;
    }
    .eco-msg.bot .bubble { background:#fff; color:#1a1a2e; box-shadow:0 1px 4px rgba(0,0,0,.08); border-bottom-left-radius:4px; }
    .eco-msg.user .bubble { background:linear-gradient(135deg,${CONFIG.primaryColor},${CONFIG.accentColor}); color:white; border-bottom-right-radius:4px; }
    .eco-msg .time { font-size:11px; color:#aaa; margin-top:4px; }
    .eco-msg.bot .time { margin-left:4px; }
    .eco-msg.user .time { text-align:right; margin-right:4px; }
    .eco-typing { display:flex; gap:5px; padding:12px 14px; }
    .eco-typing span { width:8px; height:8px; border-radius:50%; background:#ccc; animation:ecoTyping 1.2s infinite; }
    .eco-typing span:nth-child(2) { animation-delay:.2s; }
    .eco-typing span:nth-child(3) { animation-delay:.4s; }
    @keyframes ecoTyping { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
    #eco-chat-footer { padding:12px 14px; background:#fff; border-top:1px solid #f0f0f0; display:flex; gap:8px; }
    #eco-chat-input {
      flex:1; border:1.5px solid #e5e7eb; border-radius:12px; padding:10px 14px;
      font-size:14px; font-family:inherit; outline:none; resize:none; max-height:100px;
      transition:border-color .2s;
    }
    #eco-chat-input:focus { border-color:${CONFIG.primaryColor}; }
    #eco-chat-send {
      width:42px; height:42px; border-radius:12px; border:none; cursor:pointer;
      background:linear-gradient(135deg,${CONFIG.primaryColor},${CONFIG.accentColor});
      display:flex; align-items:center; justify-content:center; flex-shrink:0; align-self:flex-end;
    }
    #eco-chat-send:disabled { opacity:.5; cursor:not-allowed; }
    #eco-chat-send svg { width:18px; height:18px; fill:white; }
    #eco-chat-quick { display:flex; flex-wrap:wrap; gap:6px; padding:0 14px 10px; background:#fff; }
    .eco-quick-btn {
      font-size:12px; padding:6px 12px; border-radius:20px; border:1.5px solid ${CONFIG.primaryColor};
      color:${CONFIG.primaryColor}; background:white; cursor:pointer; transition:all .15s;
    }
    .eco-quick-btn:hover { background:${CONFIG.primaryColor}; color:white; }
    @media(max-width:420px) {
      #eco-chat-box { width:calc(100vw - 24px); right:12px; bottom:88px; }
      #eco-chat-bubble { right:12px; bottom:16px; }
    }
  `;
  document.head.appendChild(style);

  // ── HTML ──
  const wrap = document.createElement("div");
  wrap.id = "eco-chat-bubble";
  wrap.innerHTML = `
    <div id="eco-chat-box">
      <div id="eco-chat-header">
        <div class="avatar">☀️</div>
        <div class="info">
          <div class="name">${CONFIG.botName}</div>
          <div class="status">● En línea — Responde en segundos</div>
        </div>
        <button id="eco-chat-close" title="Cerrar">✕</button>
      </div>
      <div id="eco-chat-messages"></div>
      <div id="eco-chat-quick">
        <button class="eco-quick-btn" data-q="¿Cuánto puedo ahorrar con paneles solares?">💰 ¿Cuánto ahorro?</button>
        <button class="eco-quick-btn" data-q="¿Cuánto cuesta instalar paneles solares?">💵 ¿Cuánto cuesta?</button>
        <button class="eco-quick-btn" data-q="¿Cómo es el proceso de instalación?">⚡ ¿Cómo funciona?</button>
        <button class="eco-quick-btn" data-q="¿Tienen financiación disponible?">🏦 Financiación</button>
      </div>
      <div id="eco-chat-footer">
        <textarea id="eco-chat-input" rows="1" placeholder="${CONFIG.placeholder}" maxlength="2000"></textarea>
        <button id="eco-chat-send" disabled title="Enviar">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
    <button id="eco-chat-toggle" title="Chat con ECO">
      <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
    </button>
    <div id="eco-chat-badge">1</div>
  `;
  document.body.appendChild(wrap);

  // ── Logic ──
  const box = document.getElementById("eco-chat-box");
  const toggle = document.getElementById("eco-chat-toggle");
  const close = document.getElementById("eco-chat-close");
  const msgArea = document.getElementById("eco-chat-messages");
  const input = document.getElementById("eco-chat-input");
  const sendBtn = document.getElementById("eco-chat-send");
  const badge = document.getElementById("eco-chat-badge");
  const quickBtns = document.querySelectorAll(".eco-quick-btn");

  let isOpen = false;
  let isWaiting = false;
  let badgeCount = 0;
  let greetingShown = false;

  function formatTime() {
    const d = new Date();
    return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  function addMessage(text, role) {
    const div = document.createElement("div");
    div.className = "eco-msg " + role;
    const lines = escapeHtml(text).replace(/\n/g, "<br>");
    div.innerHTML = `<div class="bubble">${lines}</div><div class="time">${formatTime()}</div>`;
    msgArea.appendChild(div);
    msgArea.scrollTop = msgArea.scrollHeight;
  }

  function showTyping() {
    const t = document.createElement("div");
    t.className = "eco-msg bot";
    t.id = "eco-typing-indicator";
    t.innerHTML = `<div class="bubble eco-typing"><span></span><span></span><span></span></div>`;
    msgArea.appendChild(t);
    msgArea.scrollTop = msgArea.scrollHeight;
  }

  function hideTyping() {
    const t = document.getElementById("eco-typing-indicator");
    if (t) t.remove();
  }

  function showGreeting() {
    if (greetingShown) return;
    greetingShown = true;
    addMessage(CONFIG.welcomeMessage, "bot");
  }

  async function sendMessage(text) {
    if (!text.trim() || isWaiting) return;
    isWaiting = true;
    input.value = "";
    input.style.height = "auto";
    sendBtn.disabled = true;

    addMessage(text, "user");
    document.getElementById("eco-chat-quick").style.display = "none";
    showTyping();

    try {
      const res = await fetch(CONFIG.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json();
      hideTyping();
      addMessage(data.reply || "Lo siento, hubo un error. ¿Puedes repetir tu pregunta?", "bot");
    } catch (_) {
      hideTyping();
      addMessage("Parece que hay un problema de conexión. Intenta de nuevo en un momento.", "bot");
    } finally {
      isWaiting = false;
      checkInput();
    }
  }

  function checkInput() {
    sendBtn.disabled = !input.value.trim() || isWaiting;
  }

  toggle.addEventListener("click", function () {
    isOpen = !isOpen;
    box.classList.toggle("open", isOpen);
    if (isOpen) {
      showGreeting();
      badgeCount = 0;
      badge.style.display = "none";
      setTimeout(() => input.focus(), 100);
    }
  });

  close.addEventListener("click", function () {
    isOpen = false;
    box.classList.remove("open");
  });

  sendBtn.addEventListener("click", () => sendMessage(input.value));

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });

  input.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 100) + "px";
    checkInput();
  });

  quickBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      sendMessage(this.dataset.q);
    });
  });

  // Show badge after 8 seconds if chat not opened
  setTimeout(function () {
    if (!isOpen && !greetingShown) {
      badgeCount = 1;
      badge.style.display = "flex";
    }
  }, 8000);
})();
