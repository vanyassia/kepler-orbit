/**
 * Сохранение файла из браузера: обычная загрузка, «Поделиться» (телефон: «Сохранить в Файлы», AirDrop)
 * и копирование текста в буфер обмена.
 */

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari начинает загрузку не сразу: адрес освобождаем с запасом
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Можно ли передать файл системному окну «Поделиться» (телефон, Safari на Mac). */
export function canShareFile(): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'x.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
}

/** Системное окно «Поделиться»; false — пользователь закрыл его или браузер отказал. */
export async function shareFile(blob: Blob, name: string): Promise<boolean> {
  try {
    await navigator.share({ files: [new File([blob], name, { type: blob.type })], title: name });
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
