/* =========================================================================
   Anti-Ban injecte - NEUTRALISE le 2026-08-18.
   Remplace par l'outil autonome OCR (AntiBan.exe). Ce fichier ne cree plus
   aucun panneau ; il retire seulement un ancien panneau s'il reste ouvert.
   (N'affecte AUCUNE autre injection : celles-ci chargent d'autres fichiers.)
   ========================================================================= */
(function () {
  try { if (window.CBL && typeof window.CBL.stop === 'function') window.CBL.stop(); } catch (e) {}
  try {
    var kill = ['cbl-name-modal','cbl-panel','cbl-badge','cbl-dot','cbl-root','cbl-box','cbl-overlay'];
    for (var i = 0; i < kill.length; i++) { var el = document.getElementById(kill[i]); if (el) el.remove(); }
    var q = document.querySelectorAll('[id^="cbl-"],[class^="cbl-"]');
    for (var j = 0; j < q.length; j++) { q[j].remove(); }
  } catch (e) {}
})();
