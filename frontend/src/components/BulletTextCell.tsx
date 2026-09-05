import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { CellHandle, CellProps } from './Cell';
import { bulletSymbolForIndent, fromDisplayText, toDisplayText } from '../utils/bulletText';
import { useCommitOnce } from '../hooks/useCommitOnce';

// Einfache, einlagige Umsetzung: die Textarea zeigt IMMER exakt den Text,
// den der Nutzer sieht - Einzug als echte Leerzeichen, Bullet-Symbol als
// normales Zeichen direkt im Text (siehe toDisplayText/fromDisplayText in
// bulletText.ts). Bewusst KEIN Schutz des Praefixes vor Backspace/Loeschen:
// ein fruehrer Versuch mit Sonderbehandlung fuer Cursor-Bewegung am
// Praefix hat die Komplexitaet (und damit die Bug-Flaeche) wieder
// hochgetrieben - genau das Gegenteil des Ziels "robust und einfach". Der
// Nutzer kann das Symbol technisch ueberschreiben; fromDisplayText beim
// Commit ist tolerant genug, das zu verkraften (siehe dort), und ein
// gelegentlich falsch getipptes Symbol ist ein kleineres Problem als ein
// Cursor, der bei jedem Tastendruck woanders landet.
function lineIndexAt(text: string, pos: number): number {
  return text.slice(0, pos).split('\n').length - 1;
}

function indentOfDisplayLine(text: string, lineIndex: number): number {
  const line = text.split('\n')[lineIndex] ?? '';
  let spaces = 0;
  while (spaces < line.length && line[spaces] === ' ') spaces += 1;
  return Math.round(spaces / 3);
}

export const BulletTextCell = forwardRef<CellHandle, CellProps>(function BulletTextCell(
  {
    value,
    focused,
    editing,
    onCommit,
    onCancelEdit,
    onMoveUp,
    onMoveDown,
    onMoveHorizontal,
    onMoveTab,
  },
  ref,
) {
  // Wird bei jedem neuen Editiervorgang frisch gemountet (siehe DataGrid.tsx
  // key={editing ? `editing-${editSession}` : 'idle'}), daher initialisiert
  // sich draft garantiert korrekt.
  const [draft, setDraft] = useState(toDisplayText(value ?? ''));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Verhindert, dass eine Zeile innerhalb einer einzigen Editier-Interaktion
  // mehr als eine Ebene relativ zu ihrem Ausgangswert eingerueckt/ausgerueckt
  // wird - ein zweiter Tab-Druck auf derselben Zeile soll die Zelle
  // verlassen statt weiter einzuruecken. startIndentRef merkt sich, auf
  // welcher Zeile der Cursor gerade steht und mit welcher Tiefe diese Zeile
  // begonnen hat; bei Zeilenwechsel wird der Wert neu uebernommen.
  const startIndentRef = useRef<{ line: number; indent: number } | null>(null);

  // Zaehlt mouseup-Ereignisse auf der Textarea seit ihrem Mount. Ein
  // Doppelklick, der die Zelle ueberhaupt erst aktiviert (Zelle war vorher
  // ein <div> im Anzeigemodus, kein <textarea>), erzeugt GENAU auf dieser
  // frisch gemounteten Textarea die ersten beiden mouseup-Ereignisse -
  // dieser Fall (Zaehler <= 2 beim dblclick) soll trotz nativer
  // Wortmarkierung nur den Cursor stehen lassen, weil der Nutzer hier
  // lediglich reinklicken und weiterschreiben wollte. Jeder Doppelklick auf
  // eine Zelle, die schon vorher offen war (Zaehler bereits > 2), soll ganz
  // normal ein Wort markieren.
  const mouseUpCountRef = useRef(0);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    // '0px' statt 'auto': scrollHeight bezieht sich immer auf den Inhalt
    // PLUS die aktuell gesetzte Hoehe, wenn diese groesser als der Inhalt
    // ist, bleibt scrollHeight bei genau dieser (zu grossen) Zahl stehen
    // statt zu schrumpfen. '0px' zwingt den Browser, die Hoehe wirklich neu
    // aus dem Inhalt zu berechnen, egal ob die Zeile vorher zu hoch oder zu
    // niedrig war - das verhindert das beobachtete "einzeilige Zellen werden
    // nach der Aktivierung faelschlich doppelt so hoch".
    //
    // Das kurzzeitige Kollabieren auf 0px verkleinert dabei die
    // Gesamthoehe von .data-grid-scroll, wodurch der Browser dessen
    // scrollTop sofort auf den neuen (kleineren) Maximalwert klemmt - beim
    // anschliessenden Vergroessern wird diese Position nicht von selbst
    // wiederhergestellt. Sichtbar als Scroll-Sprung nach oben bei jedem
    // Tastendruck/Klick, besonders in der letzten Zeile. Daher scrollTop
    // hier explizit sichern und zurücksetzen.
    // .tables-wrap ist der eine, durchgehende Scrollbereich der Notizansicht
    // (siehe app.css) - .data-grid-scroll scrollt selbst nicht mehr, sein
    // scrollTop waere hier also konstant 0 und der Fix wirkungslos.
    const scrollParent = el.closest<HTMLElement>('.tables-wrap');
    const prevScrollTop = scrollParent?.scrollTop;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
    if (scrollParent && prevScrollTop !== undefined) {
      scrollParent.scrollTop = prevScrollTop;
    }
  };

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      // Immer ans Textende, egal ob der Wechsel in diese Zelle per Klick
      // oder Tastatur ausgeloest wurde - direkt weiterschreiben ist der
      // haeufigere Fall. Ein zweiter, gezielter Klick auf die (jetzt
      // bereits existierende) Textarea setzt den Cursor danach ganz normal
      // ueber das native Browser-Verhalten an die geklickte Stelle - dafuer
      // ist kein eigener Code noetig.
      el.setSelectionRange(el.value.length, el.value.length);
      resize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitOnce = useCommitOnce();

  const commit = () => {
    return commitOnce(() => {
      const raw = fromDisplayText(draft);
      const committed = raw === '' ? null : raw;
      onCommit(committed);
      return committed;
    });
  };

  useImperativeHandle(ref, () => ({ commitPending: commit }));

  if (!editing) {
    return (
      <div className={`cell-display bullet-cell-display${focused ? ' cell-focused' : ''}`}>
        {toDisplayText(value ?? '')}
      </div>
    );
  }

  const trackStartIndent = (text: string, cursor: number) => {
    const line = lineIndexAt(text, cursor);
    if (startIndentRef.current?.line !== line) {
      startIndentRef.current = { line, indent: indentOfDisplayLine(text, line) };
    }
    return startIndentRef.current;
  };

  const setSelectionAfterUpdate = (pos: number) => {
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  };

  return (
    <textarea
      ref={textareaRef}
      className="bullet-text-cell-input"
      value={draft}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onMouseUp={() => {
        mouseUpCountRef.current += 1;
      }}
      // Ohne stopPropagation bubbelt ein Doppelklick innerhalb der bereits
      // aktiven Textarea (z.B. um ein Wort zu markieren) zum aeusseren
      // <div role="cell" onDoubleClick={...}> in DataGrid.tsx hoch, das
      // erneut startEditing() aufruft - das erhoeht editSession und
      // erzwingt einen kompletten Remount der Zelle, wodurch der frische
      // Mount-Effect (Cursor ans Textende) die native Wortmarkierung sofort
      // wieder ueberschreibt (Symptom: Wort blitzt kurz markiert auf,
      // Cursor faellt dann doch ans Ende zurueck).
      onDoubleClick={(e) => {
        e.stopPropagation();
        // War dieser Doppelklick die allererste Interaktion mit der
        // Textarea (die beiden mouseup der Doppelklick-Geste selbst sind
        // Zaehlerstand 1 und 2), hat der erste der beiden Klicks die Zelle
        // ueberhaupt erst aktiviert - trotz der nativen Wortmarkierung soll
        // dann nur der Cursor stehen bleiben, weil der Nutzer lediglich
        // reinklicken und weiterschreiben wollte. War die Zelle schon
        // vorher offen (Zaehlerstand > 2), bleibt die native
        // Wortmarkierung unangetastet (normales Textbox-Verhalten).
        if (mouseUpCountRef.current <= 2) {
          const el = e.currentTarget;
          el.setSelectionRange(el.selectionStart, el.selectionStart);
        }
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        requestAnimationFrame(resize);
      }}
      onKeyDown={(e) => {
        // Ohne stopPropagation bubbelt das Event zum aeusseren <div
        // role="cell" onKeyDown={handleKeyDown}> in DataGrid.tsx, das
        // waehrend editing===true ebenfalls auf Enter/Tab reagiert (siehe
        // useGridNavigation.ts) - das fuehrte sonst zu doppelter
        // Verarbeitung eines einzelnen Tastendrucks.
        // Strg+Enter ist das Kuerzel fuer "neue Zeile anlegen" und gehoert
        // dem Grid, nicht dieser Zelle: hier durchlassen (kein
        // stopPropagation, kein preventDefault), damit es das aeussere
        // onKeyDown und damit useGridNavigation erreicht. Ohne diese
        // Ausnahme haette der Enter-Zweig unten stattdessen eine neue
        // Bullet-Zeile im Text eingefuegt.
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          return;
        }

        const el = e.currentTarget;
        const cursor = el.selectionStart;
        const text = el.value;

        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const lineIndex = lineIndexAt(text, cursor);
          const indent = indentOfDisplayLine(text, lineIndex);
          const line = text.split('\n')[lineIndex] ?? '';
          const symbol = bulletSymbolForIndent(indent);
          const prefix = ' '.repeat(indent * 3) + symbol + ' ';
          const lineText = line.startsWith(prefix) ? line.slice(prefix.length) : line.trimStart();
          if (lineText === '') {
            // Diese leere Zeile wurde nur angelegt, um die Zelle zu
            // verlassen (Enter auf leerer Zeile) - sie soll nicht als
            // leerer Bullet-Punkt im gespeicherten Text zurueckbleiben.
            const lines = text.split('\n');
            lines.splice(lineIndex, 1);
            const raw = fromDisplayText(lines.join('\n'));
            onCommit(raw === '' ? null : raw);
            onMoveDown();
            return;
          }
          const insertion = '\n' + prefix;
          const next = text.slice(0, cursor) + insertion + text.slice(cursor);
          setDraft(next);
          startIndentRef.current = null;
          setSelectionAfterUpdate(cursor + insertion.length);
          requestAnimationFrame(resize);
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancelEdit();
          return;
        }

        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          const lineIndex = lineIndexAt(text, cursor);
          const indent = indentOfDisplayLine(text, lineIndex);
          const start = trackStartIndent(text, cursor)!;
          const delta = e.shiftKey ? -1 : 1;

          if ((delta > 0 && indent >= start.indent + 1) || (delta < 0 && (indent <= start.indent - 1 || indent === 0))) {
            // Die Zelle wird jetzt verlassen - die Einrueckung, die der
            // erste Tab-Druck auf dieser Zeile vorgenommen hat, war nur ein
            // "Versuch einer zweiten Ebene" und soll nicht bestehen bleiben.
            // Zeile auf ihre urspruengliche Tiefe (start.indent) zuruecksetzen,
            // bevor committet wird.
            const lines = text.split('\n');
            const line = lines[lineIndex];
            const symbol = bulletSymbolForIndent(indent);
            const prefix = ' '.repeat(indent * 3) + symbol + ' ';
            const lineText = line.startsWith(prefix) ? line.slice(prefix.length) : line.trimStart();
            const restoredSymbol = bulletSymbolForIndent(start.indent);
            lines[lineIndex] = ' '.repeat(start.indent * 3) + restoredSymbol + ' ' + lineText;
            const raw = fromDisplayText(lines.join('\n'));
            onCommit(raw === '' ? null : raw);
            onMoveTab(delta > 0 ? 1 : -1);
            return;
          }

          const lines = text.split('\n');
          const line = lines[lineIndex];
          const oldLineStart = lines.slice(0, lineIndex).reduce((sum, l) => sum + l.length + 1, 0);
          const cursorInLine = cursor - oldLineStart;
          const oldSymbol = bulletSymbolForIndent(indent);
          const oldPrefix = ' '.repeat(indent * 3) + oldSymbol + ' ';
          const hasOldPrefix = line.startsWith(oldPrefix);
          const lineText = hasOldPrefix ? line.slice(oldPrefix.length) : line.trimStart();
          // Cursor-Distanz zum bisherigen Textanfang (nach dem alten
          // Praefix) erhalten - ohne das wuerde der Cursor beim Einruecken
          // immer ganz an den Zeilenanfang (hinter das neue Praefix)
          // zurueckfallen statt an der Stelle zu bleiben, an der der Nutzer
          // gerade tippt.
          const offsetInText = Math.max(cursorInLine - (hasOldPrefix ? oldPrefix.length : line.length - lineText.length), 0);
          const newIndent = indent + delta;
          const newSymbol = bulletSymbolForIndent(newIndent);
          const newPrefix = ' '.repeat(newIndent * 3) + newSymbol + ' ';
          lines[lineIndex] = newPrefix + lineText;
          setDraft(lines.join('\n'));
          // start.indent bleibt unveraendert (nicht auf newIndent
          // nachziehen!) - sonst wuerde jeder weitere Tab-Druck auf
          // derselben Zeile erneut als "erster Schritt" durchgehen und
          // beliebig tief einruecken koennen, statt nach einem Schritt die
          // Zelle zu verlassen.
          startIndentRef.current = { line: lineIndex, indent: start.indent };
          setSelectionAfterUpdate(oldLineStart + newPrefix.length + offsetInText);
          requestAnimationFrame(resize);
          return;
        }

        const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
        const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
        const atFirstLine = el.value.slice(0, el.selectionStart).indexOf('\n') === -1;
        const atLastLine = el.value.slice(el.selectionEnd).indexOf('\n') === -1;

        if (e.key === 'ArrowLeft' && atStart) {
          e.preventDefault();
          e.stopPropagation();
          commit();
          onMoveHorizontal(-1);
          return;
        }
        if (e.key === 'ArrowRight' && atEnd) {
          e.preventDefault();
          e.stopPropagation();
          commit();
          onMoveHorizontal(1);
          return;
        }
        if (e.key === 'ArrowUp' && atFirstLine) {
          if (!atStart) return;
          e.preventDefault();
          e.stopPropagation();
          commit();
          onMoveUp();
          return;
        }
        if (e.key === 'ArrowDown' && atLastLine) {
          if (!atEnd) return;
          e.preventDefault();
          e.stopPropagation();
          commit();
          onMoveDown();
        }
      }}
      onBlur={commit}
    />
  );
});
