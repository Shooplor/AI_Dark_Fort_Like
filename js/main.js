/* Boot: fit the 16:9 stage to the window, then start a run on the road (optionally ?seed=1234; ?house goes straight
 * into a house, for testing). */
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
  if (new URLSearchParams(location.search).has('house')) {
    // developer shortcut (and the automated checks): straight into a house, doors already open
    ui.newGame(seed);
    ui.gateInstantOpen();
  } else {
    ui.newRun(seed); // the great doors, shut: "Embark" opens them onto the road
  }
  DF.ui = ui; // handy in the browser console while developing
})();
