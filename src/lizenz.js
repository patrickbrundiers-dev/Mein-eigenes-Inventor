// Lizenz-Bildschirm (ohne gültige Lizenz nach dem Testzeitraum). Prüfen und Speichern macht der Hauptprozess.
(() => {
  const api = window.werkcad;
  const $ = (id) => document.getElementById(id);
  const msg = (text, kind = "") => { $("msg").textContent = text; $("msg").className = kind; };
  if (!api?.licenseStatus) { msg("Lizenzprüfung nur in der installierten Version.", "err"); return; }
  api.licenseStatus().then((s) => {
    $("rid").textContent = s.rechnerId || "unbekannt";
    if (s.fehler) $("grund").textContent = s.fehler + " Bitte einen gültigen Lizenzschlüssel eingeben.";
  });
  api.onCloseRequest?.(() => api.confirmClose(true));
  $("kopieren").onclick = async () => {
    try { await navigator.clipboard.writeText($("rid").textContent); msg("Rechner-ID kopiert.", "ok"); } catch { msg("Bitte die Rechner-ID markieren und mit Strg+C kopieren."); }
  };
  const activate = async (text) => {
    const r = await api.activateLicense(text);
    if (r.ok) msg(`Lizenz ${r.status.daten.nr} für ${r.status.daten.name} aktiviert. PBCAD startet …`, "ok");
    else msg(r.fehler, "err");
  };
  $("aktivieren").onclick = () => activate($("key").value);
  $("datei").onclick = async () => {
    const text = await api.readLicenseFile();
    if (text === null) return;
    $("key").value = text.trim();
    activate(text);
  };
  $("beenden").onclick = () => api.quitForLicense();
})();
