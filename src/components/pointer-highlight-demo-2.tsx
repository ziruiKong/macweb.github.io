import { PointerHighlight } from "@/components/ui/pointer-highlight";

export default function PointerHighlightDemo() {
  return (
    <div className="mx-auto max-w-lg py-20 text-2xl font-bold tracking-tight md:text-4xl">
      There has to be some
      <PointerHighlight
        rectangleClassName="border-neutral-300 bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-700"
        pointerClassName="text-yellow-500"
      >
        <span className="relative z-10">background to animate too</span>
      </PointerHighlight>
    </div>
  );
}
