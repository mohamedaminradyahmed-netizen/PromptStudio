import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../lib/prisma.js';
import { config } from '../../config/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler, Errors, ErrorCodes } from '../middleware/errorHandler.js';
import { validateBody } from '../validation/middleware.js';
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  type RegisterInput,
  type LoginInput,
  type UpdateProfileInput,
} from '../validation/schemas.js';

const router = Router();

// Generate random color for user
function generateColor(): string {
  const colors = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Register
router.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, name } = req.body as RegisterInput;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw Errors.conflict('User with this email already exists');
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        color: generateColor(),
      },
    });

    // Generate token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        color: user.color,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          color: user.color,
        },
        token,
        expiresAt,
      },
    });
  })
);

// Login
router.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body as LoginInput;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    // Generate token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        color: user.color,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          color: user.color,
        },
        token,
        expiresAt,
      },
    });
  })
);

// Get current user
router.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;

    const user = await prisma.user.findUnique({
      where: { id: authReq.userId },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        color: user.color,
      },
    });
  })
);

// Update profile
router.patch(
  '/me',
  authMiddleware,
  validateBody(updateProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { name, avatar, color } = req.body as UpdateProfileInput;

    const user = await prisma.user.update({
      where: { id: authReq.userId },
      data: {
        name: name || undefined,
        avatar: avatar || undefined,
        color: color || undefined,
      },
    });

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        color: user.color,
      },
    });
  })
);

// Guest login (for quick access)
router.post(
  '/guest',
  asyncHandler(async (req: Request, res: Response) => {
    const guestId = uuidv4();
    const guestName = `Guest_${guestId.slice(0, 6)}`;

    // Create guest user
    const user = await prisma.user.create({
      data: {
        email: `${guestId}@guest.promptstudio`,
        name: guestName,
        color: generateColor(),
      },
    });

    // Generate token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        color: user.color,
      },
      config.jwt.secret,
      { expiresIn: '24h' } // Shorter expiry for guests
    );

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          color: user.color,
        },
        token,
        expiresAt,
        isGuest: true,
      },
    });
  })
);

export { router as authRouter };
