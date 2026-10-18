// Vídeo de apresentação. O truque de desempenho é não baixar nada antes da hora:
// a página só carrega o poster; o MP4 entra quando a pessoa clica em assistir.
// Aí escolhemos o tamanho: 1080p só para telas grandes (ou retina) com conexão boa,
// 720p para o resto (metade do peso, e no celular ninguém nota a diferença).

export function initFilm(root) {
  if (!root) return;
  const video = root.querySelector('video');
  const button = root.querySelector('[data-film-play]');

  function pickSource() {
    const net = navigator.connection;
    const slow = net && (net.saveData || /2g/.test(net.effectiveType || ''));
    const pixels = root.clientWidth * (window.devicePixelRatio || 1);
    return !slow && pixels >= 1500 ? 'video/deepthinker-1080.mp4' : 'video/deepthinker.mp4';
  }

  button.addEventListener('click', () => {
    if (!video.src) video.src = pickSource();
    video.controls = true;
    root.classList.add('is-playing');
    button.hidden = true;
    video.play().catch(() => {});
    video.focus({ preventScroll: true });
  });

  // Saiu da tela tocando: pausa (economiza bateria e não toca som escondido).
  new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting && !video.paused) video.pause();
  }).observe(root);

  video.addEventListener('ended', () => {
    root.classList.remove('is-playing');
    button.hidden = false;
    video.controls = false;
    video.load(); // volta para o poster
  });
}
