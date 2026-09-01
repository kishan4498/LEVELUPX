import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import type { Guild, TeamQuest } from "@prisma/client";
import { GuildRole, GuildVisibility } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { writeLog } from "../../common/logger/logger.js";
import { publishRealtimeEvent, removeUserFromGuildRoom } from "../../realtime/realtime.publisher.js";
import { realtimeEvents } from "../../realtime/realtime.types.js";
import type {
  CreateGuildInput,
  CreateTeamQuestInput,
  GuildResponseDto,
  JoinGuildInput,
  TeamQuestDto,
  UpdateTeamQuestProgressInput
} from "./guild.types.js";
import type { GuildWithMembers, IGuildRepository, TeamQuestProgressResult } from "./guild.repository.js";

export class GuildService {
  constructor(
    private readonly repo: IGuildRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async create(userId: string, guildDraft: CreateGuildInput): Promise<GuildResponseDto> {
    const visibility = guildDraft.visibility ?? GuildVisibility.PUBLIC;
    const inviteCode = visibility === GuildVisibility.PRIVATE ? this.generateInviteCode() : undefined;
    const guild = await this.repo.create({
      ownerId: userId,
      name: guildDraft.name,
      description: guildDraft.description,
      visibility,
      inviteCodeHash: inviteCode ? await bcrypt.hash(inviteCode, 12) : undefined
    });

    return {
      ...this.toDto(guild),
      ...(inviteCode ? { inviteCode } : {})
    };
  }

  async list(userId: string): Promise<GuildResponseDto[]> {
    const guilds = await this.repo.findMany(userId);
    return guilds.map((guild) => this.toListDto(guild));
  }

  async getById(userId: string, guildId: string): Promise<GuildResponseDto> {
    const guild = await this.repo.findById(guildId);

    if (!guild) {
      throw new AppError("Guild not found", 404, "GUILD_NOT_FOUND");
    }

    if (guild.visibility === GuildVisibility.PRIVATE && !guild.members.some((member) => member.userId === userId)) {
      throw new AppError("Guild not found", 404, "GUILD_NOT_FOUND");
    }

    return this.toDto(guild);
  }

  async join(userId: string, guildId: string, credentials: JoinGuildInput = {}): Promise<GuildResponseDto> {
    const guild = await this.repo.findById(guildId);

    if (!guild) {
      writeLog({ level: "warn", userId, guildId, message: "Join failed: guild not found" });
      throw new AppError("Guild not found", 404, "GUILD_NOT_FOUND");
    }

    const member = await this.repo.findMember({ guildId, userId });

    if (member) {
      writeLog({ level: "warn", userId, guildId, message: "Join failed: already a member" });
      throw new AppError("You are already a member of this guild", 409, "GUILD_ALREADY_JOINED");
    }

    if (
      guild.visibility === GuildVisibility.PRIVATE &&
      (!credentials.inviteCode ||
        !guild.inviteCodeHash ||
        !(await bcrypt.compare(credentials.inviteCode, guild.inviteCodeHash)))
    ) {
      writeLog({ level: "warn", userId, guildId, message: "Join failed: invalid invite code for private guild" });
      throw new AppError("A valid invite code is required", 403, "GUILD_INVITE_INVALID");
    }

    const joined = await this.repo.join({ guildId, userId });
    writeLog({ level: "info", userId, guildId, message: "User joined guild successfully" });

    publishRealtimeEvent({
      name: realtimeEvents.guildMemberChanged,
      guildId,
      payload: {
        guildId,
        memberCount: joined.members.length,
        action: "JOINED"
      }
    });

    return this.toDto(joined);
  }

  async rollInviteCode(userId: string, guildId: string): Promise<string> {
    await this.requireGuildRole(userId, guildId, [GuildRole.OWNER]);
    writeLog({ level: "info", userId, guildId, message: "Rolling guild invite code" });
    const inviteCode = this.generateInviteCode();
    await this.repo.updateInviteCodeHash(guildId, await bcrypt.hash(inviteCode, 12));
    return inviteCode;
  }

  async leave(userId: string, guildId: string): Promise<void> {
    const guild = await this.repo.findById(guildId);

    if (!guild) {
      throw new AppError("Guild not found", 404, "GUILD_NOT_FOUND");
    }

    const member = await this.repo.findMember({ guildId, userId });

    if (!member) {
      throw new AppError("You are not a member of this guild", 404, "GUILD_MEMBERSHIP_NOT_FOUND");
    }

    if (member.role === GuildRole.OWNER) {
      // Ownership must move atomically before the owner can leave.
      writeLog({ level: "warn", userId, guildId, message: "Leave blocked: owner tried to leave without transfer" });
      throw new AppError("Guild owners cannot leave before ownership transfer is supported", 409, "GUILD_OWNER_CANNOT_LEAVE");
    }

    await this.repo.leave({ guildId, userId });
    removeUserFromGuildRoom(userId, guildId);
    writeLog({ level: "info", userId, guildId, message: "User left guild" });
    const updated = await this.repo.findById(guildId);

    publishRealtimeEvent({
      name: realtimeEvents.guildMemberChanged,
      guildId,
      payload: {
        guildId,
        memberCount: updated?.members.length ?? 0,
        action: "LEFT"
      }
    });
  }

  async launchTeamQuest(userId: string, guildId: string, questDraft: CreateTeamQuestInput): Promise<TeamQuestDto> {
    await this.requireGuildRole(userId, guildId, [GuildRole.OWNER, GuildRole.MODERATOR]);
    writeLog({ level: "info", userId, guildId, targetType: questDraft.targetType, message: "Launching new team quest" });

    const teamQuest = await this.repo.launchTeamQuest(guildId, questDraft);
    publishRealtimeEvent({
      name: realtimeEvents.teamQuestCreated,
      guildId,
      payload: {
        teamQuestId: teamQuest.id,
        title: teamQuest.title,
        targetType: teamQuest.targetType,
        targetValue: teamQuest.targetValue,
        status: teamQuest.status
      }
    });

    return this.toTeamQuestDto(teamQuest);
  }

  async listTeamQuests(userId: string, guildId: string): Promise<TeamQuestDto[]> {
    await this.requireMembership(userId, guildId);
    const teamQuests = await this.repo.findTeamQuests(guildId);
    return teamQuests.map((teamQuest) => this.toTeamQuestDto(teamQuest));
  }

  async logTeamQuestProgress(
    userId: string,
    guildId: string,
    teamQuestId: string,
    progressUpdate: UpdateTeamQuestProgressInput
  ): Promise<TeamQuestDto> {
    await this.requireMembership(userId, guildId);

    const teamQuest = await this.repo.findTeamQuest({ guildId, teamQuestId });

    if (!teamQuest) {
      throw new AppError("Team quest not found", 404, "TEAM_QUEST_NOT_FOUND");
    }

    const now = this.now();
    if (
      teamQuest.status !== "ACTIVE" ||
      teamQuest.startDate.getTime() > now.getTime() ||
      teamQuest.endDate.getTime() < now.getTime()
    ) {
      throw new AppError("Only active team quests can receive progress", 409, "TEAM_QUEST_NOT_ACTIVE");
    }

    // Keep progress, completion, and payout atomic when members race to finish.
    const progress = await this.repo.logTeamQuestProgress({
      teamQuest,
      userId,
      progressDelta: progressUpdate.progressDelta
    });

    publishRealtimeEvent({
      name: realtimeEvents.teamQuestProgressUpdated,
      guildId,
      payload: {
        teamQuestId: progress.teamQuest.id,
        currentProgress: progress.teamQuest.currentProgress,
        targetValue: progress.teamQuest.targetValue,
        status: progress.teamQuest.status,
        ...(progress.rewardPayout ? { rewardPayout: progress.rewardPayout } : {})
      }
    });

    if (progress.rewardPayout) {
      writeLog({ level: "info", teamQuestId, guildId, message: "Team quest completed, rewards distributed!" });
    }

    return this.toTeamQuestDto(progress);
  }

  private async requireMembership(userId: string, guildId: string) {
    const guild = await this.repo.findById(guildId);

    if (!guild) {
      throw new AppError("Guild not found", 404, "GUILD_NOT_FOUND");
    }

    const member = await this.repo.findMember({ guildId, userId });

    if (!member) {
      throw new AppError("You must be a guild member for this action", 403, "GUILD_MEMBERSHIP_REQUIRED");
    }

    return member;
  }

  private async requireGuildRole(userId: string, guildId: string, roles: GuildRole[]) {
    const member = await this.requireMembership(userId, guildId);

    if (!roles.includes(member.role)) {
      throw new AppError("You do not have permission to manage team quests", 403, "GUILD_ROLE_REQUIRED");
    }

    return member;
  }

  private toDto(guild: GuildWithMembers): GuildResponseDto {
    return {
      id: guild.id,
      name: guild.name,
      description: guild.description,
      ownerId: guild.ownerId,
      totalXp: guild.totalXp,
      visibility: guild.visibility,
      createdAt: guild.createdAt.toISOString(),
      members: guild.members.map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.user.name,
        role: member.role,
        joinedAt: member.joinedAt.toISOString()
      }))
    };
  }

  private toListDto(guild: Guild): GuildResponseDto {
    return {
      id: guild.id,
      name: guild.name,
      description: guild.description,
      ownerId: guild.ownerId,
      totalXp: guild.totalXp,
      visibility: guild.visibility,
      createdAt: guild.createdAt.toISOString()
    };
  }

  private toTeamQuestDto(source: TeamQuest | TeamQuestProgressResult): TeamQuestDto {
    const teamQuest = "teamQuest" in source ? source.teamQuest : source;
    const rewardPayout = "rewardPayout" in source ? source.rewardPayout : null;

    return {
      id: teamQuest.id,
      guildId: teamQuest.guildId,
      title: teamQuest.title,
      targetType: teamQuest.targetType,
      targetValue: teamQuest.targetValue,
      currentProgress: teamQuest.currentProgress,
      rewardXp: teamQuest.rewardXp,
      rewardCoins: teamQuest.rewardCoins,
      startDate: teamQuest.startDate.toISOString(),
      endDate: teamQuest.endDate.toISOString(),
      status: teamQuest.status,
      repeatWeekly: teamQuest.repeatWeekly,
      recurrenceSeriesId: teamQuest.recurrenceSeriesId,
      recurrenceWeekStart: teamQuest.recurrenceWeekStart?.toISOString() ?? null,
      sourceTeamQuestId: teamQuest.sourceTeamQuestId,
      ...(rewardPayout ? { rewardPayout } : {})
    };
  }

  private generateInviteCode() {
    return randomBytes(18).toString("base64url");
  }
}
