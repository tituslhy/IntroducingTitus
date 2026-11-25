'use client'

/**
 * A thin amber bar that fills while a tour step is up, so it's plain the tour moves on by itself. A CSS
 * animation, restarted per step (keyed by its index) and frozen while paused, so it stays in step with the
 * player's own clock without any timers here.
 */
export default function TourProgress({ step, ms, paused }: { step: number | string; ms: number; paused: boolean }) {
  return (
    <div aria-hidden="true" data-testid="tour-progress" className="h-[3px] w-full overflow-hidden rounded-full bg-rule">
      <div
        key={step}
        className="tour-progress h-full rounded-full bg-amber"
        style={{ animationDuration: `${ms}ms`, animationPlayState: paused ? 'paused' : 'running' }}
      />
    </div>
  )
}
