/**
 * How the drawer draws a card, and what kinds of card there are. Kept apart from lib/a2ui-catalog.ts, with no
 * imports, so the drawer can check a streamed card without loading A2UI: the card renderer (and Google's engine)
 * load only once a card arrives.
 *
 * A flair lets a card borrow its page's look (same same but different). Both cards today are plain; a new flair
 * is added here when a card that belongs to one page arrives.
 */
export const FLAIRS = ["plain"] as const;
export type Flair = (typeof FLAIRS)[number];

/**
 * compare: two or three named things side by side. evidence: an answer that spans the site, as the roles and
 * projects behind it plus the articles it cites.
 */
export const CARD_KINDS = ["compare", "evidence"] as const;
export type CardKind = (typeof CARD_KINDS)[number];
