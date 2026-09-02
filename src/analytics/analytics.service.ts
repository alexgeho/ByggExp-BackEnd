import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  AnalyticsEvent,
  AnalyticsEventDocument,
} from "./schemas/analytics-event.schema";
import { TrackEventDto } from "./dto/track-events.dto";

type Actor = {
  userId?: string | null;
  companyId?: string | null;
  role?: string | null;
};

// The onboarding events we chart. Keep in sync with the admin client
// (src/shared/analytics.js + OnboardingChecklist).
const ONBOARDING_STAGES = [
  "onboarding_viewed",
  "onboarding_step_completed",
  "company_activated",
  "onboarding_completed",
];

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(AnalyticsEvent.name)
    private readonly eventModel: Model<AnalyticsEventDocument>,
  ) {}

  async track(
    events: TrackEventDto[],
    actor: Actor,
  ): Promise<{ ok: true; stored: number }> {
    if (!events?.length) return { ok: true, stored: 0 };
    const docs = events.map((e) => ({
      event: e.event,
      props: e.props || {},
      clientTs: typeof e.ts === "number" ? e.ts : null,
      userId: actor.userId || null,
      companyId: actor.companyId || null,
      role: actor.role || null,
    }));
    const inserted = await this.eventModel.insertMany(docs, {
      ordered: false,
    });
    return { ok: true, stored: inserted.length };
  }

  // Superadmin funnel: how many distinct companies reached each onboarding
  // stage, plus median time-to-activation. Distinct-by-company so one noisy
  // browser can't skew the counts.
  async onboardingFunnel(): Promise<{
    stages: Array<{ event: string; companies: number; events: number }>;
    activatedCompanies: number;
  }> {
    const rows = await this.eventModel.aggregate([
      { $match: { event: { $in: ONBOARDING_STAGES } } },
      {
        $group: {
          _id: "$event",
          companies: { $addToSet: "$companyId" },
          events: { $sum: 1 },
        },
      },
    ]);

    const byEvent = new Map(
      rows.map((r: { _id: string; companies: unknown[]; events: number }) => [
        r._id,
        {
          companies: r.companies.filter(Boolean).length,
          events: r.events,
        },
      ]),
    );

    const stages = ONBOARDING_STAGES.map((event) => ({
      event,
      companies: byEvent.get(event)?.companies || 0,
      events: byEvent.get(event)?.events || 0,
    }));

    return {
      stages,
      activatedCompanies: byEvent.get("company_activated")?.companies || 0,
    };
  }
}
