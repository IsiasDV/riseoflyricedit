// Tiny reusable modal prompt (single text input) used for username/room-code
// entry before creating or joining a multiplayer lobby.
export function showPrompt({ title, placeholder = '', initialValue = '' }) {
  const overlay = document.getElementById('prompt-modal');
  const titleEl = document.getElementById('prompt-title');
  const input = document.getElementById('prompt-input');
  const errorEl = document.getElementById('prompt-error');
  const confirmBtn = document.getElementById('prompt-confirm');
  const cancelBtn = document.getElementById('prompt-confirm') && document.getElementById('prompt-cancel');

  titleEl.textContent = title;
  input.placeholder = placeholder;
  input.value = initialValue;
  errorEl.textContent = '';
  overlay.classList.remove('ui-hidden');
  requestAnimationFrame(() => input.focus());

  return new Promise((resolve) => {
    function cleanup(result) {
      overlay.classList.add('ui-hidden');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onConfirm() {
      const value = input.value.trim();
      if (!value) {
        errorEl.textContent = 'This field is required.';
        return;
      }
      cleanup(value);
    }
    function onCancel() { cleanup(null); }
    function onKey(e) {
      e.stopPropagation();
      if (e.key === 'Enter') onConfirm();
      else if (e.key === 'Escape') onCancel();
    }
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
  });
}

export function showPromptError(message) {
  const errorEl = document.getElementById('prompt-error');
  if (errorEl) errorEl.textContent = message;
}
