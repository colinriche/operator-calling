"use client";

import { useState } from "react";
import {
  CollapsibleSection,
  Highlight,
} from "@/components/admin/CollapsibleSection";
import { GlobalSchedulePanel } from "@/components/admin/GlobalSchedulePanel";
import { OrganiserInterestPanel } from "@/components/admin/OrganiserInterestPanel";
import {
  OutreachSourcesPanel,
  type LinkTotals,
} from "@/components/admin/OutreachSourcesPanel";
import { WaitlistDefaultsPanel } from "@/components/admin/WaitlistDefaultsPanel";

// The outreach page's sections, each collapsible. Every panel reports one
// number that grows with new activity (new testers, organiser offers,
// registrations); CollapsibleSection turns that into the green arrow.
// Waitlist defaults already collapses itself and has no incoming activity.

export function OutreachSections() {
  const [schedule, setSchedule] = useState<number | undefined>();
  const [organisers, setOrganisers] = useState<number | undefined>();
  const [sources, setSources] = useState<number | undefined>();
  const [totals, setTotals] = useState<LinkTotals | undefined>();

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-1">
          <h1 className="font-heading font-bold text-3xl text-foreground">
            Outreach
          </h1>
          {/* Combined over every link. Green while a number is above what was
              last recorded, back to normal on the next visit. */}
          {totals && (
            <p className="text-sm text-muted-foreground">
              <Highlight id="outreach:total:visits" value={totals.visits} className="font-semibold">
                {totals.visits}
              </Highlight>{" "}
              visits
              {" · "}
              <Highlight id="outreach:total:uniques" value={totals.uniques} className="font-semibold">
                {totals.uniques}
              </Highlight>{" "}
              uniques
              {" · "}
              <Highlight
                id="outreach:total:registrations"
                value={totals.registrations}
                className="font-semibold"
              >
                {totals.registrations}
              </Highlight>{" "}
              registrations
            </p>
          )}
        </div>
        <p className="text-muted-foreground">
          Track where waitlist links are posted and how much demand each one
          produces. Adding a source here does not create a group.
        </p>
      </div>

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
        <OutreachSourcesPanel onActivity={setSources} onTotals={setTotals} />
      </CollapsibleSection>
    </div>
  );
}
