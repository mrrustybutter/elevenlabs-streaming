#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ElevenLabsStreamingClient } from '@elevenlabs-streaming/client';

// Configuration from environment variables
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'Au8OOcCmvsCaQpmULvvQ';
const DEFAULT_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2';
const DEFAULT_OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_64';
const DEFAULT_STABILITY = parseFloat(process.env.ELEVENLABS_STABILITY || '0.5');
const DEFAULT_SIMILARITY_BOOST = parseFloat(process.env.ELEVENLABS_SIMILARITY_BOOST || '0.75');
const DEFAULT_STYLE = parseFloat(process.env.ELEVENLABS_STYLE || '0.1');

interface TextToSpeechParams {
  text: string;
  voice_id?: string;
  model_id?: string;
  output_format?: string;
  play_audio?: boolean;
}

class ElevenLabsStreamingMCPServer {
  private server: Server;
  private client: ElevenLabsStreamingClient;

  constructor() {
    if (!ELEVENLABS_API_KEY) {
      console.error('ERROR: ELEVENLABS_API_KEY environment variable not set!');
      console.error('Please set it in your environment or MCP configuration.');
      process.exit(1);
    }

    // Initialize the streaming client
    this.client = new ElevenLabsStreamingClient({
      apiKey: ELEVENLABS_API_KEY,
      defaultVoiceId: DEFAULT_VOICE_ID,
      defaultModelId: DEFAULT_MODEL_ID,
      defaultOutputFormat: DEFAULT_OUTPUT_FORMAT,
      voiceSettings: {
        stability: DEFAULT_STABILITY,
        similarityBoost: DEFAULT_SIMILARITY_BOOST,
        style: DEFAULT_STYLE,
      },
    });

    this.server = new Server(
      {
        name: 'elevenlabs-streaming-mcp',
        version: '1.2.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_audio',
          description: 'Generate and stream audio from text using ElevenLabs',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to convert to speech',
              },
              voice_id: {
                type: 'string',
                description: `Voice ID to use (default: ${DEFAULT_VOICE_ID})`,
              },
              model_id: {
                type: 'string',
                description: `Model ID to use (default: ${DEFAULT_MODEL_ID})`,
              },
              output_format: {
                type: 'string',
                description: `Output format (default: ${DEFAULT_OUTPUT_FORMAT}). Options: mp3_22050_32, mp3_44100_32, mp3_44100_64, mp3_44100_96, mp3_44100_128, mp3_44100_192`,
              },
              play_audio: {
                type: 'boolean',
                description: 'Whether to play the audio (default: true)',
              },
            },
            required: ['text'],
          },
        },
        {
          name: 'list_voices',
          description: 'List available ElevenLabs voices',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'generate_audio':
          return await this.generateAudio(
            request.params.arguments as unknown as TextToSpeechParams
          );
        case 'list_voices':
          return await this.listVoices();
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  private async generateAudio(params: TextToSpeechParams) {
    const {
      text,
      voice_id = DEFAULT_VOICE_ID,
      model_id = DEFAULT_MODEL_ID,
      output_format = DEFAULT_OUTPUT_FORMAT,
      play_audio = true,
    } = params;

    try {
      // Check text length and warn if it's very long
      if (text.length > 5000) {
        console.error(`[ElevenLabs MCP] WARNING: Text is ${text.length} characters long. This may take a while...`);
      }

      console.error(`[ElevenLabs MCP] Generating audio for: "${text.substring(0, 50)}..."`);

      // Use the client to generate audio with streaming
      const audioBuffer = await this.client.generateAudio({
        text,
        voiceId: voice_id,
        modelId: model_id,
        outputFormat: output_format,
        playAudio: play_audio,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Audio generated and ${play_audio ? 'streamed' : 'buffered'} successfully! (${audioBuffer.length} bytes)`,
          },
        ],
      };
    } catch (error) {
      console.error('[ElevenLabs MCP] Error generating audio:', error);
      throw new Error(`Audio generation failed: ${error}`);
    }
  }

  private async listVoices() {
    try {
      const voices = await this.client.listVoices();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(voices, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to list voices: ${error}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[ElevenLabs MCP] Streaming Server v1.2.0 running...');
    console.error(`[ElevenLabs MCP] Voice ID: ${DEFAULT_VOICE_ID}`);
    console.error(`[ElevenLabs MCP] Model ID: ${DEFAULT_MODEL_ID}`);
    console.error(`[ElevenLabs MCP] Output Format: ${DEFAULT_OUTPUT_FORMAT}`);
    console.error('[ElevenLabs MCP] Using buffered audio playback for smooth streaming!');
  }
}

const server = new ElevenLabsStreamingMCPServer();
server.run().catch(console.error);
