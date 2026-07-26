interface LineHintProps {
  text: string;
}

export function LineHint({ text }: LineHintProps) {
  return (
    <div id="line-hint" className="line-hint">
      {text}
    </div>
  );
}
