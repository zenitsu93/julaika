import { useEffect, useRef, useState } from 'react';
import { CANVAS_H, CANVAS_W } from '@julaika/shared';
import { Pen, board } from '../lib/board';
import { net } from '../lib/net';
import { useCall } from '../lib/call';
import { useGame } from '../lib/store';
import { CallBar } from './CallBar';
import { Overlay } from './Overlay';
import { PlayerStrip } from './PlayerStrip';
import { Toolbar } from './Toolbar';

export function Board() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pen] = useState(() => new Pen((buf) => net.sendBinary(buf)));
  const inCall = useCall().joined;
  const lobby = useGame((s) => s.room!.phase === 'lobby');
  const canDraw = useGame((s) => s.room!.phase === 'drawing' && s.room!.drawerId === s.selfId);

  useEffect(() => {
    board.attach(canvas.current);
    return () => board.attach(null);
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
        <Overlay />
      </div>
      {canDraw && <Toolbar pen={pen} />}
      <CallBar />
    </section>
  );
}
