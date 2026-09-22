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
            editorKey={`${category}:${doc.id}:${field.field}`}
            field={field}
            value={state.values[field.field] ?? ''}
            onChange={(next) => state.setValue(field.field, next)}
          />
        ))}
      </div>
    </div>
  );
}

interface FieldSectionProps {
  editorKey: string;
  field: TicketField;
  value: string;
  onChange: (next: string) => void;
}

function FieldSection({ editorKey, field, value, onChange }: FieldSectionProps) {
  const visual = allowsVisualEditor(field.dialect);

  return (
    <section className="ticket-field">
      <div className="ticket-field-head">
        <h3 className="ticket-field-label">{field.label}</h3>
        <span className="ticket-badge" title="Format des Feldes - bleibt erhalten">
          {DIALECT_LABEL[field.dialect]}
        </span>
      </div>

      {!visual && (
        <p className="ticket-status ticket-status-warn">
          Liegt als {DIALECT_LABEL[field.dialect]} vor und wird im Quelltext bearbeitet.
          Ein visueller Editor müsste den Wert nach Markdown umschreiben und verlöre
          dabei Formatierung, die Azure so erwartet.
        </p>
      )}

      {visual ? (
        <MilkdownDescriptionEditor key={editorKey} initialValue={value} onChange={onChange} />
      ) : (
        <HtmlSourceEditor value={value} onChange={onChange} />
      )}
    </section>
  );
}
