import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PHOTO_KIND_LABEL, photoSourceUrl, photoUrl, type SatellitePhoto } from '../data/photos';
import styles from './SatellitePhoto.module.css';

/**
 * Маленькая приглушённая миниатюра рядом с названием спутника: главное на сайте — трасса,
 * поэтому снимок не должен притягивать взгляд. По нажатию — окно с крупным снимком и подписью.
 */
export function PhotoThumb({ photo, title }: { photo: SatellitePhoto; title: string }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState<string | null>(null);
  if (broken === photo.image) return null; // файла нет — миниатюру просто не показываем
  return (
    <>
      <button
        type="button"
        className={styles.thumb}
        onClick={() => setOpen(true)}
        aria-label={`Снимок: ${title}`}
        title={`${PHOTO_KIND_LABEL[photo.kind]}: ${photo.caption}`}
      >
        <img
          key={photo.image}
          src={photoUrl(photo, 'small')}
          alt=""
          width={56}
          height={40}
          decoding="async"
          onError={() => setBroken(photo.image)}
        />
      </button>
      <PhotoDialog photo={photo} title={title} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function PhotoDialog({ photo, title, open, onClose }: { photo: SatellitePhoto; title: string; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onClose={onClose}
      aria-label={`Снимок: ${title}`}
      // Щелчок мимо снимка (по затемнению) закрывает окно
      onClick={(e) => e.target === e.currentTarget && onClose()}
      // Esc закрывает только окно, а не боковую панель на телефоне
      onKeyDown={(e) => e.key === 'Escape' && e.stopPropagation()}
    >
      {open && (
        <figure className={styles.figure}>
          <img key={photo.image} className={styles.image} src={photoUrl(photo, 'full')} alt={photo.caption} decoding="async" />
          <figcaption className={styles.caption}>
            <span>
              <span className={styles.kind}>{PHOTO_KIND_LABEL[photo.kind]}</span> {photo.caption}
            </span>
            <span className={styles.credit}>
              {photo.author} · {photo.license} ·{' '}
              <a href={photoSourceUrl(photo)} target="_blank" rel="noreferrer">
                Wikimedia Commons
              </a>
            </span>
          </figcaption>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </figure>
      )}
    </dialog>
  );
}
