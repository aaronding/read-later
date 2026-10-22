import type { Metadata } from "next";
import { LibraryPage } from "@/components/library-page";

export const metadata: Metadata = { title: "Archive" };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <LibraryPage view="archive" searchParams={searchParams} />;
}
