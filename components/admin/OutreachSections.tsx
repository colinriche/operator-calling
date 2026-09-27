"use client";

import { useState } from "react";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import { GlobalSchedulePanel } from "@/components/admin/GlobalSchedulePanel";
import { OrganiserInterestPanel } from "@/components/admin/OrganiserInterestPanel";
import { OutreachSourcesPanel } from "@/components/admin/OutreachSourcesPanel";
import { WaitlistDefaultsPanel } from "@/components/admin/WaitlistDefaultsPanel";

// The outreach page's sections, each collapsible. Every panel reports one
// number that grows with new activity (new testers, organiser offers,
// registrations); CollapsibleSection turns that into the green arrow.
// Waitlist defaults already collapses itself and has no incoming activity.

export function OutreachSections() {
  const [schedule, setSchedule] = useState<number | undefined>();
  const [organisers, setOrganisers] = useState<number | undefined>();
  const [sources, setSources] = useState<number | undefined>();

  return (
    <div className="space-y-6">
      <CollapsibleSection
        id="global-schedule"
        title="Early access call windows"
        summary="When the global pool runs, and how many testers are waiting."
        activity={schedule}
      >
        <GlobalSchedulePanel onActivity={setSchedule} />
      </CollapsibleSection>

      <CollapsibleSection
        id="organiser-interest"
        title="Organiser interest"
        summary="People who offered to help organise calls."
        activity={organisers}
      >
        <OrganiserInterestPanel onActivity={setOrganisers} />
      </CollapsibleSection>

      <WaitlistDefaultsPanel />

      <CollapsibleSection
        id="outreach-sources"
        title="Outreach sources"
        summary="Where waitlist links are posted and the demand each produces."
        activity={sources}
      >
        <OutreachSourcesPanel onActivity={setSources} />
      </CollapsibleSection>
    </div>
  );
}
