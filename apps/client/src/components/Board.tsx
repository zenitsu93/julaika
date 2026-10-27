import { useEffect, useRef, useState } from 'react';
import { CANVAS_H, CANVAS_W } from '@julaika/shared';
import { Pen, board } from '../lib/board';
import { net } from '../lib/net';
import { call, useCall } from '../lib/call';
import { useGame } from '../lib/store';
import { attachWipe, Presence } from '../motion';
import { CallBar } from './CallBar';
import { MimeStage } from './MimeStage';
import { Overlay } from './Overlay';
import { Reaction } from './Reaction';
import { PlayerStrip } from './PlayerStrip';
import { Toolbar } from './Toolbar';

export function Board() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wipe = useRef<HTMLCanvasElement>(null);
  const [pen] = useState(() => new Pen((buf) => net.sendBinary(buf)));
  const inCall = useCall().joined;
  const lobby = useGame((s) => s.room!.phase === 'lobby');
  const canDraw = useGame((s) => s.room!.phase === 'drawing' && s.room!.turnKind === 'draw' && s.room!.drawerId === s.selfId);
  const mime = useGame((s) => s.room!.turnKind === 'mime' && (s.room!.phase === 'choosing' || s.room!.phase === 'drawing' || s.room!.phase === 'turnEnd'));
  const miming = useGame((s) => s.room!.phase === 'drawing' && s.room!.turnKind === 'mime' && s.room!.drawerId === s.selfId);

  // Pendant son mime : pas le droit de parler, et la caméra passe en haute qualité.
  useEffect(() => call.setMiming(miming), [miming]);
  useEffect(() => () => call.setMiming(false), []);

  useEffect(() => {
    board.attach(canvas.current);
    attachWipe(canvas.current, wipe.current);
    return () => {
      board.attach(null);
      attachWipe(null, null);
    };
  }, []);

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
        {/* Calque de « Tout effacer » : le dessin copié s'y gomme de gauche à droite. */}
        <canvas ref={wipe} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
        {mime && <MimeStage />}
        <Overlay />
        <Reaction />
      </div>
      <Presence>{canDraw ? <Toolbar pen={pen} /> : null}</Presence>
      <CallBar />
    </section>
  );
}
