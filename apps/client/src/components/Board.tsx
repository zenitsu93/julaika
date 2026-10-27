import { useEffect, useRef, useState } from 'react';
import { CANVAS_H, CANVAS_W } from '@julaika/shared';
import { BoardCanvas, Pen, board } from '../lib/board';
import { net } from '../lib/net';
import { useCall } from '../lib/call';
import { useGame } from '../lib/store';
import { animate, attachWipe, Presence } from '../motion';
import { CallBar } from './CallBar';
import { Overlay } from './Overlay';
import { Reaction } from './Reaction';
import { PlayerStrip } from './PlayerStrip';
import { Toolbar } from './Toolbar';
import { TrapStamp } from './TrapStamp';

export function Board() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wipe = useRef<HTMLCanvasElement>(null);
  const ghostEl = useRef<HTMLCanvasElement>(null);
  const fade = useRef<Animation | null>(null);
  const [ghost] = useState(() => new BoardCanvas(true));
  const [pen] = useState(() => new Pen((buf) => net.sendBinary(buf)));
  const inCall = useCall().joined;
  const lobby = useGame((s) => s.room!.phase === 'lobby');
  const canDraw = useGame((s) => s.room!.phase === 'drawing' && s.room!.drawerId === s.selfId);
  const trapKind = useGame((s) => s.room!.trap?.kind ?? null);
  const trapColor = useGame((s) => s.room!.trap?.color ?? 0);

  useEffect(() => {
    board.attach(canvas.current);
    ghost.attach(ghostEl.current);
    attachWipe(canvas.current, wipe.current);
    pen.ghost = ghost;
    // Encre invisible : le trait qu'on vient de lâcher s'évapore doucement.
    pen.onLift = () => {
      if (pen.trap?.kind !== 'invisible') return;
      fade.current?.cancel();
      fade.current = animate(ghostEl.current, [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(3px)' }], {
        duration: 700,
        delay: 180,
        easing: 'ease-in',
        fill: 'forwards',
      });
      if (!fade.current) ghost.reset();
      else fade.current.onfinish = () => ghost.reset();
    };
    return () => {
      board.attach(null);
      ghost.attach(null);
      attachWipe(null, null);
    };
  }, [ghost, pen]);

  // Le piège ne s'applique qu'au dessinateur ; à la fin du tour, l'encre invisible réapparaît.
  useEffect(() => {
    pen.trap = canDraw && trapKind ? { kind: trapKind, color: trapColor } : null;
    board.setHidden(canDraw && trapKind === 'invisible');
    fade.current?.cancel();
    ghost.reset();
  }, [canDraw, trapKind, trapColor, pen, ghost]);

  useEffect(() => {
    if (!canDraw) pen.end();
  }, [canDraw, pen]);

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * CANVAS_W, ((e.clientY - r.top) / r.height) * CANVAS_H] as const;
  };

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <PlayerStrip />
      {/* Le tableau garde son ratio 4:3 et tient dans la hauteur de l’écran, dock compris. */}
      <div
        className={`relative mx-auto w-full overflow-hidden rounded-lg border border-edge ${lobby ? 'max-sm:border-0' : ''} ${
          inCall ? 'max-w-[max(20rem,calc((100dvh-24rem)*4/3))]' : 'max-w-[max(20rem,calc((100dvh-19rem)*4/3))]'
        }`}
      >
        <canvas
          ref={canvas}
          width={CANVAS_W}
          height={CANVAS_H}
          className={`block aspect-[4/3] w-full touch-none bg-white ${canDraw ? 'cursor-crosshair' : ''} ${lobby ? 'max-sm:hidden' : ''}`}
          onPointerDown={(e) => {
            if (!canDraw || e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            fade.current?.cancel();
            fade.current = null;
            pen.start(...toCanvas(e));
          }}
          onPointerMove={(e) => {
            if (!canDraw) return;
            const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
            pen.move(events.flatMap((ev) => toCanvas(ev)));
          }}
          onPointerUp={() => pen.end()}
          onPointerCancel={() => pen.end()}
        />
        {/* Calque local des pièges : élastique des lignes droites, trait fantôme de l'encre invisible. */}
        <canvas ref={ghostEl} width={CANVAS_W} height={CANVAS_H} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
        {/* Calque de « Tout effacer » : le dessin copié s'y gomme de gauche à droite. */}
        <canvas ref={wipe} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
        <TrapStamp />
        <Overlay />
        <Reaction />
      </div>
      <Presence>{canDraw ? <Toolbar pen={pen} trap={trapKind ? { kind: trapKind, color: trapColor } : null} /> : null}</Presence>
      <CallBar />
    </section>
  );
}
