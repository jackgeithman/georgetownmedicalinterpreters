import { prisma } from "./prisma";

interface LogActivityParams {
  actorId?: string;
  actorEmail?: string;
  actorName?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
}

export async function logActivity(params: LogActivityParams) {
  try {
    await prisma.activityLog.create({ data: params });
  } catch {
    // Never let logging failure break a request
  }
}
