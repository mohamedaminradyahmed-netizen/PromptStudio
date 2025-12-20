/**
 * Python Bridge Manager
 *
 * Manages the connection between Node.js and Python backends.
 * Handles service registration, LLM request routing, and response handling.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// Types for Python service capabilities
export interface PythonService {
  socketId: string;
  serviceName: string;
  capabilities: string[];
  connectedAt: Date;
  lastHeartbeat: Date;
}

// LLM Request types
export interface LLMRequest {
  request_id: string;
  type: 'generate' | 'stream' | 'analyze_prompt' | 'refine_prompt' | 'translate' | 'safety_check' | 'predict_cost';
  messages?: Array<{ role: string; content: string }>;
  prompt?: string;
  model?: string;
  provider?: 'openai' | 'anthropic' | 'google';
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  // Type-specific fields
  context?: string;
  goals?: string[];
  text?: string;
  source_language?: string;
  target_language?: string;
  expected_output_length?: string;
}

export interface LLMResponse {
  request_id: string;
  success: boolean;
  result?: {
    content?: string;
    model?: string;
    provider?: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    finish_reason?: string;
    latency_ms?: number;
    [key: string]: unknown;
  };
  error?: string;
}

export interface LLMStreamChunk {
  request_id: string;
  chunk: string;
  done: boolean;
  error?: string;
}

// Command request types
export interface CommandRequest {
  request_id: string;
  command: string;
  parameters?: Record<string, unknown>;
  model?: string;
  temperature?: number;
  stream?: boolean;
}

export interface CommandResponse {
  request_id: string;
  success: boolean;
  result?: {
    command_name: string;
    output?: string;
    structured_output?: unknown;
    usage?: Record<string, number>;
    latency_ms?: number;
    error?: string;
  };
  error?: string;
}

/**
 * PythonBridgeManager class
 *
 * Manages connections to Python backend services and routes
 * LLM requests through the WebSocket bridge.
 */
export class PythonBridgeManager extends EventEmitter {
  private io: SocketIOServer | null = null;
  private services: Map<string, PythonService> = new Map();
  private pendingRequests: Map<string, {
    resolve: (value: LLMResponse | CommandResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    streamCallback?: (chunk: LLMStreamChunk) => void;
  }> = new Map();

  private readonly REQUEST_TIMEOUT = 60000; // 60 seconds
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly HEARTBEAT_TIMEOUT = 60000; // 60 seconds
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  /**
   * Initialize the bridge with Socket.IO server
   */
  initialize(io: SocketIOServer): void {
    this.io = io;
    this.setupEventHandlers();
    this.startHeartbeatMonitor();
    console.log('🐍 Python Bridge Manager initialized');
  }

  /**
   * Setup Socket.IO event handlers for Python services
   */
  private setupEventHandlers(): void {
    if (!this.io) return;

    // Create a namespace for Python services (or use default)
    this.io.on('connection', (socket: Socket) => {
      // Handle service registration
      socket.on('register_service', (data: { service: string; capabilities: string[] }) => {
        this.handleServiceRegistration(socket, data);
      });

      // Handle LLM responses from Python
      socket.on('llm_response', (response: LLMResponse) => {
        this.handleLLMResponse(response);
      });

      // Handle streaming chunks from Python
      socket.on('llm_stream', (chunk: LLMStreamChunk) => {
        this.handleStreamChunk(chunk);
      });

      // Handle command responses from Python
      socket.on('command_response', (response: CommandResponse) => {
        this.handleCommandResponse(response);
      });

      // Handle service ready notification
      socket.on('service_ready', (data: { service: string }) => {
        console.log(`🐍 Python service ready: ${data.service}`);
        this.emit('service_ready', data.service);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleServiceDisconnection(socket.id);
      });
    });
  }

  /**
   * Handle Python service registration
   */
  private handleServiceRegistration(
    socket: Socket,
    data: { service: string; capabilities: string[] }
  ): void {
    const service: PythonService = {
      socketId: socket.id,
      serviceName: data.service,
      capabilities: data.capabilities,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    };

    this.services.set(socket.id, service);

    console.log(`🐍 Python service registered: ${data.service}`);
    console.log(`   Capabilities: ${data.capabilities.join(', ')}`);

    this.emit('service_registered', service);

    // Send acknowledgment
    socket.emit('registration_ack', {
      success: true,
      message: 'Service registered successfully',
    });
  }

  /**
   * Handle Python service disconnection
   */
  private handleServiceDisconnection(socketId: string): void {
    const service = this.services.get(socketId);
    if (service) {
      console.log(`🐍 Python service disconnected: ${service.serviceName}`);
      this.services.delete(socketId);
      this.emit('service_disconnected', service);
    }
  }

  /**
   * Handle LLM response from Python
   */
  private handleLLMResponse(response: LLMResponse): void {
    const pending = this.pendingRequests.get(response.request_id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.request_id);
      pending.resolve(response);
    }
  }

  /**
   * Handle streaming chunk from Python
   */
  private handleStreamChunk(chunk: LLMStreamChunk): void {
    const pending = this.pendingRequests.get(chunk.request_id);
    if (pending && pending.streamCallback) {
      pending.streamCallback(chunk);

      // If done or error, clean up
      if (chunk.done) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(chunk.request_id);
        pending.resolve({
          request_id: chunk.request_id,
          success: !chunk.error,
          error: chunk.error,
        });
      }
    }
  }

  /**
   * Handle command response from Python
   */
  private handleCommandResponse(response: CommandResponse): void {
    const pending = this.pendingRequests.get(response.request_id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.request_id);
      pending.resolve(response);
    }
  }

  /**
   * Start heartbeat monitoring for connected services
   */
  private startHeartbeatMonitor(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [socketId, service] of this.services) {
        const lastHeartbeat = service.lastHeartbeat.getTime();
        if (now - lastHeartbeat > this.HEARTBEAT_TIMEOUT) {
          console.log(`🐍 Python service timed out: ${service.serviceName}`);
          this.services.delete(socketId);
          this.emit('service_timeout', service);
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Check if a Python service is available
   */
  isServiceAvailable(capability?: string): boolean {
    if (this.services.size === 0) return false;

    if (capability) {
      for (const service of this.services.values()) {
        if (service.capabilities.includes(capability)) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  /**
   * Get available services
   */
  getAvailableServices(): PythonService[] {
    return Array.from(this.services.values());
  }

  /**
   * Get a service socket by capability
   */
  private getServiceSocket(capability?: string): Socket | null {
    if (!this.io) return null;

    for (const [socketId, service] of this.services) {
      if (!capability || service.capabilities.includes(capability)) {
        return this.io.sockets.sockets.get(socketId) || null;
      }
    }

    return null;
  }

  /**
   * Send LLM request to Python backend
   */
  async sendLLMRequest(
    request: Omit<LLMRequest, 'request_id'>,
    streamCallback?: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse> {
    const requestId = uuidv4();
    const fullRequest: LLMRequest = {
      ...request,
      request_id: requestId,
    };

    const socket = this.getServiceSocket(request.type);
    if (!socket) {
      return {
        request_id: requestId,
        success: false,
        error: 'No Python service available for this request type',
      };
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, this.REQUEST_TIMEOUT);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: LLMResponse | CommandResponse) => void,
        reject,
        timeout,
        streamCallback,
      });

      socket.emit('llm_request', fullRequest);
    });
  }

  /**
   * Send command execution request to Python backend
   */
  async sendCommandRequest(
    request: Omit<CommandRequest, 'request_id'>
  ): Promise<CommandResponse> {
    const requestId = uuidv4();
    const fullRequest: CommandRequest = {
      ...request,
      request_id: requestId,
    };

    const socket = this.getServiceSocket('execute_command');
    if (!socket) {
      return {
        request_id: requestId,
        success: false,
        error: 'No Python service available for command execution',
      };
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Command request timeout'));
      }, this.REQUEST_TIMEOUT);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: LLMResponse | CommandResponse) => void,
        reject,
        timeout,
      });

      socket.emit('command_request', fullRequest);
    });
  }

  /**
   * Generate text using Python LLM service
   */
  async generate(params: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    provider?: 'openai' | 'anthropic' | 'google';
    temperature?: number;
    max_tokens?: number;
  }): Promise<LLMResponse> {
    return this.sendLLMRequest({
      type: 'generate',
      ...params,
    });
  }

  /**
   * Stream text generation using Python LLM service
   */
  async stream(
    params: {
      messages: Array<{ role: string; content: string }>;
      model?: string;
      provider?: 'openai' | 'anthropic' | 'google';
      temperature?: number;
      max_tokens?: number;
    },
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse> {
    return this.sendLLMRequest(
      {
        type: 'stream',
        stream: true,
        ...params,
      },
      onChunk
    );
  }

  /**
   * Analyze prompt using Python Instructor service
   */
  async analyzePrompt(params: {
    prompt: string;
    context?: string;
  }): Promise<LLMResponse> {
    return this.sendLLMRequest({
      type: 'analyze_prompt',
      ...params,
    });
  }

  /**
   * Refine prompt using Python Instructor service
   */
  async refinePrompt(params: {
    prompt: string;
    goals?: string[];
  }): Promise<LLMResponse> {
    return this.sendLLMRequest({
      type: 'refine_prompt',
      ...params,
    });
  }

  /**
   * Translate text using Python Instructor service
   */
  async translate(params: {
    text: string;
    source_language: string;
    target_language: string;
  }): Promise<LLMResponse> {
    return this.sendLLMRequest({
      type: 'translate',
      ...params,
    });
  }

  /**
   * Check safety using Python Instructor service
   */
  async checkSafety(params: { prompt: string }): Promise<LLMResponse> {
    return this.sendLLMRequest({
      type: 'safety_check',
      ...params,
    });
  }

  /**
   * Predict cost using Python Instructor service
   */
  async predictCost(params: {
    prompt: string;
    expected_output_length?: string;
    model?: string;
  }): Promise<LLMResponse> {
    return this.sendLLMRequest({
      type: 'predict_cost',
      ...params,
    });
  }

  /**
   * Execute a command using Python command service
   */
  async executeCommand(params: {
    command: string;
    parameters?: Record<string, unknown>;
    model?: string;
    temperature?: number;
    stream?: boolean;
  }): Promise<CommandResponse> {
    return this.sendCommandRequest(params);
  }

  /**
   * List available commands from Python
   */
  async listCommands(): Promise<CommandResponse> {
    return this.sendCommandRequest({ command: 'list' });
  }

  /**
   * Search commands in Python
   */
  async searchCommands(query: string): Promise<CommandResponse> {
    return this.sendCommandRequest({
      command: 'search',
      parameters: { query },
    });
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Reject all pending requests
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Bridge shutting down'));
    }
    this.pendingRequests.clear();
    this.services.clear();

    console.log('🐍 Python Bridge Manager shutdown complete');
  }
}

// Singleton instance
export const pythonBridge = new PythonBridgeManager();
