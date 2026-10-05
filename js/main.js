/* Boot: fit the 16:9 stage to the window, then start a game (optionally with ?seed=1234). */
(function () {
  const DF = globalThis.DF;

  function fitStage() {
    const s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    document.getElementById('stage').style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  window.addEventListener('resize', fitStage);
  fitStage();

  const param = new URLSearchParams(location.search).get('seed');
  const seed = param !== null && param !== '' && !Number.isNaN(Number(param)) ? Number(param) >>> 0 : undefined;

  // browsers only allow sound after a key press or click: the first one starts it
  ['pointerdown', 'keydown'].forEach((type) => window.addEventListener(type, () => DF.Sound && DF.Sound.unlock(), true));

  const ui = new DF.UI();
  ui.newGame(seed);
  DF.ui = ui; // handy in the browser console while developing
})();
