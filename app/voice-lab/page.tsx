import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VoiceLab from "./VoiceLab";

// The voice-reply spike (docs/superpowers/specs/2026-11-28-voice-reply-design.md, step 0): a throwaway page for
// trying Kokoro on real devices. Local dev and Vercel previews only; production gets a 404. Not linked anywhere.
export const metadata: Metadata = {
  title: "Voice lab",
  robots: { index: false, follow: false },
};

export default function VoiceLabPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <VoiceLab />;
}
