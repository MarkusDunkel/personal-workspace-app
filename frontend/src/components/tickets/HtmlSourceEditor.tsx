interface HtmlSourceEditorProps {
  value: string;
  onChange: (next: string) => void;
}

/**
 * Quelltext-Editor fuer Beschreibungen im HTML-Dialekt, mit Vorschau.
 *
 * Warum kein WYSIWYG: Azure fuehrt pro Feld EINEN Dialekt, und ein
 * Markdown-Editor kann HTML nicht verlustfrei zurueckgeben - Milkdown haelt
 * rohes HTML zwar als Knoten, gibt dessen Inhalt aber als reinen Text aus,
 * und einen HTML-Serializer hat es nicht. style-Attribute (die von
 * DESCRIPTION-FORMAT.md vorgeschriebenen Inline-Tabellenrahmen), &nbsp; und
 * <mark> ueberlebten das nicht. Hier wird der Wert deshalb unveraendert
 * durchgereicht.
 *
 * Die Vorschau nutzt dangerouslySetInnerHTML. Das ist an dieser Stelle
 * vertretbar: der Inhalt stammt aus dem eigenen Azure-Board, nicht von
 * Fremden, und er wird ohnehin genauso in Azure gerendert. Ein Sanitizer
 * wuerde zudem genau die Attribute entfernen, deren Erhalt hier der Zweck ist
 * - die Vorschau zeigte dann etwas anderes als das Ziel.
 */
export function HtmlSourceEditor({ value, onChange }: HtmlSourceEditorProps) {
  return (
    <div className="ticket-html-editor">
      <textarea
        className="ticket-html-source"
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        aria-label="HTML-Quelltext der Beschreibung"
      />
      <div className="ticket-html-preview-wrap">
        <span className="ticket-html-preview-label">Vorschau</span>
        <div
          className="ticket-html-preview"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: value }}
        />
      </div>
    </div>
  );
}
