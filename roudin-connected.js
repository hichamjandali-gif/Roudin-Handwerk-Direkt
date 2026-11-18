/* Roudin Handwerk Direkt — marketplace connection and role-safe UI */
(function () {
  "use strict";

  const SB_URL = "https://wivothjoddoyntatlqhy.supabase.co";
  const SB_KEY = "sb_publishable_sfQ-JArGmLvmM8xwcjYM5w_tlrNLS_c";
  let session = null;
  let profile = { account_type: "customer" };
  let profileExists = false;
  let ads = [];
  let currentAd = null;
  let activeConversation = null;
  let editingAdId = null;
  let detailOrigin = "home";

  const tr = (ar, de) => lang === "ar" ? ar : de;
  const notify = (error) => toast(error && error.message ? error.message : String(error));
  const currentUserId = () => session && session.user ? session.user.id : null;
  const isOwner = (ad) => !!currentUserId() && ad && ad.owner_id === currentUserId();
  const canSendOffers = () => profile.account_type === "worker" || profile.account_type === "both";
  const canPostRole = (role) => role === "need"
    ? profile.account_type === "customer" || profile.account_type === "both"
    : role === "offer"
      ? profile.account_type === "worker" || profile.account_type === "both"
      : true;

  async function loadProfile() {
    if (!currentUserId()) {
      profile = { account_type: "customer" };
      profileExists = false;
      return;
    }
    const rows = await api("/rest/v1/roudin_profiles?select=account_type&user_id=eq." + encodeURIComponent(currentUserId()));
    profileExists = !!(rows && rows[0]);
    profile = { account_type: profileExists ? rows[0].account_type : "customer" };
  }

  async function saveProfileType() {
    const value = $("#accountType").value;
    if (!["customer", "worker", "both"].includes(value)) return;
    const row = { user_id: currentUserId(), account_type: value };
    if (profileExists) {
      await api("/rest/v1/roudin_profiles?user_id=eq." + encodeURIComponent(currentUserId()), "PATCH", { account_type: value });
    } else {
      await api("/rest/v1/roudin_profiles", "POST", row);
      profileExists = true;
    }
    profile = { account_type: value };
    toast(tr("تم حفظ نوع الحساب.", "Kontotyp gespeichert."));
  }

  async function api(path, method, data, authenticated) {
    method = method || "GET";
    authenticated = authenticated !== false;
    const headers = { apikey: SB_KEY, "Content-Type": "application/json" };
    if (authenticated && session && session.access_token) {
      headers.Authorization = "Bearer " + session.access_token;
    }
    if (method === "POST" || method === "PATCH") headers.Prefer = "return=representation";
    const response = await fetch(SB_URL + path, {
      method: method,
      headers: headers,
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    const raw = await response.text();
    let result = null;
    try { result = raw ? JSON.parse(raw) : null; } catch (_) { result = raw; }
    if (!response.ok) {
      const message = result && (result.message || result.msg || result.error_description || result.hint);
      throw new Error(message || ("HTTP " + response.status));
    }
    return result;
  }

  function cleanDescription(value) {
    return String(value || "").replace(/\s*\[\[ROUDIN_WORK_DATE:\d{4}-\d{2}-\d{2}\]\]\s*$/, "").trim();
  }
  function workDateOf(ad) {
    const match = String(ad && ad.description || "").match(/\[\[ROUDIN_WORK_DATE:(\d{4}-\d{2}-\d{2})\]\]/);
    if (match) return match[1];
    return "";
  }
  function storedDescription(text, date) {
    return cleanDescription(text) + "\n\n[[ROUDIN_WORK_DATE:" + date + "]]";
  }
  function normal(value) {
    return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  }
  function uniqueAds(rows) {
    const seenIds = new Set();
    const seenFingerprints = new Set();
    return (Array.isArray(rows) ? rows : []).filter(function (ad) {
      if (!ad || !ad.id) return false;
      if (seenIds.has(ad.id)) return false;
      seenIds.add(ad.id);
      const fingerprint = [
        ad.owner_id || "", ad.role || "", normal(ad.title), normal(ad.city),
        normal(cleanDescription(ad.description))
      ].join("|");
      if (seenFingerprints.has(fingerprint)) return false;
      seenFingerprints.add(fingerprint);
      return true;
    });
  }
  function dateLabel(value) {
    if (!value) return tr("غير محدد", "Nicht angegeben");
    const date = new Date(value + "T12:00:00");
    return isNaN(date.getTime()) ? value : date.toLocaleDateString(lang === "ar" ? "ar-DE" : "de-DE");
  }
  function priceLabel(ad) {
    const value = String(ad && ad.price || "").trim();
    return value || tr("حسب الاتفاق", "Nach Vereinbarung");
  }
  function applyTranslations() {
    document.title = "Roudin Handwerk Direkt";
    translations.de.free = "100 % kostenlos – keine Provision";
    translations.ar.free = "مجاني 100% بلا عمولة";
    translations.de.ads = "Anzeigen";
    translations.ar.ads = "الإعلانات";
    translations.de.save = "Anzeige veröffentlichen";
    translations.ar.save = "نشر الإعلان";
    translations.de.price = "Preis / Budget (EUR) *";
    translations.ar.price = "السعر أو الميزانية (يورو) *";
    translations.de.privacy = "Veröffentlichung nur mit Konto. Telefonnummern werden nicht öffentlich angezeigt.";
    translations.ar.privacy = "النشر يتطلب حساباً. أرقام الهواتف لا تظهر للعامة.";
    translations.de.photoNote = "Das Foto wird sicher mit deiner Anzeige gespeichert.";
    translations.ar.photoNote = "يتم حفظ الصورة مع إعلانك.";
    translations.de.step3sub = "Angebote vergleichen und nach Annahme Kontakt aufnehmen.";
    translations.ar.step3sub = "قارن العروض وتواصل بعد قبول العرض.";
    translations.de.step2sub = "Vergleiche Angebote und wähle den passenden Handwerker.";
    translations.ar.step2sub = "قارن عروض الحرفيين واختر الأنسب.";
    translations.de.workDate = "Gewünschter Arbeits- / Verfügbarkeitstermin *";
    translations.ar.workDate = "موعد تنفيذ العمل / التوفر *";
    navLabels.ar.orders = "عمل للحرفيين";
    navLabels.de.orders = "Aufträge für Handwerker";
    navLabels.ar.mine = "طلباتي / إعلاناتي";
    navLabels.de.mine = "Meine Anzeigen";
    navLabels.ar.workers = "أبحث عن حرفي";
    navLabels.de.workers = "Handwerker finden";
    $("#demoLabel").textContent = tr("سوق مجاني للحرفيين والزبائن", "Kostenloser Marktplatz für Handwerker und Kunden");
    $(".foot").textContent = tr("Roudin Handwerk Direkt · مجاني للجميع", "Roudin Handwerk Direkt · Kostenlos für alle");
    const dateLabelEl = $("#workDateLabel");
    if (dateLabelEl) dateLabelEl.textContent = translations[lang].workDate;
    const saveButton = $("#saveAdBtn");
    if (saveButton) saveButton.textContent = translations[lang].save;
  }

  function setSession(value) {
    if (!value) {
      session = null;
      localStorage.removeItem("roudin_auth");
      return;
    }
    session = Object.assign({}, value, {
      expires_at: value.expires_at || (Math.floor(Date.now() / 1000) + (value.expires_in || 3600))
    });
    localStorage.setItem("roudin_auth", JSON.stringify(session));
  }

  async function restoreSession() {
    const raw = localStorage.getItem("roudin_auth");
    if (raw) {
      try {
        session = JSON.parse(raw);
        if (Date.now() > Number(session.expires_at || 0) * 1000 - 60000) {
          if (!session.refresh_token) throw new Error("Session expired");
          const refreshed = await api("/auth/v1/token?grant_type=refresh_token", "POST", {
            refresh_token: session.refresh_token
          }, false);
          setSession(refreshed);
        }
      } catch (_) {
        setSession(null);
      }
    }
    if (session) {
      try { await loadProfile(); } catch (error) { notify(error); }
    }
    await refreshAds();
  }

  async function refreshAds() {
    try {
      const rows = await api("/rest/v1/roudin_ads?select=*&order=created_at.desc&limit=1000", "GET");
      ads = uniqueAds(rows);
      renderAds();
    } catch (error) {
      notify(error);
    }
  }

  function renderCard(ad, tools) {
    const image = ad.photo_url
      ? '<img src="' + esc(ad.photo_url) + '" alt="" style="width:100%;max-height:190px;object-fit:cover;border-radius:10px;margin:7px 0">'
      : "";
    const ownerTag = isOwner(ad)
      ? '<span class="pill">' + tr("هذا إعلانك", "Deine Anzeige") + "</span>"
      : "";
    const details = '<button type="button" class="secondary" data-detail-id="' + esc(ad.id) + '">' + tr("التفاصيل", "Details") + "</button>";
    let ownerTools = "";
    if (tools && isOwner(ad)) {
      ownerTools = '<div class="row" style="margin-top:14px;padding-top:12px;border-top:1px solid #e4ebe6">' +
        '<button type="button" class="secondary" data-edit-id="' + esc(ad.id) + '">' + tr("تعديل الإعلان", "Anzeige bearbeiten") + "</button>" +
        '<button type="button" class="secondary" data-delete-id="' + esc(ad.id) + '">' + tr("حذف الإعلان", "Anzeige löschen") + "</button></div>";
    }
    return '<article class="listing">' + ownerTag +
      '<span class="pill">' + esc(typeLabel(ad.role)) + "</span>" +
      "<h3>" + esc(ad.title) + "</h3>" +
      image +
      '<div class="meta">📍 ' + esc(ad.city || "") + " " + esc(ad.postal || "") + " · " + esc(ad.service || "") + "</div>" +
      "<p>" + esc(cleanDescription(ad.description)).slice(0, 190) + "</p>" +
      '<p class="meta">' + tr("السعر", "Preis") + ": " + esc(priceLabel(ad)) + " · " +
      tr("التاريخ", "Datum") + ": " + esc(dateLabel(workDateOf(ad))) + "</p>" +
      '<div class="row">' + details + "</div>" + ownerTools + "</article>";
  }

  renderAds = function () {
    const container = $("#listings");
    if (!container) return;
    container.innerHTML = ads.length
      ? ads.map(function (ad) { return renderCard(ad, false); }).join("")
      : '<div class="empty">' + tr("لا توجد إعلانات منشورة بعد. يمكنك إنشاء إعلان جديد.", "Noch keine Anzeigen veröffentlicht. Erstelle eine neue Anzeige.") + "</div>";
    bindDetailButtons(container);
  };

  function bindDetailButtons(container) {
    container.querySelectorAll("[data-detail-id]").forEach(function (button) {
      button.onclick = function () { openDetail(button.dataset.detailId); };
    });
    container.querySelectorAll("[data-edit-id]").forEach(function (button) {
      button.onclick = function () { openEditForm(button.dataset.editId); };
    });
    container.querySelectorAll("[data-delete-id]").forEach(function (button) {
      button.onclick = function () { deleteAd(button.dataset.deleteId); };
    });
  }

  function setDetailHeading() {
    const heading = $("#detailHeading");
    if (!heading) return;
    if (detailOrigin === "orders") heading.textContent = tr("عمل للحرفيين", "Aufträge für Handwerker");
    else if (detailOrigin === "workers") heading.textContent = tr("أبحث عن حرفي", "Handwerker finden");
    else heading.textContent = tr("تفاصيل الإعلان", "Anzeigendetails");
  }

  async function openDetail(id) {
    const ad = ads.find(function (item) { return item.id === id; });
    if (!ad) return;
    currentAd = ad;
    detailOrigin = activeTab || "home";
    setDetailHeading();
    const owner = isOwner(ad);
    const workDate = workDateOf(ad);
    const description = cleanDescription(ad.description);
    const image = ad.photo_url
      ? '<img src="' + esc(ad.photo_url) + '" alt="" style="width:100%;max-height:320px;object-fit:contain;border-radius:12px;margin:8px 0">'
      : "";
    let actions = "";
    if (owner) {
      actions = '<p class="tab-note">' + tr("هذا إعلانك", "Das ist deine Anzeige") + '</p><button type="button" class="primary" id="detailEdit">' +
        tr("هذا إعلانك – تعديل", "Deine Anzeige – bearbeiten") + "</button>";
    } else if (ad.role === "need" && canSendOffers()) {
      actions = '<button type="button" class="primary" id="detailSendQuote">' + tr("إرسال عرض", "Angebot senden") + "</button>";
    } else if (ad.role === "need") {
      actions = '<p class="note">' + tr("لإرسال عرض، غيّر نوع حسابك إلى حرفي من صفحة حسابي.", "Zum Senden eines Angebots stelle deinen Kontotyp unter Profil auf Handwerker.") + '</p><button type="button" class="secondary" id="detailChooseWorker">' + tr("تغيير نوع الحساب", "Kontotyp ändern") + "</button>";
    } else {
      actions = '<button type="button" class="primary" id="detailContact">' + tr("مراسلة مقدم الخدمة", "Anbieter kontaktieren") + "</button>";
    }
    $("#detail").innerHTML =
      '<span class="pill">' + esc(typeLabel(ad.role)) + "</span>" +
      "<h2>" + esc(ad.title) + "</h2>" + image +
      '<p class="meta">📍 ' + esc(ad.city || "") + " " + esc(ad.postal || "") + " · " + esc(ad.service || "") + "</p>" +
      '<p><b>' + tr("السعر / الميزانية", "Preis / Budget") + ":</b> " + esc(priceLabel(ad)) + "</p>" +
      '<p><b>' + tr("موعد العمل", "Gewünschter Termin") + ":</b> " + esc(dateLabel(workDate)) + "</p>" +
      '<p><b>' + tr("تاريخ نشر الإعلان", "Veröffentlicht am") + ":</b> " + esc(dateLabel(String(ad.created_at || "").slice(0, 10))) + "</p>" +
      '<p style="white-space:pre-wrap">' + esc(description) + "</p>" +
      '<p class="note">' + tr("لا يظهر رقم الهاتف للعامة. التواصل يتم عبر العروض والرسائل داخل التطبيق.", "Telefonnummern werden nicht öffentlich angezeigt. Kontakt erfolgt über Angebote und Nachrichten.") + "</p>" +
      '<div id="detailActions" class="row" style="margin-top:14px">' + actions + "</div>" +
      (owner && ad.role === "need" ? '<div id="quoteList" class="panel"><p class="muted">' + tr("جارٍ تحميل العروض...", "Angebote werden geladen...") + "</p></div>" : "");
    show("detailPage");
    const edit = $("#detailEdit");
    if (edit) edit.onclick = function () { openEditForm(ad.id); };
    const quoteButton = $("#detailSendQuote");
    if (quoteButton) quoteButton.onclick = function () { showQuoteForm(ad); };
    const chooseWorker = $("#detailChooseWorker");
    if (chooseWorker) chooseWorker.onclick = function () { openTab("profile"); };
    const contact = $("#detailContact");
    if (contact) contact.onclick = function () { startConversation(ad); };
    if (owner && ad.role === "need") loadQuotes(ad);
  }

  async function loadQuotes(ad) {
    const target = $("#quoteList");
    if (!target || !currentUserId() || !isOwner(ad)) return;
    try {
      const rows = await api("/rest/v1/roudin_quotes?select=*&ad_id=eq." + encodeURIComponent(ad.id) +
        "&recipient_id=eq." + encodeURIComponent(currentUserId()) + "&order=created_at.desc");
      const accepted = (rows || []).some(function (quote) { return quote.status === "accepted"; });
      target.innerHTML = "<h3>" + tr("العروض التي وصلتك", "Erhaltene Angebote") + "</h3>" +
        ((rows && rows.length) ? rows.map(function (quote, index) {
          const total = Number(quote.labor_amount || 0) + Number(quote.materials_amount || 0);
          const status = quote.status === "accepted" ? tr("مقبول", "Angenommen") :
            quote.status === "declined" ? tr("مرفوض", "Abgelehnt") :
            quote.status === "cancelled" ? tr("ملغى", "Storniert") : tr("بانتظار قرارك", "Wartet auf Entscheidung");
          const canChoose = quote.status === "pending" && !accepted;
          return '<article class="listing"><b>' + tr("عرض حرفي", "Angebot eines Handwerkers") + " #" + (index + 1) + "</b>" +
            "<p><b>" + tr("أجرة العمل", "Arbeitskosten") + ":</b> " + esc(quote.labor_amount) + " €</p>" +
            "<p><b>" + tr("المواد", "Materialkosten") + ":</b> " + esc(quote.materials_amount) + " €</p>" +
            "<p><b>" + tr("المجموع", "Gesamt") + ":</b> " + esc(total.toFixed(2)) + " €</p>" +
            (quote.payment_terms ? "<p><b>" + tr("شروط الدفع", "Zahlungsbedingungen") + ":</b> " + esc(quote.payment_terms) + "</p>" : "") +
            (quote.note ? '<p style="white-space:pre-wrap">' + esc(quote.note) + "</p>" : "") +
            '<p class="meta">' + status + "</p>" +
            (canChoose ? '<div class="row"><button type="button" class="primary" data-accept-quote="' + esc(quote.id) + '">' +
              tr("قبول العرض", "Angebot annehmen") + '</button><button type="button" class="secondary" data-decline-quote="' + esc(quote.id) + '">' +
              tr("رفض العرض", "Angebot ablehnen") + "</button></div>" : "") + "</article>";
        }).join("") : '<p class="empty">' + tr("لم تصلك عروض بعد.", "Noch keine Angebote erhalten.") + "</p>");
      target.querySelectorAll("[data-accept-quote]").forEach(function (button) {
        button.onclick = function () { changeQuoteStatus(button.dataset.acceptQuote, "accepted"); };
      });
      target.querySelectorAll("[data-decline-quote]").forEach(function (button) {
        button.onclick = function () { changeQuoteStatus(button.dataset.declineQuote, "declined"); };
      });
    } catch (error) {
      target.innerHTML = '<p class="note">' + tr("تعذر تحميل العروض. تحقق من تسجيل الدخول.", "Angebote konnten nicht geladen werden. Bitte Anmeldung prüfen.") + "</p>";
      notify(error);
    }
  }

  async function changeQuoteStatus(id, status) {
    if (!currentAd || !isOwner(currentAd) || currentAd.role !== "need") return;
    if (status === "accepted" && !confirm(tr("هل تريد قبول هذا العرض؟", "Möchtest du dieses Angebot annehmen?"))) return;
    try {
      await api("/rest/v1/roudin_quotes?id=eq." + encodeURIComponent(id) +
        "&recipient_id=eq." + encodeURIComponent(currentUserId()), "PATCH", { status: status });
      if (status === "accepted") {
        const pending = await api("/rest/v1/roudin_quotes?select=id&ad_id=eq." + encodeURIComponent(currentAd.id) +
          "&recipient_id=eq." + encodeURIComponent(currentUserId()) + "&status=eq.pending");
        for (const quote of (pending || [])) {
          if (quote.id !== id) {
            await api("/rest/v1/roudin_quotes?id=eq." + encodeURIComponent(quote.id) +
              "&recipient_id=eq." + encodeURIComponent(currentUserId()), "PATCH", { status: "declined" });
          }
        }
      }
      toast(status === "accepted" ? tr("تم قبول العرض. لا يوجد رقم هاتف محفوظ في هذه النسخة؛ لا يتم كشف أي رقم.", "Angebot angenommen. In dieser Version ist keine Telefonnummer hinterlegt.") :
        tr("تم تحديث حالة العرض.", "Angebotsstatus aktualisiert."));
      await loadQuotes(currentAd);
    } catch (error) {
      notify(error);
    }
  }

  function showQuoteForm(ad) {
    if (!session) {
      toast(tr("سجّل الدخول أولاً لإرسال عرض.", "Bitte zuerst anmelden, um ein Angebot zu senden."));
      openTab("profile");
      return;
    }
    if (isOwner(ad)) {
      toast(tr("لا يمكنك إرسال عرض على إعلانك.", "Du kannst kein Angebot für deine eigene Anzeige senden."));
      return;
    }
    if (ad.role !== "need") return;
    if (!canSendOffers()) {
      toast(tr("يجب أن يكون نوع حسابك حرفياً لإرسال عرض.", "Zum Senden eines Angebots benötigst du ein Handwerkerkonto."));
      openTab("profile");
      return;
    }
    const actions = $("#detailActions");
    actions.innerHTML =
      '<form id="quoteForm" class="panel" style="width:100%">' +
      "<h3>" + tr("إرسال عرض سعر", "Preisangebot senden") + "</h3>" +
      '<label>' + tr("أجرة العمل (€)", "Arbeitskosten (€)") + '</label><input id="quoteLabor" type="number" min="0" step="0.01" required>' +
      '<label>' + tr("تكلفة المواد (€)", "Materialkosten (€)") + '</label><input id="quoteMaterials" type="number" min="0" step="0.01" value="0" required>' +
      '<label>' + tr("شروط الدفع (اختياري)", "Zahlungsbedingungen (optional)") + '</label><input id="quoteTerms" maxlength="1000">' +
      '<label>' + tr("رسالة للزبون", "Nachricht an den Kunden") + '</label><textarea id="quoteNote" required minlength="3" maxlength="1500"></textarea>' +
      '<div class="row"><button class="primary" type="submit">' + tr("إرسال العرض", "Angebot senden") + '</button>' +
      '<button class="secondary" type="button" id="cancelQuote">' + tr("إلغاء", "Abbrechen") + "</button></div></form>";
    $("#cancelQuote").onclick = function () { openDetail(ad.id); };
    $("#quoteForm").onsubmit = async function (event) {
      event.preventDefault();
      const labor = Number($("#quoteLabor").value);
      const materials = Number($("#quoteMaterials").value);
      const note = $("#quoteNote").value.trim();
      if (!Number.isFinite(labor) || !Number.isFinite(materials) || labor < 0 || materials < 0 || labor + materials <= 0 || note.length < 3) {
        toast(tr("أدخل سعراً صحيحاً ورسالة واضحة.", "Bitte einen gültigen Preis und eine Nachricht eingeben."));
        return;
      }
      const submit = $("#quoteForm").querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const previous = await api("/rest/v1/roudin_quotes?select=id,status&ad_id=eq." + encodeURIComponent(ad.id) +
          "&sender_id=eq." + encodeURIComponent(currentUserId()) + "&status=neq.cancelled");
        if (previous && previous.length) {
          toast(tr("سبق أن أرسلت عرضاً لهذا الإعلان.", "Du hast bereits ein Angebot für diese Anzeige gesendet."));
          submit.disabled = false;
          return;
        }
        await api("/rest/v1/roudin_quotes", "POST", {
          ad_id: ad.id,
          sender_id: currentUserId(),
          recipient_id: ad.owner_id,
          labor_amount: labor,
          materials_amount: materials,
          payment_terms: $("#quoteTerms").value.trim() || null,
          note: note,
          non_binding: true
        });
        toast(tr("تم إرسال عرضك ورسالتك إلى صاحب الإعلان.", "Dein Angebot und deine Nachricht wurden gesendet."));
        openDetail(ad.id);
      } catch (error) {
        notify(error);
        submit.disabled = false;
      }
    };
  }

  async function startConversation(ad) {
    if (!session) {
      toast(tr("سجّل الدخول أولاً للتواصل.", "Bitte zuerst anmelden, um Kontakt aufzunehmen."));
      openTab("profile");
      return;
    }
    if (isOwner(ad)) return;
    try {
      const existing = await api("/rest/v1/roudin_conversations?select=*&ad_id=eq." + encodeURIComponent(ad.id) +
        "&customer_id=eq." + encodeURIComponent(currentUserId()) + "&worker_id=eq." + encodeURIComponent(ad.owner_id));
      activeConversation = existing && existing[0] ? existing[0] : null;
      if (!activeConversation) {
        const created = await api("/rest/v1/roudin_conversations", "POST", {
          ad_id: ad.id, customer_id: currentUserId(), worker_id: ad.owner_id
        });
        activeConversation = created && created[0] ? created[0] : null;
      }
      if (!activeConversation) throw new Error(tr("تعذر إنشاء المحادثة.", "Chat konnte nicht erstellt werden."));
      await openConversation(activeConversation);
    } catch (error) {
      notify(error);
    }
  }

  async function openConversation(conversation) {
    activeConversation = conversation;
    activeTab = "chats";
    renderNav();
    show("tabPage");
    $("#tabHeading").textContent = tr("الرسائل", "Nachrichten");
    try {
      const messages = await api("/rest/v1/roudin_messages?select=*&conversation_id=eq." +
        encodeURIComponent(conversation.id) + "&order=created_at.asc");
      $("#tabContent").innerHTML =
        '<div style="max-height:55vh;overflow:auto">' +
        ((messages || []).map(function (message) {
          return '<p style="padding:9px;border:1px solid #ddd;border-radius:9px"><b>' +
            (message.sender_id === currentUserId() ? tr("أنا", "Ich") : tr("الطرف الآخر", "Andere Person")) +
            ":</b> " + esc(message.body) + "</p>";
        }).join("") || '<p class="empty">' + tr("ابدأ المحادثة برسالتك.", "Beginne den Chat mit einer Nachricht.") + "</p>") +
        '</div><form id="sendMsg"><textarea id="msgBody" required maxlength="4000" placeholder="' +
        tr("اكتب رسالتك", "Nachricht schreiben") + '"></textarea><button class="primary" type="submit">' +
        tr("إرسال", "Senden") + "</button></form>";
      $("#sendMsg").onsubmit = async function (event) {
        event.preventDefault();
        const body = $("#msgBody").value.trim();
        if (!body) return;
        const button = $("#sendMsg").querySelector("button[type=submit]");
        button.disabled = true;
        try {
          await api("/rest/v1/roudin_messages", "POST", {
            conversation_id: conversation.id, sender_id: currentUserId(), body: body
          });
          await openConversation(conversation);
        } catch (error) {
          notify(error);
          button.disabled = false;
        }
      };
    } catch (error) {
      notify(error);
    }
  }

  async function renderConversations() {
    if (!session) {
      $("#tabContent").innerHTML = '<div class="tab-note">' + tr("سجّل الدخول لعرض رسائلك.", "Bitte anmelden, um Nachrichten zu sehen.") + "</div>";
      return;
    }
    try {
      const rows = await api("/rest/v1/roudin_conversations?select=*&order=created_at.desc");
      $("#tabContent").innerHTML = rows && rows.length ? rows.map(function (conversation, index) {
        const ad = ads.find(function (item) { return item.id === conversation.ad_id; });
        return '<p><button type="button" class="secondary" data-conversation-index="' + index + '">' +
          esc(ad ? ad.title : tr("محادثة", "Nachricht")) + "</button></p>";
      }).join("") : '<div class="tab-note">' + tr("لا توجد رسائل بعد.", "Noch keine Nachrichten.") + "</div>";
      $("#tabContent").querySelectorAll("[data-conversation-index]").forEach(function (button) {
        button.onclick = function () { openConversation(rows[Number(button.dataset.conversationIndex)]); };
      });
    } catch (error) {
      notify(error);
    }
  }

  async function renderMyQuotes() {
    if (!session) return "";
    try {
      const rows = await api("/rest/v1/roudin_quotes?select=*&sender_id=eq." + encodeURIComponent(currentUserId()) + "&order=created_at.desc");
      if (!rows || !rows.length) return "";
      return '<section class="panel"><h3>' + tr("عروضي المرسلة", "Meine gesendeten Angebote") + "</h3>" +
        rows.map(function (quote) {
          const ad = ads.find(function (item) { return item.id === quote.ad_id; });
          const status = quote.status === "accepted" ? tr("مقبول", "Angenommen") :
            quote.status === "declined" ? tr("مرفوض", "Abgelehnt") :
            quote.status === "cancelled" ? tr("ملغى", "Storniert") : tr("بانتظار رد الزبون", "Wartet auf Antwort");
          const total = Number(quote.labor_amount || 0) + Number(quote.materials_amount || 0);
          return '<article class="listing"><b>' + esc(ad ? ad.title : tr("طلب عمل", "Arbeitsauftrag")) + "</b>" +
            "<p>" + tr("عرضك", "Dein Angebot") + ": " + esc(total.toFixed(2)) + " €</p><p class=\"meta\">" + status + "</p></article>";
        }).join("") + "</section>";
    } catch (error) {
      notify(error);
      return "";
    }
  }

  async function renderOrders() {
    const jobs = ads.filter(function (ad) { return ad.role === "need"; });
    let html = '<p class="muted">' + tr("طلبات الزبائن المتاحة للحرفيين", "Kundenaufträge für Handwerker") + "</p>";
    html += jobs.length ? jobs.map(function (ad) { return renderCard(ad, false); }).join("") :
      '<div class="tab-note">' + tr("لا توجد طلبات منشورة حالياً.", "Zurzeit gibt es keine Aufträge.") + "</div>";
    html += '<p><button type="button" class="primary" id="publishNeed">' + tr("نشر طلب عمل", "Arbeitsauftrag veröffentlichen") + "</button></p>";
    html += await renderMyQuotes();
    $("#tabContent").innerHTML = html;
    bindDetailButtons($("#tabContent"));
    $("#publishNeed").onclick = function () {
      role = "need";
      openForm("");
    };
  }

  function renderWorkers() {
    const workers = ads.filter(function (ad) { return ad.role === "offer"; });
    let html = '<p class="muted">' + tr("خدمات الحرفيين المعروضة", "Angebote von Handwerkern") + "</p>";
    html += workers.length ? workers.map(function (ad) { return renderCard(ad, false); }).join("") :
      '<div class="tab-note">' + tr("لا توجد خدمات معروضة حالياً.", "Zurzeit werden keine Dienstleistungen angeboten.") + "</div>";
    html += '<p><button type="button" class="primary" id="publishOffer">' + tr("اعرض خدماتك", "Eigene Dienste anbieten") + "</button></p>";
    html += '<p><button type="button" class="secondary" id="publishNeedFromWorkers">' + tr("لم تجد حرفياً؟ انشر طلبك", "Keinen Handwerker gefunden? Auftrag veröffentlichen") + "</button></p>";
    $("#tabContent").innerHTML = html;
    bindDetailButtons($("#tabContent"));
    $("#publishOffer").onclick = function () { role = "offer"; openForm(""); };
    $("#publishNeedFromWorkers").onclick = function () { role = "need"; openForm(""); };
  }

  async function renderMine() {
    if (!session) {
      $("#tabContent").innerHTML = '<div class="tab-note">' + tr("سجّل الدخول لعرض إعلاناتك.", "Bitte anmelden, um deine Anzeigen zu sehen.") + "</div>";
      return;
    }
    const mine = ads.filter(isOwner);
    $("#tabContent").innerHTML = mine.length
      ? mine.map(function (ad) { return renderCard(ad, true); }).join("")
      : '<div class="tab-note">' + tr("لم تنشر أي إعلان بعد.", "Du hast noch keine Anzeige veröffentlicht.") + "</div>";
    bindDetailButtons($("#tabContent"));
  }

  async function renderProfile() {
    if (session) {
      try { await loadProfile(); } catch (error) { notify(error); }
      $("#tabContent").innerHTML = '<div class="tab-note"><b>' + esc(session.user && session.user.email || "") +
        '</b><p>' + tr("نوع الحساب", "Kontotyp") + '</p><select id="accountType">' +
        '<option value="customer">' + tr("زبون", "Kunde") + '</option>' +
        '<option value="worker">' + tr("حرفي", "Handwerker") + '</option>' +
        '<option value="both">' + tr("زبون وحرفي", "Kunde und Handwerker") + '</option></select>' +
        '<p><button id="saveAccountType" class="secondary">' + tr("حفظ نوع الحساب", "Kontotyp speichern") + '</button></p>' +
        '<p>' + tr("حسابك متصل.", "Dein Konto ist angemeldet.") + '</p><button id="logout" class="primary">' +
        tr("تسجيل خروج", "Abmelden") + "</button></div>";
      $("#accountType").value = profile.account_type || "customer";
      $("#saveAccountType").onclick = async function () {
        const button = $("#saveAccountType"); button.disabled = true;
        try { await saveProfileType(); }
        catch (error) { notify(error); }
        finally { button.disabled = false; }
      };
      $("#logout").onclick = async function () {
        try { await api("/auth/v1/logout", "POST", {}); } catch (_) {}
        setSession(null);
        profile = { account_type: "customer" };
        profileExists = false;
        openTab("profile");
      };
      return;
    }
    $("#tabContent").innerHTML =
      '<form id="authForm" class="panel"><h3>' + tr("تسجيل الدخول أو إنشاء حساب", "Anmelden oder Konto erstellen") + "</h3>" +
      '<label>Email</label><input id="authEmail" type="email" required autocomplete="email">' +
      '<label>' + tr("كلمة المرور", "Passwort") + '</label><input id="authPass" type="password" required minlength="6" autocomplete="current-password">' +
      '<button type="button" class="secondary" id="togglePassword">' + tr("إظهار كلمة المرور", "Passwort anzeigen") + "</button>" +
      '<div class="row" style="margin-top:12px"><button class="primary" id="loginBtn" type="submit">' + tr("دخول", "Anmelden") +
      '</button><button class="secondary" id="signupBtn" type="button">' + tr("إنشاء حساب", "Registrieren") + "</button></div>" +
      '<p class="note">' + tr("قد تصلك رسالة لتأكيد البريد الإلكتروني.", "Du erhältst möglicherweise eine E-Mail zur Bestätigung.") + "</p></form>";
    $("#togglePassword").onclick = function () {
      const field = $("#authPass");
      const visible = field.type === "password";
      field.type = visible ? "text" : "password";
      $("#togglePassword").textContent = visible ? tr("إخفاء كلمة المرور", "Passwort verbergen") : tr("إظهار كلمة المرور", "Passwort anzeigen");
    };
    async function authenticate(signup) {
      const loginButton = $("#loginBtn");
      const signupButton = $("#signupBtn");
      loginButton.disabled = true;
      signupButton.disabled = true;
      try {
        const email = $("#authEmail").value.trim();
        const password = $("#authPass").value;
        const redirect = encodeURIComponent(window.location.origin + window.location.pathname);
        const path = signup
          ? "/auth/v1/signup?redirect_to=" + redirect
          : "/auth/v1/token?grant_type=password";
        const result = await api(path, "POST", { email: email, password: password }, false);
        if (result && result.access_token) {
          setSession(result);
          await loadProfile();
          toast(tr("تم تسجيل الدخول بنجاح.", "Erfolgreich angemeldet."));
          openTab("profile");
          await refreshAds();
        } else {
          toast(tr("تم إرسال رسالة تأكيد إلى بريدك إذا كان التسجيل يتطلب ذلك.", "Falls erforderlich, wurde eine Bestätigungs-E-Mail gesendet."));
        }
      } catch (error) {
        notify(error);
      } finally {
        loginButton.disabled = false;
        signupButton.disabled = false;
      }
    }
    $("#authForm").onsubmit = function (event) { event.preventDefault(); authenticate(false); };
    $("#signupBtn").onclick = function () { authenticate(true); };
  }

  const originalOpenForm = openForm;
  openForm = function (service) {
    editingAdId = null;
    originalOpenForm(service || "");
    $("#adForm").querySelector("h2");
    const heading = $("#formPage h2");
    if (heading) heading.textContent = tr("إنشاء إعلان", "Anzeige erstellen");
    const save = $("#saveAdBtn");
    if (save) save.textContent = tr("نشر الإعلان", "Anzeige veröffentlichen");
    $("#role").value = role || "need";
    $("#price").value = tr("حسب الاتفاق", "Nach Vereinbarung");
    $("#workDate").value = new Date().toISOString().slice(0, 10);
    applyTranslations();
  };

  function openEditForm(id) {
    const ad = ads.find(function (item) { return item.id === id; });
    if (!ad || !isOwner(ad)) return;
    role = ad.role;
    selected = cats.find(function (category) { return category.key === ad.profession; }) || cats[0];
    openForm(ad.service || "");
    editingAdId = ad.id;
    $("#role").value = ad.role;
    $("#profession").value = ad.profession || selected.key;
    $("#service").value = ad.service || "";
    $("#title").value = ad.title || "";
    $("#description").value = cleanDescription(ad.description);
    $("#city").value = ad.city || "";
    $("#postal").value = ad.postal || "";
    $("#price").value = priceLabel(ad);
    $("#workDate").value = workDateOf(ad) || new Date().toISOString().slice(0, 10);
    const heading = $("#formPage h2");
    if (heading) heading.textContent = tr("تعديل الإعلان", "Anzeige bearbeiten");
    $("#saveAdBtn").textContent = tr("حفظ التعديلات", "Änderungen speichern");
    show("formPage");
  }

  async function uploadPhoto(file, adId) {
    if (!file) return null;
    if (!file.type || !file.type.startsWith("image/")) throw new Error(tr("اختر ملف صورة صحيحاً.", "Bitte eine gültige Bilddatei auswählen."));
    if (file.size > 8 * 1024 * 1024) throw new Error(tr("حجم الصورة أكبر من 8 ميغابايت.", "Das Bild ist größer als 8 MB."));
    const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80) || "image";
    const path = currentUserId() + "/" + adId + "/" + Date.now() + "-" + safeName;
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(SB_URL + "/storage/v1/object/roudin-ad-images/" + encodedPath, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: "Bearer " + session.access_token,
        "Content-Type": file.type,
        "x-upsert": "false"
      },
      body: file
    });
    const raw = await response.text();
    if (!response.ok) {
      let detail = raw;
      try { const parsed = JSON.parse(raw); detail = parsed.message || parsed.error || raw; } catch (_) {}
      throw new Error(detail || "Image upload failed");
    }
    return SB_URL + "/storage/v1/object/public/roudin-ad-images/" + encodedPath;
  }

  async function saveAd(event) {
    event.preventDefault();
    if (!session) {
      toast(tr("سجّل الدخول أولاً لنشر إعلان.", "Bitte zuerst anmelden, um eine Anzeige zu veröffentlichen."));
      openTab("profile");
      return;
    }
    const title = $("#title").value.trim();
    const description = $("#description").value.trim();
    const city = $("#city").value.trim();
    const price = $("#price").value.trim();
    const workDate = $("#workDate").value;
    const file = $("#photo").files && $("#photo").files[0];
    const service = $("#service").value.trim() || ((cats.find(function (c) { return c.key === $("#profession").value; }) || selected).de);
    if (!title || description.length < 10 || !city || !price || !workDate) {
      toast(tr("أكمل العنوان والوصف والمدينة والسعر والموعد.", "Bitte Titel, Beschreibung, Stadt, Preis und Termin ausfüllen."));
      return;
    }
    const selectedRole = $("#role").value;
    if (!canPostRole(selectedRole)) {
      toast(selectedRole === "need"
        ? tr("هذا الإعلان مخصص لحساب الزبون. غيّر نوع حسابك أو اختر حساباً مشتركاً.", "Dieser Auftrag ist für Kundenkonten. Kontotyp ändern oder beide Rollen wählen.")
        : tr("عرض الخدمات مخصص لحساب الحرفي. غيّر نوع حسابك أو اختر حساباً مشتركاً.", "Dienstleistungsanzeigen sind für Handwerkerkonten. Kontotyp ändern oder beide Rollen wählen."));
      openTab("profile");
      return;
    }
    const row = {
      role: selectedRole,
      profession: $("#profession").value,
      service: service,
      title: title,
      description: storedDescription(description, workDate),
      city: city,
      postal: $("#postal").value.trim(),
      price: price
    };
    if (!editingAdId) row.owner_id = currentUserId();
    const button = $("#saveAdBtn");
    button.disabled = true;
    try {
      let saved;
      if (editingAdId) {
        saved = await api("/rest/v1/roudin_ads?id=eq." + encodeURIComponent(editingAdId) +
          "&owner_id=eq." + encodeURIComponent(currentUserId()), "PATCH", row);
      } else {
        saved = await api("/rest/v1/roudin_ads", "POST", row);
      }
      const ad = Array.isArray(saved) ? saved[0] : saved;
      if (!ad || !ad.id) throw new Error(tr("لم يتم حفظ الإعلان.", "Anzeige wurde nicht gespeichert."));
      if (file) {
        const photoUrl = await uploadPhoto(file, ad.id);
        await api("/rest/v1/roudin_ads?id=eq." + encodeURIComponent(ad.id) +
          "&owner_id=eq." + encodeURIComponent(currentUserId()), "PATCH", { photo_url: photoUrl });
      }
      editingAdId = null;
      $("#adForm").reset();
      $("#photoPreview").classList.add("hidden");
      await refreshAds();
      show("home");
      toast(tr("تم نشر الإعلان وحفظه.", "Anzeige wurde veröffentlicht und gespeichert."));
    } catch (error) {
      notify(error);
    } finally {
      button.disabled = false;
    }
  }

  async function deleteAd(id) {
    const ad = ads.find(function (item) { return item.id === id; });
    if (!ad || !isOwner(ad)) return;
    if (!confirm(tr("هل أنت متأكد؟ سيتم حذف إعلانك.", "Bist du sicher? Deine Anzeige wird gelöscht."))) return;
    try {
      await api("/rest/v1/roudin_ads?id=eq." + encodeURIComponent(id) +
        "&owner_id=eq." + encodeURIComponent(currentUserId()), "DELETE");
      await refreshAds();
      openTab("mine");
      toast(tr("تم حذف الإعلان.", "Anzeige gelöscht."));
    } catch (error) {
      notify(error);
    }
  }

  openDetail = function (id) {
    return openDetailImpl(id);
  };
  async function openDetailImpl(id) {
    const ad = ads.find(function (item) { return item.id === id; });
    if (!ad) return;
    currentAd = ad;
    detailOrigin = activeTab || "home";
    setDetailHeading();
    const owner = isOwner(ad);
    const workDate = workDateOf(ad);
    const description = cleanDescription(ad.description);
    const image = ad.photo_url
      ? '<img src="' + esc(ad.photo_url) + '" alt="" style="width:100%;max-height:320px;object-fit:contain;border-radius:12px;margin:8px 0">'
      : "";
    let actions = "";
    if (owner) {
      actions = '<p class="tab-note">' + tr("هذا إعلانك", "Das ist deine Anzeige") + '</p><button type="button" class="primary" id="detailEdit">' +
        tr("هذا إعلانك – تعديل", "Deine Anzeige – bearbeiten") + "</button>";
    } else if (ad.role === "need") {
      actions = '<button type="button" class="primary" id="detailSendQuote">' + tr("إرسال عرض", "Angebot senden") + "</button>";
    } else {
      actions = '<button type="button" class="primary" id="detailContact">' + tr("مراسلة مقدم الخدمة", "Anbieter kontaktieren") + "</button>";
    }
    $("#detail").innerHTML =
      '<span class="pill">' + esc(typeLabel(ad.role)) + "</span>" +
      "<h2>" + esc(ad.title) + "</h2>" + image +
      '<p class="meta">📍 ' + esc(ad.city || "") + " " + esc(ad.postal || "") + " · " + esc(ad.service || "") + "</p>" +
      '<p><b>' + tr("السعر / الميزانية", "Preis / Budget") + ":</b> " + esc(priceLabel(ad)) + "</p>" +
      '<p><b>' + tr("موعد العمل", "Gewünschter Termin") + ":</b> " + esc(dateLabel(workDate)) + "</p>" +
      '<p><b>' + tr("تاريخ نشر الإعلان", "Veröffentlicht am") + ":</b> " + esc(dateLabel(String(ad.created_at || "").slice(0, 10))) + "</p>" +
      '<p style="white-space:pre-wrap">' + esc(description) + "</p>" +
      '<p class="note">' + tr("لا يظهر رقم الهاتف للعامة. التواصل يتم عبر العروض والرسائل داخل التطبيق.", "Telefonnummern werden nicht öffentlich angezeigt. Kontakt erfolgt über Angebote und Nachrichten.") + "</p>" +
      '<div id="detailActions" class="row" style="margin-top:14px">' + actions + "</div>" +
      (owner && ad.role === "need" ? '<div id="quoteList" class="panel"><p class="muted">' + tr("جارٍ تحميل العروض...", "Angebote werden geladen...") + "</p></div>" : "");
    show("detailPage");
    const edit = $("#detailEdit");
    if (edit) edit.onclick = function () { openEditForm(ad.id); };
    const quoteButton = $("#detailSendQuote");
    if (quoteButton) quoteButton.onclick = function () { showQuoteForm(ad); };
    const contact = $("#detailContact");
    if (contact) contact.onclick = function () { startConversation(ad); };
    if (owner && ad.role === "need") loadQuotes(ad);
  }

  openTab = function (key) {
    activeTab = key;
    renderNav();
    if (key === "home") {
      show("home");
      return;
    }
    show("tabPage");
    $("#tabHeading").textContent = navLabels[lang][key] || "";
    if (key === "orders") { renderOrders(); return; }
    if (key === "workers") { renderWorkers(); return; }
    if (key === "mine") { renderMine(); return; }
    if (key === "chats") { renderConversations(); return; }
    if (key === "profile") { renderProfile(); return; }
    $("#tabContent").innerHTML = "";
  };

  $("#adForm").onsubmit = saveAd;
  $("#newAd").onclick = function () { role = "need"; openForm(""); };
  $("#otherService").onclick = function () { openForm(""); };
  $$("[data-role]").forEach(function (button) {
    button.onclick = function () {
      const selectedRole = button.dataset.role;
      if (selectedRole === "need") {
        role = "offer";
        openTab("workers");
      } else if (selectedRole === "offer") {
        role = "offer";
        openForm("");
      } else {
        role = "need";
        openTab("orders");
      }
    };
  });
  $("#langBtn").onclick = function () {
    lang = lang === "de" ? "ar" : "de";
    applyTranslations();
    translate();
    applyTranslations();
    if (activeTab !== "home") openTab(activeTab);
    else renderNav();
    if (currentAd && !$("#detailPage").classList.contains("hidden")) openDetail(currentAd.id);
  };
  $("#search").addEventListener("input", renderCats);
  $("#adForm").addEventListener("reset", function () { editingAdId = null; });

  applyTranslations();
  translate();
  applyTranslations();
  renderNav();
  restoreSession().catch(notify);
})();