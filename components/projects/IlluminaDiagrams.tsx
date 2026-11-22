import type { ReactNode } from 'react'

/*
 * Illumina was built at work, so its projector shows how it fits together instead of screenshots.
 * Boxes light up in order (--d) each time the frame comes on; styles are .dg-* in app/globals.css.
 */

function Node({ d, kind, children }: { d: number; kind?: 'plain' | 'check' | 'out'; children: ReactNode }) {
  return (
    <div className={`dg-node${kind ? ` dg-${kind}` : ''}`} style={{ ['--d' as string]: d }}>
      {children}
    </div>
  )
}

/** Documents into searchable collections: chunk, enrich each chunk, then index. */
export function IlluminaReady() {
  return (
    <div className="dg">
      <p className="dg-ln">Getting ready</p>
      <div className="dg-flow dg-flow-ready">
        <Node d={0} kind="plain">
          Documents
        </Node>
        <Node d={1}>Semantic double-merge chunking</Node>
        <div className="dg-group">
          <span className="dg-group-label">Enrich each chunk</span>
          <Node d={2}>Chunk dreaming</Node>
          <Node d={2}>
            Metadata engineering<small>questions this chunk can answer</small>
          </Node>
          <Node d={2}>
            Contextual retrieval<small>a concise summary at the top of the chunk</small>
          </Node>
        </div>
        <Node d={3}>
          Vector collections<small>blue-green swap</small>
        </Node>
      </div>
    </div>
  )
}

/** Fan out, fan in: sub-questions answered in parallel, combined, checked, and asked again if need be. */
export function IlluminaAnswer() {
  return (
    <div className="dg">
      <p className="dg-ln">Answering a question · fan out, fan in</p>
      <div className="dg-flow dg-flow-answer">
        <Node d={0} kind="plain">
          The question
        </Node>
        <Node d={1}>Split into sub-questions</Node>
        <div className="dg-group dg-lanes">
          {[1, 2, 3].map((n) => (
            <div key={n} className="dg-lane">
              <span className="dg-group-label">Sub-question {n}</span>
              <div className="dg-pair">
                <Node d={2}>
                  HyDE + hybrid search<small>keyword + vector</small>
                </Node>
                <Node d={2.6}>Re-rank</Node>
                <Node d={3.2}>Prompt compression</Node>
                <Node d={3.8}>Sub-answer</Node>
              </div>
            </div>
          ))}
        </div>
        <Node d={4.6}>Combine</Node>
        <Node d={5.4} kind="check">
          Does it answer the question?
        </Node>
        <Node d={7.2} kind="out">
          The answer
        </Node>
      </div>
      <p className="dg-loop" style={{ ['--d' as string]: 6.4 }}>
        ↺ Not yet: ask a follow-up, and go round again
      </p>
    </div>
  )
}
