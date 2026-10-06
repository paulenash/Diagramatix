/**
 * The hint line along the bottom of the Dashboard and Project screens. Styled as the Diagram screen's status bar is (small grey text on a
 * pale rounded plate, hints separated by "·"), but a row of its own at the foot of the screen rather than a plate floating over the content,
 * so it never covers the last row of the navigation tree or the tiles.
 */
export function ScreenHintBar({ hints }: { hints: readonly string[] }) {
  return (
    <div data-testid="screen-hints" className="shrink-0 px-2 pb-1 pt-0.5 select-none">
      <span className="inline-block text-xs text-gray-400 bg-white/80 px-2 py-1 rounded">{hints.join(" · ")}</span>
    </div>
  );
}
