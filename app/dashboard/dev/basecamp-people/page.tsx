import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BasecampPeopleDirectoryClient } from "@/components/agencypulse/basecamp-people-directory-client";
import { isBasecampPeopleDirectoryEnabled } from "@/lib/dev/basecamp-mapper-guard";

export const metadata: Metadata = {
  title: "anthony · Basecamp people",
  description: "Directory of Basecamp account people with id and email for mapping and internal contacts.",
};

export default function BasecampPeoplePage() {
  if (!isBasecampPeopleDirectoryEnabled()) {
    notFound();
  }

  return <BasecampPeopleDirectoryClient />;
}
