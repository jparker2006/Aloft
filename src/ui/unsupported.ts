// Shown when WebGPU is unavailable. Plain DOM so it works without any renderer.

export function showUnsupported(reason: string): void {
  const root = document.createElement('div');
  root.className = 'unsupported';
  root.innerHTML = `
    <h1>Aloft needs WebGPU</h1>
    <p>This storm is rendered with WebGPU, which this browser or device does not provide.</p>
    <p>Supported: current Chrome, or Safari 26 and later, on a Mac with Apple Silicon.</p>
    <p class="reason"></p>
  `;
  root.querySelector('.reason')!.textContent = reason;
  document.body.appendChild(root);
}
