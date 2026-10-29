import { randomUUID } from "node:crypto";

export type AgentPhase =
  | "planning"
  | "querying"
  | "simulating"
  | "previewing"
  | "awaiting-approval"
  | "patching"
  | "validating"
  | "complete"
  | "rejected"
  | "error";

export type AgentEvent = {
  type: "agent:event";
  missionId: string;
  phase: AgentPhase;
  message: string;
  at: string;
  tool?: string;
  data?: unknown;
};

export type AgentMission = {
  id: string;
  goal: string;
  targetNodeId?: string;
  status: AgentPhase;
  createdAt: string;
  events: AgentEvent[];
  pending: {
    title: string;
    diff: string;
    files: string[];
    warnings: string[];
  } | null;
};

type AgentToolkit = {
  query: (aql: string, limit: number) => unknown;
  simulate: (operations: unknown[]) => unknown;
  previewMigration: (recipeId: string) => MigrationLike;
  applyMigration: (recipeId: string) => MigrationLike;
  previewRefactor: (recipeId: string, nodeId: string) => RefactorLike;
  applyRefactor: (recipeId: string, nodeId: string) => RefactorLike;
  verifyRulebook: () => RulebookLike;
};

type MigrationLike = {
  files?: Array<{ path: string; diff: string }>;
  applied?: boolean;
  summary?: string;
  changed?: boolean;
  error?: string;
};

type RefactorLike = {
  files?: Array<{ path: string; diff: string }>;
  applied?: boolean;
  changed?: boolean;
  title?: string;
  diff?: string;
  warnings?: string[];
  error?: string;
};

type RulebookLike = {
  errorCount?: number;
  passed?: boolean;
  diagnostics?: Array<{ message: string }>;
};

export class AgentMissionManager {
  private readonly missions = new Map<string, AgentMission>();
  private readonly appliers = new Map<string, () => Promise<void>>();
  private readonly toolkit: AgentToolkit;
  private readonly emitEvent: (event: AgentEvent) => void;

  constructor(toolkit: AgentToolkit, emitEvent: (event: AgentEvent) => void) {
    this.toolkit = toolkit;
    this.emitEvent = emitEvent;
  }

  list(): AgentMission[] {
    return [...this.missions.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  get(id: string): AgentMission | null {
    return this.missions.get(id) ?? null;
  }

  start(goal: string, targetNodeId?: string): AgentMission {
    const mission: AgentMission = {
      id: `mission_${randomUUID().slice(0, 8)}`,
      goal,
      targetNodeId,
      status: "planning",
      createdAt: new Date().toISOString(),
      events: [],
      pending: null,
    };
    this.missions.set(mission.id, mission);
    void this.run(mission);
    return mission;
  }

  async approve(id: string): Promise<AgentMission | null> {
    const mission = this.missions.get(id);
    const apply = this.appliers.get(id);
    if (!mission || !apply) {
      return null;
    }
    this.events(mission, "patching", "Applying the approved architecture patch.");
    try {
      await apply();
      this.events(mission, "validating", "Running post-patch rulebook verification.");
      const verification = this.toolkit.verifyRulebook();
      if ((verification.errorCount ?? 0) > 0) {
        this.events(
          mission,
          "validating",
          `Rulebook reports ${verification.errorCount} error(s) after patch.`,
          "verify_rulebook",
          verification,
        );
      } else {
        this.events(
          mission,
          "validating",
          "Rulebook verification passed.",
          "verify_rulebook",
          verification,
        );
      }
      mission.status = "complete";
      mission.pending = null;
      this.events(mission, "complete", "Mission complete. Review the diff and validation report.");
    } catch (error) {
      mission.status = "error";
      this.events(mission, "error", message(error));
    }
    this.appliers.delete(id);
    return mission;
  }

  reject(id: string): AgentMission | null {
    const mission = this.missions.get(id);
    if (!mission) {
      return null;
    }
    mission.status = "rejected";
    mission.pending = null;
    this.appliers.delete(id);
    this.events(mission, "rejected", "Mission rejected by the human reviewer.");
    return mission;
  }

  private async run(mission: AgentMission): Promise<void> {
    try {
      this.events(mission, "planning", "Decomposing the architecture mission.");
      mission.status = "querying";
      this.events(mission, "querying", "Querying the knowledge graph with AQL.", "query_topology");
      const query = this.toolkit.query("MATCH (c:Component) RETURN c LIMIT 20", 20);
      const queryData = query as { results?: Array<{ id: string; title: string }> };
      this.events(
        mission,
        "querying",
        `Found ${queryData.results?.length ?? 0} relevant nodes.`,
        "query_topology",
        queryData,
      );

      const goal = mission.goal.toLowerCase();
      const target =
        mission.targetNodeId ??
        queryData.results?.find((result) => result.id.includes("component"))?.id;

      if (goal.includes("token") || goal.includes("màu") || goal.includes("color")) {
        this.events(
          mission,
          "previewing",
          "Previewing CSS-to-token migration.",
          "apply_ast_mutation",
        );
        const preview = this.toolkit.previewMigration("css-to-tokens");
        if (!preview.changed || !preview.files?.length) {
          this.events(mission, "complete", "No token-safe changes were found.");
          mission.status = "complete";
          return;
        }
        mission.pending = {
          title: "Strict token migration",
          diff: preview.files.map((file) => file.diff).join("\n"),
          files: preview.files.map((file) => file.path),
          warnings: [],
        };
        this.appliers.set(mission.id, async () => {
          this.toolkit.applyMigration("css-to-tokens");
        });
      } else if ((goal.includes("split") || goal.includes("tách")) && target) {
        this.events(
          mission,
          "previewing",
          "Previewing component boundary extraction.",
          "apply_ast_mutation",
        );
        const preview = this.toolkit.previewRefactor("extract-component-boundary", target);
        if (!preview.changed) {
          this.events(mission, "complete", "No safe component boundary was found.");
          mission.status = "complete";
          return;
        }
        mission.pending = {
          title: preview.title ?? "Extract component boundary",
          diff: preview.diff ?? "",
          files: preview.files?.map((file) => file.path) ?? [],
          warnings: preview.warnings ?? [],
        };
        this.appliers.set(mission.id, async () => {
          this.toolkit.applyRefactor("extract-component-boundary", target);
        });
      } else if ((goal.includes("delete") || goal.includes("xóa")) && target) {
        this.events(
          mission,
          "simulating",
          "Simulating node deletion on the shadow graph.",
          "simulate_refactor",
        );
        const result = this.toolkit.simulate([{ type: "delete-node", nodeIds: [target] }]);
        this.events(
          mission,
          "awaiting-approval",
          "Simulation complete. No files were changed.",
          "simulate_refactor",
          result,
        );
        mission.status = "complete";
        return;
      } else {
        this.events(mission, "complete", "Architecture audit complete. No patch is required.");
        mission.status = "complete";
        return;
      }

      mission.status = "awaiting-approval";
      this.events(
        mission,
        "awaiting-approval",
        `Prepared ${mission.pending.files.length} file(s). Human approval is required before writing.`,
        "apply_ast_mutation",
        { files: mission.pending.files },
      );
    } catch (error) {
      mission.status = "error";
      this.events(mission, "error", message(error));
    }
  }

  private events(
    mission: AgentMission,
    phase: AgentPhase,
    message: string,
    tool?: string,
    data?: unknown,
  ): void {
    const event: AgentEvent = {
      type: "agent:event",
      missionId: mission.id,
      phase,
      message,
      at: new Date().toISOString(),
      ...(tool ? { tool } : {}),
      ...(data !== undefined ? { data } : {}),
    };
    mission.events.push(event);
    mission.status = phase;
    this.emitEvent(event);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
