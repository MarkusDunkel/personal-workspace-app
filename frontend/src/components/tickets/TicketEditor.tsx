import { useEffect, useState } from 'react';
import { allowsVisualEditor } from '../../api/azureTicketTypes';
import type { DescriptionDialect, TicketField } from '../../api/azureTicketTypes';
import { useTicketDescription } from '../../hooks/useTicketDescription';
import { HtmlSourceEditor } from './HtmlSourceEditor';
import { MilkdownDescriptionEditor } from './MilkdownDescriptionEditor';

interface TicketEditorProps {
  category: string;
  ticketId: string | null;
  bookmarked: boolean;
  onToggleBookmark: (entry: { id: string; title: string; workItemType: string }) => void;
}

const DIALECT_LABEL: Record<DescriptionDialect, string> = {
  EMPTY: 'leer',
  PLAIN: 'Text',
  MARKDOWN: 'Markdown',
  HTML: 'HTML',
  MIXED: 'HTML + Markdown',
};

/**
 * Bearbeitet die freigegebenen Felder EINES Tickets und waehlt fuer jedes den
 * passenden Editor.
 *
 * Die Weiche faellt JE FELD anhand des GELADENEN Werts, nicht nach
 * Nutzerwunsch: nur so kann ein HTML-Wert gar nicht erst durch den
 * Markdown-Serialisierer laufen und dabei seine Formatierung verlieren. Azure
 * fuehrt pro Feld einen festen Dialekt (siehe ai-vault/DESCRIPTION-FORMAT.md),
 * und der wird hier nie gewechselt.
 *
 * Je Feld einzeln ist dabei wesentlich: die Beschreibung eines Tickets kann
 * Markdown sein, waehrend seine Acceptance Criteria in HTML vorliegen - am
 * Bestand von "technical" ist genau das der Normalfall (76 von 83 User
 * Stories). Ein gemeinsamer Dialekt schickte eines der beiden Felder in den
 * falschen Editor.
 *
 * Alle Felder stehen untereinander im SELBEN Scroll-Bereich, jedes mit
 * eigener Ueberschrift - so bleibt der Zusammenhang zwischen Beschreibung und
 * Abnahmekriterien beim Lesen erhalten.
 */
export function TicketEditor({
  category,
  ticketId,
  bookmarked,
  onToggleBookmark,
}: TicketEditorProps) {
  const state = useTicketDescription(category, ticketId);
  const { doc } = state;
  const baselineStamp = useBaselineStamp(state.baselineLoaded, state.hasUnsavedChanges, ticketId);

  if (!ticketId) {
    return <p className="ticket-hint">Links ein Ticket auswählen.</p>;
  }
  if (state.loading) {
    return <p className="ticket-hint">Lade Ticket…</p>;
  }
  if (state.loadError || !doc) {
    return <p className="ticket-status ticket-status-error">{state.loadError}</p>;
  }

  return (
    <div className="ticket-editor">
      <div className="ticket-editor-head">
        <button
          type="button"
          className={`ticket-bookmark-button${bookmarked ? ' active' : ''}`}
          aria-pressed={bookmarked}
          title={bookmarked ? 'Lesezeichen entfernen' : 'Lesezeichen setzen'}
          onClick={() =>
            onToggleBookmark({
              id: doc.id,
              title: doc.title,
              workItemType: doc.workItemType,
            })
          }
        >
          {bookmarked ? '★' : '☆'}
        </button>
        <span className="ticket-editor-title">
          #{doc.id} {doc.title}
        </span>
        {doc.azureUrl && (
          // In einem neuen Tab: der Editor haelt ungespeicherte Aenderungen im
          // Zustand der Seite, ein Wegnavigieren im selben Tab verwuerfe sie.
          // rel gehoert zwingend zu target="_blank" - ohne noopener bekaeme
          // die geoeffnete Seite ueber window.opener Zugriff auf diese.
          <a
            className="ticket-azure-link"
            href={doc.azureUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Original in Azure Boards öffnen (neuer Tab)"
          >
            Azure ↗
          </a>
        )}
        <span className="ticket-save-status">{state.saveStatus}</span>
      </div>

      {doc.hasConflicts && (
        <p className="ticket-status ticket-status-error">
          Dieses Ticket trägt einen Merge-Konflikt (<code>_conflicts</code>) und blockiert
          den Import, bis er aufgelöst ist.
        </p>
      )}

      {doc.hasRoadmapHistory && (
        <p className="ticket-status ticket-status-warn">
          Enthält eine Roadmap-Historie. Die Tabelle wird von der
          Stakeholder-Ansicht maschinell ausgewertet — Spalten und Kopfzeile bitte
          erhalten.
        </p>
      )}

      {state.conflict && (
        <p className="ticket-status ticket-status-error">
          {state.conflict}{' '}
          <button type="button" className="ticket-reload-button" onClick={state.reload}>
            Neu laden
          </button>
        </p>
      )}

      <div className="ticket-field-scroll">
        {doc.fields.map((field) => (
          <FieldSection
            key={field.field}
            // key ueber Ticket UND Feld: Milkdown haelt seinen Zustand
            // ausserhalb von React, sonst bliebe die Undo-Historie des vorigen
            // Tickets - oder des anderen Feldes - erhalten.
            //
            // Der Vergleichsstand gehoert mit hinein, weil er erst nach dem
            // Ticket eintrifft und der Editor ihn nur beim Aufbau liest; ohne
            // ihn im key bliebe die Markierung bis zum Ticketwechsel aus.
            //
            // ABER nur, solange nichts bearbeitet wurde: ein Neuaufbau
            // verwirft die Undo-Historie. Wer in den Sekundenbruchteilen bis
            // zur Antwort schon tippt, verloere sonst sein Strg+Z. Der Inhalt
            // bliebe zwar erhalten (value ist der aktuelle Entwurf), die
            // Historie aber nicht - und dann lieber keine Markierung bis zum
            // naechsten Oeffnen.
            editorKey={`${category}:${doc.id}:${field.field}:${baselineStamp}`}
            field={field}
            value={state.values[field.field] ?? ''}
            baseline={state.baselines[field.field] ?? null}
            baselineReason={state.baselineReason}
            onChange={(next) => state.setValue(field.field, next)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Ein Kennzeichen fuer den editorKey, das genau EINMAL wechselt: sobald der
 * Vergleichsstand da ist - aber nur, solange noch nichts bearbeitet wurde.
 *
 * Hintergrund: der Vergleichsstand wird unabhaengig vom Ticket geladen und
 * trifft deshalb kurz nach ihm ein. Milkdown liest ihn nur beim Aufbau, also
 * muss der Editor dafuer einmal neu aufgebaut werden. Ein Neuaufbau verwirft
 * jedoch die Undo-Historie - und wer in diesem Sekundenbruchteil schon tippt,
 * verloere sein Strg+Z.
 *
 * Deshalb wird der Wechsel einmalig festgehalten. Ohne dieses Einfrieren
 * wuerde der Schluessel beim ersten Tastendruck erneut wechseln und genau den
 * Neuaufbau ausloesen, den er verhindern soll.
 */
function useBaselineStamp(
  baselineLoaded: boolean,
  hasUnsavedChanges: boolean,
  ticketId: string | null,
): string {
  const [stamp, setStamp] = useState('pending');

  useEffect(() => {
    setStamp('pending');
  }, [ticketId]);

  useEffect(() => {
    // Nur der Weg von "noch nichts da" nach "da" zaehlt, und nur im
    // unberuehrten Zustand.
    setStamp((current) => {
      if (current !== 'pending') return current;
      if (!baselineLoaded || hasUnsavedChanges) return current;
      return 'ready';
    });
  }, [baselineLoaded, hasUnsavedChanges]);

  return stamp;
}

interface FieldSectionProps {
  editorKey: string;
  field: TicketField;
  value: string;
  /** Feldwert im letzten Commit; null = kein Vergleichsstand. */
  baseline: string | null;
  /** Warum es keinen gibt - nur zur Anzeige, wenn baseline null ist. */
  baselineReason: string | null;
  onChange: (next: string) => void;
}

function FieldSection({
  editorKey,
  field,
  value,
  baseline,
  baselineReason,
  onChange,
}: FieldSectionProps) {
  const visual = allowsVisualEditor(field.dialect);

  return (
    <section className="ticket-field">
      <div className="ticket-field-head">
        <h3 className="ticket-field-label">{field.label}</h3>
        <span className="ticket-badge" title="Format des Feldes - bleibt erhalten">
          {DIALECT_LABEL[field.dialect]}
        </span>
        {/* Ohne diesen Hinweis waere fehlendes Gruen mehrdeutig: keine
            Aenderung oder kein Vergleich? Nur beim visuellen Editor, denn
            nur dort gibt es die Markierung ueberhaupt. */}
        {visual && baseline === null && baselineReason && (
          <span className="ticket-badge ticket-badge-muted" title={baselineReason}>
            ohne Vergleich
          </span>
        )}
      </div>

      {!visual && (
        <p className="ticket-status ticket-status-warn">
          Liegt als {DIALECT_LABEL[field.dialect]} vor und wird im Quelltext bearbeitet.
          Ein visueller Editor müsste den Wert nach Markdown umschreiben und verlöre
          dabei Formatierung, die Azure so erwartet.
        </p>
      )}

      {visual ? (
        <MilkdownDescriptionEditor
          key={editorKey}
          initialValue={value}
          baseline={baseline}
          onChange={onChange}
        />
      ) : (
        <HtmlSourceEditor value={value} onChange={onChange} />
      )}
    </section>
  );
}
