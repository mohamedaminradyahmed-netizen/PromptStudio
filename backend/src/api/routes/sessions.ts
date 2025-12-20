import { Router, Request, Response } from 'express';
import prisma from '../../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler, Errors } from '../middleware/errorHandler.js';
import { validateBody, validateQuery, validateParams } from '../validation/middleware.js';
import {
  createSessionSchema,
  updateSessionSchema,
  inviteMemberSchema,
  updateMemberSchema,
  createSnapshotSchema,
  paginationSchema,
  idParamSchema,
} from '../validation/schemas.js';
import { z } from 'zod';

const router = Router();

// Schema for member params
const memberParamsSchema = z.object({
  id: z.string(),
  memberId: z.string(),
});

// Schema for snapshot params
const snapshotParamsSchema = z.object({
  id: z.string(),
  snapshotId: z.string(),
});

// Get all sessions for current user
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;

    const sessions = await prisma.collaborationSession.findMany({
      where: {
        OR: [
          { ownerId: authReq.userId },
          { members: { some: { userId: authReq.userId } } },
        ],
      },
      include: {
        owner: true,
        members: {
          include: { user: true },
        },
        _count: {
          select: {
            comments: true,
            editHistory: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      success: true,
      data: sessions.map(session => ({
        id: session.id,
        name: session.name,
        description: session.description,
        isActive: session.isActive,
        shareToken: session.shareToken,
        ownerId: session.ownerId,
        owner: {
          id: session.owner.id,
          email: session.owner.email,
          name: session.owner.name,
          avatar: session.owner.avatar,
          color: session.owner.color,
        },
        memberCount: session.members.length,
        commentCount: session._count.comments,
        editCount: session._count.editHistory,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      })),
    });
  })
);

// Create new session
router.post(
  '/',
  validateBody(createSessionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { name, description, content } = req.body;

    const session = await prisma.collaborationSession.create({
      data: {
        name,
        description,
        content: content || '',
        ownerId: authReq.userId,
        members: {
          create: {
            userId: authReq.userId,
            role: 'OWNER',
          },
        },
      },
      include: {
        owner: true,
        members: {
          include: { user: true },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: session.id,
        name: session.name,
        description: session.description,
        content: session.content,
        isActive: session.isActive,
        shareToken: session.shareToken,
        ownerId: session.ownerId,
        owner: {
          id: session.owner.id,
          email: session.owner.email,
          name: session.owner.name,
          avatar: session.owner.avatar,
          color: session.owner.color,
        },
        members: session.members.map(m => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          user: {
            id: m.user.id,
            email: m.user.email,
            name: m.user.name,
            avatar: m.user.avatar,
            color: m.user.color,
          },
        })),
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
    });
  })
);

// Get session by ID
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const session = await prisma.collaborationSession.findUnique({
      where: { id },
      include: {
        owner: true,
        members: {
          include: { user: true },
        },
        comments: {
          where: { parentId: null },
          include: {
            user: true,
            replies: {
              include: { user: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        snapshots: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!session) {
      throw Errors.notFound('Session');
    }

    // Check access
    const isMember = session.members.some(m => m.userId === authReq.userId);
    const isOwner = session.ownerId === authReq.userId;

    if (!isMember && !isOwner) {
      throw Errors.forbidden('You do not have access to this session');
    }

    res.json({
      success: true,
      data: {
        id: session.id,
        name: session.name,
        description: session.description,
        content: session.content,
        isActive: session.isActive,
        shareToken: session.shareToken,
        ownerId: session.ownerId,
        owner: {
          id: session.owner.id,
          email: session.owner.email,
          name: session.owner.name,
          avatar: session.owner.avatar,
          color: session.owner.color,
        },
        members: session.members.map(m => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
          lastSeenAt: m.lastSeenAt.toISOString(),
          user: {
            id: m.user.id,
            email: m.user.email,
            name: m.user.name,
            avatar: m.user.avatar,
            color: m.user.color,
          },
        })),
        comments: session.comments,
        snapshots: session.snapshots,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
    });
  })
);

// Get session by share token (public)
router.get(
  '/share/:shareToken',
  asyncHandler(async (req: Request, res: Response) => {
    const { shareToken } = req.params;

    const session = await prisma.collaborationSession.findUnique({
      where: { shareToken },
      include: {
        owner: true,
        _count: {
          select: { members: true },
        },
      },
    });

    if (!session) {
      throw Errors.notFound('Session');
    }

    if (!session.isActive) {
      throw Errors.forbidden('This session is no longer active');
    }

    res.json({
      success: true,
      data: {
        id: session.id,
        name: session.name,
        description: session.description,
        isActive: session.isActive,
        owner: {
          name: session.owner.name,
          avatar: session.owner.avatar,
        },
        memberCount: session._count.members,
        createdAt: session.createdAt.toISOString(),
      },
    });
  })
);

// Update session
router.patch(
  '/:id',
  validateBody(updateSessionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { name, description, isActive } = req.body;

    // Check ownership
    const session = await prisma.collaborationSession.findUnique({
      where: { id },
    });

    if (!session) {
      throw Errors.notFound('Session');
    }

    if (session.ownerId !== authReq.userId) {
      throw Errors.forbidden('Only the owner can update this session');
    }

    const updatedSession = await prisma.collaborationSession.update({
      where: { id },
      data: {
        name: name ?? session.name,
        description: description ?? session.description,
        isActive: isActive ?? session.isActive,
      },
    });

    res.json({
      success: true,
      data: updatedSession,
    });
  })
);

// Delete session
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const session = await prisma.collaborationSession.findUnique({
      where: { id },
    });

    if (!session) {
      throw Errors.notFound('Session');
    }

    if (session.ownerId !== authReq.userId) {
      throw Errors.forbidden('Only the owner can delete this session');
    }

    await prisma.collaborationSession.delete({
      where: { id },
    });

    res.json({
      success: true,
      data: { message: 'Session deleted successfully' },
    });
  })
);

// Invite member
router.post(
  '/:id/members',
  validateBody(inviteMemberSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { email, role } = req.body;

    const session = await prisma.collaborationSession.findUnique({
      where: { id },
    });

    if (!session) {
      throw Errors.notFound('Session');
    }

    if (session.ownerId !== authReq.userId) {
      throw Errors.forbidden('Only the owner can invite members');
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    // Check if already a member
    const existingMember = await prisma.sessionMember.findUnique({
      where: {
        userId_sessionId: {
          userId: user.id,
          sessionId: id,
        },
      },
    });

    if (existingMember) {
      throw Errors.conflict('User is already a member');
    }

    const member = await prisma.sessionMember.create({
      data: {
        userId: user.id,
        sessionId: id,
        role: role || 'VIEWER',
      },
      include: { user: true },
    });

    res.status(201).json({
      success: true,
      data: {
        id: member.id,
        userId: member.userId,
        role: member.role,
        user: {
          id: member.user.id,
          email: member.user.email,
          name: member.user.name,
          avatar: member.user.avatar,
          color: member.user.color,
        },
      },
    });
  })
);

// Update member role
router.patch(
  '/:id/members/:memberId',
  validateParams(memberParamsSchema),
  validateBody(updateMemberSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id, memberId } = req.params;
    const { role } = req.body;

    const session = await prisma.collaborationSession.findUnique({
      where: { id },
    });

    if (!session || session.ownerId !== authReq.userId) {
      throw Errors.forbidden('Only the owner can update member roles');
    }

    const member = await prisma.sessionMember.update({
      where: { id: memberId },
      data: { role },
      include: { user: true },
    });

    res.json({
      success: true,
      data: member,
    });
  })
);

// Remove member
router.delete(
  '/:id/members/:memberId',
  validateParams(memberParamsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id, memberId } = req.params;

    const session = await prisma.collaborationSession.findUnique({
      where: { id },
    });

    if (!session || session.ownerId !== authReq.userId) {
      throw Errors.forbidden('Only the owner can remove members');
    }

    await prisma.sessionMember.delete({
      where: { id: memberId },
    });

    res.json({
      success: true,
      data: { message: 'Member removed successfully' },
    });
  })
);

// Get edit history
router.get(
  '/:id/history',
  validateQuery(paginationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { page, pageSize } = req.query as { page: number; pageSize: number };

    // Verify access
    const member = await prisma.sessionMember.findUnique({
      where: {
        userId_sessionId: {
          userId: authReq.userId,
          sessionId: id,
        },
      },
    });

    const session = await prisma.collaborationSession.findUnique({
      where: { id },
    });

    if (!member && session?.ownerId !== authReq.userId) {
      throw Errors.forbidden('You do not have access to this session');
    }

    const skip = (page - 1) * pageSize;

    const [history, total] = await Promise.all([
      prisma.editHistory.findMany({
        where: { sessionId: id },
        include: { user: true },
        orderBy: { timestamp: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.editHistory.count({ where: { sessionId: id } }),
    ]);

    res.json({
      success: true,
      data: history,
      meta: {
        page,
        pageSize,
        total,
        hasMore: skip + history.length < total,
      },
    });
  })
);

// Create snapshot
router.post(
  '/:id/snapshots',
  validateBody(createSnapshotSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { name } = req.body;

    // Verify access (owner or editor)
    const member = await prisma.sessionMember.findUnique({
      where: {
        userId_sessionId: {
          userId: authReq.userId,
          sessionId: id,
        },
      },
    });

    const session = await prisma.collaborationSession.findUnique({
      where: { id },
    });

    if (!session) {
      throw Errors.notFound('Session');
    }

    const isOwner = session.ownerId === authReq.userId;
    const isEditor = member?.role === 'EDITOR' || member?.role === 'OWNER';

    if (!isOwner && !isEditor) {
      throw Errors.forbidden('You do not have permission to create snapshots');
    }

    const snapshot = await prisma.sessionSnapshot.create({
      data: {
        sessionId: id,
        name: name || `Snapshot ${new Date().toISOString()}`,
        content: session.content,
      },
    });

    res.status(201).json({
      success: true,
      data: snapshot,
    });
  })
);

// Restore snapshot
router.post(
  '/:id/snapshots/:snapshotId/restore',
  validateParams(snapshotParamsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { id, snapshotId } = req.params;

    // Verify ownership
    const session = await prisma.collaborationSession.findUnique({
      where: { id },
    });

    if (!session || session.ownerId !== authReq.userId) {
      throw Errors.forbidden('Only the owner can restore snapshots');
    }

    const snapshot = await prisma.sessionSnapshot.findUnique({
      where: { id: snapshotId },
    });

    if (!snapshot || snapshot.sessionId !== id) {
      throw Errors.notFound('Snapshot');
    }

    // Update session content
    await prisma.collaborationSession.update({
      where: { id },
      data: { content: snapshot.content },
    });

    // Record in history
    await prisma.editHistory.create({
      data: {
        sessionId: id,
        userId: authReq.userId,
        operation: JSON.stringify({
          type: 'restore_snapshot',
          snapshotId,
          timestamp: Date.now(),
        }),
        contentAfter: snapshot.content.slice(0, 10000),
      },
    });

    res.json({
      success: true,
      data: { message: 'Snapshot restored successfully', content: snapshot.content },
    });
  })
);

export { router as sessionRouter };
