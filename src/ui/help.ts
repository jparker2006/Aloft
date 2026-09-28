// Controls card for the free camera (milestone 1 has no gameplay). Dismissed with its close button.
export function showHelp(): void {
  const root = document.createElement('aside');
  root.className = 'help';
  root.setAttribute('aria-label', 'Controls');
  root.innerHTML = `
    <button type="button" class="help-close" aria-label="Hide controls">&times;</button>
    <h2>Free camera</h2>
    <dl>
      <dt>Click</dt><dd>look around (Esc releases the mouse)</dd>
      <dt>W A S D</dt><dd>fly, Q and E down and up, Shift faster</dd>
      <dt>1 to 4</dt><dd>low in a trough, high above the sea, lightning on the horizon, storm sky</dd>
      <dt>P</dt><dd>dusk and night (blends over 2.5 s)</dd>
      <dt>L</dt><dd>lightning strike</dd>
      <dt>F3</dt><dd>performance overlay</dd>
    </dl>`;
  root.querySelector('button')!.addEventListener('click', () => root.remove());
  document.body.appendChild(root);
}
