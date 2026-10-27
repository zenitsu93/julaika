import { DrawOp, decodeDraw, type DrawPacket } from '@julaika/shared';

/** Octets de dessin gardés par joueur et par étape. */
const MAX_DRAWING_BYTES = 400_000;

/**
 * Les dessins en cours de chaque joueur, gardés pour plus tard et jamais relayés (Téléphone
 * dessiné, Cadavre exquis) : chacun dessine dans son coin, tout est dévoilé à la fin.
 */
export class Sketches {
  private drawings = new Map<string, Uint8Array[][]>();
  private bytes = new Map<string, number>();

  draw(id: string, data: Uint8Array): void {
    const packet = decodeDraw(data);
    if (!packet) return;
    const bytes = this.bytes.get(id) ?? 0;
    if (bytes + data.byteLength > MAX_DRAWING_BYTES) return;
    const strokes = this.drawings.get(id) ?? [];
    const copy = new Uint8Array(data);
    if (packet.op === DrawOp.Extend) {
      const last = strokes.at(-1);
      if (!last) return;
      last.push(copy);
    } else strokes.push([copy]);
    this.drawings.set(id, strokes);
    this.bytes.set(id, bytes + copy.byteLength);
  }

  undo(id: string): void {
    const removed = this.drawings.get(id)?.pop();
    if (removed) this.bytes.set(id, (this.bytes.get(id) ?? 0) - removed.reduce((n, p) => n + p.byteLength, 0));
  }

  clear(id?: string): void {
    if (id === undefined) {
      this.drawings.clear();
      this.bytes.clear();
    } else {
      this.drawings.delete(id);
      this.bytes.delete(id);
    }
  }

  /** Les paquets d'un trait (début + suites) fusionnés en un seul, pour le rejouer d'un coup. */
  strokesOf(id: string): DrawPacket[] {
    return (this.drawings.get(id) ?? []).flatMap((packets) => {
      const [first, ...rest] = packets.map((p) => decodeDraw(p)!);
      if (!first) return [];
      return [{ ...first, points: [...first.points, ...rest.flatMap((p) => p.points)] }];
    });
  }
}
