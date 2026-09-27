// Loading screen shown while assets load and every pipeline compiles (warmup, SPEC section 7).
export function showLoading(): () => void {
  const root = document.createElement('div');
  root.className = 'loading';
  root.innerHTML = '<div class="loading-card"><h1>Aloft</h1><p>Gathering the storm...</p></div>';
  document.body.appendChild(root);
  return () => root.remove();
}
