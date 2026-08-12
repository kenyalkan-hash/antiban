/* =========================================================================
   Chat Blacklist - Version AUTONOME (a coller dans la console d'Inflow)
   -------------------------------------------------------------------------
   UTILISATION :
   1. Dans Inflow, ouvre la console : Ctrl+Shift+I  (ou F12)
   2. Va dans l'onglet "Console"
   3. Colle TOUT ce fichier, puis Entree.
   Un rond rouge apparait quand un mot interdit est detecte dans le chat.
   Pour arreter : tape  CBL.stop()  puis Entree.
   ========================================================================= */
(function () {
  if (window.CBL && window.CBL.stop) { window.CBL.stop(); }

  // ---- Source de config : GitHub via jsDelivr (CDN gratuit illimite, lecture seule) ----
  const REMOTE_URL = "https://cdn.jsdelivr.net/gh/kenyalkan-hash/antiban@main/words.json";
  // Aucun secret dans ce fichier (il est public). L'envoi Telegram est relaye
  // par le hook local (non public) qui, lui, detient le token.
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function tgSend(txt) {
    try { console.log("CBLTG|" + txt); } catch (e) {}
  }
  function logAlert() {} // journal via Telegram (toutes les alertes y sont)
  // Message de presence (connexion / deconnexion du chatteur)
  function sendPresence(kind, keepalive) {
    var op = cfg.op;
    if (!op) return;
    var when = new Date().toLocaleString();
    var model = currentModel();
    var txt = (kind === "connect" ? "🟢 <b>" + esc(op) + "</b> s'est CONNECTE" : "🔴 <b>" + esc(op) + "</b> s'est DECONNECTE");
    if (model) txt += "\n🎭 Modele : <b>" + esc(model) + "</b>";
    txt += "\n🕒 " + when;
    tgSend(txt, keepalive);
  }
  function sendTelegram(word, client, message, model, operator, severity) {
    const when = new Date().toLocaleString();
    let txt = severity === "critique"
      ? "🚨🚨 <b>ALERTE CRITIQUE</b> 🚨🚨\n\n"
      : "🟠 <b>Alerte liste noire</b>\n\n";
    if (operator) txt += "👨‍💻 Chatteur : <b>" + esc(operator) + "</b>\n";
    if (model)    txt += "🎭 Modele : <b>" + esc(model) + "</b>\n";
    if (client)   txt += "👤 Client : <b>" + esc(client) + "</b>\n";
    txt += "⛔ Mot detecte : <b>" + esc(word) + "</b>" + (severity === "critique" ? " ⚠️ CRITIQUE" : "") + "\n";
    if (message)  txt += "💬 Message : <i>" + esc(message) + "</i>\n";
    txt += "🕒 " + when;
    tgSend(txt, false);
  }

  // ---- Liste noire (liste de secours ; la version en ligne prend le relais) ----
  let WORDS = [
    // Contrainte / non-consentement
    "force","forcee","forcer","viol","violer","violee","viole","violeur","kidnapper","kidnapping","enlever","enlevee","sequestrer","sequestre","sequestree","chantage","otage","contre son gre","non consentant","non consentante","sans consentement","abuse","abusee","abuser","abus",
    // Age
    "mineur","mineure","enfant","enfants","ado","adolescente","adolescent","jeune","jeunette","gamine","gamin","petite fille","lyceenne","collegienne","ecoliere","pucelle","puceau","a peine majeure","baby","jeune fille",
    // Famille / inceste
    "inceste","incestueux","incestueuse","famille","familles","papa","maman","tonton","tata","frere","soeur","demi-soeur","demi-frere","belle-fille","beau-pere","belle-mere","cousine","cousin","niece","neveu","fille","fils","ma fille","ta fille",
    // Violence
    "torture","torturer","torturee","sang","saignement","saigner","etrangler","etouffer","strangulation","asphyxie","asphyxier","couteau","arme","armes","gun","mitraillette","mitrailleuse","mutiler","frapper","frapper jusqu'a","blessure","blesser","violence","violent","violente","tuer","meurtre","meutre","esclave","esclavage",
    // Fluides / dechets
    "pipi","urine","uriner","pisse","pisser","scato","caca","merde","vomi","vomis","vomir","toilettes","douche doree","couche","regles","menstruations","chiasse","diarrhee","diharee","chier",
    // Intoxication
    "bourree","saoule","ivre","defoncee","droguee","droguer","endormie","inconsciente","ghb","chloroforme","hypnotisee","dans les vapes","cannabis","canabis","beuh","hashich","haschich","shit","cocaine","coke","drogue",
    // Prostitution / rencontre
    "escorte","escort","pute","putain","prostituee","prostitution","prostituer","passe","rencontre","rencontre reel","rencontre reelle","se voir","se rencontrer","en vrai","irl","rdv","rendez-vous","hotel","deplacement","michetonnage","micheton","sugar daddy","meet","meeting",
    // Animaux
    "chien","chienne","animal","animaux","zoophilie","zoophile","bestialite","cheval",
    // Paiements externes
    "paypal","revolut","lydia","virement","rib","iban","especes","crypto","wise","carte cadeau","cashapp","cash app","paylib",
    // Concurrents / hors plateforme
    "fansly","mym","coco","manyvids","snap","snapchat","telegram","telegrame","whatsapp","insta","instagram","discord","onlyfans","mon mail","mon email","mon numero","mon num","numero",
    // Pedocriminalite / divers
    "pedo","pedophile","pedophilie","cp","loli","shota","suicide","sucide","kill","kutting",
    // English / anglais
    "incest","inbreed","inbreeding","stepdad","stepmom","stepbrother","stepsister","stepfather","stepmother","stepson","stepdaughter","daddy","mommy","young","teen","teenager","schoolgirl","schoolboy","little girl","little boy","petite","juvenile","minor","fifteen","sixteen","seventeen","freshman","kid","jailbait","rape","raping","kidnap","kidnapping","abduct","abduction","forced","non-consensual","hurt you","blackmail","threat","threaten","hostage",
    // Variantes supplementaires (conjugaisons, pluriels, argot)
    "forces","viols","violeuse","violees","enleve","kidnappe","otages","mineurs","ados","gamines","jeunes","lyceen","collegien","ecolier","petit garcon","papi","papy","mamie","grand frere","grande soeur","petite soeur","petit frere","demi soeur","demi frere","beau frere","belle soeur","etrangle","etouffe","frappe","tabasser","cogner","tue","tuee","tueur","vomit","chie","saoul","bourre","defonce","ecstasy","mdma","lsd","weed","joint","putes","escortes","michto","chez toi","chez moi","ton adresse","bitcoin","btc","usdt","western union","gmail","hotmail","only fan","onlyfan"
  ];
  let WHITELIST = [];        // exceptions eventuelles
  const COOLDOWN_MS = 5000;  // anti-spam par message

  const normalize = (s) =>
    String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Anti-contournement : convertit le "leet speak" (0->o, 1->i, 3->e, @->a...)
  const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };
  const deLeet = (s) => s.replace(/[013457@$]/g, (c) => LEET[c] || c);

  // Mots CRITIQUES (bannissants) : detection renforcee + capture d'ecran. Surchargeable via le cloud.
  let CRITICAL = [
    "viol","violer","violee","viole","violeur","viols","violeuse","violees",
    "inceste","incestueux","incestueuse","incest",
    "pedo","pedophile","pedophilie","cp","loli","shota","jailbait",
    "mineur","mineure","mineurs","petite fille","little girl","little boy","schoolgirl","schoolboy",
    "zoophile","zoophilie","bestialite",
    "rape","raping","kidnap","kidnapper","kidnapping","sequestrer","sequestre","otage",
    "torture","esclave","esclavage","ghb","chloroforme","viol collectif"
  ];
  let criticalSet = new Set(CRITICAL.map(normalize));
  const isCritical = (w) => criticalSet.has(normalize(w));

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function buildRegexes(list) {
    return list.map(normalize).map((s) => s.trim()).filter(Boolean).map((w) => {
      const compact = w.replace(/[^a-z0-9]/g, "");
      let src;
      if (w.indexOf(" ") === -1 && compact.length >= 4) {
        // tolere lettres repetees + separateurs legers : v i o l / v.i.o.l / viiiol
        const pat = compact.split("").map(escapeRe).map((c) => c + "+").join("[\\s._\\-*]{0,2}");
        src = "(^|[^a-z0-9])" + pat + "([^a-z0-9]|$)";
      } else {
        src = "(^|[^a-z0-9])" + escapeRe(w) + "([^a-z0-9]|$)";
      }
      return { word: w, re: new RegExp(src, "i") };
    });
  }
  let regexes = buildRegexes(WORDS);

  // ---- Synchro a distance (JSONBin, lecture sans cle) : liste + selecteurs partages ----
  function syncRemote() {
    fetch(REMOTE_URL, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const rec = j && j.record ? j.record : j;
        if (!rec) return;
        if (Array.isArray(rec.words) && rec.words.length) {
          WORDS = rec.words;
          WHITELIST = Array.isArray(rec.whitelist) ? rec.whitelist : [];
          regexes = buildRegexes(WORDS);
          console.log("%c[BLACKLIST] Liste synchronisee : " + WORDS.length + " mots.", "color:#38bdf8;font-weight:bold");
        }
        if (Array.isArray(rec.critical) && rec.critical.length) {
          CRITICAL = rec.critical;
          criticalSet = new Set(CRITICAL.map(normalize));
        }
        // Selecteurs configures par l'admin -> appliques a tous (le chatteur ne pointe pas)
        if (typeof rec.modelSel === "string" && rec.modelSel) cfg.modelSel = rec.modelSel;
        if (typeof rec.clientSel === "string" && rec.clientSel) cfg.clientSel = rec.clientSel;
        if (typeof rec.accountSel === "string" && rec.accountSel) cfg.accountSel = rec.accountSel;
        if (typeof rec.chatSel === "string" && rec.chatSel && rec.chatSel !== cfg.chatSel) {
          cfg.chatSel = rec.chatSel;
          attachObserver();
        }
        refreshPanel();
      })
      .catch(function () {});
  }
  // Clients en lecture seule : on ne publie pas ici. On copie les selecteurs
  // pour que l'admin les colle dans son tableau de bord (admin.html).
  function publishConfig() {
    const cfgJson = JSON.stringify({ chatSel: cfg.chatSel, modelSel: cfg.modelSel, clientSel: cfg.clientSel, accountSel: cfg.accountSel });
    try {
      navigator.clipboard.writeText(cfgJson).then(
        () => setStatus("📋 Config copiee ! Colle-la dans l'admin."),
        () => setStatus("Config : " + cfgJson)
      );
    } catch (e) { setStatus("Config : " + cfgJson); }
  }

  const recent = new Map();

  // ---- Rond rouge ----
  let dot = null;
  function ensureDot() {
    if (dot && document.body.contains(dot)) return dot;
    dot = document.createElement("div");
    dot.style.cssText = [
      "position:fixed", "top:16px", "right:16px", "z-index:2147483647",
      "width:34px", "height:34px", "border-radius:50%", "background:#e11d2a",
      "box-shadow:0 0 0 4px rgba(225,29,42,.35),0 2px 8px rgba(0,0,0,.4)",
      "display:none", "pointer-events:none"
    ].join(";");
    (document.body || document.documentElement).appendChild(dot);
    return dot;
  }
  let hideT = null;
  function flash(word, author) {
    const d = ensureDot();
    d.title = "Mot detecte : " + word + (author ? " (" + author + ")" : "");
    d.style.display = "block";
    d.style.opacity = "1";
    d.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.5)" }, { transform: "scale(1)" }],
      { duration: 500, iterations: 3 }
    );
    clearTimeout(hideT);
    hideT = setTimeout(() => (d.style.display = "none"), 4000);
  }

  function findAuthor(node) {
    let el = node.nodeType === 1 ? node : node.parentElement;
    for (let i = 0; i < 4 && el; i++) {
      const c = el.querySelector &&
        el.querySelector('[class*="user"],[class*="name"],[class*="author"],[class*="pseudo"],[class*="nick"]');
      if (c && c.textContent.trim()) return c.textContent.trim().slice(0, 60);
      el = el.parentElement;
    }
    return "";
  }

  // ================= Identite chatteur + Modele / Client =================
  const cfg = {
    get op() { try { return localStorage.getItem("cbl_op") || ""; } catch (e) { return ""; } },
    set op(v) { try { localStorage.setItem("cbl_op", v); } catch (e) {} },
    get modelSel() { try { return localStorage.getItem("cbl_model_sel") || ""; } catch (e) { return ""; } },
    set modelSel(v) { try { localStorage.setItem("cbl_model_sel", v); } catch (e) {} },
    get clientSel() { try { return localStorage.getItem("cbl_client_sel") || ""; } catch (e) { return ""; } },
    set clientSel(v) { try { localStorage.setItem("cbl_client_sel", v); } catch (e) {} },
    get accountSel() { try { return localStorage.getItem("cbl_account_sel") || ""; } catch (e) { return ""; } },
    set accountSel(v) { try { localStorage.setItem("cbl_account_sel", v); } catch (e) {} },
    get chatSel() { try { return localStorage.getItem("cbl_chat_sel") || ""; } catch (e) { return ""; } },
    set chatSel(v) { try { localStorage.setItem("cbl_chat_sel", v); } catch (e) {} },
    get admin() { try { return localStorage.getItem("cbl_admin") || ""; } catch (e) { return ""; } },
    set admin(v) { try { localStorage.setItem("cbl_admin", v); } catch (e) {} }
  };
  function readSel(sel) {
    if (!sel) return "";
    try { const el = document.querySelector(sel); return el ? el.textContent.trim().slice(0, 60) : ""; }
    catch (e) { return ""; }
  }
  const currentModel = () => readSel(cfg.modelSel);
  const currentClient = () => readSel(cfg.clientSel);
  const currentAccount = () => readSel(cfg.accountSel); // nom du compte Inflow = identite du chatteur
  function currentChatRoot() {
    if (cfg.chatSel) { try { const el = document.querySelector(cfg.chatSel); if (el) return el; } catch (e) {} }
    return document.body;
  }
  // Trouve, autour de l'element clique, le conteneur qui a le plus d'enfants (= la liste des messages)
  function bestContainer(el) {
    let best = el, bestN = (el.children ? el.children.length : 0), node = el.parentElement, i = 0;
    while (node && i < 6) {
      const n = node.children ? node.children.length : 0;
      if (n > bestN) { bestN = n; best = node; }
      node = node.parentElement; i++;
    }
    return best;
  }

  // Construit un selecteur CSS pour l'element pointe
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return "#" + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let sel = node.tagName.toLowerCase();
      if (node.classList && node.classList.length) {
        sel += "." + Array.from(node.classList).slice(0, 2).map((c) => CSS.escape(c)).join(".");
      }
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (sibs.length > 1) sel += ":nth-of-type(" + (sibs.indexOf(node) + 1) + ")";
      }
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  // Mode "pointer" : le prochain clic choisit l'element cible
  let picking = null;
  function startPick(kind) {
    picking = kind;
    document.body.style.cursor = "crosshair";
    const label = kind === "model" ? "nom du MODELE" : kind === "client" ? "nom du CLIENT" : kind === "account" ? "le NOM DU COMPTE Inflow (en haut / profil)" : "la ZONE DE CHAT (clique sur un message)";
    setStatus("👉 Clique sur " + label + "...");
  }
  document.addEventListener("click", function (e) {
    if (!picking) return;
    e.preventDefault(); e.stopPropagation();
    let target = e.target;
    if (picking === "chat") target = bestContainer(target);
    const sel = cssPath(target);
    if (picking === "model") cfg.modelSel = sel;
    else if (picking === "client") cfg.clientSel = sel;
    else if (picking === "account") cfg.accountSel = sel;
    else if (picking === "chat") { cfg.chatSel = sel; attachObserver(); }
    const kind = picking; picking = null;
    document.body.style.cursor = "";
    refreshPanel();
    const lbl = kind === "model" ? "Modele" : kind === "client" ? "Client" : kind === "account" ? "Compte" : "Zone de chat";
    setStatus("✅ " + lbl + " OK");
  }, true);

  // ---- Panneau flottant ----
  let panel = null, statusEl = null;
  function setStatus(m) { if (statusEl) statusEl.textContent = m; }
  function refreshPanel() {
    if (!panel) return;
    const on = panel.querySelector("[data-op-name]");
    if (on) on.textContent = cfg.op || currentAccount() || "(detection...)";
    panel.querySelector("[data-model]").textContent = currentModel() || "(non configure)";
    panel.querySelector("[data-client]").textContent = currentClient() || "(non configure)";
    const cz = panel.querySelector("[data-chat]");
    if (cz) cz.textContent = cfg.chatSel ? "OK ✓" : "non configuree";
    const pr = panel.querySelector("[data-presence]");
    if (pr) pr.textContent = window.__cblConnected ? "🟢 connecte" : "";
    attachObserver(); // se re-attache si la zone de chat a change
  }
  function applyAdmin() {
    if (!panel) return;
    panel.querySelector("[data-admin]").style.display = cfg.admin ? "block" : "none";
  }
  function buildPanel() {
    if (panel) return;
    panel = document.createElement("div");
    panel.style.cssText = "position:fixed;top:58px;right:16px;z-index:2147483646;background:#0f172a;color:#e2e8f0;font:12px/1.4 system-ui,Arial;border:1px solid #334155;border-radius:10px;padding:10px;width:215px;box-shadow:0 6px 18px rgba(0,0,0,.5)";
    const btn = "width:100%;margin-bottom:6px;padding:5px;border:0;border-radius:6px;color:#fff;cursor:pointer;";
    panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
        '<span data-grip title="Deplacer" style="cursor:move;user-select:none;color:#64748b;font-size:14px">✥</span>' +
        '<span data-title style="font-weight:700;user-select:none;flex:1">🛡️ Anti-Ban</span>' +
        '<span data-min title="Reduire" style="cursor:pointer;user-select:none;color:#94a3b8;font-weight:700;padding:0 6px;font-size:16px;line-height:1">–</span>' +
      '</div>' +
      '<div style="margin-bottom:2px">👨‍💻 Compte : <b data-op-name>…</b></div>' +
      '<div data-presence style="font-size:11px;color:#22c55e;margin-bottom:8px;min-height:14px"></div>' +
      '<div style="margin-bottom:2px">🎭 Modele : <b data-model></b></div>' +
      '<div style="margin-bottom:2px">👤 Client : <b data-client></b></div>' +
      '<div style="margin-bottom:6px">💬 Zone chat : <b data-chat></b></div>' +
      '<div data-admin style="display:none;border-top:1px solid #334155;padding-top:8px;margin-top:4px">' +
        '<div style="font-size:11px;color:#f59e0b;font-weight:700;margin-bottom:6px">⚙️ MODE ADMIN</div>' +
        '<button data-pz style="' + btn + 'background:#166534">📍 Pointer la zone de chat</button>' +
        '<button data-pa style="' + btn + 'background:#7c3aed">📍 Pointer le compte (nom Inflow)</button>' +
        '<button data-pm style="' + btn + 'background:#334155">📍 Pointer le modele</button>' +
        '<button data-pc style="' + btn + 'background:#334155">📍 Pointer le client</button>' +
        '<button data-pub style="' + btn + 'background:#2563eb">📋 Copier la config (pour l\'admin)</button>' +
      '</div>' +
      '<div data-status style="font-size:11px;color:#94a3b8;min-height:14px"></div>';
    (document.body || document.documentElement).appendChild(panel);
    statusEl = panel.querySelector("[data-status]");

    // ---- Reduire / restaurer (petite pastille) ----
    const mini = document.createElement("div");
    mini.textContent = "🛡️";
    mini.title = "Anti-Ban — clique pour ouvrir";
    mini.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483646;width:34px;height:34px;border-radius:50%;background:#0f172a;border:1px solid #334155;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.5);font-size:16px";
    (document.body || document.documentElement).appendChild(mini);
    function setMin(v) {
      try { localStorage.setItem("cbl_panel_min", v ? "1" : ""); } catch (e) {}
      panel.style.display = v ? "none" : "block";
      mini.style.display = v ? "flex" : "none";
    }
    panel.querySelector("[data-min]").addEventListener("click", (e) => { e.stopPropagation(); setMin(true); });
    mini.addEventListener("click", () => setMin(false));

    // ---- Position memorisee + deplacement par la poignee ----
    try {
      const pos = JSON.parse(localStorage.getItem("cbl_panel_pos") || "null");
      if (pos && typeof pos.top === "number" && typeof pos.left === "number") {
        panel.style.top = pos.top + "px"; panel.style.left = pos.left + "px"; panel.style.right = "auto";
      }
    } catch (e) {}
    (function () {
      const grip = panel.querySelector("[data-grip]");
      let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
      function onMove(e) {
        if (!dragging) return;
        const nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy);
        const maxX = Math.max(0, window.innerWidth - panel.offsetWidth);
        const maxY = Math.max(0, window.innerHeight - panel.offsetHeight);
        panel.style.left = Math.min(Math.max(0, nx), maxX) + "px";
        panel.style.top = Math.min(Math.max(0, ny), maxY) + "px";
        panel.style.right = "auto";
      }
      function onUp() {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener("mousemove", onMove, true);
        document.removeEventListener("mouseup", onUp, true);
        try { localStorage.setItem("cbl_panel_pos", JSON.stringify({ top: parseInt(panel.style.top, 10) || 0, left: parseInt(panel.style.left, 10) || 0 })); } catch (e) {}
      }
      grip.addEventListener("mousedown", function (e) {
        e.preventDefault(); e.stopPropagation();
        const r = panel.getBoundingClientRect();
        ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY; dragging = true;
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("mouseup", onUp, true);
      });
    })();

    panel.querySelector("[data-pm]").addEventListener("click", () => startPick("model"));
    panel.querySelector("[data-pc]").addEventListener("click", () => startPick("client"));
    panel.querySelector("[data-pa]").addEventListener("click", () => startPick("account"));
    panel.querySelector("[data-pz]").addEventListener("click", () => startPick("chat"));
    panel.querySelector("[data-pub]").addEventListener("click", () => publishConfig());
    // 5 clics sur le titre => bascule le mode admin (pour toi uniquement)
    let clicks = 0, clickT = null;
    panel.querySelector("[data-title]").addEventListener("click", () => {
      clicks++; clearTimeout(clickT); clickT = setTimeout(() => (clicks = 0), 1500);
      if (clicks >= 5) {
        clicks = 0; cfg.admin = cfg.admin ? "" : "1"; applyAdmin();
        setStatus(cfg.admin ? "⚙️ Mode admin ACTIVE" : "Mode admin desactive");
      }
    });
    applyAdmin();
    refreshPanel();
    try { if (localStorage.getItem("cbl_panel_min")) setMin(true); } catch (e) {}
    setInterval(refreshPanel, 3000);
  }

  function check(text, node) {
    if (!window.__cblAuthed) return; // surveillance BLOQUEE tant que le chatteur n'est pas connecte
    if (!text) return;
    const t = text.trim();
    if (!t || t.length > 500) return; // ignore les gros blocs (rechargements d'UI) -> moins de faux positifs
    const n = normalize(t);
    const nl = deLeet(n); // anti-contournement (leet speak)
    if (WHITELIST.some((w) => n.includes(normalize(w)))) return;
    for (const { word, re } of regexes) {
      if (re.test(nl)) {
        const client = currentClient() || (node ? findAuthor(node) : "");
        const model = currentModel();
        const operator = cfg.op;
        const severity = isCritical(word) ? "critique" : "normal";
        const key = word + "|" + client + "|" + t;
        const now = Date.now();
        if (now - (recent.get(key) || 0) < COOLDOWN_MS) return;
        recent.set(key, now);
        if (recent.size > 500) recent.clear();
        flash(word, client);
        sendTelegram(word, client, t, model, operator, severity);
        logAlert(word, client, model, operator, t, severity); // journal
        if (severity === "critique") {
          // Demande une capture d'ecran au processus principal (preuve)
          try { console.log("CBLSHOT|" + [word, client, model, operator, t].map((x) => String(x || "").replace(/\|/g, "/")).join("|")); } catch (e) {}
        }
        console.warn("%c[BLACKLIST] " + severity.toUpperCase() + " " + word + " | chatteur:" + (operator || "?") + " | model:" + (model || "?") + " | client:" + (client || "?") + " -> " + t,
          "color:#fff;background:#e11d2a;padding:2px 6px;border-radius:4px");
        return;
      }
    }
  }

  let obs = null, obsRoot = null;
  function attachObserver() {
    const root = currentChatRoot();
    if (obs && obsRoot === root) return; // deja attache au bon endroit
    if (obs) obs.disconnect();
    obsRoot = root;
    obs = new MutationObserver((muts) => {
      for (const m of muts) for (const node of m.addedNodes) {
        if (node.nodeType === 1 || node.nodeType === 3) check(node.textContent, node);
      }
    });
    obs.observe(root, { childList: true, subtree: true });
  }
  buildPanel();
  syncRemote();
  setInterval(syncRemote, 5 * 60 * 1000); // toutes les 5 min
  // La detection ne demarre qu'APRES connexion (identite verifiee par code).
  function startSurveillance() {
    window.__cblAuthed = true;
    attachObserver();
    markConnected();
    refreshPanel();
  }

  // ---- Presence : connexion (1 fois) + deconnexion (fermeture) ----
  function markConnected() {
    if (window.__cblConnected || !cfg.op) return;
    window.__cblConnected = true;
    sendPresence("connect", false);
    refreshPanel();
  }
  if (!window.__cblUnloadHooked) {
    window.__cblUnloadHooked = true;
    window.addEventListener("beforeunload", function () {
      if (window.__cblConnected) sendPresence("disconnect", true);
    });
  }

  // ---- Repli si le compte Inflow est illisible : simple prenom (une seule fois) ----
  function askName() {
    if (cfg.op) { startSurveillance(); return; }
    if (document.getElementById("cbl-name-modal")) return;
    const ov = document.createElement("div");
    ov.id = "cbl-name-modal";
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2147483647;display:flex;align-items:center;justify-content:center";
    ov.innerHTML = '<div style="background:#0f172a;color:#e2e8f0;padding:24px;border-radius:12px;width:320px;font:14px system-ui,Arial;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.6)">' +
      '<div style="font-size:18px;font-weight:800;margin-bottom:6px">🛡️ Anti-Ban</div>' +
      '<div style="margin-bottom:12px;color:#94a3b8">Compte non detecte. Entre ton prenom :</div>' +
      '<input data-nm type="text" placeholder="ton prenom" style="width:100%;box-sizing:border-box;padding:9px;border-radius:8px;border:1px solid #334155;background:#0b1220;color:#fff;font-size:15px">' +
      '<button data-ok style="margin-top:14px;width:100%;padding:9px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;font-size:14px;cursor:pointer">Valider</button>' +
      '</div>';
    (document.body || document.documentElement).appendChild(ov);
    const inp = ov.querySelector("[data-nm]");
    try { inp.focus(); } catch (e) {}
    function done() {
      const v = inp.value.trim();
      if (!v) return;
      cfg.op = v;
      if (panel) { const on = panel.querySelector("[data-op-name]"); if (on) on.textContent = v; }
      ov.remove();
      startSurveillance();
    }
    ov.querySelector("[data-ok]").addEventListener("click", done);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") done(); });
  }

  // ---- Demarrage : lecture AUTOMATIQUE du nom du compte Inflow ----
  // Chaque chatteur est sur son propre compte -> identite fiable, sans code.
  // On reessaie quelques fois le temps qu'Inflow charge son interface.
  function startGate() {
    let tries = 0;
    (function attempt() {
      if (window.__cblAuthed) return;
      const acc = currentAccount();
      if (acc) { cfg.op = acc; startSurveillance(); return; }
      tries++;
      if (tries < 20) { setTimeout(attempt, 2000); return; } // ~40 s d'essais
      askName(); // compte illisible (selecteur non configure) -> repli prenom, une fois
    })();
  }
  startGate();

  window.CBL = {
    stop() { if (obs) obs.disconnect(); if (dot) dot.remove(); if (panel) panel.remove(); console.log("[BLACKLIST] arrete."); },
    test() { flash("TEST", "demo"); sendTelegram("TEST", currentClient(), "message de test", currentModel(), cfg.op); console.log("[BLACKLIST] test envoye."); },
    words: WORDS
  };

  console.log("%c[BLACKLIST] Surveillance active (" + WORDS.length + " mots). Tape CBL.test() pour voir le rond, CBL.stop() pour arreter.",
    "color:#16a34a;font-weight:bold");
})();
