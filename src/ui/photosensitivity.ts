// First-run photosensitivity notice (SPEC sections 12 and 16). Shown once, before play, with a direct
// switch to "Reduce flashing". Never shown in shot mode.
import { saveSettings, type Settings } from '../app/settings';

export function showPhotosensitivityNotice(
  settings: Settings,
  onChange: (reduce: boolean) => void,
): Promise<void> {
  if (settings.photosensitivityAcknowledged) return Promise.resolve();
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'notice';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML = `
      <div class="notice-card">
        <h2>Photosensitivity warning</h2>
        <p>This game contains lightning: bright flashes of light over a dark sea. Flashes are limited to three per
        second, but they may still affect players with photosensitive epilepsy or other sensitivities.</p>
        <label class="notice-toggle"><input type="checkbox" /> Reduce flashing (dimmer, softer lightning)</label>
        <button type="button">Continue</button>
        <p class="notice-hint">You can change this later in Settings.</p>
      </div>`;
    const checkbox = root.querySelector('input')!;
    checkbox.checked = settings.reduceFlashing;
    checkbox.addEventListener('change', () => onChange(checkbox.checked));
    root.querySelector('button')!.addEventListener('click', () => {
      settings.reduceFlashing = checkbox.checked;
      settings.photosensitivityAcknowledged = true;
      saveSettings(settings);
      root.remove();
      resolve();
    });
    document.body.appendChild(root);
    root.querySelector('button')!.focus();
  });
}
