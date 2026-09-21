import { allowsVisualEditor } from '../../api/azureTicketTypes';
import type { DescriptionDialect } from '../../api/azureTicketTypes';
import { useTicketDescription } from '../../hooks/useTicketDescription';
import { HtmlSourceEditor } from './HtmlSourceEditor';
import { MilkdownDescriptionEditor } from './MilkdownDescriptionEditor';

interface TicketEditorProps {
  category: string;
  ticketId: string | null;
}

const DIALECT_LABEL: Record<DescriptionDialect, string> = {
  EMPTY: 'leer',
  PLAIN: 'Text',
  MARKDOWN: 'Markdown',
  HTML: 'HTML',
  MIXED: 'HTML + Markdown',
};

/**
 * Bearbeitet die Beschreibung EINES Tickets und waehlt dafuer den passenden
 * Editor.
 *
 * Die Weiche faellt anhand des GELADENEN Werts, nicht nach Nutzerwunsch: nur
 * so kann eine HTML-Beschreibung gar nicht erst durch den
 * Markdown-Serialisierer laufen und dabei ihre Formatierung verlieren. Azure
 * fuehrt pro Feld einen festen Dialekt (siehe ai-vault/DESCRIPTION-FORMAT.md),
 * und der wird hier nie gewechselt.
 */
export function TicketEditor({ category, ticketId }: TicketEditorProps) {
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

  const visual = allowsVisualEditor(doc.dialect);

  return (
    <div className="ticket-editor">
      <div className="ticket-editor-head">
        <span className="ticket-editor-title">
          #{doc.id} {doc.title}
        </span>
        <span className="ticket-badge" title="Format der Beschreibung - bleibt erhalten">
          {DIALECT_LABEL[doc.dialect]}
        </span>
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

      {!visual && (
        <p className="ticket-status ticket-status-warn">
          Beschreibung liegt als {DIALECT_LABEL[doc.dialect]} vor und wird im Quelltext
          bearbeitet. Ein visueller Editor müsste sie nach Markdown umschreiben und
          verlöre dabei Formatierung, die Azure so erwartet.
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

      {visual ? (
        // key erzwingt einen Neuaufbau je Ticket - Milkdown haelt seinen
        // Zustand ausserhalb von React, sonst bliebe die Undo-Historie des
        // vorigen Tickets erhalten.
        <MilkdownDescriptionEditor
          key={`${category}:${doc.id}`}
          initialValue={doc.description}
          onChange={state.setDescription}
        />
      ) : (
        <HtmlSourceEditor value={state.description} onChange={state.setDescription} />
      )}
    </div>
  );
}
