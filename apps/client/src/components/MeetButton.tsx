import { useState } from 'react';
import { parseMeetUrl } from '@julaika/shared';
import { net } from '../lib/net';
import { useGame } from '../lib/store';

/**
 * Visio via Google Meet. Meet refuse d'être affiché dans une iframe : on partage donc un lien
 * par salon, que chacun ouvre dans un nouvel onglet (ou l'appli Meet sur mobile).
 */
export function MeetButton() {
  const meetUrl = useGame((s) => s.room!.meetUrl);
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  if (!meetUrl && !isHost) return null;

  const share = (e: React.FormEvent) => {
    e.preventDefault();
    const url = parseMeetUrl(draft);
    if (!url) {
      setInvalid(true);
      return;
    }
    net.send({ t: 'meet', url });
    setDraft('');
    setOpen(false);
  };

  return (
    <div className="relative flex items-center gap-1">
      {meetUrl ? (
        <a className="btn-primary px-2.5 py-1.5" href={meetUrl} target="_blank" rel="noopener noreferrer" title={meetUrl}>
          🎥 <span className="hidden sm:inline">Rejoindre la visio</span>
        </a>
      ) : (
        <button className="btn-ghost px-2.5 py-1.5" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          🎥 <span className="hidden sm:inline">Ajouter une visio</span>
        </button>
      )}
      {isHost && meetUrl && (
        <button className="btn-ghost px-2 py-1.5" title="Changer ou retirer la visio" aria-label="Réglages de la visio" onClick={() => setOpen((o) => !o)}>
          ⋯
        </button>
      )}

      {open && isHost && (
        <div className="panel animate-pop absolute right-0 top-full z-20 mt-2 w-80 space-y-3 p-4 text-sm shadow-lg">
          <p className="font-semibold">Visio Google Meet</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>
              <a className="text-info underline" href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer">
                Crée une réunion
              </a>{' '}
              dans un nouvel onglet.
            </li>
            <li>Copie son lien et colle-le ici : tous les joueurs pourront la rejoindre.</li>
          </ol>
          <form onSubmit={share} className="flex gap-2">
            <input
              id="meet-url"
              className="input font-mono text-xs"
              placeholder="meet.google.com/abc-defg-hij"
              value={draft}
              autoFocus
              onChange={(e) => {
                setDraft(e.target.value);
                setInvalid(false);
              }}
              aria-invalid={invalid}
            />
            <button className="btn-primary shrink-0">Partager</button>
          </form>
          {invalid && <p className="text-bad">Colle un lien du type meet.google.com/abc-defg-hij.</p>}
          {meetUrl && (
            <button
              className="text-muted underline"
              onClick={() => {
                net.send({ t: 'meet', url: '' });
                setOpen(false);
              }}
            >
              Retirer la visio
            </button>
          )}
        </div>
      )}
    </div>
  );
}
